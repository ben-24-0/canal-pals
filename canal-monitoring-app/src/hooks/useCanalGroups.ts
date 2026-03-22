"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface CanalGroup {
  id: string;
  name: string;
  color: string;
  region?: string;
  canalIds: string[];
  createdAt: string;
}

const STORAGE_KEY = "canal-groups-v1";

function safeColor(input: string) {
  if (!input) return "#2563eb";
  const value = input.trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#2563eb";
}

export function useCanalGroups() {
  const [groups, setGroups] = useState<CanalGroup[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CanalGroup[];
        if (Array.isArray(parsed)) {
          setGroups(
            parsed.map((g) => ({
              ...g,
              color: safeColor(g.color),
              canalIds: Array.isArray(g.canalIds) ? g.canalIds : [],
            })),
          );
        }
      }
    } catch {
      // ignore invalid local data
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  }, [groups, loaded]);

  const createGroup = useCallback(
    (name: string, color: string, region?: string, canalIds: string[] = []) => {
      const trimmed = name.trim();
      if (trimmed.length < 2) {
        throw new Error("Group name must be at least 2 characters");
      }

      if (!Array.isArray(canalIds) || canalIds.length === 0) {
        throw new Error("Select at least one canal for the group");
      }

      const next: CanalGroup = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: trimmed,
        color: safeColor(color),
        region: region?.trim() || undefined,
        canalIds: [...new Set(canalIds)],
        createdAt: new Date().toISOString(),
      };

      setGroups((prev) => [next, ...prev]);
      return next;
    },
    [],
  );

  const deleteGroup = useCallback((groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const updateGroup = useCallback(
    (
      groupId: string,
      patch: Partial<Pick<CanalGroup, "name" | "color" | "region">>,
    ) => {
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) return g;
          return {
            ...g,
            name: patch.name?.trim() ? patch.name.trim() : g.name,
            color: patch.color ? safeColor(patch.color) : g.color,
            region: patch.region?.trim() || g.region,
          };
        }),
      );
    },
    [],
  );

  const replaceGroupCanals = useCallback((groupId: string, canalIds: string[]) => {
    if (!Array.isArray(canalIds) || canalIds.length === 0) {
      throw new Error("Select at least one canal for the group");
    }

    const uniqueCanals = [...new Set(canalIds)];

    setGroups((prev) => {
      const removedFromOthers = prev.map((g) => ({
        ...g,
        canalIds: g.id === groupId ? g.canalIds : g.canalIds.filter((id) => !uniqueCanals.includes(id)),
      }));

      return removedFromOthers.map((g) =>
        g.id === groupId ? { ...g, canalIds: uniqueCanals } : g,
      );
    });
  }, []);

  const setCanalGroup = useCallback(
    (canalId: string, groupId: string | null) => {
      setGroups((prev) => {
        const removed = prev.map((g) => ({
          ...g,
          canalIds: g.canalIds.filter((id) => id !== canalId),
        }));

        if (!groupId) return removed;

        return removed.map((g) =>
          g.id === groupId ? { ...g, canalIds: [...g.canalIds, canalId] } : g,
        );
      });
    },
    [],
  );

  const groupByCanalId = useMemo(() => {
    const map = new Map<string, CanalGroup>();
    groups.forEach((group) => {
      group.canalIds.forEach((canalId) => map.set(canalId, group));
    });
    return map;
  }, [groups]);

  const getGroupForCanal = useCallback(
    (canalId: string) => groupByCanalId.get(canalId) ?? null,
    [groupByCanalId],
  );

  return {
    groups,
    loaded,
    createGroup,
    deleteGroup,
    updateGroup,
    replaceGroupCanals,
    setCanalGroup,
    getGroupForCanal,
    groupByCanalId,
  };
}
