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
  attester:async()=>admission,request:async(url,opts)=>{hits.push({url,opts});return{status:204};}});
 assert.equal(hits.length,1);
 assert.match(hits[0].url,/\/actions\/workflows\/production-release\.yml\/dispatches$/);
 assert.equal(hits[0].opts.method,"POST");
 assert.deepEqual(JSON.parse(hits[0].opts.body),{ref:"main",
 inputs:{expected_sha:sha,approval_phrase:"RELEASE_TAGHVIM_ENGINE"}});
 assert.equal(result.status,"ACCEPTED_BY_GITHUB_NOT_DEPLOYED");
 assert.equal(result.production_approved,false);
 assert.equal(result.production_mutation,false);
 assert.ok(!JSON.stringify(result).includes("scoped"));
});
