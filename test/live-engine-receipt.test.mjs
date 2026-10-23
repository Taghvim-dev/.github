import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyEngineProductionReceipt} from "../scripts/verify-engine-live-receipt.mjs";

const load=path=>JSON.parse(readFileSync(new URL("../release/"+path,import.meta.url)));
const original=()=>({candidate:load("PUBLIC-RELEASE-MATRIX.json"),t0:load("T0-CONTROL-MATRIX.json")});
const check=({candidate,t0})=>verifyEngineProductionReceipt({observed:candidate.post_release_observation_20261023,candidate,t0});

test("valid source-admitted 0010 production receipt passes without certifying GA",()=>{
 const x=original();assert.doesNotThrow(()=>check(x));
 assert.equal(x.candidate.general_availability_approved,false);
});
test("self-consistent arbitrary live controller SHA cannot replace independently tested main",()=>{
 const x=original(),sha="a".repeat(40);
 x.candidate.post_release_observation_20261023.engine_new_source.sha=sha;
 x.candidate.post_release_observation_20261023.engine_new_source.current_production_release.controller_commit=sha;
 assert.throws(()=>check(x),/independently admitted/);
});
test("receipt must bind T0 main, prewrite admission and canonical source CI",()=>{
 const x=original();x.t0.current_source.engine_main_sha="b".repeat(40);
 assert.throws(()=>check(x),/T0 current-main/);
 const y=original();y.candidate.source_verification.t0_cross_repo_source_admission.engine_main_sha="c".repeat(40);
 assert.throws(()=>check(y),/prewrite admission/);
 const z=original();z.candidate.post_release_observation_20261023.engine_new_source.ci_run="999999";
 assert.throws(()=>check(z),/canonical tested CI/);
});
test("production D1 identity, applied migration, ledger and pinned registry are checked",()=>{
 for(const [key,value] of [["d1_database_name","other-database"],["d1_database_id","11111111-1111-1111-1111-111111111111"],["migration_applied","0009_previous.sql"],["d1_migrations","9/9"]]){
  const x=original();
  x.candidate.post_release_observation_20261023.engine_new_source.current_production_release[key]=value;
  assert.throws(()=>check(x),undefined,"Must reject modified "+key);
 }
 const x=original();x.t0.production_d1_identity.database_id="11111111-1111-1111-1111-111111111111";
 assert.throws(()=>check(x),/identity pin changed/);
});
test("missing, string and ambiguous deployment flags fail closed",()=>{
 for(const value of [undefined,"true",null,1]){
  const x=original();
  x.candidate.post_release_observation_20261023.engine_new_source.production_deployed=value;
  delete x.candidate.post_release_observation_20261023.engine_new_source.current_production_release;
  assert.throws(()=>check(x),/must be a boolean/);
 }
 const x=original();x.candidate.post_release_observation_20261023.engine_new_source.production_deployed=false;
 assert.throws(()=>check(x),/Unreleased Engine cannot carry/);
});
test("both required CI workflows execute receipt and source/runtime suites",()=>{
 const coordinated=readFileSync(new URL("../.github/workflows/coordinated-public-release.yml",import.meta.url),"utf8");
 const validate=readFileSync(new URL("../.github/workflows/validate.yml",import.meta.url),"utf8");
 for(const file of ["test/source-runtime-separation-20261023.test.mjs","test/live-engine-receipt.test.mjs"]){
  assert.ok(coordinated.includes(" "+file),"coordinated CI must execute "+file);
  assert.ok(validate.includes(" "+file),"docs CI must execute "+file);
  assert.equal(coordinated.split('"'+file+'"').length-1,2,"Both path filters must include "+file);
 }
 assert.equal(coordinated.split('".github/workflows/validate.yml"').length-1,2,"validate.yml edits must trigger coordinated release");
});
