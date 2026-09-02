# Pick a Book — sign-off walkthrough

Go through the portal as each kind of person who will actually use it, and
confirm it works. This is the last gate before real members.

**Site:** https://member.pickabook.lk
**Password for `@test.pickabook.lk` accounts:** `PickABook!2026`

QA-CHECKLIST.md lists every feature exhaustively. **This document is different
on purpose**: it follows five people through the journeys they actually take,
end to end, because bugs live in the joins between features rather than inside
them. Today's two worst bugs — every signup losing its name, and a member
being able to rewrite the points rules — were both invisible to feature-level
checks and obvious the moment someone walked a whole path.

Work through it in order. Later personas depend on earlier ones.

**How to report a problem:** the URL, which account, what you expected, what
happened. A screenshot beats a description.

---

## Before you start

- [ ] You can log into your own super admin account
      (`kimivibecode@gmail.com`) — use "Forgot password?" if needed; it works now
- [ ] You have **two browsers** open (or one plus incognito). Half of this is
      "can A see B's data", which is miserable to test by logging in and out
- [ ] You have a **real email address you can read** that is not already
      registered — you will need it for the signup and invite journeys

---

# 1. A stranger who wants to join

The public signup path. Do this in an incognito window, with a real address.

### Finding the club

- [ ] `/` loads and looks right — also narrow, like a phone
- [ ] `/join` lists **public clubs only**. Company clubs must never appear here
- [ ] `/feed` typed directly → bounced to `/login`, and `?next=/feed` survives

### Signing up

- [ ] `/join` → pick a club, fill in first and last name, email, password
- [ ] A password under 10 characters is refused
- [ ] Submit → the **code step** appears, naming the address you typed
- [ ] A numeric code **arrives** — check spam; a code in spam is a lost member
- [ ] A **wrong** code is refused clearly, and you can try again
- [ ] **Resend** is disabled briefly, then sends a fresh code
- [ ] After a resend, the **old** code no longer works
- [ ] The right code lands you on `/pending`
- [ ] `/pending` explains an admin must approve you
- [ ] `/feed` typed directly → still blocked; you are not a member yet

### The bit that was broken until 1 Sep

- [ ] Your **name**, not your email address, is what the admin sees in §4/§5

### Things that must fail

- [ ] Signing up again with the same address → "there's already an account"
- [ ] Abandon signup at the code step, then try to log in with that password →
      **refused**. If it succeeds, Confirm email is off and anyone can register
      an address they do not own. Stop and tell me — that is serious

---

# 2. An approved public member

Log in as `member@test.pickabook.lk`. This is the everyday experience.

### First impressions

- [ ] `/feed` greets you **by name**, and shows club, points and renewal date
- [ ] `/me` shows your club membership and renewal status

### Their profile

- [ ] `/me/edit` — change name and bio, save; the change sticks after a reload
- [ ] Upload a **photo** → it resizes, appears in the top bar and on `/me`
- [ ] Upload a non-image → refused
- [ ] Upload something over 2 MB → refused

  *Nobody has ever uploaded a photo on this system — the storage bucket is
  empty. This is a genuinely untested path, not a formality.*

### Reading and points

- [ ] `/me/reading` — three sections with books in each
- [ ] Add a book → appears immediately
- [ ] **Mark read** → moves to Read, with a date
- [ ] Remove a book → gone, and still gone after a reload
- [ ] `/me/points` — the ledger explains where each point came from
- [ ] The total matches what `/feed` says

### Seeing other people

- [ ] `/directory` shows **only your own club** — Ishara and Ruwan, **not
      Tharindu**
- [ ] Open a member → their club, current reading, books read
- [ ] `/members/<Tharindu's id>` typed directly → **404**, not "forbidden".
      A 403 confirms the person exists; a 404 tells a stranger nothing

### Sessions, books, videos

- [ ] `/sessions` — "Demo August book night" is **free** to you
- [ ] "Demo Poetry evening" quotes **LKR 1,200** — you are a guest there
- [ ] Book the free session → confirmation, and it shows as booked
- [ ] `/books` — 13,129 books; search `Ishiguro`; filter a category; page 2 —
      **filters survive paging**
- [ ] Open a book → member price, shop price struck through, "you save …"
- [ ] `/library` — 171 borrowable titles
- [ ] `/videos/submit` a normal YouTube link → "sent for review"
- [ ] `/me/videos` → **Awaiting review**; `/videos` → not public yet
- [ ] You can withdraw your own pending video
- [ ] `/videos/submit` with `javascript:alert(1)` → rejected
- [ ] `/admin` → bounced back to `/feed`

---

# 3. A member of a different club

Log in as `poet@test.pickabook.lk`, ideally beside §2 in another browser.
This is the leak test: clubs must not see each other.

- [ ] `/directory` shows **nobody** from the public club
- [ ] `/sessions` — the poetry evening is **free** for you
- [ ] `/sessions` — the August book night is visibly another club's
- [ ] `/members/<member@'s id>` typed directly → **404**
- [ ] You cannot see the other club's videos, reading lists or points
- [ ] `/renew` offers the public club as one you *could* join

---

# 4. A company signing up its staff

The company path, from the admin creating it to an employee getting in. **The
acceptance half has never been done end to end** — the invite email only
started coming from this app on 2 Sep 2026.

Do the first half as **super admin**.

### Creating the company

- [ ] `/admin/companies` → add a company
- [ ] A **private club is created for it automatically**
- [ ] `/join` **signed out** does **not** offer that club
- [ ] A public member's `/renew` does **not** offer it either

### Inviting employees

- [ ] Paste two or three addresses — **use one real address you can read**
- [ ] Invite rows are created, listed as **unaccepted / pending**
- [ ] Inviting an address that already has an account is refused
- [ ] Inviting the same address twice does not create a duplicate

  **Known bug — expect this one.** Invites are marked `accepted` the moment
  they are sent, before the recipient has touched anything. Cause:
  `generateLink({type:"invite"})` creates the auth user, which fires
  `on_auth_user_created`, which finds the pending invite and marks it accepted.

  It is **not** an access hole — the account has no password until the invite
  link is used, so nobody can log in early. But it means the list cannot tell
  you who has actually accepted, so treat "unaccepted" as unreliable here and
  judge acceptance by whether the person can log in. Worth fixing before you
  invite a real company; tell me when you want it done.

### Being invited — do this in an incognito window

- [ ] The invite email **arrives** at the real address
- [ ] It is from `noreply@pickabook.lk` and names the club
- [ ] Following the link lets you set a password
- [ ] You land **active immediately** — invited people skip the approval queue
- [ ] Your **name** is set from what you entered
- [ ] `/feed` shows the **company club**, and it is your primary club

### That the company club is genuinely private

- [ ] Your `/directory` shows **only colleagues**
- [ ] Back as `member@test.pickabook.lk`, `/directory` does **not** show you
- [ ] Your `/sessions` shows the company club's sessions only
- [ ] An unused invite link cannot be used twice

---

# 5. A secretary running a session

Log in as `secretary@test.pickabook.lk`. This is the person using the app
under pressure, in a room, with members waiting.

### What they may reach

- [ ] `/admin` shows **Join requests, Sessions, Videos**; Book orders and
      Borrow requests greyed out
- [ ] It does **not** show Members, Invites, Companies, Settings or Payments
- [ ] Typed directly, each of `/admin/settings`, `/admin/members`,
      `/admin/payments`, `/admin/companies` → bounced away

### Sessions

- [ ] `/admin/sessions/new` — create one
- [ ] Choosing **paid** reveals the guest-fee field
- [ ] Saving a paid session with no fee is **refused**
- [ ] Edit it → changes stick

### The attendance recorder — the live screen

- [ ] `/admin/sessions/…/attendance` lists your club's members
- [ ] Tick **Presented** + **Attended** for one person → running total **+30**
- [ ] Save → confirmation
- [ ] Untick one, save again → the total drops correctly
- [ ] As that member, `/me/points` matches exactly
- [ ] **Save twice → their points do not double**

### Videos and applications

- [ ] `/admin/videos` — publish one → it appears in `/videos` for everyone
- [ ] Reject one **with a reason** → the submitter sees that reason
- [ ] Rejecting with no reason is refused
- [ ] `/admin/join-requests` shows applicants **by name**, with their club
- [ ] Approve one → it leaves the queue and they become active

---

# 6. Super admin

Your own account. Everything above, plus the things that can break the club.

### Members

- [ ] `/admin/members` — search by name and by email
- [ ] Open someone → change role to **Secretary**; it saves
- [ ] They see the admin area on next login; change back → it disappears
- [ ] Add a club to a member → appears with its own renewal date
- [ ] Suspend a member → they cannot reach `/feed`; un-suspend → they can
- [ ] **Demote yourself → must be REFUSED**, you are the last super admin

### Settings

- [ ] `/admin/settings` — set book discount to `20`
- [ ] `/books` prices reflect 20%; set it back to `25`
- [ ] Change a points value → the note says **future sessions only**
- [ ] Past entries in `/me/points` are unchanged by that edit

### Join requests and payments

- [ ] Approve the real pending signup from §1 — **their name shows**
- [ ] `/admin/payments` reports **sandbox**, not "not configured"
- [ ] "Record as paid" demands a **reason**, and marks the payment **manual**
      rather than success
- [ ] That action appears in the audit log

---

# 7. Payments — do this one first, before the rest

Sandbox: no money moves. Cards are PayHere's own test numbers.

| Card | Number | Result |
|---|---|---|
| Visa | `4916217501611292` | **Success** |
| Visa | `4024007194349121` | **Declined** |

Watch the webhook arrive while you pay:
```bash
ssh root@162.35.112.114
journalctl -u pab-member -f | grep -i payhere
```

- [ ] `/renew` → click Join or Renew
- [ ] The checkout shows the **right club and amount**
- [ ] It carries the orange **Sandbox Mode** notice — if not, **STOP**, you are live
- [ ] Pay with the success card → you return to `/renew/result`
- [ ] The result page settles to **paid on its own**, without a reload
- [ ] `/me` and `/feed` show the renewal pushed out one term

**Then tell me** — I will confirm `payment_events` shows `applied = true` and
`payments` recorded PayHere's id. A payment that looks paid in the browser
while `applied` is false means settlement is silently broken, and that is the
single worst failure mode in this application.

- [ ] Declined card → payment ends `failed`, renewal date does **not** move
- [ ] **Back to Site** on the checkout → `/renew?cancelled=1`, nothing changed
- [ ] Pay a **session guest fee** → the quoted fee is what PayHere charges
- [ ] Renew **early** → the term is added to the existing expiry, not restarted

---

# 8. After payment is signed off

Only once §7 passes.

- [ ] Rotate `LEGACY_MYSQL_PASSWORD` (cPanel → MySQL Databases), update
      `/srv/apps/member-register/.env.local`, restart `pab-member`, and confirm
      `/books` still loads — it was exposed in a chat transcript
- [ ] Confirm a nightly backup ran unattended:
      `ls -l /srv/backups/member-db/` and `tail /var/log/member-db-backup.log`
- [ ] Pull one backup copy off the VPS and keep it somewhere else
- [ ] Keep the Supabase cloud project until roughly 16 Sep 2026 as a rollback,
      then delete it
- [ ] Revoke Claude's SSH key:
      `sed -i '/claude-code@member-register/d' /root/.ssh/authorized_keys`
- [ ] Have every `@test.pickabook.lk` and fixture account removed, plus the
      demo clubs, sessions, reading rows and videos

---

## What is genuinely unverified going in

Not a to-do list — context for where to look hardest.

| Path | Why it matters |
|---|---|
| **Company invite acceptance** (§4) | Never done end to end by anyone. The invite mail only started coming from this app on 2 Sep |
| **Photo upload** (§2) | The storage bucket is empty; nobody has uploaded one, ever |
| **PayHere settlement** (§7) | PayHere has never called the webhook for a real payment |
| **Session booking and guest fees** (§2, §7) | Priced and displayed, but never paid for |

Everything else has at least automated coverage. These four have none.
