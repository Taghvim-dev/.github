/**
 * T0 second-person release approval for PRIVATE repos that cannot use GitHub's
 * Enterprise-only native required-reviewers environment control.
 * Proof: current immutable main SHA + authenticated collaborator (write/admin)
 * issue comment, independent from owner. No Cloudflare mutation.
 */
const ALLOWED=Object.freeze({
 "Taghvim-dev/engine":{issue:9,component:"engine"},
 "Taghvim-dev/landing":{issue:13,component:"landing"}
});
const SHA=/^[a-f0-9]{40}$/;
const fail=message=>{throw Error("T0_INDEPENDENT_REVIEW_BLOCKED: "+message);};
export async function verifyIndependentReview({repo,sha,token,request=fetch}={}){
 const cfg=ALLOWED[repo];
 if(!cfg || !SHA.test(sha||"") || !token)fail("invalid source, SHA or token");
 const base="https://api.github.com/repos/"+repo;
 const headers={authorization:"Bearer "+token,accept:"application/vnd.github+json","x-github-api-version":"2022-11-28"};
 const get=async path=>{
   const result=await request(base+path,{method:"GET",headers,redirect:"error",signal:AbortSignal.timeout(15000)});
   if(result?.status!==200)fail("GitHub read denied HTTP "+result?.status);
   return result.json();
 };
 const expected="/taghvim-review "+cfg.component+" "+sha;
 let found=null;
 for(let page=1;page<=10;page++){
   const comments=await get("/issues/"+cfg.issue+"/comments?per_page=100&page="+page);
   if(!Array.isArray(comments))fail("invalid authenticated comments");
   const matches=comments.filter(c=>c?.body===expected &&
     c?.user?.login && c.user.login!=="007dude" &&
     c.user.type==="User" && Number.isInteger(c.id) && c.id>0);
   // The latest authenticated eligible comment is authoritative.
   for(const match of matches)if(!found || match.id>found.id)found=match;
   if(comments.length<100)break;
   if(page===10)fail("approval comments exceeded safe bounded pagination");
 }
 if(!found)fail("no separate human reviewer explicitly approved current SHA");
 const username=found.user.login;
 if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/.test(username))fail("invalid reviewer identity");
 const permission=await get("/collaborators/"+encodeURIComponent(username)+"/permission");
 if(!["write","admin"].includes(permission?.permission) ||
   permission?.user?.login!==username)fail("reviewer lacks independently verified write access");
 return {kind:"taghvim_t0_independent_issue_review",source_sha:sha,
  component:cfg.component,reviewer:username,comment_id:found.id,
  independent_from_owner:true,github_permission:permission.permission,
  production_mutation:false,general_availability_approved:false};
}
