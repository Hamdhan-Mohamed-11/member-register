# Pick a Book — full QA checklist

Every function in the portal, by role. Work top to bottom; later sections
depend on earlier ones having been done.

**Site:** https://member.pickabook.lk
**Password for every `@test.pickabook.lk` account:** `PickABook!2026`

TESTING.md is the shorter smoke test. This is the exhaustive one.

| Account | Role |
|---|---|
| `kimivibecode@gmail.com` | Super admin — your own |
| `secretary@test.pickabook.lk` | Secretary, public club |
| `member@test.pickabook.lk` | Member, public club |
| `member2@test.pickabook.lk` | Member, presented at a past session |
| `poet@test.pickabook.lk` | Member of a **different** club |
| `applicant@test.pickabook.lk` | Pending, in the approval queue |

Use **two browsers** (or one plus an incognito window). Half of these checks
are "can A see B's data", which is miserable to test by logging in and out.

**How to report a problem:** note the URL, the account, what you expected and
what happened. "It didn't work" cannot be acted on; "as poet@, /directory
listed Nimali, who is in another club" can.

---

## 1. Signed out

- [ ] `/` loads — cream hero, navy band, gold accents; looks right narrow
- [ ] `/feed` → bounced to `/login`, and `?next=/feed` survives in the URL
- [ ] `/admin` → bounced to `/login`
- [ ] `/join` lists **public clubs only** — no company clubs
- [ ] `/login` with a wrong password → a clear error, not a crash
- [ ] `/forgot-password` accepts an address and says something sensible

**Sign-up, end to end** — the whole path, with a real address you can read:

- [ ] `/join` → pick a club, fill your name, submit
- [ ] "Check your email" appears
- [ ] The confirmation email **arrives**
- [ ] Its link lands on `/pending` saying your email is confirmed
- [ ] The URL is **not** `localhost` and the page is not an error
- [ ] `/pending` explains that an admin must approve you
- [ ] **Your name — not your email — appears** in the admin queue later (§5).
      This was broken until 1 Sep 2026; every signup lost its name

---

## 2. Member — `member@test.pickabook.lk`

### Feed and profile

- [ ] `/feed` greets you **by name**, shows club, points, renewal date
- [ ] `/me` shows club membership and renewal status
- [ ] `/me/edit` — change name and bio, save, and the change sticks
- [ ] `/me/edit` — upload a photo; it resizes and appears in the top bar
- [ ] Upload something that is not an image → refused
- [ ] Upload something over 2 MB → refused (the bucket cap)
- [ ] `/me/points` — ledger entries; total matches `/feed`

### Reading list

- [ ] `/me/reading` — three sections, books in each
- [ ] Add a book → appears immediately
- [ ] **Mark read** → moves to Read with a date
- [ ] Remove a book → it goes, and stays gone after a reload

### Directory and other members

- [ ] `/directory` lists **only your own club's** members
- [ ] Ishara and Ruwan are listed; **Tharindu is not** (different club)
- [ ] Open a member → their club, current reading, books read
- [ ] `/members/<poet's id>` typed directly → **404**, not a permission error

### Sessions

- [ ] `/sessions` lists both sessions
- [ ] "Demo August book night" is **free** to you
- [ ] "Demo Poetry evening" shows **LKR 1,200** — you are a guest there
- [ ] Open the poetry session → the booking panel quotes that guest fee
- [ ] Book a free session → confirmation, and it shows as booked

### Books and library

- [ ] `/books` — 13,129 books
- [ ] Search `Ishiguro` → sensible results
- [ ] Apply a category filter, go to page 2 → **filters survive paging**
- [ ] Open a book → member price, shop price struck through, "you save …"
- [ ] `/library` — 171 borrowable titles

### Videos

- [ ] `/videos/submit` — paste a normal YouTube link → "sent for review"
- [ ] `/me/videos` — listed as **Awaiting review**
- [ ] `/videos` — **not** in the public feed yet
- [ ] `/me/videos` — you can withdraw your own pending video

### Renewal and payment

- [ ] `/renew` shows your club and clubs you could join
- [ ] Pay buttons are present (**not** "contact the club")

---

## 3. Club visibility — `poet@test.pickabook.lk`

The leak test. Run it in a second browser, side by side with §2.

- [ ] `/directory` shows **nobody** from the public club
- [ ] `/sessions` — the poetry evening is **free** for you
- [ ] `/sessions` — the August book night is another club's
- [ ] `/renew` offers the public club as one you could join
- [ ] `/members/<member@'s id>` typed directly → **404**
- [ ] You cannot see the other club's videos, reading lists or points

---

## 4. Secretary — `secretary@test.pickabook.lk`

### What they may and may not reach

- [ ] `/admin` shows **Join requests, Sessions, Videos**, plus greyed-out
      Book orders and Borrow requests
- [ ] It does **not** show Members, Invites, Companies, Settings or Payments
- [ ] `/admin/settings` typed directly → bounced away
- [ ] `/admin/members` typed directly → bounced away
- [ ] `/admin/payments` typed directly → bounced away
- [ ] `/admin/companies` typed directly → bounced away

### Sessions

- [ ] `/admin/sessions/new` — create a session
- [ ] Choosing **paid** reveals the guest-fee field
- [ ] Saving a paid session with no fee is **refused**
- [ ] Edit a session → changes stick
- [ ] A past session cannot be edited into nonsense (end before start, etc.)

### Attendance — the screen used live during a session

- [ ] `/admin/sessions/…/attendance` lists your club's members
- [ ] Tick **Presented a book** + **Attended** for one person → total shows **+30**
- [ ] Save → confirmation
- [ ] Untick one, save again → the total drops accordingly
- [ ] Log in as that member → `/me/points` matches exactly
- [ ] Saving twice does **not** double their points

### Videos

- [ ] `/admin/videos` — the member's submission is queued
- [ ] Publish it → it appears in `/videos` for everyone
- [ ] Reject one **with a reason** → the submitter sees that reason on `/me/videos`
- [ ] Rejecting without a reason is refused

### Join requests

- [ ] `/admin/join-requests` lists pending applications
- [ ] Each shows the applicant's **name** (not just an email), and their club
- [ ] Approve one → it leaves the queue and the member becomes active

---

## 5. Super admin — your own account

Everything a secretary can do, plus the following.

### Join requests

- [ ] `/admin/join-requests` lists whoever is waiting — as of 2 Sep 2026 that
      is `hamdhanm30@gmail.com`, a real signup, not a fixture
- [ ] Approve them → they leave the queue
- [ ] `/admin/members` shows them **active**, with a renewal date
- [ ] Their **name** shows in the queue, not just an email (the 0017 fix)
- [ ] Reject a different applicant → they are told, and cannot reach `/feed`

### Members

- [ ] `/admin/members` — search by name and by email
- [ ] Open a member → change role to **Secretary**; it saves
- [ ] That member, on next login, sees the admin area
- [ ] Change them back to Member → the admin area disappears for them
- [ ] Add a club to a member → it appears with its own renewal date
- [ ] Suspend a member → they cannot sign in / reach `/feed`
- [ ] Un-suspend → access returns
- [ ] **Demote yourself to Member → must be REFUSED** (last super admin)

### Settings

- [ ] `/admin/settings` — set the book discount to `20`
- [ ] Reload `/books` → prices reflect 20%
- [ ] Set it back to `25`
- [ ] Change a points value → the note says it affects **future** sessions only
- [ ] Past points in `/me/points` are unchanged by that edit
- [ ] Change the membership term → new joins get the new term

### Payments

- [ ] `/admin/payments` reports **sandbox**, not "not configured"
- [ ] After §7, the test payment is listed as **success**
- [ ] "Record as paid" on a pending payment demands a **reason**
- [ ] It is marked **manual**, not success, so reconciliation can tell them apart
- [ ] The action appears in the audit log

---

## 6. Companies

The company side, end to end. Company clubs are private and must never leak.

- [ ] `/admin/companies` — add a company
- [ ] A private club is created for it **automatically**
- [ ] `/join` **signed out** does **not** offer that club
- [ ] A public-club member's `/renew` does **not** offer it either
- [ ] Paste two or three employee emails → invite rows are created
- [ ] They are listed as **unaccepted**
- [ ] Inviting an address that already has an account is refused
- [ ] Inviting the same address twice does not create a duplicate

**Accepting an invite** — never yet tested end to end:

- [ ] The invited person receives the email
- [ ] Following the link, they can set a password and sign in
- [ ] They land **active**, with no approval step (invites skip the queue)
- [ ] Their name is set from what they entered
- [ ] They are in the **company club**, and it is their primary club
- [ ] Their `/directory` shows **only colleagues**
- [ ] A public-club member's `/directory` does **not** show them
- [ ] Their `/sessions` shows the company club's sessions only

---

## 7. Payments — sandbox

No money moves; these are PayHere's own test cards.

| Card | Number | Result |
|---|---|---|
| Visa | `4916217501611292` | **Success** |
| MasterCard | `5307732125531191` | Success |
| Visa | `4024007194349121` | **Declined** |

Any name, any CVV, any future expiry.

- [ ] `/renew` → click a join/renew button
- [ ] You land on PayHere's checkout
- [ ] It shows the **right club and the right amount**
- [ ] It carries the orange **Sandbox Mode** notice — if not, STOP, you are live
- [ ] Pay with the success card → back to `/renew/result`
- [ ] The result page settles to **paid** on its own, no manual reload
- [ ] `/me` and `/feed` show the renewal date pushed out one term

**That settlement actually happened** — a payment can look fine in the browser
while nothing settled:

- [ ] `journalctl -u pab-member -f | grep -i payhere` logged nothing alarming
- [ ] `payment_events` has a row with `signature_ok = true` **and `applied = true`**
- [ ] `payments` shows the order `success`, with PayHere's `payment_id`

**Unhappy paths:**

- [ ] Start a payment, hit **Back to Site** → `/renew?cancelled=1`, membership unchanged
- [ ] Pay with the declined card → payment ends `failed`, renewal date does **not** move
- [ ] Pay a **session guest fee** → the quoted fee is what PayHere charges
- [ ] Renew early → the term is **added** to the existing expiry, not restarted

---

## 8. Things that must fail

Each one protects something real. Try them deliberately.

- [ ] Signed out, open `/me` → bounced to login
- [ ] As a member, open `/admin/settings` → bounced away
- [ ] As a member, open another club's member profile → **404**, not 403
- [ ] Submit a video with a `javascript:` URL → rejected
- [ ] Submit one with a `data:` URL → rejected
- [ ] Paste `https://youtube.com.evil.example/watch?v=abc` → rejected (lookalike)
- [ ] As the last super admin, demote yourself → refused, with a reason
- [ ] As a member, try to reach a company club's directory → nothing
- [ ] Edit the URL of someone else's profile edit page → refused

---

## When you are finished

Tell me and I will remove every test account (`@test.pickabook.lk`,
`@adm.test`, `@onb.test`, `@comp.test`, `linktest@deploycheck.test`), the demo
sessions, the demo club, and the seeded reading and video rows — so the
database is clean before real members arrive.
