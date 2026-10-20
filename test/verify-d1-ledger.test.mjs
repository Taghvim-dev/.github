import { test } from "node:test";
import assert from "node:assert/strict";
import {verifyAppliedLedger} from "../.github/actions/verify-d1-ledger/verify-d1-ledger.mjs";
const sha="a".repeat(40), hash="b".repeat(64);
const expected=[{name:"0001_init.sql",sha256:hash},{name:"0002_more.sql",sha256:hash}];
const ok=[{success:true,results:[{name:"0001_init.sql"},{name:"0002_more.sql"}]}];
const verify=(p={})=>verifyAppliedLedger({database:"taghvim-engine",expected,result:ok,githubSha:sha,githubRun:"123",...p});
test("real applied ledger exact match, explicit NOT GA",()=>{
  assert.equal(verify().status,"VERIFIED");
  assert.equal(verify().general_availability_approved,false);
  assert.deepEqual(verify().migrations,expected);
});
test("missing extra duplicate unordered and failed migrations cannot pass",()=>{
  for(const result of [
    [{success:true,results:[{name:"0001_init.sql"}]}],
    [{success:true,results:[{name:"0001_init.sql"},{name:"0003_extra.sql"}]}],
    [{success:true,results:[{name:"0002_more.sql"},{name:"0001_init.sql"}]}],
    [{success:true,results:[{name:"0001_init.sql"},{name:"0001_init.sql"}]}],
    [{success:false,results:[]}],
    [{success:true}], []
  ]) assert.throws(()=>verify({result}));
});
test("reject wrong DB, source SHA, run ID and malformed source manifest",()=>{
  assert.throws(()=>verify({database:"other-customer"}));
  assert.throws(()=>verify({githubSha:"main"}));
  assert.throws(()=>verify({githubRun:""}));
  assert.throws(()=>verify({expected:[{name:"0001_init.sql",sha256:"bad"}]}));
  assert.throws(()=>verify({expected:[...expected].reverse()}));
});
