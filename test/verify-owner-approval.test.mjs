import test from "node:test";
import assert from "node:assert/strict";
import {verifyOwnerApproval} from "../.github/actions/verify-owner-approval/verify-owner-approval.mjs";
const sha="a".repeat(40);
const good={id:427,user:{login:"007dude"},author_association:"OWNER",
 issue_url:"https://api.github.com/repos/Taghvim-dev/engine/issues/9",
 body:"/taghvim-promote engine "+sha};
const req=async(_,opts)=>({status:200,json:async()=>good});
const args={repo:"Taghvim-dev/engine",sha,phrase:"RELEASE_TAGHVIM_ENGINE",commentId:"427",token:"fake-test",request:req};
test("owner proof is anchored to authentic GitHub issue, author, exact source and SHA",async()=>{
 const r=await verifyOwnerApproval(args);
 assert.equal(r.owner_verified,true);assert.equal(r.production_approved,false);
 assert.equal(r.remote_mutation,false);assert.equal(r.independent_review_still_required,true);
});
test("missing token, invalid phrase, unknown repo and malformed comment id fail closed",async()=>{
 for(const diff of [{token:""},{phrase:"OTHER"},{repo:"bad/repo"},{commentId:"/../../42"},{sha:"x"}])
  await assert.rejects(()=>verifyOwnerApproval({...args,...diff}),/BLOCKED/);
});
test("reject foreign author, wrong issue, body, comment id, or unverified HTTP",async()=>{
 for(const diff of [{user:{login:"attacker"}},{issue_url:"https://api.github.com/repos/Taghvim-dev/engine/issues/8"},
  {body:"/taghvim-promote engine "+"b".repeat(40)},{id:999},{author_association:"NONE"}]){
  await assert.rejects(()=>verifyOwnerApproval({...args,request:async()=>({status:200,json:async()=>({...good,...diff})})}),/BLOCKED/);
 }
 await assert.rejects(()=>verifyOwnerApproval({...args,request:async()=>({status:403})}),/BLOCKED/);
});
test("landing owner approval is independent from engine approval",async()=>{
 const landing={...good,issue_url:"https://api.github.com/repos/Taghvim-dev/landing/issues/13",body:"/taghvim-promote landing "+sha};
 const r=await verifyOwnerApproval({...args,repo:"Taghvim-dev/landing",phrase:"RELEASE_TAGHVIM_LANDING",request:async()=>({status:200,json:async()=>landing})});
 assert.equal(r.repository,"Taghvim-dev/landing");
});
