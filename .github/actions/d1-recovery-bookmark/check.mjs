#!/usr/bin/env node
// Read-only Cloudflare D1 recovery admission before any protected migration.
// Never prints secrets or automatically restores live customer data.
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const WORKERS={"taghvim-engine":"taghvim-api","taghvim-web":"taghvim-web"};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Cloudflare account IDs are 32-character hex, unlike D1 database UUIDs.
const ACCOUNT_ID=/^[a-f0-9]{32}$/i;
const BOOKMARK=/^[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{32}$/i;
const fail=msg=>{throw Error("D1_RECOVERY_BLOCKED: "+msg)};
export function databaseId(config,database){
  if(!WORKERS[database])fail("unapproved D1 target");
  if(config.match(/^name\s*=\s*"([^"]+)"/m)?.[1]!==WORKERS[database])fail("wrong Worker");
  const ids=[...config.matchAll(/^\[\[d1_databases\]\]([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)]
    .filter(match=>match[1].match(/^\s*database_name\s*=\s*"([^"]+)"/m)?.[1]===database)
    .map(match=>match[1].match(/^\s*database_id\s*=\s*"([^"]+)"/m)?.[1]);
  if(ids.length!==1||!UUID.test(ids[0]||""))fail("ambiguous or missing canonical production D1");
  return ids[0];
}
export function receipt(body,{database,dbId,sha,run,at}){
  if(!WORKERS[database]||!UUID.test(dbId||"")||!/^[a-f0-9]{40}$/.test(sha||"")||
      !/^\d+$/.test(run||"")||!Number.isFinite(Date.parse(at||"")))
    fail("invalid immutable release identity");
  if(body?.success!==true||!Array.isArray(body.errors)||body.errors.length||
      !BOOKMARK.test(body?.result?.bookmark||""))fail("Time Travel bookmark not confirmed by Cloudflare");
  return {schema_version:1,kind:"d1_pre_migration_recovery",status:"VERIFIED",
    component:database==="taghvim-engine"?"engine":"landing",database,database_id:dbId,
    source_sha:sha,workflow_run:run,captured_at:at,bookmark:body.result.bookmark,
    automatic_restore_allowed:false,restore_mode:"MANUAL_ONLY_DESTRUCTIVE"};
}
export async function capture({database,config,token,account,sha,run,at=new Date().toISOString(),request=fetch}){
  const dbId=databaseId(config,database);
  if(!ACCOUNT_ID.test(account||"")||!token)fail("Cloudflare account credentials missing or malformed");
  const url="https://api.cloudflare.com/client/v4/accounts/"+account+"/d1/database/"+dbId+"/time_travel/bookmark";
  const response=await request(url,{method:"GET",headers:{authorization:"Bearer "+token,accept:"application/json"},
    signal:AbortSignal.timeout(20000)});
  if(!response?.ok)fail("Cloudflare Time Travel unavailable: HTTP "+response?.status);
  return receipt(await response.json(),{database,dbId,sha,run,at});
}
async function main(){
  const database=process.argv[2],output=process.argv[3];
  if(!WORKERS[database]||output!=="release-d1-recovery-bookmark.json")fail("invalid arguments");
  const result=await capture({database,config:readFileSync("wrangler.toml","utf8"),
    account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,
    sha:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID});
  writeFileSync(output,JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log("D1_RECOVERY_VERIFIED",result.component,result.source_sha,result.workflow_run);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{console.error("::error::"+String(e?.message||e));process.exitCode=1});
