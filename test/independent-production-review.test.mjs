import test from "node:test";
import assert from "node:assert/strict";
import {verifyIndependentReview} from "../.github/actions/verify-production-environment/independent-review.mjs";
const sha="a".repeat(40);
const base="https://api.github.com/repos/Taghvim-dev/engine";
const comment={id:123,user:{login:"verified-colleague",type:"User"},body:"/taghvim-review engine "+sha};
const permission={permission:"write",user:{login:"verified-colleague"}};
const good=async(url)=>{
 if(url.startsWith(base+"/issues/9/comments?"))return {status:200,json:async()=>[comment]};
 if(url===base+"/collaborators/verified-colleague/permission")return {status:200,json:async()=>permission};
 throw Error("unexpected URL: "+url);
};
const args={repo:"Taghvim-dev/engine",sha,token:"fake-token",request:good};
test("independent reviewer must be actual non-owner human with repository write access and exact current SHA",async()=>{
 const x=await verifyIndependentReview(args);
 assert.equal(x.independent_from_owner,true);
 assert.equal(x.github_permission,"write");
 assert.equal(x.reviewer,"verified-colleague");
 assert.equal(x.comment_id,123);
 assert.equal(x.production_mutation,false);
});
test("rejects owner, bot, stale SHA, wrong repository and wrong issue",async()=>{
 for(const reviewer of [
   {...comment,user:{login:"007dude",type:"User"}},
   {...comment,user:{login:"github-actions[bot]",type:"Bot"}},
   {...comment,body:"/taghvim-review engine "+"b".repeat(40)},
   {...comment,body:"/taghvim-review landing "+sha},
 ])await assert.rejects(()=>verifyIndependentReview({...args,request:async url=>
   url.includes("/issues/9/comments?")?{status:200,json:async()=>[reviewer]}:
   {status:200,json:async()=>permission}}),/BLOCKED/);
 await assert.rejects(()=>verifyIndependentReview({...args,repo:"Taghvim-dev/wrong"}),/BLOCKED/);
});
test("rejects read-only, revoked, mismatched or unavailable GitHub reviewer permissions",async()=>{
 for(const item of [{permission:"read",user:permission.user},{permission:"none",user:permission.user},
  {permission:"write",user:{login:"007dude"}}]){
  await assert.rejects(()=>verifyIndependentReview({...args,request:async url=>
   url.includes("/issues/9/comments?")?{status:200,json:async()=>[comment]}:
   {status:200,json:async()=>item}}),/BLOCKED/);
 }
 await assert.rejects(()=>verifyIndependentReview({...args,request:async()=>({status:403})}),/BLOCKED/);
});
test("landing uses separate exact issue, component and immutable SHA",async()=>{
 const origin="https://api.github.com/repos/Taghvim-dev/landing";
 const review={...comment,body:"/taghvim-review landing "+sha};
 const v=await verifyIndependentReview({...args,repo:"Taghvim-dev/landing",request:async url=>
  url.startsWith(origin+"/issues/13/comments?")?{status:200,json:async()=>[review]}:
  {status:200,json:async()=>permission}});
 assert.equal(v.component,"landing");
});
