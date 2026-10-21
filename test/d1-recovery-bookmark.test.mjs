import {test} from "node:test";
import assert from "node:assert/strict";
import {databaseId,receipt,capture} from "../.github/actions/d1-recovery-bookmark/check.mjs";
const dbId="08e29424-2c68-4aef-bde3-3d5cad47ccc8";
const config='name = "taghvim-api"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "taghvim-engine"\ndatabase_id = "'+dbId+'"\nmigrations_dir = "migrations"\n';
const bookmark="00000085-0000024c-00004c6d-8e61117bf38d7adb71b934ebbf891683";
const data={database:"taghvim-engine",dbId,sha:"a".repeat(40),run:"1234",at:"2026-10-21T00:00:00.000Z"};
test("only one canonical production D1 binding, never another Worker or sandbox",()=>{
  assert.equal(databaseId(config,"taghvim-engine"),dbId);
  assert.throws(()=>databaseId(config,"taghvim-web"),/wrong Worker/);
  assert.throws(()=>databaseId(config.replace('database_name = "taghvim-engine"','database_name = "taghvim-engine-sandbox"'),"taghvim-engine"),/missing canonical/);
  assert.throws(()=>databaseId(config+config.slice(config.indexOf("[[d1_databases]]")),"taghvim-engine"),/ambiguous/);
});
test("real-shaped Cloudflare bookmark evidence is fail-closed and cannot authorize automatic restore",()=>{
  const body={success:true,errors:[],result:{bookmark}};
  const r=receipt(body,data);
  assert.equal(r.bookmark,bookmark);
  assert.equal(r.automatic_restore_allowed,false);
  for(const b of [{success:false,errors:[],result:{bookmark}},{success:true,result:{bookmark}},
    {success:true,errors:[{code:1}],result:{bookmark}},{success:true,errors:[],result:{bookmark:"bad"}}])
    assert.throws(()=>receipt(b,data),/D1_RECOVERY_BLOCKED/);
  assert.throws(()=>receipt(body,{...data,sha:"main"}),/D1_RECOVERY_BLOCKED/);
});
test("only HTTPS GET to the canonical production D1 bookmark endpoint, no data writes",async()=>{
  const calls=[];
  const request=async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({success:true,errors:[],result:{bookmark}})}};
  const r=await capture({...data,config,account:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",token:"dummy-token",request});
  assert.equal(r.status,"VERIFIED");
  assert.equal(calls.length,1);
  assert.equal(calls[0].init.method,"GET");
  assert.equal(calls[0].url,"https://api.cloudflare.com/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/d1/database/"+dbId+"/time_travel/bookmark");
  assert.ok(!JSON.stringify(r).includes("dummy-token"));
});

test("reject mistaken UUID account IDs; require actual 32-character Cloudflare account ID",async()=>{
  await assert.rejects(()=>capture({...data,config,account:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",token:"test",request:async()=>{throw Error("must never reach API");}}),/D1_RECOVERY_BLOCKED/);
});
