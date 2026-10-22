import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyEnvironment} from "../.github/actions/verify-production-environment/verify-environment.mjs";
const base={id:123,name:"production",protection_rules:[{type:"required_reviewers",prevent_self_review:true,reviewers:[{type:"User",reviewer:{login:"approver"}}]}],deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
test("accepts precisely main and an independent mandatory reviewer",()=>{
 const x=verifyEnvironment(base,[{name:"main"}],"main");
 assert.equal(x.ready_to_check_deploy,true);
 assert.equal(x.general_availability_approved,false);
});
test("rejects missing production/reviewer identity and self-approval, regardless of branch protection",()=>{
 for(const env of [
  {...base,name:"preview"}, {...base,id:null},
  {...base,protection_rules:[]},
  {...base,protection_rules:[{type:"required_reviewers",prevent_self_review:false,reviewers:[{}]}]},
  {...base,protection_rules:[{type:"required_reviewers",prevent_self_review:true,reviewers:[]}]}
 ]) assert.throws(()=>verifyEnvironment(env,[{name:"main"}],"main"));
});
test("branch policy must not permit parallel unreviewed deployments",()=>{
 assert.throws(()=>verifyEnvironment(base,[{name:"other"}],"main"));
 assert.throws(()=>verifyEnvironment(base,[{name:"main"},{name:"preview"}],"main"));
 assert.throws(()=>verifyEnvironment(base,null,"main"));
});

test("deferred branch protection keeps mandatory production reviewers and current main attestation",()=>{
  const noBranchProtection={...base,deployment_branch_policy:{custom_branch_policies:false,protected_branches:false}};
  const result=verifyEnvironment(noBranchProtection,null,"main");
  assert.equal(result.branch_policy,"sha_pinned_main");
  assert.equal(result.review_required,true);
  assert.equal(result.prevent_self_review,true);
  assert.throws(()=>verifyEnvironment(noBranchProtection,null,"feature-untrusted"),/Only current main/);
  assert.throws(()=>verifyEnvironment({...noBranchProtection,protection_rules:[]},null,"main"),/reviewer/);
});

test("private-repository independent human SHA attestation can replace unavailable native GitHub reviewers",()=>{
 const noNative={...base,protection_rules:[]};
 const independent={kind:"taghvim_t0_independent_issue_review",
  independent_from_owner:true,production_mutation:false};
 const r=verifyEnvironment(noNative,[{name:"main"}],"main",independent);
 assert.equal(r.approval_mode,"two_person_sha_bound_git_review");
 assert.equal(r.review_required,true);
 assert.throws(()=>verifyEnvironment(noNative,[{name:"main"}],"main",{}),/independent reviewer|second-person/);
 assert.throws(()=>verifyEnvironment(noNative,[{name:"main"}],"main",{...independent,production_mutation:true}));
 assert.throws(()=>verifyEnvironment({...noNative,protection_rules:[{type:"required_reviewers",reviewers:[],prevent_self_review:false}]},[{name:"main"}],"main",independent),/misconfigured/);
});
