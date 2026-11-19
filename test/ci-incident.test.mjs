import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, incidentKey, monitoredRun, currentHeadDeleted, shouldRetireIncident } from "../.github/actions/ci-incident/reconcile.mjs";
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
