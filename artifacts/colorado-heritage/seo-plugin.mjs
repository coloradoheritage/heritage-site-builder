import fs from "node:fs/promises";
import { loadContent, renderPage, renderSitemap, siteOrigin } from "./seo-render.mjs";
export default function seoPlugin(){return {name:"chess-server-render",configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
    const url=new URL(req.url,"http://internal");
    if(url.pathname==="/index.html"){res.writeHead(301,{Location:"/"+url.search});res.end();return;}
    if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/@")||url.pathname.startsWith("/src/")||url.pathname.startsWith("/node_modules/")||url.searchParams.has("html-proxy"))return next();
    try {
      if(url.pathname==="/sitemap.xml"){res.setHeader("Content-Type","application/xml");res.end(renderSitemap(await loadContent()));return;}
      if(url.pathname==="/robots.txt"){res.setHeader("Content-Type","text/plain");res.end(`User-agent: *\nDisallow: /admin\nSitemap: ${siteOrigin}/sitemap.xml\n`);return;}
      if(pathHasExtension(url.pathname)){
        try {if((await fs.stat(new URL(`./public${decodeURIComponent(url.pathname)}`,import.meta.url))).isFile())return next();}catch {}
        res.statusCode=404;res.end("Not found");return;
      }
      if(!req.headers.accept?.includes("text/html"))return next();
      const template=await server.transformIndexHtml(url.pathname,await fs.readFile(new URL("./index.html",import.meta.url),"utf8"));
      const result=await renderPage(template,url.pathname,await loadContent());
      if(result.redirect){res.writeHead(301,{Location:result.redirect+url.search});res.end();return;}
      res.writeHead(result.status,{"Content-Type":"text/html; charset=utf-8"});res.end(result.html);
    }catch(error){server.config.logger.error(`Server render failed: ${error.message}`);res.statusCode=503;res.end("Website content is temporarily unavailable.");}
  });
}};}
function pathHasExtension(path){return /\.[a-z0-9]+$/i.test(path);}
