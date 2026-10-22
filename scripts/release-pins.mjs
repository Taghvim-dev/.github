import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

// Checkout SHA authority is the reviewed candidate release matrix, not YAML.
export function resolvePins(matrix){
 assert.equal(matrix?.contract_version,"2.1.0","T0 product version drift");
 const list=matrix?.repositories;
 assert.ok(Array.isArray(list)&&list.length===3,"T0 exactly three public sibling repos are required");
 const pins={};
 for(const [name,key] of [["SDK","sdk"],["CLI","cli"],["cookbooks","cookbooks"]]){
  const records=list.filter(x=>x?.name===name);
  assert.equal(records.length,1,"T0 missing or duplicate repository "+name);
  const record=records[0];
  assert.match(record.commit||"",/^[0-9a-f]{40}$/,"T0 invalid "+name+" commit");
  assert.match(String(record.ci_run||""),/^[0-9]+$/,"T0 missing "+name+" CI receipt");
  assert.equal(matrix.package_identity?.[name]?.commit,record.commit,"T0 "+name+" package SHA drift");
  assert.equal(matrix.package_identity?.[name]?.ci,record.ci_run,"T0 "+name+" package CI drift");
  pins[key]=record.commit;
 }
 return pins;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const matrix=JSON.parse(readFileSync(new URL("../release/PUBLIC-RELEASE-MATRIX.json",import.meta.url),"utf8"));
 for(const [key,sha] of Object.entries(resolvePins(matrix)))console.log(key+"="+sha);
}
