/**
 * Fills the portal with plausible member activity, for demos and testing.
 *
 * What it creates, all tagged so it can be removed again
 * (`scripts/clear-demo-activity.mjs`):
 *
 *   - past club sessions, one every few weeks per club, notes = 'demo-seed'
 *   - attendance and presenting on those sessions, which is what gives
 *     members DIFFERENT points totals: the triggers on member_activities
 *     recompute each balance and re-award badges
 *   - reading lists: some reading, some finished, some to read,
 *     notes = 'demo-seed' (covers are filled in afterwards from Open Library
 *     by scripts/backfill-reading-covers.mjs)
 *   - a few wishlist entries, from books the catalogue already knows
 *
 * Deliberately NOT random every run: the seed is fixed, so a second run
 * produces the same shape rather than doubling everything. Existing rows are
 * left alone -- sessions are matched by their title, activities by their
 * unique (session, member, code).
 *
 * Run on the VPS:
 *   node --env-file=.env.local scripts/seed-demo-activity.mjs
 *   node --env-file=.env.local scripts/backfill-reading-covers.mjs
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) {
  console.error("Missing Supabase env.");
  process.exit(2);
}

const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const api = (path, options = {}) =>
  fetch(`${URL}/rest/v1${path}`, { ...options, headers: { ...H, ...(options.headers || {}) } });

async function read(path) {
  const res = await api(path);
  const body = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body;
}

async function insert(table, rows, { ignoreDuplicates = true } = {}) {
  if (rows.length === 0) return [];
  const res = await api(`/${table}`, {
    method: "POST",
    headers: {
      Prefer: `return=representation,resolution=${ignoreDuplicates ? "ignore-duplicates" : "merge-duplicates"}`,
    },
    body: JSON.stringify(rows),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${table}: ${JSON.stringify(body)}`);
  return body;
}

/** A small deterministic PRNG, so runs are repeatable. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260916);
const pick = (list) => list[Math.floor(rand() * list.length)];
const shuffled = (list) =>
  list
    .map((v) => [rand(), v])
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);

const BOOKS = [
  ["Norwegian Wood", "Haruki Murakami"],
  ["The Seven Moons of Maali Almeida", "Shehan Karunatilaka"],
  ["Chinaman", "Shehan Karunatilaka"],
  ["Running in the Family", "Michael Ondaatje"],
  ["Anil's Ghost", "Michael Ondaatje"],
  ["Island of a Thousand Mirrors", "Nayomi Munaweera"],
  ["A Passage North", "Anuk Arudpragasam"],
  ["Wave", "Sonali Deraniyagala"],
  ["Sapiens", "Yuval Noah Harari"],
  ["Educated", "Tara Westover"],
  ["Atomic Habits", "James Clear"],
  ["Deep Work", "Cal Newport"],
  ["Thinking, Fast and Slow", "Daniel Kahneman"],
  ["The Midnight Library", "Matt Haig"],
  ["Klara and the Sun", "Kazuo Ishiguro"],
  ["The Remains of the Day", "Kazuo Ishiguro"],
  ["Beloved", "Toni Morrison"],
  ["A Fine Balance", "Rohinton Mistry"],
  ["A Suitable Boy", "Vikram Seth"],
  ["The God of Small Things", "Arundhati Roy"],
  ["Shantaram", "Gregory David Roberts"],
  ["The Alchemist", "Paulo Coelho"],
  ["Man's Search for Meaning", "Viktor E. Frankl"],
  ["Born a Crime", "Trevor Noah"],
  ["Becoming", "Michelle Obama"],
  ["The Kite Runner", "Khaled Hosseini"],
  ["A Thousand Splendid Suns", "Khaled Hosseini"],
  ["Pachinko", "Min Jin Lee"],
  ["Circe", "Madeline Miller"],
  ["The Wind-Up Bird Chronicle", "Haruki Murakami"],
];

const VENUES = [
  "Barefoot Garden Cafe, Colombo 3",
  "The club room, Colombo 5",
  "Park Street Mews, Colombo 2",
  "Online, on Zoom",
  "Jaffna Public Library reading room",
  "Kandy City Centre, level 4",
];

const NOTE = "demo-seed";
const iso = (d) => d.toISOString();
const dayKey = (d) => d.toISOString().slice(0, 10);

async function main() {
  // --- who is here --------------------------------------------------------
  const profiles = await read(
    "/profiles?status=eq.active&select=id,first_name,last_name,email,role&order=joined_on",
  );
  const memberships = await read(
    "/club_memberships?status=eq.active&select=member_id,club_id,clubs(id,name,is_active)",
  );
  const rules = await read("/points_rules?select=code,points,is_active");
  const pointsFor = (code) => rules.find((r) => r.code === code)?.points ?? 0;

  const byClub = new Map();
  for (const m of memberships) {
    if (!m.clubs?.is_active) continue;
    if (!byClub.has(m.club_id)) byClub.set(m.club_id, { name: m.clubs.name, members: [] });
    byClub.get(m.club_id).members.push(m.member_id);
  }

  // --- borrowing for Nimali ----------------------------------------------
  const nimali = profiles.find((p) => p.email === "member@test.pickabook.lk");
  if (nimali) {
    const until = new Date();
    until.setFullYear(until.getFullYear() + 1);
    const res = await api(`/profiles?id=eq.${nimali.id}`, {
      method: "PATCH",
      body: JSON.stringify({ library_expires_on: dayKey(until) }),
    });
    console.log(`borrowing for ${nimali.email} until ${dayKey(until)}:`, res.status);
  }

  // --- past sessions, and who came ---------------------------------------
  const existing = await read("/sessions?select=id,title,held_at,host_club_id&notes=eq." + NOTE);
  const existingKeys = new Set(existing.map((s) => `${s.host_club_id}|${s.title}`));

  const now = new Date();
  let sessionsMade = 0;
  let activitiesMade = 0;

  for (const [clubId, club] of byClub) {
    // A club needs a couple of members before "attendance" means anything.
    if (club.members.length < 2) continue;

    // Six evenings, roughly monthly, back from last month.
    for (let back = 1; back <= 6; back += 1) {
      const held = new Date(now);
      held.setMonth(held.getMonth() - back);
      held.setDate(6 + Math.floor(rand() * 18));
      held.setUTCHours(13, 0, 0, 0); // 6.30pm in Sri Lanka

      const [bookTitle, bookAuthor] = pick(BOOKS);
      const month = held.toLocaleString("en-GB", { month: "long" });
      const title = `${month} evening · ${club.name}`;
      if (existingKeys.has(`${clubId}|${title}`)) continue;

      const roster = shuffled(club.members);
      const presenter = roster[0];

      const [session] = await insert(
        "sessions",
        [
          {
            host_club_id: clubId,
            title,
            book_title: bookTitle,
            book_author: bookAuthor,
            held_at: iso(held),
            location: pick(VENUES),
            status: "completed",
            pricing_kind: "free",
            presenter_member_id: presenter,
            notes: NOTE,
          },
        ],
        { ignoreDuplicates: false },
      );
      if (!session) continue;
      sessionsMade += 1;

      // Between half and all of the club turned up, and the presenter always
      // did. A couple of members drift in and out, which is what makes the
      // attendance-streak badges differ between people.
      const turnout = Math.max(2, Math.round(roster.length * (0.5 + rand() * 0.5)));
      const attended = roster.slice(0, turnout);

      const rows = attended.map((memberId) => ({
        session_id: session.id,
        member_id: memberId,
        activity_code: "attend",
        points_awarded: pointsFor("attend"),
        recorded_at: iso(held),
      }));
      rows.push({
        session_id: session.id,
        member_id: presenter,
        activity_code: "present",
        points_awarded: pointsFor("present"),
        recorded_at: iso(held),
      });

      // Now and then somebody from another club came as a guest, and once in a
      // while presented there.
      const outsiders = profiles
        .map((p) => p.id)
        .filter((id) => !club.members.includes(id));
      if (outsiders.length && rand() < 0.45) {
        const guest = pick(outsiders);
        rows.push({
          session_id: session.id,
          member_id: guest,
          activity_code: "guest_session",
          points_awarded: pointsFor("guest_session"),
          recorded_at: iso(held),
        });
        if (rand() < 0.35) {
          rows.push({
            session_id: session.id,
            member_id: guest,
            activity_code: "present_other_club",
            points_awarded: pointsFor("present_other_club"),
            recorded_at: iso(held),
          });
        }
      }

      const made = await insert("member_activities", rows);
      activitiesMade += made.length;
    }
  }

  // --- reading lists ------------------------------------------------------
  const already = await read("/reading_items?select=member_id,title");
  const has = new Set(already.map((r) => `${r.member_id}|${r.title.toLowerCase()}`));

  const readingRows = [];
  for (const person of profiles) {
    const count = 2 + Math.floor(rand() * 4); // two to five books each
    for (const [title, author] of shuffled(BOOKS).slice(0, count)) {
      if (has.has(`${person.id}|${title.toLowerCase()}`)) continue;
      has.add(`${person.id}|${title.toLowerCase()}`);

      const roll = rand();
      const status = roll < 0.45 ? "read" : roll < 0.75 ? "reading" : "want_to_read";
      const added = new Date(now);
      added.setDate(added.getDate() - Math.floor(rand() * 300));

      let dateRead = null;
      if (status === "read") {
        const finished = new Date(added);
        finished.setDate(finished.getDate() + 5 + Math.floor(rand() * 40));
        dateRead = dayKey(finished > now ? now : finished);
      }

      readingRows.push({
        member_id: person.id,
        title,
        author,
        status,
        date_read: dateRead,
        notes: NOTE,
        created_at: iso(added),
      });
    }
  }
  const reading = await insert("reading_items", readingRows);

  // --- wishlists, from books the catalogue already knows -------------------
  const known = await read("/book_order_items?select=book_id,title,author&limit=200");
  const catalogue = [...new Map(known.map((b) => [b.book_id, b])).values()];
  const wishRows = [];
  if (catalogue.length) {
    const existingWishes = await read("/book_wishlist?select=member_id,book_id,kind");
    const hasWish = new Set(existingWishes.map((w) => `${w.member_id}|${w.book_id}|${w.kind}`));
    for (const person of profiles) {
      for (const book of shuffled(catalogue).slice(0, Math.floor(rand() * 3))) {
        const kind = rand() < 0.7 ? "buy" : "borrow";
        const key = `${person.id}|${book.book_id}|${kind}`;
        if (hasWish.has(key)) continue;
        hasWish.add(key);
        wishRows.push({
          member_id: person.id,
          book_id: book.book_id,
          kind,
          title: book.title,
          author: book.author,
        });
      }
    }
  }
  const wishes = await insert("book_wishlist", wishRows);

  // --- a borrow or two for Nimali, now that she can borrow ----------------
  let borrows = [];
  if (nimali && catalogue.length) {
    const open = await read(`/borrow_requests?member_id=eq.${nimali.id}&select=book_id`);
    const taken = new Set(open.map((b) => b.book_id));
    const picks = shuffled(catalogue)
      .filter((b) => !taken.has(b.book_id))
      .slice(0, 2);
    const out = new Date(now);
    out.setDate(out.getDate() - 9);
    const due = new Date(out);
    due.setDate(due.getDate() + 21);
    const rows = picks.map((book, i) => ({
      member_id: nimali.id,
      book_id: book.book_id,
      title: book.title,
      author: book.author,
      status: i === 0 ? "issued" : "requested",
      requested_at: iso(out),
      due_on: i === 0 ? dayKey(due) : null,
    }));
    borrows = await insert("borrow_requests", rows);
  }

  // --- what came out ------------------------------------------------------
  const balances = await read(
    "/profiles?status=eq.active&select=first_name,last_name,points_balance&order=points_balance.desc&limit=8",
  );

  console.log(
    `\n${sessionsMade} sessions, ${activitiesMade} attendance/presenting rows, ` +
      `${reading.length} reading items, ${wishes.length} wishlist entries, ` +
      `${borrows.length} borrow requests.`,
  );
  console.log("\nTop points now:");
  for (const b of balances) {
    console.log(`  ${b.points_balance}\t${`${b.first_name} ${b.last_name}`.trim()}`);
  }
  console.log("\nNext: node --env-file=.env.local scripts/backfill-reading-covers.mjs");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
