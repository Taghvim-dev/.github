import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const files = ["README.md","profile/README.md","IP-AND-OSS.md","SECURITY.md","SUPPORT.md"];
for (const f of readdirSync("docs").filter(x=>x.endsWith(".md"))) files.push("docs/"+f);
const bad=[];
for(const f of files) {
 const text=readFileSync(f,"utf8");
 if(/[\u202A-\u202E\u2066-\u2069\u200B]/u.test(text)) bad.push(f+": invalid invisible bidi control");
 if(/[\uFB50-\uFDFF\uFE70-\uFEFE]/u.test(text)) bad.push(f+": Arabic presentation forms");
 if(f==="profile/README.md" && !/dir="rtl" lang="fa"/u.test(text))bad.push(f+": root Persian direction missing");
}
if(bad.length){console.error(bad.join("\n"));process.exit(1)}
console.log("Public Persian docs Unicode and direction check passed: "+files.length+" Markdown files");
