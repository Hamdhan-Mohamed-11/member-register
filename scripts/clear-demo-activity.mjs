/**
 * Removes what seed-demo-activity.mjs created.
 *
 * Reading items carry `notes = 'demo-seed'`. Demo sessions are the ones titled
 * "<Month> evening · <Club>" with no created_by -- a session made through the
 * app always records who made it. Attendance rows hang off those sessions with
 * ON DELETE CASCADE, so deleting the sessions takes the points with them, and
 * the triggers recompute every affected balance and badge back down.
 *
 * Wishlist entries and Nimali's borrow requests are left alone: they carry no
 * marker, and they are the sort of thing a real member would have anyway.
 *
 * Run on the VPS:
 *   node --env-file=.env.local scripts/clear-demo-activity.mjs
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) {
  console.error("Missing Supabase env.");
  process.exit(2);
}

const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

async function wipe(table, filter) {
  const res = await fetch(`${URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { ...H, Prefer: "return=representation" },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${table}: ${JSON.stringify(body)}`);
  console.log(`${table}: removed ${body.length}`);
}

await wipe("reading_items", "notes=eq.demo-seed");
await wipe("sessions", "created_by=is.null&title=like.*%20evening%20%C2%B7%20*");
