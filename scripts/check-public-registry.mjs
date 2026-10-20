import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const doc=JSON.parse(readFileSync(new URL("../contracts/operation-index.json",import.meta.url),"utf8"));
assert.equal(doc.schemaVersion,1);
assert.match(doc.openApiGitBlobSHA,/^[a-f0-9]{40}$/);
assert.match(doc.contractVersion,/^\d+\.\d+\.\d+$/);
assert.ok(doc.operations.length>35);
assert.ok(doc.operations.every(o=>!o.auth.includes("OperatorToken")&&!o.path.startsWith("/v1/admin/")));
console.log("Canonical public operation registry validated",doc.contractVersion,doc.openApiGitBlobSHA);
