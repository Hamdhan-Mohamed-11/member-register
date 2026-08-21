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
npm run test:rls          # 45 checks against raw PostgREST
```

Point it at production by supplying production env vars. It creates and
deletes users under `@rlstest.local` — safe, but it does write.

## 4. VPS

Two Next apps share the box: quiz on **3000**, portal on **3001**.

- Separate systemd/PM2 units, separate `.env` files, one nginx in front.
- **Never run `next build` in production while serving.** Peak build memory
  will take the other app down with it. Build elsewhere, or on a swap-backed
  box, and deploy the artefact.
- Pin the VPS's outbound public IP — the legacy MySQL access (Phase 6) is
  whitelisted by IP in cPanel → Remote MySQL, and a changed IP kills the book
  catalogue silently with a connect timeout.

## 5. PayHere (Phase 5, not built yet)

- The notify webhook must be reachable from the public internet over HTTPS on
  443 with a valid certificate.
- No `www` redirect in front of it — a 301 on a POST drops the body.
- `/api/payhere` is excluded from the proxy matcher in `src/proxy.ts`. If that
  exclusion is ever lost, every payment notification gets redirected to
  `/login` and payments stop settling with no error anywhere.
- Whitelist the production domain in the PayHere merchant portal before going
  live, and switch `PAYHERE_MODE` from `sandbox` to `live`.
