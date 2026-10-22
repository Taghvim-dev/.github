#!/usr/bin/env node
/**
 * Fail-closed npm audit with bounded retries for transient npm registry outages.
 * No advisory is ignored and an unavailable audit service never becomes a pass.
 * Uses only the caller's checkout and never writes to its lockfile.
 */
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const delays=[0,2000,6000];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const EXPECTED_REPORT=/^\s*\{/;
const TEMPORARY=/(?:\b(?:429|500|502|503|504)\b|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|ERR_SOCKET_TIMEOUT|socket hang up|network timeout|Service Unavailable|audit endpoint returned an error|fetch failed)/i;

export function classifyAudit({status,stdout="",stderr="",error=null}){
 let parsed=null;
 if(EXPECTED_REPORT.test(stdout)){
  try{parsed=JSON.parse(stdout)}catch{}
 }
 const v=parsed?.metadata?.vulnerabilities;
 const valid=parsed?.auditReportVersion>=1 && v && Number.isInteger(v.high) && Number.isInteger(v.critical);
 if(valid){
  if(v.high>0||v.critical>0)
   return {kind:"vulnerable",high:v.high,critical:v.critical};
  if(status===0) return {kind:"verified",high:0,critical:0};
  // Nonzero status with a healthy report is not a success; inspect provider failure.
 }
 if(TEMPORARY.test(String(stderr)+"\n"+String(stdout)+"\n"+String(error?.message||"")))
  return {kind:"transient"};
 return {kind:"error"};
}
export async function auditWithRetries({
 execute=()=>spawnSync("npm",["audit","--audit-level=high","--json"],{
  encoding:"utf8",maxBuffer:16*1024*1024,timeout:90000,
  env:{...process.env,npm_config_fetch_retries:"1",npm_config_fetch_timeout:"30000"}
 }),
 wait=pause,log=message=>console.log(message),maxAttempts=3
}={}){
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)
  throw Error("NPM_AUDIT_UNSAFE_ATTEMPT_COUNT");
 for(let i=0;i<maxAttempts;i++){
  const response=await execute();
  const result=classifyAudit(response);
  if(result.kind==="verified"){
   log("NPM_AUDIT_VERIFIED_ZERO_HIGH_CRITICAL");
   return result;
  }
  if(result.kind==="vulnerable")
   throw Error("NPM_AUDIT_VULNERABILITIES high="+result.high+" critical="+result.critical);
  if(result.kind!=="transient")
   throw Error("NPM_AUDIT_UNVERIFIED_RESPONSE_OR_LOCAL_ERROR");
  if(i+1===maxAttempts)
   throw Error("NPM_AUDIT_PROVIDER_UNAVAILABLE_FAIL_CLOSED_AFTER_"+maxAttempts+"_ATTEMPTS");
  log("NPM_AUDIT_PROVIDER_TRANSIENT retry="+(i+2)+"/"+maxAttempts);
  await wait(delays[i+1]);
 }
 throw Error("NPM_AUDIT_UNREACHABLE");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 auditWithRetries().catch(e=>{console.error("::error::"+e.message);process.exitCode=1});
