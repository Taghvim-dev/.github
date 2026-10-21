#!/usr/bin/env node
/**
 * T=0 PRE-WRITE admission for separately versioned Taghvim repositories.
 * A successful PR test is never proof that the currently dispatched SHA was
 * entered into the canonical release ledger. Never fetch from an untrusted URL.
 * Both sandbox and production invoke this before remote Cloudflare operations.
 */
import {Buffer} from "node:buffer";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const OWNER="Taghvim-dev";
const PATHS=["release/PUBLIC-RELEASE-MATRIX.json","release/T0-CONTROL-MATRIX.json"];
const SHA=/^[a-f0-9]{40}$/;
const AUTHORIZED_TEST_WORKFLOWS=Object.freeze({
 engine:Object.freeze({name:"test",id:372423484}),
 landing:Object.freeze({name:"landing-verify",id:390048334})
});
const fail=message=>{throw Error("T0_SOURCE_ADMISSION_BLOCKED: "+message)};

export function verifyCurrentRelease({repo,sha,release,controls}){
 const part=typeof repo==="string"?repo.split("/"):[], name=part[1];
 if(part.length!==2||part[0]!==OWNER||!["engine","landing"].includes(name))
   fail("only approved Taghvim production repositories are admitted");
 if(!SHA.test(sha||""))fail("running revision is not an immutable 40-hex SHA");
 const s=release?.source_verification||{}, c=s.latest_checked||{},t=controls||{};
 const label=name==="engine"?"engine":"landing";
 const canonical=label==="engine"?s.engine_main_merge_sha:s.landing_main_merge_sha;
 const current=label==="engine"?c.engine_sha:c.landing_sha;
 if(canonical!==sha||current!==sha)fail("running "+label+" main SHA differs from canonical and current release matrix");
 // Neither repo may silently diverge even when this run belongs to the other.
 for(const component of ["engine","landing"]){
  const canonicalValue=component==="engine"?s.engine_main_merge_sha:s.landing_main_merge_sha;
  const currentValue=component==="engine"?c.engine_sha:c.landing_sha;
  const t0Value=t.current_source?.[component+"_main_sha"];
  if(!SHA.test(canonicalValue||"")||canonicalValue!==currentValue||currentValue!==t0Value)
   fail("cross-repository "+component+" canonical/checked/T0 SHA drift");
 }
 if(s.date!==c.date)fail("canonical vs current observation date drift");
 if(release.contract_version!=="2.1.0"||t.contract_version!==release.contract_version)fail("contract version mismatch");
 if(release.general_availability_approved!==t.general_availability_approved)
   fail("release approval split-brain");
 if(!["PREVIEW","READY"].includes(release.state))fail("unknown release lifecycle state");
 if(c.sandbox_to_production_status==="GO"&&release.general_availability_approved!==true)
   fail("invalid promotion status claiming an unapproved GA release");
 const shared=t.current_source?.shared_policy_sha;
 const origin=s.t0_infrastructure_source?.shared_action_sha;
 const pinned=t.current_source?.prewrite_source_policy_sha;
 const approved=s.t0_cross_repo_source_admission?.policy_main_sha;
 if(![shared,origin,pinned,approved].every(x=>SHA.test(x||""))||
   shared!==origin||pinned!==approved)
   fail("missing or divergent immutable release policy SHA");
 if(!Array.isArray(t.controls)||t.controls.length<11||new Set(t.controls.map(x=>x.id)).size!==t.controls.length)
   fail("T0 requirement ledger incomplete or duplicated");
 const ci=label==="engine"?c.engine_ci:c.landing_ci;
 if(!/^[0-9]+$/.test(String(ci||"")))fail("source does not have an independently tested CI receipt");
 const proof=s.t0_cross_repo_source_admission||{};
 const testedHead=proof[label+"_reviewed_head"];
 if(proof[label+"_main_sha"]!==sha||proof[label+"_ci_run"]!==ci||!SHA.test(testedHead||""))
   fail("CI receipt, reviewed PR head or main SHA is not bound to current source");
 if(proof.cross_repo_immutable_ref!==true||proof.post_facto_ga_authorization!==false||
   proof.admission_scope!=="MUTATION_BLOCKING_SOURCE_ONLY")
   fail("canonical source attestation scope is not reviewed and immutable");
 // A receipt number by itself never proves CI success. The async admission
 // independently checks GitHub's workflow run and the tested full Git tree.
 return {schema_version:1,kind:"taghvim_t0_source_admission",
  repository:repo,source_sha:sha,contract_version:release.contract_version,
  control_count:t.controls.length,ci_receipt:String(ci),
  release_matrix_sha256:createHash("sha256").update(JSON.stringify(release)).digest("hex"),
  control_matrix_sha256:createHash("sha256").update(JSON.stringify(t)).digest("hex"),
  remote_mutations:false,production_attested:false};
}

export async function attestCurrentRelease({repo,sha,token,fetcher=fetch}){
 if(!token)fail("GitHub read token unavailable");
 const headers={authorization:"Bearer "+token,accept:"application/vnd.github+json",
  "x-github-api-version":"2022-11-28"};
 if(!SHA.test(sha||"")||!["Taghvim-dev/engine","Taghvim-dev/landing"].includes(repo))
  fail("unexpected production repository or immutable source SHA");
 // Reject an in-flight checkout of a superseded main commit, even if a stale
 // registry still names it. This prevents after-the-fact code promotion.
 const sourceHead=await fetcher("https://api.github.com/repos/"+repo+"/git/ref/heads/main",{
  method:"GET",redirect:"error",cache:"no-store",headers,signal:AbortSignal.timeout(12000)});
 if(sourceHead?.status!==200)fail("cannot read current component main HEAD");
 const sourceRef=await sourceHead.json();
 if(sourceRef?.ref!=="refs/heads/main"||sourceRef?.object?.type!=="commit"||sourceRef?.object?.sha!==sha)
  fail("running revision is not the current component main HEAD");
 const base="https://api.github.com/repos/"+OWNER+"/.github";
 const headResponse=await fetcher(base+"/git/ref/heads/main",{
  method:"GET",redirect:"error",cache:"no-store",headers,signal:AbortSignal.timeout(12000)});
 if(headResponse?.status!==200)fail("cannot independently pin canonical registry main SHA");
 const head=await headResponse.json(),registrySha=head?.object?.sha;
 if(head?.ref!=="refs/heads/main"||head?.object?.type!=="commit"||!SHA.test(registrySha||""))
  fail("canonical registry main ref is not a verified Git commit");
 async function get(path){
  const url=base+"/contents/"+path+"?ref="+registrySha;
  const res=await fetcher(url,{method:"GET",redirect:"error",cache:"no-store",
    headers,
    signal:AbortSignal.timeout(12000)});
  if(!res||res.status!==200)fail("canonical GitHub ledger not readable: "+path+" HTTP "+res?.status);
  const envelope=await res.json();
  if(envelope?.type!=="file"||envelope.encoding!=="base64"||typeof envelope.content!=="string")
   fail("unexpected canonical GitHub file response: "+path);
  try{return JSON.parse(Buffer.from(envelope.content.replace(/\s/g,""),"base64").toString("utf8"))}
  catch{fail("canonical GitHub JSON invalid: "+path)}
 }
 const [release,controls]=await Promise.all(PATHS.map(get));
 const proof=verifyCurrentRelease({repo,sha,release,controls});
 const label=repo.split("/")[1],ad=release.source_verification.t0_cross_repo_source_admission;
 const ciResponse=await fetcher("https://api.github.com/repos/"+repo+"/actions/runs/"+proof.ci_receipt,{
  method:"GET",redirect:"error",cache:"no-store",headers,signal:AbortSignal.timeout(12000)});
 if(ciResponse?.status!==200)fail("independently read-only CI run verification failed");
 const ci=await ciResponse.json();
 const expectedWorkflow=AUTHORIZED_TEST_WORKFLOWS[label];
 if(ci?.id!==Number(proof.ci_receipt)||
    ci?.name!==expectedWorkflow.name||ci?.workflow_id!==expectedWorkflow.id||
    ci?.repository?.full_name!==repo||!new Set(["push","pull_request"]).has(ci?.event)||
    ci?.status!=="completed"||ci?.conclusion!=="success"||!SHA.test(ci?.head_sha||""))
    fail("CI run is not the completed successful source workflow for this repository");
 const reviewedSHA=ad[label+"_reviewed_head"];
 if(ci.head_sha!==sha&&ci.head_sha!==reviewedSHA)
   fail("successful workflow was not run on the approved source or reviewed PR head");
 // Squash merges produce new commit SHAs: require equality of the ENTIRE Git
 // tree for the tested source and the actual release HEAD, not just files.
 async function gitTree(commit){
  const res=await fetcher("https://api.github.com/repos/"+repo+"/git/commits/"+commit,{
   method:"GET",redirect:"error",cache:"no-store",headers,signal:AbortSignal.timeout(12000)});
  if(res?.status!==200)fail("cannot independently attest immutable Git tree");
  const body=await res.json(),tree=body?.tree?.sha;
  if(body?.sha!==commit||!SHA.test(tree||""))fail("missing Git tree SHA attestation");
  return tree;
 }
 const liveTree=await gitTree(sha);
 const testedTree=ci.head_sha===sha?liveTree:await gitTree(ci.head_sha);
 if(liveTree!==testedTree)fail("successful source tree differs from squash-merged main tree");
 return {...proof,registry_sha:registrySha,source_tree_sha:liveTree,
  tested_workflow:expectedWorkflow.name,tested_workflow_id:expectedWorkflow.id,tested_head_sha:ci.head_sha,
  tested_ci_status:"completed_success",commit_tree_identity_verified:true};
}
async function main(){
 if(process.env.GITHUB_REF!=="refs/heads/main")
   fail("sandbox/production may only be dispatched on main");
 const proof=await attestCurrentRelease({repo:process.env.GITHUB_REPOSITORY,
  sha:process.env.GITHUB_SHA,token:process.env.GITHUB_TOKEN});
 console.log("T0_CURRENT_SOURCE_ADMISSION_PASSED "+JSON.stringify(proof));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])
 main().catch(e=>{console.error("::error::"+e.message);process.exitCode=1});
