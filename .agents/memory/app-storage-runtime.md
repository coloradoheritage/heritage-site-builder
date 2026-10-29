---
name: App Storage runtime constraints
description: Avoid default-bucket discovery and pnpm dependency resolution failures in the bundled API.
---

Pass the configured default bucket explicitly to the App Storage SDK, and keep that SDK external to the API bundle.

**Why:** The SDK's automatic bucket discovery did not resolve the provisioned bucket in this environment. Bundling the SDK while externalizing its cloud dependencies also caused Node to resolve transitive packages from the wrong pnpm package scope.

**How to apply:** When changing storage or API bundling, preserve explicit environment-based bucket selection and the SDK's own package boundary. Never hardcode credentials.
