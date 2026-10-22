import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyAudit,auditWithRetries} from "../.github/actions/npm-audit/verified-audit.mjs";
const data=(high=0,critical=0)=>JSON.stringify({
 auditReportVersion:2,metadata:{vulnerabilities:{info:0,low:0,moderate:0,high,critical,total:high+critical}}
});
const green={status:0,stdout:data()};
test("valid structured report, zero high/critical and successful npm process required",async()=>{
 assert.equal(classifyAudit(green).kind,"verified");
 await auditWithRetries({execute:()=>green,wait:async()=>{},log:()=>{}});
 assert.equal(classifyAudit({status:0,stdout:""}).kind,"error");
 assert.equal(classifyAudit({status:1,stdout:data()}).kind,"error");
});
test("real high and critical advisories fail immediately and never retry",async()=>{
 for(const bad of [{status:1,stdout:data(1,0)},{status:1,stdout:data(0,2)}]){
  let calls=0;
  await assert.rejects(auditWithRetries({execute:()=>{calls++;return bad},wait:async()=>{},log:()=>{}}),/NPM_AUDIT_VULNERABILITIES/);
  assert.equal(calls,1);
 }
});
test("registry 503 is retried and later valid report may succeed",async()=>{
 let count=0;const logs=[];
 const outcome=await auditWithRetries({execute:()=>{
  count++;
  return count===1?{status:1,stderr:"npm warn audit 503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick"}:green;
 },wait:async()=>{},log:x=>logs.push(x)});
 assert.equal(outcome.kind,"verified");
 assert.equal(count,2);
 assert.match(logs.join(" "),/NPM_AUDIT_PROVIDER_TRANSIENT/);
});
test("persistent npm service 503 remains fail-closed after fixed three attempts",async()=>{
 let count=0;
 await assert.rejects(auditWithRetries({execute:()=>{count++;return{status:1,stderr:"npm error audit endpoint returned an error 503"}},wait:async()=>{},log:()=>{}}),/PROVIDER_UNAVAILABLE_FAIL_CLOSED_AFTER_3/);
 assert.equal(count,3);
});
test("unknown errors, bad JSON or source defects are never downgraded to warnings",async()=>{
 for(const bad of [
   {status:1,stderr:"npm ERR missing package-lock"},
   {status:1,stdout:"{this is not json}"},
   {status:0,stdout:"{this is not json}"},
   {status:null,error:{message:"unknown child process failure"}}
 ])await assert.rejects(auditWithRetries({execute:()=>bad,wait:async()=>{},log:()=>{}}),/NPM_AUDIT_UNVERIFIED_RESPONSE/);
});
