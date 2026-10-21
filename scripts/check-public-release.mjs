#!/usr/bin/env node
// Coordinated public product verification; no secrets or private repository access.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const candidate=JSON.parse(readFileSync(new URL("../release/PUBLIC-RELEASE-MATRIX.json",import.meta.url)));
const isLive=process.argv.includes("--live");
// T=0 source-to-CI reachability: a ledger update must execute this exact gate
// on both pull requests and main-branch pushes, never silently skip validation.
const releaseWorkflow=readFileSync(new URL("../.github/workflows/coordinated-public-release.yml",import.meta.url),"utf8");
const t0Triggers=[...releaseWorkflow.matchAll(/^\s+- ["']release\/T0-CONTROL-MATRIX\.json["']\s*$/gm)];
assert.equal(t0Triggers.length,2,"T0 control ledger must trigger both PR and main release validation");
// Constitutional T=0 release ledger: every requirement must have source, test,
// verified commit identity and independently demonstrated live admission proof.
const t0=JSON.parse(readFileSync(new URL("../release/T0-CONTROL-MATRIX.json",import.meta.url)));
assert.equal(t0.schema_version,1,"T0 control ledger schema drift");
assert.equal(t0.contract_version,candidate.contract_version,"T0 contract version drift");
assert.equal(t0.general_availability_approved,candidate.general_availability_approved,"T0 GA split-brain");
assert.equal(t0.current_source.engine_main_sha,candidate.source_verification.latest_checked.engine_sha,"T0 Engine source identity drift");
assert.equal(t0.current_source.landing_main_sha,candidate.source_verification.latest_checked.landing_sha,"T0 Landing source identity drift");
assert.equal(t0.current_source.shared_policy_sha,candidate.source_verification.t0_infrastructure_source?.shared_action_sha,"T0 Cloudflare guard pin drift");
// Historical CI failures are immutable observations, not evidence of a
// currently broken main or proof of a fixed production runtime. Force a
// reviewer-tested PR SHA and its squash-merge main SHA to be distinct fields.
const incidents=JSON.parse(readFileSync(new URL("../release/CI-INCIDENT-ROOT-CAUSES.json",import.meta.url)));
assert.equal(incidents.schema_version,1,"CI incident ledger schema drift");
assert.equal(incidents.product,candidate.product,"CI incident ledger product drift");
assert.equal(incidents.no_runtime_approval_from_email_or_source_ci,true,"Email/CI evidence cannot approve production");
assert.equal(incidents.no_rewrite_of_historical_failures,true,"Historical failed run evidence is append-only");
const incidentIds=new Set();
for(const incident of incidents.root_cause_groups||[]){
 assert.match(incident.id||"",/^CI-ROOT-[0-9]{3}$/,"Invalid root-cause incident ID");
 assert.ok(!incidentIds.has(incident.id),"Duplicate root-cause incident "+incident.id);
 incidentIds.add(incident.id);
 assert.ok(Array.isArray(incident.examples)&&incident.examples.length,"Root cause lacks failed-run evidence");
 for(const example of incident.examples){
   assert.match(example.repo||"",/^Taghvim-dev\/[A-Za-z0-9.-]+$/);
   assert.match(example.failed_run||"",/^\d+$/);
 }
 const proof=incident.current_evidence||{};
 assert.match(proof.merged_main_sha||"",/^[0-9a-f]{40}$/);
 assert.match(proof.tested_pr_head_sha||"",/^[0-9a-f]{40}$/);
 assert.match(proof.passing_run||"",/^\d+$/);
 assert.ok(proof.evidence_scope?.includes("PR_HEAD_SOURCE_TEST_ONLY"),"CI incident claims unscoped source proof");
 // Incident receipts describe the *historical fix commit*, not the latest
 // main. Requiring equality creates perpetual red CI whenever a repo evolves,
 // or forces illegal rewriting of append-only incident evidence.
 assert.notEqual(proof.merged_main_sha,proof.tested_pr_head_sha,
   "Historical squash main and independently reviewed PR head must be recorded separately");
 assert.ok(["Taghvim-dev/engine","Taghvim-dev/landing","Taghvim-dev/.github"].includes(proof.repo),
   "Incident proof references an unrelated repository");
 assert.equal(incident.production_attested,false,"CI success is not live production attestation");
}
assert.ok(incidentIds.size>=5,"Incomplete recovered CI root-cause coverage");
const requiredT0=["T0-SOURCE-001","T0-INFRA-002","T0-SECRET-003","T0-PROMOTE-004",
"T0-D1-005","T0-EXEC-006","T0-API-007","T0-ONBOARD-008","T0-RELEASE-009","T0-GA-010","T0-IDENTITY-011"];
assert.deepEqual(t0.controls.map(c=>c.id).sort(),requiredT0.sort(),"T0 capability coverage drift");
// Mirror the current Engine release facts into the central declaration and
// bind their evidence to the exact reviewed main revision and source CI run.
// Historical incident receipts remain unchanged and cannot substitute current CI.
const identity=candidate.source_verification?.engine_package_contract_identity;
const current=candidate.source_verification?.latest_checked;
const identityControl=t0.controls.find(c=>c.id==="T0-IDENTITY-011");
assert.ok(identityControl&&identityControl.state==="SOURCE_VERIFIED","Missing Engine release identity gate");
assert.equal(identity?.status,"SOURCE_TESTED_NOT_LIVE","Engine release identity may not falsely claim Cloudflare production");
assert.equal(identity?.source_main_sha,current?.engine_sha,"Engine package identity references stale commit");
assert.equal(identity?.ci_run,current?.engine_ci,"Engine package identity references stale CI run");
assert.equal(identity?.api_version,candidate.contract_version,"Engine identity API contract drift");
assert.equal(identity?.package_version,candidate.contract_version,"Engine npm version drift");
assert.equal(identity?.lock_root_version,candidate.contract_version,"Engine npm lock root version drift");
assert.equal(identity?.license,"Apache-2.0","Engine package license drift");
assert.equal(identity?.live_engine_release,"NOT_DISPATCHED","Live engine release cannot be source-only attested");
assert.equal(identity?.live_cloudflare_evidence,"MISSING","Cloudflare provenance is unverified");
assert.equal(identityControl.source_ci_run,current?.engine_ci,"T0 source gate CI receipt drift");
for(const control of t0.controls){
 assert.ok(Array.isArray(control.code)&&control.code.length,"T0 missing code link "+control.id);
 assert.ok(Array.isArray(control.test)&&control.test.length,"T0 missing test link "+control.id);
 assert.ok(["SOURCE_VERIFIED","LIVE_UNVERIFIED","LIVE_VERIFIED"].includes(control.state),"T0 unknown evidence state "+control.id);
 if(control.state==="LIVE_VERIFIED")
   assert.match(control.live_evidence?.immutable_receipt_sha||"",/^[a-f0-9]{64}$/,"T0 claimed live proof without immutable receipt "+control.id);
 if(control.requires_live_proof && control.state==="SOURCE_VERIFIED")
   throw Error("T0 live-required control cannot be certified by source tests: "+control.id);
 if(candidate.general_availability_approved && control.requires_live_proof && control.state!=="LIVE_VERIFIED")
   throw Error("T0 GA blocked: missing independent live proof for "+control.id);
}
// Prevent split-brain release reports: canonical and latest_checked must describe
// the same Engine/Landing source revisions, test receipts, and audit date.
const src=candidate.source_verification || {},checked=src.latest_checked || {};
for(const [canonical,latest] of [
  ["date","date"],["engine_main_merge_sha","engine_sha"],["engine_offline_ci_run","engine_ci"],
  ["landing_main_merge_sha","landing_sha"],["landing_integration_ci_run","landing_integration_ci"],
  ["landing_integration_merge_sha","landing_integration_sha"]
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
