/** T0 local candidate admission, shared by all six Taghvim repositories.
 * This is a PRE-PR development gate, not a deployer, source-of-truth override or GA receipt.
 * Agents must commit the complete source first, run this from the trusted .github controller,
 * and create/mark a PR Ready only after the exact local HEAD passed.
 */
import {execFileSync,spawnSync} from "node:child_process";
import {readFileSync,realpathSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";

const repoNames=Object.freeze(["engine","landing","SDK","CLI","cookbooks",".github"]);
const step=(name,command,args,env={})=>({name,command,args,env});
export function localAdmissionPlan(repo,{sdkRoot=null}={}){
 if(!repoNames.includes(repo))throw Error("T0_LOCAL_UNKNOWN_REPOSITORY");
 const npm=(name,args)=>step(name,"npm",args);
 const node=(name,args)=>step(name,"node",args);
 const steps={
  engine:[
   npm("dependencies",["ci"]),
   npm("security-audit",["audit","--audit-level=high"]),
   npm("canonical-tests",["test"]),
   npm("production-bundle-dry-run",["run","deploy:dry"])
  ],
  landing:[
   node("vendor-integrity",["scripts/check-vendor-snapshot.mjs"]),
   npm("dependencies",["ci"]),
   npm("persian-and-release-admission",["run","test:copy"]),
   npm("canonical-tests",["test"]),
   npm("comms-contract",["run","comms:check"]),
   npm("security-audit",["audit","--audit-level=high"]),
   npm("all-workers-dry-run",["run","deploy:dry"])
  ],
  SDK:[
   npm("js-contract-and-sdk",["test"]),
   step("python-sdk","python",["-m","unittest","discover","-s","python/tests","-v"],{PYTHONPATH:"python"}),
   step("python-examples","python",["-m","compileall","-q","examples/python"])
  ],
  CLI:[
   npm("cli-contract-and-offline",["test"]),
   node("cli-source-syntax",["--check","src/cli.mjs"]),
   node("cli-entry-syntax",["--check","bin/taghvim.mjs"]),
   node("public-health-read-only",["bin/taghvim.mjs","health"]),
   node("public-version-read-only",["bin/taghvim.mjs","versions"])
  ],
  cookbooks:[
   npm("cookbook-contract",["test"])
  ],
  ".github":[
   node("public-copy",["scripts/check-public-copy.mjs"]),
   node("current-source-cohort",["scripts/reconcile-source-cohort.mjs","--check"]),
   node("canonical-ci-tests",["--test","test/ci-incident.test.mjs","test/reconcile-public-widget.test.mjs","test/release-pins.test.mjs"]),
   node("public-registry",["scripts/check-public-registry.mjs"])
  ]
 }[repo];
 if(repo==="cookbooks"){
  if(typeof sdkRoot!=="string"||!sdkRoot.trim())throw Error("T0_LOCAL_PEER_SDK_REQUIRED");
  steps.unshift(npm("install-pinned-peer-sdk",["install","--no-save","--ignore-scripts","--no-audit","--no-fund",join(resolve(sdkRoot),"javascript")]));
  steps.push(step("sdk-python-recipes","python",["-m","compileall","-q","python"],{PYTHONPATH:join(resolve(sdkRoot),"python")}));
 }
 for(const item of steps){
  const flat=[item.command,...item.args].join(" ");
  if(/(?:wrangler\s+(?:deploy|d1\s+migrations\s+apply)|npm\s+run\s+deploy(?!:dry))\b/.test(flat))
   throw Error("T0_LOCAL_PRODUCTION_EFFECT_FORBIDDEN");
 }
 return Object.freeze(steps);
}
function command(cwd,bin,args,env=process.env){
 const result=spawnSync(bin,args,{cwd,env,stdio:"inherit",shell:false});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error("T0_LOCAL_ADMISSION_FAILED "+bin+" "+args.join(" ")+" exit="+result.status);
}
function capture(cwd,bin,args){
 return execFileSync(bin,args,{cwd,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}
export function verifyLocalSource(cwd,repo){
 const root=realpathSync(resolve(cwd));
 if(capture(root,"git",["rev-parse","--show-toplevel"])!==root)throw Error("T0_LOCAL_NOT_REPOSITORY_ROOT");
 const remote=capture(root,"git",["remote","get-url","origin"]);
 if(!new RegExp("(?:github[.]com[:/])Taghvim-dev/"+repo.replace(".","[.]")+"(?:[.]git)?$","i").test(remote))
  throw Error("T0_LOCAL_UNTRUSTED_REPOSITORY_ORIGIN");
 const sha=capture(root,"git",["rev-parse","--verify","HEAD"]);
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error("T0_LOCAL_INVALID_HEAD");
 if(capture(root,"git",["status","--porcelain"]).length)throw Error("T0_LOCAL_DIRTY_WORKTREE_COMMIT_FIRST");
 return {root,sha};
}
function verifyCookbookPeer(cwd,sdkRoot){
 const peer=verifyLocalSource(sdkRoot,"SDK");
 const pinned=JSON.parse(readFileSync(join(cwd,"release/SDK-SOURCE.json"),"utf8"));
 if(pinned.repository!=="Taghvim-dev/SDK"||pinned.commit!==peer.sha)
  throw Error("T0_LOCAL_PEER_SDK_SHA_DRIFT");
 const a=readFileSync(join(cwd,"contracts/operation-index.json"),"utf8");
 const b=readFileSync(join(peer.root,"contracts/operation-index.json"),"utf8");
 if(JSON.stringify(JSON.parse(a))!==JSON.stringify(JSON.parse(b)))
  throw Error("T0_LOCAL_SDK_OPERATION_CONTRACT_DRIFT");
}
export function argumentsFor(argv){
 const opts={};
 for(let i=0;i<argv.length;i+=2){
  if(!["--repo","--cwd","--sdk-root"].includes(argv[i])||typeof argv[i+1]!=="string")
   throw Error("T0_LOCAL_UNRECOGNIZED_ARGUMENT");
  if(Object.hasOwn(opts,argv[i]))throw Error("T0_LOCAL_DUPLICATE_ARGUMENT");
  opts[argv[i]]=argv[i+1];
 }
 if(!opts["--repo"]||!opts["--cwd"])throw Error("T0_LOCAL_REPO_AND_CWD_REQUIRED");
 return {repo:opts["--repo"],cwd:opts["--cwd"],sdkRoot:opts["--sdk-root"]??null};
}
export function runLocalAdmission({repo,cwd,sdkRoot=null}){
 const src=verifyLocalSource(cwd,repo);
 const steps=localAdmissionPlan(repo,{sdkRoot});
 if(repo==="cookbooks")verifyCookbookPeer(src.root,sdkRoot);
 command(src.root,"git",["diff","--check"]);
 for(const s of steps){
  process.stdout.write("T0_LOCAL_ADMISSION_STAGE "+repo+" "+s.name+"\n");
  command(src.root,s.command,s.args,{...process.env,...s.env});
 }
 if(capture(src.root,"git",["rev-parse","HEAD"])!==src.sha)
  throw Error("T0_LOCAL_SOURCE_CHANGED_DURING_PREFLIGHT");
 return {schema:"taghvim.t0.local-dev-admission.v1",repository:"Taghvim-dev/"+repo,
  source_sha:src.sha,outcome:"LOCAL_PREFLIGHT_PASSED",checks:steps.map(s=>s.name),
  production_mutation:false,ga_approved:false,
  note:"Local source evidence only. Protected PR and release checks remain independently mandatory."};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log("T0_LOCAL_ADMISSION_RECEIPT",JSON.stringify(runLocalAdmission(argumentsFor(process.argv.slice(2)))))}
 catch(e){console.error("T0_LOCAL_ADMISSION_BLOCKED",e.message);process.exitCode=1;}
}
