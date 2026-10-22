/**
 * T=0 GitHub Actions incident reconciliation.
 * Runs exclusively from default-branch, SHA-pinned trusted action source.
 * Consumes GitHub metadata only; never checks out/executes workflow_run head code.
 * The GitHub token has issues:write and actions:read, not deployment access.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BAD = new Set(["failure", "timed_out", "startup_failure", "action_required"]);
export const incidentKey = (workflow, branch) =>
  createHash("sha256").update(String(workflow) + "\0" + branch).digest("hex").slice(0, 20);

export function classify({ run, currentSha, recent = [], openPulls = [], repository }) {
  if (!run || run.status !== "completed" || !["push", "pull_request"].includes(run.event)) return "ignore";
  if (!Number.isInteger(run.workflow_id) || !run.head_branch || !run.head_sha ||
      run.head_repository?.full_name !== repository || run.head_sha !== currentSha) return "ignore";
  if (run.event === "push" && run.head_branch !== "main") return "ignore";
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
async function api(path, method = "GET", body) {
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
  if (!r.ok) throw Error("CI_INCIDENT_GITHUB_API_" + r.status + " path=" + path.split("?")[0]);
  return r.json();
}

async function findIssue(repo, key) {
  const mark = "<!-- taghvim-ci-incident:" + key + " -->";
  // Search by exact durable marker, including closed issues; do not create one per failed run.
  for (let page = 1; page <= 10; page++) {
    const issues = await api("/repos/" + repo + "/issues?state=all&per_page=100&page=" + page);
    const found = issues.find(i => !i.pull_request && i.body?.includes(mark));
    if (found) return found;
    if (issues.length < 100) return null;
  }
  // Fail closed instead of duplicating a possibly older issue beyond the scan window.
  throw Error("CI_INCIDENT_REGISTRY_TOO_LARGE");
}

export async function reconcile(payload) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^Taghvim-dev\/(engine|landing)$/.test(repo || "")) throw Error("CI_INCIDENT_REPO_SCOPE");
  const run = payload.workflow_run;
  if (!run || run.status !== "completed" || !["push", "pull_request"].includes(run.event) ||
      run.head_repository?.full_name !== repo) return "ignored";
  // Read CURRENT GitHub source, not a cached event payload or stale CI email.
  const branch = encodeURIComponent(run.head_branch || "");
  // A merged/deleted PR branch is not an incident; resolve identity first.
  const pulls = run.event === "pull_request"
    ? await api("/repos/" + repo + "/pulls?state=open&head=" +
        encodeURIComponent("Taghvim-dev:" + run.head_branch) + "&per_page=100") : [];
  if (run.event === "pull_request" && !pulls.some(pr =>
      pr.head?.repo?.full_name === repo && pr.head?.ref === run.head_branch)) return "ignored";
  const current = await api("/repos/" + repo + "/branches/" + branch);
  const currentSha = current.commit?.sha;
  const results = await api("/repos/" + repo + "/actions/workflows/" + run.workflow_id +
    "/runs?branch=" + branch + "&per_page=30");
  const verdict = classify({
    run, currentSha, openPulls: pulls, recent: results.workflow_runs || [], repository: repo
  });
  if (verdict === "ignore") return "ignored";
  const key = incidentKey(run.workflow_id, run.head_branch);
  const issue = await findIssue(repo, key);
  if (verdict === "open") {
    if (issue?.state === "open") return "already_open";
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
  if (issue?.state === "open") {
    await api("/repos/" + repo + "/issues/" + issue.number, "PATCH", { state: "closed", state_reason: "completed" });
    return "closed";
  }
  return "already_clear";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  reconcile(payload)
    .then(status => console.log("CI_INCIDENT_RECONCILED", status))
    .catch(error => { console.error("::error::" + String(error.message || error)); process.exitCode = 1; });
}
