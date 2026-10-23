import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => JSON.parse(readFileSync(new URL("../release/" + path, import.meta.url)));
const pub = read("PUBLIC-RELEASE-MATRIX.json");
const t0 = read("T0-CONTROL-MATRIX.json");

test("T0 release matrices distinguish current source from historically deployed Cloudflare Workers", () => {
  const a = pub.post_release_observation_20261023;
  const b = t0.post_release_observation_20261023;
  assert.deepEqual(a, b, "single canonical evidence record required");
  assert.equal(pub.general_availability_approved, false);
  assert.equal(t0.general_availability_approved, false);
  assert.equal(a.current_source_not_yet_deployed, true);
  assert.equal(a.live_schema_for_new_source_verified, false);
  assert.equal(a.engine_new_source.production_deployed, false);
  assert.equal(a.landing_new_source.production_deployed, false);
  assert.notEqual(a.engine_new_source.sha, a.engine_production.source_sha);
  assert.notEqual(a.landing_new_source.sha, a.landing_production.source_sha);
  assert.equal(a.engine_production.version, "2.1.0");
  assert.equal(a.landing_production.version, "2.1.0");
});

test("release gate requires newly added 0010 and 0004 D1 schemas; older live migration receipts cannot count", () => {
  const a = pub.post_release_observation_20261023;
  const engine = a.engine_new_source, landing = a.landing_new_source;
  assert.equal(engine.production_schema_last_verified, "9/9");
  assert.equal(engine.target_schema_for_new_source, "10/10");
  assert.equal(engine.migration, "0010_developer_invitations.sql");
  assert.equal(landing.production_schema_last_verified, "3/3");
  assert.equal(landing.target_schema_for_new_source, "4/4");
  assert.equal(landing.migration, "0004_unsubscribe_tokens.sql");
  assert.match(a.promotion_requires, /owner-authenticated/);
  assert.equal(a.general_availability_approved, false);
});

test("current main controller embeds the exact released-candidate Landing Git tree; push cannot promote", () => {
  const o = pub.post_release_observation_20261023;
  const e = o.engine_new_source;
  const l = o.landing_new_source;
  // The tested Engine main can advance for source-only fixes without silently promoting the older controller.
  assert.match(e.sha, /^[a-f0-9]{40}$/);
  assert.match(e.controller_release_pin_sha, /^[a-f0-9]{40}$/);
  assert.notEqual(e.controller_release_pin_sha, o.engine_production.source_sha);
  assert.equal(e.controller_landing_source_sha, l.sha);
  assert.equal(e.controller_landing_git_tree, l.exact_git_tree);
  assert.match(l.exact_git_tree, /^[a-f0-9]{40}$/);
  assert.deepEqual(l.required_migrations, [
    "0001_leads.sql", "0002_comms.sql",
    "0003_updates_opt_in.sql", "0004_unsubscribe_tokens.sql"
  ]);
  assert.equal(e.push_sandbox_job, "skipped");
  assert.equal(e.push_production_job, "skipped");
  assert.equal(o.remote_new_migrations_status, "NOT_VERIFIED_FOR_CURRENT_SOURCE");
  assert.equal(o.production_promotion_authorized, false);
  assert.equal(o.current_source_not_yet_deployed, true);
});

// A green workflow must execute these source/runtime assertions, not merely carry them in git.
test("T0 source/runtime separation is required by both CI workflows", () => {
  const validate = readFileSync(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");
  const coordinated = readFileSync(new URL("../.github/workflows/coordinated-public-release.yml", import.meta.url), "utf8");
  const command = "node --test test/source-runtime-separation-20261023.test.mjs";
  assert.ok(validate.includes(command), "public-docs CI must run source/runtime regression");
  assert.ok(coordinated.includes(command), "coordinated release CI must run source/runtime regression");
  const path = '"test/source-runtime-separation-20261023.test.mjs"';
  assert.equal(coordinated.split(path).length - 1, 2, "both PR and push path filters must include test changes");
});
