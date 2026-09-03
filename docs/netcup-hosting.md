# Netcup Studio deployment

Current target: [studio.wernerverse.de](https://studio.wernerverse.de/), with the [Demo browser](https://studio.wernerverse.de/?demo=1) on the same build. Netcup is the intended current host. Testing credentials are supplied separately; never put credentials in this repository, an archive, a URL or verification output.

## Final Zen replacement

Deployed through Plesk on September 3, 2026, at approximately 20:23 UTC. Hosted content, rendering and native WebMCP checks passed. The replacement is built from the final Zen source, not the older `main` branch used for the first Netcup test upload.

- Current release source: `4b319c16906edafbb3058446925d72b71d5696a6`, a metadata-only update on final Zen revision `28f21233efed0550cf8bfe73c3233b889a99bed4`. The social-preview URL now uses the Netcup origin; JavaScript and CSS are unchanged.
- Document root: `studio.wernerverse.de/httpdocs`, relative to the hosting subscription.
- Runtime: static HTML, JavaScript, CSS, fonts and audio. No backend, server application or runtime environment variables.
- Local preparation: `npm ci && npm run build && npm run package:netcup`.
- Archive: `releases/netcup/studio-zen-final.zip`.
- Current local full archive SHA256: `18732c15e03d502065c025f21c59f5778088f4bda5f0fed04a2565863aff364c`. This reproducible package contains the final metadata update and is built from `4b319c16906edafbb3058446925d72b71d5696a6`.
- `releases/netcup/build.json` records the source revision, document root, archive hash and every runtime file's size and SHA256.
- The archive contains 12 public runtime files. It excludes `.htaccess`, all hidden files, `_headers` and `_redirects`, preserving Plesk's existing protection and server configuration.

The clean rebuild passed TypeScript and Vite compilation; dependency installation reported zero vulnerabilities. Its fingerprinted assets match the recorded final Zen release byte for byte. The current HTML includes only the hosting metadata change described above:

| File | SHA256 |
| --- | --- |
| `index.html` (15,772 bytes) | `7a556595ee6bf8c68cf7a894534342bf5c593e2913054542937c0e2a3facf95f` |
| `assets/index-DMV7pxmZ.js` | `e811371e88d89a8d6a3659609bda3c96cb08c70c21390fdd462086081141ad87` |
| `assets/index-Ch-Z9Ez9.css` | `2fad6172d84da903b3d047966856541fec0f2c3fa6956389cf4f4548051655cb` |

## Upload and verification

1. Confirm the dedicated document root. Keep a backup outside the public root before replacing application files.
2. Upload and extract the archive in that document root, replacing its runtime files. Preserve `.htaccess`, Plesk directory protection and the previous fingerprinted assets. Remove the upload archive from the public root after extraction.
3. Verify normal TLS and the HTTP-to-HTTPS redirect. Unauthenticated HTML, JavaScript, CSS and audio must remain protected. Authenticated responses must load successfully.
4. Compare the hosted HTML and fingerprinted asset SHA256 values with the table above. Verify the existing security and cache headers are still applied.
5. Open the authenticated page and inspect the rendered quiet Zen interface. Native WebMCP discovery should expose 29 tools. Check scene inspection and a reversible mutation, then confirm the Demo browser and current-view orbit behavior.
6. Check that the uploaded ZIP is not publicly served. Record the deployment result below before calling the migration complete.

### Verified final deployment

- Plesk extraction replaced the runtime files while retaining the existing `.htaccess`: 795 bytes, with its existing September 3, 21:48 CEST modification time unchanged.
- All 12 hosted files matched the initial release manifest's SHA256, byte lengths and expected MIME types, including all three MP3 tracks and bundled fonts. After the metadata-only HTML replacement, the final `index.html` separately returned `200` and matched the current table byte for byte, with no Netlify references. The remaining 11 files are unchanged. `Origin-Agent-Cluster: ?1` and `X-Content-Type-Options: nosniff` remain applied.
- Screenshot inspection in the authenticated Codex in-app browser confirmed the quiet Zen interface.
- Native `describe_scene` reported 46 objects. Native `add_object` created cabin `obj47` and reported 47 objects. `set_camera_motion` with `from_current_view` started an endless orbit at radius `27.321054` around `[0, 0.3, 0]`. Stopping the orbit and deleting the test cabin restored the scene to 46 objects.
- The initial uploaded archive had SHA256 `7c2c9d74bee44019aca68e9c9a28bbc9c95d931f143ff4a837f72534d3122d8d` and was extracted before the metadata change. It was then moved outside the document root to `studio.wernerverse.de/studio-zen-final.zip`. That server-side archive remains the original version. Only the updated `index.html` was subsequently uploaded through Plesk; the current local full ZIP (`18732c15…364c`) includes both steps and differs from the retained server-side upload archive.
- Unauthenticated HTML, JavaScript, CSS and music return `401`; the authenticated `?demo=1` page returns `200`. HTTP redirects to HTTPS with `301`. Both archive paths return `404` under the public origin, and `.htaccess` returns `403`.

## Existing server configuration

The previous deployment established HTTP Basic protection, valid Let's Encrypt HTTPS and HTTP-to-HTTPS enforcement. Preserve those settings. The application archive intentionally contains no server configuration.

Plesk's domain-specific configuration has PHP and FastCGI disabled, nginx proxy mode enabled, and direct static serving, nginx caching and intelligent static-file processing disabled. Apache therefore receives the requests and applies `.htaccess` headers. The existing header configuration sets `Origin-Agent-Cluster: ?1`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, private HTML revalidation and private immutable caching for fingerprinted assets.

The application uses query parameters such as `?demo=1` and `?agent=1`, and scene URL fragments; no history-route rewrite is required. Share links use the current origin. This application replacement needs no DNS or mail changes.

## Previous version and rollback

The first Netcup test upload used application revision `cdbc5c5` and exposed 20 tools. Its package revision was `59ca7967f488bc352254f540926b1b472fddbd4e`.

The retained prior archive is `codex-netcup-test-bundle/releases/netcup/studio-netcup-test.zip` in the project worktrees directory, with SHA256 `5b5945983dbe4d0fa2aec78bbb5058185e334d35dbf43fb16864adfe8e35b935`. That archive includes the older header template: restore only its runtime files and preserve the live Plesk authentication configuration. Prefer the pre-update document-root backup for rollback, then verify authentication, headers and the restored asset hashes.

The actual pre-update server backup is `studio.wernerverse.de/studio-before-zen-20260903.zip`, outside `httpdocs`. It contains the full previous document root, including `.htaccess` and the favicon. Restore this backup only to the dedicated Studio document root, then recheck protection and the expected previous build.

## Netlify retirement

Both project-specific Netlify sites are disabled. Netlify `getSite` confirms `disabled: true` with the disablement reason persisted for the canonical site (`9ab50cde-a6d6-4bf5-a867-e6c45ca120db`, `agent-native-3d-studio`) and duplicate (`6839d8bf-2ad2-4582-af6f-7511da38c7d5`, `sweet-rolypoly-e93b34`).

Public requests return `404` for all seven checked endpoints: canonical production, `zen-review`, `final-review`, `collaborative-review`, the immutable production deployment `6a99b2c3a59b2a796bbe67c1`, duplicate production and duplicate `zen-review`. Historical film and QA links remain provenance, not current application entry points. The current application is hosted on Netcup.
