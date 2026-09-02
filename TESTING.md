# Pick a Book — member portal testing guide

Walk through this to confirm everything works before real members arrive.

**Site:** https://member.pickabook.lk
**Password for every test account below:** `PickABook!2026`

PayHere is configured in **sandbox** mode — payment buttons are live, but no
money moves and every card is simulated. Use the test cards in §6. Everything
else is live.

---

## Test accounts

| Account | Role | Set up with |
|---|---|---|
| `kimivibecode@gmail.com` | **Super admin** | Your own — use the password-reset link emailed to you |
| `secretary@test.pickabook.lk` | Secretary | Public club |
| `member@test.pickabook.lk` | Member | Reading list, points, a video awaiting review |
| `member2@test.pickabook.lk` | Member | Presented at the past session |
| `poet@test.pickabook.lk` | Member | A **different** club — for the visibility checks |
| `applicant@test.pickabook.lk` | Pending | Sitting in the approval queue |

Sample data seeded: two clubs, two sessions (one free, one paid), a reading
list, points from a past session, one pending video, one pending application.

---

## 1. Signed out

- [ ] `/` — landing page loads: cream hero, navy feature band, gold accents
- [ ] Looks right on a phone as well as a laptop
- [ ] `/feed` while logged out → bounced to `/login`, with `?next=/feed` kept
- [ ] `/admin` while logged out → bounced to `/login`
- [ ] `npm run test:mail -- you@example.com` — the mailer connects and sends
- [ ] `/join` → lists **only public clubs** (no company clubs)

**Sign-up, end to end** — with a real address you can read:

- [ ] `/join` → fill in details, submit → the code step appears
- [ ] A numeric code arrives by email (check spam)
- [ ] A wrong code → "that code is wrong or has expired", and you can retry
- [ ] The right code lands on `/pending`
- [ ] Your **name** shows in the admin queue afterwards, not just the email
- [ ] Abandon a signup at the code step, then try to log in with that password
      → refused. If it succeeds, **Confirm email is off** in the dashboard and
      anyone can register an address they do not own (DEPLOYMENT.md §1)

**Password reset** — the path that had no working version at all:

- [ ] `/forgot-password` with a registered address → the code step appears
- [ ] The reset code arrives
- [ ] An **unregistered** address gives the same screen — no hint either way
- [ ] The right code lands on `/auth/reset-password`
- [ ] The new password saves, and logging in with it works
- [ ] The same code a second time is refused

---

## 2. Member — `member@test.pickabook.lk`

| Page | Expected |
|---|---|
| `/feed` | Greeting by name, club name, points, renewal date |
| `/me` | Profile with club membership and renewal status |
| `/me/edit` | Name/bio save; **photo upload** resizes and shows in the top bar |
| `/me/reading` | Three books across the three sections |
| `/me/points` | Ledger shows +10 attend; total matches `/feed` |
| `/directory` | Members of your club only |
| `/members/…` | Their club, current reading, books read |
| `/sessions` | Both sessions listed |
| `/books` | 13,129 books |
| `/library` | 171 borrowable titles |
| `/renew` | Your club, plus clubs you could join |

- [ ] `/me/reading` — **"Mark read"** moves a book to the Read section with a date
- [ ] `/me/reading` — add a book; it appears immediately
- [ ] `/directory` — shows Ishara and Ruwan, **not Tharindu** (different club)
- [ ] `/sessions` — "Demo August book night" is **free**; "Demo Poetry evening" shows **LKR 1,200** because you are a guest there
- [ ] Open the poetry session → booking panel quotes that guest fee
- [ ] `/books` — search `Ishiguro`, filter a category, go to page 2; filters survive paging
- [ ] Open any book → member price, shop price struck through, "you save …"
- [ ] `/videos/submit` — paste a normal YouTube link → "sent for review"
- [ ] `/me/videos` — it is listed as **Awaiting review**
- [ ] `/videos` — it is **not** in the public feed yet

**Security checks worth doing deliberately:**

- [ ] `/videos/submit` — paste `javascript:alert(1)` → rejected, not saved
- [ ] `/admin` → bounced back to `/feed`
- [ ] Open `/members/<the poet's id>` → **404**, not a permission error

---

## 3. Member in another club — `poet@test.pickabook.lk`

This is the club-visibility test. Company and separate clubs must not leak.

- [ ] `/directory` — shows **nobody** from the public club
- [ ] `/sessions` — the poetry evening is **free** for you (it is your club)
- [ ] `/sessions` — the August book night is another club's session
- [ ] `/renew` — offers the public club as one you could join

---

## 4. Secretary — `secretary@test.pickabook.lk`

- [ ] `/admin` shows **Join requests, Sessions, Videos, Book orders, Borrow requests**
- [ ] It does **not** show Members, Invites, Companies, Settings or Payments
- [ ] Typing `/admin/settings` directly → bounced away

**Sessions:**

- [ ] `/admin/sessions/new` — create a session
- [ ] Choosing "paid" reveals the guest-fee field, and saving without a fee is refused
- [ ] `/admin/sessions/…` — edit it; changes stick

**The attendance recorder — the screen used during a live session:**

- [ ] `/admin/sessions/…/attendance` lists club members
- [ ] Tick **Presented a book** + **Attended a session** for one person → running total shows **+30**
- [ ] Save → confirmation appears
- [ ] Untick one, save again → total drops accordingly
- [ ] Log in as that member and check `/me/points` matches

**Videos:**

- [ ] `/admin/videos` — the member's submission is in the queue
- [ ] Publish it → it appears in `/videos` for everyone
- [ ] Reject one with a reason → the submitter sees the reason on `/me/videos`

---

## 5. Super admin — your account

Everything a secretary can do, plus:

**Join requests:**

- [ ] `/admin/join-requests` — Sanduni Fernando is waiting
- [ ] Approve her → she disappears from the queue
- [ ] `/admin/members` shows her as **active** with a renewal date

**Members:**

- [ ] `/admin/members` — search by name or email
- [ ] Open someone → change role to Secretary; it saves
- [ ] Add a club to a member → it appears with its own renewal date
- [ ] **Try demoting yourself to Member → it must refuse**, because you are the last super admin

**Settings:**

- [ ] `/admin/settings` — change the book discount to `20`
- [ ] Reload `/books` → prices reflect 20%
- [ ] Change it back to `25`
- [ ] Change a points value → the note says it affects future sessions only

**Companies:**

- [ ] `/admin/companies` — add a company; a private club is created automatically
- [ ] Paste two or three employee emails → invite rows are created
- [ ] Those invites are listed as unaccepted
- [ ] The invite email arrives — sent by the app now, over the same SMTP as
      the signup codes — and its link sets a password
- [ ] `/join` (logged out) does **not** offer the company club

**Payments:**

- [ ] `/admin/payments` — no longer says "not configured"; it reports **sandbox**
- [ ] Once §6 is done, the test payment is listed there as **success**
- [ ] "Record as paid" on a pending payment refuses without a reason, and marks
      it **manual** rather than success — so reconciliation can tell the two apart

---

## 6. Payments — sandbox

The part that has never been exercised against the real gateway. Everything
below is simulated: no money moves, and the cards are PayHere's own test
numbers.

| Card | Number | Result |
|---|---|---|
| Visa | `4916217501611292` | **Success** |
| MasterCard | `5307732125531191` | Success |
| Visa | `4024007194349121` | **Declined** (insufficient funds) |

Any name, any CVV, any future expiry. Any card *not* on PayHere's test list
fails.

**The happy path** — as `member@test.pickabook.lk`:

- [ ] `/renew` shows real pay buttons, **not** "contact the club"
- [ ] Click a join/renew button → you land on PayHere's checkout
- [ ] The checkout shows the **right club name and the right amount**
- [ ] It carries the orange "Sandbox Mode" notice — if it does not, you are on
      **live** and should stop
- [ ] Pay with the success card → you return to `/renew/result`
- [ ] The result page settles to **paid** on its own, without a manual reload
- [ ] `/me` and `/feed` show the renewal date pushed out by one term

**That the webhook actually arrived.** This is the whole point — a payment can
look fine in the browser while settlement silently never happened:

- [ ] On the VPS, `journalctl -u pab-member -f | grep -i payhere` logged nothing
      alarming during the payment
- [ ] In Supabase, `payment_events` has a row for that order with
      `signature_ok = true` **and `applied = true`**
- [ ] `payments` shows the order as `success`, with PayHere's `payment_id` stored

If the browser said paid but `applied` is false, settlement is broken — check
that nginx is not redirecting `/api/payhere/notify`, and that the path is still
excluded from the proxy matcher in `src/proxy.ts`.

**The unhappy paths:**

- [ ] Start a payment, then hit **Back to Site** on PayHere → you return to
      `/renew?cancelled=1` and the membership is **unchanged**
- [ ] Pay with the declined card → the payment ends `failed`, and the renewal
      date does **not** move
- [ ] Pay for a **paid session** as a guest (`/sessions` → the poetry evening)
      → the quoted guest fee is what PayHere charges

---

## 7. Things that should fail

Worth trying on purpose — each protects something real.

- [ ] Log out, open `/me` → bounced to login
- [ ] As a member, open `/admin/settings` → bounced away
- [ ] As a member, open another club member's profile → 404
- [ ] Submit a video with a `javascript:` or `data:` URL → rejected
- [ ] Paste `https://youtube.com.evil.example/watch?v=abc` → rejected (lookalike host)
- [ ] As the last super admin, demote yourself → refused with a reason

---

## Known gaps

Not bugs — deliberately unfinished, listed so they are not reported as faults.

| Area | State |
|---|---|
| **PayHere** | Configured in **sandbox**. Checkout and signing are verified against the real gateway; going live needs a live merchant account (business registration + bank details) and `PAYHERE_MODE=live`. |
| **Buying and borrowing** | The catalogue and pricing are live, but cart, checkout, invoices and borrow requests are not built yet. |
| **Invite emails** | Invite rows are created correctly; the send can fail on the shared mailer. The rows are what control access. |
| **Landing photography** | The reference design has photos; none are used, as there are no image assets. |
| **Company-club sign-in** | No company employee has accepted an invite yet, so that path is untested end to end. |

---

## The automated suites

The checklists above are the manual pass. There are also automated suites, and
since 1 Sep 2026 they run **on the VPS against the live site**, so they do not
depend on anyone's laptop being on:

```bash
ssh root@162.35.112.114
/srv/apps/run-tests.sh              # everything, in the right order
/srv/apps/run-tests.sh rls-test     # one suite, full output
```

They target `https://member.pickabook.lk` and they **write to the live
database** — each suite creates users under its own test domain
(`@rlstest.local`, `@pay.test`, `@comp.test`, …) and deletes them afterwards.

**Run them through `run-tests.sh` rather than calling the scripts directly.**
`e2e-auth.mjs` and `e2e-directory.mjs` do not create their own users: they
expect the `@rlstest.local` fixtures that `rls-test.mjs` seeds and then deletes
on exit. Called in the wrong order every login fails and fifteen tests go red,
which looks exactly like a broken deployment. The runner handles the ordering.

### Known failures that are not bugs

Three checks in `rls-test` fail for a data reason rather than a defect: the
suite assumes its own fixture is the only `super_admin`, which stopped being
true once a real super admin existed. Its "the last super admin CANNOT be
demoted" check therefore succeeds in demoting the fixture — and the later
`e2e-auth` admin checks then sign in as an "admin" whose role is `member`.
The same three fail against Supabase cloud. Before treating any failure as a
regression, check whether it fails on both.

## When you are finished

Tell me and I will remove every `@test.pickabook.lk` account, the demo
sessions, the demo club and the seeded reading and video rows, so the database
is clean before real members join.
