#!/usr/bin/env node
/** Authoritative T0 owner approval backed by GitHub's authenticated issue-comment identity.
 * Replaces a fragile static yes/no secret; does NOT replace independent production
 * Environment reviewers or the mandatory successful Sandbox/D1 evidence.
 */
import {pathToFileURL} from "node:url";
const RELEASES=Object.freeze({
 "Taghvim-dev/engine":{issue:9,phrase:"RELEASE_TAGHVIM_ENGINE",component:"engine"},
 "Taghvim-dev/landing":{issue:13,phrase:"RELEASE_TAGHVIM_LANDING",component:"landing"}
});
const fail=(x)=>{throw Error("T0_OWNER_RELEASE_AUTH_BLOCKED: "+x);};
export async function verifyOwnerApproval({repo,sha,phrase,commentId,token,request=fetch}={}){
 const cfg=RELEASES[repo];
 if(!cfg||!/^[a-f0-9]{40}$/.test(sha||"")||!token)fail("source repository, SHA or GitHub token absent");
 if(phrase!==cfg.phrase||!/^[1-9][0-9]{0,18}$/.test(String(commentId||"")))fail("invalid owner approval parameters");
 const endpoint="https://api.github.com/repos/"+repo+"/issues/comments/"+commentId;
 const response=await request(endpoint,{method:"GET",redirect:"error",signal:AbortSignal.timeout(15000),
  headers:{accept:"application/vnd.github+json",authorization:"Bearer "+token,"x-github-api-version":"2022-11-28"}});
 if(response?.status!==200)fail("cannot independently read owner approval comment: HTTP "+response?.status);
 const x=await response.json();
 if(x?.id!==Number(commentId)||x.user?.login!=="007dude"||
   x.issue_url!=="https://api.github.com/repos/"+repo+"/issues/"+cfg.issue||
   x.body!=="/taghvim-promote "+cfg.component+" "+sha||x.author_association==="NONE")
   fail("GitHub owner, issue, body or immutable SHA mismatch");
 return {kind:"taghvim_t0_owner_comment_approval",repository:repo,source_sha:sha,
  comment_id:String(commentId),owner_verified:true,production_approved:false,
  independent_review_still_required:true,remote_mutation:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 verifyOwnerApproval({repo:process.env.GITHUB_REPOSITORY,sha:process.env.GITHUB_SHA,
  phrase:process.env.APPROVAL_PHRASE,commentId:process.env.APPROVAL_COMMENT_ID,token:process.env.GITHUB_TOKEN})
 .then(result=>console.log("T0_OWNER_APPROVAL_VERIFIED",JSON.stringify(result)))
 .catch(e=>{console.error("::error::"+e.message);process.exitCode=1});
}
