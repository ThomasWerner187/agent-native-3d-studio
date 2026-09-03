# Netcup test deployment

Prepared and uploaded on 2026-09-03 for `https://studio.wernerverse.de/`. This is a separate test deployment; the existing Netlify deployment is unchanged. Authentication, trusted HTTPS and the HTTP-to-HTTPS redirect are active. Authenticated HTTP, browser rendering and native WebMCP verification passed.

- Build: `npm ci && npm run build && node scripts/package-netcup.mjs`.
- Runtime: static HTML, JavaScript and CSS; no server application or environment variables.
- Source: committed Studio revision `cdbc5c5`, followed only by deployment configuration/documentation. Uncommitted changes in another checkout are not part of this test package.
- Uploaded archive: `releases/netcup/studio-netcup-test.zip`, package revision `59ca7967f488bc352254f540926b1b472fddbd4e`, SHA256 `5b5945983dbe4d0fa2aec78bbb5058185e334d35dbf43fb16864adfe8e35b935`.
- Actual document root: `studio.wernerverse.de/httpdocs` relative to the hosting subscription. The archive was extracted there and then removed from the document root through the Plesk file manager.
- Plesk, TLS, document-root assignment and protected-directory credentials are managed separately. Credentials must never be stored in this repository or archive.
- Existing mail DNS and the original Netlify deployment do not need changes.

## Server configuration

The included `.htaccess` sets `Origin-Agent-Cluster: ?1`, `X-Content-Type-Options: nosniff`, the referrer policy, HTML revalidation and one-year immutable caching for fingerprinted Vite assets. Cache directives use `private` because this test deployment is authenticated. It does not implement authentication or redirects. Preserve/merge any authentication directives written by Plesk; do not overwrite an existing protected-directory `.htaccess` blindly.

The deployment operator confirmed these domain-specific Plesk settings: PHP and FastCGI disabled; nginx proxy mode enabled; direct static serving and nginx caching disabled. Intelligent processing of static files was then disabled to ensure Apache receives the requests and applies `.htaccess` headers. No shared webspace credentials or SSH settings were changed.

A Let's Encrypt certificate was issued after the user's explicit approval of the terms. Plesk reports expiry on 2026-12-02. HTTPS enforcement is enabled, and normal TLS validation passed in the final checks. Preserve these settings on future updates: if nginx serves static assets directly, `.htaccess` headers may not apply to those responses.

The app uses query parameters (`?agent=1`) and URL fragments (`#scene=...`), not history routes. No SPA fallback or server redirect for those values is required. Shared scene URLs are generated from the current origin.

## Verification after upload

Local preparation passed `npm ci` (zero reported vulnerabilities), TypeScript/Vite production build, and the existing browser smoke suite: 20/20 tools, 12/12 semantic checks, and corrupted-share-link recovery. A source scan found no network API, WebSocket or localhost dependency in the runtime source. Native WebMCP over the authenticated public origin was subsequently verified as described below.

### Current deployment status

Checked 2026-09-03 at approximately 20:08 UTC, after TLS issuance and the final nginx configuration:

- Plesk root-directory protection and a dedicated test user were created by the deployment operator. Credentials were read from an external local file and used only over HTTPS with normal certificate validation. No credentials or authorization headers were written to the repository or QA output.
- DNS resolves to `188.68.47.172` and `2a03:4000:30:c9c7::15:2448`. IPv4 was also confirmed through Cloudflare DNS and the authoritative Netcup DNS server.
- HTTP `/` returns `301` to the HTTPS URL before issuing an authentication challenge.
- HTTPS `/`, `/index.html`, `/?agent=1`, both actual fingerprinted JavaScript/CSS paths and all three `/music/*.mp3` paths return `401 Unauthorized` without credentials and `200` with credentials. The 401 responses contain the same 172-byte error document; authenticated content types and byte lengths match the expected build files.
- Authenticated HTML returns `Origin-Agent-Cluster: ?1`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Cache-Control: private, max-age=0, must-revalidate`. JavaScript/CSS return the same security headers and `Cache-Control: private, max-age=31536000, immutable`. MP3 responses also include the security headers and correct `audio/mpeg` MIME type.
- Authenticated index HTML, JavaScript and CSS exactly match the local package by SHA256. An MP3 byte-range request returns `206` with the requested 32-byte range.
- With authentication, `/studio-netcup-test.zip` returns `404` and `/.htaccess` returns `403` without configuration content.
- Earlier pre-certificate checks failed TLS validation. That gate is now resolved without bypassing certificate validation.

### Native WebMCP browser verification

The deployment operator completed the following check in the Codex in-app browser on the authenticated public Studio origin on 2026-09-03:

- Normal HTTPS and HTTP Basic login succeeded.
- Native browser WebMCP discovery (`webmcp.fetchTools`) exposed all 20 tools.
- Native `help` and `describe_scene` calls succeeded.
- Native `add_object` created the sphere named `Netcup QA sphere` (`obj15`), increasing the reported object count from 14 to 15.
- Native `undo` restored the count to 14; a subsequent `describe_scene` confirmed the restoration.
- Screenshot inspection confirmed the scene rendered correctly and the interface reported WebMCP live with 20 tools.

This verifies native discovery and a reversible tool mutation after authentication. The full 20-tool behavioral suite was run locally; it was not repeated in full against the hosted origin. The following checklist remains the repeatable verification procedure for future deployments:

1. Without credentials, `/`, `/index.html` and the JavaScript/CSS asset URLs must require authentication. Do not put credentials in URLs or terminal history.
2. In a fresh browser, sign in over valid HTTPS. Confirm the initial 3D scene renders and no assets fail to load.
3. Check response headers for `/`, `/index.html` and both fingerprinted assets. Verify HTML revalidation, asset immutable caching and `Origin-Agent-Cluster: ?1` on the document.
4. In a WebMCP-capable browser, discover the registered native tools and use `describe_scene`, then add/move an object. Confirm the viewport reflects the result.
5. Open `/?agent=1`, exercise the built-in agent bridge, export a scene and reopen its generated share URL. This bridge checks the same handlers but is not a substitute for native WebMCP discovery.
6. Revisit `/` and the share URL in the authenticated session. Native HTTP authentication must not repeatedly interrupt the agent or asset loads.

## Rollback

Keep the previous dedicated document-root contents outside the public root before replacing a version. Restore those files and preserve the Plesk-generated authentication configuration. Keep fingerprinted assets from the immediately previous version until any active sessions have finished. This archive alone cannot change DNS, TLS or Plesk settings.
