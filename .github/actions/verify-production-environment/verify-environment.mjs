#!/usr/bin/env node
/** Fail-closed GitHub protected production environment admission.
 * No Cloudflare writes and no secret values in logs.
 */
import {fileURLToPath} from "node:url";

export function verifyEnvironment(env, policies, branch) {
  if(env?.name!=="production" || !Number.isInteger(env?.id)) throw Error("Production environment missing");
  const approval=(env.protection_rules||[]).find(p=>p?.type==="required_reviewers");
  if(!approval || approval.prevent_self_review!==true ||
      !Array.isArray(approval.reviewers) || approval.reviewers.length===0)
    throw Error("Production must require independent reviewer(s) and prevent self-review");
  const p=env.deployment_branch_policy||{};
  if(p.custom_branch_policies===true){
    if(!Array.isArray(policies) || !policies.some(x=>x?.name===branch))
      throw Error("Production branch restriction must explicitly allow only the release branch");
    if(policies.some(x=>x?.name!==branch))
      throw Error("Production branch restriction includes an unexpected branch");
  } else if(p.protected_branches!==true) {
    throw Error("No protected branch deployment policy");
  }
  return {environment:"production",review_required:true,prevent_self_review:true,
    branch_policy:p.custom_branch_policies?"only_main":"protected_main",approved_candidate_branch:branch,
    ready_to_check_deploy:true,general_availability_approved:false};
}
async function main(){
  const repo=process.env.GITHUB_REPOSITORY||"";
  const [owner,name]=repo.split("/");
  if(owner!=="Taghvim-dev" || !["engine","landing"].includes(name))
    throw Error("Not a permitted protected production repository");
  if(process.env.GITHUB_REF!=="refs/heads/main")throw Error("Only main may reach deployment");
  const token=process.env.GITHUB_TOKEN;
  if(!token)throw Error("No GitHub token to verify environment protection");
  async function read(path){
    const response=await fetch("https://api.github.com/repos/"+repo+"/"+path,{
      headers:{"accept":"application/vnd.github+json","authorization":"Bearer "+token,
      "x-github-api-version":"2022-11-28"},
      signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error("Cannot independently attest production configuration: HTTP "+response.status);
    return response.json();
  }
  const env=await read("environments/production");
  const policies=env?.deployment_branch_policy?.custom_branch_policies?
    (await read("environments/production/deployment-branch-policies?per_page=100")).branch_policies:null;
  const state=verifyEnvironment(env,policies,"main");
  if(env.deployment_branch_policy?.protected_branches===true){
    const mainBranch=await read("branches/main");
    if(mainBranch?.protected!==true)throw Error("Main branch is not protected");
  }
  console.log("PROTECTED_ENVIRONMENT_ADMISSION_PASSED",JSON.stringify(state));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error("::error::PRODUCTION_ENVIRONMENT_BLOCKED: "+e.message);process.exitCode=1});
}
