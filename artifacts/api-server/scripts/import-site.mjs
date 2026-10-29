import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { Client } from "@replit/object-storage";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { isAdministrative } from "../../colorado-heritage/directory-helpers.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const web = path.join(root, "artifacts/colorado-heritage");
const read = async name => JSON.parse(await fs.readFile(`${web}/src/data/${name}.json`, "utf8"));
const sitemapCode = ts.transpileModule(await fs.readFile(`${web}/src/data/siteSitemap.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { sitePages, legacyRouteAliases } = await import(`data:text/javascript;base64,${Buffer.from(sitemapCode).toString("base64")}`);
const source = (await read("sourcePages")).pages;
const clean = text => text.replace(/^.*? — Colorado Heritage\s*/, "").split("\n")
  .filter(line => !/^(School year office hours begin|o Independent School|o See our latest Blog|0items|\$0|Click below to view the Colorado Heritage You Tube Channel|0 Likes|Share)/.test(line.trim()))
  .join("\n").replace(/Accademy/g, "Academy").trim();
const pages = sitePages.map(page => ({
  path: page.path, label: page.label, title: page.title, description: page.description,
  markdown: clean(source[page.sourcePath]?.markdown ?? ""), kind: page.kind ?? "content",
  ...(page.documentPath ? { documentPath: page.documentPath } : {}),
  ...(page.externalUrl ? { externalUrl: page.externalUrl } : {}),
}));
pages.push({ path: "/admissions", label: "Admissions", title: "Admissions | Colorado Heritage", description: "Apply to Colorado Heritage and explore tuition, fees, scholarships, and enrollment policies.", markdown: "## Begin your CHESS journey\n\nColorado Heritage partners with families serving students in kindergarten through grade 12 in Greeley, Colorado. Contact our office to schedule a visit and find the right program for your family.", kind: "overview" });
const label = (url, text) => { const page = pages.find(p => p.path === url); if (page) page.label = text; };
label("/about/our-purpose", "Purpose & Beliefs");
label("/about/history", "History & Foundation");
label("/about/faculty", "Faculty & Staff");
label("/programs/academy", "K–12 Academy");
label("/programs/diploma", "High School Diploma");
label("/families/school-calendar", "Calendar & Events");
label("/families/tuition-and-fees", "Tuition, Fees & Scholarships");
const navigation = [
  { label:"About", path:"/about", children:["/about/our-purpose","/about/beliefs","/about/history","/about/foundation","/about/faculty","/about/staff","/about/board","/about/testimonials"] },
  { label:"Programs", path:"/programs", children:["/programs/independent-school","/programs/academy","/programs/academy/classes","/programs/diploma","/programs/diploma/resources","/programs/diploma/graduation"] },
  { label:"Admissions", path:"/admissions", children:["/families/apply","/families/tuition-and-fees","/families/tuition-policies","/about/acceptance-policy"] },
  { label:"Parents", path:"/families", children:["/families/school-calendar","/events","/families/semester-details","/families/dress-code","/families/electronics-policy","/families/testing","/families/text-alerts","/families/homeschool-law","/families/tutoring-resources","/families/opportunities-to-serve","/families/homeschool-services","/families/diploma-resources","/families/graduation-resources","/families/faculty-portal"] },
  { label:"News", path:"/news", children:["/news","/listen-learn","/gallery"] },
  { label:"Contact", path:"/contact", children:[] },
];
const staff = [];
const normalizeName = name => name.toLowerCase().replace(/\b\w/g, char => char.toUpperCase()).replace(/Leduc/g,"LeDuc");
for (const sourcePath of ["/our-faculty", "/administrative-stafff"]) {
  const markdown = source[sourcePath]?.markdown ?? "";
  for (const match of markdown.matchAll(/^###\s+([^\n]+)\n([\s\S]*?)(?=^###\s|(?![\s\S]))/gm)) {
    const heading = match[1].replace(/[*_]/g,"").trim();
    if (!/^(Miss|Mrs?\.|Pastor|PASTOR)/i.test(heading)) continue;
    const name = normalizeName(heading.split(/[,;]/)[0]);
    const body = match[2];
    const image = body.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? "";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,"");
    if (staff.some(person => person.slug === slug)) continue;
    const credentials = heading.slice(heading.split(/[,;]/)[0].length).replace(/^[,;\s]+/, "");
    const roleMatch = credentials.match(/(?:teaches|teacher|principal|director|weight training)[\s\S]*/i);
    const role = (roleMatch?.[0] ?? "Faculty member").replace(/\s+/g," ");
    staff.push({ slug, name, role: role.charAt(0).toUpperCase()+role.slice(1).toLowerCase(), photo: image, alt: name, bio: `${credentials}\n\n${body.replace(/!\[[^\]]*\]\([^)]+\)/g,"")}`.trim() });
  }
}
const roleNames = {
  "Miss Lilah Barth":"History, Drama & Computer Graphics",
  "Mrs. Shana Chavez":"Choir, Elementary Math, Sewing & Crafts",
  "Mr. Joshua Franklin":"History",
  "Mrs. Amy Kearns":"Mathematics",
  "Mr. Andrew Kearns":"Physical Education",
  "Mr. Paul LeDuc":"Bible, Junior High Literature & Chapel",
  "Mrs. Annie Nelson":"Literature & Home Economics",
  "Mr. Noah Nelson":"Financial Stewardship, Civics, Speech & Computer Applications",
  "Pastor Baxter Ong":"Bible, Theology & Languages; Board Member",
  "Mrs. Teri Ong":"Music; Board Member",
  "Mrs. Polly Salzmann":"Weight Training",
  "Mr. Cliff Smart":"Science",
  "Mrs. Chris Smart":"Writing & History",
  "Mrs. Stacey Solanyk":"Zoology",
  "Mrs. Alice Wishart":"Art",
};
for (const person of staff) person.role = roleNames[person.name] || person.role;
const adminSource = source["/administrative-stafff"]?.markdown || "";
const adminProfiles = [
  ["Mrs. Mary Brown","Principal"],
  ["Mrs. Amy Kearns","Admissions Coordinator & Diploma Program Registrar"],
  ["Signe Clausen","Receptionist / Office Assistant"],
];
for (const image of adminSource.matchAll(/!\[[^\]]*\]\(([^)]+)\)\s*([\s\S]*?)(?=!\[|(?![\s\S]))/g)) {
  const profile = adminProfiles.find(([name])=>image[2].includes(name));
  if (!profile) continue;
  const [name,role]=profile;
  const bio=clean(image[2]);
  const existing=staff.find(person=>person.name===name);
  if(existing){existing.role=`${role}; ${existing.role}`;existing.bio+=`\n\n${bio}`;continue;}
  staff.unshift({slug:name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,""),name,role,photo:image[1],alt:name,bio});
}
const articles = async name => (await read(name)).map(entry => {
  const markdown = clean(entry.markdown);
  const title = markdown.match(/^#{1,3}\s+(.+)$/m)?.[1]?.replace(/[*_]/g,"") ?? decodeURIComponent(entry.path.split("/").pop()).replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  const dateParts = entry.path.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
  const date = dateParts ? `${dateParts[1]}-${dateParts[2].padStart(2,"0")}-${dateParts[3].padStart(2,"0")}` : "";
  return { path: entry.path.replace(/^\/new-events/,"/events"), title, date, markdown, archived: name === "eventArchive" && !!date && date < "2020-01-01" };
});
const events = await articles("eventArchive");
const news = await articles("newsArchive");
const documents = [];
for (const page of pages) {
  if (page.documentPath && !documents.some(doc => doc.url === page.documentPath)) documents.push({ id: page.documentPath, title: page.label, url: page.documentPath });
  for (const link of page.markdown.matchAll(/\[([^\]]+)\]\(([^)]+\.pdf(?:\?[^)]*)?)\)/gi)) {
    if (!documents.some(doc => doc.url === link[2])) documents.push({ id: link[2], title: link[1], url: link[2] });
  }
}
staff.forEach(person => { person.administrative = isAdministrative(person); });
// Directory biographies are stored on the staff records, not duplicated on the listing.
const administrativePage = pages.find(page => page.path === "/about/staff");
if (administrativePage) administrativePage.markdown = "";
let content = { revision:1, pages, staff, events, news, documents, navigation };
const storage = new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });
const urls = [...new Set(JSON.stringify(content).match(/https?:\/\/[^"\\\s)]+squarespace[^"\\\s)]*|https?:\/\/(?:images|static\d*)\.squarespace[^"\\\s)]*/g) ?? [])];
// Match actual image URLs only, not ordinary Squarespace document links.
const imageUrls = [...new Set([...JSON.stringify(content).matchAll(/https:\/\/(?:images|static\d*)\.squarespace[^"\\\s)]*/g)].map(m=>m[0]))].filter(url=>!url.includes(".pdf"));
let media = {};
let previous;
try {
  previous=JSON.parse(await fs.readFile(`${root}/artifacts/api-server/src/data/initial-site-content.json`,"utf8"));
  for(const page of pages){
    const old=previous.pages.find(item=>item.path===page.path);
    if(!old)continue;
    const original=[...page.markdown.matchAll(/https:\/\/(?:images|static\d*)\.squarespace[^"\\\s)]*/g)].map(m=>m[0]);
    const stored=[...old.markdown.matchAll(/\/api\/media\/files\/[a-f0-9]{64}\.webp/g)].map(m=>m[0]);
    if(original.length===stored.length)original.forEach((url,i)=>media[url]=stored[i]);
  }
}catch {}
const failed = [];
for (let index=0; index<imageUrls.length; index++) {
  const url = imageUrls[index];
  try {
    const isPortrait = staff.some(person => person.photo === url);
    const priorPortrait = staff.find(person=>person.photo===url && previous?.staff.some(old=>old.slug===person.slug&&old.photo===media[url]));
    if(media[url]&&(!isPortrait||priorPortrait))continue;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    let image = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate();
    image = isPortrait ? image.resize(600,600,{fit:"cover",position:"attention"}) : image.resize(1400,1400,{fit:"inside",withoutEnlargement:true});
    let output = await image.webp({quality:78}).toBuffer();
    let quality=68;
    while (isPortrait && output.length>105000 && quality>=35) { output=await sharp(output).webp({quality}).toBuffer(); quality-=10; }
    const key = `${createHash("sha256").update(output).digest("hex")}.webp`;
    const stored=await storage.uploadFromBytes(`website/${key}`,output,{compress:false});
    if (!stored.ok) throw new Error("Storage failed");
    media[url]=`/api/media/files/${key}`;
  } catch(error) { failed.push({url,error:String(error)}); }
  if(index%15===0) console.log(`Media ${index+1}/${imageUrls.length}`);
}
let json=JSON.stringify(content,null,2);
for(const [url,local] of Object.entries(media)) json=json.split(url).join(local);
await fs.mkdir(`${root}/artifacts/api-server/src/data`,{recursive:true});
await fs.writeFile(`${root}/artifacts/api-server/src/data/initial-site-content.json`,json);
await fs.writeFile(`${web}/seo-routes.json`,JSON.stringify({legacyRouteAliases,sourcePaths:Object.fromEntries(sitePages.filter(p=>p.sourcePath).map(p=>[p.sourcePath,p.path]))},null,2));
const appSource=await fs.readFile(`${web}/src/App.tsx`,"utf8");
const homeDefinition=appSource.match(/const initialCopy: Copy = \{[\s\S]*?^\};/m)?.[0];
if(homeDefinition){
  const homeCode=ts.transpileModule(`export ${homeDefinition}`,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
  const home=await import(`data:text/javascript;base64,${Buffer.from(homeCode).toString("base64")}`);
  await fs.writeFile(`${web}/seo-home.json`,JSON.stringify(home.initialCopy,null,2));
}
await fs.writeFile(`${root}/artifacts/api-server/src/data/media-import-report.json`,JSON.stringify({imported:Object.keys(media).length,failed},null,2));
console.log(JSON.stringify({pages:pages.length,staff:staff.length,news:news.length,events:events.length,documents:documents.length,images:Object.keys(media).length,failed}));
