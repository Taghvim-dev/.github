import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, incidentKey, monitoredRun, currentHeadDeleted, shouldRetireIncident, shouldSweepAfterGreenMainRun } from "../.github/actions/ci-incident/reconcile.mjs";
import CONTROL from "../release/CI-CONTROL-REGISTRY.json" with {type:"json"};

const repo = "Taghvim-dev/engine";
const run = {
  id: 123, name: "test", workflow_id: 8, head_branch: "main", head_sha: "ab".repeat(20),
  head_repository: { full_name: repo }, status: "completed", event: "push",
  conclusion: "failure", run_number: 18, run_attempt: 1
};
const base = (overrides = {}) => ({
  run: { ...run, ...overrides },
  repository: repo, currentSha: run.head_sha, recent: [{ ...run, ...overrides }], openPulls: []
});
test("Only current main failures generate incidents", () => {
  assert.equal(classify(base()), "open");
  assert.equal(classify(base({ conclusion: "success" })), "close");
  assert.equal(classify({ ...base(), currentSha: "cd".repeat(20) }), "ignore");
  assert.equal(classify(base({ status: "in_progress" })), "ignore");
  assert.equal(classify(base({ head_repository: { full_name: "attacker/fork" } })), "ignore");
  assert.equal(classify(base({ head_branch: "feature" })), "ignore");
  assert.equal(classify(base({ conclusion: "cancelled" })), "ignore");
});
test("Superseded CI errors are discarded without opening a stale incident", () => {
  const f = base();
  f.recent = [ { ...run, id: 124, run_number: 19, conclusion: "success" }, run ];
  assert.equal(classify(f), "ignore");
  f.recent = [ { ...run, id: 123, run_number: 18, run_attempt: 2, conclusion: "success" } ];
  assert.equal(classify(f), "ignore");
});
test("PR incidents require current SHA and open same-repository PR; fork excluded", () => {
  const feature = { ...run, event: "pull_request", head_branch: "fix/foo", run_number: 20 };
  const pr = { state: "open", head: { sha: run.head_sha, ref: "fix/foo", repo: { full_name: repo } } };
  const opts = { run: feature, currentSha: run.head_sha, repository: repo, recent: [feature], openPulls: [pr] };
  assert.equal(classify(opts), "open");
  assert.equal(classify({ ...opts, openPulls: [] }), "ignore");
  assert.equal(classify({ ...opts, openPulls: [{ ...pr, state: "closed" }] }), "ignore");
  assert.equal(classify({ ...opts, openPulls: [{ ...pr, head: { ...pr.head, sha: "00" } }] }), "ignore");
  assert.equal(classify({ ...opts, run: { ...feature, conclusion: "success" } }), "close");
});
test("Incident identity deduplicates by workflow and branch, not by commit or run", () => {
  const a = incidentKey(8, "main");
  assert.equal(a, incidentKey(8, "main"));
  assert.notEqual(a, incidentKey(9, "main"));
  assert.notEqual(a, incidentKey(8, "another"));
  assert.match(a, /^[a-f0-9]{20}$/);
});

test("T0 observes protected release workflow_dispatch failures and closes on actual recovered run", () => {
 const release={...run,event:"workflow_dispatch",head_branch:"main",name:"controlled-engine-release",workflow_id:918,id:402};
 const opts={run:release,currentSha:run.head_sha,recent:[release],repository:repo,openPulls:[]};
 assert.equal(classify(opts),"open");
 assert.equal(classify({...opts,run:{...release,conclusion:"success"}}),"close");
 assert.equal(classify({...opts,currentSha:"aa".repeat(20)}),"ignore");
 assert.equal(classify({...opts,run:{...release,head_branch:"unsafe-feature"}}),"ignore");
 const newer={...release,id:403,run_number:19,conclusion:"success"};
 assert.equal(classify({...opts,recent:[release,newer]}),"ignore");
});
test("T0 detects owner issue_comment release-dispatch failure without user reporting emails", () => {
 const issue={...run,event:"issue_comment",head_branch:"main",name:"t0-owner-protected-release-request",workflow_id:919,id:404};
 const opts={run:issue,currentSha:run.head_sha,recent:[issue],repository:repo,openPulls:[]};
 assert.equal(classify(opts),"open");
 assert.equal(classify({...opts,run:{...issue,conclusion:"success"}}),"close");
 assert.equal(classify({...opts,run:{...issue,head_repository:{full_name:"outside/evil"}}}),"ignore");
});

test("T0 scheduled live-readiness failures open a durable incident and recovered same-head runs close it", () => {
 const timed={...run,event:"schedule",head_branch:"main",name:"t0-live-readiness",workflow_id:920,id:405};
 const opts={run:timed,currentSha:run.head_sha,recent:[timed],repository:repo,openPulls:[]};
 assert.equal(classify(opts),"open");
 assert.equal(classify({...opts,run:{...timed,conclusion:"success"}}),"close");
 assert.equal(classify({...opts,currentSha:"ee".repeat(20)}),"ignore");
 assert.equal(classify({...opts,run:{...timed,head_branch:"feature"}}),"ignore");
 const newer={...timed,id:406,run_number:19,conclusion:"success"};
 assert.equal(classify({...opts,recent:[timed,newer]}),"ignore");
});

test("T0 all Taghvim repos use one canonical CI incident scope, no untrusted forks or bot cascades",()=>{
 const repos=["engine","landing","SDK","CLI","cookbooks",".github"].map(x=>"Taghvim-dev/"+x);
 assert.deepEqual(Object.keys(CONTROL.monitored_repositories).sort(),repos.sort());
 assert.equal(CONTROL.production_mutation_authority,false);
 assert.equal(CONTROL.trusted_actions_only,true);
 for(const [repo,names] of Object.entries(CONTROL.monitored_repositories)){
  assert.equal(new Set(names).size,names.length);
  assert.ok(names.length>0,repo);
  for(const name of names)assert.equal(monitoredRun(repo,name),true);
  assert.equal(monitoredRun(repo,"t0-ci-incident-reconciler"),false);
 }
 assert.equal(monitoredRun("Outside/engine","test"),false);
 assert.equal(monitoredRun("Taghvim-dev/engine","unreviewed-actionbot"),false);
});
test("Deleted feature branches are historical, not repeated CI incident failures",()=>{
 assert.equal(currentHeadDeleted(404),true);
 for(const status of [401,403,429,500,503])assert.equal(currentHeadDeleted(status),false);
});

test("T0 status reconciler retires stale heads without touching current unresolved failures",()=>{
 const r={...run,head_sha:"aa".repeat(20)};
 assert.equal(shouldRetireIncident({run:r,currentSha:r.head_sha,repository:repo}),false);
 assert.equal(shouldRetireIncident({run:r,currentSha:"bb".repeat(20),repository:repo}),true);
 assert.equal(shouldRetireIncident({run:r,currentSha:null,repository:repo}),true);
 const pr={...r,event:"pull_request",head_branch:"feature/x"};
 const opened={state:"open",head:{repo:{full_name:repo},ref:"feature/x",sha:pr.head_sha}};
 assert.equal(shouldRetireIncident({run:pr,currentSha:pr.head_sha,openPulls:[opened],repository:repo}),false);
 assert.equal(shouldRetireIncident({run:pr,currentSha:pr.head_sha,openPulls:[],repository:repo}),true);
 assert.equal(shouldRetireIncident({run:pr,currentSha:pr.head_sha,openPulls:[{...opened,state:"closed"}],repository:repo}),true);
 assert.equal(shouldRetireIncident({run:{...pr,head_repository:{full_name:"foreign/fork"}},currentSha:null,repository:repo}),false);
});

test("T0 obsolete source adjudication works for every canonical repository",()=>{
 for(const name of ["engine","landing","SDK","CLI","cookbooks",".github"]){
  const owner="Taghvim-dev/"+name;
  const target={...run,head_repository:{full_name:owner},head_branch:"release-branch"};
  const open={state:"open",head:{repo:{full_name:owner},ref:"release-branch",sha:run.head_sha}};
  const pr={...target,event:"pull_request"};
  assert.equal(shouldRetireIncident({run:pr,currentSha:pr.head_sha,openPulls:[open],repository:owner}),false);
  assert.equal(shouldRetireIncident({run:pr,currentSha:pr.head_sha,openPulls:[],repository:owner}),true);
  assert.equal(shouldRetireIncident({run:target,currentSha:run.head_sha,repository:owner}),false);
  assert.equal(shouldRetireIncident({run:target,currentSha:null,repository:owner}),true);
 }
});

test("T0 stale ActionBot recovery is triggered by verified current-main CI success, independent of unreliable cron",()=>{
 const source={...run,conclusion:"success",event:"push",head_branch:"main",status:"completed"};
 assert.equal(shouldSweepAfterGreenMainRun({eventName:"workflow_run",run:source,repository:repo}),true);
 for(const bad of [
  {eventName:"schedule"},
  {eventName:"workflow_dispatch"},
  {run:{...source,conclusion:"failure"}},
  {run:{...source,event:"pull_request"}},
  {run:{...source,head_branch:"obsolete-feature"}},
  {run:{...source,head_repository:{full_name:"fork/engine"}}},
  {run:{...source,name:"t0-ci-incident-reconciler"}},
  {run:{...source,status:"in_progress"}},
  {repository:"Taghvim-dev/unmonitored"}
 ])assert.equal(shouldSweepAfterGreenMainRun({eventName:"workflow_run",run:source,repository:repo,...bad}),false,
   JSON.stringify(bad));
});
test("T0 shared action cleans stale source incidents after successful real main head without recursive CI incidents",async()=>{
 const {readFileSync}=await import("node:fs");
 const action=readFileSync(new URL("../.github/actions/ci-incident/reconcile.mjs",import.meta.url),"utf8");
 assert.match(action,/const current=await reconcile\(payload\)/);
 assert.match(action,/if\(!shouldSweepAfterGreenMainRun/);
 assert.match(action,/const swept=await sweepStaleIncidents\(\)/);
 assert.match(action,/stale_retired:swept.retired/);
 assert.match(action,/run\?\.event==="push"/);
});

test("T0 canonical observer covers all tracked organization workflows without cascading on itself",async()=>{
 const fs=await import("node:fs");
 const config=JSON.parse(fs.readFileSync(new URL("../release/CI-CONTROL-REGISTRY.json",import.meta.url),"utf8"));
 assert.equal(config.version,"1.1.0");
 assert.equal(config.actionbot_codex_policy.unknown_workflow,"deny_observability_coverage_at_ci");
 const names=fs.readdirSync(new URL("../.github/workflows/",import.meta.url))
  .filter(p=>p.endsWith(".yml"))
  .map(p=>fs.readFileSync(new URL("../.github/workflows/"+p,import.meta.url),"utf8")
    .match(/^name:\\s*["']?([^\\r\\n"']+)/m)?.[1]?.trim());
 const expected=names.filter(n=>n!=="t0-ci-incident-reconciler");
 assert.deepEqual([...config.monitored_repositories["Taghvim-dev/.github"]].sort(),expected.sort());
 const observer=fs.readFileSync(new URL("../.github/workflows/t0-ci-incident.yml",import.meta.url),"utf8");
 const enabled=observer.match(/workflows:\\s*(\\[[^\\n]+\\])/);
 assert.ok(enabled,"canonical workflow_run trigger not declared");
 assert.deepEqual(JSON.parse(enabled[1]).sort(),expected);
 assert.match(observer,/head_repository.full_name == github.repository/,"foreign PRs must not trigger privileged reconciliation");
 assert.match(observer,/cancel-in-progress: false/,"do not cancel a missing-failure check");
});
test("T0 source-owned CI inventory includes historically ignored diagnostic workflows",()=>{
 const control=CONTROL.monitored_repositories;
 for(const [repo,required] of Object.entries({
  "Taghvim-dev/engine":[
   "public-api-release-observation",
   "t0-private-landing-source-readonly-probe",
   "t0-public-api-readonly-smoke-observation",
   "t0-engine-sandbox-d1-migration",
   "t0-sandbox-http-readonly-route-diagnostic",
   "controlled-engine-release","test"
  ],
  "Taghvim-dev/landing":[
   "t0-public-landing-readonly-smoke-observation","controlled-landing-release",
   "landing-verify","visual-rtl-acceptance"
  ]
 })){
  assert.equal(new Set(control[repo]).size,control[repo].length);
  for(const name of required)assert.ok(monitoredRun(repo,name),repo+" : "+name);
 }
 assert.match(CONTROL.runtime_proof_rule,/must never produce a GA/);
});
