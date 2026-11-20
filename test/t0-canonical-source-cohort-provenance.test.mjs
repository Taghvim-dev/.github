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

test("T0 source cohort workflow discovers every cohort-contract test in both PR and main",()=>{
 const workflow=readFileSync(new URL("../.github/workflows/coordinated-public-release.yml",import.meta.url),"utf8");
 const trigger='      - "test/*source-cohort*.test.mjs"';
 assert.equal(workflow.split(trigger).length-1,2,"Both PR and main trigger must subscribe to all cohort tests");
 assert.match(workflow,/node --test test\/\*source-cohort\*\.test\.mjs/,"Release gate must execute all cohort tests, never only a historical fixture");
 assert.ok(!workflow.includes('node --test test/canonical-source-cohort.test.mjs'),"A fixed path can silently skip future T0 tests");
});

// Every advertised public client belongs to ONE canonical release cohort.
test("T0 universal Engine/Landing/SDK/CLI/Cookbooks source identity is single authority",()=>{
 const projected=projectSourceCohort(cohort,release,controls);
 assert.deepEqual(projected.release,release);
 assert.deepEqual(projected.controls,controls);
 for(const name of ["SDK","CLI","cookbooks"]){
  const row=release.repositories.find(x=>x.name===name);
  assert.equal(row.commit,cohort[name].sha);
  assert.equal(row.ci_run,cohort[name].ci);
  assert.equal(release.package_identity[name].commit,cohort[name].sha);
  assert.equal(controls.controls.find(x=>x.id==="T0-PACKAGES-014").dependent_component_ci[name],cohort[name].ci);
 }
 assert.equal(cohort.cookbooks.sdk_source_commit,cohort.SDK.sha);
 assert.equal(release.package_identity.cookbooks.sdk_source_commit,cohort.SDK.sha);
 const ops=load("contracts/operation-index.json");
 assert.equal(cohort.public_contract.openapi_git_blob_sha,ops.openApiGitBlobSHA);
 assert.equal(cohort.public_contract.operation_count,ops.operations.length);
});
test("T0 universal cohort rejects any individual SDK, CLI, Cookbook or public index split brain",()=>{
 for(const name of ["SDK","CLI","cookbooks"]){
  const bad=copy(cohort);bad[name].sha="f".repeat(40);
  assert.throws(()=>verifySourceCohort(bad,release,controls),/T0_COHORT_BLOCKED/);
 }
 const split=copy(cohort);split.cookbooks.sdk_source_commit="f".repeat(40);
 assert.throws(()=>verifySourceCohort(split,release,controls),/T0_COHORT_BLOCKED/);
 const badIndex=copy(cohort);badIndex.public_contract.operation_count++;
 assert.throws(()=>verifySourceCohort(badIndex,release,controls),/T0_COHORT_BLOCKED/);
});
