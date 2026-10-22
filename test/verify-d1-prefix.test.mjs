import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyPrefix,rowsOf,classifyRemoteSchema} from "../.github/actions/verify-d1-prefix/verify-d1-prefix.mjs";
const source=[{name:"0001_first.sql",sha256:"a".repeat(64)},{name:"0002_second.sql",sha256:"b".repeat(64)}];
const remote=(names)=>[{success:true,results:names.map(name=>({name}))}];
const args={database:"taghvim-engine",source,sha:"c".repeat(40),run:"123"};
test("remote prefix allows only missing trailing migrations, not arbitrary drift",()=>{
 const empty=verifyPrefix({...args,remote:remote([])});
 assert.deepEqual(empty.pending,source.map(x=>x.name));
 const partial=verifyPrefix({...args,remote:remote(["0001_first.sql"])});
 assert.equal(partial.already_applied,1);
 assert.deepEqual(partial.pending,["0002_second.sql"]);
 const done=verifyPrefix({...args,remote:remote(source.map(x=>x.name))});
 assert.deepEqual(done.pending,[]);
 assert.equal(done.production_mutation_authorized,false);
});
test("reject extra duplicate skipped reversed and failed remote results",()=>{
 for(const json of [
   remote(["0002_second.sql"]),
   remote(["0001_first.sql","0001_first.sql"]),
   remote(["0001_first.sql","0002_second.sql","0003_other.sql"]),
   remote(["0002_second.sql","0001_first.sql"]),
   [{success:false,results:[]}],
   [{success:true,results:null}],
   [],[{success:true,results:[{wrong:"missing name"}]}]
 ])assert.throws(()=>verifyPrefix({...args,remote:json}));
});
test("only expected D1 target, source identity and ordered manifest allowed",()=>{
 assert.throws(()=>verifyPrefix({...args,database:"wrong-prod",remote:remote([])}));
 assert.throws(()=>verifyPrefix({...args,sha:"main",remote:remote([])}));
 assert.throws(()=>verifyPrefix({...args,run:"x",remote:remote([])}));
 assert.throws(()=>verifyPrefix({...args,source:[...source].reverse(),remote:remote([])}));
 assert.throws(()=>verifyPrefix({...args,source:[source[0],source[0]],remote:remote([])}));
 assert.throws(()=>verifyPrefix({...args,source:[{name:"0001_first.sql",sha256:"bad"}],remote:remote([])}));
 assert.throws(()=>rowsOf({success:true,results:null}));
});

const schema=(entries)=>[{success:true,results:entries.map(([name,type])=>({name,type}))}];
test("first ever D1 migration admits only a truly pristine remote database",()=>{
 for(const database of ["taghvim-engine","taghvim-web"]){
  assert.equal(classifyRemoteSchema({database,response:schema([])}),"PRISTINE_EMPTY");
  assert.equal(classifyRemoteSchema({database,response:schema([["d1_migrations","table"]])}),"EXISTING_LEDGER");
  assert.equal(classifyRemoteSchema({database,response:schema([["d1_migrations","table"],["tenants","table"]])}),"EXISTING_LEDGER");
 }
});
test("missing ledger on populated database is never interpreted as fresh install",()=>{
 const bad=[
  schema([["tenants","table"]]),
  schema([["leads","table"]]),
  schema([["other","view"]]),
  schema([["trg","trigger"]]),
  schema([["d1_migrations","view"]]),
  schema([["d1_migrations","table"],["d1_migrations","table"]]),
  [{success:false,results:[]}],[{success:true,results:null}],[]
 ];
 for(const response of bad)
  assert.throws(()=>classifyRemoteSchema({database:"taghvim-engine",response}),/D1_|REMOTE_QUERY/);
 assert.throws(()=>classifyRemoteSchema({database:"other",response:schema([])}),/D1_/);
});
test("T0 first D1 bootstrap executes metadata inspection before ledger and migration",()=>{
 const action=readFileSync(new URL("../.github/actions/verify-d1-prefix/action.yml",import.meta.url),"utf8");
 assert.ok(action.indexOf("SELECT name,type FROM sqlite_master")>=0);
 assert.ok(action.indexOf("SELECT name FROM d1_migrations ORDER BY id")>action.indexOf("SELECT name,type FROM sqlite_master"));
 assert.match(action,/PRISTINE_EMPTY/);
 assert.match(action,/EXISTING_LEDGER/);
 assert.doesNotMatch(action,/d1 migrations apply|wrangler deploy|DROP TABLE|ALTER TABLE/);
});

test("Cloudflare reserved storage table is not user data during pristine migration gate",()=>{
 for(const database of ["taghvim-engine","taghvim-web"]){
  assert.equal(classifyRemoteSchema({database,response:schema([["_cf_KV","table"]])}),"PRISTINE_EMPTY");
  assert.equal(classifyRemoteSchema({database,response:schema([["_cf_KV","table"],["d1_migrations","table"]])}),"EXISTING_LEDGER");
 }
 for(const invalid of [schema([["_cf_KV","table"],["customers","table"]]),schema([["_cf_UNKNOWN","table"]])])
  assert.throws(()=>classifyRemoteSchema({database:"taghvim-engine",response:invalid}),/UNTRACKED/);
});
