import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyPostMigration} from "../.github/actions/verify-d1-ledger/d1-postcheck.mjs";
const wrap=results=>[{success:true,results}];
const a={database:"taghvim-web",sha:"f".repeat(40),run:"123",
 quick:wrap([{quick_check:"ok"}]),foreign:wrap([]),
 objects:wrap(["leads","comms_dispatch","comms_suppression","comms_audit","audience_opt_out","d1_migrations"].map(name=>({name,type:"table"})).concat([{name:"audience_product_updates",type:"view"}])),
 columns:wrap(["updates_opt_in","updates_opted_in_at","comms_status"].map(name=>({name})))};
test("D1 schema, page consistency and foreign-key integrity are required after migration",()=>{
 const out=verifyPostMigration(a);
 assert.equal(out.status,"VERIFIED");
 assert.equal(out.ga_authorized,false);
 assert.equal(out.customer_rows_read,0);
});
test("reject corruption, orphaned references, missing D1 table, wrong column and failed query",()=>{
 const bad=[
 {quick:wrap([{quick_check:"database disk image is malformed"}])},
 {quick:wrap([])},
 {foreign:wrap([{table:"leads",rowid:1,parent:"other",fkid:0}])},
 {objects:wrap(a.objects[0].results.filter(x=>x.name!=="leads"))},
 {columns:wrap([{name:"updates_opt_in"}])},
 {quick:[{success:false,results:[{quick_check:"ok"}]}]},
 {sha:"main"},{database:"other"}
 ];
 for(const patch of bad)assert.throws(()=>verifyPostMigration({...a,...patch}));
});
test("Engine has its own schema requirements rather than accepting Landing fields",()=>{
 const b={...a,database:"taghvim-engine",
 objects:wrap(["tenants","api_keys","subscriptions","idempotency_records","canonical_events",
 "event_outbox","meter_events","usage_aggregates","meter_reservations","d1_migrations"].map(name=>({name,type:"table"}))),
 columns:wrap(["current_period_start","current_period_end","renewal_notified_for"].map(name=>({name})))};
 assert.equal(verifyPostMigration(b).quick_check,true);
 assert.throws(()=>verifyPostMigration({...b,columns:a.columns}));
});
