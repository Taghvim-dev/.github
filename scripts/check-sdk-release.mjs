import {readFileSync,readdirSync} from "node:fs";
import assert from "node:assert/strict";
const data=JSON.parse(readFileSync("contracts/operation-index.json","utf8"));
assert.equal(data.schemaVersion,1);assert.equal(data.contractVersion,"2.1.0");
assert.match(data.openApiGitBlobSHA,/^[a-f0-9]{40}$/);
assert.ok(data.operations.length>=25);
assert.ok(data.operations.every(o=>o.operationId&&o.path&&o.method&&!o.auth.includes("OperatorToken")));
const js=readFileSync("sdk/javascript/index.js","utf8");
for(const route of ["convertDate","addBusinessDays","schedulePreview","usage"])assert.ok(js.includes(route),route);
for(const f of readdirSync("cookbooks").filter(x=>x.endsWith(".mjs"))) {
 const t=readFileSync("cookbooks/"+f,"utf8");
 assert.ok(t.includes("TAGHVIM_TEST_API_KEY"),f+" must require a test key");
 assert.ok(!t.includes("tgv_live_"),f+" must not reference live secrets");
}
const py=readFileSync("sdk/python/taghvim_sdk/__init__.py","utf8");
assert.ok(py.includes("TaghvimClient"));
console.log("SDK/public contract manifest and cookbooks pass static compatibility checks");
