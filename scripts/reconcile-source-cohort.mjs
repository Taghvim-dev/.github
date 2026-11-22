#!/usr/bin/env node
/** T=0 constitutional single-source projection, strictly read-only and
 * deterministic. Historical deployment/incident receipts never change.
 * Publish both projections via ONE reviewed Git tree, never separate writes.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const sha=/^[0-9a-f]{40}$/;
const ci=/^[1-9][0-9]*$/;
const copy=x=>JSON.parse(JSON.stringify(x));
const block=x=>{throw Error("T0_COHORT_BLOCKED: "+x);};
export function projectSourceCohort(source,release,controls){
 if(source?.schema_version!==1||source.kind!=="taghvim.t0.canonical_source_cohort"||
 source.authority!=="Taghvim-dev/.github"||source.source_only!==true||
 source.remote_ci_evidence_required!==true||source.ga_approved!==false||
 source.payment_enabled!==false)block("untrusted canonical authority");
 if(release?.general_availability_approved!==false||controls?.general_availability_approved!==false||
 release?.package_identity?.remote_runtime_attested!==false||
 release?.nonpayment_ga_scope?.customer_checkout_enabled!==false||
 controls?.nonpayment_ga_scope?.paid_checkout_enabled!==false||
 release?.source_verification?.latest_checked?.sandbox_to_production_status!=="NO_GO")
 block("source cohort cannot approve GA, payment or runtime");
 const r=copy(release),t=copy(controls),s=r.source_verification;
 if(!s?.latest_checked||!s?.t0_cross_repo_source_admission||!Array.isArray(t.controls)||!t.current_source)
 block("missing canonical projections");
 for(const n of ["engine","landing"]){
  const item=source[n];
  // Squash-main source SHA and the independently reviewed/tested PR head are
  // different authorities. A canonical cohort must bind BOTH, never pretend a
  // PR CI run executed on a new squash commit or rewrite the real CI head.
  const reviewed=item?.reviewed_sha||item?.sha;
  if(!sha.test(reviewed||"")||
     !sha.test(item?.sha||"")||!ci.test(String(item?.ci||""))||
  item.workflow_id!==(n==="engine"?372423484:390048334))block("missing immutable "+n+" CI authority");
  s[n+"_main_merge_sha"]=item.sha;
  s.latest_checked[n+"_sha"]=item.sha;s.latest_checked[n+"_ci"]=item.ci;
  s.t0_cross_repo_source_admission[n+"_main_sha"]=item.sha;
  s.t0_cross_repo_source_admission[n+"_reviewed_head"]=reviewed;
  s.t0_cross_repo_source_admission[n+"_ci_run"]=item.ci;
  if(!r.package_identity?.[n])block("missing product identity "+n);
  r.package_identity[n].commit=item.sha;r.package_identity[n].ci=item.ci;
  t.current_source[n+"_main_sha"]=item.sha;
  // One reviewed PR head and its exact-source CI are the control authority.
  // Never let old control-matrix projections survive a new cohort SHA.
  if(n==="engine"){
   t.current_source.engine_pr_head_sha=reviewed;
   t.current_source.engine_source_ci_run=item.ci;
  }
  for(const x of t.controls){
   if(x.dependent_component_ci?.[n])x.dependent_component_ci[n]=item.ci;
   if(x.component_source_ci?.[n])x.component_source_ci[n]=item.ci;
  }
 }
 // T0: every active cohort mirror is projected from one canonical source.
 const active=t.current_source?.source_cohort_20261122;
 if(!active?.engine||!active?.landing||!Number.isInteger(source.engine.reviewed_pr)||
    source.engine.reviewed_pr<1||!sha.test(source.engine.reviewed_tree||""))
  block("missing canonical reviewed PR / immutable Git tree");
 Object.assign(active.engine,{main:source.engine.sha,reviewed_head:source.engine.reviewed_sha,
  reviewed_pr:source.engine.reviewed_pr,ci_run:source.engine.ci,
  verified_equal_git_tree:source.engine.reviewed_tree});
 if(active.landing.main!==source.landing.sha||active.landing.reviewed_head!==source.landing.reviewed_sha||
    String(active.landing.ci_run)!==String(source.landing.ci))
  block("landing source evidence drift");
 const ciProof=source.source_ci_attestation_20261122;
 if(ciProof?.engine?.reviewed_head!==source.engine.reviewed_sha||
    String(ciProof?.engine?.successful_ci_run)!==String(source.engine.ci)||
    ciProof.engine.main_tree_equals_reviewed_tree!==true||
    ciProof?.landing?.reviewed_head!==source.landing.reviewed_sha||
    String(ciProof?.landing?.successful_ci_run)!==String(source.landing.ci))
  block("reviewed CI attestation split brain");
 const publicProof=source.public_ci_attestation_20261122;
 const publicActive=t.current_source?.public_cohort_20261122;
 if(!publicActive)block("public cohort projection target absent");
 for(const [name,key] of [["SDK","sdk"],["CLI","cli"],["cookbooks","cookbooks"]]){
  if(publicProof?.[name]?.sha!==source[name]?.sha||
    String(publicProof?.[name]?.ci)!==String(source[name]?.ci)||!publicActive[key])
   block("public exact SHA/CI split brain "+name);
  publicActive[key].sha=source[name].sha;
  publicActive[key].ci=source[name].ci;
 }
 if(publicProof?.public_operations!==source.public_contract.operation_count)
  block("public operation count proof diverges");
 publicActive.openapi_git_blob_sha=source.public_contract.openapi_git_blob_sha;
 publicActive.operation_index_git_blob_sha=source.public_contract.operation_index_git_blob_sha;
 publicActive.operation_count=source.public_contract.operation_count;
 // One universal source authority for every product surface. SDK, CLI and
 // Cookbooks are no longer permitted to write their own independent current
 // source register while the Engine/Landing cohort remains stale.
 const component=["SDK","CLI","cookbooks"];
 const widget=s.widget_sdk_api_integration_20261023;
 const post=r.post_release_observation_20261023;
 const ctrlPost=t.post_release_observation_20261023;
 const packages=t.controls.find(row=>row.id==="T0-PACKAGES-014")?.dependent_component_ci;
 if(!widget||!post||!ctrlPost||!packages)block("missing universal package source projections");
 for(const name of component){
  const entry=source[name];
  if(!sha.test(entry?.sha||"")||!ci.test(String(entry?.ci||"")))
   block("missing canonical "+name+" SHA/CI");
  const matches=r.repositories.filter(x=>x.name===name);
  if(matches.length!==1||!r.package_identity?.[name])
   block("orphan or duplicate universal package "+name);
  matches[0].commit=entry.sha;matches[0].ci_run=entry.ci;
  r.package_identity[name].commit=entry.sha;r.package_identity[name].ci=entry.ci;
  packages[name]=entry.ci;
  const prefix=name==="cookbooks"?"cookbooks":name.toLowerCase();
  const key=prefix+"_current_source_commit",ciKey=prefix+"_current_main_ci_run";
  if(!(key in post)||!(key in ctrlPost)||!(ciKey in post)||!(ciKey in ctrlPost))
   block("source projection missing "+name);
  post[key]=entry.sha;post[ciKey]=entry.ci;
  ctrlPost[key]=entry.sha;ctrlPost[ciKey]=entry.ci;
 }
 if(source.cookbooks.sdk_source_commit!==source.SDK.sha)
  block("Cookbooks source cannot reference a divergent SDK");
 r.package_identity.cookbooks.sdk_source_commit=source.SDK.sha;
 widget.sdk_main_sha=source.SDK.sha;widget.sdk_main_ci_run=source.SDK.ci;
 widget.cookbook_main_sha=source.cookbooks.sha;
 widget.cookbook_main_ci_run=source.cookbooks.ci;
 const pub=source.public_contract;
 if(pub?.contract_version!==r.contract_version||!sha.test(pub?.openapi_git_blob_sha||"")||
    !sha.test(pub?.operation_index_git_blob_sha||"")||
    !Number.isSafeInteger(pub?.operation_count)||pub.operation_count<1)
  block("missing universal public operation authority");
 r.openapi_source_git_blob_sha=pub.openapi_git_blob_sha;
 r.operation_index_git_blob_sha=pub.operation_index_git_blob_sha;
 r.required_public_operation_count=pub.operation_count;
 if(s.t0_cross_repo_source_admission?.post_facto_ga_authorization!==false||
 s.t0_cross_repo_source_admission?.admission_scope!=="MUTATION_BLOCKING_SOURCE_ONLY")
 block("post-facto authority forbidden");
 return {release:r,controls:t};
}
export function verifySourceCohort(source,release,controls){
 const p=projectSourceCohort(source,release,controls);
 try{assert.deepStrictEqual(release,p.release);assert.deepStrictEqual(controls,p.controls);}
 catch{block("SHA/CI source drift across current canonical release matrix projections");}
 return {canonical:true,source_sha_engine:source.engine.sha,source_sha_landing:source.landing.sha,
 ga_approved:false,remote_mutations:false};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(process.argv.length!==3||process.argv[2]!=="--check")
  block("only pre-effect --check supported: projections are applied atomically in a reviewed Git tree");
 const read=p=>JSON.parse(readFileSync(new URL("../"+p,import.meta.url),"utf8"));
 const result=verifySourceCohort(read("release/CANONICAL-SOURCE-COHORT.json"),
  read("release/PUBLIC-RELEASE-MATRIX.json"),read("release/T0-CONTROL-MATRIX.json"));
 console.log("T0_CANONICAL_SOURCE_COHORT_PASS",JSON.stringify(result));
}
