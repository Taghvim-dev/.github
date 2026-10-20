#!/usr/bin/env node
// Fail-closed, chain-hashed release checkpoint + optional durable GitHub issue ledger.
// The GitHub issue is a release *observation* ledger, never a GA authorization.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const STAGES = Object.freeze([
  "authorized", "checks_passed", "migrations_started", "migrations_applied",
  "deploy_started", "deployed", "postdeploy_verified"
]);
const sha256 = s => createHash("sha256").update(s).digest("hex");
const validSha = s => /^[0-9a-f]{40}$/.test(s);
const validRun = s => /^[0-9]+$/.test(s);
const MARKER = "taghvim-release-ledger-v1";

export function advance(prior, {component, stage, sha, run, attempt = "1", at}) {
  if (!["engine","landing"].includes(component) || !STAGES.includes(stage))
    throw Error("invalid component or stage");
  if (!validSha(sha) || !validRun(run) || !validRun(attempt)) throw Error("invalid immutable execution identity");
  if (prior && (prior.component !== component ||
      prior[component+"_sha"] !== sha || prior.workflow_run !== run))
    throw Error("checkpoint lease or component mismatch");
  const entries = [...(prior?.checkpoints || [])];
  const previous = entries.at(-1);
  const current = STAGES.indexOf(stage), last = previous ? STAGES.indexOf(previous.stage) : -1;
  if ((previous && last < 0) || (previous && current < last))
    throw Error("phase regression; inspect real deployed state before retry");
  if (current > last + 1) throw Error("skipped phase; never infer remote side effects");
  if (!previous && stage !== STAGES[0]) throw Error("first phase must be authorized");
  if (current === last && previous) {
    // An idempotent repeat is safe only if the local prior evidence is intact.
  } else {
    if (!at || !Number.isFinite(Date.parse(at))) throw Error("missing checkpoint timestamp");
    const prevHash = previous?.hash || "genesis";
    entries.push({stage, at, prev_hash:prevHash,
      hash:sha256(JSON.stringify({component, sha, run, stage, at, prev_hash:prevHash}))});
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i], prevHash = i ? entries[i-1].hash : "genesis";
    if (e.stage !== STAGES[i] || e.prev_hash !== prevHash ||
        e.hash !== sha256(JSON.stringify({component,sha,run,stage:e.stage,at:e.at,prev_hash:prevHash})))
      throw Error("checkpoint chain integrity violation");
  }
  return {schema_version:2,component,workflow_run:run,run_attempt:attempt,
    [component+"_sha"]:sha,phase:stage,checkpoints:entries,
    checkpoint_hash:entries.at(-1).hash,ga_approved:false,
    declared_state:stage==="postdeploy_verified"?"CONTRACT_OBSERVED_NOT_GA":"RELEASE_IN_PROGRESS",
    warning:"Only the actual production D1 ledger, Worker deployments and E2E tests prove remote correctness"};
}

export const marker = (event) =>
  "<!-- "+MARKER+" "+event.component+":"+event.workflow_run+":"+event.phase+" -->";

export function commentFor(event) {
  const {component,workflow_run,phase,checkpoint_hash,run_attempt} = event;
  return marker(event)+"\n"+
    "Release checkpoint: **"+component+" / "+phase+"** (not GA)\n\n"+
    "Run: "+workflow_run+"; attempt: "+run_attempt+
    "; SHA: \`"+event[component+"_sha"]+"\`; chain: \`"+checkpoint_hash+"\`\n\n"+
    "\`\`\`json\n"+JSON.stringify(event,null,2)+"\n\`\`\`\n";
}

function parsedEvent(body) {
  const data = body.match(/(?:^|\n)\`\`\`json\n([\s\S]+?)\n\`\`\`/);
  if (!data) return null;
  try { return JSON.parse(data[1]); } catch { return null; }
}

// Page through the entire bot-authored issue ledger, not just the latest 100 comments.
export async function persistIssue(event,{repository,issue,token,request=fetch}) {
  if (!/^Taghvim-dev\/(engine|landing)$/.test(repository) ||
      repository.split("/")[1] !== event.component ||
      !/^[1-9][0-9]*$/.test(String(issue)) ||
      !token) throw Error("durable evidence target/token missing or wrong repository");
  const api="https://api.github.com/repos/"+repository+"/issues/"+issue+"/comments";
  const headers={"authorization":"Bearer "+token,"accept":"application/vnd.github+json",
    "x-github-api-version":"2022-11-28","user-agent":"taghvim-release-ledger"};
  const all=[];
  for (let page=1;page<=100;page++) {
    const response=await request(api+"?per_page=100&page="+page,{headers});
    if (!response.ok) throw Error("durable issue ledger unreadable HTTP "+response.status);
    const records=await response.json();
    if (!Array.isArray(records)) throw Error("invalid GitHub issue comments");
    // Ignore non-bot human comments. They cannot forge the release execution chain.
    all.push(...records.filter(x=>x.user?.login==="github-actions[bot]" && x.body?.includes(MARKER)));
    if (records.length < 100) break;
    if (page===100) throw Error("issue ledger pagination limit; review before release");
  }
  const existing=all.filter(x=>x.body.includes(marker(event)));
  if (existing.length) {
    if (existing.length!==1 || parsedEvent(existing[0].body)?.checkpoint_hash!==event.checkpoint_hash)
      throw Error("conflicting existing durable release checkpoint");
    return {status:"already_recorded",comment_id:existing[0].id};
  }
  if (event.phase==="authorized") {
    const latest=all.map(x=>parsedEvent(x.body)).filter(x=>x?.component===event.component).at(-1);
    if (latest && latest.workflow_run!==event.workflow_run && latest.phase!=="postdeploy_verified")
      throw Error("previous production attempt incomplete; reconcile actual D1/Workers before another run");
  }
  const response=await request(api,{method:"POST",headers:{
    ...headers,"content-type":"application/json"},body:JSON.stringify({body:commentFor(event)})});
  if (response.status!==201) throw Error("durable release checkpoint POST rejected HTTP "+response.status);
  const posted=await response.json();
  if (!posted?.id || !posted?.html_url) throw Error("GitHub did not confirm a durable comment");
  return {status:"recorded",comment_id:posted.id,url:posted.html_url};
}

export async function run(env=process.env,{request=fetch}={}) {
  const component=env.TAGHVIM_COMPONENT, stage=env.TAGHVIM_STAGE;
  const sha=env.GITHUB_SHA, run=env.GITHUB_RUN_ID, attempt=env.GITHUB_RUN_ATTEMPT||"1";
  const file="release-evidence.json";
  const prior=existsSync(file)?JSON.parse(readFileSync(file,"utf8")):null;
  const event=advance(prior,{component,stage,sha,run,attempt,at:new Date().toISOString()});
  const tmp=file+".tmp";
  writeFileSync(tmp,JSON.stringify(event,null,2)+"\n",{mode:0o600});
  renameSync(tmp,file);
  if (env.TAGHVIM_LEDGER_PERSIST==="true") {
    const saved=await persistIssue(event,{repository:env.GITHUB_REPOSITORY,
      issue:env.TAGHVIM_LEDGER_ISSUE,token:env.TAGHVIM_LEDGER_TOKEN,request});
    console.log("DURABLE_LEDGER",saved.status,saved.comment_id);
  } else if (env.TAGHVIM_LEDGER_PERSIST!=="false") {
    throw Error("release ledger persistence must be explicitly true or false");
  }
  console.log("RELEASE_CHECKPOINT",component,stage,"run",run,"sha",sha,"hash",event.checkpoint_hash);
  return event;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  run().catch(e=>{console.error("::error::Fail-closed release ledger: "+String(e.message||e));process.exitCode=1;});
}
