#!/usr/bin/env node
/**
 * T=0 Cloudflare sandbox origin authorization. Never send a generated
 * operator credential to a URL trusted only because it ends in workers.dev.
 * Read account subdomain directly from Cloudflare BEFORE any remote mutation.
 * Never print, persist or relay the bearer token.
 */
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";

const VALID_WORKERS=new Set(["taghvim-api-sandbox","taghvim-web-sandbox"]);
const ACCOUNT=/^[0-9a-f]{32}$/i;
const LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const fail=msg=>{throw Error("SANDBOX_ORIGIN_BLOCKED: "+msg)};

export function verifySandboxOrigin({worker,origin,subdomain,accountId}) {
 if(!VALID_WORKERS.has(worker))fail("sandbox Worker name outside immutable allowlist");
 if(!ACCOUNT.test(accountId||""))fail("Cloudflare account identity missing or malformed");
 if(typeof subdomain!=="string" || !LABEL.test(subdomain))fail("Cloudflare account subdomain missing or invalid");
 const expected="https://"+worker+"."+subdomain.toLowerCase()+".workers.dev";
 let actual;
 try{actual=new URL(origin)}catch{fail("invalid sandbox origin URL")}
 if(actual.href!==expected+"/" || actual.username || actual.password ||
    actual.search || actual.hash || actual.pathname!=="/" || actual.port ||
    actual.protocol!=="https:")fail("sandbox origin is not the exact Worker on the authorized Cloudflare account");
 const accountFingerprint=createHash("sha256").update(accountId.toLowerCase()).digest("hex");
 return {schema_version:1,worker,origin:expected,account_sha256:accountFingerprint,
  evidence_source:"Cloudflare Workers account subdomain API",network_writes:false};
}

export async function attestSandboxOrigin({worker,origin,accountId,token,fetcher=fetch}) {
 if(!VALID_WORKERS.has(worker)||!ACCOUNT.test(accountId||"")||!token)
   fail("expected Worker, full Cloudflare account ID and scoped token are mandatory");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+accountId+"/workers/subdomain";
 const response=await fetcher(endpoint,{
   method:"GET",
   headers:{authorization:"Bearer "+token,accept:"application/json"},
   signal:AbortSignal.timeout(12000),
   redirect:"error",
   cache:"no-store"
 });
 if(response.status!==200)fail("Cloudflare could not attest account Worker subdomain (HTTP "+response.status+")");
 const body=await response.json();
 if(body?.success!==true || typeof body?.result?.subdomain!=="string")
   fail("Cloudflare account Worker subdomain proof is missing");
 return verifySandboxOrigin({worker,origin,subdomain:body.result.subdomain,accountId});
}
async function main(){
 const attestation=await attestSandboxOrigin({
   worker:process.env.TAGHVIM_EXPECTED_SANDBOX_WORKER,
   origin:process.env.TAGHVIM_SANDBOX_ORIGIN,
   accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
   token:process.env.CLOUDFLARE_API_TOKEN
 });
 // No API token, no credentials, no personal data. Never claim this is a deploy.
 console.log("T0_SANDBOX_ORIGIN_ATTESTED "+JSON.stringify(attestation));
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1])
  main().catch(e=>{console.error("::error::"+e.message);process.exitCode=1});
