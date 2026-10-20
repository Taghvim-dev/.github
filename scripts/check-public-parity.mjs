import {readFileSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
const root=new URL("../",import.meta.url);
const targets=[".", "SDK","CLI","cookbooks"];
const snapshots={};
let canonical;
for(const name of targets){
  const path=name==="."?"contracts/operation-index.json":name+"/contracts/operation-index.json";
  const bytes=readFileSync(new URL(path,root));
  const manifest=JSON.parse(bytes);
  assert.equal(manifest.schemaVersion,1);
  assert.match(manifest.openApiGitBlobSHA,/^[a-f0-9]{40}$/);
  assert.ok(manifest.operations.length>35);
  assert.ok(manifest.operations.every(o=>!o.auth.includes("OperatorToken")&&!o.path.startsWith("/v1/admin/")));
  if(!canonical)canonical=manifest;
  else assert.deepEqual(manifest,canonical, "Public operation contract drift: "+name);
  const gitDir=name==="."?".":name;
  const sha=execFileSync("git",["-C",gitDir,"rev-parse","HEAD"],{encoding:"utf8",cwd:new URL(".",root)}).trim();
  snapshots[name==="."?"registry":name]={commit_sha:sha,contract_sha256:createHash("sha256").update(bytes).digest("hex")};
}
const evidence={schema_version:1,product:"taghvim.dev",contract_version:canonical.contractVersion,openapi_git_blob_sha:canonical.openApiGitBlobSHA,release_status:"candidate",checked_at:new Date().toISOString(),sources:snapshots,policy:"Coordinated release only; no production access asserted"};
if(process.argv.includes("--evidence"))writeFileSync(new URL("../public-release-evidence.json",import.meta.url),JSON.stringify(evidence,null,2)+"\n");
console.log("Cross-repository public API parity verified",JSON.stringify({contract:evidence.contract_version,operations:canonical.operations.length,sources:snapshots}));
