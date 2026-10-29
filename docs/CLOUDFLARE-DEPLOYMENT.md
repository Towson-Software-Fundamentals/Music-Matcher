# Cloudflare deployment

Status: GitHub integration selected. The reported deployment log uses **Workers Static Assets**, not Pages. Configuration now supports that route; successful deployment is still pending. No Cloudflare resources have been created by the assistant.

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
