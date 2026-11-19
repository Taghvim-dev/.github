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
  const relevant = recent.filter(x => x.head_sha === currentSha &&
    x.head_branch === run.head_branch && x.event === run.event);
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

export function issueBody({ key, run }) {
  const url = "https://github.com/" + process.env.GITHUB_REPOSITORY + "/actions/runs/" + run.id;
  return [
    "<!-- taghvim-ci-incident:" + key + " -->",
    "## Current GitHub Actions incident (not a production deployment claim)",
    "Workflow: `" + String(run.name || "unnamed").replace(/[`\r\n]/g, "") + "`",
    "Branch: `" + String(run.head_branch).replace(/[`\r\n]/g, "") + "`",
    "Head SHA: `" + String(run.head_sha) + "`",
    "Failure conclusion: `" + String(run.conclusion) + "`",
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
    if(issue?.state==="open"){
      const updated=issueBody({key,run});
      if(issue.body!==updated){
        const currentIssue=await api("/repos/"+repo+"/issues/"+issue.number);
        if(currentIssue.state!=="open"||currentIssue.body!==issue.body)return "raced_no_mutation";
        await api("/repos/"+repo+"/issues/"+issue.number,"PATCH",{body:updated});
        return "updated_current_failure";
      }
      return "already_open";
    }
    if (issue) {
      await api("/repos/" + repo + "/issues/" + issue.number, "PATCH", { state: "open", body: issueBody({ key, run }) });
      return "reopened";
    }
    await api("/repos/" + repo + "/issues", "POST", {
      title: "[CI Incident] " + String(run.name || "workflow").slice(0, 70) + " — " + run.head_branch.slice(0, 70),
      body: issueBody({ key, run })
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
   const link=issue.body?.match(/Evidence: https:\/\/github\.com\/Taghvim-dev\/(engine|landing)\/actions\/runs\/([0-9]+)/);
   if(!mark||!link||"Taghvim-dev/"+link[1]!==repo)continue;
   const run=await api("/repos/"+repo+"/actions/runs/"+link[2],"GET",undefined,{allowMissing:true});
   if(!run||run.status!=="completed"||!monitoredRun(repo,run.name)||
       incidentKey(run.workflow_id,run.head_branch)!==mark[1]||
       run.head_repository?.full_name!==repo)continue;
   const current=await api("/repos/"+repo+"/branches/"+encodeURIComponent(run.head_branch),"GET",undefined,{allowMissing:true});
   const prs=run.event==="pull_request"?
     await api("/repos/"+repo+"/pulls?state=open&head="+encodeURIComponent("Taghvim-dev:"+run.head_branch)+"&per_page=100"):[];
   if(!Array.isArray(prs))throw Error("CI_INCIDENT_PR_INVENTORY_INVALID");
   if(shouldRetireIncident({run,currentSha:current?.commit?.sha,openPulls:prs,repository:repo}))
      plan.push(issue);
  }
  if(issues.length<100)break;
  if(page===10)throw Error("CI_INCIDENT_REGISTRY_TOO_LARGE");
 }
 const outcomes=[];
 for(const issue of plan)outcomes.push({issue:issue.number,result:await closeUnchangedIssue(repo,issue)});
 return {checked:"current_source_and_real_pr",retired:outcomes.filter(x=>x.result==="retired").length,outcomes};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const task=["schedule","workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME)?
    sweepStaleIncidents():
    reconcile(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,"utf8")));
  task.then(status=>console.log("CI_INCIDENT_RECONCILED",JSON.stringify(status)))
    .catch(error=>{console.error("::error::"+String(error.message||error));process.exitCode=1;});
}
