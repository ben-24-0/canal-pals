"use client";

import { useState, useEffect, useCallback } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const STORAGE_KEY = "canal-pinned";

/**
 * Manages pinned (favourite) canals.
 * Persists to localStorage and optionally syncs to backend user profile.
 */
export function useFavourites(userId?: string) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Alias for backward compatibility
  const favourites = pinnedIds;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPinnedIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage whenever pinnedIds change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]));
    } catch {
      // quota exceeded — ignore
    }
  }, [pinnedIds, loaded]);

  const toggle = useCallback(
    (canalId: string) => {
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (next.has(canalId)) {
          next.delete(canalId);
        } else {
          next.add(canalId);
        }
        return next;
      });

      // Optionally sync to backend
      if (userId) {
        fetch(`${BACKEND_URL}/api/auth/favourites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, canalId }),
        }).catch(() => {});
      }
    },
    [userId],
  );

  const isPinned = useCallback(
    (canalId: string) => pinnedIds.has(canalId),
    [pinnedIds],
  );

  // Backward compat alias
  const isFavourite = isPinned;

  /**
   * Returns copies of pinned canal objects from a provided list.
   * (Filters the full list to only pinned canals.)
   */
  const getPinnedCanals = useCallback(
    <T extends { canalId: string }>(allCanals: T[]): T[] => {
      return allCanals.filter((c) => pinnedIds.has(c.canalId));
    },
    [pinnedIds],
  );

  return {
    /** Set of pinned canal IDs */
    pinnedIds,
    /** Alias for backward compat */
    favourites,
    toggle,
    isPinned,
    /** Alias for backward compat */
    isFavourite,
    /** Filter array of canals to pinned only */
    getPinnedCanals,
    loaded,
    count: pinnedIds.size,
  };
}
