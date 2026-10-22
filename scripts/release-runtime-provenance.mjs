/** Live Cloudflare proof and the newest tested Git source are distinct ledgers. */
import assert from "node:assert/strict";
export function verifyRuntimeSourceBoundary({runtime,sourceSha,sourceCi,
  gaApproved,sourceOnly,releaseStatus}={}){
 assert.match(runtime?.source_main_sha||"",/^[0-9a-f]{40}$/,"Missing immutable live Worker source SHA");
 assert.match(runtime?.verified_main_ci||"",/^[0-9]+$/,"Missing successful CI receipt for deployed Worker");
 assert.match(sourceSha||"",/^[0-9a-f]{40}$/,"Latest source identity not checked");
 assert.match(sourceCi||"",/^[0-9]+$/,"Latest source CI missing");
 assert.equal(runtime?.controlled_release_conclusion,"success","No successful historic Cloudflare release");
 const same=runtime.source_main_sha===sourceSha;
 if(same){
  assert.equal(runtime.verified_main_ci,sourceCi,
    "Same SHA cannot have mismatched canonical CI proof");
 }else{
  // No inference that a new Git tree has been deployed to Cloudflare.
  assert.equal(gaApproved,false,"Cannot certify GA on unpromoted source change");
  assert.equal(sourceOnly,true,"Do not mark newer package source as remote-attested");
  assert.equal(releaseStatus,"NO_GO","Newer source requires Sandbox-to-Production promotion");
 }
 return {runtime_sha:runtime.source_main_sha,current_source_sha:sourceSha,
  runtime_matches_current_source:same,
  source_release_status:same?"LIVE_VERIFIED":"CURRENT_SOURCE_NOT_YET_LIVE",
  immutable_historic_runtime_attested:true};
}
