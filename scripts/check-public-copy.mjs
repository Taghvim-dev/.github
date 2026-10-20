import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const files = ["README.md","profile/README.md","IP-AND-OSS.md","SECURITY.md","SUPPORT.md"];
for (const f of readdirSync("docs").filter(x=>x.endsWith(".md"))) files.push("docs/"+f);
const bad=[];
for(const f of files) {
 const text=readFileSync(f,"utf8");
 if(/[\u202A-\u202E\u2066-\u2069\u200B]/u.test(text)) bad.push(f+": invalid invisible bidi control");
 if(/[\uFB50-\uFDFF\uFE70-\uFEFE]/u.test(text)) bad.push(f+": Arabic presentation forms");
 if(f==="profile/README.md" && !/<h1 align="center" dir="rtl" lang="fa">/.test(text))bad.push(f+": accessible bilingual RTL heading missing");
 if(f==="profile/README.md" && /<div[^>]*>[\s\S]*?^#\s/m.test(text))bad.push(f+": Markdown heading embedded inside HTML div");
 if(/\u0643|\u064A/u.test(text))bad.push(f+": Arabic Kaf/Yeh in Persian material");
 if(/میوقت|شورع|موقعیوقت/u.test(text))bad.push(f+": reversed or corrupted Persian glossary");
 const codeFences=(text.match(/^\s*```/gm)||[]).length;
 if(codeFences%2!==0)bad.push(f+": unbalanced fenced code blocks");
 for(const match of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]+)?\)/g)){
   const link=match[1];
   if(/^(https?:|mailto:|data:)/.test(link))continue;
   const target=join(f.includes("/")?f.slice(0,f.lastIndexOf("/")):"",link);
   if(!existsSync(target))bad.push(f+": unresolved relative link "+link);
 }
}
if(bad.length){console.error(bad.join("\n"));process.exit(1)}
console.log("Public Persian docs Unicode and direction check passed: "+files.length+" Markdown files");
