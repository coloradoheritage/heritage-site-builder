import { describe, it, expect } from "vitest";
import { splitMarkdownIntoSections, joinSections, hasMultipleSections } from "./sections";

const normalize = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

describe("splitMarkdownIntoSections", () => {
  it("returns [] for empty or whitespace-only input", () => {
    expect(splitMarkdownIntoSections("")).toEqual([]);
    expect(splitMarkdownIntoSections("   \n\n  ")).toEqual([]);
  });

  it("keeps markdown with no headings as a single section", () => {
    const md = "Just a paragraph.\n\nAnd another one.";
    expect(splitMarkdownIntoSections(md)).toEqual([md]);
  });

  it("splits at each heading and keeps leading text as its own section", () => {
    const md = "Intro line.\n\n## First\nBody one.\n\n## Second\nBody two.";
    expect(splitMarkdownIntoSections(md)).toEqual([
      "Intro line.",
      "## First\nBody one.",
      "## Second\nBody two.",
    ]);
  });

  it("handles consecutive headings without dropping either", () => {
    const md = "## A\n\n## B\nText.";
    expect(splitMarkdownIntoSections(md)).toEqual(["## A", "## B\nText."]);
  });

  it("does not split on a '#' that sits inside a fenced code block", () => {
    const md = "## Real heading\n\n```\n# not a heading\nmore code\n```\n\nAfter.";
    expect(splitMarkdownIntoSections(md)).toEqual([
      "## Real heading\n\n```\n# not a heading\nmore code\n```\n\nAfter.",
    ]);
  });

  it("keeps a markdown table intact within its section", () => {
    const md = "## Tuition\n| Program | Cost |\n| --- | --- |\n| Academy | $480 |\n\n## Next\nmore";
    const sections = splitMarkdownIntoSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain("| Academy | $480 |");
  });

  it("preserves links, images and [CONFIRM] notes verbatim", () => {
    const md = "## Visit\n[Schedule a Visit](/admissions/visit) ![logo](/img/logo.png)\n\n[CONFIRM: attribution before publishing.]";
    const [section] = splitMarkdownIntoSections(md);
    expect(section).toContain("[Schedule a Visit](/admissions/visit)");
    expect(section).toContain("![logo](/img/logo.png)");
    expect(section).toContain("[CONFIRM: attribution before publishing.]");
  });
});

describe("joinSections (round-trip losslessness)", () => {
  const samples = [
    "Just a paragraph.\n\nAnd another.",
    "Intro.\n\n## First\nBody one.\n\n## Second\n- a\n- b",
    "## Only heading\n\nOne paragraph under it.",
    "# Title\n\n## Sub A\ntext a\n\n## Sub B\ntext b\n\n### Deep\ndeep text",
  ];

  it("join(split(md)) equals normalized md for representative content", () => {
    for (const md of samples) {
      expect(joinSections(splitMarkdownIntoSections(md))).toBe(normalize(md));
    }
  });

  it("is idempotent: splitting a rejoined document is stable", () => {
    for (const md of samples) {
      const once = splitMarkdownIntoSections(md);
      const twice = splitMarkdownIntoSections(joinSections(once));
      expect(twice).toEqual(once);
    }
  });

  it("drops empty sections when joining", () => {
    expect(joinSections(["", "  ", "## Real\nkeep"])).toBe("## Real\nkeep");
  });
});

describe("hasMultipleSections", () => {
  it("is false for single-section pages and true once headings divide content", () => {
    expect(hasMultipleSections("no headings here")).toBe(false);
    expect(hasMultipleSections("lead\n\n## A\nx\n\n## B\ny")).toBe(true);
  });
});
