/**
 * Showcase prep, part 2: Discover, Recordings, session covers, and the
 * member-side content for Nimali and Ishara.
 *
 * Media comes from ./media next to this script (copied up separately):
 *   photos/<n>.jpg   CC0 photographs from Openverse
 *   videos/<n>.mp4   Mixkit free stock clips, with <n>.jpg preview frames
 *
 * Run on the VPS:
 *   node --env-file=.env.local scripts/showcase/02-content.mjs <media dir>
 */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEDIA = process.argv[2];
if (!URL || !SVC || !MEDIA) {
  console.error("Usage: node --env-file=.env.local 02-content.mjs <media dir>");
  process.exit(2);
}

const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const JSONH = { ...H, "Content-Type": "application/json" };

async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${URL}/rest/v1${path}`, {
    method,
    headers: { ...JSONH, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path}: ${text}`);
  return data;
}
const insert = (table, rows) => rest(`/${table}`, { method: "POST", body: rows, prefer: "return=representation" });

async function upload(bucket, path, file, type) {
  const body = await readFile(file);
  const res = await fetch(`${URL}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { ...H, "Content-Type": type, "x-upsert": "true" },
    body,
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${path}: ${await res.text()}`);
  return path;
}

const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();

// --- people and places ---------------------------------------------------------
const P = {
  nimali: "01da20f9-4d76-4e1a-bcdc-358044d678d5",
  ishara: "0a28a13f-3419-45fb-9971-28d0d77c0605",
  admin: "d87f8292-aeb9-4d3a-8038-31d1bd402189",
  ruwan: "bb747577-dfa9-4510-bc51-004eca6db28a",
  sanduni: "caf36d27-60c3-4456-85bc-816918c116f9",
  diroshini: "a7fba725-962c-47fd-aeb4-e1ab01654055",
  tharindu: "e5b39d8b-b340-452f-a180-fe077043bf49",
  amna: "3c7406f2-21a9-4510-a395-b2bb41d3e8fe",
  maiza: "3f52102d-5ebf-4dab-9e00-8729002c4a4c",
  ash: "11d61b86-729c-43e0-a7d8-254de2bb5010",
};
const CLUB = {
  public: "15c7eb12-023c-4fcb-ab54-57f6d1e7e7ff",
  poetry: "477a7421-fad9-469f-884a-41ef5c3038ae",
};
const S = {
  maali: "6bcbc1c3-2bfc-4a0d-9a7e-6406e2cae6f3",
  poetryTea: "bcd2f61f-e0b0-471a-9cba-e3058047610e",
  island: "69871c2a-ccae-4395-8c7e-3a0a59757587",
  swap: "6301be7b-4da6-4500-a643-78ca0eff3189",
  gameNight: "b2347f97-7f33-4790-8e19-1dc1105a93bb",
  augustBookNight: "3f32e942-b541-4d83-bb4c-59792b2a2b93", // Pick a Book Public Club
  poetryEvening: "a2f2af65-d641-47be-8ce4-284731f42307", // Colombo Poetry Circle
  julyPublic: "83ecc7e4-08b5-475d-ab02-59cba8adf2c6",
  augustPoetry: "deb59d28-d959-4b07-98e4-cd298d68bf56",
};

// ============================================================================
// 1. Discover: clear it, then post a proper set
// ============================================================================
const oldPosts = await rest("/discover_posts?select=id,storage_path,poster_path");
if (oldPosts.length) {
  await rest(`/discover_posts?id=in.(${oldPosts.map((p) => p.id).join(",")})`, { method: "DELETE" });
  const prefixes = oldPosts.flatMap((p) => [p.storage_path, p.poster_path]).filter(Boolean);
  const res = await fetch(`${URL}/storage/v1/object/discover`, {
    method: "DELETE",
    headers: JSONH,
    body: JSON.stringify({ prefixes }),
  });
  console.log(`discover: removed ${oldPosts.length} posts, files ${res.status}`);
}

// Nothing is posted now, so anything left in these clubs' folders is an
// orphan from an earlier, interrupted run.
for (const club of Object.values(CLUB)) {
  const res = await fetch(`${URL}/storage/v1/object/list/discover`, {
    method: "POST",
    headers: JSONH,
    body: JSON.stringify({ prefix: club, limit: 1000 }),
  });
  const files = res.ok ? await res.json() : [];
  if (files.length) {
    await fetch(`${URL}/storage/v1/object/discover`, {
      method: "DELETE",
      headers: JSONH,
      body: JSON.stringify({ prefixes: files.map((f) => `${club}/${f.name}`) }),
    });
    console.log(`discover: cleared ${files.length} orphaned files in ${club}`);
  }
}

const PHOTOS = [
  // [file, width, height, club, author, session, days ago, caption, on home]
  ["60", 960, 720, CLUB.public, P.ishara, S.augustBookNight, 31,
   "Early arrivals for the August book night. The corner table by the window is ours now.", true],
  ["9", 1024, 683, CLUB.public, P.ishara, null, 24,
   "Sunday reading before our next session. Who else is halfway through Maali Almeida?", true],
  ["65", 1024, 683, CLUB.poetry, P.admin, S.augustPoetry, 29,
   "Our shared copy of Beloved, passed around the circle and marked up by six readers.", true],
  ["78", 1024, 683, CLUB.public, P.ishara, null, 18,
   "Power cut, one candle, chapter twelve. Very on-theme for a ghost story.", false],
  ["88", 1024, 690, CLUB.poetry, P.admin, null, 15,
   "A rainy-evening reading list from last month's picks, straight from the circle's notes.", false],
  ["129", 960, 640, CLUB.poetry, P.admin, S.poetryEvening, 12,
   "Presenter notes for the poetry evening: three poems, eleven pages of scribbles.", false],
  ["4", 1600, 1065, CLUB.public, P.ishara, S.swap, 5,
   "The garden table at the September Book Swap, set up before the rush.", true],
  ["148", 1024, 683, CLUB.public, P.ishara, S.swap, 4,
   "Someone left their reading glasses at the swap night. Claim them at the next session!", false],
];

const VIDEOS = [
  // [file, club, author, session, days ago, caption, on home]
  ["50726", CLUB.public, P.ishara, S.swap, 4,
   "Swap night in one shot: forty books in, forty books out.", true],
  ["50733", CLUB.public, P.ishara, null, 9,
   "A look along the club shelf before we sorted it for the borrowing library.", false],
  ["45831", CLUB.poetry, P.admin, null, 20,
   "Walking the stacks at the Colombo Public Library, where the circle meets next.", false],
];

const posts = [];
for (const [file, w, h, club, author, session, days, caption, home] of PHOTOS) {
  const path = `${club}/${randomUUID()}.jpg`;
  await upload("discover", path, `${MEDIA}/photos/${file}.jpg`, "image/jpeg");
  posts.push({
    club_id: club, session_id: session, author_id: author, kind: "photo", storage_path: path,
    poster_path: null, caption, width: w, height: h, duration_s: null,
    created_at: ago(days, 3), show_on_home: home,
  });
}
for (const [file, club, author, session, days, caption, home] of VIDEOS) {
  const stamp = randomUUID();
  const path = `${club}/${stamp}.mp4`;
  const poster = `${club}/${stamp}-poster.jpg`;
  await upload("discover", path, `${MEDIA}/videos/${file}.mp4`, "video/mp4");
  await upload("discover", poster, `${MEDIA}/videos/${file}.jpg`, "image/jpeg");
  posts.push({
    club_id: club, session_id: session, author_id: author, kind: "video", storage_path: path,
    poster_path: poster, caption, width: 1280, height: 720, duration_s: 14,
    created_at: ago(days, 1), show_on_home: home,
  });
}
const madePosts = await insert("discover_posts", posts);
console.log(`discover: posted ${madePosts.length}`);

// Likes from across both clubs, and saves for the two demo accounts.
const likers = Object.values(P).filter((id) => id !== P.admin);
const likes = [];
madePosts.forEach((post, i) => {
  const count = 3 + ((i * 5) % 6);
  for (let k = 0; k < count; k += 1) {
    likes.push({ post_id: post.id, member_id: likers[(i * 3 + k) % likers.length], liked_at: ago(Math.max(0, 3 - k / 3)) });
  }
});
const uniqueLikes = [...new Map(likes.map((l) => [`${l.post_id}|${l.member_id}`, l])).values()];
await insert("discover_likes", uniqueLikes);
await insert("discover_saves", [
  { post_id: madePosts[1].id, member_id: P.nimali },
  { post_id: madePosts[2].id, member_id: P.nimali },
  { post_id: madePosts[8].id, member_id: P.nimali },
  { post_id: madePosts[6].id, member_id: P.ishara },
  { post_id: madePosts[0].id, member_id: P.ishara },
]);
console.log(`discover: ${uniqueLikes.length} likes, 5 saves`);

// ============================================================================
// 2. Session cover pictures
// ============================================================================
const COVERS = [
  [S.maali, "126"], [S.poetryTea, "128"], [S.island, "26"], [S.swap, "0"], [S.gameNight, "24"],
];
for (const [session, file] of COVERS) {
  const path = `${session}/cover-${randomUUID()}.jpg`;
  await upload("flyers", path, `${MEDIA}/photos/${file}.jpg`, "image/jpeg");
  await rest(`/sessions?id=eq.${session}`, { method: "PATCH", body: { image_path: path } });
}
console.log(`sessions: ${COVERS.length} covers`);

// ============================================================================
// 3. Recordings
// ============================================================================
await rest("/videos?id=not.is.null", { method: "DELETE" });
const yt = (id) => ({
  provider: "youtube",
  external_id: id,
  source_url: `https://www.youtube.com/watch?v=${id}`,
});
const RECORDINGS = [
  [yt("51gvTEZkILM"), "Shehan Karunatilaka wins the Booker Prize",
   "The moment The Seven Moons of Maali Almeida won, and his speech. Watch before our October session.",
   P.ishara, S.augustBookNight, "approved", P.ishara, 21],
  [yt("D9Ihs241zeg"), "The danger of a single story",
   "Chimamanda Ngozi Adichie's talk that started our whole August conversation about who tells whose story.",
   P.amna, S.augustPoetry, "approved", P.admin, 26],
  [yt("6ibCtsHgz3Y"), "How books can open your mind",
   "Lisa Bu on how reading changed her life. Short, and a lovely one to share with new members.",
   P.nimali, S.julyPublic, "approved", P.ishara, 40],
  [yt("ZW_5Y6ekUEw"), "Kazuo Ishiguro's Nobel lecture",
   "Useful background before anyone starts Klara and the Sun or The Remains of the Day.",
   P.ruwan, null, "approved", P.ishara, 33],
  [yt("B4FRpPT_ep8"), "Michael Ondaatje on The Cat's Table",
   "Ondaatje talks about memory, voyages and writing from his own childhood.",
   P.tharindu, S.poetryEvening, "approved", P.admin, 14],
  [yt("FCt9FgCA93A"), "How to hold a good book club discussion",
   "Practical tips for anyone presenting at a session. Worth ten minutes before your turn.",
   P.nimali, null, "approved", P.ishara, 10],
  [yt("57560OKZBiY"), "Arundhati Roy at home and at work",
   "A short film on the writer of The God of Small Things.",
   P.sanduni, null, "approved", P.ishara, 7],
  [yt("_8Zgu2hrs2k"), "Toni Morrison on why she writes",
   "Morrison in her own words, for everyone who came to the Beloved evening.",
   P.maiza, S.augustPoetry, "approved", P.admin, 16],
  // Waiting for Ishara: both hang off Pick a Book Public Club sessions.
  [yt("Zq7QPnqLoUk"), "The politics of fiction",
   "Elif Shafak on how stories cross borders. I think it fits our Maali Almeida evening.",
   P.nimali, S.augustBookNight, "pending", null, 1],
  [yt("plWexCID-kA"), "Make good art",
   "Neil Gaiman's commencement speech. Played it at the swap night and people asked for the link.",
   P.diroshini, S.swap, "pending", null, 2],
];
const madeVideos = await insert(
  "videos",
  RECORDINGS.map(([src, title, description, by, session, status, reviewer, days]) => ({
    ...src, title, description, submitted_by: by, session_id: session, status,
    reviewed_by: reviewer, reviewed_at: reviewer ? ago(days - 1) : null, created_at: ago(days),
  })),
);
console.log(`recordings: ${madeVideos.length}`);

// ============================================================================
// 4. Nimali: cart, wishlist, an order waiting on her, notifications
// ============================================================================
const nimaliName = "Nimali Perera";
await rest(`/cart_items?member_id=eq.${P.nimali}`, { method: "DELETE" });
await insert("cart_items", [
  { member_id: P.nimali, book_id: 1000, title: "Norwegian Wood", author: "Haruki Murakami", quantity: 1, added_at: ago(0, 5) },
  { member_id: P.nimali, book_id: 1001, title: "The Remains of the Day", author: "Kazuo Ishiguro", quantity: 1, added_at: ago(0, 4) },
]);
await rest(`/book_wishlist?member_id=eq.${P.nimali}`, { method: "DELETE" });
await insert("book_wishlist", [
  { member_id: P.nimali, book_id: 1002, kind: "buy", title: "Sapiens", author: "Yuval Noah Harari" },
  { member_id: P.nimali, book_id: 1005, kind: "buy", title: "Never Let Me Go", author: "Kazuo Ishiguro" },
  { member_id: P.nimali, book_id: 1006, kind: "borrow", title: "A Fine Balance", author: "Rohinton Mistry" },
  { member_id: P.nimali, book_id: 1004, kind: "borrow", title: "The Kite Runner", author: "Khaled Hosseini" },
]);

const [quoted] = await insert("book_orders", [{
  member_id: P.nimali, status: "quoted", asking_total_lkr: 10950, agreed_total_lkr: 11400,
  readrise_lkr: 0, member_email: "member@test.pickabook.lk", member_name: nimaliName,
  note: "Is a hardcover available for Half of a Yellow Sun?", created_at: ago(2, 2),
  reviewed_at: ago(0, 6), reviewed_by: P.admin,
}]);
await insert("book_order_items", [
  { order_id: quoted.id, book_id: 1008, title: "Half of a Yellow Sun", author: "Chimamanda Ngozi Adichie", quantity: 1, asking_unit_price_lkr: 5950, agreed_unit_price_lkr: 6400 },
  { order_id: quoted.id, book_id: 1010, title: "Klara and the Sun", author: "Kazuo Ishiguro", quantity: 1, asking_unit_price_lkr: 5000, agreed_unit_price_lkr: 5000 },
]);
await insert("book_order_messages", [
  { order_id: quoted.id, sender_id: P.nimali, from_admin: false, body: "Is a hardcover available for Half of a Yellow Sun? Happy to pay a little more.", created_at: ago(2, 2) },
  { order_id: quoted.id, sender_id: P.admin, from_admin: true, body: "Good news, we found a hardcover. It is LKR 450 more than the paperback, so the new total is LKR 11,400. Shall we go ahead?", created_at: ago(0, 6) },
]);

const [inReview] = await insert("book_orders", [{
  member_id: P.nimali, status: "review", asking_total_lkr: 4750, readrise_lkr: 0,
  member_email: "member@test.pickabook.lk", member_name: nimaliName, created_at: ago(0, 20),
}]);
await insert("book_order_items", [
  { order_id: inReview.id, book_id: 1042, title: "Midnight's Children", author: "Salman Rushdie", quantity: 1, asking_unit_price_lkr: 4750, agreed_unit_price_lkr: null },
]);

const note = (member, kind, title, body, href, hoursAgo, read) => ({
  member_id: member, kind, title, body, href,
  created_at: ago(0, hoursAgo), read_at: read ? ago(0, Math.max(0, hoursAgo - 1)) : null,
});
await insert("notifications", [
  note(P.nimali, "order.quoted", "The club priced your order", "Half of a Yellow Sun and 1 more: the new total is LKR 11,400. Please confirm.", `/orders/${quoted.id}`, 6, false),
  note(P.nimali, "video.approved", "Your video is published", "How to hold a good book club discussion is now on Recordings.", "/videos", 30, false),
  note(P.nimali, "points.awarded", "You earned 20 points", "For presenting at the August book night.", "/me/points", 70, true),
  note(P.nimali, "video.approved", "Your video is published", "How books can open your mind is now on Recordings.", "/videos", 200, true),
  note(P.ishara, "role.changed", "You are now secretary of Pick a Book Public Club", "You can create sessions, record attendance and approve join requests for this club.", "/admin", 26, true),
  note(P.ishara, "points.awarded", "You earned 10 points", "For attending the August book night.", "/me/points", 90, true),
]);
console.log("nimali: cart 2, wishlist 4, 2 open orders; notifications added");

// ============================================================================
// 5. Ishara: a little member-side content, and two people asking to join
// ============================================================================
await insert("book_wishlist", [
  { member_id: P.ishara, book_id: 1003, kind: "buy", title: "Educated", author: "Tara Westover" },
  { member_id: P.ishara, book_id: 1009, kind: "buy", title: "The Book Thief", author: "Markus Zusak" },
]).catch(() => {});
await insert("cart_items", [
  { member_id: P.ishara, book_id: 1011, title: "Beloved", author: "Toni Morrison", quantity: 1 },
]).catch(() => {});

const APPLICANTS = [
  ["kavindi.jayasekara@example.com", "Kavindi", "Jayasekara", "I read mostly Sri Lankan fiction and would love a club that meets in Colombo. A friend from work recommended you."],
  ["dilan.wickramasinghe@example.com", "Dilan", "Wickramasinghe", "Just moved back to Colombo. Looking for people to talk about books with, and happy to present sometime."],
];
for (const [email, first, last, message] of APPLICANTS) {
  let id = (await rest(`/profiles?email=eq.${encodeURIComponent(email)}&select=id`))[0]?.id;
  if (!id) {
    const res = await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: JSONH,
      body: JSON.stringify({
        email, password: randomUUID(), email_confirm: true,
        user_metadata: { first_name: first, last_name: last },
      }),
    });
    id = (await res.json()).id;
    for (let i = 0; i < 10 && !(await rest(`/profiles?id=eq.${id}&select=id`)).length; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  await rest(`/profiles?id=eq.${id}`, { method: "PATCH", body: { first_name: first, last_name: last, status: "pending" } });
  await rest(`/club_join_requests?member_id=eq.${id}`, { method: "DELETE" });
  await insert("club_join_requests", [{ member_id: id, club_id: CLUB.public, status: "pending", message, created_at: ago(1, 3) }]);
}
console.log("ishara: 2 join requests waiting");
console.log("done");
