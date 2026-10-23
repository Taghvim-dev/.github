/** Trusted main-only T0 SDK + Cookbook release reconciler. No Cloudflare credentials. */
import {Buffer} from "node:buffer";
import {fileURLToPath} from "node:url";
const ROOT="Taghvim-dev/.github",BRANCH="bot/t0-public-widget-reconcile",API="https://api.github.com";
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
// Build the two coupled canonical ledgers together. A source-only release
// PR that updates just one matrix will fail the T0 gate and waste CI.
export function buildAtomicCandidate(release,control,inputs){
 const plan=buildCandidate(release,inputs);
 if(plan.status!=="PR_REQUIRED")return {...plan,control:null};
 if(!control||control.contract_version!==release.contract_version||
    control.general_availability_approved!==false||!Array.isArray(control.controls)||
    JSON.stringify(control.post_release_observation_20261023)!==JSON.stringify(release.post_release_observation_20261023))
   fail("canonical matrices split-brain or unauthorized GA");
 const candidate=plan.candidate, nextControl=structuredClone(control);
 const packageControl=nextControl.controls.find(x=>x.id==="T0-PACKAGES-014");
 if(!packageControl?.dependent_component_ci||!candidate.post_release_observation_20261023)
   fail("missing T0 package evidence control or source observation");
 for(const [name,sourceKey,ciKey] of [
  ["SDK","sdk_current_source_commit","sdk_current_main_ci_run"],
  ["cookbooks","cookbooks_current_source_commit","cookbooks_current_main_ci_run"]
 ]){
  const pkg=candidate.package_identity[name];
  packageControl.dependent_component_ci[name]=pkg.ci;
  for(const observed of [candidate.post_release_observation_20261023,nextControl.post_release_observation_20261023]){
   observed[sourceKey]=pkg.commit;
   observed[ciKey]=pkg.ci;
  }
 }
 if(JSON.stringify(candidate.post_release_observation_20261023)!==JSON.stringify(nextControl.post_release_observation_20261023))
   fail("source observation parity lost");
 return {...plan,control:nextControl};
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
export async function reconcilePublicWidget(){
 if(process.env.GITHUB_REPOSITORY!==ROOT||process.env.GITHUB_REF!=="refs/heads/main")fail("not trusted main controller");
 const [sdk,cookbooks,root]=await Promise.all([head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head(ROOT)]);
 const [sdkCi,cookbooksCi,cookbookSource,canonical,control]=await Promise.all([
  successfulMainCI("Taghvim-dev/SDK",sdk,"public-sdk-verify"),
  successfulMainCI("Taghvim-dev/cookbooks",cookbooks,"public-cookbooks-verify"),
  content("Taghvim-dev/cookbooks","release/SDK-SOURCE.json",cookbooks),
  content(ROOT,"release/PUBLIC-RELEASE-MATRIX.json",root),
  content(ROOT,"release/T0-CONTROL-MATRIX.json",root)
 ]);
 if(!sdkCi||!cookbooksCi)return {status:"WAIT_FOR_PUBLIC_MAIN_CI",writes:0};
 const plan=buildAtomicCandidate(canonical.data,control.data,{sdk,sdkCi,cookbooks,cookbooksCi,cookbooksSdkPin:cookbookSource.data?.commit});
 if(plan.status!=="PR_REQUIRED")return {status:plan.status,writes:0};
 const [sdkNow,cookbookNow,rootNow]=await Promise.all([head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head(ROOT)]);
 if(sdkNow!==sdk||cookbookNow!==cookbooks||rootNow!==root)return {status:"RACED_WITH_NEW_SOURCE",writes:0};
 const pulls=await gh("/repos/"+ROOT+"/pulls?state=open&head="+encodeURIComponent("Taghvim-dev:"+BRANCH));
 if(!Array.isArray(pulls))fail("PR inventory unavailable");
 if(pulls.length)return {status:"REVIEW_PENDING_EXISTING_PR",pr:pulls[0].number,writes:0};
 const refs=await gh("/repos/"+ROOT+"/git/matching-refs/heads/"+BRANCH);
 if(!Array.isArray(refs))fail("branch inventory unavailable");
 if(refs.length)return {status:"STALE_RECONCILE_BRANCH_REQUIRES_REVIEW",writes:0};
 // Construct one complete commit while the candidate branch does not exist.
 // Creating the ref only after both blobs and tests are present avoids
 // intermediate failure-generating PR heads and preserves review parity.
 const parent=await gh("/repos/"+ROOT+"/git/commits/"+root);
 if(!SHA.test(parent?.tree?.sha))fail("missing immutable base tree");
 const [releaseBlob,controlBlob]=await Promise.all([
  gh("/repos/"+ROOT+"/git/blobs","POST",{content:Buffer.from(JSON.stringify(plan.candidate,null,2)+"\\n").toString("base64"),encoding:"base64"}),
  gh("/repos/"+ROOT+"/git/blobs","POST",{content:Buffer.from(JSON.stringify(plan.control,null,2)+"\\n").toString("base64"),encoding:"base64"})
 ]);
 const tree=await gh("/repos/"+ROOT+"/git/trees","POST",{base_tree:parent.tree.sha,tree:[
  {path:"release/PUBLIC-RELEASE-MATRIX.json",mode:"100644",type:"blob",sha:releaseBlob.sha},
  {path:"release/T0-CONTROL-MATRIX.json",mode:"100644",type:"blob",sha:controlBlob.sha}
 ]});
 const commit=await gh("/repos/"+ROOT+"/git/commits","POST",{
  message:"reconcile(t0): atomically pin public SDK/Cookbooks in both canonical ledgers",tree:tree.sha,parents:[root]
 });
 const [sdkFinal,cookbookFinal,rootFinal]=await Promise.all([head("Taghvim-dev/SDK"),head("Taghvim-dev/cookbooks"),head(ROOT)]);
 if(sdkFinal!==sdk||cookbookFinal!==cookbooks||rootFinal!==root)
  return {status:"RACED_WITH_NEW_SOURCE",writes:0};
 await gh("/repos/"+ROOT+"/git/refs","POST",{ref:"refs/heads/"+BRANCH,sha:commit.sha});
 const pr=await gh("/repos/"+ROOT+"/pulls","POST",{
  title:"reconcile(T0): public SDK and Cookbook SHA-pinned source",
  head:BRANCH,base:"main",draft:false,
  body:"Source-only coordinated release candidate. SDK "+sdk+" (successful main CI "+sdkCi+
   "), Cookbooks "+cookbooks+" (successful main CI "+cookbooksCi+
   "), exact pinned SDK source. NO_GA, no Cloudflare writes. Independent PR review, central CI and protected Sandbox→Production remain mandatory."
 });
 return {status:"CREATED_REVIEWABLE_SOURCE_PR",pr:pr.number,writes:2,sdk,cookbooks};
}
if(process.argv[1]===fileURLToPath(import.meta.url))
 reconcilePublicWidget().then(x=>console.log("T0_PUBLIC_WIDGET_RECONCILE",JSON.stringify(x)))
  .catch(e=>{console.error("::error::"+e.message);process.exitCode=1;});
