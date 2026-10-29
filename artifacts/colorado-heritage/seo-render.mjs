import routes from "./seo-routes.json" with { type:"json" };
export const siteOrigin="https://heritage-site-builder.replit.app";
const apiOrigin=process.env.SITE_API_ORIGIN||"http://127.0.0.1:8080";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const json=value=>JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
const plain=value=>String(value||"").replace(/!\[[^\]]*\]\([^)]+\)/g,"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/[#*_`>]/g,"").replace(/\s+/g," ").trim();
export function canonicalPath(requested,content={}) {
  let path;
  try{path=decodeURI(requested).replace(/\/+$/,"")||"/";}catch{return requested;}
  if(/^\/(?:news\/(?:category|tag)|new-events)(?:\/|$)/.test(path))return path.startsWith("/news")?"/news":"/parents/calendar";
  const person=path.match(/^\/about\/(?:faculty|staff)\/([^/]+)$/);
  if(person)return `/about/our-people/${person[1]}`;
  if(path.startsWith("/s/")){
    const document=content.documents?.find(d=>d.id.replace(/^https?:\/\/(?:www\.)?coloradoheritage\.org/i,"")===path);
    if(document?.url && document.url!==path)return document.url;
  }
  for(let n=0;n<10;n++){
    const [base,hash]=path.split("#");
    const next=content.redirects?.[base]||routes.legacyRouteAliases[base]||routes.sourcePaths[base];
    if(!next||next===base)break;
    path=next+(hash&&!next.includes("#")?`#${hash}`:"");
  }
  return path;
}
export async function loadContent() {
  const response=await fetch(`${apiOrigin}/api/site-content`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error("Website content is unavailable");
  return response.json();
}
export function renderSitemap(content) {
  const paths=["/",...content.pages.filter(p=>!p.archived).map(p=>p.path),...content.staff.map(p=>`/about/our-people/${p.slug}`),
    ...content.news.filter(a=>!a.archived).map(a=>a.path),...content.events.filter(a=>!a.archived && canonicalPath(a.path,content)===a.path).map(a=>a.path)];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map(p=>`<url><loc>${esc(siteOrigin+p)}</loc></url>`).join("")}</urlset>`;
}
export function redirectLocation(target,search=""){
  const [path,hash]=target.split("#");
  return path+search+(hash?`#${hash}`:"");
}
export async function renderPage(template,requestedPath,content,search="",renderer) {
  const canonical=canonicalPath(requestedPath,content);
  if(canonical!==requestedPath)return {status:301,redirect:canonical};
  const path=canonical.split("#")[0];
  const page=path==="/"?content.home:content.pages.find(p=>p.path===path);
  const staff=content.staff.find(p=>path===`/about/our-people/${p.slug}`);
  const article=[...content.news,...content.events].find(a=>a.path===path);
  const admin=/^\/admin(?:\/|$)/.test(path);
  const found=Boolean(page||staff||article||path==="/"||admin);
  const title=admin?"Staff Website Editor | CHESS":staff?`${staff.name} | CHESS`:article?`${article.title} | CHESS ${path.startsWith("/news/")?"Blog":"Events"}`:page?.title||"Page not found | CHESS";
  const description=(page?.metaDescription|| (article?plain(article.markdown).slice(0,150):staff?plain(staff.bio).slice(0,150):page?.description)||"Colorado Heritage Education School System — Christian K–12 education for homeschooling families in Greeley, Colorado since 1991.").slice(0,155);
  const noindex=admin||!found||article?.archived||page?.archived;
  const absolute=siteOrigin+path;
  const bundle="./dist/server/entry-server.js";
  const render=renderer||(await import(/* @vite-ignore */ bundle)).renderSite;
  const rendered=admin?{html:"",school:null,faq:null}:render(content,path,search);
  const schemas=[rendered.school,rendered.faq];
  const events=[];
  if(path==="/parents/calendar")for(const event of content.events.filter(a=>!a.archived && a.date>=new Date().toISOString().slice(0,10))){
    events.push({"@context":"https://schema.org","@type":"Event",name:event.title,startDate:event.date,eventAttendanceMode:"https://schema.org/OfflineEventAttendanceMode",eventStatus:"https://schema.org/EventScheduled",description:plain(event.markdown).slice(0,155),url:siteOrigin+event.path,location:{"@type":"Place",name:"Colorado Heritage Education School System",address:{"@type":"PostalAddress",streetAddress:"1300 9th Street",addressLocality:"Greeley",addressRegion:"CO",postalCode:"80631",addressCountry:"US"}}});
  }
  if(events.length)schemas.push(events);
  const metadata=`<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${noindex?"noindex,follow":"index,follow"}"><link rel="canonical" href="${esc(absolute)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(absolute)}"><meta property="og:type" content="${article?"article":"website"}"><meta property="og:site_name" content="Colorado Heritage Education School System"><meta property="og:image" content="${siteOrigin}/images/social-share.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${siteOrigin}/images/social-share.jpg">${schemas.filter(Boolean).map(s=>`<script type="application/ld+json">${json(s)}</script>`).join("")}<style>.cb-ssr .cb-reveal{opacity:1;transform:none}</style>`;
  let schemaIndex=0;
  const schemaIds=schemas.flatMap((value,index)=>value?[["school",path==="/admissions/tuition"?"faq":"faq-page","events"][index]]:[]);
  const taggedMetadata=metadata.replace(/<script type="application\/ld\+json">/g,()=>`<script type="application/ld+json" data-jsonld="${schemaIds[schemaIndex++]}">`);
  let output=template.replace(/<title>[\s\S]*?<\/title>/g,"").replace(/<meta[^>]+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g,"").replace(/<link[^>]+rel="canonical"[^>]*>/g,"").replace("</head>",taggedMetadata+"</head>");
  if(!admin)output=output.replace('<div id="root"></div>',`<div id="root">${rendered.html}</div><script id="chess-content" type="application/json">${json(content)}</script>`);
  return {html:output,status:found?200:404};
}
