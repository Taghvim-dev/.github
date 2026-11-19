import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectSourceCohort,verifySourceCohort} from "../scripts/reconcile-source-cohort.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
const cohort=read("release/CANONICAL-SOURCE-COHORT.json");
const pub=read("release/PUBLIC-RELEASE-MATRIX.json");
const ctrl=read("release/T0-CONTROL-MATRIX.json");
test("T0 one release cohort derives all Engine and Landing SHA and CI mirrors",()=>{
 assert.equal(verifySourceCohort(cohort,pub,ctrl).canonical,true);
 const projected=projectSourceCohort(cohort,pub,ctrl);
 assert.deepEqual(projected.release,pub);assert.deepEqual(projected.controls,ctrl);
 assert.equal(projected.release.general_availability_approved,false);
 assert.equal(projected.controls.general_availability_approved,false);
});
test("T0 historical deployment receipts and inputs are immutable",()=>{
 const before=JSON.stringify(pub),ctrlBefore=JSON.stringify(ctrl);
 const projected=projectSourceCohort(cohort,pub,ctrl);
 assert.deepEqual(projected.release.deployment_observation,pub.deployment_observation);
 assert.equal(JSON.stringify(pub),before);assert.equal(JSON.stringify(ctrl),ctrlBefore);
});
test("T0 drift, bad CI, payments or retrospective authority all fail before effects",()=>{
 for(const name of ["engine_sha","landing_sha","engine_ci","landing_ci"]){
  const changed=JSON.parse(JSON.stringify(pub));
  changed.source_verification.latest_checked[name]="0";
  assert.throws(()=>verifySourceCohort(cohort,changed,ctrl),/T0_COHORT_BLOCKED/);
 }
 for(const invalid of ["engine","landing"]){
  const c=JSON.parse(JSON.stringify(cohort));c[invalid].ci="";
  assert.throws(()=>projectSourceCohort(c,pub,ctrl),/T0_COHORT_BLOCKED/);
 }
 const paid=JSON.parse(JSON.stringify(cohort));paid.payment_enabled=true;
 assert.throws(()=>projectSourceCohort(paid,pub,ctrl),/T0_COHORT_BLOCKED/);
 const historical=JSON.parse(JSON.stringify(ctrl));historical.current_source.engine_main_sha="0".repeat(40);
 assert.throws(()=>verifySourceCohort(cohort,pub,historical),/T0_COHORT_BLOCKED/);
});
