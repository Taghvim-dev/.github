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
/** Canonical source changes are all-or-nothing across BOTH release ledgers.
 * Old Cloudflare evidence is intentionally immutable; only current-source mirrors advance.
 */
export function buildCoupledCandidate(matrix,controls,args){
 const plan=buildCandidate(matrix,args);
 if(plan.status==="BLOCKED_CROSS_REPO_SOURCE_DRIFT")
   return {status:plan.status,registry:null,controls:null};
 if(plan.status!=="PR_REQUIRED" && plan.status!=="CURRENT")
   fail("unexpected source candidate status");
 // Even when primary package pins are CURRENT, a stale Widget or control
 // evidence mirror still requires a coupled reconciliation PR.
 const result=plan.candidate??structuredClone(matrix);
 const widget=result.source_verification?.widget_sdk_api_integration_20261023;
 const post=result.post_release_observation_20261023;
 const ci=controls?.controls?.find(x=>x.id==="T0-PACKAGES-014")?.dependent_component_ci;
 const ctrlPost=controls?.post_release_observation_20261023;
 if(!widget||!post||!ci||!ctrlPost||controls.general_availability_approved!==false||
    controls.contract_version!=="2.1.0")fail("missing synchronized current-source evidence in both ledgers");
 const {sdk,sdkCi,cookbooks,cookbooksCi}=args;
 const replacements={
   sdk_current_source_commit:sdk,sdk_current_main_ci_run:String(sdkCi),
   cookbooks_current_source_commit:cookbooks,cookbooks_current_main_ci_run:String(cookbooksCi)
 };
 for(const [k,v] of Object.entries(replacements)){
   if(!(k in post)||!(k in ctrlPost))fail("missing dual source mirror "+k);
   post[k]=v;
 }
 widget.sdk_main_sha=sdk;widget.sdk_main_ci_run=String(sdkCi);
 widget.cookbook_main_sha=cookbooks;widget.cookbook_main_ci_run=String(cookbooksCi);
 const cc=structuredClone(controls);
 for(const [k,v] of Object.entries(replacements))cc.post_release_observation_20261023[k]=v;
 const dep=cc.controls.find(x=>x.id==="T0-PACKAGES-014").dependent_component_ci;
 dep.SDK=String(sdkCi);dep.cookbooks=String(cookbooksCi);
 // Historical live D1, deployed Source SHAs, and GA must never change here.
 if(result.general_availability_approved!==false||cc.general_availability_approved!==false)
   fail("reconciler cannot grant GA or mutate runtime state");
 if(JSON.stringify(result)===JSON.stringify(matrix) &&
    JSON.stringify(cc)===JSON.stringify(controls))
   return {status:"CURRENT",registry:null,controls:null};
 return {status:"PR_REQUIRED",registry:result,controls:cc};
}
export function sourcesAreConsistent(matrix,controls,engine,landing){
 const current=matrix?.source_verification?.latest_checked;
 return [engine,landing].every(x=>SHA.test(x||"")) &&
   current?.engine_sha===engine && current?.landing_sha===landing &&
   controls?.current_source?.engine_main_sha===engine &&
   controls?.current_source?.landing_main_sha===landing;
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
    (c.commit?.message?.startsWith("reconcile(t0): public SDK and Cookbook reviewed source candidate") ||
     c.commit?.message?.startsWith("reconcile(t0): atomic SDK and Cookbook source evidence")) &&
    ["github-actions[bot]","github-actions"].includes(c.author?.login)))return null;
 return "bot_branch_reset";
}
export async function reconcilePublicWidget(){
 if(process.env.GITHUB_REPOSITORY!==ROOT||process.env.GITHUB_REF!=="refs/heads/main")fail("not trusted main controller");
 const [sdk,cookbooks,root]=await Promise.all([head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head(ROOT)]);
 // Root-scoped branch avoids drift from an orphan created against older main.
 const branch=BRANCH_PREFIX+root.slice(0,12);
 const [sdkCi,cookbooksCi,cookbookSource,canonical,control,engine,landing]=await Promise.all([
  successfulMainCI("Taghvim-dev/SDK",sdk,"public-sdk-verify"),
  successfulMainCI("Taghvim-dev/cookbooks",cookbooks,"public-cookbooks-verify"),
  content("Taghvim-dev/cookbooks","release/SDK-SOURCE.json",cookbooks),
  content(ROOT,"release/PUBLIC-RELEASE-MATRIX.json",root),
  content(ROOT,"release/T0-CONTROL-MATRIX.json",root),
  head("Taghvim-dev/engine"),head("Taghvim-dev/landing")
 ]);
 if(!sdkCi||!cookbooksCi)return {status:"WAIT_FOR_PUBLIC_MAIN_CI",writes:0};
 // An Engine/Landing code merge demands its own reviewed source attestation first.
 // Creating a public-only PR with stale engine/landing pins causes guaranteed red CI.
 if(!sourcesAreConsistent(canonical.data,control.data,engine,landing))
   return {status:"WAIT_FOR_ENGINE_LANDING_SOURCE_ATTESTATION",writes:0};
 const plan=buildCoupledCandidate(canonical.data,control.data,
   {sdk,sdkCi,cookbooks,cookbooksCi,cookbooksSdkPin:cookbookSource.data?.commit});
 if(plan.status!=="PR_REQUIRED")return {status:plan.status,writes:0};
 const [sdkNow,cookbookNow,engineNow,landingNow,rootNow]=await Promise.all([head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head("Taghvim-dev/engine"),head("Taghvim-dev/landing"),head(ROOT)]);
 if(sdkNow!==sdk||cookbookNow!==cookbooks||engineNow!==engine||landingNow!==landing||rootNow!==root)return {status:"RACED_WITH_NEW_SOURCE",writes:0};
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
 // Produce both constitutional registries in ONE commit. No half-valid intermediate push.
 const base=await gh("/repos/"+ROOT+"/git/commits/"+root);
 if(!SHA.test(base?.tree?.sha||""))fail("unattested current main Git tree");
 const files=[
   ["release/PUBLIC-RELEASE-MATRIX.json",plan.registry],
   ["release/T0-CONTROL-MATRIX.json",plan.controls]
 ];
 const tree=await gh("/repos/"+ROOT+"/git/trees","POST",{
   base_tree:base.tree.sha,
   tree:files.map(([path,value])=>({
     path,mode:"100644",type:"blob",content:JSON.stringify(value,null,2)+"\n"
   }))
 });
 if(!SHA.test(tree?.sha||""))fail("invalid coordinated release source tree");
 const proposed=await gh("/repos/"+ROOT+"/git/commits","POST",{
   message:"reconcile(t0): atomic SDK and Cookbook source evidence",
   tree:tree.sha,parents:[root]
 });
 if(!SHA.test(proposed?.sha||""))fail("coordinated release commit creation failed");
 const [sdkStill,cookbookStill,engineStill,landingStill,rootStill]=await Promise.all([
   head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head("Taghvim-dev/engine"),
   head("Taghvim-dev/landing"),head(ROOT)
 ]);
 if(sdkStill!==sdk||cookbookStill!==cookbooks||engineStill!==engine||
    landingStill!==landing||rootStill!==root)
   return {status:"RACED_BEFORE_ATOMIC_PR",writes:0};
 await gh("/repos/"+ROOT+"/git/refs/heads/"+branch,"PATCH",{sha:proposed.sha,force:false});
 // The request is only reviewable source; it never deploys or changes GA.
 const pr=await gh("/repos/"+ROOT+"/pulls","POST",{
  title:"reconcile(T0): public SDK and Cookbook SHA-pinned source",
  head:branch,base:"main",draft:false,
  body:"Source-only coordinated release candidate. SDK "+sdk+" (successful main CI "+sdkCi+
   "), Cookbooks "+cookbooks+" (successful main CI "+cookbooksCi+
   "), exact pinned SDK source. NO_GA, no Cloudflare writes. Independent PR review, central CI and protected Sandbox→Production remain mandatory."
 });
 return {status:"CREATED_REVIEWABLE_SOURCE_PR",pr:pr.number,branch_reused:!!exact.length,git_commits:1,files:2,sdk,cookbooks};
}
if(process.argv[1]===fileURLToPath(import.meta.url))
 reconcilePublicWidget().then(x=>console.log("T0_PUBLIC_WIDGET_RECONCILE",JSON.stringify(x)))
  .catch(e=>{console.error("::error::"+e.message);process.exitCode=1;});
