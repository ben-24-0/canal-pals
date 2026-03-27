"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  BookmarkCheck,
  FolderKanban,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import CanalModuleCard from "@/components/canal/CanalModuleCard";
import { useAllCanalsSSE } from "@/hooks/useAllCanalsSSE";
import { useFavourites } from "@/hooks/useFavourites";
import { useCanalGroups } from "@/hooks/useCanalGroups";
import { Badge } from "@/components/ui/badge";
import type { CanalInfo } from "@/types/canal";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export default function CanalModulesHub() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [canals, setCanals] = useState<CanalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("irrigation");
  const [groupName, setGroupName] = useState("");
  const [groupRegion, setGroupRegion] = useState("");
  const [groupColor, setGroupColor] = useState("#2563eb");
  const [groupCanalSearch, setGroupCanalSearch] = useState("");
  const [selectedGroupCanalIds, setSelectedGroupCanalIds] = useState<Set<string>>(
    new Set(),
  );
  const [groupError, setGroupError] = useState("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [menuOpenForGroupId, setMenuOpenForGroupId] = useState<string | null>(
    null,
  );

  const { readings, connected } = useAllCanalsSSE();
  const { isPinned, toggle, pinnedIds, getPinnedCanals } = useFavourites();
  const { groups, createGroup, deleteGroup, updateGroup, replaceGroupCanals } =
    useCanalGroups();

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/canals?active=true&limit=200`)
      .then((r) => r.json())
      .then((json) => setCanals(json.canals ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = canals.filter((c) => {
    if (c.type !== "irrigation") return false;
    if (typeFilter !== "irrigation" && c.type !== typeFilter) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.canalId.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const pinnedCanals = getPinnedCanals(filtered);
  const filteredWithPinnedFirst = [...filtered].sort((a, b) => {
    const aPinned = isPinned(a.canalId);
    const bPinned = isPinned(b.canalId);

    if (aPinned === bPinned) return 0;
    return aPinned ? -1 : 1;
  });

  const groupedSections = groups
    .map((group) => ({
      group,
      canals: filtered.filter((c) => group.canalIds.includes(c.canalId)),
    }))
    .filter((section) => section.canals.length > 0);

  const resetGroupEditor = () => {
    setGroupName("");
    setGroupRegion("");
    setGroupColor("#2563eb");
    setGroupCanalSearch("");
    setSelectedGroupCanalIds(new Set());
    setEditingGroupId(null);
    setGroupError("");
    setShowAddGroup(false);
  };

  const openCreateGroupEditor = () => {
    setMenuOpenForGroupId(null);
    setGroupName("");
    setGroupRegion("");
    setGroupColor("#2563eb");
    setGroupCanalSearch("");
    setSelectedGroupCanalIds(new Set());
    setEditingGroupId(null);
    setGroupError("");
    setShowAddGroup(true);
  };

  const openEditGroupEditor = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    setMenuOpenForGroupId(null);
    setGroupName(group.name);
    setGroupRegion(group.region ?? "");
    setGroupColor(group.color);
    setGroupCanalSearch("");
    setSelectedGroupCanalIds(new Set(group.canalIds));
    setEditingGroupId(group.id);
    setGroupError("");
    setShowAddGroup(true);
  };

  const toggleGroupCanalSelection = (canalId: string) => {
    setSelectedGroupCanalIds((prev) => {
      const next = new Set(prev);
      if (next.has(canalId)) {
        next.delete(canalId);
      } else {
        next.add(canalId);
      }
      return next;
    });
  };

  const handleSaveGroup = () => {
    setGroupError("");
    try {
      const selectedIds = Array.from(selectedGroupCanalIds);

      if (selectedIds.length === 0) {
        setGroupError("Select at least one canal before saving the group.");
        return;
      }

      if (editingGroupId) {
        updateGroup(editingGroupId, {
          name: groupName,
          color: groupColor,
          region: groupRegion,
        });
        replaceGroupCanals(editingGroupId, selectedIds);
      } else {
        createGroup(groupName, groupColor, groupRegion, selectedIds);
      }

      resetGroupEditor();
    } catch (err) {
      setGroupError(
        err instanceof Error ? err.message : "Failed to save group",
      );
    }
  };

  const handleDeleteGroup = (groupId: string, groupNameValue: string) => {
    const confirmed = window.confirm(
      `Delete group \"${groupNameValue}\"? This will ungroup its canals.`,
    );
    if (!confirmed) return;

    deleteGroup(groupId);
    setMenuOpenForGroupId(null);

    if (editingGroupId === groupId) {
      resetGroupEditor();
    }
  };

  const selectableCanals = filtered.filter((canal) => {
    if (!groupCanalSearch.trim()) return true;

    const q = groupCanalSearch.toLowerCase();
    return (
      canal.name.toLowerCase().includes(q) ||
      canal.canalId.toLowerCase().includes(q) ||
      canal.type.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">
          Loading canal modules...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Canal Modules</h1>
          <p className="text-sm text-muted-foreground">
            {canals.length} modules registered
            {connected && (
              <span className="ml-2 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          {["irrigation"].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {pinnedCanals.length > 0 && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Bookmarked Modules
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              {pinnedIds.size}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {pinnedCanals.map((canal) => (
              <Link
                key={`bookmark-chip-${canal.canalId}`}
                href={isAdmin ? `/app/admin/canal/${canal.canalId}` : `/app/canal/${canal.canalId}`}
                className="rounded-full border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
              >
                {canal.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderKanban className="w-4 h-4" />
            Group Modules
          </div>
          <button
            type="button"
            onClick={() => {
              if (showAddGroup) {
                resetGroupEditor();
              } else {
                openCreateGroupEditor();
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
          >
            {showAddGroup ? (
              <>
                <X className="w-3.5 h-3.5" />
                Close
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Add Group
              </>
            )}
          </button>
        </div>

        {showAddGroup && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
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
            </div>

            <div className="rounded-lg border bg-background p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Select canals to include in this group. At least one canal is required.
                </p>
                <Badge variant="secondary" className="text-[10px]">
                  {selectedGroupCanalIds.size} selected
                </Badge>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={groupCanalSearch}
                  onChange={(e) => setGroupCanalSearch(e.target.value)}
                  placeholder="Search canals to add..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm"
                />
              </div>

              <div className="max-h-56 overflow-auto rounded-md border">
                {selectableCanals.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    No canals found for this search.
                  </p>
                ) : (
                  <div className="divide-y">
                    {selectableCanals.map((canal) => {
                      const checked = selectedGroupCanalIds.has(canal.canalId);
                      return (
                        <label
                          key={`group-select-${canal.canalId}`}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGroupCanalSelection(canal.canalId)}
                            className="h-4 w-4"
                          />
                          <span className="font-medium text-foreground">{canal.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({canal.canalId})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={resetGroupEditor}
                  className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGroup}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {editingGroupId ? "Save Changes" : "Save Group"}
                </button>
              </div>
            </div>
            {groupError && <p className="text-xs text-destructive">{groupError}</p>}
          </>
        )}
      </section>

      {groupedSections.length > 0 && (
        <section className="space-y-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <h2 className="text-sm font-semibold text-foreground">Grouped Modules</h2>
          {groupedSections.map(({ group, canals: groupedCanals }) => (
            <div key={group.id} className="space-y-3">
              <div
                className="relative flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: group.color }}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
                {group.region && (
                  <span className="text-xs text-muted-foreground">Region: {group.region}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {groupedCanals.length} modules
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMenuOpenForGroupId((prev) =>
                      prev === group.id ? null : group.id,
                    )
                  }
                  className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label={`Group actions for ${group.name}`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {menuOpenForGroupId === group.id && (
                  <div className="absolute right-2 top-10 z-10 w-36 rounded-md border bg-background shadow-md">
                    <button
                      type="button"
                      onClick={() => openEditGroupEditor(group.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit Group
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(group.id, group.name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-muted"
                    >
                      <X className="w-3.5 h-3.5" />
                      Delete Group
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groupedCanals.map((canal) => (
                  <div key={`grouped-${group.id}-${canal.canalId}`}>
                    <CanalModuleCard
                      canal={canal}
                      reading={readings.get(canal.canalId) ?? null}
                      isFavourite={isPinned(canal.canalId)}
                      onToggleFavourite={toggle}
                      isAdmin={isAdmin}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">All Modules</h2>
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            {search ? "No canals match your search." : "No canals available."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWithPinnedFirst.map((canal) => (
              <div
                key={`all-${canal.canalId}`}
                id={`module-${canal.canalId}`}
                className="space-y-1"
              >
                <CanalModuleCard
                  canal={canal}
                  reading={readings.get(canal.canalId) ?? null}
                  isFavourite={isPinned(canal.canalId)}
                  onToggleFavourite={toggle}
                  isAdmin={isAdmin}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
