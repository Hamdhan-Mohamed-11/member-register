import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type AppTexts = {
  /** Where a borrowed book is handed over. Goes in the approval email. */
  libraryCollectAt: string;
  /** One guideline per line, as an applicant must tick them. */
  joinGuidelines: string[];
  /** The same guidelines as the admin edits them: one block of text. */
  joinGuidelinesRaw: string;
  /** The club's own wording for the borrow approval email, if they wrote it. */
  borrowEmailSubject: string;
  borrowEmailBody: string;
};

/** Splits the stored block into the lines the checklist shows. */
export function guidelineLines(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The written settings: the collection place and the join guidelines.
 *
 * Needs a session -- app_settings is readable by authenticated only. For the
 * signed-out join page use getPublicJoinGuidelines instead.
 */
export async function getAppTexts(): Promise<AppTexts> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("app_settings")
    .select("library_collect_at, join_guidelines, borrow_email_subject, borrow_email_body")
    .eq("id", 1)
    .maybeSingle();

  return {
    libraryCollectAt: data?.library_collect_at?.trim() || "the Pick a Book office",
    joinGuidelines: guidelineLines(data?.join_guidelines),
    joinGuidelinesRaw: data?.join_guidelines ?? "",
    borrowEmailSubject: data?.borrow_email_subject ?? "",
    borrowEmailBody: data?.borrow_email_body ?? "",
  };
}

/**
 * Just the guidelines, for a page nobody is signed in to.
 *
 * /join is where someone agrees to these and it is signed out, so the text
 * comes through a SECURITY DEFINER function that hands out this one column
 * rather than by opening app_settings -- fees and targets included -- to anon.
 */
export async function getPublicJoinGuidelines(): Promise<string[]> {
  const supabase = await getServerComponentSupabase();
  const { data, error } = await supabase.rpc("public_join_guidelines");
  if (error) console.error("[settings] join guidelines:", error.message);
  return guidelineLines(data);
}
