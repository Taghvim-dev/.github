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
  if(!sha.test(item?.sha||"")||!ci.test(String(item?.ci||""))||
  item.workflow_id!==(n==="engine"?372423484:390048334))block("missing immutable "+n+" CI authority");
  s[n+"_main_merge_sha"]=item.sha;
  s.latest_checked[n+"_sha"]=item.sha;s.latest_checked[n+"_ci"]=item.ci;
  s.t0_cross_repo_source_admission[n+"_main_sha"]=item.sha;
  s.t0_cross_repo_source_admission[n+"_reviewed_head"]=item.sha;
  s.t0_cross_repo_source_admission[n+"_ci_run"]=item.ci;
  if(!r.package_identity?.[n])block("missing product identity "+n);
  r.package_identity[n].commit=item.sha;r.package_identity[n].ci=item.ci;
  t.current_source[n+"_main_sha"]=item.sha;
  for(const x of t.controls){
   if(x.dependent_component_ci?.[n])x.dependent_component_ci[n]=item.ci;
   if(x.component_source_ci?.[n])x.component_source_ci[n]=item.ci;
  }
 }
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
