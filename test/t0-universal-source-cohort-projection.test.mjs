import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectSourceCohort} from "../scripts/reconcile-source-cohort.mjs";
const data=path=>JSON.parse(readFileSync(new URL("../"+path,import.meta.url),"utf8"));
const source=data("release/CANONICAL-SOURCE-COHORT.json");
const release=data("release/PUBLIC-RELEASE-MATRIX.json");
const controls=data("release/T0-CONTROL-MATRIX.json");
test("T0 one six-repository source and exact CI generates every nested source projection",()=>{
 const projected=projectSourceCohort(source,release,controls);
 assert.deepEqual(projected.release,release);
 assert.deepEqual(projected.controls,controls);
 const engine=controls.current_source.source_cohort_20261122.engine;
 assert.equal(engine.main,source.engine.sha);
 assert.equal(engine.reviewed_head,source.engine.reviewed_sha);
 assert.equal(engine.verified_equal_git_tree,source.engine.reviewed_tree);
 assert.equal(engine.reviewed_pr,source.engine.reviewed_pr);
 assert.equal(source.engine.reviewed_pr,285);
 const current=controls.current_source.public_cohort_20261122;
 for(const [name,key] of [["SDK","sdk"],["CLI","cli"],["cookbooks","cookbooks"]]){
  assert.equal(current[key].sha,source[name].sha);
  assert.equal(String(current[key].ci),String(source[name].ci));
 }
 assert.equal(current.operation_count,70);
 assert.equal(current.openapi_git_blob_sha,source.public_contract.openapi_git_blob_sha);
 assert.equal(source.ga_approved,false);
 assert.equal(release.general_availability_approved,false);
 assert.equal(controls.general_availability_approved,false);
});
test("T0 projection repairs source drift, rejects forged CI, GA and payment claims",()=>{
 const clone=x=>JSON.parse(JSON.stringify(x));
 for(const change of [
  c=>{c.current_source.source_cohort_20261122.engine.main="0".repeat(40)},
  c=>{c.current_source.source_cohort_20261122.engine.reviewed_pr=1},
  c=>{c.current_source.source_cohort_20261122.engine.verified_equal_git_tree="f".repeat(40)},
  c=>{c.current_source.public_cohort_20261122.sdk.sha="a".repeat(40)},
  c=>{c.current_source.public_cohort_20261122.operation_count=69}
 ]){
  const dirty=clone(controls);change(dirty);
  assert.notDeepEqual(projectSourceCohort(source,release,dirty).controls,dirty);
 }
 const badCI=clone(source);badCI.public_ci_attestation_20261122.SDK.ci="7";
 assert.throws(()=>projectSourceCohort(badCI,release,controls),/T0_COHORT_BLOCKED/);
 for(const field of ["ga_approved","payment_enabled"]){
  const bad=clone(source);bad[field]=true;
  assert.throws(()=>projectSourceCohort(bad,release,controls),/T0_COHORT_BLOCKED/);
 }
});
