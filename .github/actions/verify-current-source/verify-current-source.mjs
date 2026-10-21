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
 if(t.current_source?.shared_policy_sha!==s.t0_infrastructure_source?.shared_action_sha)
   fail("shared release policy identity drift");
 if(!Array.isArray(t.controls)||t.controls.length<11||new Set(t.controls.map(x=>x.id)).size!==t.controls.length)
   fail("T0 requirement ledger incomplete or duplicated");
 const ci=label==="engine"?c.engine_ci:c.landing_ci;
 if(!/^\d+$/.test(String(ci||"")))fail("source does not have an independently tested CI receipt");
 // SHA-locked admission (not deployment success). No provider token is put in proof.
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
 return {...verifyCurrentRelease({repo,sha,release,controls}),registry_sha:registrySha};
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
