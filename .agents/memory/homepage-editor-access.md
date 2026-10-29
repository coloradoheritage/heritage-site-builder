---
name: CHESS homepage editor access
description: Durable access-control requirement for the Colorado Heritage homepage editor.
---

The homepage editor is intended for selected, explicitly approved staff accounts, not all school accounts. Keep authorization enforced by the API and keep the allowlist in environment configuration rather than exposing it in the public client.

**Why:** The user selected selected-staff access as the policy for the separate admin subdomain.

**How to apply:** Preserve server-side allowlist enforcement for future editor changes. Require a deliberate change in approved staff scope before broadening access.
