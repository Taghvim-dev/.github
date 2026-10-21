#!/usr/bin/env node
// Coordinated public product verification; no secrets or private repository access.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const candidate=JSON.parse(readFileSync(new URL("../release/PUBLIC-RELEASE-MATRIX.json",import.meta.url)));
const isLive=process.argv.includes("--live");
// Prevent split-brain release reports: canonical and latest_checked must describe
// the same Engine/Landing source revisions, test receipts, and audit date.
const src=candidate.source_verification || {},checked=src.latest_checked || {};
for(const [canonical,latest] of [
  ["date","date"],["engine_main_merge_sha","engine_sha"],["engine_offline_ci_run","engine_ci"],
  ["landing_main_merge_sha","landing_sha"],["landing_integration_ci_run","landing_ci"],
  ["landing_integration_merge_sha","landing_sha"]
]) {
  assert.ok(checked[latest], "Missing current source proof: "+latest);
  assert.equal(src[canonical],checked[latest],"RELEASE_MATRIX_SPLIT_BRAIN: "+canonical+" differs from latest_checked."+latest);
}
const fail=(msg)=>{throw new Error(msg)};
const indexes=[];
for(const {name,commit} of candidate.repositories){
  const actual=execFileSync("git",["-C",name,"rev-parse","HEAD"],{encoding:"utf8"}).trim();
  assert.equal(actual,commit,name+" repository SHA drift; regenerate a reviewed release matrix");
  const index=JSON.parse(readFileSync(new URL("../"+name+"/contracts/operation-index.json",import.meta.url)));
  assert.equal(index.contractVersion,candidate.contract_version);
  assert.equal(index.openApiGitBlobSHA,candidate.openapi_source_git_blob_sha);
  indexes.push(index);
}
const ref=JSON.stringify(indexes[0]);
for(const [i,index] of indexes.entries()) assert.equal(JSON.stringify(index),ref,candidate.repositories[i].name+" public contract drift");
assert.equal(indexes[0].operations.length,candidate.required_public_operation_count);
const ops=new Set();
for(const op of indexes[0].operations){
  assert.ok(["GET","POST","PUT","PATCH","DELETE"].includes(op.method));
  assert.match(op.path,/^\//);
  assert.ok(!op.auth.includes("OperatorToken"));
  const id=op.method+" "+op.path;
  assert.ok(!ops.has(id),"Duplicate public operation "+id);
  ops.add(id);
}
console.log("PUBLIC-CONTRACT-PARITY PASS: "+candidate.contract_version+", "+ops.size+" operations, 3 SHA-pinned repositories");
if(isLive){
  const endpoints=["https://taghvim.dev/","https://taghvim.dev/api/health","https://api.taghvim.dev/v1/health","https://api.taghvim.dev/v1/readiness","https://api.taghvim.dev/openapi.json","https://taghvim.dev/openapi.json"];
  const got=await Promise.all(endpoints.map(async u=>{
    const res=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:"follow"});
    if(res.status!==200)fail("DEPLOYMENT_UNAVAILABLE "+new URL(u).pathname+": HTTP "+res.status);
    return res;
  }));
  const api=await got[4].json(),landing=await got[5].json();
  assert.equal(api.info.version,candidate.contract_version,"DEPLOYED_API_VERSION_DRIFT");
  assert.equal(landing.info.version,candidate.contract_version,"DEPLOYED_LANDING_VERSION_DRIFT");
  const normalize=o=>JSON.stringify(o,Object.keys(o).sort());
  // Stable structural comparison for independently deployed public JSON contracts.
  const stable=(obj)=>Array.isArray(obj)?obj.map(stable):obj&&typeof obj==="object"?Object.fromEntries(Object.keys(obj).sort().map(k=>[k,stable(obj[k])])):obj;
  assert.deepEqual(stable(api),stable(landing),"DEPLOYED_API_LANDING_CONTRACT_DRIFT");
  for(const op of indexes[0].operations)
    assert.ok(api.paths?.[op.path]?.[op.method.toLowerCase()]?.operationId===op.operationId,"DEPLOYED_OPERATION_DRIFT "+op.method+" "+op.path);
  if(!candidate.general_availability_approved) console.warn("Live public contract parity passed; GA remains blocked by onboarding, isolation and commercial gates");
  console.log("DEPLOYED-PUBLIC-API-PARITY PASS");
}
