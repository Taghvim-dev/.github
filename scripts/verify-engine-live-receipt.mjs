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
  assert.equal(engine.sha,checked?.engine_sha,"Live Engine source must match independently admitted current-main SHA");
  assert.equal(engine.sha,t0?.current_source?.engine_main_sha,"Live Engine source must match T0 current-main SHA");
  assert.equal(engine.sha,admission?.engine_main_sha,"Live Engine source must match prewrite admission SHA");
  assert.equal(engine.ci_run,checked?.engine_ci,"Live Engine source must have canonical tested CI run");
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
