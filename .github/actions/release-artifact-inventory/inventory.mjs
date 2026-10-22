import {appendFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const NAMES=Object.freeze({
 engine:["engine-release-evidence","taghvim-engine-sandbox-promotion"],
 landing:["landing-release-evidence","taghvim-landing-sandbox-promotion"]
});
const fail=x=>{throw Error("T0_ARTIFACT_INVENTORY_BLOCKED: "+x)};
export async function inspect({component,repository,run,token,request=fetch}={}){
 if(!Object.hasOwn(NAMES,component)||!/^Taghvim-dev\/(engine|landing)$/.test(repository||"")||
   component!==repository.split("/")[1]||!/^[0-9]+$/.test(run||"")||!token)fail("INVALID_IMMUTABLE_RUN_OR_SCOPE");
 const res=await request("https://api.github.com/repos/"+repository+"/actions/runs/"+run+"/artifacts?per_page=100",{
  method:"GET",redirect:"error",headers:{authorization:"Bearer "+token,accept:"application/vnd.github+json","x-github-api-version":"2022-11-28"},
  signal:AbortSignal.timeout(15000)});
 if(res?.status!==200)fail("GITHUB_ACTIONS_READ_HTTP_"+res?.status);
 const body=await res.json();
 if(!Array.isArray(body?.artifacts)||typeof body.total_count!=="number"||body.total_count>100)
  fail("ARTIFACT_INVENTORY_INCOMPLETE");
 const names=new Set(body.artifacts.filter(x=>x.expired===false&&x.workflow_run?.id===Number(run))
  .map(x=>x.name));
 return {release_found:names.has(NAMES[component][0]),sandbox_found:names.has(NAMES[component][1])};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspect({component:process.env.TAGHVIM_COMPONENT,repository:process.env.GITHUB_REPOSITORY,
  run:process.env.GITHUB_RUN_ID,token:process.env.GITHUB_TOKEN})
 .then(r=>{
  if(!process.env.GITHUB_OUTPUT)fail("GITHUB_OUTPUT_NOT_SET");
  appendFileSync(process.env.GITHUB_OUTPUT,"release_found="+r.release_found+"\nsandbox_found="+r.sandbox_found+"\n");
  console.log("T0_RELEASE_ARTIFACTS_PRESENT",JSON.stringify({component:process.env.TAGHVIM_COMPONENT,
    ...r,scope:"SAME_RUN_READ_ONLY"}));
 }).catch(e=>{console.error("::error::"+e.message);process.exitCode=1});
}
