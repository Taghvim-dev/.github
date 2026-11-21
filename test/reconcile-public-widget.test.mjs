import {test} from "node:test";
import assert from "node:assert/strict";
import {buildCandidate,buildCoupledCandidate,sourcesAreConsistent,canResetOrFastForwardBotBranch,attestPrivateSourceCohort,deriveCanonicalPublicSource,privateSourceReadAdmission} from "../scripts/reconcile-public-widget.mjs";
const a="a".repeat(40), b="b".repeat(40),c="c".repeat(40);
function matrix(){return {
 state:"PREVIEW",general_availability_approved:false,contract_version:"2.1.0",
 repositories:[{name:"SDK",commit:a,ci_run:"11"},{name:"CLI",commit:c,ci_run:"14"},{name:"cookbooks",commit:b,ci_run:"12"}],
 package_identity:{SDK:{commit:a,ci:"11"},CLI:{commit:c,ci:"14"},cookbooks:{commit:b,ci:"12",sdk_source_commit:a}}
};}
test("T0 canonical projection binds both underlying OpenAPI hash and actual public index Git blob SHA",async()=>{
 const {readFileSync}=await import("node:fs");
 const cohort=JSON.parse(readFileSync(new URL("../release/CANONICAL-SOURCE-COHORT.json",import.meta.url)));
 const index=JSON.parse(readFileSync(new URL("../contracts/operation-index.json",import.meta.url)));
 const candidate=deriveCanonicalPublicSource({
  sha:cohort.public_contract.operation_index_git_blob_sha,data:index
 });
 assert.deepEqual(candidate,cohort.public_contract,
  "Unchanged canonical public artifacts MUST be CURRENT, never source-drift failures");
 assert.equal(candidate.operation_count,index.operations.length);
 assert.equal(candidate.openapi_git_blob_sha,index.openApiGitBlobSHA);
 assert.throws(()=>deriveCanonicalPublicSource({data:index}),/universal public operation authority/);
 assert.throws(()=>deriveCanonicalPublicSource({sha:"a".repeat(40),data:{...index,operations:[]}}),/universal public operation authority/);
 assert.throws(()=>deriveCanonicalPublicSource({sha:"a".repeat(40),
  data:{...index,operations:[...index.operations,index.operations[0]]}}),
  /universal public operation authority/);
});

test("no source drift creates no PR or GitHub writes",()=>{
 const r=buildCandidate(matrix(),{sdk:a,sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a});
 assert.equal(r.status,"CURRENT");assert.equal(r.candidate,null);
});
test("a reviewed new SDK/cookbook source updates both canonical pins and preserves NO_GA",()=>{
 const before=matrix();
 const r=buildCandidate(before,{sdk:c,sdkCi:55,cookbooks:b,cookbooksCi:32,cookbooksSdkPin:c});
 assert.equal(r.status,"PR_REQUIRED");
 assert.equal(r.candidate.repositories[0].commit,c);
 assert.equal(r.candidate.package_identity.SDK.ci,"55");
 assert.equal(r.candidate.package_identity.cookbooks.sdk_source_commit,c);
 assert.equal(r.candidate.general_availability_approved,false);
 assert.equal(before.repositories[0].commit,a);
});
test("drift between cookbook declared SDK and source-of-truth SDK blocks reconciliation",()=>{
 const r=buildCandidate(matrix(),{sdk:c,sdkCi:22,cookbooks:b,cookbooksCi:33,cookbooksSdkPin:a});
 assert.equal(r.status,"BLOCKED_CROSS_REPO_SOURCE_DRIFT");assert.equal(r.candidate,null);
});
test("malformed SHAs, absent CI proof, and unapproved GA fail closed",()=>{
 assert.throws(()=>buildCandidate({...matrix(),general_availability_approved:true},{sdk:a,sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a}));
 assert.throws(()=>buildCandidate(matrix(),{sdk:"main",sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a}));
 assert.throws(()=>buildCandidate(matrix(),{sdk:a,sdkCi:0,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a}));
});

test("interrupted reconciler only resets its own matrix-only commits, never an unknown actor or open PR",()=>{
 const bot={commit:{message:"reconcile(t0): public SDK and Cookbook reviewed source candidate"},author:{login:"github-actions[bot]"}};
 const base={status:"diverged",ahead_by:1,files:[{filename:"release/PUBLIC-RELEASE-MATRIX.json"}],commits:[bot]};
 assert.equal(canResetOrFastForwardBotBranch(base),"bot_branch_reset");
 assert.equal(canResetOrFastForwardBotBranch({...base,status:"behind",ahead_by:0,files:[],commits:[]}),"fast_forward");
 assert.equal(canResetOrFastForwardBotBranch({...base,files:[{filename:"scripts/unsafe.mjs"}]}),null);
 assert.equal(canResetOrFastForwardBotBranch({...base,commits:[{...bot,author:{login:"another-contributor"}}]}),null);
 assert.equal(canResetOrFastForwardBotBranch({...base,ahead_by:999}),null);
 assert.equal(canResetOrFastForwardBotBranch({}),null);
});

function fullLedger(){
 const m=matrix();
 m.source_verification={latest_checked:{engine_sha:a,landing_sha:b},
 widget_sdk_api_integration_20261023:{sdk_main_sha:a,sdk_main_ci_run:"11",cookbook_main_sha:b,cookbook_main_ci_run:"12"}};
 m.post_release_observation_20261023={
   sdk_current_source_commit:a,sdk_current_main_ci_run:"11",
   cli_current_source_commit:c,cli_current_main_ci_run:"14",
   cookbooks_current_source_commit:b,cookbooks_current_main_ci_run:"12",
   engine_production:{source_sha:"immutable_remote_original"}
 };
 const ctrl={contract_version:"2.1.0",general_availability_approved:false,
   current_source:{engine_main_sha:a,landing_main_sha:b},
   controls:[{id:"T0-PACKAGES-014",dependent_component_ci:{engine:"88",landing:"99",SDK:"11",CLI:"14",cookbooks:"12"}}],
   post_release_observation_20261023:structuredClone(m.post_release_observation_20261023)
 };
 return {m,ctrl};
}
test("all SDK/Cookbook source mirrors change together in BOTH ledgers, without rewriting historic runtime",()=>{
 const {m,ctrl}=fullLedger();
 const args={sdk:c,sdkCi:55,cookbooks:b,cookbooksCi:32,cookbooksSdkPin:c};
 const plan=buildCoupledCandidate(m,ctrl,args);
 assert.equal(plan.status,"PR_REQUIRED");
 const w=plan.registry.source_verification.widget_sdk_api_integration_20261023;
 assert.equal(w.sdk_main_sha,c);assert.equal(w.sdk_main_ci_run,"55");assert.equal(w.cookbook_main_ci_run,"32");
 for(const k of ["sdk_current_source_commit","sdk_current_main_ci_run","cookbooks_current_source_commit","cookbooks_current_main_ci_run"])
   assert.equal(plan.registry.post_release_observation_20261023[k],
     plan.controls.post_release_observation_20261023[k],k+" ledger split-brain");
 assert.equal(plan.controls.controls[0].dependent_component_ci.SDK,"55");
 assert.equal(plan.controls.controls[0].dependent_component_ci.cookbooks,"32");
 assert.equal(plan.registry.post_release_observation_20261023.engine_production.source_sha,
  "immutable_remote_original");
 assert.equal(ctrl.controls[0].dependent_component_ci.SDK,"11","must not mutate original");
 assert.equal(m.repositories[0].commit,a,"must not mutate source registry");
 assert.equal(plan.registry.general_availability_approved,false);
});
test("out-of-date Engine/Landing source mirrors are a harmless preflight block, not a CI-failing review PR",()=>{
 const {m,ctrl}=fullLedger();
 assert.equal(sourcesAreConsistent(m,ctrl,a,b),true);
 assert.equal(sourcesAreConsistent(m,ctrl,c,b),false);
 assert.equal(sourcesAreConsistent(m,{...ctrl,current_source:{engine_main_sha:c,landing_main_sha:b}},a,b),false);
 assert.equal(sourcesAreConsistent(m,ctrl,"main",b),false);
});
test("missing second ledger, ambiguous controls, or unauthorized GA never create release candidates",()=>{
 const {m,ctrl}=fullLedger();
 const args={sdk:c,sdkCi:55,cookbooks:b,cookbooksCi:32,cookbooksSdkPin:c};
 assert.throws(()=>buildCoupledCandidate(m,{...ctrl,post_release_observation_20261023:null},args));
 assert.throws(()=>buildCoupledCandidate(m,{...ctrl,general_availability_approved:true},args));
 assert.throws(()=>buildCoupledCandidate({...m,post_release_observation_20261023:null},ctrl,args));
});
test("interrupted bot branch may only contain two expected matrix files",()=>{
 const bot={commit:{message:"reconcile(t0): public SDK and Cookbook reviewed source candidate"},author:{login:"github-actions[bot]"}};
 assert.equal(canResetOrFastForwardBotBranch({status:"ahead",ahead_by:2,
   files:[{filename:"release/PUBLIC-RELEASE-MATRIX.json"},{filename:"release/T0-CONTROL-MATRIX.json"}],
   commits:[bot,bot]}),"bot_branch_reset");
 assert.equal(canResetOrFastForwardBotBranch({status:"ahead",ahead_by:1,
   files:[{filename:".github/workflows/unsafe.yml"}],commits:[bot]}),null);
 assert.equal(canResetOrFastForwardBotBranch({status:"ahead",ahead_by:1,
   files:[{filename:"release/PUBLIC-RELEASE-MATRIX.json"},
    {filename:"release/T0-CONTROL-MATRIX.json"},
    {filename:"contracts/operation-index.json"}],
   commits:[{...bot,commit:{message:"reconcile(t0): atomic SDK CLI Cookbook canonical source evidence"}}]}),
  "bot_branch_reset");
});

test("one commit contains both release matrices",async()=>{
 const {readFileSync}=await import("node:fs");
 const src=readFileSync(new URL("../scripts/reconcile-public-widget.mjs",import.meta.url),"utf8");
 assert.ok(src.includes('base_tree:base.tree.sha'));
 assert.ok(src.includes('parents:[root]'));
 assert.ok(src.includes('plan.registry??canonical.data'));
 assert.ok(src.includes('projectSourceCohort(nextSource'));
 assert.ok(src.includes('["release/CANONICAL-SOURCE-COHORT.json",nextSource]'));
 assert.ok(src.includes('plan.controls??control.data'));
 assert.ok(src.includes('["contracts/operation-index.json",indexes[0]]'));
 assert.ok(src.includes('const indexDrift=JSON.stringify(centralIndex.data)!==JSON.stringify(indexes[0])'));
 assert.ok(src.indexOf("if(!process.env.TAGHVIM_PRIVATE_SOURCE_READ_TOKEN)")<
  src.indexOf("const files=["),"private head freshness must predate any atomic source tree write");

});

test("CURRENT is decided from both ledgers, not only primary SDK/Cookbook source pins",()=>{
 const {m,ctrl}=fullLedger();
 const args={sdk:a,sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a};
 const actual=buildCoupledCandidate(m,ctrl,args);
 assert.equal(actual.status,"CURRENT");
 assert.equal(actual.registry,null);
 assert.equal(actual.controls,null);

 // Historical failure: primary package pins match but control CI is stale.
 const staleControl=structuredClone(ctrl);
 staleControl.controls[0].dependent_component_ci.SDK="old-run";
 const fixControl=buildCoupledCandidate(m,staleControl,args);
 assert.equal(fixControl.status,"PR_REQUIRED");
 assert.equal(fixControl.controls.controls[0].dependent_component_ci.SDK,"11");
 assert.equal(fixControl.registry.repositories[0].commit,a);
 assert.equal(staleControl.controls[0].dependent_component_ci.SDK,"old-run");

 // Also reconcile an isolated Widget operation source mirror drift.
 const staleWidget=structuredClone(m);
 staleWidget.source_verification.widget_sdk_api_integration_20261023.sdk_main_ci_run="unverified";
 const fixWidget=buildCoupledCandidate(staleWidget,ctrl,args);
 assert.equal(fixWidget.status,"PR_REQUIRED");
 assert.equal(fixWidget.registry.source_verification.widget_sdk_api_integration_20261023.sdk_main_ci_run,"11");

 // Also reconcile stale read-only observation mirrors in either ledger.
 const staleObs=structuredClone(ctrl);
 staleObs.post_release_observation_20261023.cookbooks_current_source_commit=c;
 const fixObs=buildCoupledCandidate(m,staleObs,args);
 assert.equal(fixObs.status,"PR_REQUIRED");
 assert.equal(fixObs.controls.post_release_observation_20261023.cookbooks_current_source_commit,b);
});
test("SDK cookbook source mismatch blocks all coupled ledger mutation even when primary pins appear current",()=>{
 const {m,ctrl}=fullLedger();
 const p=buildCoupledCandidate(m,ctrl,{sdk:a,sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:c});
 assert.equal(p.status,"BLOCKED_CROSS_REPO_SOURCE_DRIFT");
 assert.equal(p.controls,null);
});

test("central reviewed Cohort replaces an unprovisioned private-source token without bypassing T0",async()=>{
 const {readFileSync}=await import("node:fs");
 const read=p=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
 const cohort=read("release/CANONICAL-SOURCE-COHORT.json");
 const release=read("release/PUBLIC-RELEASE-MATRIX.json");
 const controls=read("release/T0-CONTROL-MATRIX.json");
 const attested=attestPrivateSourceCohort(cohort,release,controls);
 assert.equal(attested.status,"COHORT_PROJECTION_ONLY_NOT_PRIVATE_HEAD_VERIFIED");
 assert.equal(attested.engine,cohort.engine.sha);
 assert.equal(attested.landing,cohort.landing.sha);
 assert.equal(attested.ga_approved,false);
 assert.equal(attested.private_refs_read,false);
});

test("forged, unreviewed or stale cross-repo private Cohort always fails BEFORE a PR",async()=>{
 const {readFileSync}=await import("node:fs");
 const read=p=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
 const cohort=read("release/CANONICAL-SOURCE-COHORT.json");
 const release=read("release/PUBLIC-RELEASE-MATRIX.json");
 const controls=read("release/T0-CONTROL-MATRIX.json");
 const copy=x=>structuredClone(x);
 for(const kind of ["sha","ci","reviewed_sha"]){
  const bad=copy(cohort);bad.engine[kind]=kind==="ci"?"999":"f".repeat(40);
  assert.throws(()=>attestPrivateSourceCohort(bad,release,controls),/T0_PUBLIC_WIDGET_RECONCILE_BLOCKED/);
 }
 const badRelease=copy(release);badRelease.source_verification.latest_checked.engine_sha="f".repeat(40);
 assert.throws(()=>attestPrivateSourceCohort(cohort,badRelease,controls),/T0_PUBLIC_WIDGET_RECONCILE_BLOCKED/);
 const badControls=copy(controls);badControls.controls.find(x=>x.id==="T0-PACKAGES-014").dependent_component_ci.engine="0";
 assert.throws(()=>attestPrivateSourceCohort(cohort,release,badControls),/T0_PUBLIC_WIDGET_RECONCILE_BLOCKED/);
 const fraudulentGA=copy(cohort);fraudulentGA.ga_approved=true;
 assert.throws(()=>attestPrivateSourceCohort(fraudulentGA,release,controls),/T0_PUBLIC_WIDGET_RECONCILE_BLOCKED/);
});

test("T0 cannot create a source PR without fresh private HEADs and matching SDK CLI Cookbook indices",async()=>{
 const {readFileSync}=await import("node:fs");
 const script=readFileSync(new URL("../scripts/reconcile-public-widget.mjs",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("../.github/workflows/t0-public-widget-sdk-reconciler.yml",import.meta.url),"utf8");
 assert.match(script,/BLOCKED_PRIVATE_HEAD_READ_AUTHORITY/);
 assert.match(script,/BLOCKED_PRIVATE_HEAD_DRIFT/);
 assert.match(script,/BLOCKED_PUBLIC_CONTRACT_DRIFT/);
 assert.ok(script.indexOf("if(!process.env.TAGHVIM_PRIVATE_SOURCE_READ_TOKEN)")<
  script.indexOf("const pulls=await gh("),"private HEAD gate must predate any PR or branch write");
 assert.match(script,/head\("Taghvim-dev\/engine"\),head\("Taghvim-dev\/landing"\)/);
 assert.match(script,/head\("Taghvim-dev\/SDK"\),head\("Taghvim-dev\/CLI"\)/);
 assert.match(script,/content\("Taghvim-dev\/CLI","contracts\/operation-index.json",cli\)/);
 assert.ok(script.includes('const publicRepos=["Taghvim-dev/.github","Taghvim-dev/SDK","Taghvim-dev/CLI","Taghvim-dev/cookbooks"]'));
 assert.ok(workflow.includes("TAGHVIM_PRIVATE_SOURCE_READ_TOKEN:"));
 assert.ok(!workflow.includes("CLOUDFLARE_API_TOKEN"));
 assert.ok(workflow.includes("  push:"));
});
test("CLI and source OpenAPI contract drift reconcile atomically without touching private historical receipts",()=>{
 const {m,ctrl}=fullLedger();
 m.openapi_source_git_blob_sha="a".repeat(40);
 m.required_public_operation_count=47;
 const p=buildCoupledCandidate(m,ctrl,{
  sdk:a,sdkCi:11,cli:c,cliCi:55,cookbooks:b,cookbooksCi:12,
  cookbooksSdkPin:a,contractBlob:"b".repeat(40),publicOps:56
 });
 assert.equal(p.status,"PR_REQUIRED");
 assert.equal(p.registry.openapi_source_git_blob_sha,"b".repeat(40));
 assert.equal(p.registry.required_public_operation_count,56);
 assert.equal(p.registry.package_identity.CLI.ci,"55");
 assert.equal(p.registry.post_release_observation_20261023.cli_current_main_ci_run,"55");
 assert.equal(p.controls.post_release_observation_20261023.cli_current_main_ci_run,"55");
 assert.equal(p.controls.controls[0].dependent_component_ci.CLI,"55");
 assert.deepEqual(p.registry.post_release_observation_20261023.engine_production,
  m.post_release_observation_20261023.engine_production);
 assert.equal(m.openapi_source_git_blob_sha,"a".repeat(40));
 assert.equal(m.general_availability_approved,false);
});

test("T0 release source reconciler updates cohort + projections + optional OpenAPI in one commit",async()=>{
 const {readFileSync}=await import("node:fs");
 const s=readFileSync(new URL("../scripts/reconcile-public-widget.mjs",import.meta.url),"utf8");
 for(const path of ["release/CANONICAL-SOURCE-COHORT.json","release/PUBLIC-RELEASE-MATRIX.json",
  "release/T0-CONTROL-MATRIX.json","contracts/operation-index.json"])
  assert.ok(s.includes(path));
 assert.ok(s.indexOf("const [engineNow,landingNow")<s.indexOf("const files=["));
 assert.match(s,/BLOCKED_PRIVATE_HEAD_DRIFT/);
});

test("T0 no private read broker never reports complete source reconciliation",()=>{
 const absent=privateSourceReadAdmission("");
 assert.deepEqual(absent,{status:"BLOCKED_CROSS_REPO_AUTH",writes:0,
  ga_approved:false,private_head_verified:false});
 const candidate=privateSourceReadAdmission("installation-token-present");
 assert.equal(candidate.status,"REQUIRE_INDEPENDENT_PRIVATE_HEAD_READS");
 assert.equal(candidate.private_head_verified,false,"token is NOT independent GitHub HEAD evidence");
});
test("T0 short-lived GitHub App broker is SHA-pinned and read-only for exactly private repos",async()=>{
 const {readFileSync}=await import("node:fs");
 const w=readFileSync(new URL("../.github/workflows/t0-public-widget-sdk-reconciler.yml",import.meta.url),"utf8");
 assert.match(w,/actions\/create-github-app-token@f418cff399f7aef4c2f0ad47e25ca7a6abbdd6fc/);
 for(const n of ["engine","landing"])assert.ok(w.includes("            "+n+"\n"));
 for(const key of ["contents","actions"])assert.ok(w.includes("permission-"+key+": read"));
 assert.ok(w.includes("TAGHVIM_PRIVATE_SOURCE_READ_TOKEN: "+"$"+"{{ steps.private_source_token.outputs.token }}"));
 assert.ok(!w.includes("TAGHVIM_PRIVATE_SOURCE_READ_TOKEN: "+"$"+"{{ secrets."));
});
