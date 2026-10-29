import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import routes from "./seo-routes.json" with { type: "json" };
import initialHome from "./seo-home.json" with { type: "json" };

export const siteOrigin = "https://heritage-site-builder.replit.app";
const apiOrigin = process.env.SITE_API_ORIGIN || "http://127.0.0.1:8080";
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
const html = markdown => sanitizeHtml(marked.parse(markdown || ""), {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
  allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img:["src","alt","width","height","loading"], a:["href","title","rel"] },
  allowedSchemes: ["http","https","mailto","tel"],
});
export function canonicalPath(path) {
  const normal = decodeURI(path).replace(/\/+$/, "") || "/";
  return routes.legacyRouteAliases[normal] || routes.sourcePaths[normal]
    || (normal.startsWith("/new-events/") ? normal.replace("/new-events/","/events/") : normal);
}
export async function loadContent() {
  const response = await fetch(`${apiOrigin}/api/site-content`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Website content is unavailable");
  return response.json();
}
export function renderSitemap(content) {
  const paths = ["/", ...content.pages.map(page=>page.path), ...content.staff.map(person=>`/about/faculty/${person.slug}`), ...content.news.map(item=>item.path), ...content.events.map(item=>item.path)];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map(path=>`<url><loc>${esc(siteOrigin+path)}</loc></url>`).join("")}</urlset>`;
}
export async function renderPage(template, requestedPath, content) {
  const path = canonicalPath(requestedPath);
  const page = content.pages.find(page=>page.path===path);
  const staff = content.staff.find(person=>`/about/faculty/${person.slug}`===path);
  const article = [...content.news,...content.events].find(item=>item.path===path);
  const isAdmin = /^\/admin(?:\/|$)/.test(path);
  const found = path==="/" || page || staff || article || isAdmin;
  const title = isAdmin ? "Staff Website Editor | Colorado Heritage" : staff ? `${staff.name} | Colorado Heritage` : article?.title || page?.title || (path==="/" ? "Colorado Heritage Education School System" : "Page not found | Colorado Heritage");
  const description = staff?.role || page?.description || "A private Christian school serving K–12 homeschooling families in Greeley, Colorado since 1991.";
  const docUrl = url => content.documents.find(doc=>doc.id===url)?.url || url;
  let body = "";
  if (path === "/") {
    const homeResponse = await fetch(`${apiOrigin}/api/homepage-content`, { signal: AbortSignal.timeout(10000) });
    if (!homeResponse.ok) throw new Error("Homepage content is unavailable");
    const { content: savedHome } = await homeResponse.json();
    const home = {
      order: savedHome?.order || Object.keys(initialHome),
      hidden: savedHome?.hidden || [],
      copy: Object.fromEntries(Object.entries(initialHome).map(([key,fields])=>[key,{...fields,...savedHome?.copy?.[key]}])),
    };
    body = `<section><p>Kindergarten through grade 12 · Greeley, Colorado</p><h1>${esc(home.copy.hero.title || title)}</h1>${Object.entries(home.copy.hero).filter(([key])=>!/^image|title|button/i.test(key)&&!/button/i.test(key)).map(([,value])=>`<p>${esc(value)}</p>`).join("")}<a href="/families/apply">${esc(home.copy.hero.visitButton || "Schedule a Visit / Apply")}</a><a href="/programs">${esc(home.copy.hero.primaryButton)}</a><a href="/about/our-purpose">${esc(home.copy.hero.secondaryButton)}</a></section>`;
    if (home.copy) {
      for (const key of home.order || Object.keys(home.copy)) {
        if (key==="hero" || home.hidden?.includes(key)) continue;
        const copy=home.copy[key]||{};
        body+=`<section>${Object.entries(copy).filter(([,value])=>typeof value==="string").map(([field,value])=>{
          if(/imageAlt/i.test(field))return "";
          if(/image/i.test(field))return value?`<img src="${esc(value)}" alt="${esc(copy[`${field}Alt`]||copy.title||"Colorado Heritage")}">`:"";
          if(/title/i.test(field))return `<h2>${esc(value)}</h2>`;
          return `<p>${esc(value)}</p>`;
        }).join("")}</section>`;
      }
    } else {
      body += `<section><h2>Christian education. Faithful partnership.</h2><p>Colorado Heritage Education School System partners with homeschooling families through our Independent School, K–12 Academy and High School Diploma programs.</p>${content.pages.filter(p=>p.path.startsWith("/programs/")&&p.path.split("/").length===3).map(p=>`<h2><a href="${esc(p.path)}">${esc(p.label)}</a></h2><p>${esc(p.description)}</p>`).join("")}<p>Serving families since 1991.</p></section>`;
    }
  } else if (staff) {
    body=`<h1>${esc(staff.name)}</h1><p>${esc(staff.role)}</p>${staff.photo?`<img src="${esc(staff.photo)}" alt="${esc(staff.alt)}" width="300" height="300">`:""}${html(staff.bio)}`;
  } else if (article) {
    body=`<h1>${esc(article.title)}</h1><time>${esc(article.date)}</time>${article.archived?"<p>Archived school event. This is not an upcoming event.</p>":""}${html(article.markdown)}`;
  } else if (page) {
    body=`<h1>${esc(page.label)}</h1><p>${esc(page.description)}</p>`;
    if (path==="/about/faculty") {
      body+=content.staff.map(person=>`<article><a href="/about/faculty/${esc(person.slug)}">${person.photo?`<img src="${esc(person.photo)}" alt="${esc(person.alt)}" width="300" height="300">`:""}<h2>${esc(person.name)}</h2></a><p>${esc(person.role)}</p></article>`).join("");
    } else {
      body+=page.kind==="protected"&&(!page.markdown.trim()||page.markdown.trim()==="Colorado Heritage — Secure")
        ? '<p>This resource is intended for current CHESS families. Contact the CHESS office for help accessing the current resource.</p><a href="/contact">Contact the school office</a>'
        : html(page.markdown);
    }
    if (path==="/news" || path==="/events") body+=(path==="/news"?content.news:content.events).filter(item=>!item.archived).map(item=>`<article><h2><a href="${esc(item.path)}">${esc(item.title)}</a></h2><time>${esc(item.date)}</time></article>`).join("");
    if (page.documentPath) body+=`<p><a href="${esc(docUrl(page.documentPath))}">${esc(page.label)} (PDF)</a></p>`;
    if (page.externalUrl) body+=`<p><a href="${esc(page.externalUrl)}">Open ${esc(page.label)}</a></p>`;
    if (page.kind==="overview" || path==="/sitemap") {
      const links=path==="/sitemap"?content.pages:content.pages.filter(child=>content.navigation.find(item=>item.path===path)?.children.includes(child.path));
      body+=`<ul>${links.map(child=>`<li><a href="${esc(child.path)}">${esc(child.label)}</a></li>`).join("")}</ul>`;
    }
  } else if (!isAdmin) body=`<h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return home</a>`;
  const nav=`<header><a href="/">Colorado Heritage</a><nav aria-label="Main navigation">${content.navigation.map(group=>`<a href="${esc(group.path)}">${esc(group.label)}</a>`).join(" · ")}</nav></header>`;
  const schema = { "@context":"https://schema.org","@type":"School",name:"Colorado Heritage Education School System",url:siteOrigin,telephone:"(970) 346-0099",email:"office@coloradoheritage.org",address:{"@type":"PostalAddress",streetAddress:"1300 9th St",addressLocality:"Greeley",addressRegion:"CO",addressCountry:"US"},logo:`${siteOrigin}/images/chess-seal.png` };
  const metadata=`<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(siteOrigin+path)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="${article?"article":"website"}"><meta property="og:url" content="${esc(siteOrigin+path)}"><meta property="og:image" content="${siteOrigin}/images/chess-seal.png"><meta property="og:image:alt" content="Colorado Heritage Education School System seal"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${siteOrigin}/images/chess-seal.png"><meta name="robots" content="${!found||isAdmin||article?.archived?"noindex, follow":"index, follow"}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,"\\u003c")}</script>`;
  let output=template.replace(/<title>[\s\S]*?<\/title>/g,"").replace(/<meta[^>]+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g,"").replace(/<link[^>]+rel="canonical"[^>]*>/g,"");
  output=output.replace("</head>",`${metadata}</head>`);
  for (const doc of content.documents) {
    if(doc.id!==doc.url) body=body.split(`href="${esc(doc.id)}"`).join(`href="${esc(doc.url)}"`);
  }
  if (!isAdmin) output=output.replace('<div id="root"></div>',`<div id="root"><div class="chess-public">${nav}<main class="chess-page-shell">${body}</main><footer><p>Colorado Heritage Education School System · 1300 9th St, Greeley, CO · (970) 346-0099 · office@coloradoheritage.org</p></footer></div></div>`);
  return { html:output, status:found?200:404, redirect: found&&path!==requestedPath?path:undefined };
}
