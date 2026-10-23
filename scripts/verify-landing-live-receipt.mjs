import assert from "node:assert/strict";

// Historical deployments and current main are separate durable facts.
// This validates EXACT observed run/source/tree/D1/Worker IDs; a green CI on
// another SHA or an older 3/3 deployment cannot substitute for Landing 0004.
export function verifyLandingProductionReceipt({observed,candidate}) {
 const landing=observed?.landing_new_source;
 assert.ok(landing&&typeof landing==="object","Missing Landing source observation");
 assert.equal(typeof landing.production_deployed,"boolean","Landing deployment flag must be boolean");
 const live=landing.current_production_release;
 if(!landing.production_deployed){
   assert.equal(live,undefined,"Unreleased Landing cannot carry an observed runtime receipt");
   return;
 }
 const sha="41657131c23d716892032dc85c3cd9909c79dc0f";
 const tree="0b6408988b3955386713a2efd87e6dc04a51bf56";
 assert.equal(landing.sha,sha,"Unexpected Landing deployment source SHA");
 assert.equal(landing.exact_git_tree,tree,"Landing original Git tree drift");
 assert.equal(landing.ci_run,"39976195222","Landing deployed CI receipt drift");
 // Historical Landing release was approved on its own immutable controller SHA.
 // New current-main Engine/SDK commits must never rewrite or inherit that Cloudflare proof.
 const releaseController="378b45edadbb8865c35b0f8e7f8bd9bfb4c4876b";
 assert.equal(live?.controller_commit,releaseController,"Landing live controller release SHA was overwritten");
 assert.equal(observed?.owner_release_permission?.last_release_controller_sha,releaseController,
  "Actual owner-authorized Landing release controller must remain immutable");
 assert.match(candidate?.source_verification?.latest_checked?.engine_sha||"",/^[a-f0-9]{40}$/,
  "Current Controller source SHA missing");
 assert.equal(observed?.engine_new_source?.latest_controller_source_sha,
  candidate.source_verification.latest_checked.engine_sha,
  "Current controller CI source must be tracked separately from deployed Landing controller");
 assert.equal(live?.source_sha,sha,"Landing live source SHA mismatch");
 assert.equal(live?.source_tree,tree,"Landing live Git tree mismatch");
 assert.equal(live?.workflow_run_id,39988778625,"Landing actual Cloudflare workflow run mismatch");
 assert.equal(live?.owner_approval_comment_id,6369899290,"Owner approval comment is not current release authorization");
 assert.equal(live?.workflow_event,"issue_comment","Landing release entrypoint was not authenticated issue comment");
 for(const job of ["admission_job","sandbox_job","production_job"]) assert.equal(live?.[job],"success","Incomplete real workflow job "+job);
 assert.equal(live?.production_smoke,"LANDING_2_1_PRODUCTION_SMOKE_PASS");
 assert.equal(live?.d1_database_name,"taghvim-web");
 assert.equal(live?.d1_database_id,"13bac632-9138-485f-9f6d-eda7375d0cf2");
 assert.equal(live?.applied_migration,"0004_unsubscribe_tokens.sql");
 assert.equal(landing.migration,live.applied_migration);
 assert.equal(live?.d1_migrations,"4/4");
 assert.equal(landing?.production_schema_last_verified,"4/4");
 assert.equal(landing?.live_schema_verified,true);
 assert.equal(live?.d1_integrity,"pass");
 assert.deepEqual(live?.workers_at_100_percent,{
  mail:"ab4e3b94-1481-44d4-ba16-a37a38d7747e",
  comms:"6f11734c-27ef-49bc-8dc9-46299fe8c184",
  web:"81ead940-47b0-4405-8a02-b67a04e2e697"
 },"Cloudflare 100% traffic must refer to attested Worker IDs");
 assert.equal(live?.sandbox_artifact_id,12516412703);
 assert.equal(live?.production_artifact_id,12516961808);
 assert.equal(live?.sandbox_artifact_sha256,"58a347fc3aa47cef0671b3fe234aa706188a4ee879f4fff1e6b2627e09d7a99f");
 assert.equal(live?.production_artifact_sha256,"13a17263d6ff98efb99bfdda3c03e3a0b35bba04ad70c92a261c1ed5c2df5fc1");
 for(const label of ["website","canonical_www","forms_health","forms_d1_and_comms","engine_live","exact_contract"])
  assert.equal(live?.live_smoke_checks?.[label],true,"Failed live smoke "+label);
 assert.equal(live?.live_smoke_checks?.engine_billing,false,"Billing not live certified");
 for(const label of ["real_subscriber_email_delivery_certified","real_customer_self_service_onboarding_certified","payments_certified","ga_approved"])
  assert.equal(live?.[label],false,"Unverified GA or customer capability may not be advertised: "+label);
 assert.equal(candidate?.general_availability_approved,false,"Source test must not enable GA");
 assert.equal(observed?.both_product_components_live,true,"Current release must include both deployed product components");
 assert.equal(observed?.remote_new_migrations_status,"ENGINE_0010_AND_LANDING_0004_REMOTE_VERIFIED","Cannot use historical 3/3 as 4/4 proof");
}
