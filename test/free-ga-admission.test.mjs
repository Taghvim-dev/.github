import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {admitFreeGAScope} from "../scripts/free-ga-admission.mjs";

const policy=JSON.parse(readFileSync(new URL("../release/FREE-GA-CONSTITUTION.json",import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL("../release/PUBLIC-RELEASE-MATRIX.json",import.meta.url)));
const copy=x=>structuredClone(x);

test("free GA is a separate evidence-gated release and does not require Vandar or billing",()=>{
 const evidence=admitFreeGAScope(policy,manifest);
 assert.equal(evidence.free_ga_candidate,true);
 assert.equal(evidence.payment_dependency,false);
 assert.equal(evidence.commercial_provider,"Vandar");
 assert.equal(evidence.live_charges_allowed,false);
 assert.equal(evidence.runtime_ga_certified,false);
 assert.equal(evidence.required_free_gates,7);
});
test("payment cannot be smuggled into free-tier requirements or falsely declared live",()=>{
 for(const key of ["payment","live_checkout","vandar_authorized","billing_contract"]){
  const input=copy(manifest);input.prerequisites[key]=false;
  assert.throws(()=>admitFreeGAScope(policy,input));
 }
 for(const patch of [
  {activation:"ACTIVE"},
  {live_charges_permitted:true},
  {must_not_gate_free_ga:false},
  {implementation_phase:"PRE_FREE_GA"}
 ]){
  const p=copy(policy);Object.assign(p.release_tracks.commercial_billing,patch);
  assert.throws(()=>admitFreeGAScope(p,manifest));
 }
});
test("free tier remains fail-closed when customer onboarding or another real gate disappears",()=>{
 const candidate=copy(manifest);delete candidate.prerequisites.authorized_sandbox_key_e2e;
 assert.throws(()=>admitFreeGAScope(policy,candidate));
 const withClaims=copy(manifest);withClaims.general_availability_approved=true;
 assert.throws(()=>admitFreeGAScope(policy,withClaims));
 const badPolicy=copy(policy);badPolicy.release_tracks.free_ga.no_automatic_ga_promotion=false;
 assert.throws(()=>admitFreeGAScope(badPolicy,manifest));
});
test("universal multi-platform GA remains a separate higher capability scope",()=>{
 const p=copy(policy);p.universal_full_ga.cannot_be_inferred_from_free_ga=false;
 assert.throws(()=>admitFreeGAScope(p,manifest));
 assert.equal(policy.universal_full_ga.scope,"full_universal_calendar_publication_and_portability");
});
