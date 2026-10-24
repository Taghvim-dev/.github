import {test} from "node:test";
import assert from "node:assert/strict";
import {queryPlan,safeQueryArgs,transientD1TransportFailure,acquireD1Evidence} from "../.github/actions/verify-d1-ledger/read-d1-metadata.mjs";
const ok=(results=[])=>({code:0,stdout:JSON.stringify([{success:true,results}]),stderr:""});
test("schema acquisition uses fixed read-only D1 queries with no customer rows",()=>{
 for(const database of ["taghvim-web","taghvim-engine"]){
  const p=queryPlan(database);assert.equal(p.length,4);
  assert.equal(p[3].sql,database==="taghvim-web"?"PRAGMA table_info(leads)":"PRAGMA table_info(subscriptions)");
  for(const q of p){
   const a=safeQueryArgs(database,q);
   assert.ok(a.includes("--remote")&&a.includes("--json"));
   assert.equal(a.at(-1),q.sql);
   assert.doesNotMatch(q.sql,/INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|select \*/i);
  }
 }
 assert.throws(()=>queryPlan("customer-production"));
 assert.throws(()=>safeQueryArgs("taghvim-web",{...queryPlan("taghvim-web")[0],sql:"DELETE FROM leads"}));
});
test("captures four named probes, preserves exact structured JSON for independent validator",async()=>{
 const files=new Map(),logs=[];
 const v=await acquireD1Evidence({database:"taghvim-web",run:async()=>ok([]),sleep:async()=>{throw Error("unexpected retry")},persist:(p,c)=>files.set(p,JSON.parse(c)),log:m=>logs.push(m)});
 assert.deepEqual([...files.keys()],["d1-quick-raw.json","d1-foreign-raw.json","d1-objects-raw.json","d1-columns-raw.json"]);
 assert.equal(files.get("d1-quick-raw.json")[0].success,true);
 assert.equal(v.ready,true);assert.equal(v.remote_mutations,false);
 assert.equal(v.customer_rows,0);assert.equal(v.probes,4);
 assert.ok(logs.every(x=>!x.includes("Bearer")));
});
test("retry only recognized Cloudflare transport failures and recover",async()=>{
 let calls=0;const waits=[];const files=[];
 const x=await acquireD1Evidence({database:"taghvim-web",
  run:async()=>++calls===1?{code:1,stdout:"",stderr:"503 Service Unavailable"}:ok([]),
  sleep:async n=>waits.push(n),persist:p=>files.push(p),log:()=>{},delays:[3,5]});
 assert.equal(x.ready,true);assert.equal(calls,5);assert.deepEqual(waits,[3]);assert.equal(files.length,4);
 assert.equal(transientD1TransportFailure("HTTP 401"),false);
 assert.equal(transientD1TransportFailure("SQLITE_CONSTRAINT"),false);
});
test("nonretryable API, bad JSON and semantic query failure close gate without writing partial files",async()=>{
 for(const bad of [
  {code:1,stdout:"",stderr:"401 authorization failed"},
  {code:0,stdout:"not-json",stderr:""},
  {code:0,stdout:JSON.stringify([{success:false,error:"SQLITE_ERROR"}]),stderr:""}
 ]){
  let n=0;const files=[];
  await assert.rejects(()=>acquireD1Evidence({database:"taghvim-web",run:async()=>{n++;return bad;},
   sleep:async()=>{throw Error("unexpected sleep");},persist:(p)=>files.push(p),log:()=>{}}),/T0_D1_SCHEMA_READ_BLOCKED/);
  assert.equal(n,1);assert.equal(files.length,0);
 }
});
test("persistent transport failure exhausts finite attempts; no silent success",async()=>{
 let calls=0,waits=0,files=0;
 await assert.rejects(()=>acquireD1Evidence({database:"taghvim-engine",
  run:async()=>{calls++;return {code:1,stderr:"[HTTP 429] rate limit"};},
  sleep:async()=>{waits++;},persist:()=>{files++;},log:()=>{},delays:[1,2]}),/TRANSPORT_EXHAUSTED/);
 assert.equal(calls,3);assert.equal(waits,2);assert.equal(files,0);
});
