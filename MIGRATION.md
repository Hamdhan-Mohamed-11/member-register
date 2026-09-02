# Migrating the database to the VPS

Moving the member portal's database off Supabase cloud and onto the InterServer
VPS, as a self-hosted Supabase stack.

**Status: planned, not started.** Nothing below has been executed yet. Tick the
boxes as you go, because this spans sessions and "what has actually been done"
is the thing that gets lost.

## Why self-hosted Supabase and not plain Postgres

The app's authorisation model lives *in the database*: 28 RLS policies and 56
Postgres functions called over PostgREST, plus Supabase Auth for every login
and Supabase Storage for avatars. Plain Postgres would mean rewriting
authentication and re-homing all of that — months of work through the two areas
most dangerous to get wrong.

Self-hosted Supabase runs the same schema behind the same API surface, so the
application code barely changes. What changes is that **you** now own uptime,
patching and backups.

## What is where today

| Piece | Location |
|---|---|
| `pickabook.lk` + DNS + legacy MySQL catalogue | HostGator `192.254.185.29` |
| Member portal (`pab-member`, :3001) | VPS `162.35.112.114` |
| Quiz app (`pab-quiz`, :3000) | Same VPS — **separate Supabase project**, unaffected |
| Member database, auth, storage | Supabase cloud `prkpzbsslfwtouwchlhj` ← moving |

The quiz uses project `qpurpyvjtlxahvlnyerm`. It is **not** touched by this
migration. Do not change its env.

## Services we run, and the ones we don't

Realtime is not used anywhere in the codebase, and avatars are resized
client-side, so both Realtime and imgproxy are omitted. That is deliberate —
each one dropped is memory not spent and a service not patched.

| Service | Run it? |
|---|---|
| Postgres, GoTrue, PostgREST, Storage, Kong, Studio, postgres-meta | yes |
| Realtime | no — unused |
| imgproxy | no — client-side resizing |

**Studio must not use its default port 3000** — `pab-quiz` already holds
`127.0.0.1:3000`. Bind Studio somewhere else, and prefer reaching it through an
SSH tunnel rather than exposing an admin dashboard to the internet at all.

---

## Connection facts (established 1 Sep 2026)

Two of these are not obvious and cost time to discover:

- Supabase cloud runs **PostgreSQL 17.6**; the VPS has `pg_dump` **18.6**.
  Newer client dumping an older server is the safe direction.
- **The direct connection is unusable from this VPS.** `db.<ref>.supabase.co`
  is IPv6-only on the free tier, and the VPS has no outbound IPv6 at all — the
  hostname does not even resolve. Use the **session pooler** over IPv4:
  ```
  host aws-0-ap-northeast-2.pooler.supabase.com  port 5432
  user postgres.prkpzbsslfwtouwchlhj             db   postgres
  ```
  Note `aws-1-...` also resolves but rejects the tenant — it is the wrong host.
  The **transaction** pooler (6543) cannot be used by `pg_dump` at all.
- The database password lives at `/root/.supabase-pw` on the VPS, mode 600.
  Pass it as `PGPASSWORD` with host/user/db as separate flags — **never build a
  URI**. A malformed URI makes libpq print the password inside a "could not
  translate host name" error, which is how the first one leaked.

## Phase 0 — before touching anything

- [x] `apt upgrade` and reboot — done, kernel now 7.0.0-30-generic, Node 24.20.0.
      Both apps came back unattended, which was the point. Run apt with
      `DEBIAN_FRONTEND=noninteractive` and `--force-confold`, or it stops on the
      `keyboard-configuration` dialog and installs nothing
- [x] `fail2ban` installed and active — it banned a real brute-forcer within
      seconds of starting. SSH password auth deliberately left ENABLED so the
      key cannot lock anyone out
- [x] Full backup of the cloud project taken — see Phase 1

## Phase 1 — back up the cloud project

Nothing else starts until this exists and has been *read back*.

**Done 1 Sep 2026.** Repeat this before any later re-cut.

```
PW=$(tr -d '\n\r' < /root/.supabase-pw)
PGPASSWORD="$PW" pg_dump \
  -h aws-0-ap-northeast-2.pooler.supabase.com -p 5432 \
  -U postgres.prkpzbsslfwtouwchlhj -d postgres \
  --no-owner --no-privileges \
  -n public -n auth -n storage \
  -f /root/backups/member-cloud-$(date +%F-%H%M).sql
```

- [x] Dumped `public`, `auth` and `storage`. The default dump omits `auth`, and
      that is where the password hashes live
- [x] Verified rather than assumed — 9 `auth.users` rows (matching 9 profiles),
      25 policies, RLS on 40 tables, 69 functions, 16 tables carrying data
- [x] Copied off the VPS to `C:\Users\Hamdhan\pickabook-backups\`, sha256
      compared on both ends. Deliberately **outside the repo** — it holds
      password hashes and member PII and must never be committed
- [x] Storage: `storage.objects` is **empty** (1 bucket, 0 files). Nobody has
      uploaded an avatar yet, so there is nothing to copy — recreate the bucket
      and move on. It also means photo upload is still untested, see TESTING.md §2

## Phase 2 — install the stack

Deployed at `/srv/supabase/member-db`, pinned to `self-hosted/v0.8.0`.

- [x] Docker 29.1.3 + compose 2.40.3 from the **Ubuntu archive**, not Docker's
      own repo — Docker publishes nothing for `resolute` yet. Both live sites
      were re-checked afterwards; Docker rewrites iptables and that is worth
      verifying rather than assuming
- [x] Scaffolded with the stack's own `setup.sh -y --skip-deps --project-dir
      member-db`, which generates every secret. **The user must run this** —
      executing a fetched script as root is blocked for Claude, correctly
- [x] Secrets verified as generated rather than left as the shipped
      placeholders. Check this explicitly; a placeholder `JWT_SECRET` is a
      wide-open database that looks completely normal
- [x] `supabase/postgres:17.6.1.136` in the base compose — already an exact
      match for cloud's 17.6, so no `pg17` overlay needed
- [x] Ports bound to `127.0.0.1` and per-container memory limits, via
      `docker-compose.override.yml`
- [ ] Bring it up and confirm every container is healthy, still with no data

### The override trap — read this before editing compose

`.env` ships with `COMPOSE_FILE=docker-compose.yml`. **When `COMPOSE_FILE` is
set, Compose stops auto-loading `docker-compose.override.yml`.** The override is
silently ignored: no warning, no error, and `docker compose config` validates
happily. The ports simply stay bound to `0.0.0.0` — which would have published
the member database to the public internet, on a box we had already watched get
brute-forced.

The fix is to name it explicitly:

```
COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml
```

Verify it actually applied, rather than trusting that it did:

```
docker compose config | grep -c host_ip     # must be 3, not 0
```

### Deviations from the original plan

- **Studio needs no port remap.** In this stack version Studio is served through
  the API gateway on 8000 and publishes no host port of its own, so the feared
  collision with `pab-quiz` on 3000 does not exist. That was true of the older
  single-compose layout only.
- **Realtime and imgproxy are kept**, though the app uses neither. `storage`
  declares a dependency on `imgproxy`, and removing services risks a startup
  failure that costs more to debug than the ~200 MB they idle at. Trim later if
  memory gets tight.
- Published host ports are `8000`, `5432`, `6543` — all loopback-only.

## Phase 3 — restore the data

**Do not replay the full dump.** A fresh install already has populated `auth`
and `storage` schemas of its own. Restore in three targeted pieces, in this
order — `public.profiles` has a foreign key to `auth.users`, so the accounts
must land first.

```
pg_dump ... -n public                                   -f r1-public.sql
pg_dump ... --data-only -t auth.users -t auth.identities -f r2-auth.sql
pg_dump ... --data-only -t storage.buckets               -f r3-storage.sql
```

Restore with `docker compose exec -T db psql -U postgres -d postgres`.

- [x] `auth.users` (9) and `auth.identities` (9). **Identities are not
      optional** — without them the accounts exist but cannot log in
- [x] `public` — 16 tables, RLS on all 16, 21 policies, 48 functions, and every
      row count matched: profiles 9, clubs 2, memberships 5, payment_events 142,
      admin_audit_log 402, sessions 2, videos 1, points_rules 4
- [x] Storage bucket and its 4 policies, via `storage-restore.sql`
- [x] Verified through the API, not just SQL: PostgREST returns the clubs, and
      `profiles` returns `[]` to an anonymous caller — RLS is genuinely on
- [x] **A migrated password hash authenticates.** Logged in as
      `secretary@test.pickabook.lk` against the new stack. This is the one that
      matters; if it fails, every member is locked out
- [ ] Configure GoTrue SMTP against `noreply@pickabook.lk` — needs the
      HostGator credentials. This is also where password reset gets fixed and
      OTP gets added

### Two traps in this phase

- **`ON_ERROR_STOP=1` plus `CREATE SCHEMA public;`.** The public dump begins by
  creating a schema that already exists, so psql aborts on line one and
  restores *nothing*. Strip that statement (and its `COMMENT ON SCHEMA`) first.
  Worse, if you pipe psql through `grep`, `$?` is grep's exit code and reports
  success — check row counts, never the exit status.
- **`-n public` silently omits the storage policies.** Migration 0009 puts four
  `avatars_*` policies on `storage.objects`, which live in the `storage` schema.
  A public-only dump leaves the bucket with no owner-only rules at all.
- The cloud `storage.buckets` has a `versioning_status` column this Storage
  version lacks, so the bucket row must be inserted with columns named
  explicitly rather than replayed.

## Phase 4 — DNS and TLS

- [x] HostGator DNS: A record `db.pickabook.lk` → `162.35.112.114`
- [x] nginx site `pab-db` proxying to the gateway on `127.0.0.1:8000`
- [x] certbot certificate, expires 2026-11-30, auto-renewing
- [x] `member.` and `quiz.` server blocks untouched; both verified 200 after
- [x] Verified end to end over public HTTPS: PostgREST returns the clubs, and
      GoTrue authenticates a real account

### Studio must not be public

The gateway serves **Supabase Studio at `/`** — a full database admin UI. A
naive `proxy_pass /` would publish it to the internet behind nothing but basic
auth. `pab-db` therefore allows only the API surface and 404s everything else:

```nginx
location ~ ^/(rest|auth|storage|realtime)/v1/ { proxy_pass http://127.0.0.1:8000; ... }
location / { return 404; }
```

Confirm after any nginx change that `https://db.pickabook.lk/` still returns
**404**, not a login page.

Reach Studio over an SSH tunnel instead:

```
ssh -L 8000:127.0.0.1:8000 root@162.35.112.114
# then open http://127.0.0.1:8000
```

## Phase 5 — prove it before trusting it

Run the suites with an env file pointing at the new stack, e.g.
`node --env-file=.env.newdb scripts/rls-test.mjs`, where `.env.newdb` carries
`NEXT_PUBLIC_SUPABASE_URL=https://db.pickabook.lk` plus the new `ANON_KEY` and
`SERVICE_ROLE_KEY` from `/srv/supabase/member-db/.env`.

**Always establish the cloud baseline before calling a failure a regression.**
Running the same suite against cloud is what separates "the migration broke
this" from "this was already like that".

- [x] `test:rls` — **49 passed, 3 failed**, and cloud returns *exactly the same
      49/3*. Behavioural parity. The 3 are pre-existing test artifacts: the
      suite assumes its own fixture is the only `super_admin`, which stopped
      being true once a real one existed
- [ ] `test:payments` — needs a local dev server pointed at the new stack
- [ ] `test:onboarding`, `test:company`, `test:directory`, `test:points`,
      `test:admin`, `test:videos`

### `--no-privileges` nearly shipped a privilege-escalation hole

**This is the most important thing in this document.**

The first restore used `pg_dump --no-owner --no-privileges`. `--no-privileges`
strips every `GRANT` and `REVOKE` — 189 grants and 41 revokes in this schema.
Self-hosted Supabase's bootstrap then grants `ALL ON ALL TABLES IN SCHEMA public
TO anon, authenticated`, so the result was:

| | `authenticated` on `profiles.role` |
|---|---|
| cloud | `SELECT` |
| restored | `SELECT, INSERT, **UPDATE**, REFERENCES` — and `anon` too |

Any logged-in member could `UPDATE` their own `role` to `super_admin`. The RLS
policies were all present and correct; **this application's authorisation does
not rest on RLS alone**, and column- and function-level grants carry a real part
of the load. Fourteen tests failed on exactly this.

The fix, in order:

```sql
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
-- then replay the GRANT/REVOKE lines from a privileges-included dump
```

Revoking first is required: replaying cloud's grants only *adds*, so the
over-permissive defaults would otherwise survive underneath.

### Objects a `-n public` dump silently leaves behind

Three separate times this bit. Anything attached to `auth` or `storage` is not
in a public-schema dump, and nothing warns you:

- **Triggers on `auth.users`** — `on_auth_user_created` calls
  `public.handle_new_user()`. Without it every signup creates an account with
  **no profile row**. Found only because the RLS suite failed while seeding
- **Policies on `storage.objects`** — the four `avatars_*` owner-only rules
- **Grants** — see above

Audit for the whole class rather than fixing them one at a time. Compare both
databases directly; the counts must match:

```sql
select n.nspname||'|func|'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','auth','storage')
union all select n.nspname||'|trig|'||c.relname||'.'||t.tgname from pg_trigger t
  join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('public','auth','storage')
union all select schemaname||'|pol|'||tablename||'.'||policyname from pg_policies
  where schemaname in ('public','auth','storage') order by 1;
```

## Phase 6 — backups, before cutover not after

Non-negotiable. From cutover onward, a dead disk costs every member account,
login and payment record rather than a ten-minute redeploy.

- [x] `/srv/supabase/backup.sh`, nightly at 03:30 UTC via
      `/etc/cron.d/member-db-backup`, 14-day retention, logging to
      `/var/log/member-db-backup.log`
- [x] Dumps `public`, `auth` **and** `storage`, **with privileges**
- [x] Self-verifying: refuses to prune, and renames the file `.SUSPECT`, unless
      the dump has ≥1 `auth.users` row, ≥100 grants and a sane size
- [x] **A restore was actually performed** into a scratch database and verified:
      9 users, 9 profiles, 25 policies, and `authenticated` holding only
      `SELECT` on `profiles.role`
- [x] One copy pulled off-box to `C:\Users\Hamdhan\pickabook-backups\`,
      sha256-compared
- [ ] **Off-box copying is deliberately deferred** (decided 1 Sep 2026). The
      cron job writes only to the VPS. That covers the common cases — a bad
      migration, an accidental delete, logical corruption — but not loss of the
      server itself. Pull a copy by hand periodically:
      `scp root@162.35.112.114:/srv/backups/member-db/<latest>.sql.gz .`

### Restore as `supabase_admin`, not `postgres`

```
zcat <file> | grep -vE '^CREATE SCHEMA public;|^COMMENT ON SCHEMA public' \
  | docker compose exec -T db psql -U supabase_admin -d <target> -v ON_ERROR_STOP=1
```

In Supabase's image `postgres` is **not** the full superuser and cannot
`ALTER DEFAULT PRIVILEGES` for the `supabase_*` roles. Restoring as `postgres`
ends with `permission denied to change default privileges`. The data lands
(those statements sit at the very end of the dump, after the `COPY` blocks), but
the restore is not clean. As `supabase_admin` it is: zero errors.

Strip `CREATE SCHEMA public` — a fresh database already has it, and with
`ON_ERROR_STOP=1` that single line aborts the entire restore on line one.

### Do not verify a pipeline with `awk ... exit` or `head`

The first version of `backup.sh` did, and exited **141 (SIGPIPE)** every run:
closing the pipe early kills `zcat`, and `set -o pipefail` turns that into
failure. The dump was fine, but the success line never printed and **the
retention prune never ran** — so it would have filled the disk while appearing
to work. Read the whole stream instead.

## Phase 7 — cutover

**Done 1 Sep 2026.** The portal now runs on the self-hosted database.

- [x] Rollback copy kept at `/srv/apps/member-register/.env.local.bak-cloud-*`
- [x] `NEXT_PUBLIC_SUPABASE_URL=https://db.pickabook.lk` plus the new
      `ANON_KEY` / `SERVICE_ROLE_KEY`. **The variable names did not change** —
      self-hosted still uses the legacy `ANON_KEY`/`SERVICE_ROLE_KEY` names, so
      no application code changed
- [x] `/srv/apps/deploy.sh member` — a **rebuild**, not a restart.
      `NEXT_PUBLIC_SUPABASE_URL` is baked into the client bundle, so a restart
      would leave the browser talking to the cloud project while the server
      talks to the new one
- [x] Verified the client bundle actually contains `db.pickabook.lk` and no
      trace of the old project ref — checking the health endpoint alone would
      not have caught a stale bundle
- [x] CSP `connect-src` picked up the new origin automatically (it is derived
      from `NEXT_PUBLIC_SUPABASE_URL` at build time). Had it not, every login
      would fail with a generic "email and password don't match"
- [x] Database latency **1000ms → 520ms**, the database now being on the box
- [x] `test:payments` **38/38 against the live stack**, webhook included
- [x] `e2e-auth` through a real browser: 18/21, the 3 explained below
- [x] `quiz.pickabook.lk` unaffected throughout

### Running the browser suites needs fixtures

`e2e-auth.mjs` does **not** create its users. It expects the `@rlstest.local`
fixtures that `rls-test.mjs` seeds and then deletes on exit. Run it as:

```
KEEP=1 node --env-file=.env.newdb scripts/rls-test.mjs
E2E_BASE_URL=https://member.pickabook.lk node --env-file=.env.newdb scripts/e2e-auth.mjs
node --env-file=.env.newdb scripts/rls-test.mjs   # re-run without KEEP to clean up
```

Without the seeding step every login fails and 15 tests go red, which looks
exactly like a broken cutover.

### The three `e2e-auth` failures are one pre-existing artifact

`admin DOES see the admin card`, `admin reaches /admin`, and `admin sees
super-admin-only areas` all cascade from a single cause: a **real**
`super_admin` now exists in the data, so the suite's fixture is no longer the
last one, its "the last super admin CANNOT be demoted" check legitimately
succeeds in demoting it, and the later browser tests then sign in as an "admin"
whose role is `member`. Confirmed by reading the fixture's role after the run.

Nothing to do with the migration — and the same 3 fail against cloud.

## Phase 8 — after

- [ ] **Leave the cloud project running for at least two weeks.** It is the
      rollback, and it costs nothing on the free tier
- [ ] Watch memory for a few days: `free -h`, and that `pab-quiz` is not being
      pressured
- [ ] Confirm a backup ran unattended and can still be restored
- [ ] Only then consider deleting the cloud project

## Rollback

At any point before Phase 8 completes: restore the saved `.env.local`, run
`/srv/apps/deploy.sh member`, and the portal is back on the cloud project.
Payments taken against the self-hosted database in the meantime would not exist
in the cloud one — which is the real argument for a short, watched cutover
window rather than a slow drift between the two.

## The failure modes that are silent

- A **data-only restore** leaves the schema without RLS policies. Everything
  works, and every member can read every other member's data. Phase 3 checks
  this explicitly for that reason.
- **Restarting instead of rebuilding** at cutover splits the client and server
  across two different databases.
- **An untested backup.** The first restore attempt should never be the one
  performed under pressure.
- **Postgres and the two Next apps competing for memory.** Container limits are
  in Phase 2 to stop an OOM kill landing on the quiz app.
