# Prism

Demand forecasting and dynamic pricing with explanations. Prism imports a business's products and sales history, trains a demand model per product, recommends prices inside the business's margin, price-change and stock rules, explains every recommendation with SHAP values, and records approvals in an audit trail.

- Launch status and evidence: [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md)
- How it is built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Deployment, domain, email, analytics, backups: [docs/OPERATIONS.md](docs/OPERATIONS.md)

## Stack

Next.js 16 (App Router) with React 19 and strict TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Phosphor icons, Motion and GSAP, Recharts, React Hook Form with Zod 4, Prisma 7 on PostgreSQL, Better Auth, Resend, Vitest and Playwright. Deployed as one Vercel project.

The demand model (gradient-boosted trees with Poisson loss) and exact TreeSHAP are implemented in TypeScript in `src/lib/ml`, so the whole product runs as one deployment. XGBoost plus the Python `shap` package exceed Vercel's function size limits. The model interface is self-contained if a Python worker is ever wanted.

## Project structure

```
prisma/
  schema.prisma          Database schema (all business tables carry organizationId)
  migrations/            SQL migrations (apply with `npm run db:deploy`)
  seed.ts                Local sample data (refuses to run in production)
  sample-data.ts         Synthetic data generator shared by the seed and tests
src/
  app/
    (site)/              Public pages: landing, security, contact, privacy, terms
    (auth)/              Sign in/up, password reset, onboarding, invitations
    app/                 Authenticated application (products, sales, imports, competitors,
                         forecasts, pricing, analytics, settings)
    api/                 Auth handler, CSV templates, import error reports, health check
    sitemap.ts robots.ts opengraph-image.tsx icon.svg apple-icon.tsx manifest.ts
  components/            ui/ (shadcn), app/, site/, auth/, charts/, brand/
  config/site.ts         Public site settings and OWNER INPUT fields for legal identity
  lib/
    ml/                  gbdt.ts, treeshap.ts, features.ts, forecast.ts, pricing.ts, inventory.ts
    imports/csv.ts       CSV parsing, row validation, duplicate keys
    validation.ts        Zod schemas shared by forms and server actions
    roles.ts             Roles and permissions
  server/
    context.ts           Session and organization resolution, requireAction / requirePage
    actions.ts           Server actions (every one checks session, membership and role)
    services/            Organization-scoped data access and business logic
    auth.ts db.ts env.ts email.ts rate-limit.ts audit.ts
  proxy.ts               Optimistic redirect for signed-out visitors
tests/
  unit/                  ML, CSV, validation, roles (no database)
  integration/           Services against a real Postgres: isolation, imports, pricing flow,
                         authorization, rate limiting, contact form
  e2e/                   Playwright: full journey, public pages, links, responsive checks
docs/                    Architecture, operations, launch checklist, evidence/
```

## Local development

Requirements: Node.js 22 or newer.

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the required values (see the comments in the file). For a database you can use your managed Postgres, or Prisma's local server:

```bash
npx prisma dev -d -n prism-local
```

Use the `postgres://` TCP URL it prints as `DATABASE_URL`, and set `DATABASE_POOL_MAX=1` (the local server cannot serve parallel connections). Run a second one (`-n prism-test`) for `TEST_DATABASE_URL`.

```bash
npm run db:migrate      # create/apply migrations in development
npm run db:seed         # optional: sample organization with synthetic data
npm run dev             # http://localhost:3000
```

## Checks

```bash
npm run typecheck
npm run lint
npm test                    # unit tests
npm run test:integration    # needs TEST_DATABASE_URL; deletes all data in that database
npm run build
npm run test:e2e            # needs a build with NEXT_PUBLIC_SITE_URL=http://localhost:3100
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Postgres URL used by the app |
| `DIRECT_DATABASE_URL` | Recommended | Direct URL for migrations |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret, 32+ characters |
| `APP_URL` | Yes | Public origin, used for auth and links |
| `NEXT_PUBLIC_SITE_URL` | Yes | Same origin; set at build time for canonical URLs and the sitemap |
| `IP_HASH_SALT` | Yes | Salt for hashing IP addresses |
| `RESEND_API_KEY`, `EMAIL_FROM` | For email | Password reset and contact notifications |
| `CONTACT_TO_EMAIL` | For email | Inbox for contact form submissions |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_PRIVACY_EMAIL` | Optional | Shown on contact and legal pages |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Optional | Digits only; WhatsApp button hidden when empty |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional | GA4; loads only after consent |
| `DATABASE_POOL_MAX` | Optional | Connections per instance (default 5) |
| `TEST_DATABASE_URL` | Tests | Disposable database for integration and e2e tests |

Business identity for the legal pages (legal name, address, governing law, database provider, data regions) is set in `src/config/site.ts`, not in environment variables.
