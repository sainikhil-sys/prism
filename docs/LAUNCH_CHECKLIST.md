# Launch checklist

Last updated 2026-10-28. Status values: **PASS** (verified by a test or measurement, evidence given), **FAIL** (defect exists), **BLOCKED** (needs credentials, infrastructure or access that is not available), **N/A** (outside this release).

**Launch decision: NOT READY.** The application builds and its critical journey passes end to end, but the site has not been deployed. Domain, HTTPS, production database, email delivery, analytics and Search Console are all BLOCKED on owner accounts, and the legal pages are drafts pending owner details and legal review.

## Deployment status (2026-10-28)

- Code is in the private GitHub repository `sainikhil-sys/prism` (`main` at `232b25a`, matching the local repository). `.env` is not in the repository.
- Vercel project `prism` exists under `sainikhil-sys' projects` and is connected to that repository.
- Production variables set: `APP_URL` and `NEXT_PUBLIC_SITE_URL` (both `https://prism-sainikhil-sys-projects.vercel.app`). That address is the expected default and must be confirmed after the first deploy.
- **Not set:** `DATABASE_URL`, `DIRECT_DATABASE_URL`, `BETTER_AUTH_SECRET`, `IP_HASH_SALT`. Verified with `vercel env ls` on 2026-10-28. No deployment has been made, because the build runs `prisma migrate deploy` and would fail without a database URL.
- Next step: add those four values (for example `vercel env add DATABASE_URL production` from the linked project folder), then run `vercel deploy --prod` or push to `main`.

All verification below was run on Windows 11 against a local production build (`next build` and `next start`) with a local Prisma Postgres (PGlite) database. Nothing has been verified on Vercel or a managed database yet.

## Automated test results (2026-10-27)

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | PASS, no errors |
| ESLint | `npm run lint` | PASS, no problems |
| Unit tests | `npm test` | PASS: ML (TreeSHAP vs brute-force Shapley, monotonicity, leakage, backtest split, minimum history, pricing constraints, infeasible and no-variation refusals, inventory), CSV validation, schema round-trips, roles, safe redirects |
| Integration tests | `npm run test:integration` | PASS: 6 files. Organization isolation (read and write), forged org cookie, role enforcement, owner protection, invitations, CSV imports (strict/partial/duplicates/undo/size), forecast versioning, recommendation, approval, supersede, stale-price block, rate limiting, contact form |
| Combined | `vitest run` | 76 passed, 1 skipped |
| Production build | `npm run build` | PASS. Public pages prerendered static; app routes dynamic |
| Migrations | `prisma migrate status` | PASS, schema up to date (1 migration) |
| End-to-end | `npm run test:e2e` | 33 passed, 3 skipped (device-specific tests skipped on the other device profile) |

Skipped test: the concurrent rate-limit test does not run on PGlite, which cannot serve parallel connections. **It has not been verified against real PostgreSQL** and should be run once `TEST_DATABASE_URL` points at a managed database.

Raw output: `docs/evidence/checks.txt`.

Defects found by these tests and fixed: forms sent `null` for empty optional fields, which server re-validation rejected (broke organization creation and the contact form); weekly forecasts allowed 30 weeks but needed 36; product sorting failed by name; tab buttons were under 36px tall on mobile.

## A. Domain, deployment and security

| Check | Status | Evidence or blocker |
| --- | --- | --- |
| Custom domain connected | BLOCKED | Vercel project exists but is not deployed, and no domain was provided. Steps: OPERATIONS.md section 3 |
| DNS and ownership verification | BLOCKED | Same |
| HTTPS certificate valid, HTTP redirects to HTTPS | BLOCKED | Vercel provides both once the domain is attached; must be checked with `curl -I` |
| Mixed content | PASS (local) | Pages load no third-party assets; fonts self-hosted; e2e checks zero console errors on public pages. Re-check on the domain |
| Canonical URLs and redirects | PASS (local) | e2e asserts canonical link; set `NEXT_PUBLIC_SITE_URL` to the domain at build |
| Production environment variables | BLOCKED | `APP_URL` and `NEXT_PUBLIC_SITE_URL` set on Vercel; the database URLs, `BETTER_AUTH_SECRET` and `IP_HASH_SALT` are still missing (checked 2026-10-28) |
| Auth callbacks use production domain | BLOCKED | `APP_URL` drives Better Auth `baseURL` and trusted origins; set once the domain exists |
| Favicon and browser metadata | PASS (local) | `icon.svg`, `apple-icon`, manifest, theme color; e2e checks icon link and title |
| Unwanted platform branding removed | PASS | No "Made with" tags; Next.js scaffold assets deleted; `poweredByHeader: false` |
| No dev banners, placeholder routes or temporary URLs in navigation | PASS | Link crawl in e2e; no `#` links (audit) |
| Security headers | PASS | HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy in `next.config.ts` |
| Secrets not exposed | PASS | `.env` gitignored; server secrets read only in `src/server/env.ts`; only `NEXT_PUBLIC_` values reach the browser |

## B. Mobile and responsive

| Check | Status | Evidence or blocker |
| --- | --- | --- |
| No horizontal overflow | PASS (local) | e2e: 8 public pages at Pixel 7 (412px) and desktop; 4 pages at 768, 1024 and 1440px |
| Mobile navigation | PASS (local) | e2e opens menu, follows link, menu closes |
| Touch targets | PASS (local) | e2e: every visible landing-page button or button link at least 36px; primary buttons are 44px |
| Forms and validation messages | PASS (local) | e2e sign-up and contact validation; labels and `aria-describedby` wired |
| App pages (tables, charts, dialogs) on mobile | Partial | Tables scroll horizontally inside their card; not covered by an automated mobile test. Manually check on a phone after deployment |
| Real devices | BLOCKED | Only Chromium device emulation used |

## C. Links and navigation

| Check | Status | Evidence |
| --- | --- | --- |
| Internal links on public pages | PASS (local) | e2e crawls all links on 8 public pages; all respond below 400 |
| Header, footer, CTAs | PASS (local) | Included in crawl; journey test follows the hero CTA |
| Protected routes and auth redirects | PASS (local) | e2e: signed-out `/app/products` redirects to sign-in and returns after login; cleared cookies redirect; API returns 401 |
| Open redirect | PASS | `//evil.example` ignored (e2e and unit) |
| 404, error and unauthorized pages | PASS (local) | e2e asserts 404 status and page; `/app/unauthorized` exists for role failures |
| External links | N/A | Only WhatsApp (when configured) and user-entered competitor source URLs |

## D. Contact form and WhatsApp

| Check | Status | Evidence or blocker |
| --- | --- | --- |
| Valid and invalid submissions, server validation | PASS | Integration and e2e tests |
| Persisted | PASS | Integration test reads the stored row; IP stored only as a salted hash |
| Email notification delivered | BLOCKED | Needs Resend key and verified domain. The UI says "saved" (not "sent") when email is not configured, verified in e2e |
| Delivery failure handling | PASS (code), not exercised live | Failures are recorded as `EMAIL_FAILED` and the user is told a reply may be delayed |
| Spam protection and rate limiting | PASS | Honeypot and minimum fill time (integration); 5 per hour per IP hash |
| WhatsApp button | BLOCKED | No verified number provided; the button is hidden until `NEXT_PUBLIC_WHATSAPP_NUMBER` is set |

## E. Performance

Measured with Lighthouse 12 against `next start` on this machine (not the deployed site). Mobile uses Lighthouse's default simulated slow 4G and 4x CPU throttling.

| Page | Perf / A11y / Best practices / SEO | LCP | TBT | CLS |
| --- | --- | --- | --- | --- |
| `/` mobile, before optimization | 80 / 100 / 100 / 100 | 4.5 s | 230 ms | 0 |
| `/` mobile, 3 runs after | 91, 85, 86 / 100 / 100 / 100 | 3.4 s, 4.1 s, 4.1 s | 40 to 120 ms | 0 |
| `/` desktop | 100 / 100 / 100 / 100 | 0.7 s | 0 ms | 0 |
| `/security` mobile | 92 / 100 / 100 / 100 | 3.2 s | 70 ms | 0 |
| `/sign-up` mobile | 98 / 100 / 100 / 100 | 2.1 s | 150 ms | 0 |

Reports: `docs/evidence/*.json`. Status: **CLS and TBT meet targets; mobile LCP on the home page does not meet 2.5 s under simulated throttling (FAIL, non-blocking).** LCP is the hero paragraph and is dominated by render delay. Re-measure on the deployed URL (with Vercel's CDN and compression) before deciding on further work such as `font-display: optional`. INP was not measured (needs field data).

Done: static prerendering of public pages, self-hosted fonts with fewer files, GSAP loaded after hydration, Motion features lazy-loaded, charts only in the authenticated app, SVG graphics with fixed dimensions (no images to compress).

## F. Browsers

| Browser | Status |
| --- | --- |
| Chromium (desktop) | PASS: full e2e suite |
| Chromium with Android device emulation (Pixel 7) | PASS: public, responsive tests |
| Google Chrome (branded) | Not run separately; same engine as above |
| Safari, Mobile Safari (iOS) | BLOCKED: no macOS or iOS device. Playwright WebKit is not installed and on Windows is not equivalent to Safari |
| Mobile Chrome on a real Android device | BLOCKED: no device |
| Firefox | Not tested (not in scope) |

## G. Copy and content

| Check | Status | Evidence |
| --- | --- | --- |
| Spelling | PASS | cspell over public and auth pages: only intended terms flagged (backtest, WAPE, Explainability) |
| No em dashes, emoji icons, purple gradients, pill buttons, placeholder text | PASS | Repository audit (2026-10-27) |
| Claims match implemented features | PASS (review) | No metrics, testimonials, logos or customer claims. The walkthrough is labeled "Illustrative data" and its numbers are internally consistent. The FAQ says pricing is unpublished |
| Titles and meta descriptions | PASS | Every public page sets title and description; e2e checks home |

## H. Social metadata

| Check | Status |
| --- | --- |
| Open Graph and Twitter tags, OG image | PASS (local): e2e checks `og:image` and PNG content type |
| Validated with Facebook debugger and a real WhatsApp share | BLOCKED: requires a public URL |

## I. Domain email

BLOCKED: no domain or email provider. SPF, DKIM and DMARC steps are in OPERATIONS.md section 4.

## J. Analytics and search

| Check | Status |
| --- | --- |
| GA4 with consent | PASS (code): loads only when an ID is set and the visitor accepts; no personal data in events. Live events BLOCKED (no measurement ID) |
| Sitemap and robots | PASS (local): sitemap lists public pages only; robots disallows `/app`, `/api` and auth pages and blocks everything outside production |
| Private pages not indexable | PASS: `/app` layout sets `noindex` and is disallowed |
| Search Console verification, sitemap submission, indexing | BLOCKED: requires the domain |

## K. Favicon and metadata

PASS (local); confirm on the deployed domain.

## L. Privacy Policy and Terms

| Check | Status |
| --- | --- |
| `/privacy` and `/terms` exist, are linked and accessible | PASS |
| Content matches actual data practices (cookies, Better Auth session IP and user agent, providers, retention, rights, account deletion) | PASS (review); account deletion and password change are implemented in Settings, Your account |
| Business identity, address, jurisdiction, provider regions | BLOCKED: owner input in `src/config/site.ts`; pages show a visible draft notice until set |
| Legal review | BLOCKED: not reviewed by a lawyer; draft notice shown until `legalReviewed` is set |

## M. Backups and recovery

BLOCKED: no managed database exists yet. The recovery process and restore drill are documented in OPERATIONS.md section 9. Backups must not be marked PASS until a restore has been performed and checked.

## N. Payments

N/A. No paid plans exist, and no payment page or provider is included. The Terms say no fees are charged.

## O. Application and database tests

PASS as listed in the test results table. Realistic failures covered: invalid input, failed and partial imports with rollback, unauthorized requests and cross-tenant access, expired session (cleared cookies), unknown routes, email not configured. A database outage (`/api/health` returns 503 and pages show the error page) is handled in code but was not tested by stopping the database.

## Unresolved items

1. Mobile LCP 3.4 to 4.1 s locally (target 2.5 s). Re-measure after deployment.
2. Concurrent rate-limit test unverified on real PostgreSQL.
3. App pages not covered by automated mobile tests.
4. Safari and iOS untested.
5. Invitations are shared as copyable links; email delivery of invitations is not implemented.
6. Historical unit costs are not stored, so analytics margins use current cost (labeled in the UI).

## Owner actions required

1. Add `DATABASE_URL`, `DIRECT_DATABASE_URL`, `BETTER_AUTH_SECRET` and `IP_HASH_SALT` to the Vercel project `prism` (Production), then deploy. The GitHub repository and Vercel project are already set up.
2. Put a managed `TEST_DATABASE_URL` in the local `.env` and run `npm run test:integration` so the concurrency test runs on real PostgreSQL.
3. Attach the custom domain and verify HTTPS.
4. Set up Resend with SPF, DKIM and DMARC and a receiving mailbox; test delivery.
5. Provide the WhatsApp number.
6. Create the GA4 property and Search Console property; submit the sitemap.
7. Fill in business identity in `src/config/site.ts` and obtain legal review.
8. Run a backup restore drill.
9. Test on Safari (macOS and iOS) and a real Android phone.
