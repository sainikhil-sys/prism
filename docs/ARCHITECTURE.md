# Architecture

## Request flow and authorization

- `src/proxy.ts` redirects visitors without a session cookie away from `/app` and `/onboarding`. This is a convenience only.
- Every page under `/app` calls `requirePage(permission)`, and every server action and protected route handler calls `requireAction(permission)` (`src/server/context.ts`). Both validate the session with Better Auth, load the user's memberships from the database, pick the active organization (the `prism_org` cookie is honored only if the user is a member of that organization), and check the role permission from `src/lib/roles.ts`.
- Services in `src/server/services` receive that context and include `organizationId` in every query. Updates and deletes first look the record up by `id` and `organizationId`. `tests/integration/isolation.test.ts` and `authz.test.ts` verify this, including a forged organization cookie.
- Roles: Viewer (read), Analyst (import, edit products, forecast, generate recommendations), Admin (pricing policy, members, approve or reject), Owner (delete organization, grant ownership).

## Rendering

The project sets `cacheComponents: false`. Almost every application page renders per-tenant, request-time data, so the dynamic rendering model is simpler and safer than the static-shell model. Public pages read no request data and are prerendered as static HTML (see the build output). `/app` and the auth pages are marked `force-dynamic`.

## Data model

See `prisma/schema.prisma`. Key tables:

- `Organization`, `Membership`, `Invitation` (token stored as SHA-256 only), `PricingPolicy`
- `Product`, `SalesRecord` (unique `dedupeKey` per organization), `CompetitorPrice` (unique per product, competitor and time), `ImportJob` (row errors, undo)
- `ModelVersion` (serialized model, backtest metrics, data quality), `Forecast` with `ForecastPoint` (backtest and future)
- `PriceRecommendation` (candidates, bounds, binding constraints, SHAP explanation, assumptions, input snapshot, decision), `PriceChange`
- `AuditLog`, `ContactSubmission` (hashed IP only), `RateLimit` (shared with Better Auth)

## Demand model

`src/lib/ml`:

1. `features.ts` aggregates sales into daily or weekly periods. Periods without sales are zero demand. Price is carried forward when nothing sold, and competitor prices are carried forward from the latest observation. Features: price relative to the median observed price, promotion share, price relative to competitors, day of week, month, annual seasonality (sin/cos), and short and long rolling means of past demand. Rolling features use only earlier periods; a unit test checks for leakage.
2. `gbdt.ts` trains gradient-boosted regression trees with a Poisson objective (log link), histogram splits, missing-value directions and monotone constraints. Price and competitor-relative price are constrained so estimated demand never rises with price.
3. `forecast.ts` runs a chronological backtest: it trains on all but the last 7 to 28 days (or 4 to 12 weeks), forecasts that holdout recursively with the actual prices, and scores MAE, RMSE, WAPE, bias and MASE against a seasonal naive baseline. It then refits on all data and forecasts ahead at the current price. Approximate 80% intervals come from backtest residual quantiles. Minimum history is 70 days or 36 weeks.
4. `pricing.ts` computes bounds from the maximum change, minimum margin, product limits and the observed price range (plus a configurable expansion). It evaluates 25 candidates by forecasting the decision horizon at each, caps units at stock when enabled, and maximizes margin or revenue. It holds the current price when the gain is below a threshold, reports infeasible rules, and refuses when history has fewer than 3 distinct prices or under 2% price variation.
5. `treeshap.ts` implements exact TreeSHAP (Lundberg et al., Algorithm 2) with path-dependent cover weighting. Unit tests compare it to brute-force Shapley values. Every recommendation stores its additivity error, and the UI hides explanations that fail the check.

Training a model takes well under a second per product, so it runs inside the server action.

## Imports

`src/lib/imports/csv.ts` parses with Papa Parse and validates each row with Zod. Files are limited to 4 MB (below Vercel's 4.5 MB request limit) and 50,000 rows. By default any invalid row rejects the whole file. Duplicates are detected within the file and against the database (`skipDuplicates` on unique keys). Each import is a transaction and is recorded as an `ImportJob`, with a downloadable error report. Sales and competitor imports can be undone.

## Security measures

- Passwords hashed with scrypt (Better Auth). Sessions last 7 days and are revoked on password reset. Cookies are Secure on HTTPS.
- Rate limits stored in Postgres: sign-in 10 per minute, sign-up 5 per minute, password reset 3 per 5 minutes, contact form 5 per hour per IP hash, imports, forecasts and recommendations per organization.
- Security headers in `next.config.ts` (HSTS, nosniff, frame denial, referrer and permissions policies).
- Server actions are protected against cross-site requests by Next.js origin checks. Redirect targets are restricted to same-site paths (`src/lib/safe-redirect.ts`).
- Errors returned to the browser are generic; details are logged on the server.
