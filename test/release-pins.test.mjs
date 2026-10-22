import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolvePins} from "../scripts/release-pins.mjs";
const candidate=JSON.parse(readFileSync(new URL("../release/PUBLIC-RELEASE-MATRIX.json",import.meta.url),"utf8"));
const copy=()=>JSON.parse(JSON.stringify(candidate));
test("T0 sibling checkout pins derive exclusively from the candidate release matrix",()=>{
 const refs=resolvePins(candidate);
 assert.deepEqual(Object.keys(refs).sort(),["cli","cookbooks","sdk"]);
 assert.equal(refs.sdk,candidate.repositories.find(x=>x.name==="SDK").commit);
 assert.equal(refs.cookbooks,candidate.repositories.find(x=>x.name==="cookbooks").commit);
});
test("T0 fail-closed SHA/CI/duplicate/renamed source pin admission",()=>{
 const cases=[];
 {const x=copy();x.repositories[2].commit="0".repeat(40);cases.push(x)}
 {const x=copy();x.repositories.push({...x.repositories[0]});cases.push(x)}
 {const x=copy();x.repositories[0].commit="main";cases.push(x)}
 {const x=copy();x.repositories[0].ci_run="";cases.push(x)}
 {const x=copy();x.package_identity.CLI.ci="123";cases.push(x)}
 {const x=copy();x.repositories[1].name="SDK";cases.push(x)}
 {const x=copy();x.contract_version="2.0.0";cases.push(x)}
 for(const x of cases)assert.throws(()=>resolvePins(x),/T0/);
});
