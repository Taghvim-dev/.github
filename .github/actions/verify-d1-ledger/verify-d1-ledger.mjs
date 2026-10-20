#!/usr/bin/env node
// Compare the actual D1 applied migration ledger against the immutable local SQL files.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function verifyAppliedLedger({database, expected, result, githubSha, githubRun}) {
  if (!["taghvim-engine", "taghvim-web"].includes(database)) throw Error("Unapproved D1 target");
  if (!/^[0-9a-f]{40}$/.test(githubSha) || !/^\d+$/.test(githubRun))
    throw Error("Missing immutable release identity");
  if (!Array.isArray(expected) || expected.length === 0 ||
      expected.some(x => !/^\d{4}_.+\.sql$/.test(x.name) || !/^[0-9a-f]{64}$/.test(x.sha256)))
    throw Error("Invalid local migration manifest");
  const names = expected.map(x => x.name);
  if (new Set(names).size !== names.length || names.some((n,i) => i > 0 && names[i-1] >= n))
    throw Error("Local migrations require unique sorted filenames");
  const rows = Array.isArray(result) ? result : [result];
  if (rows.length !== 1 || rows[0]?.success !== true || !Array.isArray(rows[0]?.results))
    throw Error("Remote D1 did not return a successful structured query");
  const applied = rows[0].results.map(x => x?.name);
  if (applied.some(x => typeof x !== "string") || new Set(applied).size !== applied.length ||
      applied.length !== names.length || applied.some((x,i) => x !== names[i]))
    throw Error("Remote applied migrations are missing, extra, duplicate or out of order");
  return {
    schema_version: 1, kind: "d1_applied_ledger", status: "VERIFIED",
    release_sha: githubSha, workflow_run: githubRun, database,
    migration_count: names.length, migrations: expected,
    limitation: "Remote ledger records names/order only; hashes identify local SQL. Independently test schema, D1 backup and restore.",
    general_availability_approved: false
  };
}

function main() {
  const [database, migrationsDir, remoteJson, output] = process.argv.slice(2);
  if (!database || migrationsDir !== "migrations" || !remoteJson || !output)
    throw Error("Expected <approved-db> migrations <remote-query-json> <evidence-json>");
  const expected = readdirSync(migrationsDir).filter(x => x.endsWith(".sql")).sort().map(name => ({
    name, sha256: createHash("sha256").update(readFileSync(join(migrationsDir,name))).digest("hex")
  }));
  const evidence = verifyAppliedLedger({
    database, expected, result: JSON.parse(readFileSync(remoteJson,"utf8")),
    githubSha: process.env.GITHUB_SHA || "", githubRun: process.env.GITHUB_RUN_ID || ""
  });
  writeFileSync(output, JSON.stringify(evidence,null,2)+"\n",{mode:0o600});
  console.log("D1_REMOTE_APPLIED_LEDGER_VERIFIED",database,expected.length,"release",evidence.release_sha);
}
if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {main()} catch(e) {console.error("::error::D1_LEDGER_BLOCKED: "+e.message);process.exitCode=1}
}
