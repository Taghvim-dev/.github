import test from "node:test";
import assert from "node:assert/strict";
import {verifyCurrentRelease,attestCurrentRelease} from "../.github/actions/verify-current-source/verify-current-source.mjs";
const engine="a".repeat(40),landing="b".repeat(40),policy="c".repeat(40),registrySha="d".repeat(40);
const release={state:"PREVIEW",contract_version:"2.1.0",general_availability_approved:false,
 source_verification:{date:"2026-10-21",engine_main_merge_sha:engine,landing_main_merge_sha:landing,
 t0_infrastructure_source:{shared_action_sha:policy},
 latest_checked:{date:"2026-10-21",engine_sha:engine,engine_ci:"12345",
  landing_sha:landing,landing_ci:"23456",sandbox_to_production_status:"NO_GO"}}};
const controls={contract_version:"2.1.0",general_availability_approved:false,
 current_source:{engine_main_sha:engine,landing_main_sha:landing,shared_policy_sha:policy},
 controls:Array.from({length:11},(_,i)=>({id:"T0-"+i}))};
const clone=v=>JSON.parse(JSON.stringify(v));
test("T0 coherent current main checks both source repositories and one canonical policy",()=>{
 for(const [repo,sha] of [["Taghvim-dev/engine",engine],["Taghvim-dev/landing",landing]]){
  const result=verifyCurrentRelease({repo,sha,release,controls});
  assert.equal(result.source_sha,sha);assert.equal(result.production_attested,false);
  assert.equal(result.remote_mutations,false);assert.ok(result.control_matrix_sha256.length===64);
 }
});
test("T0 rejects stale SHA, cross-repo drift, fabricated CI/GA and invalid policy",()=>{
 const fails=(repo,sha,r,c)=>assert.throws(()=>verifyCurrentRelease({repo,sha,release:r,controls:c}),
 /T0_SOURCE_ADMISSION_BLOCKED/);
 fails("Taghvim-dev/other",engine,release,controls);
 fails("Taghvim-dev/engine",landing,release,controls);
 {const x=clone(controls);x.current_source.landing_main_sha="e".repeat(40);fails("Taghvim-dev/engine",engine,release,x)}
 {const x=clone(release);x.source_verification.landing_main_merge_sha="f".repeat(40);fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.source_verification.latest_checked.engine_ci="";fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.general_availability_approved=true;fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.source_verification.date="2026-10-20";fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(release);x.state="PRODUCTION_DEPLOYED";fails("Taghvim-dev/engine",engine,x,controls)}
 {const x=clone(controls);x.controls[10].id="T0-1";fails("Taghvim-dev/engine",engine,release,x)}
});
test("T0 must first pin the current component main, then read both ledgers from one immutable registry commit",async()=>{
 const seen=[];
 const fetcher=async(url,opts)=>{
  seen.push(url);assert.equal(opts.method,"GET");assert.equal(opts.redirect,"error");
  assert.equal(opts.headers.authorization,"Bearer test-read-token");
  if(url.endsWith("/engine/git/ref/heads/main"))
   return {status:200,json:async()=>({ref:"refs/heads/main",object:{type:"commit",sha:engine}})};
  if(url.endsWith("/.github/git/ref/heads/main"))
   return {status:200,json:async()=>({ref:"refs/heads/main",object:{type:"commit",sha:registrySha}})};
  for(const [path,data] of [["PUBLIC-RELEASE-MATRIX.json",release],["T0-CONTROL-MATRIX.json",controls]])
   if(url.endsWith("/"+path+"?ref="+registrySha))
    return {status:200,json:async()=>({type:"file",encoding:"base64",content:Buffer.from(JSON.stringify(data)).toString("base64")})};
  throw Error("untrusted outbound destination "+url);
 };
 const actual=await attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,token:"test-read-token",fetcher});
 assert.equal(actual.registry_sha,registrySha);assert.equal(seen.length,4);
 assert.equal(seen.filter(x=>x.includes("?ref="+registrySha)).length,2);
 assert.ok(seen.every(x=>x.startsWith("https://api.github.com/repos/Taghvim-dev/")));
});
test("T0 fails closed before ledger read on superseded main and on inaccessible registry",async()=>{
 let calls=0;
 await assert.rejects(attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,token:"test-read-token",
  fetcher:async()=>{calls++;return{status:200,json:async()=>({ref:"refs/heads/main",object:{type:"commit",sha:landing}})}}}),
 /T0_SOURCE_ADMISSION_BLOCKED/);
 assert.equal(calls,1);
 await assert.rejects(attestCurrentRelease({repo:"Taghvim-dev/engine",sha:engine,token:""}),
 /T0_SOURCE_ADMISSION_BLOCKED/);
});
