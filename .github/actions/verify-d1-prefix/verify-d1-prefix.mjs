#!/usr/bin/env node
/** Read-only D1 preflight. No SQL writes and no Cloudflare credentials inside this module.
 * Rejects non-prefix migration ledgers BEFORE Wrangler attempts any migration.
 */
import {readFileSync,readdirSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const DATABASES=new Set(["taghvim-engine","taghvim-web"]);
export function expectedMigrations(dir="migrations"){
 const files=readdirSync(dir).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
 if(!files.length)throw Error("D1_PREFLIGHT_NO_SOURCE_MIGRATIONS");
 return files.map(name=>({name,sha256:createHash("sha256").update(readFileSync(join(dir,name))).digest("hex")}));
}
export function rowsOf(json){
 const blocks=Array.isArray(json)?json:[json];
 if(blocks.length!==1||blocks[0]?.success!==true||!Array.isArray(blocks[0].results))
   throw Error("D1_PREFLIGHT_INVALID_REMOTE_QUERY");
 return blocks[0].results;
}
export function verifyPrefix({database,source,remote,sha,run}){
 if(!DATABASES.has(database))throw Error("D1_PREFLIGHT_UNAPPROVED_DATABASE");
 if(!/^[a-f0-9]{40}$/.test(sha||"")||!/^\d+$/.test(run||""))
  throw Error("D1_PREFLIGHT_SOURCE_IDENTITY");
 if(!Array.isArray(source)||source.length===0||
   source.some(x=>!/^\d{4}_.+\.sql$/.test(x?.name||"")||! /^[a-f0-9]{64}$/.test(x?.sha256||"")))
  throw Error("D1_PREFLIGHT_SOURCE_MANIFEST");
 const sourceNames=source.map(x=>x.name);
 if(new Set(sourceNames).size!==sourceNames.length||
    sourceNames.some((x,i)=>i>0&&x<=sourceNames[i-1]))
  throw Error("D1_PREFLIGHT_UNSORTED_MIGRATIONS");
 const remoteNames=rowsOf(remote).map(x=>x?.name);
 if(remoteNames.some(x=>typeof x!=="string")||
   remoteNames.length>sourceNames.length||new Set(remoteNames).size!==remoteNames.length||
   remoteNames.some((name,i)=>name!==sourceNames[i]))
  throw Error("D1_PREFLIGHT_NON_PREFIX_REMOTE_LEDGER");
 return {schema_version:1,kind:"d1_pre_migration_prefix",status:"VERIFIED",
   database,source_sha:sha,workflow_run:run,
   already_applied:remoteNames.length,pending:sourceNames.slice(remoteNames.length),
   source_migrations:source,production_mutation_authorized:false};
}
function main(){
 const [database,rawFile,outputFile]=process.argv.slice(2);
 if(!database||!rawFile||outputFile!=="release-d1-preflight-evidence.json")
  throw Error("D1_PREFLIGHT_BAD_ARGS");
 const out=verifyPrefix({database,source:expectedMigrations(),
  remote:JSON.parse(readFileSync(rawFile,"utf8")),
  sha:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID});
 writeFileSync(outputFile,JSON.stringify(out,null,2)+"\n",{mode:0o600});
 console.log("D1_PREFIX_VERIFIED",out.database,"applied",out.already_applied,"pending",out.pending.length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 try{main()}catch(e){console.error("::error::"+e.message);process.exitCode=1}
