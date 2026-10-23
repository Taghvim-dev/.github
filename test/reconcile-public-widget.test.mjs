import {test} from "node:test";
import assert from "node:assert/strict";
import {buildCandidate,buildAtomicCandidate} from "../scripts/reconcile-public-widget.mjs";
import {readFileSync} from "node:fs";
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

test("coupled SDK/Cookbooks changes update both T0 ledgers without live authorization",()=>{
 const before=matrix();
 before.post_release_observation_20261023={
  sdk_current_source_commit:a,sdk_current_main_ci_run:"11",
  cookbooks_current_source_commit:b,cookbooks_current_main_ci_run:"12"
 };
 const control={contract_version:"2.1.0",general_availability_approved:false,
  post_release_observation_20261023:structuredClone(before.post_release_observation_20261023),
  controls:[{id:"T0-PACKAGES-014",dependent_component_ci:{SDK:"11",cookbooks:"12"}}]};
 const r=buildAtomicCandidate(before,control,{sdk:c,sdkCi:55,cookbooks:b,cookbooksCi:32,cookbooksSdkPin:c});
 assert.equal(r.status,"PR_REQUIRED");
 assert.equal(r.candidate.repositories[0].commit,c);
 assert.equal(r.control.controls[0].dependent_component_ci.SDK,"55");
 assert.equal(r.control.controls[0].dependent_component_ci.cookbooks,"32");
 assert.equal(r.candidate.post_release_observation_20261023.sdk_current_source_commit,c);
 assert.equal(r.candidate.post_release_observation_20261023.cookbooks_current_main_ci_run,"32");
 assert.deepEqual(r.candidate.post_release_observation_20261023,r.control.post_release_observation_20261023);
 assert.equal(before.post_release_observation_20261023.sdk_current_source_commit,a);
 assert.equal(control.controls[0].dependent_component_ci.SDK,"11");
 assert.equal(r.candidate.general_availability_approved,false);
});
test("missing or divergent T0 control ledger fails closed before creating a PR",()=>{
 const before=matrix();before.post_release_observation_20261023={sdk_current_source_commit:a};
 const input={sdk:c,sdkCi:55,cookbooks:b,cookbooksCi:32,cookbooksSdkPin:c};
 assert.throws(()=>buildAtomicCandidate(before,null,input),/canonical matrices/);
 assert.throws(()=>buildAtomicCandidate(before,{contract_version:"2.1.0",general_availability_approved:false,post_release_observation_20261023:{different:true},controls:[]},input),/canonical matrices/);
 const source=readFileSync(new URL("../scripts/reconcile-public-widget.mjs",import.meta.url),"utf8");
 assert.match(source,/git\\/trees/);
 assert.match(source,/git\\/commits/);
 assert.doesNotMatch(source,/contents\\/release\\/PUBLIC-RELEASE-MATRIX\\.json","PUT"/);
});
