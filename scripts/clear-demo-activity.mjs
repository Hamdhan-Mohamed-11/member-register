/**
 * Removes what seed-demo-activity.mjs created.
 *
 * Both tables carry `notes = 'demo-seed'`, and attendance rows hang off the
 * demo sessions with ON DELETE CASCADE, so deleting the sessions takes the
 * points with them -- the triggers then recompute every affected balance and
 * badge back down.
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

async function wipe(table) {
  const res = await fetch(`${URL}/rest/v1/${table}?notes=eq.demo-seed`, {
    method: "DELETE",
    headers: { ...H, Prefer: "return=representation" },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${table}: ${JSON.stringify(body)}`);
  console.log(`${table}: removed ${body.length}`);
}

await wipe("reading_items");
await wipe("sessions");
