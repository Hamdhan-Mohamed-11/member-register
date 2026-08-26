# Pick a Book — member portal testing guide

Walk through this to confirm everything works before real members arrive.

**Site:** https://member.pickabook.lk
**Password for every test account below:** `PickABook!2026`

PayHere is deliberately not configured, so payment buttons are absent and the
portal says "contact the club" instead. Everything else is live.

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
- [ ] `/login` → "Forgot password?" sends an email that arrives
- [ ] `/join` → lists **only public clubs** (no company clubs)

**Sign-up, end to end** — the path that was broken and is now fixed:

- [ ] `/join` with a real address you can read → "check your email"
- [ ] The confirmation email arrives
- [ ] Clicking the link lands on `/pending` saying "Your email is confirmed"
- [ ] It does **not** get stuck, and the URL is not `localhost`

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
- [ ] `/join` (logged out) does **not** offer the company club

**Payments:**

- [ ] `/admin/payments` — empty, and says PayHere is not configured

---

## 6. Things that should fail

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
| **PayHere** | Not configured. Renewal and booking show "contact the club" rather than a pay button. Needs merchant ID and secret. |
| **Buying and borrowing** | The catalogue and pricing are live, but cart, checkout, invoices and borrow requests are not built yet. |
| **Invite emails** | Invite rows are created correctly; the send can fail on the shared mailer. The rows are what control access. |
| **Landing photography** | The reference design has photos; none are used, as there are no image assets. |
| **Company-club sign-in** | No company employee has accepted an invite yet, so that path is untested end to end. |

---

## When you are finished

Tell me and I will remove every `@test.pickabook.lk` account, the demo
sessions, the demo club and the seeded reading and video rows, so the database
is clean before real members join.
