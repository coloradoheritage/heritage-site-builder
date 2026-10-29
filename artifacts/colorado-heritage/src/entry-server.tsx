import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { getGetSiteContentQueryKey, type SiteContentState } from "@workspace/api-client-react";
import { PublicSiteHeader, PublicSiteFooter, PublicSitePages, AnnouncementBar } from "./components/public-site";
import { faqJsonLd, schoolJsonLd, setContentRedirects } from "./lib/cms";

/** The same public components render in Node and in the browser. No parallel copy of page text. */
export function renderSite(content: SiteContentState, path: string, search = "") {
  const client = new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:false}}});
  client.setQueryData(getGetSiteContentQueryKey(),content);
  setContentRedirects(content.redirects);
  let faqs = content.faqs || [];
  if(path==="/") faqs = faqs.filter(f=>f.showOnHome);
  else if(path==="/admissions/tuition"){
    const cost=faqs.filter(f=>/cost|tuition|pay|scholarship|fee|price|afford/i.test(f.question));
    if(cost.length)faqs=cost;
  }else if(path!=="/faq")faqs=[];
  try {
    const html=renderToString(<QueryClientProvider client={client}><Router ssrPath={path} ssrSearch={search}>
      <div className="cb-site cb-ssr"><a className="cb-skip" href="#main">Skip to content</a><AnnouncementBar /><PublicSiteHeader /><PublicSitePages /><PublicSiteFooter /></div>
    </Router></QueryClientProvider>);
    return {html,faq:faqJsonLd(faqs),school:schoolJsonLd};
  } finally {client.clear();}
}
