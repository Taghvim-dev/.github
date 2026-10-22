import test from "node:test";
import assert from "node:assert/strict";
import {verifyRuntimeSourceBoundary} from "../scripts/release-runtime-provenance.mjs";
const old="a".repeat(40),current="b".repeat(40);
const runtime={source_main_sha:old,verified_main_ci:"100",controlled_release_run:"222",controlled_release_conclusion:"success"};
const history={deployedSourceSha:old,deployedCiRun:"100",deployedReleaseRun:"222"};
test("immutable certified Cloudflare runtime is not rewritten when newer Engine main passes CI",()=>{
 const r=verifyRuntimeSourceBoundary({runtime,...history,sourceSha:current,sourceCi:"200",
  gaApproved:false,sourceOnly:true,releaseStatus:"NO_GO"});
 assert.equal(r.runtime_matches_current_source,false);
 assert.equal(r.source_release_status,"CURRENT_SOURCE_NOT_YET_LIVE");
 assert.equal(r.runtime_sha,old);
});
test("exact same source requires exact CI identity",()=>{
 const r=verifyRuntimeSourceBoundary({runtime,...history,sourceSha:old,sourceCi:"100",
  gaApproved:false,sourceOnly:true,releaseStatus:"NO_GO"});
 assert.equal(r.runtime_matches_current_source,true);
 assert.throws(()=>verifyRuntimeSourceBoundary({runtime,...history,sourceSha:old,sourceCi:"200",
  gaApproved:false,sourceOnly:true,releaseStatus:"NO_GO"}),/CI proof/);
});
test("reject GA, remote-attested source or passing production state if the live Worker is older",()=>{
 for(const x of [
  {gaApproved:true,sourceOnly:true,releaseStatus:"NO_GO"},
  {gaApproved:false,sourceOnly:false,releaseStatus:"NO_GO"},
  {gaApproved:false,sourceOnly:true,releaseStatus:"GO"},
 ]){
  assert.throws(()=>verifyRuntimeSourceBoundary({runtime,...history,sourceSha:current,sourceCi:"200",...x}));
 }
});
test("invalid or unverified live source and missing successful release is rejected",()=>{
 assert.throws(()=>verifyRuntimeSourceBoundary({...history,runtime:{...runtime,source_main_sha:"wrong"},sourceSha:current,sourceCi:"200"}));
 assert.throws(()=>verifyRuntimeSourceBoundary({...history,runtime:{...runtime,controlled_release_conclusion:"failure"},sourceSha:current,sourceCi:"200"}));
});

test("historical deployment cannot be forged by changing only release, live or source evidence",()=>{
 for(const change of [
  {deployedSourceSha:current},{deployedCiRun:"999"},
  {deployedReleaseRun:"333"}
 ])assert.throws(()=>verifyRuntimeSourceBoundary({
   runtime,...history,...change,sourceSha:current,sourceCi:"200",
   gaApproved:false,sourceOnly:true,releaseStatus:"NO_GO"
 }),/disagree/);
});
