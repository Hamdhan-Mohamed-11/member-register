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
      Poetry Circle, grouped under **Public Clubs**. A company club appearing
      here is a serious bug, and so is a Kids, Teen or Special club — only
      clubs marked "anyone can apply" belong in this list
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

### Who they can see — the club-type boundary

Nimali is in Pick a Book Public Club, which sits under the **Public Clubs**
type. That type is set to `member_visibility = 'type'`, so every club under it
is one directory: she sees Colombo Poetry Circle members too. Corporate Clubs
is set to `'club'`, so a company member sees only their own company.

- [ ] `/directory` lists **Ruwan Silva, Ishara Weerasinghe, Sanduni Fernando**
      and **Hamdhan Mohamed** — her own club
- [ ] It **also** lists **Tharindu Bandara** and **Maiza Fathima** — Colombo
      Poetry Circle, the other club under Public Clubs
- [ ] It does **NOT** list anyone whose only club is **Acme Club**, **Test Corp
      Club** or **Inevitable Book CLub**. A company member appearing here is a
      data leak
- [ ] Open Ruwan → his club, current reading, books read
- [ ] Open Tharindu → opens, same as Ruwan
- [ ] Open a company-only member's profile by editing the URL → **404**, not
      "forbidden". A 403 confirms they exist; a 404 tells a stranger nothing

### Leaderboard

- [ ] `/leaderboard` opens on **This month**, with **Year** and **All time**
      beside it
- [ ] The people ranked are the same people `/directory` shows — public-wide,
      not just her club
- [ ] Her own row is marked, wherever it falls
- [ ] Equal scores share a place (two 3rds, then 5th), they do not tie-break
      arbitrarily

### Read and Rise

- [ ] `/feed` carries the Read and Rise card above "Coming up"
- [ ] Before buying anything it shows the pitch, not a row of zeroes
- [ ] After a paid order it shows **rupees given** first, and how much more
      would fund another book
- [ ] The progress bar shows the club total against the target, and is
      visible even at a fraction of a percent

### Achievements

- [ ] `/me/badges` — a card per family (books, presentations, streak, points,
      Read and Rise), each showing the badge held and the next one
- [ ] The progress bar measures from the rung already earned, not from zero
- [ ] Unearned one-off badges are shown greyed, not hidden — knowing a badge
      exists is half its point
- [ ] Mark a book read on `/me/reading` → after a reload the books count on
      `/me/badges` has gone up. Nothing in the app "awards" it; a database
      trigger does, so this proves the trigger is live
- [ ] `/me` shows the badges earned, and links to the full set
- [ ] Open Ruwan's profile → his badges show, with **no progress bars**

### Buying a book — the price conversation

This is the flow with money in it, so test it properly. Two windows: Nimali,
and a super admin.

- [ ] `/books` — each card has **Buy** and a bookmark. Tap Buy on two books
- [ ] `/cart` — both listed, with live prices and an estimated total
- [ ] The basket names the Read and Rise share of that total
- [ ] Change a quantity; remove one; the total follows
- [ ] Send the order. The button says **send to the club**, never "pay" —
      nothing is charged at this point
- [ ] `/orders` shows it as **With the club**
- [ ] As admin, `/admin/orders` — it is under **Needs a price from you**, with
      what the member was quoted on each line

**The club accepts the price as it is:**

- [ ] Press **Confirm these prices** without changing anything
- [ ] Nimali's order goes straight to **Ready to pay** — she is *not* asked to
      re-agree to a price that did not change

**The club corrects the price upward** (do this on a second order):

- [ ] Raise one line, add the message "this is the actual price, still want
      it?", and send
- [ ] Nimali sees **Needs your answer**, both totals, and two plain buttons
- [ ] **No thanks** → the order is declined, and nothing is owed. This is the
      one the club specifically asked for
- [ ] On a third order, accept the higher price → **Ready to pay**

**The rule that matters most:**

- [ ] An order still under review has **no pay button anywhere**
- [ ] Messages work both ways and each side is notified of the other's

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
- [ ] `/directory` lists **Maiza Fathima**, and **also Nimali, Ruwan and
      Ishara** — Pick a Book Public Club is under the same Public Clubs type.
      This is the mirror of §2 and must agree with it
- [ ] It lists no company members
- [ ] `/sessions` — **Demo Poetry evening** is **free** for you
- [ ] **Demo August book night** is visibly another club's
- [ ] Nimali's profile by URL → **opens** (same type). A company member's
      profile by URL → **404**
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
- [ ] Set **How many are presenting** to **1**
- [ ] Edit it → changes stick, and the presenter number survives the edit
- [ ] Clear the presenter field and save → the limit is removed, not kept

### The attendance recorder — the live screen

- [ ] `/admin/sessions/…/attendance` lists your club's members (Nimali, Ruwan,
      Sanduni, Hamdhan, and — since 0020 — Tharindu and Maiza)
- [ ] Tick **Presented** + **Attended** for Ruwan → running total **+30**
- [ ] Save → confirmation
- [ ] Untick Presented, save again → total drops to **+10**
- [ ] Log in as Ruwan → `/me/points` matches exactly
- [ ] **Save the same screen twice → his points do NOT double**

**The presenter limit** — this is the anti-farming rule, so test it properly.
The session above is set for 1 presenter.

- [ ] The header reads **1/1 presenting** once Ruwan is ticked
- [ ] **Presented** on everybody else is now greyed and unclickable, and a
      notice says why. **Attended** stays clickable for all of them
- [ ] Ruwan's own **Presented** stays clickable — you must be able to swap one
      presenter for another without clearing the row first
- [ ] Untick Ruwan → everyone's Presented comes back
- [ ] Raise the session to 2 presenters, tick two people, then try to set it
      back to 1 → **refused**, saying two are already recorded
- [ ] A session with the presenter field **blank** behaves as before, with no
      limit and nothing greyed

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

### Book orders and borrowing

- [ ] `/admin/orders` groups by what needs doing: needs a price, paid and
      ready to hand over, with the member, finished
- [ ] Marking a paid order **handed over** works; an unpaid one cannot be
- [ ] `/admin/library` — approve a borrow request, hand it over with a due
      date, then mark it returned
- [ ] An overdue book is flagged in red at the top

### Settings that are now editable

- [ ] `/admin/settings` — borrowing fee and term, and all four Read and Rise
      figures
- [ ] Change the Read and Rise share to 15 → `/cart` reflects it on a NEW
      order, and an order already priced keeps what it donated

### Clubs and club types

- [ ] `/admin/clubs` — five types, each labelled **Shared directory** or
      **Club by club**. Public Clubs must say Shared directory
- [ ] Add a type "Test Type", visibility "Only their own club" → it appears
- [ ] Add a club under it, leaving "anyone can apply" **off**
- [ ] `/join` in an incognito window → the new club is **not** offered
- [ ] Tick "anyone can apply" and save → now it **is** offered, under its type
- [ ] Open a company club → its Type control is **disabled**, and says why.
      A company club that could be moved out of Corporate would put one
      company's staff in another's directory
- [ ] Try to retire a type that still has clubs → refused, with a reason
- [ ] Invite yourself at a spare address to the new club as **Secretary** →
      the email names the club
- [ ] Delete the test club and type when you are done

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
