import "server-only";

import { getServerComponentSupabase } from "@/lib/supabase/serverComponentClient";
import { buildEmbedUrl } from "@/lib/sessions/video";

export type VideoStatus = "pending" | "approved" | "rejected";

export type VideoItem = {
  id: string;
  title: string;
  description: string | null;
  provider: "youtube" | "vimeo";
  externalId: string;
  /** Constructed from provider + id, never from the pasted URL. */
  embedUrl: string;
  sourceUrl: string;
  status: VideoStatus;
  reviewNote: string | null;
  createdAt: string;
  submittedBy: { id: string; firstName: string; lastName: string } | null;
  session: { id: string; title: string } | null;
};

type Raw = {
  id: string;
  title: string;
  description: string | null;
  provider: string;
  external_id: string;
  source_url: string;
  status: string;
  review_note: string | null;
  created_at: string;
  profiles: { id: string; first_name: string; last_name: string } | null;
  sessions: { id: string; title: string } | null;
};

const SELECT = `
  id, title, description, provider, external_id, source_url, status,
  review_note, created_at,
  profiles!videos_submitted_by_fkey ( id, first_name, last_name ),
  sessions ( id, title )
`;

function toItem(raw: Raw): VideoItem {
  const provider = raw.provider as "youtube" | "vimeo";
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    provider,
    externalId: raw.external_id,
    embedUrl: buildEmbedUrl(provider, raw.external_id),
    sourceUrl: raw.source_url,
    status: raw.status as VideoStatus,
    reviewNote: raw.review_note,
    createdAt: raw.created_at,
    submittedBy: raw.profiles
      ? {
          id: raw.profiles.id,
          firstName: raw.profiles.first_name,
          lastName: raw.profiles.last_name,
        }
      : null,
    session: raw.sessions ? { id: raw.sessions.id, title: raw.sessions.title } : null,
  };
}

/** The public feed. RLS already limits this to approved videos for members. */
export async function listApprovedVideos(): Promise<VideoItem[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("videos")
    .select(SELECT)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Raw[]).map(toItem);
}

/** Everything this member submitted, whatever its state. */
export async function listMyVideos(memberId: string): Promise<VideoItem[]> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("videos")
    .select(SELECT)
    .eq("submitted_by", memberId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown as Raw[]).map(toItem);
}

/** The moderation queue: pending first, then recent decisions for context. */
export async function listForModeration(): Promise<{
  pending: VideoItem[];
  recent: VideoItem[];
}> {
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase
    .from("videos")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(100);

  const all = ((data ?? []) as unknown as Raw[]).map(toItem);
  return {
    pending: all.filter((v) => v.status === "pending"),
    recent: all.filter((v) => v.status !== "pending").slice(0, 20),
  };
}
