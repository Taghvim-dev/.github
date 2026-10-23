import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyLandingProductionReceipt} from "../scripts/verify-landing-live-receipt.mjs";

const source=()=>JSON.parse(readFileSync(new URL("../release/PUBLIC-RELEASE-MATRIX.json",import.meta.url)));
const verify=(candidate)=>verifyLandingProductionReceipt({candidate,observed:candidate.post_release_observation_20261023});
test("real Landing 4/4 receipt is admitted without certifying real inbox, payments or GA",()=>{
 const x=source(); assert.doesNotThrow(()=>verify(x));
 assert.equal(x.general_availability_approved,false);
 assert.equal(x.post_release_observation_20261023.landing_new_source.current_production_release.payments_certified,false);
});
test("source, D1, migration, version, run, approval and artifact tampering fail closed",()=>{
 for(const [key,value] of [
 ["source_sha","a".repeat(40)],["source_tree","b".repeat(40)],
 ["workflow_run_id",39956791674],["owner_approval_comment_id",6368971947],
 ["d1_database_id","11111111-1111-1111-1111-111111111111"],
 ["d1_migrations","3/3"],["applied_migration","0003_updates_opt_in.sql"],
 ["production_artifact_sha256","f".repeat(64)],["ga_approved",true],
 ["payments_certified",true],["real_subscriber_email_delivery_certified",true]
 ]){
  const x=source();x.post_release_observation_20261023.landing_new_source.current_production_release[key]=value;
  assert.throws(()=>verify(x),undefined,key);
 }
});
test("production release requires three exact Workers at 100%, real Smoke, and authenticated same-run Sandbox",()=>{
 const x=source();x.post_release_observation_20261023.landing_new_source.current_production_release.workers_at_100_percent.web="x";
 assert.throws(()=>verify(x),/Worker IDs/);
 const y=source();y.post_release_observation_20261023.landing_new_source.current_production_release.sandbox_job="skipped";
 assert.throws(()=>verify(y),/Incomplete real workflow job/);
 const z=source();z.post_release_observation_20261023.landing_new_source.current_production_release.live_smoke_checks.forms_d1_and_comms=false;
 assert.throws(()=>verify(z),/Failed live smoke/);
});
test("missing Landing deployment flags or forged live receipt rejected",()=>{
 for(const value of [null,undefined,"true",1]){
  const x=source();x.post_release_observation_20261023.landing_new_source.production_deployed=value;
  assert.throws(()=>verify(x),/boolean/);
 }
 const x=source();x.post_release_observation_20261023.landing_new_source.production_deployed=false;
 assert.throws(()=>verify(x),/Unreleased Landing/);
});
