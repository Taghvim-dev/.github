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

/** All mirrored source and T0 evidence must change together in one Git tree. */
export function buildAtomicCandidate(release,controls,inputs){
 if(!controls||controls.general_availability_approved!==false||
   controls.contract_version!==release?.contract_version||!Array.isArray(controls.controls))
   fail("invalid constitutional control matrix");
 if(JSON.stringify(release.post_release_observation_20261023)!==
    JSON.stringify(controls.post_release_observation_20261023))
   fail("canonical source/runtime observations split across independent ledgers");
 const result=buildCandidate(release,inputs);
 if(result.status==="BLOCKED_CROSS_REPO_SOURCE_DRIFT")return {status:result.status,release:null,controls:null};
 const next=result.candidate||structuredClone(release), t0=structuredClone(controls);
 const source=next.post_release_observation_20261023;
 const control=t0.controls.find(x=>x.id==="T0-PACKAGES-014");
 if(!source||!control||!control.dependent_component_ci)fail("missing T0 package source observation and CI authority");
 for(const [name,field,sha,ci] of [
  ["SDK","sdk",inputs.sdk,inputs.sdkCi],
  ["cookbooks","cookbooks",inputs.cookbooks,inputs.cookbooksCi]
 ]){
   const expected=release.repositories.find(x=>x.name===name);
   if(!expected||control.dependent_component_ci[name]!==expected.ci_run)
     fail("existing cross-ledger "+name+" CI proof drift");
   source[field+"_current_source_commit"]=sha;
   source[field+"_current_main_ci_run"]=String(ci);
   control.dependent_component_ci[name]=String(ci);
 }
 t0.post_release_observation_20261023=structuredClone(source);
 if(JSON.stringify(next)===JSON.stringify(release)&&JSON.stringify(t0)===JSON.stringify(controls))
   return {status:"CURRENT",release:null,controls:null};
 return {status:"PR_REQUIRED",release:next,controls:t0};
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
 if(compare.files.some(f=>!["release/PUBLIC-RELEASE-MATRIX.json","release/T0-CONTROL-MATRIX.json"].includes(f.filename)))return null;
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
 const [sdkCi,cookbooksCi,cookbookSource,canonical,controlFile]=await Promise.all([
  successfulMainCI("Taghvim-dev/SDK",sdk,"public-sdk-verify"),
  successfulMainCI("Taghvim-dev/cookbooks",cookbooks,"public-cookbooks-verify"),
  content("Taghvim-dev/cookbooks","release/SDK-SOURCE.json",cookbooks),
  content(ROOT,"release/PUBLIC-RELEASE-MATRIX.json",root),
  content(ROOT,"release/T0-CONTROL-MATRIX.json",root)
 ]);
 if(!sdkCi||!cookbooksCi)return {status:"WAIT_FOR_PUBLIC_MAIN_CI",writes:0};
 const plan=buildAtomicCandidate(canonical.data,controlFile.data,{sdk,sdkCi,cookbooks,cookbooksCi,cookbooksSdkPin:cookbookSource.data?.commit});
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
 }
 // Atomic Git tree: the release matrix, T0 control CI and source observations
 // become visible together, never as separate CI-triggering half-updates.
 const base=await gh("/repos/"+ROOT+"/git/commits/"+root);
 if(base?.sha!==root||!SHA.test(base.tree?.sha||""))fail("unverified release registry base Git tree");
 const tree=await gh("/repos/"+ROOT+"/git/trees","POST",{
   base_tree:base.tree.sha,
   tree:[
     {path:"release/PUBLIC-RELEASE-MATRIX.json",mode:"100644",type:"blob",
      content:JSON.stringify(plan.release,null,2)+"\n"},
     {path:"release/T0-CONTROL-MATRIX.json",mode:"100644",type:"blob",
      content:JSON.stringify(plan.controls,null,2)+"\n"}
   ]
 });
 if(!SHA.test(tree?.sha||""))fail("invalid candidate Git tree");
 const commit=await gh("/repos/"+ROOT+"/git/commits","POST",{
   message:"reconcile(t0): public SDK and Cookbook reviewed source candidate",
   tree:tree.sha,parents:[root]
 });
 if(!SHA.test(commit?.sha||""))fail("invalid atomic Git commit");
 await gh("/repos/"+ROOT+"/git/refs/heads/"+branch,"PATCH",{sha:commit.sha,force:false});
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
