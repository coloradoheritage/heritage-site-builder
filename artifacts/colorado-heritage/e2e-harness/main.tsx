// TEST-ONLY harness. Mounts the real EditorHome / SiteManager components without the
// Clerk sign-in gate (App.tsx AdminGate/EditorChooser), so they can be exercised in a
// browser against a mocked /api. It does NOT exercise Clerk auth, the Express API, the DB,
// or Replit. Mirrors the tool switch in App.tsx EditorChooser (home | site).
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { EditorHome, SiteManager } from "../src/components/site-manager";
import { PublicSitePages } from "../src/components/public-site";
import "../src/index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// ?view=public&path=/x renders the real public page component against the mocked PUBLISHED content.
function PublicView({ path }: { path: string }) {
  return <div className="cb-site"><PublicSitePages previewPath={path} /></div>;
}

function Harness() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "public") return <PublicView path={params.get("path") || "/"} />;
  const [tool, setTool] = useState<"home" | "site">(() => (new URLSearchParams(window.location.search).get("tool") === "site" ? "site" : "home"));
  const publicSiteUrl = `${window.location.origin}/`;
  const choose = (next: string) => setTool(next === "site" ? "site" : "home");
  if (tool === "site") return <SiteManager onBack={() => setTool("home")} publicSiteUrl={publicSiteUrl} />;
  return <EditorHome onChoose={choose as never} publicSiteUrl={publicSiteUrl} />;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <WouterRouter>
      <Harness />
    </WouterRouter>
  </QueryClientProvider>,
);
