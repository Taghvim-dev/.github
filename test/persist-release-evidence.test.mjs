import {test} from "node:test";
import assert from "node:assert/strict";
import {receipt} from "../.github/actions/persist-release-evidence/persist-release-evidence.mjs";
const SHA="a".repeat(40),run="123",attempt="1";
const sample={repo:"Taghvim-dev/engine",issue:9,component:"engine",sha:SHA,run,attempt,status:"failure"};
test("durable issue marker is deterministic and never certifies GA",()=>{
  const r=receipt(sample);
  assert.equal(r.marker,"taghvim-release:engine:123:1");
  assert.match(r.body,/NOT CERTIFIED/);
  assert.equal(r.checkpointOK,false);
  assert.equal(r.migrationsOK,false);
  assert.doesNotMatch(r.body,/Bearer|CLOUDFLARE_API_TOKEN/);
});
test("same run and attempt yield same idempotency marker",()=>{
  assert.equal(receipt(sample).marker,receipt(sample).marker);
  assert.notEqual(receipt({...sample,attempt:"2"}).marker,receipt(sample).marker);
});
test("refuse cross-repository issue writes and forged identity",()=>{
  assert.throws(()=>receipt({...sample,repo:"Taghvim-dev/.github"}));
  assert.throws(()=>receipt({...sample,issue:13}));
  assert.throws(()=>receipt({...sample,sha:"main"}));
  assert.throws(()=>receipt({...sample,status:"approved"}));
});
test("only correctly bound migration and checkpoint receipts get a verified label",()=>{
  const checkpoint={record:{workflow_run:run,engine_sha:SHA,component:"engine",phase:"migrations_applied",checkpoints:[{}]},sha256:"b".repeat(64)};
  const migrations={record:{workflow_run:run,release_sha:SHA,database:"taghvim-engine",kind:"d1_applied_ledger",status:"VERIFIED"},sha256:"c".repeat(64)};
  const good=receipt({...sample,status:"success",checkpoint,migrations});
  assert.equal(good.checkpointOK,true);
  assert.equal(good.migrationsOK,true);
  assert.match(good.body,/NOT CERTIFIED/);
  assert.equal(receipt({...sample,migrations:{...migrations,record:{...migrations.record,database:"wrong"}}}).migrationsOK,false);
});

test("sandbox 2.1.0 SHA/run-bound receipts are persisted without implying GA",()=>{
  const base={schema_version:1,kind:"taghvim_engine_sandbox_promotion",environment:"sandbox",
    source_sha:SHA,workflow_run:run,api_version:"2.1.0",contract_sha256:"d".repeat(64),
    migrations:[{name:"0001_control.sql",sha256:"e".repeat(64)}],
    checks:{health:true,readiness:true,openapi:true,d1_ledger:true},production_approved:false};
  const valid=receipt({...sample,status:"skipped",sandboxStatus:"failure",
    sandbox:{record:base,sha256:"f".repeat(64)}});
  assert.equal(valid.sandboxOK,true);
  assert.match(valid.body,/Sandbox job result: \*\*FAILURE\*\*/);
  assert.match(valid.body,/Production job result: \*\*SKIPPED\*\*/);
  assert.match(valid.body,/NOT CERTIFIED/);
  assert.equal(receipt({...sample,sandbox:{record:{...base,source_sha:"b".repeat(40)}}}).sandboxOK,false);
  assert.equal(receipt({...sample,sandbox:{record:{...base,checks:{...base.checks,d1_ledger:false}}}}).sandboxOK,false);
  assert.equal(receipt({...sample,sandbox:{record:{...base,api_version:"2.0.0"}}}).sandboxOK,false);
});
test("unknown sandbox state cannot masquerade as a successful job",()=>{
  assert.throws(()=>receipt({...sample,sandboxStatus:"approved"}),/Invalid sandbox result/);
});
