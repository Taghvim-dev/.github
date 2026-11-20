import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectSourceCohort,verifySourceCohort} from "../scripts/reconcile-source-cohort.mjs";
const load=p=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
const cohort=load("release/CANONICAL-SOURCE-COHORT.json");
const release=load("release/PUBLIC-RELEASE-MATRIX.json");
const controls=load("release/T0-CONTROL-MATRIX.json");
const copy=x=>JSON.parse(JSON.stringify(x));

test("T0 canonical cohort binds exact squash-main SHA and independently tested PR head",()=>{
 const proof=verifySourceCohort(cohort,release,controls);
 assert.equal(proof.canonical,true);
 const review=release.source_verification.t0_cross_repo_source_admission;
 assert.equal(cohort.engine.sha,controls.current_source.engine_main_sha);
 assert.equal(cohort.engine.sha,review.engine_main_sha);
 assert.equal(review.engine_reviewed_head,cohort.engine.reviewed_sha);
 assert.notEqual(cohort.engine.reviewed_sha,cohort.engine.sha);
 assert.equal(cohort.engine.ci,review.engine_ci_run);
 for(const [id,field] of [
  ["T0-PREWRITE-012","dependent_component_ci"],
  ["T0-CI-BOUND-013","component_source_ci"],
  ["T0-PACKAGES-014","dependent_component_ci"]
 ])assert.equal(controls.controls.find(x=>x.id===id)[field].engine,cohort.engine.ci);
 assert.equal(release.package_identity.engine.commit,cohort.engine.sha);
 assert.equal(release.package_identity.engine.ci,cohort.engine.ci);
 assert.equal(release.general_availability_approved,false);
 assert.equal(controls.general_availability_approved,false);
});

test("T0 one-source cohort rejects tampered main, CI, reviewed SHA, or derived projection",()=>{
 for(const field of ["sha","reviewed_sha","ci"]){
  const bad=copy(cohort);
  bad.engine[field]=field==="ci"?"1234":"f".repeat(40);
  assert.throws(()=>verifySourceCohort(bad,release,controls),/T0_COHORT_BLOCKED/);
 }
 const badControls=copy(controls);
 badControls.controls.find(x=>x.id==="T0-PACKAGES-014").dependent_component_ci.engine="321";
 assert.throws(()=>verifySourceCohort(cohort,release,badControls),/T0_COHORT_BLOCKED/);
 const wrong=copy(release);
 wrong.general_availability_approved=true;
 assert.throws(()=>projectSourceCohort(cohort,wrong,controls),/T0_COHORT_BLOCKED/);
});
