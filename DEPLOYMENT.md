# Deployment checklist

## Live as of 25 Aug 2026

| | |
|---|---|
| Member portal | https://member.pickabook.lk |
| Quiz night | https://quiz.pickabook.lk |
| VPS | InterServer, `162.35.112.114`, Ubuntu 26.04, 2 vCPU / 7.4 GB |
| Apps | `/srv/apps/member-register` (:3001), `/srv/apps/web-game` (:3000) |
| Services | `pab-member`, `pab-quiz` — systemd, run as user `pab`, restart on failure and on boot |
| TLS | Let's Encrypt via certbot, `certbot.timer` renews automatically |
| Update | `/srv/apps/deploy.sh [member|quiz|both]` as root |

`pickabook.lk` itself is **untouched** on HostGator (`192.254.185.29`). Only two
new DNS A records were added; no existing record was changed.

### Logs

```bash
journalctl -u pab-member -f          # or pab-quiz
journalctl -u pab-member -n 100 --no-pager
grep -r "\[payhere:notify\]" /var/log/   # webhook problems
```


Things that are **deliberately wrong for production** while developing, plus
the ones that are easy to forget. Work top to bottom when moving to the VPS.

## TODO on the VPS — the two that are not code

Both of these are built and waiting on configuration. Neither can be finished
on the current free-tier setup, and neither is blocked by code.

- [x] **Email (custom SMTP).** Done — HostGator, sending as
      `noreply@pickabook.lk`. Signup confirmation and magic links both
      verified as arriving (1 Sep 2026).
- [x] **Auth email comes from the app, not from Supabase.** Signup
      confirmation and password reset are one-time codes minted by
      `auth.admin.generateLink` and sent by this process over nodemailer
      (`src/lib/email/`). **Verified end to end on 2 Sep 2026**: the mail test,
      a signup code, and a reset code all arrived in the inbox — the first time
      password reset has ever worked on this system.
      Company invites go the same way -- GoTrue mints the invite link,
      nodemailer sends it -- so **no auth email depends on Supabase's SMTP any
      more**. Invites stay a link rather than a code: the recipient did not ask
      for the mail and has no account yet, so the link is the proof they read
      the mailbox. That path is still unexercised — see QA-CHECKLIST §6.

      Worth recording why this was worth doing rather than switching provider:
      the old `recovery` mail was accepted by the same SMTP server, produced no
      bounce, and never arrived, while messages we composed ourselves reached
      the inbox from the same host, same credentials, same From address. The
      fault was inside GoTrue's mailer, so no amount of DNS or provider work
      would have fixed it. Sending the message ourselves did — HostGator was
      never the problem, and Brevo proved unnecessary.
- [x] **PayHere sandbox configured.** Merchant `1237809`, mode `sandbox`, live
      on the VPS — `/api/health` reports `configured (sandbox)`. The domain
      whitelist is the **apex** `pickabook.lk`; PayHere rejects subdomains, and
      the apex covers `member.` beneath it. The checkout hash is now verified
      against the real gateway: a signed form returns a genuine checkout page
      rather than "Unauthorized payment request", which with the old
      placeholder credentials was indistinguishable from a bad signature.
- [ ] **PayHere has still never called the webhook.** Everything up to the
      gateway is verified; settlement is not. Run one real sandbox payment on
      `https://member.pickabook.lk/renew` and confirm `payment_events` shows
      `applied = true`. See TESTING.md §6.

Until the webhook has fired for real, treat automatic payment settlement as
**unverified against the real service**, however green the suites look. The
manual "record as paid" action in `/admin/payments` exists to cover the gap,
not to replace the webhook.

A database migration to the VPS is planned separately — see MIGRATION.md.

## 1. Supabase Auth — settings that MUST change

Dashboard → Authentication.

| Setting | Development | Production | Why it matters |
|---|---|---|---|
| **Confirm email** | **ON** | **ON** | Off lets anyone sign up with an address they do not own — and the join form now creates the account *before* the code is checked, so with this off an unverified account could simply log in. **This is the single most important line in this file.** `supabase/config.toml` sets it for local; the dashboard setting is what counts in production. |
| Custom SMTP | none | not needed | Every auth email — signup code, reset code, invite — is sent by the app over the `SMTP_*` settings in §2. GoTrue's own mailer, and its ~2/hour cap, is out of the picture. |
| **OTP length** | 6 (`config.toml`) | whatever the project issues | Not the same in both: the local config says 6 and the live project issues 8. Nothing in the app assumes a length — the code box accepts 4–12 digits and Auth decides. Do not "fix" this by hardcoding one. |
| **Confirm email OTP expiry** | 600s | 600s | `otp_expiry` in `supabase/config.toml`. The email tells the member "10 minutes" from `OTP_EXPIRY_MINUTES` in `src/lib/auth/otp.ts` — change the two together or the message lies. |
| Site URL | `http://localhost:3001` | production origin | |
| Redirect URLs | `http://localhost:3001/**` | production origin + `/**` | **If this is empty or wrong, every invite and password-reset link 400s** with no useful error. It was empty on first setup — check it. |
| Min password length | 10 | 10 | Must match the 10 the UI enforces, or the UI accepts passwords Auth then rejects. |

After enabling SMTP, re-run `npm run test:onboarding`. It currently detects
the mailer cap and skips the real browser signup — with SMTP it exercises that
path for real, and that is the point at which signup is actually tested.

## 2. Environment

`.env.local` is **not** deployed. Create the production env separately, and do
not share it with the quiz app — leaking one app's secrets into the other's
environment is an easy accident.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=https://<production origin>

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@pickabook.lk
SMTP_FROM_NAME=Pick a Book
```

Without the `SMTP_*` vars the app cannot send a signup or reset code, so
**nobody can register and nobody can recover an account** — the mailer throws
on the first send rather than starting up degraded. Port 465 is implicit TLS;
on any other port the server must offer STARTTLS or the send is refused,
because the message carries a one-time code.

**Quote `SMTP_PASSWORD`.** Node's `--env-file` parser is not the shell's, and
it silently truncated an unquoted 16-character password to 12 — so nodemailer
authenticated with a wrong password and the server answered
`535 Incorrect authentication data`, which reads exactly like a wrong password
rather than a parsing bug. Anything reading the file directly (a Python test,
`grep`) saw all 16 characters and worked, which made it look like nodemailer
was at fault. Write it as:

```
SMTP_PASSWORD='the-actual-password'
```

Check what the process actually receives, rather than what the file contains:

```bash
node --env-file=.env.local -e 'console.log(process.env.SMTP_PASSWORD.length)'
```

These are server-only vars, so changing them needs a `systemctl restart
pab-member` — not a rebuild. But it *does* need the restart: the running
process keeps whatever it parsed at startup.

`NEXT_PUBLIC_SITE_URL` is baked into the client bundle at build time. Changing
it means rebuilding, not restarting.

**Rotate the service-role key** if it has ever been pasted into a chat, an
issue, or a screenshot. It has BYPASSRLS — every visibility and ownership rule
in the schema is off underneath it.

## 3. Database

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase link --project-ref <prod ref>
npm run db:push
```

Then verify against production, because RLS is not something to assume:

```bash
npm run test:rls          # policies, against raw PostgREST with real tokens
```

Point it at production by supplying production env vars. Each suite creates
and deletes users under its own test domain (`@rlstest.local`, `@pay.test`,
`@adm.test`, …) — safe, but it does write.

## 4. VPS

Two Next apps share the box: quiz on **3000**, portal on **3001**.

- Separate systemd/PM2 units, separate `.env` files, one nginx in front.
- `deploy.sh` builds in place. On this box that is fine — 7.4 GB RAM against
  two apps using ~180 MB — but it means roughly 30 seconds where the app being
  rebuilt is serving from a half-written `.next`. Deploy when nobody is mid-session.
- `deploy.sh` deletes `.next` before every build. Turbopack will otherwise
  reuse a chunk cached from a failed or older build, which surfaces as a
  module-resolution error that looks exactly like a missing package. This cost
  an hour during the first deploy.
- **Never `npm ci --omit=dev`.** tailwind, postcss and typescript are
  devDependencies and the build needs them; a production-only install fails
  with "Cannot find module '@tailwindcss/postcss'".
- Pin the VPS's outbound public IP — the legacy MySQL access (Phase 6) is
  whitelisted by IP in cPanel → Remote MySQL, and a changed IP kills the book
  catalogue silently with a connect timeout.

### nginx

The app sits behind nginx on 3001. Two details are load-bearing:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    # OVERWRITE, not append. `$proxy_add_x_forwarded_for` appends to whatever
    # the client sent, so a client can prepend a fake address and the rate
    # limiter buckets them separately every request. Setting it outright means
    # the value is ours.
    proxy_set_header X-Forwarded-For   $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Server Actions and the PayHere webhook are POSTs. A redirect here turns
    # them into GETs and drops the body.
    proxy_redirect off;
}
```

Do **not** add a `www` → non-`www` redirect (or the reverse) in front of
`/api/payhere/notify`. A 301 on a POST drops the body, and payments stop
settling with no error anywhere.

### Health check

`GET /api/health` answers 200 when the app and its database are reachable, and
503 when they are not, so a monitor can alert on status alone. It reports
whether each dependency answers, never what it said — it is public, because a
monitor cannot authenticate.

```
*/5 * * * * curl -fsS https://<origin>/api/health >/dev/null || echo "portal unhealthy" | mail -s "Pick a Book" you@example.com
```

### Security headers

Set in `next.config.ts` from `src/lib/security/headers.ts`. Two are easy to
break by "tightening":

- **`form-action` must list PayHere.** Checkout works by POSTing a signed form
  to their domain. With `form-action 'self'` the browser blocks it silently —
  the button appears to do nothing and no console error names the cause.
- **`frame-src` must list YouTube and Vimeo**, or every video embed is blank.

`script-src` includes `'unsafe-inline'` because Next inlines its RSC payload.
Removing it needs per-request nonces through the proxy — a real change, not a
tightening. `'unsafe-eval'` is development-only.

## 5. PayHere

Built and tested against synthetic notifications; **never yet called by
PayHere**, because a webhook cannot reach localhost.

1. Set `PAYHERE_MERCHANT_ID` and `PAYHERE_MERCHANT_SECRET` from the merchant
   portal. Replace the placeholder values — they are obviously fake and no
   real payment will succeed with them.
2. Whitelist the production domain in the merchant portal.
3. The notify webhook must be reachable from the public internet over HTTPS on
   443 with a valid certificate.
4. `/api/payhere` is **excluded from the proxy matcher** in `src/proxy.ts`. If
   that exclusion is ever lost, every notification is redirected to `/login`,
   the body is dropped, and payments stop settling with no visible error. It
   is the highest-consequence, lowest-visibility failure in the app.
5. Run **one real sandbox payment end to end** and confirm `payment_events`
   shows `applied = true`. Until that has happened, automatic settlement is
   unverified however green the suites look.
6. Switch `PAYHERE_MODE` to `live` only after step 5 passes in sandbox.

The `/admin/payments` "record as paid" action covers the gap in the meantime.
It marks the status `manual` rather than `success` so reconciliation can tell
the two apart, and it requires a reason, which is audited.

## 6. After deploying

Run the suites against production and check the four things that are only
observable there:

```bash
curl -sI https://<origin>/ | grep -i content-security-policy
curl -s  https://<origin>/api/health
```

- A member's invite email arrives and its link works (needs §1 done).
- One real sandbox payment settles via the webhook (needs §5 done).
