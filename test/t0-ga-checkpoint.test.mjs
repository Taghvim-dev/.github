import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("T0 cohesive source checkpoint must remain fail-closed while deployed API is stale",()=>{
 const c=JSON.parse(readFileSync(new URL("../release/T0-GA-CHECKPOINT-20261122-02.json",import.meta.url),"utf8"));
 assert.equal(c.previous_evidence.commit,"4d20df99d461546aa9669e311daf1aa2ebe7fda0");
 assert.match(c.previous_evidence.git_blob_sha,/^[a-f0-9]{40}$/);
 for(const x of Object.values(c.git_main))assert.match(x,/^[a-f0-9]{40}$/);
 assert.equal(c.canonical_contract.five_repository_operations_deep_equal,true);
 assert.equal(c.canonical_contract.source_public_operations,67);
 assert.equal(c.canonical_contract.engine_total_ops,70);
 assert.equal(c.canonical_contract.landing_predeploy_source_identity_check,"PASS");
 assert.equal(c.deployment.api_live_operations,69);
 assert.equal(c.deployment.api_live_missing,"listCalendarPortfolio");
 assert.equal(c.admission.ga,false);
 assert.equal(c.admission.github_actions_hard_stop,true);
 assert.equal(c.admission.approval_to_spend_github_actions_minutes,false);
 assert.equal(c.deployment.ga_deployment_performed,false);
});
