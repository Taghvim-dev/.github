import {test} from "node:test";
import assert from "node:assert/strict";
import {TaghvimClient, TaghvimApiError, createTestClient} from "../index.js";
import {readFileSync} from "node:fs";

const key="tgv_test_ExampleApprovedByInvitation";
const contract=JSON.parse(readFileSync(new URL("../../../contracts/operation-index.json", import.meta.url)));
test("product preview API routes belong to the pinned contract", () => {
 const allow=new Set(contract.operations.map(x=>x.method+" "+x.path));
 for(const route of ["POST /v1/dates/convert","POST /v1/business-days/add","GET /v1/holidays","POST /v1/deadlines","GET /v1/usage","GET /v1/health"]) assert.ok(allow.has(route),route);
 assert.equal(contract.contractVersion,"2.1.0");
});
test("test client sends an authenticated request and preserves trace metadata",async()=>{
 let call;
 const client=createTestClient({apiKey:key,fetch:async(url,opts)=>{call={url,opts};return new Response(JSON.stringify({date:{iso:"2026-10-07"}}),{status:200,headers:{"content-type":"application/json","Taghvim-Request-Id":"req_sdk_1"}})}});
 const response=await client.convertDate({date:"1405-07-15"},{idempotencyKey:"example-idempotency-001"});
 assert.equal(call.url,"https://api.taghvim.dev/v1/dates/convert");
 assert.equal(call.opts.headers.authorization,"Bearer "+key);
 assert.equal(response.requestId,"req_sdk_1");
 assert.deepEqual(JSON.parse(call.opts.body),{date:"1405-07-15"});
});
test("enforces opt-in to live keys, rejects HTTP remote hosts and never leaks keys", async()=>{
 assert.throws(()=>createTestClient({apiKey:"tgv_live_TestOnly"}),/Test mode requires/);
 assert.throws(()=>createTestClient({apiKey:key,baseUrl:"http://example.com"}),/Insecure/);
 const client=new TaghvimClient({apiKey:key,fetch:async()=>new Response(JSON.stringify({code:"quota_exceeded",title:"Quota exceeded"}),{status:429,headers:{"content-type":"application/json","Taghvim-Request-Id":"req_limit","Retry-After":"30"}})});
 await assert.rejects(client.usage(),e=>e instanceof TaghvimApiError && e.code==="quota_exceeded"&&e.status===429&&e.requestId==="req_limit"&&e.retryAfter==="30"&&!String(e).includes(key));
});
test("unauthenticated health request does not send authorization",async()=>{
 let auth="sent";const client=new TaghvimClient({fetch:async(_url,options)=>{auth=options.headers.authorization;return new Response(JSON.stringify({status:"ok"}),{status:200,headers:{"content-type":"application/json"}})}});
 const out=await client.health();
 assert.equal(auth,undefined);assert.equal(out.status,200);
});
