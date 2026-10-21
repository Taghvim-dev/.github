import test from "node:test";
import assert from "node:assert/strict";
import {verifyCurrentRelease,attestCurrentRelease} from "../.github/actions/verify-current-source/verify-current-source.mjs";

const engine="a".repeat(40),landing="b".repeat(40),policy="c".repeat(40);
const registrySha="d".repeat(40),testedSHA="e".repeat(40),gitTreeSHA="f".repeat(40);
const release={state:"PREVIEW",contract_version:"2.1.0",general_availability_approved:false,
 source_verification:{date:"2026-10-21",engine_main_merge_sha:engine,landing_main_merge_sha:landing,
 t0_infrastructure_source:{shared_action_sha:policy},
 t0_cross_repo_source_admission:{
   policy_main_sha:policy,cross_repo_immutable_ref:true,post_facto_ga_authorization:false,
   admission_scope:"MUTATION_BLOCKING_SOURCE_ONLY",
   engine_main_sha:engine,engine_ci_run:"12345",engine_reviewed_head:testedSHA,
   landing_main_sha:landing,landing_ci_run:"23456",landing_reviewed_head:"1".repeat(40)},
 latest_checked:{date:"2026-10-21",engine_sha:engine,engine_ci:"12345",
  landing_sha:landing,landing_ci:"23456",sandbox_to_production_status:"NO_GO"}}};
const controls={contract_version:"2.1.0",general_availability_approved:false,
 current_source:{engine_main_sha:engine,landing_main_sha:landing,shared_policy_sha:policy,
  prewrite_source_policy_sha:policy},
 controls:Array.from({length:12},(_,i)=>({id:"T0-"+i}))};
const clone=v=>JSON.parse(JSON.stringify(v));
test("T0 coherent source checks both current repos and immutable shared policies",()=>{
 for(const [repo,sha] of [["Taghvim-dev/engine",engine],["Taghvim-dev/landing",landing]]){
  const result=verifyCurrentRelease({repo,sha,release,controls});
  assert.equal(result.source_sha,sha);assert.equal(result.production_attested,false);
  assert.equal(result.remote_mutations,false);assert.equal(result.control_matrix_sha256.length,64);
 }
});
test("T0 denies source/contract drift, unknown CI, falsified policy hashes and missing PR linkage",()=>{
 const fails=(repo,sha,r,c)=>assert.throws(()=>verifyCurrentRelease({repo,sha,release:r,controls:c}),/T0_SOURCE_ADMISSION_BLOCKED/);
 fails("Taghvim-dev/other",engine,release,controls);
 fails("Taghvim-dev/engine",landing,release,controls);
 {const x=clone(controls);x.current_source.landing_main_sha="2".repeat(40);fails("Taghvim-dev/engine",engine,release,x)}
 {const x=clone(release);x.source_verification.landing_main_merge_sha="2".repeat(40);fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.source_verification.latest_checked.engine_ci="";fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.general_availability_approved=true;fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.source_verification.date="2026-10-20";fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.state="DEPLOYED";fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(controls);x.controls[10].id="T0-1";fails("Taghvim-dev/engine",engine,release,x)}
 {const x=clone(controls);delete x.current_source.shared_policy_sha;
  const y=clone(release);delete y.source_verification.t0_infrastructure_source.shared_action_sha;
  fails("Taghvim-dev/engine",engine,y,x)}
 {const x=clone(controls);x.current_source.prewrite_source_policy_sha="not-a-sha";
  const y=clone(release);y.source_verification.t0_cross_repo_source_admission.policy_main_sha="not-a-sha";
  fails("Taghvim-dev/engine",engine,y,x)}
 {const x=clone(release);x.source_verification.t0_cross_repo_source_admission.engine_ci_run="12346";
  fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.source_verification.t0_cross_repo_source_admission.engine_reviewed_head="not-a-commit";
  fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.source_verification.t0_cross_repo_source_admission.post_facto_ga_authorization=true;
  fails("Taghvim-dev/engine",engine,x,controls)}
});
function fakeApi({ciPatch={},treeOverride={},sourceHead=engine}={}){
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push(url);
  assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");
  assert.equal(opts.headers.authorization,"Bearer test-read-token");
  assert.ok(url.startsWith("https://api.github.com/repos/Taghvim-dev/"));
  if(url.endsWith("/engine/git/ref/heads/main"))
    return {status:200,json:async()=>({ref:"refs/heads/main",object:{type:"commit",sha:sourceHead}})};
  if(url.endsWith("/.github/git/ref/heads/main"))
    return {status:200,json:async()=>({ref:"refs/heads/main",object:{type:"commit",sha:registrySha}})};
  for(const [name,data] of [["PUBLIC-RELEASE-MATRIX.json",release],["T0-CONTROL-MATRIX.json",controls]])
   if(url.endsWith("/"+name+"?ref="+registrySha))
    return {status:200,json:async()=>({type:"file",encoding:"base64",content:Buffer.from(JSON.stringify(data)).toString("base64")})};
  if(url.endsWith("/engine/actions/runs/12345"))
    return {status:200,json:async()=>({id:12345,name:"test",repository:{full_name:"Taghvim-dev/engine"},
     event:"pull_request",status:"completed",conclusion:"success",head_sha:testedSHA,...ciPatch})};
  for(const sha of [engine,testedSHA])
   if(url.endsWith("/engine/git/commits/"+sha))
    return {status:200,json:async()=>({sha,tree:{sha:treeOverride[sha]||gitTreeSHA}})};
  throw Error("Unknown untrusted request "+url);
 };
 return {fetcher,calls};
}
test("T0 reads exact successful CI run and compares complete PR tree against squash main tree",async()=>{
 const api=fakeApi();
 const actual=await attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,token:"test-read-token",fetcher:api.fetcher});
 assert.equal(actual.registry_sha,registrySha);
 assert.equal(actual.source_tree_sha,gitTreeSHA);
 assert.equal(actual.tested_head_sha,testedSHA);
 assert.equal(actual.commit_tree_identity_verified,true);
 assert.equal(actual.tested_ci_status,"completed_success");
 assert.equal(api.calls.length,7);
 assert.equal(api.calls.filter(x=>x.includes("?ref="+registrySha)).length,2);
});
test("T0 blocks success receipts from untested SHAs, failure, wrong workflow/repository and mismatched Git trees",async()=>{
 for(const ciPatch of [
  {status:"in_progress",conclusion:null},{conclusion:"failure"},
  {name:"lint"},{repository:{full_name:"Taghvim-dev/landing"}},{id:999},
  {head_sha:"3".repeat(40)},{event:"workflow_dispatch"}]){
  const {fetcher}=fakeApi({ciPatch});
  await assert.rejects(attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,
   token:"test-read-token",fetcher}),/T0_SOURCE_ADMISSION_BLOCKED/);
 }
 const diverged=fakeApi({treeOverride:{[testedSHA]:"4".repeat(40)}});
 await assert.rejects(attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,
   token:"test-read-token",fetcher:diverged.fetcher}),/T0_SOURCE_ADMISSION_BLOCKED/);
});
test("T0 never accepts a superseded main revision, unavailable CI or absent read token",async()=>{
 const stale=fakeApi({sourceHead:landing});
 await assert.rejects(attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,
  token:"test-read-token",fetcher:stale.fetcher}),/T0_SOURCE_ADMISSION_BLOCKED/);
 assert.equal(stale.calls.length,1);
 await assert.rejects(attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,token:""}),
 /T0_SOURCE_ADMISSION_BLOCKED/);
});
