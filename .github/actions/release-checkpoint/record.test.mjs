import {test} from "node:test";
import assert from "node:assert/strict";
import {advance,commentFor,marker,persistIssue,STAGES} from "./record.mjs";

const env={component:"engine",sha:"a".repeat(40),run:"123456",attempt:"1"};
const receipt=(stage,prior=null,i=0)=>advance(prior,{...env,stage,at:new Date(Date.UTC(2026,9,20,10,i)).toISOString()});
const mock=(responses) => {
  const calls=[];
  const request=async(url,opt={})=>{
    calls.push({url,method:opt.method||"GET",body:opt.body});
    const response=responses.shift();
    if(!response) throw Error("unexpected network request");
    return {ok:response.status>=200&&response.status<300,status:response.status,
      json:async()=>response.body};
  };
  return {request,calls};
};
const context={repository:"Taghvim-dev/engine",issue:"9",token:"placeholder-test-token"};

test("seven deterministic consecutive checkpoints form a verified SHA chain, never GA",()=>{
  let current=null;
  for(let i=0;i<STAGES.length;i++){
    current=receipt(STAGES[i],current,i);
    assert.equal(current.phase,STAGES[i]);
    assert.equal(current.checkpoints.length,i+1);
    assert.equal(current.ga_approved,false);
    assert.equal(current.checkpoints[i].hash.length,64);
  }
  assert.equal(current.declared_state,"CONTRACT_OBSERVED_NOT_GA");
  assert.equal(receipt(STAGES.at(-1),current,99).checkpoint_hash,current.checkpoint_hash);
});

test("out-of-order, replay, SHA drift, component confusion, tampering fail closed",()=>{
  const first=receipt("authorized");
  assert.throws(()=>receipt("migrations_started",first,1),/skipped phase/);
  const second=receipt("checks_passed",first,1);
  assert.throws(()=>receipt("authorized",second,2),/regression/);
  assert.throws(()=>advance(second,{...env,sha:"b".repeat(40),stage:"migrations_started",at:"2026-10-20T12:00:00Z"}),/lease/);
  assert.throws(()=>advance(second,{...env,component:"landing",stage:"migrations_started",at:"2026-10-20T12:00:00Z"}),/mismatch/);
  const corrupt=JSON.parse(JSON.stringify(second));
  corrupt.checkpoints[0].hash="0".repeat(64);
  assert.throws(()=>receipt("migrations_started",corrupt,2),/integrity/);
  assert.throws(()=>advance(null,{...env,stage:"authorized",at:"invalid"}),/timestamp/);
});

test("new checkpoint persists in the protected matching repo issue (not GA)",async()=>{
  const event=receipt("authorized");
  const api=mock([{status:200,body:[]},{status:201,body:{id:19,html_url:"https://github.com/Taghvim-dev/engine/issues/9#issuecomment-19"}}]);
  const result=await persistIssue(event,{...context,request:api.request});
  assert.equal(result.status,"recorded");
  assert.deepEqual(api.calls.map(x=>x.method),["GET","POST"]);
  assert.ok(api.calls[1].body.includes(marker(event)));
  assert.ok(api.calls[1].body.includes(event.checkpoint_hash));
  assert.ok(commentFor(event).includes('"ga_approved": false'));
});

test("identical durable event is idempotent; conflicting remote event stops",async()=>{
  const event=receipt("authorized");
  const bot={id:33,user:{login:"github-actions[bot]"},body:commentFor(event)};
  const ready=mock([{status:200,body:[bot]}]);
  assert.equal((await persistIssue(event,{...context,request:ready.request})).status,"already_recorded");
  assert.equal(ready.calls.length,1);
  const conflicting={...bot,body:bot.body.replace(event.checkpoint_hash,"f".repeat(64))};
  const bad=mock([{status:200,body:[conflicting]}]);
  await assert.rejects(persistIssue(event,{...context,request:bad.request}),/conflicting/);
});

test("unfinished past production attempt blocks silent replay from a new run",async()=>{
  const old=receipt("authorized");
  const start=advance(null,{...env,run:"223344",stage:"authorized",at:"2026-10-20T13:00:00Z"});
  const bot={user:{login:"github-actions[bot]"},body:commentFor(old)};
  const req=mock([{status:200,body:[bot]}]);
  await assert.rejects(persistIssue(start,{...context,request:req.request}),/previous production attempt incomplete/);
  assert.equal(req.calls.length,1);
});

test("wrong repository, no token, missing issue, read API failure, write failure: no release",async()=>{
  const event=receipt("authorized");
  for(const partial of [{repository:"Taghvim-dev/landing"},{issue:"0"},{token:""}]){
    await assert.rejects(persistIssue(event,{...context,...partial,request:async()=>{throw Error("should not call API")}}),/missing or wrong repository/);
  }
  await assert.rejects(persistIssue(event,{...context,request:mock([{status:403,body:{}}]).request}),/unreadable HTTP 403/);
  await assert.rejects(persistIssue(event,{...context,request:mock([{status:200,body:[]},{status:401,body:{}}]).request}),/POST rejected/);
});

test("human-written issue comments cannot override bot-owned monotonic evidence",async()=>{
  const fake={user:{login:"external-user"},body:commentFor(receipt("authorized"))};
  const start=receipt("authorized");
  const responses=mock([{status:200,body:[fake]},{status:201,body:{id:5,html_url:"https://github.com/example"}}]);
  assert.equal((await persistIssue(start,{...context,request:responses.request})).status,"recorded");
});
