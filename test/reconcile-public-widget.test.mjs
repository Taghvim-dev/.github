import {test} from "node:test";
import assert from "node:assert/strict";
import {buildCandidate} from "../scripts/reconcile-public-widget.mjs";
const a="a".repeat(40), b="b".repeat(40),c="c".repeat(40);
function matrix(){return {
 state:"PREVIEW",general_availability_approved:false,contract_version:"2.1.0",
 repositories:[{name:"SDK",commit:a,ci_run:"11"},{name:"CLI",commit:c,ci_run:"14"},{name:"cookbooks",commit:b,ci_run:"12"}],
 package_identity:{SDK:{commit:a,ci:"11"},CLI:{commit:c,ci:"14"},cookbooks:{commit:b,ci:"12",sdk_source_commit:a}}
};}
test("no source drift creates no PR or GitHub writes",()=>{
 const r=buildCandidate(matrix(),{sdk:a,sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a});
 assert.equal(r.status,"CURRENT");assert.equal(r.candidate,null);
});
test("a reviewed new SDK/cookbook source updates both canonical pins and preserves NO_GA",()=>{
 const before=matrix();
 const r=buildCandidate(before,{sdk:c,sdkCi:55,cookbooks:b,cookbooksCi:32,cookbooksSdkPin:c});
 assert.equal(r.status,"PR_REQUIRED");
 assert.equal(r.candidate.repositories[0].commit,c);
 assert.equal(r.candidate.package_identity.SDK.ci,"55");
 assert.equal(r.candidate.package_identity.cookbooks.sdk_source_commit,c);
 assert.equal(r.candidate.general_availability_approved,false);
 assert.equal(before.repositories[0].commit,a);
});
test("drift between cookbook declared SDK and source-of-truth SDK blocks reconciliation",()=>{
 const r=buildCandidate(matrix(),{sdk:c,sdkCi:22,cookbooks:b,cookbooksCi:33,cookbooksSdkPin:a});
 assert.equal(r.status,"BLOCKED_CROSS_REPO_SOURCE_DRIFT");assert.equal(r.candidate,null);
});
test("malformed SHAs, absent CI proof, and unapproved GA fail closed",()=>{
 assert.throws(()=>buildCandidate({...matrix(),general_availability_approved:true},{sdk:a,sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a}));
 assert.throws(()=>buildCandidate(matrix(),{sdk:"main",sdkCi:11,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a}));
 assert.throws(()=>buildCandidate(matrix(),{sdk:a,sdkCi:0,cookbooks:b,cookbooksCi:12,cookbooksSdkPin:a}));
});
