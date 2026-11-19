import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolvePins} from "../scripts/release-pins.mjs";
const candidate=JSON.parse(readFileSync(new URL("../release/PUBLIC-RELEASE-MATRIX.json",import.meta.url),"utf8"));
const copy=()=>JSON.parse(JSON.stringify(candidate));
test("T0 sibling checkout pins derive exclusively from the candidate release matrix",()=>{
 const refs=resolvePins(candidate);
 assert.deepEqual(Object.keys(refs).sort(),["cli","cookbooks","sdk"]);
 assert.equal(refs.sdk,candidate.repositories.find(x=>x.name==="SDK").commit);
 assert.equal(refs.cookbooks,candidate.repositories.find(x=>x.name==="cookbooks").commit);
});
test("T0 fail-closed SHA/CI/duplicate/renamed source pin admission",()=>{
 const cases=[];
 {const x=copy();x.repositories[2].commit="0".repeat(40);cases.push(x)}
 {const x=copy();x.repositories.push({...x.repositories[0]});cases.push(x)}
 {const x=copy();x.repositories[0].commit="main";cases.push(x)}
 {const x=copy();x.repositories[0].ci_run="";cases.push(x)}
 {const x=copy();x.package_identity.CLI.ci="123";cases.push(x)}
 {const x=copy();x.repositories[1].name="SDK";cases.push(x)}
 {const x=copy();x.contract_version="2.0.0";cases.push(x)}
 for(const x of cases)assert.throws(()=>resolvePins(x),/T0/);
});

test("T0 non-payment GA release matrix and every current source mirror reconcile atomically",()=>{
 const control=JSON.parse(readFileSync(new URL("../release/T0-CONTROL-MATRIX.json",import.meta.url),"utf8"));
 const verified=candidate.source_verification.latest_checked;
 const source=candidate.source_verification;
 assert.equal(source.engine_main_merge_sha,verified.engine_sha);
 assert.equal(source.landing_main_merge_sha,verified.landing_sha);
 assert.equal(source.t0_cross_repo_source_admission.engine_main_sha,verified.engine_sha);
 assert.equal(source.t0_cross_repo_source_admission.landing_main_sha,verified.landing_sha);
 assert.equal(source.t0_cross_repo_source_admission.engine_ci_run,verified.engine_ci);
 assert.equal(source.t0_cross_repo_source_admission.landing_ci_run,verified.landing_ci);
 assert.equal(control.current_source.engine_main_sha,verified.engine_sha);
 assert.equal(control.current_source.landing_main_sha,verified.landing_sha);
 assert.equal(candidate.package_identity.engine.commit,verified.engine_sha);
 assert.equal(candidate.package_identity.landing.commit,verified.landing_sha);
 for(const [key,ci] of [["engine",verified.engine_ci],["landing",verified.landing_ci]]){
  assert.equal(candidate.package_identity[key].ci,ci);
  for(const rule of control.controls){
   if(rule.dependent_component_ci?.[key]) assert.equal(rule.dependent_component_ci[key],ci);
   if(rule.component_source_ci?.[key]) assert.equal(rule.component_source_ci[key],ci);
  }
 }
 assert.equal(candidate.general_availability_approved,false);
 assert.equal(control.general_availability_approved,false);
 assert.equal(candidate.nonpayment_ga_scope.state,"SOURCE_TESTED_RUNTIME_NO_GO");
 assert.equal(candidate.nonpayment_ga_scope.customer_checkout_enabled,false);
 assert.equal(control.nonpayment_ga_scope.paid_checkout_enabled,false);
 assert.equal(control.controls.filter(x=>x.id==="T0-GA-NONPAYMENT-017").length,1);
 assert.equal(control.controls.find(x=>x.id==="T0-GA-NONPAYMENT-017").live_evidence,null);
});
