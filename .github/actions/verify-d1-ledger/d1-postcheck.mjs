#!/usr/bin/env node
/* Post-migration D1 proof: inspect only schema/consistency metadata. No customer rows or credentials. */
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const NEED={
 "taghvim-engine":{
   objects:{tenants:"table",api_keys:"table",subscriptions:"table",idempotency_records:"table",
     canonical_events:"table",event_outbox:"table",meter_events:"table",
     usage_aggregates:"table",meter_reservations:"table",d1_migrations:"table"},
   columns:["current_period_start","current_period_end","renewal_notified_for"]
 },
 "taghvim-web":{
   objects:{leads:"table",comms_dispatch:"table",comms_suppression:"table",
     comms_audit:"table",audience_opt_out:"table",audience_product_updates:"view",d1_migrations:"table"},
   columns:["updates_opt_in","updates_opted_in_at","comms_status"]
 }
};
const readRows=v=>{
 const r=Array.isArray(v)?v:[v];
 if(r.length!==1||r[0]?.success!==true||!Array.isArray(r[0]?.results))throw Error("D1_POSTCHECK_FAILED_QUERY");
 return r[0].results;
};
export function verifyPostMigration({database,quick,foreign,objects,columns,sha,run}){
 const rule=NEED[database];
 if(!rule)throw Error("D1_POSTCHECK_INVALID_DATABASE");
 if(!/^[a-f0-9]{40}$/.test(sha||"")||!/^\d+$/.test(run||""))
  throw Error("D1_POSTCHECK_IDENTITY");
 const qr=readRows(quick);
 if(qr.length!==1||String(qr[0]?.quick_check||"").toLowerCase()!=="ok")
  throw Error("D1_POSTCHECK_CORRUPTION_OR_FAILED_QUICK_CHECK");
 if(readRows(foreign).length!==0)throw Error("D1_POSTCHECK_FOREIGN_KEY_VIOLATION");
 const named=new Map(readRows(objects).map(x=>[x?.name,x?.type]));
 for(const [name,type] of Object.entries(rule.objects)){
  if(named.get(name)!==type)throw Error("D1_POSTCHECK_MISSING_SCHEMA_OBJECT_"+name);
 }
 const cols=new Set(readRows(columns).map(x=>x?.name));
 for(const name of rule.columns)if(!cols.has(name))
  throw Error("D1_POSTCHECK_MISSING_REQUIRED_COLUMN_"+name);
 return {schema_version:1,kind:"d1_post_migration_integrity",
   status:"VERIFIED",database,source_sha:sha,workflow_run:run,
   quick_check:true,foreign_keys_valid:true,
   verified_schema_objects:Object.keys(rule.objects),verified_columns:rule.columns,
   customer_rows_read:0,ga_authorized:false};
}
function main(){
 const [database,q,f,o,c,output]=process.argv.slice(2);
 if(!NEED[database]||output!=="release-d1-integrity-evidence.json")throw Error("D1_POSTCHECK_ARGS");
 const result=verifyPostMigration({database,quick:JSON.parse(readFileSync(q,"utf8")),
   foreign:JSON.parse(readFileSync(f,"utf8")),objects:JSON.parse(readFileSync(o,"utf8")),
   columns:JSON.parse(readFileSync(c,"utf8")),
   sha:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID});
 writeFileSync(output,JSON.stringify(result,null,2)+"\n",{mode:0o600});
 console.log("D1_POST_MIGRATION_INTEGRITY_VERIFIED",result.database,Object.keys(NEED[database].objects).length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 try{main()}catch(e){console.error("::error::"+e.message);process.exitCode=1}
