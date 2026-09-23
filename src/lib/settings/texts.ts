import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";

export type AppTexts = {
  /** Where a borrowed book is handed over. Goes in the approval email. */
  libraryCollectAt: string;
  /** One guideline per line, as an applicant must tick them. */
  joinGuidelines: string[];
  /** The same guidelines as the admin edits them: one block of text. */
  joinGuidelinesRaw: string;
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
 * app_settings is readable by anyone signed in and by the anon key, which is
 * what lets /join -- a page for people with no account yet -- show the
 * guidelines they are about to agree to.
 */
export async function getAppTexts(): Promise<AppTexts> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("app_settings")
    .select("library_collect_at, join_guidelines")
    .eq("id", 1)
    .maybeSingle();

  return {
    libraryCollectAt: data?.library_collect_at?.trim() || "the Pick a Book office",
    joinGuidelines: guidelineLines(data?.join_guidelines),
    joinGuidelinesRaw: data?.join_guidelines ?? "",
  };
}
