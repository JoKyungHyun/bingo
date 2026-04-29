# Photo Bingo

One-time recreation/event photo bingo app for Cloudflare Workers, D1, and R2.

## Cloudflare setup

```bash
npm install
npx wrangler d1 create bingo-db
npx wrangler r2 bucket create bingo-photos
```

Copy the generated D1 database ID into `wrangler.jsonc`:

```jsonc
"database_id": "..."
```

Apply the database schema:

```bash
npx wrangler d1 migrations apply bingo-db --remote
```

Deploy:

```bash
npm run deploy
```

The app will be available at a stable Workers URL such as:

```text
https://bingo.<your-subdomain>.workers.dev
```

## Local development

```bash
npm install
npx wrangler d1 migrations apply bingo-db --local
npm run dev
```

## Data

- D1 stores bingo square text and participant submissions.
- R2 stores uploaded photos.

## Notes

- The participant page does not expose an admin link.
- The admin page is still URL-accessible at `/admin.html`; add authentication before public production use.
- Cloudflare Workers Free, D1 Free, and R2 Free tiers should be enough for a small one-time event.
