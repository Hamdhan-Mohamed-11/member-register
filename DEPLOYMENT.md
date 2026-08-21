# Deployment checklist

Things that are **deliberately wrong for production** while developing, plus
the ones that are easy to forget. Work top to bottom when moving to the VPS.

## TODO on the VPS — the two that are not code

Both of these are built and waiting on configuration. Neither can be finished
on the current free-tier setup, and neither is blocked by code.

- [ ] **Email (custom SMTP).** Everything that sends mail — signup
      confirmation, invite links, password reset — is written and works
      against the API, but the built-in mailer caps at ~2 sends/hour, so those
      paths have never been exercised end to end. Configure SMTP, turn
      **Confirm email back ON**, then run `npm run test:onboarding` — it stops
      skipping the browser signup and that is the moment signup is genuinely
      tested. See §1.
- [ ] **PayHere webhook.** The notify endpoint, signature check and
      idempotency are built and tested against synthetic notifications, but
      **PayHere has never actually called it** — a webhook cannot reach
      `localhost`. On the VPS: point `notify_url` at
      `https://<origin>/api/payhere/notify`, whitelist the domain in the
      merchant portal, switch `PAYHERE_MODE` to `live`, and run one real
      sandbox payment end to end. See §5.

Until both are done, treat signup-by-email and automatic payment settlement as
**unverified against the real services**, however green the test suites look.
The manual "record as paid" action in `/admin/payments` exists to cover the
gap, not to replace the webhook.

## 1. Supabase Auth — settings that MUST change

Dashboard → Authentication.

| Setting | Development | Production | Why it matters |
|---|---|---|---|
| **Confirm email** | **off** | **ON** | Off lets anyone sign up with an address they do not own. It is off only because the built-in mailer is capped at ~2 sends/hour, which makes the signup path untestable. **This is the single most important line in this file.** |
| Custom SMTP | none | **configured** | The built-in mailer's cap (`rate_limit_email_sent: 2`) is not a rate to design around — it is a development stub. Bulk-inviting one company's employees exceeds it immediately. Resend and Brevo both have free tiers that comfortably cover ~300 members. |
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
```

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
- **Never run `next build` in production while serving.** Peak build memory
  will take the other app down with it. Build elsewhere, or on a swap-backed
  box, and deploy the artefact.
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
