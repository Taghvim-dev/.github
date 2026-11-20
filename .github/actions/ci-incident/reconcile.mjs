/**
 * T=0 GitHub Actions incident reconciliation.
 * Runs exclusively from default-branch, SHA-pinned trusted action source.
 * Consumes GitHub metadata only; never checks out/executes workflow_run head code.
 * The GitHub token has issues:write and actions:read, not deployment access.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import CONTROL from "../../../release/CI-CONTROL-REGISTRY.json" with {type:"json"};

const BAD = new Set(CONTROL.outcomes.incident);
export function monitoredRun(repo,name){
 const allowed=CONTROL.monitored_repositories[repo];
 return Array.isArray(allowed)&&allowed.includes(name)&&name!=="t0-ci-incident-reconciler";
}
export function currentHeadDeleted(status){return status===404;}
export function shouldSweepAfterGreenMainRun({eventName,run,repository}={}) {
 // Current-head CI success is a reconciliation trigger; it is never a reason
 // to dispatch, deploy, reopen a stale incident, or recurse on our own observer.
 return eventName==="workflow_run"&&run?.status==="completed"&&
   run?.conclusion==="success"&&run?.event==="push"&&
   run?.head_branch==="main"&&run?.head_repository?.full_name===repository&&
   monitoredRun(repository,run?.name);
}

/** One constitutional root-cause taxonomy across GitHub CI, Codex and ActionBot-triggered runs.
 * Never call a zero-step GitHub control-plane failure a defect in checked-out code.
 * GitHub metadata is the only execution evidence accepted here; external Codex
 * services require independent receipts and may not inherit green CI.
 */
export function classifyExecutionBoundary({jobs,conclusion}={}){
  if(!Array.isArray(jobs)||!jobs.length)return "UNVERIFIED_RUNNER_JOB_INVENTORY";
  const failed=jobs.filter(x=>["failure","timed_out","startup_failure","action_required"].includes(x.conclusion));
  if(!failed.length && conclusion!=="success")return "UNVERIFIED_FAILURE_BOUNDARY";
  if(failed.length && failed.every(x=>
    !x.runner_name && Array.isArray(x.steps) && x.steps.length===0))
      return "PRE_RUNNER_PLATFORM_OR_QUOTA";
  if(failed.length)return "EXECUTED_WORKFLOW_FAILURE";
  return "SUCCEEDED_NO_INCIDENT";
}

export function newerCurrentGreenCloses({failed,run,currentSha}={}){
  return !!failed&&!!run && run.status==="completed"&&run.conclusion==="success" &&
    run.head_sha===currentSha && failed.head_sha===currentSha &&
    run.head_branch===failed.head_branch && run.workflow_id===failed.workflow_id &&
    run.event===failed.event &&
    (run.run_number>failed.run_number ||
     (run.run_number===failed.run_number&&(run.run_attempt||1)>(failed.run_attempt||1)));
}

export const incidentKey = (workflow, branch) =>
  createHash("sha256").update(String(workflow) + "\0" + branch).digest("hex").slice(0, 20);

export function classify({ run, currentSha, recent = [], openPulls = [], repository }) {
  if (!run || run.status !== "completed" || !["push", "pull_request", "workflow_dispatch", "issue_comment", "schedule"].includes(run.event)) return "ignore";
  if (!Number.isInteger(run.workflow_id) || !run.head_branch || !run.head_sha ||
      run.head_repository?.full_name !== repository || run.head_sha !== currentSha) return "ignore";
  if (["push", "workflow_dispatch", "issue_comment", "schedule"].includes(run.event) && run.head_branch !== "main") return "ignore";
  if (run.event === "pull_request" && !openPulls.some(pr =>
      pr.state === "open" && pr.head?.repo?.full_name === repository &&
      pr.head?.ref === run.head_branch && pr.head?.sha === currentSha)) return "ignore";
  // Only a real success, never a skipped/neutral run, can close a failure.
  const relevant = recent.filter(x => x.head_sha === currentSha &&
    x.head_branch === run.head_branch && x.event === run.event &&
    ["success",...BAD].includes(x.conclusion));
  // Do not publish a stale failure, even if its event arrives after a newer successful run.
  const newest = relevant.reduce((best, x) =>
    !best || x.run_number > best.run_number ||
    (x.run_number === best.run_number && (x.run_attempt || 1) > (best.run_attempt || 1))
    ? x : best, null);
  if (newest && (newest.id !== run.id || (newest.run_attempt || 1) > (run.run_attempt || 1)))
    return "ignore";
  if (run.conclusion === "success") return "close";
  if (BAD.has(run.conclusion)) return "open";
  return "ignore";
}

export function issueBody({ key, run, executionBoundary="UNVERIFIED_FAILURE_BOUNDARY" }) {
  const url = "https://github.com/" + process.env.GITHUB_REPOSITORY + "/actions/runs/" + run.id;
  return [
    "<!-- taghvim-ci-incident:" + key + " -->",
    "## Current GitHub Actions incident (not a production deployment claim)",
    "Workflow: `" + String(run.name || "unnamed").replace(/[`\r\n]/g, "") + "`",
    "Branch: `" + String(run.head_branch).replace(/[`\r\n]/g, "") + "`",
    "Head SHA: `" + String(run.head_sha) + "`",
    "Failure conclusion: `" + String(run.conclusion) + "`",
    "Root boundary: `" + executionBoundary + "`",
    "Evidence: " + url,
    "",
    "Created only for the latest active source SHA after GitHub Actions completed in failure.",
    "A later successful run on the same head automatically closes this issue.",
    "Never treat historical/superseded CI or this issue as proof of Cloudflare runtime health.",
    ""
  ].join("\n");
}

const apiBase = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
async function api(path, method = "GET", body, {allowMissing=false} = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw Error("CI_INCIDENT_TOKEN_MISSING");
  const r = await fetch(apiBase + path, {
    method,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": "Bearer " + token,
      "x-github-api-version": "2022-11-28",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000)
  });
  if(allowMissing&&currentHeadDeleted(r.status))return null;
  if (!r.ok) throw Error("CI_INCIDENT_GITHUB_API_" + r.status + " path=" + path.split("?")[0]);
  return r.json();
}

/** Historical run remains in Actions; only the operational incident is retired.
 * The authority is the current source SHA plus an open same-repository PR. */
export function shouldRetireIncident({run,currentSha,openPulls=[],repository}){
 if(!run||run.head_repository?.full_name!==repository||!Number.isInteger(run.workflow_id)||
    !run.head_branch||!/^[a-f0-9]{40}$/.test(run.head_sha||""))return false;
 if(run.event==="pull_request"&&!openPulls.some(pr=>pr.state==="open"&&
    pr.head?.repo?.full_name===repository&&pr.head?.ref===run.head_branch&&pr.head?.sha===run.head_sha))return true;
 return !currentSha||currentSha!==run.head_sha;
}
async function closeUnchangedIssue(repo,issue){
 if(!issue||issue.state!=="open")return "already_clear";
 const latest=await api("/repos/"+repo+"/issues/"+issue.number);
 if(latest?.state!=="open"||latest?.body!==issue.body)return "raced_no_mutation";
 await api("/repos/"+repo+"/issues/"+issue.number,"PATCH",{state:"closed",state_reason:"not_planned"});
 return "retired";
}
async function findIssue(repo, key,{openOnly=false}={}) {
  const mark = "<!-- taghvim-ci-incident:" + key + " -->";
  // A successful run can only close an OPEN incident; do not scan the full
  // historical issue archive on every green CI result (rate-limit fanout).
  // A failed run still searches ALL history to reopen its original durable issue.
  for (let page = 1; page <= (openOnly?3:10); page++) {
    const issues = await api("/repos/" + repo + "/issues?state="+(openOnly?"open":"all")+"&per_page=100&page=" + page);
    const found = issues.find(i => !i.pull_request && i.body?.includes(mark));
    if (found) return found;
    if (issues.length < 100) return null;
  }
  // Fail closed instead of duplicating a possibly older issue beyond the scan window.
  throw Error(openOnly?"CI_INCIDENT_OPEN_REGISTRY_TOO_LARGE":"CI_INCIDENT_REGISTRY_TOO_LARGE");
}

export async function reconcile(payload) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!Object.hasOwn(CONTROL.monitored_repositories,repo||"")) throw Error("CI_INCIDENT_REPO_SCOPE");
  const run = payload.workflow_run;
  if (!run || run.status !== "completed" || !["push", "pull_request", "workflow_dispatch", "issue_comment", "schedule"].includes(run.event) ||
      run.head_repository?.full_name !== repo || !monitoredRun(repo,run.name)) return "ignored";
  // Read CURRENT GitHub source, not a cached event payload or stale CI email.
  const branch = encodeURIComponent(run.head_branch || "");
  // A merged/deleted PR branch is not an incident; resolve identity first.
  const pulls = run.event === "pull_request"
    ? await api("/repos/" + repo + "/pulls?state=open&head=" +
        encodeURIComponent("Taghvim-dev:" + run.head_branch) + "&per_page=100") : [];
  const key=incidentKey(run.workflow_id,run.head_branch);
  if(run.event==="pull_request"&&!pulls.some(pr=>pr.state==="open"&&
      pr.head?.repo?.full_name===repo&&pr.head?.ref===run.head_branch)){
    const issue=await findIssue(repo,key,{openOnly:true});
    return issue?.state==="open"?await closeUnchangedIssue(repo,issue):"ignored_retired_pr";
  }
  // Stale workflow_run may arrive after an obsolete feature branch is deleted.
  // This is not an actionable incident and must not create a *new* bot error.
  const current = await api("/repos/" + repo + "/branches/" + branch,"GET",undefined,{allowMissing:true});
  if(!current){
    const issue=await findIssue(repo,key,{openOnly:true});
    return issue?.state==="open"?await closeUnchangedIssue(repo,issue):"ignored_deleted_head";
  }
  const currentSha = current.commit?.sha;
  const results = await api("/repos/" + repo + "/actions/workflows/" + run.workflow_id +
    "/runs?branch=" + branch + "&per_page=30");
  const verdict = classify({
    run, currentSha, openPulls: pulls, recent: results.workflow_runs || [], repository: repo
  });
  if (verdict === "ignore") return "ignored";
  const issue = await findIssue(repo, key,{openOnly:verdict==="close"});
  if (verdict === "open") {
    const jobInventory=await api("/repos/"+repo+"/actions/runs/"+run.id+"/jobs?per_page=100");
    const executionBoundary=classifyExecutionBoundary({
      jobs:jobInventory?.jobs,conclusion:run.conclusion
    });
    if(issue?.state==="open"){
      const updated=issueBody({key,run,executionBoundary});
      if(issue.body!==updated){
        const currentIssue=await api("/repos/"+repo+"/issues/"+issue.number);
        if(currentIssue.state!=="open"||currentIssue.body!==issue.body)return "raced_no_mutation";
        await api("/repos/"+repo+"/issues/"+issue.number,"PATCH",{body:updated});
        return "updated_current_failure";
      }
      return "already_open";
    }
    if (issue) {
      await api("/repos/" + repo + "/issues/" + issue.number, "PATCH", { state: "open", body: issueBody({ key, run, executionBoundary }) });
      return "reopened";
    }
    await api("/repos/" + repo + "/issues", "POST", {
      title: "[CI Incident] " + String(run.name || "workflow").slice(0, 70) + " — " + run.head_branch.slice(0, 70),
      body: issueBody({ key, run, executionBoundary })
    });
    return "opened";
  }
  if(issue?.state==="open"){
    const out=await closeUnchangedIssue(repo,issue);
    return out==="retired"?"closed":out;
  }
  return "already_clear";
}

/** Reconcile historical incident issues against current authoritative branch/PR
 * state. Read and validate all source facts before issuing any close writes. */
export async function sweepStaleIncidents(){
 const repo=process.env.GITHUB_REPOSITORY;
 if(!Object.hasOwn(CONTROL.monitored_repositories,repo||""))throw Error("CI_INCIDENT_REPO_SCOPE");
 const plan=[];
 for(let page=1;page<=10;page++){
  const issues=await api("/repos/"+repo+"/issues?state=open&per_page=100&page="+page);
  if(!Array.isArray(issues))throw Error("CI_INCIDENT_ISSUE_INVENTORY_INVALID");
  for(const issue of issues){
   if(issue.pull_request||issue.state!=="open")continue;
   const mark=issue.body?.match(/<!-- taghvim-ci-incident:([a-f0-9]{20}) -->/);
   const link=issue.body?.match(/Evidence: (https:\/\/github\.com\/Taghvim-dev\/(?:engine|landing|SDK|CLI|cookbooks|\.github)\/actions\/runs\/([0-9]+))/);
   if(!mark||!link||link[1]!=="https://github.com/"+repo+"/actions/runs/"+link[2])continue;
   const run=await api("/repos/"+repo+"/actions/runs/"+link[2],"GET",undefined,{allowMissing:true});
   if(!run||run.status!=="completed"||!monitoredRun(repo,run.name)||
       incidentKey(run.workflow_id,run.head_branch)!==mark[1]||
       run.head_repository?.full_name!==repo)continue;
   const current=await api("/repos/"+repo+"/branches/"+encodeURIComponent(run.head_branch),"GET",undefined,{allowMissing:true});
   const prs=run.event==="pull_request"?
     await api("/repos/"+repo+"/pulls?state=open&head="+encodeURIComponent("Taghvim-dev:"+run.head_branch)+"&per_page=100"):[];
   if(!Array.isArray(prs))throw Error("CI_INCIDENT_PR_INVENTORY_INVALID");
   const obsolete=shouldRetireIncident({run,currentSha:current?.commit?.sha,openPulls:prs,repository:repo});
   // A green retry on the SAME active PR/main SHA is a source-backed recovery,
   // even if the green workflow_run notification was coalesced or never observed.
   let provenGreen=false;
   if(!obsolete&&current?.commit?.sha===run.head_sha){
     const ci=await api("/repos/"+repo+"/actions/workflows/"+run.workflow_id+
       "/runs?branch="+encodeURIComponent(run.head_branch)+"&per_page=30");
     if(!Array.isArray(ci?.workflow_runs))throw Error("CI_INCIDENT_RECOVERY_RUN_INVENTORY_INVALID");
     provenGreen=ci.workflow_runs.some(candidate=>
       newerCurrentGreenCloses({failed:run,run:candidate,currentSha:current.commit.sha}));
   }
   if(obsolete||provenGreen)plan.push(issue);
  }
  if(issues.length<100)break;
  if(page===10)throw Error("CI_INCIDENT_REGISTRY_TOO_LARGE");
 }
 const outcomes=[];
 for(const issue of plan)outcomes.push({issue:issue.number,result:await closeUnchangedIssue(repo,issue)});
 return {checked:"current_source_and_real_pr",retired:outcomes.filter(x=>x.result==="retired").length,outcomes};
}


/** Single deterministic T0 admission. Trust only the latest conclusive CI
 * result on exact current main or open same-repo PR SHA. No fork checkout,
 * no post-facto success, no workflow_run listener fanout. */
export function planCurrentHeadRuns({runs=[],mainSha,openPulls=[],repository}={}){
 if(!/^[a-f0-9]{40}$/.test(mainSha||"")||!Array.isArray(runs)||
    !Array.isArray(openPulls)||!Object.hasOwn(CONTROL.monitored_repositories,repository||""))
  throw Error("CI_INCIDENT_CURRENT_HEAD_INVENTORY_INVALID");
 const heads=new Map([["main",mainSha]]);
 for(const pr of openPulls){
  if(pr?.state!=="open"||pr.head?.repo?.full_name!==repository||
     !pr.head?.ref||!/^[a-f0-9]{40}$/.test(pr.head.sha||""))continue;
  if(pr.head.ref==="main")continue;
  if(heads.has(pr.head.ref)&&heads.get(pr.head.ref)!==pr.head.sha)
   throw Error("CI_INCIDENT_AMBIGUOUS_PR_HEAD");
  heads.set(pr.head.ref,pr.head.sha);
 }
 const decisions=new Map();
 for(const r of runs){
  if(!r||r.status!=="completed"||!["success",...BAD].includes(r.conclusion)||
     !monitoredRun(repository,r.name)||!Number.isInteger(r.workflow_id)||
     r.head_repository?.full_name!==repository||
     !["push","pull_request","workflow_dispatch","issue_comment","schedule"].includes(r.event)||
     heads.get(r.head_branch)!==r.head_sha)continue;
  if(r.head_branch==="main"&&r.event==="pull_request")continue;
  if(r.head_branch!=="main"&&r.event!=="pull_request")continue;
  const key=r.workflow_id+"|"+r.head_branch+"|"+r.event,prev=decisions.get(key);
  if(!prev||r.run_number>prev.run_number||
     (r.run_number===prev.run_number&&(r.run_attempt||1)>(prev.run_attempt||1)))
   decisions.set(key,r);
 }
 return [...decisions.values()].sort((x,y)=>
  x.name.localeCompare(y.name)||x.head_branch.localeCompare(y.head_branch)||x.event.localeCompare(y.event));
}
/** Pre-effect: complete bounded GitHub metadata snapshot before any issue write.
 * Each write remains CAS-protected by the existing canonical incident ledger. */
export async function reconcileCurrentHeads(){
 const repo=process.env.GITHUB_REPOSITORY;
 if(!Object.hasOwn(CONTROL.monitored_repositories,repo||""))throw Error("CI_INCIDENT_REPO_SCOPE");
 const main=await api("/repos/"+repo+"/branches/main"),mainSha=main?.commit?.sha;
 if(!/^[a-f0-9]{40}$/.test(mainSha||""))throw Error("CI_INCIDENT_MAIN_HEAD_UNVERIFIED");
 const prs=await api("/repos/"+repo+"/pulls?state=open&per_page=100");
 if(!Array.isArray(prs)||prs.length===100)throw Error("CI_INCIDENT_PR_INVENTORY_TRUNCATED");
 const rows=[],pages=CONTROL.event_admission.max_run_pages;
 if(!Number.isInteger(pages)||pages<1||pages>5)throw Error("CI_INCIDENT_SCAN_BUDGET_UNVERIFIED");
 for(let page=1;page<=pages;page++){
  const x=await api("/repos/"+repo+"/actions/runs?per_page=100&page="+page);
  if(!Array.isArray(x?.workflow_runs))throw Error("CI_INCIDENT_RUN_INVENTORY_INVALID");
  rows.push(...x.workflow_runs);
  if(x.workflow_runs.length<100)break;
  if(page===pages)throw Error("CI_INCIDENT_RUN_INVENTORY_TRUNCATED");
 }
 const plan=planCurrentHeadRuns({runs:rows,mainSha,openPulls:prs,repository:repo});
 const decisions=[];
 for(const run of plan)decisions.push({run:run.id,workflow:run.name,
  disposition:await reconcile({workflow_run:run})});
 const swept=await sweepStaleIncidents();
 return {status:"T0_CURRENT_HEAD_RECONCILED",head:mainSha,
  observed:rows.length,decisions,stale_retired:swept.retired,
  production_mutations:0,ga_approved:false};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!["schedule","workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME)){
  console.error("::error::CI_INCIDENT_EVENT_NOT_AUTHORIZED");process.exitCode=1;
 }else reconcileCurrentHeads()
  .then(x=>console.log("CI_INCIDENT_RECONCILED",JSON.stringify(x)))
  .catch(e=>{console.error("::error::"+String(e.message||e));process.exitCode=1;});
}
