import {test} from "node:test";import assert from "node:assert/strict";
import {inspect} from "../.github/actions/release-artifact-inventory/inventory.mjs";
const opts={component:"engine",repository:"Taghvim-dev/engine",run:"123",token:"fixture-secret"};
test("Same-run existing Sandbox artifact skips missing Production evidence without emitting Action failure",async()=>{
 const result=await inspect({...opts,request:async(url,args)=>{
  assert.equal(args.method,"GET");
  assert.ok(url.endsWith("/actions/runs/123/artifacts?per_page=100"));
  return {status:200,json:async()=>({total_count:1,artifacts:[{name:"taghvim-engine-sandbox-promotion",expired:false,workflow_run:{id:123}}]})};
 }});
 assert.deepEqual(result,{release_found:false,sandbox_found:true});
 assert.ok(!JSON.stringify(result).includes("fixture-secret"));
});
test("Wrong-run/expired artifacts must never be mistaken for actual evidence",async()=>{
 const result=await inspect({...opts,request:async()=>({status:200,json:async()=>({total_count:2,artifacts:[
  {name:"engine-release-evidence",expired:false,workflow_run:{id:888}},
  {name:"taghvim-engine-sandbox-promotion",expired:true,workflow_run:{id:123}}
 ]})})});
 assert.deepEqual(result,{release_found:false,sandbox_found:false});
});
test("Permission failures, wrong component or incomplete pages fail closed",async()=>{
 await assert.rejects(inspect({...opts,component:"landing"}),/INVALID_IMMUTABLE_RUN_OR_SCOPE/);
 await assert.rejects(inspect({...opts,request:async()=>({status:403})}),/GITHUB_ACTIONS_READ_HTTP_403/);
 await assert.rejects(inspect({...opts,request:async()=>({status:200,json:async()=>({total_count:101,artifacts:[]})})}),/INCOMPLETE/);
});
