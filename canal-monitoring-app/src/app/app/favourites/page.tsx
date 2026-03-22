"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BookmarkCheck, FolderKanban, Trash2 } from "lucide-react";

import CanalModuleCard from "@/components/canal/CanalModuleCard";
import { useAllCanalsSSE } from "@/hooks/useAllCanalsSSE";
import { useFavourites } from "@/hooks/useFavourites";
import { useCanalGroups } from "@/hooks/useCanalGroups";
import type { CanalInfo } from "@/types/canal";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export default function FavouritesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [canals, setCanals] = useState<CanalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState("");
  const [groupRegion, setGroupRegion] = useState("");
  const [groupColor, setGroupColor] = useState("#2563eb");
  const [formError, setFormError] = useState("");

  const { readings } = useAllCanalsSSE();
  const { isPinned, toggle, pinnedIds } = useFavourites();
  const { groups, createGroup, deleteGroup, setCanalGroup, getGroupForCanal } =
    useCanalGroups();

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/canals?active=true&limit=200`)
      .then((r) => r.json())
      .then((json) => setCanals(json.canals ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const bookmarkedCanals = canals.filter((c) => isPinned(c.canalId));

  const groupedSections = groups
    .map((group) => ({
      group,
      canals: bookmarkedCanals.filter((c) =>
        group.canalIds.includes(c.canalId),
      ),
    }))
    .filter((section) => section.canals.length > 0);

  const ungroupedCanals = bookmarkedCanals.filter(
    (c) => !getGroupForCanal(c.canalId),
  );

  const handleCreateGroup = () => {
    setFormError("");
    try {
      createGroup(groupName, groupColor, groupRegion);
      setGroupName("");
      setGroupRegion("");
      setGroupColor("#2563eb");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create group",
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookmarkCheck className="w-6 h-6 text-primary" />
          Bookmarked Canals
        </h1>
        <p className="text-sm text-muted-foreground">
          {pinnedIds.size} bookmarked, {groups.length} group
          {groups.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FolderKanban className="w-4 h-4" />
          Create Group
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (e.g. Peechi Region)"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={groupRegion}
            onChange={(e) => setGroupRegion(e.target.value)}
            placeholder="Region (optional)"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <input
            type="color"
            value={groupColor}
            onChange={(e) => setGroupColor(e.target.value)}
            className="h-10 w-14 rounded-lg border bg-background p-1"
            title="Choose group color"
          />
          <button
            type="button"
            onClick={handleCreateGroup}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add Group
          </button>
        </div>
        {formError && <p className="text-xs text-destructive">{formError}</p>}
      </div>

      {bookmarkedCanals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-center">
          <BookmarkCheck className="w-8 h-8" />
          <p className="text-sm">No bookmarks yet.</p>
          <p className="text-xs">
            Pin canals from the modules page to manage them here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSections.map(({ group, canals: groupedCanals }) => (
            <section key={group.id} className="space-y-3">
              <div
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: group.color }}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <h2 className="text-sm font-semibold text-foreground">
                  {group.name}
                </h2>
                {group.region && (
                  <span className="text-xs text-muted-foreground">
                    Region: {group.region}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {groupedCanals.length} canals
                </span>
                <button
                  type="button"
                  onClick={() => deleteGroup(group.id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                  title="Delete group"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Group
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groupedCanals.map((canal) => (
                  <div key={canal.canalId} className="space-y-2">
                    <CanalModuleCard
                      canal={canal}
                      reading={readings.get(canal.canalId) ?? null}
                      isFavourite
                      onToggleFavourite={toggle}
                      isAdmin={isAdmin}
                    />
                    <select
                      value={group.id}
                      onChange={(e) =>
                        setCanalGroup(canal.canalId, e.target.value || null)
                      }
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">Ungrouped</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {ungroupedCanals.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                Ungrouped Bookmarks
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {ungroupedCanals.map((canal) => (
                  <div key={canal.canalId} className="space-y-2">
                    <CanalModuleCard
                      canal={canal}
                      reading={readings.get(canal.canalId) ?? null}
                      isFavourite
                      onToggleFavourite={toggle}
                      isAdmin={isAdmin}
                    />
                    <select
                      value=""
                      onChange={(e) =>
                        setCanalGroup(canal.canalId, e.target.value || null)
                      }
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">Ungrouped</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
