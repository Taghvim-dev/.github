#!/usr/bin/env node
/** T0 owner-authenticated explicit release request. Does not deploy or hold Cloudflare credentials.
 * Existing production-release.yml must STILL attest live sandbox receipt,
 * Time Travel bookmark, remote D1 ledger, source identity and independent reviewers.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {attestCurrentRelease} from "../verify-current-source/verify-current-source.mjs";

const ALLOWED=Object.freeze({
 "Taghvim-dev/engine":{component:"engine",issue:9,phrase:"RELEASE_TAGHVIM_ENGINE"},
 "Taghvim-dev/landing":{component:"landing",issue:13,phrase:"RELEASE_TAGHVIM_LANDING"}
});
const SHA=/^[a-f0-9]{40}$/;
function fail(message){throw Error("T0_OWNER_RELEASE_DISPATCH_BLOCKED: "+message);}
export function parseRequest({repo,event}){
 const cfg=ALLOWED[repo];
 if(!cfg)fail("unapproved component");
 const comment=event?.comment;
 if(event?.action!=="created"||event?.issue?.number!==cfg.issue||
   !!event?.issue?.pull_request||comment?.user?.login!=="007dude"||
   !Number.isInteger(comment?.id)||comment.id<1)
   fail("wrong issue, author or event");
 const match=typeof comment.body==="string"?
  comment.body.match(/^\/taghvim-promote (engine|landing) ([a-f0-9]{40})$/):null;
 if(!match||match[1]!==cfg.component||!SHA.test(match[2]))fail("request must name exact component and current immutable SHA");
 return {sha:match[2],phrase:cfg.phrase,comment_id:comment.id,component:cfg.component};
}
export async function dispatchRelease({repo,event,token,
 attester=attestCurrentRelease,request=fetch}){
 const {sha,phrase,component,comment_id}=parseRequest({repo,event});
 if(!token)fail("Github Actions scoped token missing");
 // Calls the same trust-boundary verifier used by both actual sandbox and
 // production jobs; independent CI run + full Git tree parity are mandatory.
 const admission=await attester({repo,sha,token});
 if(admission?.source_sha!==sha||admission?.repository!==repo||
   admission?.commit_tree_identity_verified!==true||
   admission?.tested_ci_status!=="completed_success")
   fail("current source and approved CI are not independently attested");
 const endpoint="https://api.github.com/repos/"+repo+"/actions/workflows/production-release.yml/dispatches";
 const response=await request(endpoint,{
  method:"POST",redirect:"error",signal:AbortSignal.timeout(16000),
  headers:{authorization:"Bearer "+token,accept:"application/vnd.github+json",
   "x-github-api-version":"2022-11-28","content-type":"application/json"},
  body:JSON.stringify({ref:"main",inputs:{expected_sha:sha,approval_phrase:phrase,approval_comment_id:String(comment_id)}})
 });
 if(response?.status!==204)fail("GitHub controlled workflow dispatch rejected HTTP "+response?.status);
 return {kind:"t0_owner_explicit_release_dispatch",component,sha,comment_id,
  source_ci_run:admission.ci_receipt,source_tree:admission.source_tree_sha,
  owner_request:true,release_workflow:"production-release.yml",
  sandbox_completed:false,production_approved:false,production_mutation:false,
  status:"ACCEPTED_BY_GITHUB_NOT_DEPLOYED"};
}
async function main(){
 const eventFile=process.env.GITHUB_EVENT_PATH;
 if(!eventFile)fail("missing original immutable issue comment event");
 const result=await dispatchRelease({repo:process.env.GITHUB_REPOSITORY,
  event:JSON.parse(readFileSync(eventFile,"utf8")),
  token:process.env.GITHUB_TOKEN});
 console.log("T0_OWNER_RELEASE_DISPATCH",JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error("::error::"+String(e.message||e));process.exitCode=1;});
