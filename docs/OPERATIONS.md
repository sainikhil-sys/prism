# Operations guide

Steps that need the owner's accounts. None of these have been done yet; see the launch checklist for status.

## 1. Database (Neon recommended)

1. Create a Neon project in a region close to your users and your Vercel region.
2. Copy the pooled connection string (host contains `-pooler`) into `DATABASE_URL`, and the direct one into `DIRECT_DATABASE_URL`.
3. Apply migrations: `npx prisma migrate deploy` (the Vercel build also runs this).
4. Record the provider and region in `src/config/site.ts` (`databaseProvider`, `dataRegions`).

Supabase also works: use the transaction pooler URL (port 6543, `?pgbouncer=true`) for `DATABASE_URL` and the session or direct URL for `DIRECT_DATABASE_URL`.

## 2. Vercel deployment

1. Push this repository to GitHub and import it in Vercel (framework: Next.js). The `vercel-build` script runs `prisma generate`, `prisma migrate deploy` and `next build`.
2. Set the environment variables from `.env.example` for Production and Preview. Use a separate database for Preview.
3. Set `APP_URL` and `NEXT_PUBLIC_SITE_URL` to the production origin (for example `https://prism.example.com`).
4. Deploy, then check `https://<domain>/api/health` returns `{"status":"ok"}`.

## 3. Custom domain and HTTPS

1. In Vercel, open Project > Settings > Domains and add the domain and `www` variant. Set one as primary so the other redirects.
2. Add the DNS records Vercel shows (A or CNAME) at your registrar. Vercel issues the TLS certificate automatically and redirects HTTP to HTTPS.
3. Verify: `curl -I http://<domain>` returns a 308 to `https://`, the certificate is valid in the browser, and there are no mixed-content warnings in DevTools.
4. Update `APP_URL` and `NEXT_PUBLIC_SITE_URL` to the final domain and redeploy (the site URL is baked into static pages at build time).
5. Turn on Vercel Deployment Protection for Preview deployments so preview URLs are not public. `robots.txt` already blocks indexing outside production.

## 4. Email (Resend) with SPF, DKIM and DMARC

1. Create a Resend account and add a sending domain (a subdomain such as `mail.example.com` is recommended).
2. Add the SPF (TXT) and DKIM (CNAME or TXT) records Resend shows, and wait for Resend to mark the domain verified.
3. Add a DMARC record, starting with monitoring: `_dmarc.example.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"`. Move to `p=quarantine` once reports look clean.
4. Set `RESEND_API_KEY`, `EMAIL_FROM` (for example `Prism <no-reply@mail.example.com>`) and `CONTACT_TO_EMAIL`, then redeploy.
5. Test: request a password reset and submit the contact form, then confirm both emails arrive and check the spam folder. Use mail-tester.com or Gmail's "Show original" to confirm SPF, DKIM and DMARC pass.
6. A domain mailbox for receiving mail (for example Google Workspace or Fastmail) is separate from Resend, which only sends.

Contact submissions are always stored in the `ContactSubmission` table, whether or not email works. View them with `npx prisma studio`.

## 5. WhatsApp

Set `NEXT_PUBLIC_WHATSAPP_NUMBER` to the business number in international format, digits only (for example `447700900123`). Test on a phone that the floating button opens WhatsApp with the prefilled message, and on desktop that it opens WhatsApp Web.

## 6. Google Analytics 4

1. Create a GA4 property and web data stream for the domain, and copy the measurement ID (`G-...`) into `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
2. Analytics loads only after a visitor clicks "Accept analytics". Events sent: page views, `sign_up`, `import_csv` (type, status), `generate_forecast` (granularity, horizon), `generate_recommendation` (status), `decide_recommendation` (decision), `contact_submit` (topic). No names, emails, prices or uploaded data are sent.
3. Verify with GA4 DebugView: accept analytics in a browser, browse, and confirm events appear.
4. Set data retention in GA4 (Admin > Data retention) and record it in the Privacy Policy if it differs from what is stated.

## 7. Google Search Console

1. Add a Domain property and verify it with the DNS TXT record Google provides.
2. Submit `https://<domain>/sitemap.xml`.
3. Use URL Inspection on `/` and request indexing. Check that `/app` URLs are not indexed (they are disallowed in `robots.txt` and marked `noindex`).
4. Indexing can take days; a submitted sitemap is not proof of indexing.

## 8. Social previews

Validate the deployed URL with the Facebook Sharing Debugger (WhatsApp uses Open Graph tags) and LinkedIn Post Inspector. WhatsApp caches previews; after changing the image, append a query string such as `?v=2` when testing.

## 9. Backups and recovery

- Neon keeps a history window for point-in-time restore (length depends on your plan; check Project > Settings > Storage). Supabase offers daily backups on paid plans and point-in-time recovery as an add-on.
- Suggested targets: recovery point objective of 24 hours or better, recovery time objective of 4 hours.
- Restore drill (do this before launch and record the result in the checklist):
  1. In Neon, create a branch from a point in time (for example one hour ago).
  2. Run `DATABASE_URL=<branch url> npx prisma migrate status` and spot-check counts: `SELECT COUNT(*) FROM "Product"; SELECT COUNT(*) FROM "SalesRecord";`.
  3. Point a Preview deployment at the branch and sign in to confirm data and logins work.
  4. Delete the branch afterwards.
- For an extra independent copy, schedule `pg_dump --format=custom "$DIRECT_DATABASE_URL" > prism-$(date +%F).dump` to storage you control.

## 10. Legal details

Fill in `operator.legalName`, `operator.address`, `operator.jurisdiction`, `databaseProvider` and `dataRegions` in `src/config/site.ts`, and set `NEXT_PUBLIC_CONTACT_EMAIL` and `NEXT_PUBLIC_PRIVACY_EMAIL`. Have a lawyer review `/privacy` and `/terms`, then set `legalReviewed: true` to remove the draft notice.
