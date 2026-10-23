import assert from "node:assert/strict";

// Verify declared production receipt against independently admitted source and D1 identity.
// Immutable GitHub/Cloudflare runtime proof is separately required.
export function verifyEngineProductionReceipt({observed,t0,candidate}) {
  const engine=observed?.engine_new_source;
  assert.ok(engine && typeof engine==="object","Missing Engine source observation");
  assert.equal(typeof engine.production_deployed,"boolean","Engine deployment state must be a boolean");
  const live=engine.current_production_release;
  if(engine.production_deployed===false){
    assert.equal(live,undefined,"Unreleased Engine cannot carry a live receipt");
    return;
  }
  const checked=candidate?.source_verification?.latest_checked;
  const admission=candidate?.source_verification?.t0_cross_repo_source_admission;
  assert.match(engine.sha||"",/^[0-9a-f]{40}$/,"Engine observed SHA malformed");
  // Durable execution: Engine's controller main can legitimately advance without
  // redeploying the API Worker. Its new CI receipt cannot be borrowed as live proof.
  assert.match(checked?.engine_sha||"",/^[0-9a-f]{40}$/,"Current controller SHA is malformed");
  assert.equal(checked.engine_sha,t0?.current_source?.engine_main_sha,"Current controller/T0 SHA drift");
  assert.equal(checked.engine_sha,admission?.engine_main_sha,"Current controller/admission SHA drift");
  assert.equal(checked.engine_ci,admission?.engine_ci_run,"Current controller/CI drift");
  assert.equal(engine.ci_run,"39977313854","Deployed Engine must retain its tested release-source CI");
  assert.equal(engine.latest_controller_source_sha,checked.engine_sha,"New controller source not independently tracked");
  assert.equal(engine.latest_controller_ci_run,checked.engine_ci,"New controller CI not independently tracked");
  assert.equal(engine.controller_only_change_not_api_worker,true,"Controller changes must not inherit API deployment proof");
  assert.equal(live?.controller_commit,engine.sha,"Live controller SHA must match tested Engine source");
  assert.equal(live?.production_run_id,39981975548,"Recorded authenticated Engine production run mismatch");
  assert.equal(engine.controller_release_pin_sha,live?.controller_commit,"Engine controller pin must match actual deployment receipt");
  assert.equal(live?.sandbox_job,"success");
  assert.equal(live?.production_job,"success");
  assert.equal(live?.smoke,"success");
  // Expected identity is pinned from Engine wrangler.toml at its independently tested SHA.
  const expected={database_name:"taghvim-engine",database_id:"08e29424-2c68-4aef-bde3-3d5cad47ccc8",
    required_migration:"0010_developer_invitations.sql",expected_ledger:"10/10",
    source:"Taghvim-dev/engine/wrangler.toml@2642f537fac2302b7d8db6b10c06320a8b20be66"};
  assert.deepEqual(t0?.production_d1_identity,expected,"Canonical production D1 identity pin changed");
  assert.equal(live?.d1_database_name,expected.database_name,"Production D1 name mismatch");
  assert.equal(live?.d1_database_id,expected.database_id,"Production D1 ID mismatch");
  assert.equal(live?.migration_applied,expected.required_migration,"Production D1 migration identity mismatch");
  assert.equal(engine.migration,expected.required_migration,"Source migration identity mismatch");
  assert.equal(live?.d1_migrations,expected.expected_ledger,"Migration 0010 not remotely certified");
  assert.equal(engine.production_schema_last_verified,expected.expected_ledger,"Source D1 ledger state mismatch");
  assert.equal(engine.live_schema_verified,true,"Current Engine schema not live-verified");
  for(const key of ["d1_ledger_receipt_sha256","recovery_bookmark_receipt_sha256","postdeploy_checkpoint_sha256"])
    assert.match(live?.[key]||"",/^[a-f0-9]{64}$/,"Missing immutable remote evidence "+key);
  assert.equal(live?.ga_approved,false);
  assert.equal(live?.billing_certified,false);
  assert.equal(live?.real_developer_email_inbox_delivery_certified,false);
}
