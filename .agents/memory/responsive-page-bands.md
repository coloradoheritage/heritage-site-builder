---
name: Responsive page bands
description: Why nested full-width CTA bands caused desktop and mobile horizontal scrolling.
---

Keep CTA bands inside constrained content pages sized to their parent, rather than using negative margins based on `50vw`.

**Why:** Browser checks showed overflow even after images, tables, and header sizing were fixed. Viewport units included the classic scrollbar width; the negative margins extended the CTA past the document on desktop and mobile.

**How to apply:** When changing FAQ, tuition, or other nested page CTAs, use parent-based widths or an explicitly scrollbar-aware full-bleed layout. Do not hide horizontal overflow to conceal content that is actually too wide.
