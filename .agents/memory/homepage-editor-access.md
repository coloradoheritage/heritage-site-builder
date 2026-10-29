---
name: CHESS homepage editor access
description: Durable access-control requirement for the Colorado Heritage homepage editor.
---

The homepage editor is intended for selected, explicitly approved staff accounts, not all school accounts. Keep authorization enforced by the API and keep the allowlist in environment configuration rather than exposing it in the public client.

**Why:** The user selected selected-staff access as the policy for the separate admin subdomain.

**How to apply:** Preserve server-side allowlist enforcement for future editor changes. Require a deliberate change in approved staff scope before broadening access.

When a verified Clerk session does not provide a usable email claim, resolve the user's primary email through Clerk's server client using `auth.userId`, then check the same allowlist. Never accept an email supplied by the browser, and deny access if the lookup fails.

**Why:** A production session can authenticate successfully while its email claim does not match the configured staff allowlist; a trusted server-side lookup fixes that without widening editor access.

**How to apply:** Use this fallback for server-side checks guarded by `CHESS_EDITOR_EMAILS`; keep the allowlist as the authority.
