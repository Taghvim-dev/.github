#!/usr/bin/env node
/** Private GitHub Issue journal for manual protected releases.
 * Persists immutable per-run redacted fingerprints beyond expiring Actions artifacts.
 * Never upgrades a release to GA; idempotent on component/run/attempt.
 */
import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const read=(name)=>{
  if(!existsSync(name))return null;
  const bytes=readFileSync(name);
  try{return {record:JSON.parse(bytes.toString("utf8")),sha256:sha256(bytes)}}catch{return {error:"invalid_json",sha256:sha256(bytes)}}
};
export function receipt({repo,issue,component,sha,run,attempt,status,checkpoint=null,migrations=null}) {
  if(!/^[0-9a-f]{40}$/.test(sha)||!/^\d+$/.test(run)||!/^\d+$/.test(attempt))
    throw Error("Missing immutable workflow identity");
  const expectedIssue=component==="engine"?9:component==="landing"?13:null;
  if(repo!=="Taghvim-dev/"+component || issue!==expectedIssue)
    throw Error("Issue/owner/component mismatch");
  if(!["success","failure","cancelled"].includes(status))throw Error("Invalid job result");
  const ck=checkpoint?.record;
  const identityOK=!!ck && ck.workflow_run===run && (ck.engine_sha||ck.landing_sha)===sha &&
    ck.component===component && Array.isArray(ck.checkpoints);
  const applied=migrations?.record;
  const appliedOK=!!applied && applied.kind==="d1_applied_ledger" &&
    applied.status==="VERIFIED" && applied.workflow_run===run && applied.release_sha===sha &&
    applied.database===(component==="engine"?"taghvim-engine":"taghvim-web");
  const marker="taghvim-release:"+component+":"+run+":"+attempt;
  const body=[
    "<!-- "+marker+" -->",
    "### Durable protected release attempt",
    "- Component: \`"+component+"\`",
    "- Workflow run: \`"+run+"\` / attempt \`"+attempt+"\`",
    "- Immutable source SHA: \`"+sha+"\`",
    "- GitHub job result: **"+status.toUpperCase()+"**",
    "- Checkpoint: **"+(identityOK?ck.phase:"UNVERIFIED")+"**; artifact SHA-256: \`"+(checkpoint?.sha256||"MISSING")+"\`",
    "- Remote D1 applied-ledger: **"+(appliedOK?"VERIFIED":"MISSING_OR_INVALID")+"**; evidence SHA-256: \`"+(migrations?.sha256||"MISSING")+"\`",
    "- Production GA: **NOT CERTIFIED** — live E2E, tenant isolation, billing, restore and approval remain independent requirements.",
    "- Source workflow: https://github.com/"+repo+"/actions/runs/"+run,
    "",
  ].join("\n");
  return {marker,body,checkpointOK:identityOK,migrationsOK:appliedOK};
}

async function main() {
  const [component,status]=process.argv.slice(2);
  const repo=process.env.GITHUB_REPOSITORY||"",sha=process.env.GITHUB_SHA||"",
    run=process.env.GITHUB_RUN_ID||"",attempt=process.env.GITHUB_RUN_ATTEMPT||"1";
  const issue=component==="engine"?9:13;
  const built=receipt({repo,issue,component,sha,run,attempt,status,
    checkpoint:read("release-evidence.json"),migrations:read("release-d1-applied-evidence.json")});
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw Error("GITHUB_TOKEN missing: durable registry is mandatory");
  const path="https://api.github.com/repos/"+repo+"/issues/"+issue+"/comments";
  const headers={"authorization":"Bearer "+token,"accept":"application/vnd.github+json","x-github-api-version":"2022-11-28","content-type":"application/json"};
  const request=async(url,init={})=>{
    const res=await fetch(url,{...init,headers,...(init.headers?{headers:{...headers,...init.headers}}:{})});
    if(!res.ok)throw Error("GitHub Issue Registry HTTP "+res.status);
    return res.json();
  };
  for(let page=1;page<=20;page++){
    const comments=await request(path+"?per_page=100&page="+page);
    if(!Array.isArray(comments))throw Error("Unexpected registry response");
    if(comments.some(c=>c.body?.includes("<!-- "+built.marker+" -->"))){
      console.log("DURABLE_RELEASE_REGISTRY_ALREADY_RECORDED",built.marker);
      return;
    }
    if(comments.length<100)break;
    if(page===20)throw Error("Issue registry pagination limit: refuse duplicate append");
  }
  await request(path,{method:"POST",body:JSON.stringify({body:built.body})});
  console.log("DURABLE_RELEASE_REGISTRY_WRITTEN",built.marker,
    "checkpoint",built.checkpointOK,"migration_receipt",built.migrationsOK);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error("::error::DURABLE_RELEASE_REGISTRY_FAILED: "+e.message);process.exitCode=1});
}
