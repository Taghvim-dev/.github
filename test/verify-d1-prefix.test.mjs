import {test} from "node:test";
import assert from "node:assert/strict";
import {verifyPrefix,rowsOf} from "../.github/actions/verify-d1-prefix/verify-d1-prefix.mjs";
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
