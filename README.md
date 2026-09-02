# Member Register — Pick a Book Member Portal

Member portal for the Pick a Book reading club: profiles, reading history,
session attendance and points, membership renewal, and a book catalogue with a
member discount.

Standalone Next.js 16 + Supabase app. Deployed alongside the quiz app
(`e:\game`) on one VPS, as a separate service on port **3001**.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3001
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :3001 |
| `npm run build` / `start` | Production build / serve on :3001 |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:push` | Apply `supabase/migrations/*` to the linked project |
| `npm run db:types` | Regenerate `src/lib/supabase/types.ts` from the live schema |
| `npm run test:rls` | **Security gate.** Verifies RLS against raw PostgREST |
| `npm run test:e2e` | Auth routing. Needs a dev server and `KEEP=1 npm run test:rls` fixtures first |

Both test scripts create and delete users under `@rlstest.local` and are safe to
re-run. `KEEP=1 npm run test:rls` leaves the fixtures in place for manual poking
(and is a prerequisite for `test:e2e`).

## Architecture

```
Browser ──► Next.js 16 App Router (:3001)
              ├── Supabase Cloud (Postgres + Auth + Storage)   ← system of record
              ├── HostGator MySQL (books, categories)          ← READ ONLY
              └── PayHere hosted checkout + notify webhook
```

Supabase owns everything club-related. The legacy MySQL database behind
pickabook.lk is a read-only catalogue feed — the portal never writes to it, and
the two never join in SQL. Portal rows reference `legacy_book_id` as a plain
integer with no foreign key, and snapshot title/author/price so orders survive
legacy edits and outages.

### Where the security actually lives

- **`src/lib/auth/session.ts`** is the security boundary. Every Server Action
  and every protected page opens with a `require*()` call from it. Next's docs
  are explicit that Server Actions are POSTs to the route they live on, so a
  proxy matcher change can silently remove proxy coverage — the proxy is a
  convenience, not a guard.
- **`src/proxy.ts`** (Next 16's renamed middleware) refreshes the auth token and
  does optimistic redirects only. No role lookups — it runs on every request
  including prefetches.
- **`supabase/migrations/0003_core_rls.sql`** + `0005_fix_directory_visibility.sql`
  hold the privilege model. Read the comments before changing a policy.

Use `getUser()`, never `getSession()`, for anything authorization-shaped —
`getSession()` decodes the cookie without validating it.

## Supabase setup

Linked project: **Member-Register** (`prkpzbsslfwtouwchlhj`).

```bash
SUPABASE_ACCESS_TOKEN=<personal access token> npx supabase link --project-ref prkpzbsslfwtouwchlhj
```

Things that must be configured in the dashboard, not in code:

- **Auth → URL Configuration → Redirect URLs** must include every origin you use
  (`http://localhost:3001/**` and the production origin). Miss this and every
  invite link 400s. Password reset no longer uses a link, so it is unaffected.
- **Confirm email must be ON.** Signup creates the account before the emailed
  code is checked, so with it off an unverified account could simply log in.
- **SMTP is not a dashboard setting any more.** Signup codes, reset codes and
  invites are all sent by the app itself — see the `SMTP_*` vars in
  `.env.example`, and `npm run test:mail` to check them.
- **Minimum password length** — raise it above the default 6. The UI enforces 10.

## Legacy MySQL (not wired up yet — Phase 6)

Read-only access to the pickabook.lk database on HostGator:

- cPanel → **Remote MySQL** → add the VPS's *outbound* public IP as an access
  host. This is by IP, not domain — if the VPS IP ever changes, the catalogue
  goes dark with a connect timeout and no other symptom.
- Grant the MySQL user `SELECT` on `books` and `categories` only.
- Many VPS providers firewall outbound 3306. **Test the connection before
  building against it.**
- HostGator may be on MySQL 5.7 — keep SQL to that subset (`REGEXP` yes,
  `REGEXP_LIKE` and CTEs no). Check with `select version()`.

Relevant legacy columns: `books(id, book_name, author, book_by, price,
description, image, category_id, status, library)` where `status = 1` means in
stock and `0` pre-order, and `library = 1` means lendable. `category_id` is
mixed — sometimes a numeric FK into `categories`, sometimes free text.

## Deployment notes

Two Next apps share one VPS: quiz on 3000, portal on 3001, one nginx in front,
two systemd/PM2 units.

- They must **not** share a `.env`.
- **Never run `next build` in production while serving** — peak build memory
  will take the other app down with it.
- The PayHere webhook needs to be publicly reachable over HTTPS on 443 with a
  valid certificate, and must not be behind a `www` redirect (a 301 on a POST
  drops the body).

## Plan

The full implementation plan, including the phased build order, lives at
`C:\Users\Hamdhan\.claude\plans\yes-i-want-a-smooth-coral.md`.

Phases 0 (foundations) and 1 (identity + RLS spine) are complete.
