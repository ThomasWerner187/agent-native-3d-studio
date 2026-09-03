# Netcup test deployment

Prepared on 2026-09-03 for `https://studio.wernerverse.de/`. This is a separate test deployment; the existing Netlify deployment is unchanged.

- Build: `npm ci && npm run build && node scripts/package-netcup.mjs`.
- Runtime: static HTML, JavaScript and CSS; no server application or environment variables.
- Source: committed Studio revision `cdbc5c5`, followed only by deployment configuration/documentation. Uncommitted changes in another checkout are not part of this test package.
- Upload archive: `releases/netcup/studio-netcup-test.zip`. Extract its contents directly into the dedicated Studio document root selected in Plesk, never the shared account `httpdocs` directory.
- Plesk, TLS, document-root assignment and protected-directory credentials are managed separately. Credentials must never be stored in this repository or archive.
- Existing mail DNS and the original Netlify deployment do not need changes.

## Server configuration

The included `.htaccess` sets `Origin-Agent-Cluster: ?1`, `X-Content-Type-Options: nosniff`, the referrer policy, HTML revalidation and one-year immutable caching for fingerprinted Vite assets. Cache directives use `private` because this test deployment is authenticated. It does not implement authentication or redirects. Preserve/merge any authentication directives written by Plesk; do not overwrite an existing protected-directory `.htaccess` blindly.

Enforce HTTPS in Plesk after the certificate is working. Configure authentication before exposing this test deployment. If nginx serves static assets directly, `.htaccess` headers may not apply to those responses. Verify headers over HTTPS and configure the equivalent headers in the relevant Plesk server settings when necessary.

The app uses query parameters (`?agent=1`) and URL fragments (`#scene=...`), not history routes. No SPA fallback or server redirect for those values is required. Shared scene URLs are generated from the current origin.

## Verification after upload

Local preparation passed `npm ci` (zero reported vulnerabilities), TypeScript/Vite production build, and the existing browser smoke suite: 20/20 tools, 12/12 semantic checks, and corrupted-share-link recovery. A source scan found no network API, WebSocket or localhost dependency in the runtime source. Native WebMCP over the authenticated public origin and Apache/nginx header delivery remain deployment checks.

1. Without credentials, `/`, `/index.html` and the JavaScript/CSS asset URLs must require authentication. Do not put credentials in URLs or terminal history.
2. In a fresh browser, sign in over valid HTTPS. Confirm the initial 3D scene renders and no assets fail to load.
3. Check response headers for `/`, `/index.html` and both fingerprinted assets. Verify HTML revalidation, asset immutable caching and `Origin-Agent-Cluster: ?1` on the document.
4. In a WebMCP-capable browser, discover the registered native tools and use `describe_scene`, then add/move an object. Confirm the viewport reflects the result.
5. Open `/?agent=1`, exercise the built-in agent bridge, export a scene and reopen its generated share URL. This bridge checks the same handlers but is not a substitute for native WebMCP discovery.
6. Revisit `/` and the share URL in the authenticated session. Native HTTP authentication must not repeatedly interrupt the agent or asset loads.

## Rollback

Keep the previous dedicated document-root contents outside the public root before replacing a version. Restore those files and preserve the Plesk-generated authentication configuration. Keep fingerprinted assets from the immediately previous version until any active sessions have finished. This archive alone cannot change DNS, TLS or Plesk settings.
