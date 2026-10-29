---
name: CHESS website editor access
description: Durable access-control requirement for the Colorado Heritage website editor.
---

The website editor is intended for selected, explicitly approved staff accounts, not all school accounts. Keep authorization enforced by the API and keep the allowlist in environment configuration rather than exposing it in the public client.

**Why:** The user selected selected-staff access for the editor and explicitly required the same allowlist for the full-site CMS.

**How to apply:** Preserve server-side allowlist enforcement for future editor changes. Require a deliberate change in approved staff scope before broadening access.

When a verified Clerk session does not provide a usable email claim, resolve the user's primary email through Clerk's server client using `auth.userId`, then check the same allowlist. Never accept an email supplied by the browser, and deny access if the lookup fails.

**Why:** A production session can authenticate successfully while its email claim does not match the configured staff allowlist; a trusted server-side lookup fixes that without widening editor access.

**How to apply:** Use this fallback for server-side checks guarded by `CHESS_EDITOR_EMAILS`; keep the allowlist as the authority.

Programmatic Clerk editor tests must target `/admin/sign-in`, not the public root.

**Why:** Clerk is mounted only for admin routes. A testing-helper ticket aimed at the public homepage left the browser signed out; the same helper worked when aimed at the admin sign-in route.

**How to apply:** Specify the admin sign-in route in future browser-test plans. Do not broaden the staff allowlist to compensate for a testing session that was never established.
