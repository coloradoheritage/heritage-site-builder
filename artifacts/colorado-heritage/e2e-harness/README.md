# Editor E2E harness (test-only)

Isolated browser tests for the staff editor. Adds files only under this directory; no app source is modified.

- `main.tsx` / `index.html` / `vite.config.ts`: mounts the real `EditorHome` and `SiteManager` without the Clerk sign-in gate.
- `lib.mjs`: Playwright (system Chrome) session. All requests are served locally; `/api/*` is an in-memory mock; every non-local request is aborted.
- `fixture.mjs`: fixture content (repo seed `artifacts/api-server/src/data/initial-site-content.json` plus a few overlay pages).
- `run-tests.mjs`: the test cases.

Not covered: Clerk auth, the Express API, Postgres, object storage, Replit workspace or dev-preview.

```
cd artifacts/colorado-heritage/e2e-harness
npm install                                  # playwright-core only
../node_modules/.bin/vite --config vite.config.ts &   # serves 127.0.0.1:5199
CHROME_PATH=/path/to/chrome OUT_DIR=/tmp/out node run-tests.mjs
```
