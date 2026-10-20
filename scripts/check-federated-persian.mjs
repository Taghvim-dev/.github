#!/usr/bin/env node
/** One public-language contract for organization profile + SDK + CLI + Cookbook docs.
 * Called by the coordinated SHA-pinned release workflow. No network and no secrets.
 */
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {join,dirname,relative,resolve,extname} from "node:path";
const roots=[".","SDK","CLI","cookbooks"];
const problems=[];
let scanned=0,fa=0;
const rootDir=process.cwd();
const files=[];
const ignored=new Set(["node_modules",".git","artifacts","dist",".venv"]);
function walk(d){
  if(!existsSync(d))return;
  for(const e of readdirSync(d,{withFileTypes:true})){
    if(ignored.has(e.name))continue;
    const p=join(d,e.name);
    if(e.isDirectory())walk(p);
    else if(e.name==="README.md"||((p.includes("/docs/")||p.startsWith("docs/"))&&extname(p)===".md"))files.push(p);
  }
}
for(const x of roots)if(x==="."){for(const p of ["README.md","profile/README.md"])files.push(p);walk("docs")}else{files.push(x+"/README.md");walk(x+"/docs");walk(x+"/javascript");walk(x+"/python");}
const badBidi=/[\u202A-\u202E\u2066-\u2069\u200B]/u;
const presentation=/[\uFB50-\uFDFF\uFE70-\uFEFE]/u;
const reversed=/میوقت|موقعیوقت|شورع|نابز|تبث.?مان|تیعقوم/u;
for(const path of [...new Set(files)].sort()){
  if(!existsSync(path)){problems.push(path+": file missing");continue}
  const source=readFileSync(path,"utf8");
  scanned++;
  if(/[\u0600-\u06FF]/u.test(source))fa++;
  if(badBidi.test(source))problems.push(path+": unsafe invisible direction control");
  if(presentation.test(source))problems.push(path+": glyph presentation form in source text");
  if(reversed.test(source))problems.push(path+": suspect reversed Persian term");
  if((source.match(/^\s*```/gm)||[]).length%2)problems.push(path+": unclosed code fence");
  if(["SDK/README.md","CLI/README.md","cookbooks/README.md"].includes(path)){
    if(!/lang="fa"[^>]*dir="rtl"|dir="rtl"[^>]*lang="fa"/.test(source))problems.push(path+": missing explicit Persian direction context");
    if(!/دسترسی زودهنگام|آزمایشی/.test(source))problems.push(path+": preview availability warning absent");
    if(!/Apache-2\.0/.test(source))problems.push(path+": OSS scope missing");
  }
  for(const m of source.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)){
    const ref=m[1];
    if(/^(https?:|mailto:|data:|#)/.test(ref))continue;
    const local=resolve(rootDir,dirname(path),ref.split("?")[0]);
    if(!local.startsWith(rootDir+"/")){problems.push(path+": relative link escapes checkout "+ref);continue}
    if(!existsSync(local))problems.push(path+": broken relative link "+ref);
  }
}
if(scanned<13 || fa<8)problems.push("Public documentation coverage unexpectedly shrank: "+scanned+" documents, "+fa+" Persian");
if(problems.length){console.error(problems.join("\n"));process.exitCode=1}
else console.log("FEDERATED-PERSIAN-COPY PASS: "+scanned+" files across .github/SDK/CLI/cookbooks. Browser screenshots and linguistic sign-off remain a separate release gate.");
