import { NextResponse } from "next/server";
import { getActionSupabase } from "@/lib/supabase/actionClient";
import { getSiteUrl } from "@/lib/supabase/env";

// POST-only: a GET sign-out can be triggered by any <img> or link prefetch on
// a page the user visits, logging them out unexpectedly.
export async function POST() {
  const supabase = await getActionSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", getSiteUrl()), {
    status: 303,
  });
}
