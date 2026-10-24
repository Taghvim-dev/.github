#!/usr/bin/env node
/**
 * T0 read-only remote D1 consistency/schema acquisition, with explicit query
 * provenance and bounded transport-only retry. Never read a customer row.
 *
 * The former four unlabelled shell redirects could exit 1 with no log evidence
 * about which D1 probe failed; no integrity gate is removed or weakened here.
 */
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const DELAYS_MS=Object.freeze([2000,4000,8000,16000]);
const QUERIES=Object.freeze([
  Object.freeze({key:"quick",sql:"PRAGMA quick_check",path:"d1-quick-raw.json"}),
  Object.freeze({key:"foreign",sql:"PRAGMA foreign_key_check",path:"d1-foreign-raw.json"}),
  Object.freeze({key:"objects",sql:"SELECT name,type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",path:"d1-objects-raw.json"})
]);
export const queryPlan=database=>{
  if(!["taghvim-engine","taghvim-web"].includes(database))throw Error("T0_D1_UNKNOWN_DATABASE");
  return [...QUERIES,Object.freeze({
    key:"columns",
    sql:database==="taghvim-engine"?"PRAGMA table_info(subscriptions)":"PRAGMA table_info(leads)",
    path:"d1-columns-raw.json"
  })];
};
export const safeQueryArgs=(database,query)=>{
  if(!queryPlan(database).some(x=>x.key===query.key&&x.sql===query.sql&&x.path===query.path))
    throw Error("T0_D1_QUERY_NOT_ALLOWLISTED");
  return ["wrangler","d1","execute",database,"--remote","--json","--command",query.sql];
};
export function transientD1TransportFailure(diagnostic){
  const s=String(diagnostic||"");
  return /(?:\b(?:429|502|503|504)\b|ETIMEDOUT|ECONNRESET|EAI_AGAIN|rate[ -]?limit|temporar(?:y|ily) unavailable)/i.test(s);
}
export async function executeWrangler(args){
  return await new Promise((resolve,reject)=>{
    const proc=spawn("npx",args,{stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="",over=false;
    const limit=1024*1024;
    for(const [pipe,add] of [[proc.stdout,"stdout"],[proc.stderr,"stderr"]]){
      pipe.on("data",chunk=>{
        if(over)return;
        if(add==="stdout")stdout+=chunk.toString();
        else stderr+=chunk.toString();
        if(stdout.length+stderr.length>limit){over=true;proc.kill();}
      });
    }
    proc.on("error",reject);
    proc.on("close",code=>resolve({code:over?1:(code??1),stdout:over?"":stdout,stderr:over?"output-limit":stderr}));
  });
}
function validWranglerResponse(stdout){
  try{
    const o=JSON.parse(String(stdout||""));
    return Array.isArray(o)&&o.length===1&&o[0]?.success===true&&Array.isArray(o[0]?.results)?o:null;
  }catch{return null;}
}
export async function acquireD1Evidence({database,run=executeWrangler,
  sleep=ms=>new Promise(done=>setTimeout(done,ms)),
  persist=(path,content)=>writeFileSync(path,content,{mode:0o600}),
  log=console.log,delays=DELAYS_MS}={}){
  const queries=queryPlan(database);
  const verified=[];
  for(const q of queries){
    const argv=safeQueryArgs(database,q);
    for(let attempt=1;attempt<=delays.length+1;attempt++){
      const r=await run(argv);
      const parsed=r?.code===0?validWranglerResponse(r?.stdout):null;
      if(parsed){
        verified.push({query:q,contents:JSON.stringify(parsed,null,2)+"\n"});
        log("T0_D1_SCHEMA_READ_OK database="+database+" probe="+q.key+" attempt="+attempt+" customer_rows=0");
        break;
      }
      // The SQL commands are hard-coded read-only metadata only. Do NOT retry
      // broken SQL or integrity violations (which are handled by d1-postcheck).
      const diagnostic=String(r?.stderr||"")+"\n"+String(r?.stdout||"");
      const retry=r?.code!==0&&transientD1TransportFailure(diagnostic)&&attempt<=delays.length;
      if(!retry){
        const e=new Error("T0_D1_SCHEMA_READ_BLOCKED database="+database+" probe="+q.key+
          " attempt="+attempt+" class="+(r?.code===0?"UNSTRUCTURED_RESULT":transientD1TransportFailure(diagnostic)?"TRANSPORT_EXHAUSTED":"NONRETRYABLE"));
        throw e;
      }
      log("T0_D1_TRANSPORT_RETRY database="+database+" probe="+q.key+" attempt="+attempt+" retry_ms="+delays[attempt-1]);
      await sleep(delays[attempt-1]);
    }
  }
  // Evidence outputs only after every probe passed its structured API checks.
  for(const x of verified)persist(x.query.path,x.contents);
  log("T0_D1_SCHEMA_READS_COMPLETE database="+database+" probes=4 customer_rows=0 remote_mutations=false");
  return {ready:true,customer_rows:0,remote_mutations:false,probes:verified.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await acquireD1Evidence({database:process.argv[2]});}
  catch(e){console.error("::error::"+(e?.message||"T0_D1_SCHEMA_READ_BLOCKED"));process.exitCode=1;}
}
