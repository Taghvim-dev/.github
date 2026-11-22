import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, incidentKey, monitoredRun, currentHeadDeleted, shouldRetireIncident, planCurrentHeadRuns, classifyExecutionBoundary, newerCurrentGreenCloses } from "../.github/actions/ci-incident/reconcile.mjs";
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

test("T0 current-head planner deduplicates only real latest main and open-PR outcomes",()=>{
 const source={...run,run_number:21},recovered={...source,id:124,run_number:22,conclusion:"success"};
 const pr={state:"open",head:{ref:"feature",sha:"bb".repeat(20),repo:{full_name:repo}}};
 const prRun={...source,id:125,head_branch:"feature",head_sha:pr.head.sha,event:"pull_request",run_number:20};
 const planned=planCurrentHeadRuns({runs:[source,recovered,{...recovered,id:126,run_number:23,conclusion:"skipped"},prRun,
  {...source,name:"t0-ci-incident-reconciler",run_number:100},
  {...source,head_repository:{full_name:"attacker/repo"}}],mainSha:run.head_sha,openPulls:[pr],repository:repo});
 assert.deepEqual(planned.map(x=>x.id).sort(),[124,125]);
 assert.throws(()=>planCurrentHeadRuns({mainSha:"main",runs:[],repository:repo}),/CURRENT_HEAD_INVENTORY_INVALID/);
 const other={state:"open",head:{...pr.head,sha:"cc".repeat(20)}};
 assert.throws(()=>planCurrentHeadRuns({mainSha:run.head_sha,runs:[],openPulls:[pr,other],repository:repo}),/AMBIGUOUS_PR_HEAD/);
});
test("T0 one issue identity cannot be closed by a different trigger's older success",()=>{
 const manual={...run,id:210,workflow_id:9,run_number:20,event:"workflow_dispatch",conclusion:"success"};
 const scheduled={...run,id:211,workflow_id:9,run_number:21,event:"schedule",conclusion:"failure"};
 const actual=planCurrentHeadRuns({runs:[manual,scheduled],mainSha:run.head_sha,openPulls:[],repository:repo});
 assert.deepEqual(actual.map(x=>x.id),[211],"the unresolved event failure must dominate unrelated success");
 const recovered={...scheduled,id:212,run_number:22,conclusion:"success"};
 const healthy=planCurrentHeadRuns({runs:[manual,scheduled,recovered],mainSha:run.head_sha,openPulls:[],repository:repo});
 assert.deepEqual(healthy.map(x=>x.id),[212],"same-event newer success resolves that event");
 const unrelatedNewer={...manual,id:213,run_number:23,conclusion:"success"};
 const stillBroken=planCurrentHeadRuns({runs:[manual,unrelatedNewer,scheduled],mainSha:run.head_sha,openPulls:[],repository:repo});
 assert.deepEqual(stillBroken.map(x=>x.id),[211],"newer other-event success cannot suppress a failure");
});
test("T0 skipped notification never masks an actual same-SHA failure",()=>{
 assert.equal(classify({...base(),recent:[run,{...run,id:124,run_number:19,conclusion:"skipped"}]}),"open");
});
test("T0 all issue writes follow a bounded complete current-SHA snapshot",async()=>{
 const {readFileSync}=await import("node:fs");
 const s=readFileSync(new URL("../.github/actions/ci-incident/reconcile.mjs",import.meta.url),"utf8");
 assert.match(s,/const plan=planCurrentHeadRuns/);
 assert.ok(s.indexOf("const plan=planCurrentHeadRuns")<s.indexOf("for(const run of plan)"));
 assert.match(s,/CI_INCIDENT_CURRENT_SHA_RUNS_TRUNCATED/);
 assert.match(s,/actions\/runs\?head_sha=/);
 assert.match(s,/CI_INCIDENT_SHA_FILTER_UNTRUSTED/);
 assert.match(s,/CI_INCIDENT_PR_INVENTORY_TRUNCATED/);
 assert.match(s,/T0_CURRENT_HEAD_RECONCILED/);
 assert.doesNotMatch(s,/shouldSweepAfterGreenMainRun/);
});
test("T0 runner admission failure is never misreported as a code or Codex regression",()=>{
 const blank={conclusion:"failure",runner_name:null,steps:[]};
 assert.equal(classifyExecutionBoundary({jobs:[blank],conclusion:"failure"}),"PRE_RUNNER_PLATFORM_OR_QUOTA");
 assert.equal(classifyExecutionBoundary({jobs:[{...blank,runner_name:"ubuntu-ci",steps:[{name:"npm test"}]}],conclusion:"failure"}),"EXECUTED_WORKFLOW_FAILURE");
 assert.equal(classifyExecutionBoundary({jobs:[],conclusion:"failure"}),"UNVERIFIED_RUNNER_JOB_INVENTORY");
 assert.equal(classifyExecutionBoundary({jobs:[{...blank,conclusion:"success"}],conclusion:"success"}),"SUCCEEDED_NO_INCIDENT");
});
test("T0 durable recovery must independently prove same current SHA, same event/workflow, newer run",()=>{
 const failed={...run};
 const green={...run,id:124,conclusion:"success",run_number:19};
 assert.equal(newerCurrentGreenCloses({failed,run:green,currentSha:run.head_sha}),true);
 for(const bad of [{head_sha:"aa".repeat(20)},{head_branch:"other"},{workflow_id:99},{event:"pull_request"},{run_number:17},{status:"in_progress"},{conclusion:"skipped"}])
   assert.equal(newerCurrentGreenCloses({failed,run:{...green,...bad},currentSha:run.head_sha}),false,JSON.stringify(bad));
});
test("T0 six-repository polling cutover is SHA-bound, source-complete and nonrecursive",async()=>{
 const {readFileSync}=await import("node:fs");
 const reg=JSON.parse(readFileSync(new URL("../release/CI-CONTROL-REGISTRY.json",import.meta.url),"utf8"));
 const wf=readFileSync(new URL("../.github/workflows/t0-ci-incident.yml",import.meta.url),"utf8");
 const proof=JSON.parse(readFileSync(new URL("../release/CI-OBSERVER-CUTOVER.json",import.meta.url),"utf8"));
 assert.equal(reg.event_admission.mode,"owner_dispatch_current_main_and_open_pr_heads");
 assert.equal(reg.event_admission.sweep_cron,null);
 assert.equal(reg.event_admission.current_event_authority,"release/CI-OBSERVER-CURRENT.json");
 assert.equal(reg.event_admission.rollout_state,"OWNER_DISPATCH_ONLY_NO_CRON");
 assert.deepEqual(reg.event_admission.poll_incident_outcomes,reg.outcomes.incident);
 assert.doesNotMatch(wf,/^\s+schedule:/m);
 assert.match(wf,/github.actor == '007dude'/);
 assert.match(wf,/github.ref == 'refs\/heads\/main'/);
 for(const forbidden of ["workflow_run:","pull_request_target:","actions/checkout"])assert.ok(!wf.includes(forbidden));
 assert.match(wf,/workflow_dispatch:/);
 assert.match(wf,/ci-incident@b13c7fcdc14c7747b727c7ee2b66f8ef9dbf0f3b/);
 assert.equal(proof.controller_sha,reg.event_admission.all_repo_adapters_sha);
 // Historical cutover is immutable; source-only current admission is a different registry.
 const actual=JSON.parse(readFileSync(new URL("../release/CI-OBSERVER-CURRENT.json",import.meta.url),"utf8"));
 assert.equal(actual.scope,"source_only_pre_effect_not_a_runtime_receipt");
 assert.equal(actual.controller_sha,proof.controller_sha);
 assert.equal(actual.mode,"owner_dispatch_only");
 assert.equal(actual.trigger,"workflow_dispatch");
 assert.equal(actual.schedule_enabled,false);
 assert.equal(actual.workflow_run_fanout,false);
 assert.equal(actual.ga_authorized,false);
 assert.deepEqual(actual.monitored_repositories,Object.keys(reg.monitored_repositories).sort());
 assert.equal(proof.adapters.length,6);
 assert.deepEqual(proof.adapters.map(x=>x.repository).sort(),Object.keys(reg.monitored_repositories).sort());
 assert.ok(proof.adapters.every(x=>x.trigger==="schedule_or_owner_dispatch_only"&&x.pin===proof.controller_sha));
 assert.equal(proof.ga_authorized,false);
 assert.equal(proof.production_mutation_authority,false);
});
test("T0 complete observer inventory forbids unmonitored product actions and false GA auth success",async()=>{
 const fs=await import("node:fs");
 assert.equal(CONTROL.version,"1.2.0");
 assert.match(CONTROL.blocked_reconciliation_policy,/BLOCKED_CROSS_REPO_AUTH/);
 const localWorkflows=fs.readdirSync(new URL("../.github/workflows/",import.meta.url))
  .filter(x=>x.endsWith(".yml"))
  .map(x=>fs.readFileSync(new URL("../.github/workflows/"+x,import.meta.url),"utf8")
      .match(/^name:\s*["']?([^\r\n"']+)/m)?.[1]?.trim())
  .filter(x=>x!=="t0-ci-incident-reconciler");
 assert.deepEqual([...CONTROL.monitored_repositories["Taghvim-dev/.github"]].sort(),localWorkflows.sort());
 const observer=fs.readFileSync(new URL("../.github/workflows/t0-ci-incident.yml",import.meta.url),"utf8");
 assert.doesNotMatch(observer,/workflow_run:/);
 assert.doesNotMatch(observer,/^\s+schedule:/m);
 assert.match(observer,/github.actor == '007dude'/);
 assert.match(observer,/workflow_dispatch:/);
 assert.equal(CONTROL.event_admission.rollout_state,"OWNER_DISPATCH_ONLY_NO_CRON");
 assert.ok(!CONTROL.monitored_repositories["Taghvim-dev/.github"].includes("t0-ci-incident-reconciler"));
 for(const [repo,names] of Object.entries({
  "Taghvim-dev/engine":["public-api-release-observation","t0-private-landing-source-readonly-probe",
   "t0-public-api-readonly-smoke-observation","t0-engine-sandbox-d1-migration",
   "t0-sandbox-http-readonly-route-diagnostic"],
  "Taghvim-dev/landing":["t0-public-landing-readonly-smoke-observation"]
 })){
  for(const name of names)assert.ok(monitoredRun(repo,name),repo+":"+name);
  assert.ok(!CONTROL.monitored_repositories[repo].includes("t0-ci-incident-reconciler"));
 }
});

test("T0 canonical three-file release cohort has exactly one PR/push validation owner",async()=>{
 const fs=await import("node:fs");
 const docs=fs.readFileSync(new URL("../.github/workflows/validate.yml",import.meta.url),"utf8");
 const release=fs.readFileSync(new URL("../.github/workflows/coordinated-public-release.yml",import.meta.url),"utf8");
 const files=["PUBLIC-RELEASE-MATRIX.json","CANONICAL-SOURCE-COHORT.json","T0-CONTROL-MATRIX.json"];
 // Both PR and push trigger blocks must exclude all three coupled source projections
 // from the duplicate docs workflow, without disabling unrelated documents tests.
 for(const file of files){
  const escaped=file.replace(/[.*+?^$\{\}()|[\]\\]/g,"\\$&");
  const re=new RegExp('^\\s{6}- "release/'+escaped+'"\\s*$','gm');
  assert.equal([...docs.matchAll(re)].length,2,"duplicate docs CI path for "+file);
  assert.equal([...release.matchAll(re)].length,2,"canonical release workflow missing "+file);
 }
 assert.match(docs,/name: public-docs-verify/);
 assert.match(release,/name: coordinated-public-release/);
 assert.match(release,/T0 canonical source cohort projection gate \(pre-effect\)/);
 const owned=[...release.matchAll(/^      - "([^"]+)"\s*$/gm)].map(x=>x[1]);
 const names=[...new Set(owned)];
 assert.ok(names.length>=18,"Canonical release ownership scope missing");
 for(const path of names){
  assert.equal(owned.filter(x=>x===path).length,2,"PR/push source ownership split brain: "+path);
  assert.equal(docs.split('      - "'+path+'"').length-1,2,
    "Duplicate docs CI admission or missing source ownership: "+path);
 }

});

test("T0 all-six local pre-review admission is a single canonical deny-by-default CLI",async()=>{
 const {localAdmissionPlan,argumentsFor}=await import("../scripts/t0-development-admission.mjs");
 const expected=["engine","landing","SDK","CLI","cookbooks",".github"];
 for(const repo of expected){
  const opts=repo==="cookbooks"?{sdkRoot:"/controlled/SDK"}:{};
  const steps=localAdmissionPlan(repo,opts);
  assert.ok(steps.length>=2,repo);
  assert.equal(new Set(steps.map(s=>s.name)).size,steps.length,repo);
  for(const s of steps){
   assert.ok(["npm","node","python"].includes(s.command),repo+" unexpected executor");
   const instruction=s.command+" "+s.args.join(" ");
   assert.doesNotMatch(instruction,/wrangler deploy|wrangler d1 migrations apply|npm run deploy(?: |$)/);
   assert.ok(!instruction.includes("production-release"),repo);
  }
 }
 assert.ok(localAdmissionPlan("engine").some(s=>s.args.join(" ")==="run deploy:dry"));
 assert.ok(localAdmissionPlan("landing").some(s=>s.args.join(" ")==="run deploy:dry"));
 assert.ok(localAdmissionPlan("CLI").some(s=>s.name==="public-health-read-only"));
 assert.throws(()=>localAdmissionPlan("cookbooks"),/PEER_SDK_REQUIRED/);
 assert.throws(()=>localAdmissionPlan("outside"),/UNKNOWN_REPOSITORY/);
 assert.throws(()=>argumentsFor(["--repo","engine"]),/REPO_AND_CWD_REQUIRED/);
 assert.throws(()=>argumentsFor(["--repo","engine","--repo","landing","--cwd","."]),/DUPLICATE_ARGUMENT/);
 assert.deepEqual(argumentsFor(["--repo","engine","--cwd","/a"]),{repo:"engine",cwd:"/a",sdkRoot:null});
});
