/** Trusted main-only T0 SDK + Cookbook release reconciler. No Cloudflare credentials. */
import {Buffer} from "node:buffer";
import {fileURLToPath} from "node:url";
const ROOT="Taghvim-dev/.github",BRANCH_PREFIX="bot/t0-public-widget-reconcile-",API="https://api.github.com";
const SHA=/^[a-f0-9]{40}$/;
const fail=s=>{throw Error("T0_PUBLIC_WIDGET_RECONCILE_BLOCKED: "+s);};
export function buildCandidate(matrix,{sdk,sdkCi,cookbooks,cookbooksCi,cookbooksSdkPin}){
 if(matrix?.state!=="PREVIEW"||matrix?.general_availability_approved!==false||
   matrix?.contract_version!=="2.1.0"||!matrix.package_identity||
   !Array.isArray(matrix.repositories)||matrix.repositories.length!==3)fail("unexpected canonical lifecycle");
 if(![sdk,cookbooks,cookbooksSdkPin].every(x=>typeof x==="string"&&SHA.test(x))||
   ![sdkCi,cookbooksCi].every(x=>Number.isSafeInteger(x)&&x>0))fail("invalid source or CI receipt");
 if(cookbooksSdkPin!==sdk)return {status:"BLOCKED_CROSS_REPO_SOURCE_DRIFT",candidate:null};
 const candidate=structuredClone(matrix);
 for(const [name,sha,run] of [["SDK",sdk,sdkCi],["cookbooks",cookbooks,cookbooksCi]]){
  const a=candidate.repositories.filter(x=>x.name===name);
  if(a.length!==1||!candidate.package_identity[name])fail("missing or duplicate package "+name);
  a[0].commit=sha;a[0].ci_run=String(run);
  candidate.package_identity[name].commit=sha;
  candidate.package_identity[name].ci=String(run);
 }
 candidate.package_identity.cookbooks.sdk_source_commit=sdk;
 if(JSON.stringify(candidate)===JSON.stringify(matrix))return {status:"CURRENT",candidate:null};
 return {status:"PR_REQUIRED",candidate};
}
async function gh(path,method="GET",body){
 const token=process.env.GITHUB_TOKEN;
 if(!token)fail("missing job-scoped token");
 const r=await fetch(API+path,{method,redirect:"error",cache:"no-store",
  headers:{accept:"application/vnd.github+json",authorization:"Bearer "+token,
   "x-github-api-version":"2022-11-28",...(body===undefined?{}:{"content-type":"application/json"})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(16000)});
 if(!r.ok)fail("GitHub API "+r.status+" at "+path.split("?")[0]);
 return r.status===204?null:r.json();
}
async function head(repo){
 const x=await gh("/repos/"+repo+"/git/ref/heads/main");
 if(x.ref!=="refs/heads/main"||x.object?.type!=="commit"||!SHA.test(x.object.sha))fail("nonimmutable main "+repo);
 return x.object.sha;
}
async function content(repo,path,sha){
 const x=await gh("/repos/"+repo+"/contents/"+path+"?ref="+sha);
 if(x.type!=="file"||x.encoding!=="base64"||!SHA.test(x.sha))fail("invalid immutable file "+path);
 try{return {sha:x.sha,data:JSON.parse(Buffer.from(x.content.replace(/\s/g,""),"base64").toString("utf8"))};}
 catch{fail("invalid canonical JSON "+path);}
}
async function successfulMainCI(repo,sha,name){
 const x=await gh("/repos/"+repo+"/actions/workflows/verify.yml/runs?branch=main&per_page=30");
 if(!Array.isArray(x.workflow_runs))fail("missing CI inventory");
 const r=x.workflow_runs.filter(v=>v.head_sha===sha&&v.head_branch==="main"&&v.event==="push"&&
  v.status==="completed"&&v.conclusion==="success"&&v.name===name&&v.repository?.full_name===repo);
 r.sort((a,b)=>b.run_number-a.run_number);
 return r[0]?.id||null;
}
/** Only bot-authored, matrix-only abandoned source branches may be rebased. */
export function canResetOrFastForwardBotBranch(compare){
 if(!compare||!["ahead","behind","diverged","identical"].includes(compare.status)||
   !Number.isInteger(compare.ahead_by)||compare.ahead_by<0||compare.ahead_by>3||
   !Array.isArray(compare.files)||!Array.isArray(compare.commits))return null;
 if(compare.files.some(f=>f.filename!=="release/PUBLIC-RELEASE-MATRIX.json"))return null;
 if(compare.ahead_by===0)return "fast_forward";
 if(compare.commits.length!==compare.ahead_by||!compare.commits.every(c=>
    c.commit?.message?.startsWith("reconcile(t0): public SDK and Cookbook reviewed source candidate") &&
    ["github-actions[bot]","github-actions"].includes(c.author?.login)))return null;
 return "bot_branch_reset";
}
export async function reconcilePublicWidget(){
 if(process.env.GITHUB_REPOSITORY!==ROOT||process.env.GITHUB_REF!=="refs/heads/main")fail("not trusted main controller");
 const [sdk,cookbooks,root]=await Promise.all([head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head(ROOT)]);
 // Root-scoped branch avoids drift from an orphan created against older main.
 const branch=BRANCH_PREFIX+root.slice(0,12);
 const [sdkCi,cookbooksCi,cookbookSource,canonical]=await Promise.all([
  successfulMainCI("Taghvim-dev/SDK",sdk,"public-sdk-verify"),
  successfulMainCI("Taghvim-dev/cookbooks",cookbooks,"public-cookbooks-verify"),
  content("Taghvim-dev/cookbooks","release/SDK-SOURCE.json",cookbooks),
  content(ROOT,"release/PUBLIC-RELEASE-MATRIX.json",root)
 ]);
 if(!sdkCi||!cookbooksCi)return {status:"WAIT_FOR_PUBLIC_MAIN_CI",writes:0};
 const plan=buildCandidate(canonical.data,{sdk,sdkCi,cookbooks,cookbooksCi,cookbooksSdkPin:cookbookSource.data?.commit});
 if(plan.status!=="PR_REQUIRED")return {status:plan.status,writes:0};
 const [sdkNow,cookbookNow,rootNow]=await Promise.all([head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head(ROOT)]);
 if(sdkNow!==sdk||cookbookNow!==cookbooks||rootNow!==root)return {status:"RACED_WITH_NEW_SOURCE",writes:0};
 const pulls=await gh("/repos/"+ROOT+"/pulls?state=open&head="+encodeURIComponent("Taghvim-dev:"+branch));
 if(!Array.isArray(pulls))fail("PR inventory unavailable");
 if(pulls.length)return {status:"REVIEW_PENDING_EXISTING_PR",pr:pulls[0].number,writes:0};
 const refs=await gh("/repos/"+ROOT+"/git/matching-refs/heads/"+branch);
 if(!Array.isArray(refs))fail("branch inventory unavailable");
 const exact=refs.filter(ref=>ref.ref==="refs/heads/"+branch);
 if(exact.length!==refs.length||exact.length>1)fail("unexpected source reconciliation branch inventory");
 let botFile=canonical;
 if(!exact.length) {
  // Crash after branch creation is recoverable: the next invocation uses the branch.
  await gh("/repos/"+ROOT+"/git/refs","POST",{ref:"refs/heads/"+branch,sha:root});
 } else {
  const refSha=exact[0]?.object?.sha;
  if(!SHA.test(refSha||""))fail("invalid bot branch SHA");
  if(refSha!==root){
    const compared=await gh("/repos/"+ROOT+"/compare/"+root+"..."+refSha);
    const recovery=canResetOrFastForwardBotBranch(compared);
    if(!recovery)fail("abandoned branch contains unapproved source changes");
    // Only the single fixed bot-owned branch, and only with NO open PR.
    // Resetting another person's work or an active review is forbidden.
    await gh("/repos/"+ROOT+"/git/refs/heads/"+branch,"PATCH",{
      sha:root,force:recovery==="bot_branch_reset"
    });
  }
  botFile=canonical;
 }
 const wanted=JSON.stringify(plan.candidate,null,2)+"\n";
 if(JSON.stringify(botFile.data)!==JSON.stringify(plan.candidate))
   await gh("/repos/"+ROOT+"/contents/release/PUBLIC-RELEASE-MATRIX.json","PUT",{
     message:"reconcile(t0): public SDK and Cookbook reviewed source candidate",
     content:Buffer.from(wanted).toString("base64"),
     sha:botFile.sha,branch:branch
   });
 const pr=await gh("/repos/"+ROOT+"/pulls","POST",{
  title:"reconcile(T0): public SDK and Cookbook SHA-pinned source",
  head:branch,base:"main",draft:false,
  body:"Source-only coordinated release candidate. SDK "+sdk+" (successful main CI "+sdkCi+
   "), Cookbooks "+cookbooks+" (successful main CI "+cookbooksCi+
   "), exact pinned SDK source. NO_GA, no Cloudflare writes. Independent PR review, central CI and protected Sandbox→Production remain mandatory."
 });
 return {status:"CREATED_REVIEWABLE_SOURCE_PR",pr:pr.number,branch_reused:!!exact.length,writes:2,sdk,cookbooks};
}
if(process.argv[1]===fileURLToPath(import.meta.url))
 reconcilePublicWidget().then(x=>console.log("T0_PUBLIC_WIDGET_RECONCILE",JSON.stringify(x)))
  .catch(e=>{console.error("::error::"+e.message);process.exitCode=1;});
