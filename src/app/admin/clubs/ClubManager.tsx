"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Field";
import { deleteClub, deleteClubType } from "./actions";
import {
  AppointSecretaryForm,
  EditClubForm,
  EditTypeForm,
  InviteToClubForm,
  type ClubRow,
  type ClubTypeOption,
  type MemberOption,
} from "./ClubForms";

type Tab = "details" | "secretary" | "invite";

const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "secretary", label: "Secretary" },
  { id: "invite", label: "Invite" },
];

/**
 * One club in the list.
 *
 * Module scope, not inside ClubManager: a component defined during render is a
 * new component type every render, so React unmounts and remounts the whole
 * subtree instead of updating it.
 */
function ClubRowItem({
  club,
  onOpen,
}: {
  club: ClubRow;
  onOpen: (club: ClubRow) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas">
      <button
        type="button"
        onClick={() => onOpen(club)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{club.name}</span>
          {club.isOpenJoin ? <Badge tone="success">Open to apply</Badge> : null}
          {club.secretaryName ? null : <Badge tone="warning">No secretary</Badge>}
          {club.isActive ? null : <Badge tone="danger">Off</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          {club.secretaryName ? `${club.secretaryName} · ` : ""}
          {club.memberCount} member{club.memberCount === 1 ? "" : "s"}
          {club.feeLkr != null
            ? ` · LKR ${club.feeLkr.toLocaleString("en-LK")}`
            : " · default fee"}
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen(club)}
        className="press min-h-9 shrink-0 rounded-lg border border-line px-3 text-xs font-medium text-ink-muted hover:bg-surface hover:text-ink"
      >
        Manage
      </button>
    </li>
  );
}

/**
 * The clubs screen.
 *
 * The previous version nested a form inside a <details> inside a list item
 * inside another <details>, and three levels down nothing on screen told you
 * which club a field belonged to — one club's edit form and an unrelated
 * type's edit form could be open at once, stacked, with identical labels.
 *
 * So editing moved into a dialog: one thing at a time, its name in the title,
 * everything else out of reach. The list underneath is then free to be just a
 * list — scannable, with the facts that matter (type, secretary, members, open
 * to apply) visible without opening anything.
 */
export function ClubManager({
  types,
  clubs,
  members,
  untyped,
}: {
  types: ClubTypeOption[];
  clubs: ClubRow[];
  members: MemberOption[];
  untyped: ClubRow[];
}) {
  const router = useRouter();
  const [editingClub, setEditingClub] = useState<ClubRow | null>(null);
  const [editingType, setEditingType] = useState<ClubTypeOption | null>(null);
  const [deletingClub, setDeletingClub] = useState<ClubRow | null>(null);
  const [deletingType, setDeletingType] = useState<ClubTypeOption | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const takenBy: Record<string, string> = {};
  for (const c of clubs) if (c.secretaryId) takenBy[c.secretaryId] = c.name;

  function openClub(club: ClubRow) {
    setTab("details");
    setEditingClub(club);
  }

  function confirmDeleteClub() {
    if (!deletingClub) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteClub(deletingClub.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeletingClub(null);
      router.refresh();
    });
  }

  function confirmDeleteType() {
    if (!deletingType) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteClubType(deletingType.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeletingType(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-4">
        {types.map((type) => {
          const inType = clubs.filter((c) => c.typeId === type.id);
          return (
            <Card key={type.id} flush>
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg leading-tight text-ink">
                    {type.name}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    {type.memberVisibility === "type" ? (
                      <Badge tone="brand">Shared directory</Badge>
                    ) : (
                      <Badge>Club by club</Badge>
                    )}
                    {type.requiresGuardian ? (
                      <Badge tone="gold">Guardian account</Badge>
                    ) : null}
                    {type.isActive ? null : <Badge tone="danger">Retired</Badge>}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingType(type)}
                    className="press min-h-9 rounded-lg border border-line px-3 text-xs font-medium text-ink-muted hover:bg-canvas hover:text-ink"
                  >
                    Edit type
                  </button>
                  {/* Offered only when it would succeed. The RPC refuses a type
                      with clubs under it; showing the button anyway would just
                      be a trap that explains itself after the click. */}
                  {type.clubCount === 0 ? (
                    <button
                      type="button"
                      onClick={() => setDeletingType(type)}
                      className="press min-h-9 rounded-lg border border-line px-3 text-xs font-medium text-danger-600 hover:bg-danger-100"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>

              {inType.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-muted">
                  No clubs filed under this type yet.
                </p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {inType.map((club) => (
                    <ClubRowItem key={club.id} club={club} onOpen={openClub} />
                  ))}
                </ul>
              )}
            </Card>
          );
        })}

        {untyped.length ? (
          <Card tone="warning" flush>
            <div className="px-4 pt-4 pb-2">
              <h2 className="font-display text-lg leading-tight text-ink">
                Not filed under a type
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                These fall back to showing members only their own club. Open one
                and choose a type.
              </p>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {untyped.map((club) => (
                <ClubRowItem key={club.id} club={club} onOpen={openClub} />
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      {/* ---- One club, one dialog ---------------------------------------- */}
      <Modal
        open={editingClub != null}
        onClose={() => setEditingClub(null)}
        title={editingClub?.name ?? ""}
        description={
          editingClub
            ? `${editingClub.memberCount} member${editingClub.memberCount === 1 ? "" : "s"}${
                editingClub.secretaryName ? ` · ${editingClub.secretaryName}` : ""
              }`
            : undefined
        }
        size="lg"
      >
        {editingClub ? (
          <>
            <div
              role="tablist"
              aria-label="Club settings"
              className="mb-4 inline-flex rounded-full border border-line bg-canvas p-1"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`press rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "bg-brand-600 text-white"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "details" ? (
              <>
                <EditClubForm club={editingClub} types={types} />
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-sm font-medium text-ink">Delete this club</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Only possible while it has no members, sessions or payments.
                    Otherwise switch it off above.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const club = editingClub;
                      setEditingClub(null);
                      setDeletingClub(club);
                    }}
                    className="press mt-2 min-h-9 rounded-lg border border-danger-600/30 px-3 text-xs font-medium text-danger-600 hover:bg-danger-100"
                  >
                    Delete {editingClub.name}
                  </button>
                </div>
              </>
            ) : null}

            {tab === "secretary" ? (
              <AppointSecretaryForm
                club={editingClub}
                members={members}
                takenBy={takenBy}
              />
            ) : null}

            {tab === "invite" ? (
              <InviteToClubForm clubId={editingClub.id} clubName={editingClub.name} />
            ) : null}
          </>
        ) : null}
      </Modal>

      {/* ---- One type, one dialog ---------------------------------------- */}
      <Modal
        open={editingType != null}
        onClose={() => setEditingType(null)}
        title={editingType ? `Edit ${editingType.name}` : ""}
        description="How clubs under this type behave."
      >
        {editingType ? <EditTypeForm type={editingType} /> : null}
      </Modal>

      <ConfirmDialog
        open={deletingClub != null}
        onClose={() => {
          setDeletingClub(null);
          setError(null);
        }}
        onConfirm={confirmDeleteClub}
        title={`Delete ${deletingClub?.name ?? ""}?`}
        body="This cannot be undone. If the club has any history behind it, the club will say so instead of deleting."
        pending={pending}
        error={error}
      />

      <ConfirmDialog
        open={deletingType != null}
        onClose={() => {
          setDeletingType(null);
          setError(null);
        }}
        onConfirm={confirmDeleteType}
        title={`Delete ${deletingType?.name ?? ""}?`}
        body="This removes the type itself. Clubs are never deleted with it — a type with clubs under it cannot be removed at all."
        pending={pending}
        error={error}
      />

      {error && !deletingClub && !deletingType ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
    </>
  );
}
