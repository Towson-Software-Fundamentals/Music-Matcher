# Cloudflare deployment

## Custom domain update — November 2, 2026

The existing Worker was deployed through Wrangler with `matchmymusic.app` as a managed custom domain, while retaining the original `workers.dev` address. Version: `27545e2d-80dd-4449-a0e1-ed44fa3fa480`. The route is declared in `wrangler.jsonc`; keep this configuration in future GitHub builds so they do not remove the custom-domain attachment.

Cloudflare accepted the attachment and manages DNS/certificate issuance. The first HTTPS probe encountered a TLS handshake failure during provisioning. Subsequent checks passed certificate verification and loaded the real homepage, login, and recovery screens with HTTP 200 in a clean Chromium browser.

Supabase settings were applied through the authenticated CLI and verified:

- Auth Site URL: `https://matchmymusic.app`
- Auth redirect allowlist: `https://matchmymusic.app/login` and `https://matchmymusic.app/reset-password`
- Edge Function secret `APP_ORIGIN`: `https://matchmymusic.app` (no trailing slash)

The single-origin catalog policy will then serve the custom-domain frontend instead of the old Worker frontend. Existing Auth redirects can remain for previously issued links. Users need to sign in again on the new hostname because browser session storage is origin-specific.

The production CORS preflight now returns `Access-Control-Allow-Origin: https://matchmymusic.app`. A post-update configuration diff reports zero pending updates to declared Auth properties; other hosted settings, including confirmations and MFA, were preserved.

Reproducible CLI commands (requires Supabase login):

```sh
npx supabase config diff --remote=cilswqtuswmuktzhifsn --workdir supabase/production
npx supabase config push --remote=cilswqtuswmuktzhifsn --workdir supabase/production --yes
npx supabase secrets set APP_ORIGIN=https://matchmymusic.app --remote=cilswqtuswmuktzhifsn --workdir supabase/production --yes
```

The separate minimal production config deliberately declares only Auth URL settings; do not push the local-development config as a substitute. End-to-end email delivery and signed-in searches on the new hostname still require real-user verification.

Test on university Wi-Fi independently: a valid public custom-domain certificate does not guarantee acceptance by university filtering.

Status: deployed to **Workers Static Assets** at https://music-matcher.nerva-corporation.workers.dev. On October 28, 2026, an approved Wrangler deployment of the locally configured production build replaced the missing-configuration screen with the actual welcome page, verified in a browser. Version: `c16707c9-f443-4bed-a99d-851be49ba632`. The existing Worker was updated, not a new project created.

The CLI deployment used `npm run build` followed by `wrangler deploy --keep-vars`, with the ignored local `.env` supplying the public Supabase build variables. **Future GitHub builds still require those variables in Cloudflare's build settings**, or they will overwrite this working deployment with an unconfigured build. Supabase production Auth URLs, SMTP, and catalog `APP_ORIGIN` remain separate setup steps and have not been verified by this deployment.

## Current Workers build settings

The `/workers/scripts/music-matcher/versions` log identifies a Workers deployment. Keep the existing GitHub-connected Worker and use:

| Setting | Value |
| --- | --- |
| Worker name | `music-matcher` |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | Repository root |

Use the production build variables below for either Workers or Pages. The committed `wrangler.jsonc` points at `dist` and enables native `single-page-application` asset handling. Do not recreate `public/_redirects` with `/* /index.html 200`: Workers rejects that rule as an infinite loop due to HTML URL canonicalization.

After the fix reaches GitHub, retry the build against the new commit. Record the actual `workers.dev` production URL, not a guessed `pages.dev` address. Static-asset hosting does not require adding a Worker script or enabling a paid subscription.

The following Pages instructions remain an alternative if you deliberately create a Pages project rather than using the existing Worker.

## 1. Connect the repository

Open [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages), then choose **Create application -> Pages -> Connect to Git**.

Authorize the Cloudflare GitHub application for **Towson-Software-Fundamentals/Music-Matcher**. An organization administrator may need to approve access. Limit authorization to this repository where possible.

Choose the free Pages option, not a paid Workers subscription. No custom domain is required.

## 2. Build settings

| Setting | Value |
| --- | --- |
| Project name | `party-music-matcher` if available |
| Production branch | `main` |
| Framework preset | React (Vite), or None with the settings below |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Repository root (leave blank) |

Add these production build environment variables before deploying:

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `24.18.0` |
| `VITE_SUPABASE_URL` | `https://cilswqtuswmuktzhifsn.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Copy the active publishable key from Supabase Project Settings -> API Keys |

The Supabase publishable key is intentionally browser-visible and protected by database grants/RLS. **Never add a service-role key, secret key, database password, or SMTP credential to Cloudflare's frontend build variables.**

Use the committed lockfile. Cloudflare installs dependencies before running the build. The current bundle-size warning is non-fatal.

Select **Save and Deploy**, then record the actual production `https://<project>.pages.dev` URL. The requested project name may be unavailable, so do not configure Supabase against a guessed URL.

Git integration automatically rebuilds after future pushes to `main`. For the reported Workers failure, deploy the commit containing the native SPA fix, not the original failing commit.

## 3. Connect the production origin

After Cloudflare reports the actual URL:

1. In [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/cilswqtuswmuktzhifsn/auth/url-configuration), set Site URL to that HTTPS origin.
2. Add exact redirect URLs `<origin>/login` and `<origin>/reset-password`.
3. Keep the local development redirect URLs if local development is still needed.
4. In Supabase Edge Function secrets, set `APP_ORIGIN` to the same origin, without a trailing slash. This switches catalog browser access from local development to production.
5. Configure custom SMTP for general-user email confirmation and password recovery. Default Supabase mail delivery is restricted; do not promise public signup until tested.

Changing `APP_ORIGIN` affects CORS, not user authorization. Catalog requests still require a valid authenticated user. The current single-origin policy does not enable catalog access from arbitrary Cloudflare preview subdomains; use production for release acceptance.

## 4. Verify before calling the release complete

- Load the production homepage in a real browser at desktop and mobile widths.
- Open `/login`, `/settings`, and a saved `/comparisons/<id>` URL directly; native SPA fallback should serve the app, and protected routes should enforce sign-in.
- Confirm production assets use the configured Supabase project rather than showing the missing-configuration screen.
- Sign up, follow the actual confirmation email, log in, and create a profile.
- Save custom and catalog preferences and verify persistence after reload.
- Create a second consenting profile and compare; check shared and unique preferences.
- Verify catalog OPTIONS requests permit the exact production origin, and authenticated search works.
- Complete password recovery through a real email and reject expired/reused links.
- Check browser console/network errors and make sure no privileged credentials are exposed.

Do not treat a successful Cloudflare build or a visible homepage as proof that authentication, email, and catalog access work.

## References

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Workers Static Assets SPA configuration](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Application setup and current verification limits](../README.md)
