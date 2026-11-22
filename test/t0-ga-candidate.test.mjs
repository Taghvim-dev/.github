import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const candidate=JSON.parse(readFileSync(new URL("../release/T0-GA-CANDIDATE-20261122.json",import.meta.url),"utf8"));
test("T0 GA candidate is an immutable-source scoped, fail-closed evidence registry",()=>{
 assert.equal(candidate.schema_version,1);
 assert.equal(candidate.decision,"GA_BLOCKED");
 assert.equal(candidate.customer_checkout,"DEFERRED_ONLY");
 for(const [key,value] of Object.entries(candidate.source)){
  if(key.endsWith("_main")||key.endsWith("_blob"))
   assert.match(value,/^[0-9a-f]{40}$/,key);
 }
 assert.equal(candidate.source.engine_total_operations,70);
 assert.equal(candidate.source.live_total_operations,69);
 assert.equal(candidate.source.source_public_sdk_operations,67);
 assert.equal(candidate.source.landing_pinned_public_sdk_operations,66);
 assert.equal(candidate.source.engine_openapi_git_blob,candidate.source.sdk_openapi_git_blob);
 assert.equal(candidate.source.engine_openapi_git_blob,candidate.source.cli_openapi_git_blob);
 assert.equal(candidate.source.missing_live_operation,"listCalendarPortfolio");
 assert.equal(candidate.cloudflare_runtime.configured_worker_build_triggers.taghvim_api,0);
 assert.equal(candidate.cloudflare_runtime.configured_worker_build_triggers.taghvim_web,0);
 assert.ok(candidate.blockers.includes("GITHUB_ACTIONS_90_PERCENT_OWNER_BUDGET_STOP_NO_EXPLICIT_REOPEN"));
 assert.ok(candidate.not_claimed.includes("public_GA"));
 assert.equal(candidate.safety.d1_writes,false);
 assert.equal(candidate.safety.cloudflare_deployments_issued,false);
});
