import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, renderPage, renderSitemap, siteOrigin } from "./seo-render.mjs";
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"dist/public");
const mime={".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".pdf":"application/pdf",".ico":"image/x-icon",".json":"application/json"};
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,"http://internal");
    if(url.pathname==="/index.html"){res.writeHead(301,{Location:"/"+url.search});res.end();return;}
    if(url.pathname==="/robots.txt"){res.setHeader("Content-Type","text/plain");res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${siteOrigin}/sitemap.xml\n`);return;}
    if(url.pathname==="/sitemap.xml"){res.setHeader("Content-Type","application/xml");res.end(renderSitemap(await loadContent()));return;}
    const file=path.resolve(root,`.${decodeURIComponent(url.pathname)}`);
    if(file.startsWith(root+path.sep)&&path.extname(file)){
      try {if((await stat(file)).isFile()){res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");res.end(await readFile(file));return;}} catch {}
      res.writeHead(404);res.end("Not found");return;
    }
    const result=await renderPage(await readFile(path.join(root,"index.html"),"utf8"),url.pathname,await loadContent());
    if(result.redirect){res.writeHead(301,{Location:result.redirect+url.search});res.end();return;}
    res.writeHead(result.status,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});res.end(result.html);
  }catch(error){console.error("Website rendering failed",error.message);res.writeHead(503,{"Content-Type":"text/html; charset=utf-8"});res.end("<h1>Website temporarily unavailable</h1><p>Please try again shortly.</p>");}
}).listen(Number(process.env.PORT),"0.0.0.0",()=>console.log("Website server ready"));
