import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyEnvironment} from "../.github/actions/verify-production-environment/verify-environment.mjs";
const base={id:123,name:"production",protection_rules:[{type:"required_reviewers",prevent_self_review:true,reviewers:[{type:"User",reviewer:{login:"approver"}}]}],deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
test("accepts precisely main and an independent mandatory reviewer",()=>{
 const x=verifyEnvironment(base,[{name:"main"}],"main");
 assert.equal(x.ready_to_check_deploy,true);
 assert.equal(x.general_availability_approved,false);
});
test("forbids unprotected implicit environments, missing approvals and self approvals",()=>{
 for(const env of [
  {...base,name:"preview"}, {...base,id:null},
  {...base,protection_rules:[]},
  {...base,protection_rules:[{type:"required_reviewers",prevent_self_review:false,reviewers:[{}]}]},
  {...base,protection_rules:[{type:"required_reviewers",prevent_self_review:true,reviewers:[]}]},
  {...base,deployment_branch_policy:{custom_branch_policies:false,protected_branches:false}}
 ]) assert.throws(()=>verifyEnvironment(env,[{name:"main"}],"main"));
});
test("branch policy must not permit parallel unreviewed deployments",()=>{
 assert.throws(()=>verifyEnvironment(base,[{name:"other"}],"main"));
 assert.throws(()=>verifyEnvironment(base,[{name:"main"},{name:"preview"}],"main"));
 assert.throws(()=>verifyEnvironment(base,null,"main"));
});
