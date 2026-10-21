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
const D1_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function canonicalD1Id(config,component) {
  const worker=component==="engine"?"taghvim-api":component==="landing"?"taghvim-web":null;
  const database=component==="engine"?"taghvim-engine":component==="landing"?"taghvim-web":null;
  if(!worker||config.match(/^name\s*=\s*"([^"]+)"/m)?.[1]!==worker)return null;
  const matches=[...config.matchAll(/^\[\[d1_databases\]\]([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)]
    .filter(x=>x[1].match(/^\s*database_name\s*=\s*"([^"]+)"/m)?.[1]===database)
    .map(x=>x[1].match(/^\s*database_id\s*=\s*"([^"]+)"/m)?.[1]);
  return matches.length===1&&D1_UUID.test(matches[0]||"")?matches[0]:null;
}
export function receipt({repo,issue,component,sha,run,attempt,status,checkpoint=null,migrations=null,sandbox=null,sandboxStatus="unknown",recovery=null,expectedD1Id=null}) {
  if(!/^[0-9a-f]{40}$/.test(sha)||!/^\d+$/.test(run)||!/^\d+$/.test(attempt))
    throw Error("Missing immutable workflow identity");
  const expectedIssue=component==="engine"?9:component==="landing"?13:null;
  if(repo!=="Taghvim-dev/"+component || issue!==expectedIssue)
    throw Error("Issue/owner/component mismatch");
  if(!["success","failure","cancelled","skipped"].includes(status))throw Error("Invalid job result");
  if(!["success","failure","cancelled","skipped","unknown"].includes(sandboxStatus))throw Error("Invalid sandbox result");
  const ck=checkpoint?.record;
  const identityOK=!!ck && ck.workflow_run===run && (ck.engine_sha||ck.landing_sha)===sha &&
    ck.component===component && Array.isArray(ck.checkpoints);
  const applied=migrations?.record;
  const appliedOK=!!applied && applied.kind==="d1_applied_ledger" &&
    applied.status==="VERIFIED" && applied.workflow_run===run && applied.release_sha===sha &&
    applied.database===(component==="engine"?"taghvim-engine":"taghvim-web");
  const sr=sandbox?.record;
  const expectedChecks=component==="engine"
    ? {health:true,readiness:true,openapi:true,d1_ledger:true,synthetic_onboarding:true,tenant_isolation:true,key_replay_blocked:true,key_revocation:true,calendar_request:true}
    : {health:true,readiness:true,openapi:true,d1_ledger:true,synthetic_form:true,mail_suppressed:true};
  const sandboxOK=!!sr && sr.schema_version===1 &&
    sr.kind==="taghvim_"+component+"_sandbox_promotion" &&
    sr.environment==="sandbox" && sr.source_sha===sha && sr.workflow_run===run &&
    sr.api_version==="2.1.0" && sr.production_approved===false &&
    /^[0-9a-f]{64}$/.test(sr.contract_sha256||"") &&
    Array.isArray(sr.migrations) && sr.migrations.length>0 &&
    Object.entries(expectedChecks).every(([key,value])=>sr.checks?.[key]===value) &&
    Object.keys(sr.checks||{}).length===Object.keys(expectedChecks).length;
  const rr=recovery?.record;
  const recoveryOK=!!rr && rr.schema_version===1 &&
    rr.kind==="d1_pre_migration_recovery" && rr.status==="VERIFIED" &&
    rr.component===component && rr.source_sha===sha && rr.workflow_run===run &&
    rr.database===(component==="engine"?"taghvim-engine":"taghvim-web") &&
    D1_UUID.test(expectedD1Id||"") && rr.database_id===expectedD1Id &&
    rr.automatic_restore_allowed===false && rr.restore_mode==="MANUAL_ONLY_DESTRUCTIVE" &&
    /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/i.test(rr.bookmark||"") &&
    Number.isFinite(Date.parse(rr.captured_at||""));
  const marker="taghvim-release:"+component+":"+run+":"+attempt;
  const body=[
    "<!-- "+marker+" -->",
    "### Durable protected release attempt",
    "- Component: \`"+component+"\`",
    "- Workflow run: \`"+run+"\` / attempt \`"+attempt+"\`",
    "- Immutable source SHA: \`"+sha+"\`",
    "- Production job result: **"+status.toUpperCase()+"**",
    "- Sandbox job result: **"+sandboxStatus.toUpperCase()+"**",
    "- Sandbox promotion receipt: **"+(sandboxOK?"VERIFIED":"MISSING_OR_INVALID")+"**; artifact SHA-256: \`"+(sandbox?.sha256||"MISSING")+"\`",
    "- Checkpoint: **"+(identityOK?ck.phase:"UNVERIFIED")+"**; artifact SHA-256: \`"+(checkpoint?.sha256||"MISSING")+"\`",
    "- Remote D1 applied-ledger: **"+(appliedOK?"VERIFIED":"MISSING_OR_INVALID")+"**; evidence SHA-256: \`"+(migrations?.sha256||"MISSING")+"\`",
    "- Canonical physical production D1: `"+(recoveryOK?rr.database_id:"NOT_VERIFIED")+"`",
    "- D1 pre-migration recovery: **"+(recoveryOK?"VERIFIED":"MISSING_OR_INVALID")+"**; artifact SHA-256: \`"+(recovery?.sha256||"MISSING")+"\`",
    "- Manual-only recovery bookmark: \`"+(recoveryOK?rr.bookmark:"MISSING")+"\` (private Issue; expires under the account Time Travel window)",
    "- Production GA: **NOT CERTIFIED** — live E2E, tenant isolation, billing, restore and approval remain independent requirements.",
    "- Source workflow: https://github.com/"+repo+"/actions/runs/"+run,
    "",
  ].join("\n");
  return {marker,body,checkpointOK:identityOK,migrationsOK:appliedOK,sandboxOK,recoveryOK};
}

async function main() {
  const [component,status]=process.argv.slice(2);
  const repo=process.env.GITHUB_REPOSITORY||"",sha=process.env.GITHUB_SHA||"",
    run=process.env.GITHUB_RUN_ID||"",attempt=process.env.GITHUB_RUN_ATTEMPT||"1";
  const issue=component==="engine"?9:13;
  const built=receipt({repo,issue,component,sha,run,attempt,status,
    checkpoint:read("release-evidence.json"),migrations:read("release-d1-applied-evidence.json"),
    sandbox:read("sandbox-promotion-receipt.json"),sandboxStatus:process.env.SANDBOX_RESULT||"unknown",
    recovery:read("release-d1-recovery-bookmark.json"),
    expectedD1Id:existsSync("wrangler.toml")?canonicalD1Id(readFileSync("wrangler.toml","utf8"),component):null});
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
    "checkpoint",built.checkpointOK,"migration_receipt",built.migrationsOK,"sandbox",built.sandboxOK,"recovery",built.recoveryOK);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error("::error::DURABLE_RELEASE_REGISTRY_FAILED: "+e.message);process.exitCode=1});
}
