import {test} from "node:test";
import assert from "node:assert/strict";
import {parseRequest,dispatchRelease} from "../.github/actions/owner-release-dispatch/dispatch.mjs";
const sha="f".repeat(40);
const event=(component="engine",issue=9,login="007dude",body="/taghvim-promote engine "+sha)=>
 ({action:"created",issue:{number:issue},comment:{id:427,user:{login},body}});
test("exact owner, issue, component and immutable SHA required",()=>{
 assert.deepEqual(parseRequest({repo:"Taghvim-dev/engine",event:event()}),
 {sha,phrase:"RELEASE_TAGHVIM_ENGINE",component:"engine",comment_id:427});
 assert.throws(()=>parseRequest({repo:"Taghvim-dev/engine",event:event("engine",9,"random-user")}));
 assert.throws(()=>parseRequest({repo:"Taghvim-dev/engine",event:event("engine",70)}));
 assert.throws(()=>parseRequest({repo:"Taghvim-dev/engine",event:event("engine",9,"007dude","/taghvim-promote landing "+sha)}));
 assert.throws(()=>parseRequest({repo:"Taghvim-dev/engine",event:event("engine",9,"007dude","/taghvim-promote engine "+sha+"; curl evil")}));
 assert.throws(()=>parseRequest({repo:"Taghvim-dev/wrong",event:event()}));
 const landing=event("landing",13,"007dude","/taghvim-promote landing "+sha);
 assert.equal(parseRequest({repo:"Taghvim-dev/landing",event:landing}).phrase,"RELEASE_TAGHVIM_LANDING");
});
test("T0 cannot dispatch with failed or missing independent source admission",async()=>{
 let hit=false;
 await assert.rejects(()=>dispatchRelease({repo:"Taghvim-dev/engine",event:event(),token:"scoped",
 attester:async()=>({source_sha:sha,repository:"Taghvim-dev/engine",commit_tree_identity_verified:false,
 tested_ci_status:"completed_success"}),request:async()=>{hit=true;return{status:204};}}));
 assert.equal(hit,false);
});
test("T0 dispatches protected workflow, not direct Cloudflare, only after full CI/source admission",async()=>{
 let hits=[];
 const admission={source_sha:sha,repository:"Taghvim-dev/engine",ci_receipt:"1234",
 commit_tree_identity_verified:true,tested_ci_status:"completed_success",source_tree_sha:"a".repeat(40)};
 const result=await dispatchRelease({repo:"Taghvim-dev/engine",event:event(),token:"scoped",
  attester:async()=>admission,request:async(url,opts)=>{hits.push({url,opts});return opts.method==="GET"?{status:200,json:async()=>({workflow_runs:[]})}:{status:204};}});
 assert.equal(hits.length,2);
 assert.equal(hits[0].opts.method,"GET");
 assert.match(hits[1].url,/\/actions\/workflows\/production-release\.yml\/dispatches$/);
 assert.equal(hits[1].opts.method,"POST");
 assert.deepEqual(JSON.parse(hits[1].opts.body),{ref:"main",
 inputs:{expected_sha:sha,approval_phrase:"RELEASE_TAGHVIM_ENGINE",approval_comment_id:"427"}});
 assert.equal(result.status,"ACCEPTED_BY_GITHUB_NOT_DEPLOYED");
 assert.equal(result.production_approved,false);
 assert.equal(result.production_mutation,false);
 assert.ok(!JSON.stringify(result).includes("scoped"));
});

test("T0 duplicate active source SHA: return durable no-op, never POST",async()=>{
 const proof={source_sha:sha,repository:"Taghvim-dev/engine",ci_receipt:"1234",
  commit_tree_identity_verified:true,tested_ci_status:"completed_success",source_tree_sha:"a".repeat(40)};
 let writes=0;
 const state=await dispatchRelease({repo:"Taghvim-dev/engine",event:event(),token:"test",
  attester:async()=>proof,request:async(url,opts)=>{
   if(opts.method==="POST"){writes++;return{status:204};}
   return{status:200,json:async()=>({workflow_runs:[
    {id:987,head_sha:sha,event:"workflow_dispatch",head_branch:"main",status:"in_progress"}]})};
  }});
 assert.equal(state.status,"ALREADY_ACTIVE_GITHUB_NOT_DEPLOYED");
 assert.equal(state.existing_run_id,987);assert.equal(writes,0);
 assert.equal(state.production_mutation,false);
});
test("T0 completed failed run or unrelated source SHA allows deliberate owner retry",async()=>{
 const proof={source_sha:sha,repository:"Taghvim-dev/engine",ci_receipt:"1234",
  commit_tree_identity_verified:true,tested_ci_status:"completed_success",source_tree_sha:"a".repeat(40)};
 let writes=0;
 await dispatchRelease({repo:"Taghvim-dev/engine",event:event(),token:"test",
  attester:async()=>proof,request:async(url,opts)=>{
   if(opts.method==="POST"){writes++;return{status:204};}
   return{status:200,json:async()=>({workflow_runs:[
    {id:10,head_sha:"e".repeat(40),event:"workflow_dispatch",head_branch:"main",status:"in_progress"},
    {id:11,head_sha:sha,event:"workflow_dispatch",head_branch:"main",status:"completed",conclusion:"failure"}]})};
  }});
 assert.equal(writes,1);
});
test("T0 GitHub active release lookup failures never dispatch blindly",async()=>{
 const proof={source_sha:sha,repository:"Taghvim-dev/engine",ci_receipt:"1234",
  commit_tree_identity_verified:true,tested_ci_status:"completed_success",source_tree_sha:"a".repeat(40)};
 await assert.rejects(()=>dispatchRelease({repo:"Taghvim-dev/engine",event:event(),token:"test",
  attester:async()=>proof,request:async()=>({status:403})}),/inventory/);
});
