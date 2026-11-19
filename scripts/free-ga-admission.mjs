/**
 * Canonical T=0 split admission. FREE GA has no payment dependency.
 * Commercial billing is a separate Vandar release, never an implicit gate
 * or a post-facto customer charge. Pure and without external side effects.
 */
import assert from "node:assert/strict";

export function admitFreeGAScope(policy,manifest) {
 assert.equal(policy?.schema_version,1,"Free GA policy schema");
 assert.equal(policy?.contract_version,manifest?.contract_version,"Free GA contract version drift");
 assert.equal(manifest?.free_ga_policy_source,"release/FREE-GA-CONSTITUTION.json","Free GA must have one canonical source authority");
 const free=policy?.release_tracks?.free_ga||{};
 const paid=policy?.release_tracks?.commercial_billing||{};
 assert.equal(free.admission,"EVIDENCE_GATED","Free GA must require real receipts");
 assert.equal(free.enabled_before_payment_certification,true,"Commercial payment cannot block Free GA");
 assert.equal(free.no_automatic_ga_promotion,true,"A source manifest is not a GA runtime receipt");
 assert.equal(paid.proposed_provider,"Vandar");
 assert.equal(paid.activation,"DEFERRED");
 assert.equal(paid.implementation_phase,"POST_FREE_GA");
 assert.equal(paid.must_not_gate_free_ga,true);
 assert.equal(paid.live_charges_permitted,false);
 assert.equal(paid.fail_closed_without_approved_pricebook_and_vandar_certification,true);
 assert.equal(policy.universal_full_ga?.required_separately,true);
 assert.equal(policy.universal_full_ga?.cannot_be_inferred_from_free_ga,true);
 const required=free.must_prove||[];
 const actual=Object.keys(manifest?.prerequisites||{});
 assert.equal(new Set(required).size,required.length,"Duplicate constitutional Free GA gate");
 assert.deepEqual(actual.slice().sort(),required.slice().sort(),
  "Free GA evidence gate set has drifted from constitutional source");
 for(const name of actual)assert.ok(!/payment|checkout|billing|vandar|pricebook/i.test(name),
  "Commercial payment must not gate Free GA");
 for(const name of free.independent_runtime_proofs||[])
  assert.ok(/^[a-z][a-z0-9_]{5,100}$/.test(name),"Invalid Free GA runtime evidence name");
 if(manifest.general_availability_approved===true)
  assert.fail("Source-level policy cannot certify production GA without bound runtime receipts");
 return Object.freeze({
  schema:"taghvim.ga-scope-admission.v1",
  free_ga_candidate:true,
  payment_dependency:false,
  commercial_provider:"Vandar",
  live_charges_allowed:false,
  runtime_ga_certified:false,
  required_free_gates:required.length
 });
}
