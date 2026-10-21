import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {attestSandboxOrigin,verifySandboxOrigin} from "../.github/actions/verify-sandbox-origin/verify-sandbox-origin.mjs";
const accountId="a".repeat(32),token="sandbox-scoped-test-token";
const base={worker:"taghvim-api-sandbox",origin:"https://taghvim-api-sandbox.tgv-owned.workers.dev",subdomain:"tgv-owned",accountId};
test("only the exact Worker on the Cloudflare account subdomain is authorized",()=>{
 const output=verifySandboxOrigin(base);
 assert.equal(output.origin,base.origin);
 assert.equal(output.network_writes,false);
 assert.equal(output.account_sha256.length,64);
 assert.ok(!JSON.stringify(output).includes(token));
 assert.equal(verifySandboxOrigin({...base,worker:"taghvim-web-sandbox",origin:"https://taghvim-web-sandbox.tgv-owned.workers.dev"}).worker,"taghvim-web-sandbox");
});
test("reject foreign accounts, name collisions, sibling hosts, custom prod domains and URL tricks",()=>{
 for(const origin of [
  "https://taghvim-api-sandbox.attacker.workers.dev",
  "https://taghvim-api-sandbox.tgv-owned.workers.dev.evil.example",
  "https://evil-taghvim-api-sandbox.tgv-owned.workers.dev",
  "https://api.taghvim.dev",
  "https://sandbox-api.taghvim.dev",
  "http://taghvim-api-sandbox.tgv-owned.workers.dev",
  "https://taghvim-api-sandbox.tgv-owned.workers.dev/p",
  "https://taghvim-api-sandbox.tgv-owned.workers.dev/?key=1",
  "https://user:pass@taghvim-api-sandbox.tgv-owned.workers.dev"
 ]) assert.throws(()=>verifySandboxOrigin({...base,origin}),/SANDBOX_ORIGIN_BLOCKED/,origin);
 for(const x of ["taghvim-api","taghvim-web","taghvim-api-sandbox.evil","unknown"])
  assert.throws(()=>verifySandboxOrigin({...base,worker:x}),/SANDBOX_ORIGIN_BLOCKED/);
 for(const x of ["1234","",null])assert.throws(()=>verifySandboxOrigin({...base,accountId:x}),/SANDBOX_ORIGIN_BLOCKED/);
 for(const x of ["evil.workers.dev","../evil",""])assert.throws(()=>verifySandboxOrigin({...base,subdomain:x}),/SANDBOX_ORIGIN_BLOCKED/);
});
test("Cloudflare account subdomain is independently fetched read-only before admitting origin",async()=>{
 let calls=0;
 const result=await attestSandboxOrigin({worker:base.worker,origin:base.origin,accountId,token,fetcher:async(url,opts)=>{
  calls++;
  assert.equal(url,"https://api.cloudflare.com/client/v4/accounts/"+accountId+"/workers/subdomain");
  assert.equal(opts.method,"GET");
  assert.equal(opts.headers.authorization,"Bearer "+token);
  assert.equal(opts.redirect,"error");
  return {status:200,json:async()=>({success:true,result:{subdomain:"tgv-owned"}})};
 }});
 assert.equal(calls,1);
 assert.equal(result.origin,base.origin);
});
test("failure or forged Cloudflare responses never yield an allowed origin",async()=>{
 for(const response of [
  {status:403,json:async()=>({success:false})},
  {status:200,json:async()=>({success:false,result:{subdomain:"tgv-owned"}})},
  {status:200,json:async()=>({success:true,result:{subdomain:"attacker"}})},
  {status:200,json:async()=>({success:true,result:{subdomain:"attacker.workers.dev"}})}
 ])await assert.rejects(attestSandboxOrigin({worker:base.worker,origin:base.origin,accountId,token,fetcher:async()=>response}),/SANDBOX_ORIGIN_BLOCKED/);
 await assert.rejects(attestSandboxOrigin({worker:base.worker,origin:base.origin,accountId,token:"",fetcher:async()=>{throw Error("no network")}}),/SANDBOX_ORIGIN_BLOCKED/);
});

test("all mutations are rejected by the source-level read-only contract regardless of JavaScript quote style",()=>{
 const source=readFileSync(new URL("../.github/actions/verify-sandbox-origin/verify-sandbox-origin.mjs",import.meta.url),"utf8");
 // Static policy is intentionally independent of the function-under-test;
 // both single-quoted and double-quoted method fields must fail.
 const hasMutation=code=>/\bmethod\s*:\s*['"`](?:POST|PUT|PATCH|DELETE)\b/i.test(code);
 assert.equal(hasMutation(source),false);
 assert.match(source,/\bmethod\s*:\s*["'`]GET\b/);
 for(const fake of [
   "method: 'POST'", 'method: "PUT"', "method: `PATCH`", "method:'DELETE'",
   "method : 'post'"
 ]) assert.equal(hasMutation(fake),true,"Mutation detection missed "+fake);
});
