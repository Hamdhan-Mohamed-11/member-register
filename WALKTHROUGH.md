# Pick a Book — sign-off walkthrough

Go through the portal as each kind of person who will use it. This is the last
gate before real members.

**Site:** https://member.pickabook.lk
**Password for every `@test.pickabook.lk` account:** `PickABook!2026`

QA-CHECKLIST.md lists features exhaustively. **This is different on purpose**:
it follows five people through the journeys they actually take, with the real
names and numbers that are in the database right now, so you can tell at a
glance whether something is wrong. Bugs live in the joins between features —
today's worst two (every signup losing its name; a member able to rewrite the
points rules) were invisible to feature checks and obvious on a full path.

---

## The data you are testing against

Accurate as of 2 Sep 2026. If what you see differs, that itself is the finding.

**Clubs**

| Club | Fee | Term |
|---|---|---|
| Pick a Book Public Club | **LKR 4,750** (global default) | 12 months |
| Colombo Poetry Circle | **LKR 2,000** | 12 months |

**People**

| Login | Name | Role | Club | Renews |
|---|---|---|---|---|
| `member@test.pickabook.lk` | Nimali Perera | member | Pick a Book Public | **1 Mar 2028** |
| `member2@test.pickabook.lk` | Ruwan Silva | member | Pick a Book Public | 1 Mar 2027 |
| `poet@test.pickabook.lk` | Tharindu Bandara | member | **Colombo Poetry** | 1 Mar 2027 |
| `secretary@test.pickabook.lk` | Ishara Weerasinghe | **secretary** | Pick a Book Public | 1 Mar 2027 |
| `kimivibecode@gmail.com` | Hamdhan Mohamed | **super admin** | Pick a Book Public | 25 Aug 2027 |
| `applicant@test.pickabook.lk` | Sanduni Fernando | member | Pick a Book Public | 1 Sep 2027 |
| `maryam.457ad@gmail.com` | Maiza Fathima | member | **Colombo Poetry** | 1 Sep 2027 |

**Sessions**

| Title | Club | Date | Price |
|---|---|---|---|
| Demo August book night | Pick a Book Public | 17 Aug 2026 | free |
| Demo Poetry evening | **Colombo Poetry** | 4 Sep 2026 | **LKR 1,200** guest fee |

**Other:** 13,129 books · 171 borrowable · 1 video awaiting review · no pending
join requests (so §1 creates the one you approve in §6).

**Two accounts you can ignore:** `hamdhanm30@gmail.com` is stranded from the
old signup flow (confirmed, but never applied to a club — it predates the code
step). `hamdhan.dstsi@gmail.com` is an abandoned signup, unconfirmed, and
should **not** be able to log in.

Use **two browsers**, or one plus incognito. Half of this is "can A see B's
data", which is miserable to test by logging in and out.

**Reporting:** URL, account, what you expected, what happened. A screenshot
beats a description.

---

# 1. A stranger joining

Incognito window. Use a **real address you can read** that is not registered.

- [ ] `/` loads and looks right — also narrow, like a phone
- [ ] `/join` lists **exactly two** clubs: Pick a Book Public Club and Colombo
      Poetry Circle. A company club appearing here is a serious bug
- [ ] `/feed` typed directly → bounced to `/login`, `?next=/feed` preserved
- [ ] Fill in first name, last name, email, password → submit
- [ ] A password under 10 characters is refused
- [ ] The **code step** appears, naming the address you typed
- [ ] A numeric code arrives — **check spam**; a code in spam is a lost member
- [ ] A wrong code is refused clearly, and you can retry
- [ ] **Resend** sends a fresh code, and the previous one stops working
- [ ] The right code lands you on `/pending`, which explains an admin must approve
- [ ] `/feed` typed directly → still blocked

**Leave this account pending — you approve it in §6.**

Then, in the same incognito window:

- [ ] Log out, then log in with that email and password → **works** (you
      confirmed, you just are not approved yet), and lands back on `/pending`
- [ ] Try to register the same address again → "there's already an account"

**The one that matters most:** start a *second* signup with a different address,
stop at the code step, then try to log in as it.

- [ ] **Refused.** If it succeeds, Confirm email is off and anyone can register
      an address they do not own. Stop and tell me — that is serious

---

# 2. An ordinary member

Log in as `member@test.pickabook.lk` (Nimali Perera).

### Feed and profile

- [ ] `/feed` greets you as **Nimali** — a greeting with a blank name means the
      signup name bug is back
- [ ] It shows **Pick a Book Public Club** and renewal **1 Mar 2028**
- [ ] `/me/edit` — change the bio, save, reload; it stuck
- [ ] Upload a photo → it resizes and appears in the top bar and on `/me`
- [ ] Upload a non-image → refused
- [ ] Upload something over 2 MB → refused

  *Nobody has ever uploaded a photo on this system. The storage bucket is
  empty. This is genuinely untested, not a formality.*

### Reading and points

- [ ] `/me/reading` — three sections with books in them
- [ ] Add a book → appears immediately
- [ ] **Mark read** → moves to Read, with a date
- [ ] Remove a book → gone, still gone after reload
- [ ] `/me/points` — the ledger says where each point came from, and the total
      matches `/feed`

### Who they can see — the club boundary

- [ ] `/directory` lists **Ruwan Silva, Ishara Weerasinghe, Sanduni Fernando**
      and **Hamdhan Mohamed**
- [ ] It does **NOT** list **Tharindu Bandara** or **Maiza Fathima** — both are
      Colombo Poetry Circle. Either one appearing is a data leak
- [ ] Open Ruwan → his club, current reading, books read
- [ ] Open Tharindu's profile by editing the URL → **404**, not "forbidden".
      A 403 confirms he exists; a 404 tells a stranger nothing

### Sessions, books, videos

- [ ] `/sessions` — **Demo August book night** is **free** to you (your club)
- [ ] **Demo Poetry evening** quotes **LKR 1,200** — you are a guest there
- [ ] Book the free session → confirmation, and it shows as booked
- [ ] `/books` — **13,129** books; search `Ishiguro`; filter a category; go to
      page 2 → **the filter survives paging**
- [ ] Open a book → member price, shop price struck through, "you save …"
- [ ] `/library` — **171** titles
- [ ] `/videos/submit` a normal YouTube link → "sent for review"
- [ ] `/me/videos` → **Awaiting review**; `/videos` → not public yet
- [ ] You can withdraw your own pending video
- [ ] `/videos/submit` with `javascript:alert(1)` → rejected
- [ ] `/admin` → bounced back to `/feed`

---

# 3. A member of the other club

Log in as `poet@test.pickabook.lk` (Tharindu Bandara), ideally beside §2 in a
second browser. This is the mirror image, and the leak test.

- [ ] `/feed` greets **Tharindu**, club **Colombo Poetry Circle**
- [ ] `/directory` lists **Maiza Fathima** and nobody from the public club —
      no Nimali, no Ruwan, no Ishara
- [ ] `/sessions` — **Demo Poetry evening** is **free** for you
- [ ] **Demo August book night** is visibly another club's
- [ ] Nimali's profile by URL → **404**
- [ ] `/renew` offers **Pick a Book Public Club** as one you *could* join, at
      **LKR 4,750**

---

# 4. A company onboarding its staff

**Never done end to end by anyone.** The invite email only started coming from
this app on 2 Sep 2026, and the "accepted" tracking was fixed the same day.

First half as **super admin** (`kimivibecode@gmail.com`).

### Creating it

- [ ] `/admin/companies` → add a company, e.g. "Test Corp"
- [ ] A **private club is created for it automatically**
- [ ] `/join` **signed out** shows still only the two public clubs — not this one
- [ ] As `member@test.pickabook.lk`, `/renew` does **not** offer it either

### Inviting

- [ ] Paste 2–3 addresses, **one of them real and readable by you**
- [ ] Invite rows are created and listed as **still unaccepted**

  *This was broken until today — invites were marked accepted the instant they
  were sent, so the count was always zero. If it says unaccepted, the fix holds.*

- [ ] Inviting an address that already has an account is refused
- [ ] Inviting the same address twice does not duplicate it

### Accepting — incognito window

- [ ] The invite email **arrives**, from `noreply@pickabook.lk`, naming the club
- [ ] The link lets you set a password
- [ ] You land **active immediately** — invited people skip the approval queue
- [ ] `/feed` shows the **company club** as your club
- [ ] Back in the admin view, that invite now reads **accepted** and the others
      still say unaccepted

### That the company club is genuinely private

- [ ] Your `/directory` shows **only colleagues**
- [ ] As `member@test.pickabook.lk`, `/directory` does **not** show you
- [ ] The invite link cannot be used a second time

---

# 5. A secretary running a session

Log in as `secretary@test.pickabook.lk` (Ishara Weerasinghe). This is someone
using the app under pressure, in a room, with members waiting.

- [ ] `/admin` shows **Join requests, Sessions, Videos**; Book orders and
      Borrow requests greyed out
- [ ] It does **not** show Members, Invites, Companies, Settings or Payments
- [ ] Typed directly, each of `/admin/settings`, `/admin/members`,
      `/admin/payments`, `/admin/companies` → bounced away

### Sessions

- [ ] `/admin/sessions/new` — create one
- [ ] Choosing **paid** reveals the guest-fee field
- [ ] Saving a paid session with **no** fee is refused
- [ ] Edit it → changes stick

### The attendance recorder — the live screen

- [ ] `/admin/sessions/…/attendance` lists your club's members (Nimali, Ruwan,
      Sanduni, Hamdhan — **not** Tharindu or Maiza)
- [ ] Tick **Presented** + **Attended** for Ruwan → running total **+30**
- [ ] Save → confirmation
- [ ] Untick Presented, save again → total drops to **+10**
- [ ] Log in as Ruwan → `/me/points` matches exactly
- [ ] **Save the same screen twice → his points do NOT double**

### Videos and applications

- [ ] `/admin/videos` — one submission is queued
- [ ] Publish it → it appears in `/videos` for everyone
- [ ] Reject one **with a reason** → the submitter sees that reason
- [ ] Rejecting with no reason is refused
- [ ] `/admin/join-requests` shows your §1 applicant **by name**, not by email

---

# 6. Super admin

Your own account. Everything above, plus what can break the club.

### The §1 applicant

- [ ] `/admin/join-requests` shows them, **with the name they typed**
- [ ] Approve → they leave the queue
- [ ] `/admin/members` shows them **active** with a renewal date
- [ ] They can now reach `/feed`, which greets them by name

### Members

- [ ] `/admin/members` — search by name and by email
- [ ] Change Ruwan's role to **Secretary** → saves; he sees the admin area next
      login; change him back → it disappears
- [ ] Add Colombo Poetry Circle to Ruwan → appears with its own renewal date
- [ ] Suspend Ruwan → he cannot reach `/feed`; un-suspend → he can
- [ ] **Demote yourself → REFUSED**, you are the last super admin

### Settings

- [ ] `/admin/settings` — set the book discount to `20`
- [ ] `/books` prices reflect 20%; set it back to **25**
- [ ] Change a points value → the note says **future sessions only**
- [ ] Ruwan's existing `/me/points` entries are unchanged by that edit

### Payments

- [ ] `/admin/payments` reports **sandbox**
- [ ] The 2 Sep payment `MB-47FC2D3721` is listed as **success**, LKR 4,750
- [ ] "Record as paid" on a pending payment demands a **reason**
- [ ] It is marked **manual**, not success
- [ ] That action appears in the audit log

---

# 7. Payments — ✅ done 2 Sep 2026

Verified: order `MB-47FC2D3721`, LKR 4,750, PayHere id `320032649576`,
`signature_ok` and `applied` both true, membership extended 1 Mar 2027 →
1 Mar 2028.

Still worth doing the unhappy paths, as `member2@test.pickabook.lk`:

- [ ] Declined card `4024007194349121` → payment ends `failed`, and Ruwan's
      renewal stays **1 Mar 2027**
- [ ] **Back to Site** on the checkout → `/renew?cancelled=1`, nothing changed
- [ ] Pay the **Demo Poetry evening** guest fee (LKR 1,200) as a public-club
      member → the quoted fee is what PayHere charges
- [ ] Renew early → the term is **added** to the existing expiry, not restarted

Success card: `4916217501611292`, any name, any future expiry, any CVV.
**Every checkout must show the orange Sandbox notice.** If one does not, stop.

---

# 8. After sign-off

- [ ] Rotate `LEGACY_MYSQL_PASSWORD` (cPanel → MySQL Databases), update
      `/srv/apps/member-register/.env.local`, `systemctl restart pab-member`,
      confirm `/books` still loads — it was exposed in a chat transcript
- [ ] Confirm a nightly backup ran unattended:
      `tail /var/log/member-db-backup.log`
- [ ] Pull one backup copy off the VPS and keep it elsewhere
- [ ] Delete the Supabase cloud project (rollback window ends ~16 Sep 2026)
- [ ] Revoke Claude's SSH key:
      `sed -i '/claude-code@member-register/d' /root/.ssh/authorized_keys`
- [ ] Have every test account and demo row removed before real members arrive

---

## Known issues — expect these

| Thing | Status |
|---|---|
| `e2e-admin` crashes on the self-demotion edge case | Test flake; the UI control works. **It leaves `adm1/adm2/mem1@adm.test` behind on every run, and `adm2` is a super admin** — delete them after any full suite run |
| `hamdhanm30@gmail.com` stranded | Pre-dates the code step; confirmed but never applied to a club |
| `PAYHERE_MODE` is `sandbox` | Going live needs a live merchant account — a commercial step, not a code one |

## Still with no automated coverage

Where to look hardest, because nothing else is watching:

- **Company invite acceptance** (§4)
- **Photo upload** (§2) — the bucket is empty; nobody has ever uploaded one
- **Session guest-fee payment** (§7)
- **The attendance recorder's double-save** (§5) — points are money-adjacent
