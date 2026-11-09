// Fixture content for the isolated editor tests. Starts from the repository's checked-in
// seed (artifacts/api-server/src/data/initial-site-content.json: no database, no network)
// and overlays a few deterministic pages used by the assertions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(here, "../../api-server/src/data/initial-site-content.json");

export function buildFixture() {
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const byPath = new Map(seed.pages.map((p) => [p.path, p]));
  const set = (p, patch) => { byPath.set(p, { ...(byPath.get(p) ?? { path: p, kind: "content", title: p, description: "" }), path: p, ...patch }); };

  set("/programs/independent-school", {
    label: "Independent School",
    title: "Independent School | Fixture",
    description: "Fixture intro sentence for the independent school page.",
    kind: "content",
    markdown: [
      "Fixture paragraph one has [an internal link](/programs/academy) and [an external link](https://example.org/info) inside it.",
      "",
      "![Fixture geese family](/api/media/files/fixture-geese.svg)",
      "",
      "Fixture paragraph two is plain text that can be selected for formatting.",
    ].join("\n"),
  });
  set("/about/beliefs", {
    label: "Our Beliefs",
    title: "Our Beliefs | Fixture",
    description: "Fixture beliefs intro.",
    kind: "content",
    markdown: "Beliefs paragraph with a photo that has no description: ![](/api/media/files/fixture-nodesc.svg) and trailing text.",
  });
  const home = {
    path: "/", label: "Home", title: "Fixture Home", description: "Fixture home intro sentence.", kind: "content",
    markdown: "Fixture home paragraph linking to [Programs](/programs).",
  };
  const pages = [...byPath.values()];
  const draft = { ...seed, revision: 1, home, pages, faqs: [], announcements: [] };
  const published = JSON.parse(JSON.stringify(draft));
  return { published, draft, draftBaseRevision: 1, versions: [] };
}

export const svg = (label, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><rect width="480" height="240" fill="${color}"/><text x="240" y="130" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
