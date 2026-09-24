/**
 * Demo data for the author, publisher and external-club features.
 *
 * Creates three logins -- an author, a publisher and the admin of a club that
 * came in from outside -- with books in every state, sales behind the ones
 * that are on sale, and two club applications (one waiting, one approved).
 *
 * Idempotent: running it again wipes what it made and remakes it, so it can
 * be re-run before a demo without collecting duplicates.
 *
 * Run ON the VPS:
 *   node --env-file=.env.local scripts/showcase/04-creators-and-clubs.mjs
 */
import { chromium } from "playwright";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PW = "PickABook!2026";

if (!SB || !SVC) {
  console.error("Missing Supabase env. Run with --env-file=.env.local");
  process.exit(2);
}

const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
const api = (p, o = {}) => fetch(`${SB}${p}`, { ...o, headers: { ...h, ...(o.headers || {}) } });
const j = async (r) => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
};
const post = async (path, body, prefer = "return=representation") =>
  j(await api(path, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(body) }));
const patch = (path, body) =>
  api(path, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
const del = (path) => api(path, { method: "DELETE" });

// --- the cast --------------------------------------------------------------

const AUTHOR = {
  email: "author@test.pickabook.lk",
  first: "Ayesha",
  last: "Rajapaksa",
  penName: "Ayesha Rajapaksa",
  bio: "Writes quiet novels about families, food and the hill country. Two collections, one of them stubbornly out of print.",
};

const PUBLISHER = {
  email: "publisher@test.pickabook.lk",
  first: "Dinesh",
  last: "Kariyawasam",
  house: "Sarasavi House",
  about:
    "An independent Colombo house publishing Sri Lankan fiction, poetry and memoir in English, Sinhala and Tamil since 1998.",
  website: "https://sarasavihouse.lk",
};

const CLUB_ADMIN = {
  email: "clubadmin@test.pickabook.lk",
  first: "Dilani",
  last: "Fernando",
  club: "Galle Fort Readers",
  description:
    "Eighteen of us, meeting in a courtyard off Pedlar Street since 2019. Fiction one month, non-fiction the next.",
  city: "Galle",
  meets: "First Sunday of the month",
  members: 18,
};

const FOUNDER = {
  email: "founder@test.pickabook.lk",
  first: "Rukshan",
  last: "De Silva",
  club: "Negombo Night Readers",
  description:
    "A late-evening group for people who work shifts. We read short fiction so nobody falls behind.",
  city: "Negombo",
  meets: "Every other Thursday, 9pm",
  members: 11,
  message: "We have been meeting for two years and would like somewhere to keep our reading list.",
};

/** The books, by author. `sold` seeds real orders behind the sales figures. */
const HOUSE_AUTHORS = [
  {
    name: "Ruwan Bandara",
    bio: "Short stories set along the Kelani line. Won the Gratiaen in a year he insists was a weak field.",
    books: [
      {
        title: "The Paper Kite",
        blurb:
          "A boy, a hill above Kandy, and a kite that will not come down. Eleven stories about the small, unbudging things.",
        price: 1850,
        status: "approved",
        sold: 7,
        colour: "#1f4f82",
      },
      {
        title: "Tea Country",
        blurb:
          "A year on an estate above Hatton, told by the people who keep it running rather than the family that owns it.",
        price: 2200,
        status: "approved",
        sold: 3,
        colour: "#2f6b4f",
      },
    ],
  },
  {
    name: "Tharushi Silva",
    bio: "Poet and translator. Her second collection was written almost entirely on the 138 bus.",
    books: [
      {
        title: "Monsoon Letters",
        blurb:
          "Poems written to a sister who left, and never quite posted. Forty pages, one long argument with the weather.",
        price: 1950,
        status: "approved",
        sold: 5,
        colour: "#6b2f4f",
      },
      {
        title: "The Long Verandah",
        blurb:
          "A house in Moratuwa, four generations, and the veranda they all end up sitting on. Her first novel.",
        price: 2400,
        status: "pending",
        sold: 0,
        colour: "#8a5a1f",
      },
    ],
  },
  {
    name: "Malith Gunasekara",
    bio: "Journalist. Writes about food the way other people write about politics.",
    books: [
      {
        title: "Notes from Kandy",
        blurb: "A food diary kept over one perahera season.",
        price: 1500,
        status: "rejected",
        reason:
          "We loved it, but we already have two food memoirs on the shelf this quarter. Send it back to us in January.",
        sold: 0,
        colour: "#7a3b2f",
      },
    ],
  },
];

const AUTHOR_BOOKS = [
  {
    title: "Salt and Cinnamon",
    blurb:
      "A cook's daughter inherits a shop she does not want, in a town that has already decided what she is. Her first novel.",
    price: 1600,
    status: "approved",
    sold: 9,
    colour: "#9a4a1f",
  },
  {
    title: "The Second Monsoon",
    blurb: "The sequel, finished in lockdown and better for it.",
    price: 1750,
    status: "pending",
    sold: 0,
    colour: "#2f5f6b",
  },
];

// --- helpers ---------------------------------------------------------------

async function removeUser(email) {
  const { users = [] } = await j(await api("/auth/v1/admin/users?per_page=500"));
  for (const u of users) {
    if (u.email === email) await api(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  }
}

async function makeUser({ email, first, last }, patchProfile = {}) {
  await removeUser(email);
  const user = await j(
    await api("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password: PW, email_confirm: true }),
    }),
  );
  if (!user?.id) throw new Error(`could not create ${email}: ${JSON.stringify(user).slice(0, 200)}`);
  await patch(`/rest/v1/profiles?id=eq.${user.id}`, {
    first_name: first,
    last_name: last,
    status: "active",
    ...patchProfile,
  });
  return user.id;
}

/**
 * A plain typographic cover.
 *
 * These books do not exist, so a real cover would be a lie about someone
 * else's work. Drawn rather than downloaded for the same reason.
 */
async function drawCover(page, title, author, colour) {
  return page.evaluate(
    ([t, a, c]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 900;
      const ctx = canvas.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, 900);
      g.addColorStop(0, c);
      g.addColorStop(1, "#11131f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 600, 900);

      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(36, 36, 528, 828);

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      const words = t.split(" ");
      const lines = [];
      let line = "";
      ctx.font = "600 62px Georgia, serif";
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (ctx.measureText(next).width > 440 && line) {
          lines.push(line);
          line = w;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      lines.forEach((l, i) => ctx.fillText(l, 300, 360 + i * 74));

      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "400 30px Georgia, serif";
      ctx.fillText(a, 300, 360 + lines.length * 74 + 60);

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 20px system-ui, sans-serif";
      ctx.fillText("PICK A BOOK", 300, 812);

      return canvas.toDataURL("image/png");
    },
    [title, author, colour],
  );
}

async function uploadCover(ownerId, dataUrl, name) {
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  const key = `${ownerId}/${name}.png`;
  const res = await fetch(`${SB}/storage/v1/object/book-covers/${key}`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "image/png", "x-upsert": "true" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`cover upload failed: ${await res.text()}`);
  return key;
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// --- wipe whatever a previous run left -------------------------------------

console.log("clearing any previous demo…");
for (const name of [CLUB_ADMIN.club, FOUNDER.club]) {
  await del(`/rest/v1/club_requests?club_name=eq.${encodeURIComponent(name)}`);
  await del(`/rest/v1/clubs?name=eq.${encodeURIComponent(name)}`);
}
for (const who of [AUTHOR, PUBLISHER, CLUB_ADMIN, FOUNDER]) await removeUser(who.email);

// --- the author ------------------------------------------------------------

const superAdmin = (await j(await api("/rest/v1/profiles?role=eq.super_admin&select=id&limit=1")))[0];

const authorUserId = await makeUser(AUTHOR, { role: "author" });
const soloAuthor = (
  await post("/rest/v1/authors", {
    owner_id: authorUserId,
    name: AUTHOR.penName,
    bio: AUTHOR.bio,
    status: "approved",
    decided_at: new Date().toISOString(),
    decided_by: superAdmin?.id ?? null,
  })
)[0];
console.log("author:", AUTHOR.email);

// --- the publisher ---------------------------------------------------------

const publisherUserId = await makeUser(PUBLISHER, { role: "publisher" });
const house = (
  await post("/rest/v1/publishers", {
    owner_id: publisherUserId,
    name: PUBLISHER.house,
    about: PUBLISHER.about,
    website: PUBLISHER.website,
    status: "approved",
    decided_at: new Date().toISOString(),
    decided_by: superAdmin?.id ?? null,
  })
)[0];

const houseAuthorRows = await post(
  "/rest/v1/authors",
  HOUSE_AUTHORS.map((a) => ({
    publisher_id: house.id,
    owner_id: null,
    name: a.name,
    bio: a.bio,
    status: "approved",
    decided_at: new Date().toISOString(),
    decided_by: superAdmin?.id ?? null,
    decline_reason: null,
    photo_path: null,
  })),
);
console.log("publisher:", PUBLISHER.email, "with", houseAuthorRows.length, "authors");

// --- the books, with drawn covers -----------------------------------------

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");

const made = [];

async function addBook(book, authorRow, ownerId, publisherId) {
  const coverKey =
    book.status === "rejected"
      ? null
      : await uploadCover(
          ownerId,
          await drawCover(page, book.title, authorRow.name, book.colour),
          slugify(book.title),
        );

  const row = (
    await post("/rest/v1/author_books", {
      author_id: authorRow.id,
      publisher_id: publisherId,
      submitted_by: ownerId,
      title: book.title,
      blurb: book.blurb,
      isbn: null,
      price_lkr: book.price,
      cover_path: coverKey,
      status: book.status,
      decline_reason: book.reason ?? null,
      decided_at: book.status === "pending" ? null : new Date().toISOString(),
      decided_by: book.status === "pending" ? null : (superAdmin?.id ?? null),
    })
  )[0];
  made.push({ ...book, id: row.id, author: authorRow.name });
  return row;
}

for (const book of AUTHOR_BOOKS) await addBook(book, soloAuthor, authorUserId, null);
for (const a of HOUSE_AUTHORS) {
  const row = houseAuthorRows.find((r) => r.name === a.name);
  for (const book of a.books) await addBook(book, row, publisherUserId, house.id);
}
await browser.close();
console.log("books:", made.length);

// --- sales behind the figures ---------------------------------------------
//
// The dashboards count copies from orders the club actually filled, so demo
// sales have to be real orders rather than a number written on the book.

const buyers = await j(
  await api("/rest/v1/profiles?role=eq.member&status=eq.active&select=id,email,first_name,last_name&limit=12"),
);

let orderCount = 0;
for (const book of made.filter((b) => b.sold > 0)) {
  let left = book.sold;
  let i = 0;
  while (left > 0 && buyers.length) {
    const buyer = buyers[(i + orderCount) % buyers.length];
    const qty = Math.min(left, 1 + (i % 2));
    const total = qty * book.price;
    const daysAgo = 3 + ((i + orderCount) % 40);
    const when = new Date(Date.now() - daysAgo * 86400000).toISOString();

    const order = (
      await post("/rest/v1/book_orders", {
        member_id: buyer.id,
        status: "fulfilled",
        asking_total_lkr: total,
        agreed_total_lkr: total,
        readrise_lkr: 0,
        member_email: buyer.email,
        member_name: `${buyer.first_name} ${buyer.last_name}`.trim(),
        created_at: when,
        reviewed_at: when,
        decided_at: when,
        fulfilled_at: when,
      })
    )[0];

    await post(
      "/rest/v1/book_order_items",
      [
        {
          order_id: order.id,
          book_id: book.id,
          title: book.title,
          author: book.author,
          quantity: qty,
          asking_unit_price_lkr: book.price,
          agreed_unit_price_lkr: book.price,
        },
      ],
      "return=minimal",
    );

    left -= qty;
    i += 1;
    orderCount += 1;
  }
}
console.log("orders:", orderCount);

// --- the clubs from outside ------------------------------------------------

const founderId = await makeUser(FOUNDER, { role: "member", status: "pending" });
await post(
  "/rest/v1/club_requests",
  [
    {
      applicant_id: founderId,
      club_name: FOUNDER.club,
      description: FOUNDER.description,
      city: FOUNDER.city,
      meets: FOUNDER.meets,
      member_count: FOUNDER.members,
      message: FOUNDER.message,
      status: "pending",
    },
  ],
  "return=minimal",
);
console.log("waiting application:", FOUNDER.club, `(${FOUNDER.email})`);

// The approved one: the club exists, and its applicant runs it. Written the
// way decide_club_request writes it, so the two look identical afterwards.
const adminId = await makeUser(CLUB_ADMIN, { role: "club_admin" });
const club = (
  await post("/rest/v1/clubs", {
    name: CLUB_ADMIN.club,
    slug: slugify(CLUB_ADMIN.club),
    kind: "public",
    description: CLUB_ADMIN.description,
    is_active: true,
    is_open_join: false,
    admin_id: adminId,
  })
)[0];
await post(
  "/rest/v1/club_requests",
  [
    {
      applicant_id: adminId,
      club_name: CLUB_ADMIN.club,
      description: CLUB_ADMIN.description,
      city: CLUB_ADMIN.city,
      meets: CLUB_ADMIN.meets,
      member_count: CLUB_ADMIN.members,
      status: "approved",
      club_id: club.id,
      decided_at: new Date().toISOString(),
      decided_by: superAdmin?.id ?? null,
    },
  ],
  "return=minimal",
);
console.log("approved club:", CLUB_ADMIN.club, `(${CLUB_ADMIN.email})`);

console.log(`
Logins, all with the password ${PW}:
  ${AUTHOR.email}      author, ${AUTHOR_BOOKS.length} books
  ${PUBLISHER.email}   publisher, ${houseAuthorRows.length} authors
  ${CLUB_ADMIN.email}  club admin of ${CLUB_ADMIN.club}
  ${FOUNDER.email}     applied for ${FOUNDER.club}, still waiting
`);
