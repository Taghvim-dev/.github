#!/usr/bin/env node
/** Fail-closed GitHub protected production environment admission.
 * No Cloudflare writes and no secret values in logs.
 */
import {fileURLToPath} from "node:url";
import {verifyIndependentReview} from "./independent-review.mjs";
import {verifyOwnerApproval} from "../verify-owner-approval/verify-owner-approval.mjs";

export function verifyEnvironment(env, policies, branch, independentReview=null, ownerApproval=null) {
  // Branch Protection is temporarily optional at the owner's explicit request.
  // The checkout/ref must still be the *current* main Git tree: independent
  // verify-current-source admission runs before this action and prior to writes.
  if(branch!=="main")throw Error("Only current main may enter production");
  if(env?.name!=="production" || !Number.isInteger(env?.id)) throw Error("Production environment missing");
  const approval=(env.protection_rules||[]).find(p=>p?.type==="required_reviewers");
  // Native required reviewers are unavailable on non-Enterprise PRIVATE repos.
  // Never silently weaken a partially configured native rule.
  if(approval && (approval.prevent_self_review!==true ||
      !Array.isArray(approval.reviewers) || approval.reviewers.length===0))
    throw Error("Native production reviewer rule is misconfigured");
  const humanReview=independentReview?.independent_from_owner===true &&
    independentReview?.production_mutation===false &&
    independentReview?.kind==="taghvim_t0_independent_issue_review";
  // Explicit GitHub Free owner delegation. Not an independent second reviewer.
  // It is valid ONLY when a real GitHub issue comment for this exact SHA and
  // exact component has just been independently re-read from the GitHub API.
  const ownerAuthorized=ownerApproval?.kind==="taghvim_t0_owner_comment_approval" &&
    ownerApproval?.owner_verified===true &&
    ownerApproval?.remote_mutation===false &&
    ownerApproval?.production_approved===false &&
    /^[a-f0-9]{40}$/.test(ownerApproval?.source_sha||"");
  if(!approval && !humanReview && !ownerAuthorized)
    throw Error("Production requires native independent reviewers, a separate human, OR explicit owner SHA-bound release on GitHub Free");
  const p=env.deployment_branch_policy||{};
  if(p.custom_branch_policies===true){
    if(!Array.isArray(policies) || !policies.some(x=>x?.name===branch))
      throw Error("Production branch restriction must explicitly allow only the release branch");
    if(policies.some(x=>x?.name!==branch))
      throw Error("Production branch restriction includes an unexpected branch");
  }
  // GitHub protection of main is deferred; the source gate verifies the exact
  // immutable reviewed SHA and latest main HEAD on *every* release attempt.
  // Do not misrepresent delegated owner approval as independent review.
  const mode=approval?"native_required_reviewers":humanReview?
    "two_person_sha_bound_git_review":"owner_sha_bound_free_delegation";
  return {environment:"production",review_required:mode!=="owner_sha_bound_free_delegation",
    prevent_self_review:mode!=="owner_sha_bound_free_delegation",
    owner_explicit_release:true,approval_mode:mode,
    branch_policy:p.custom_branch_policies?"only_main":(p.protected_branches?"protected_main":"sha_pinned_main"),approved_candidate_branch:branch,
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
  // The owner authorizes SHA-pinned Production through the original comment
  // dispatch; verify it AGAIN here, independent of the preceding action.
  // A GitHub Free repo does not require Enterprise-native reviewers or a fake
  // delegated reviewer identity. A real second reviewer remains optional.
  const native=(env.protection_rules||[]).find(p=>p?.type==="required_reviewers");
  const ownerProof=await verifyOwnerApproval({
    repo,sha:process.env.GITHUB_SHA,token,
    phrase:process.env.APPROVAL_PHRASE,
    commentId:process.env.APPROVAL_COMMENT_ID
  });
  const independent=null; // Never invent human sign-off or read absent comments.
  const state=verifyEnvironment(env,policies,"main",independent,ownerProof);
  if(state.approval_mode==="owner_sha_bound_free_delegation") {
    if(ownerProof.repository!==repo || ownerProof.source_sha!==process.env.GITHUB_SHA)
      throw Error("Owner delegation is not bound to the exact current main SHA");
  }
  // The immutable source gate (upstream) verifies current main and full tested
  // Git tree. Do not demand GitHub branch protection during this phase.
  console.log("PROTECTED_ENVIRONMENT_ADMISSION_PASSED",JSON.stringify(state));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(e=>{console.error("::error::PRODUCTION_ENVIRONMENT_BLOCKED: "+e.message);process.exitCode=1});
}
