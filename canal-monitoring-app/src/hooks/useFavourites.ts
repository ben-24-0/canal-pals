"use client";

import { useState, useEffect, useCallback } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const STORAGE_KEY = "canal-favourites";

/**
 * Manages favourite canals.
 * Persists to localStorage and optionally syncs to backend user profile.
 */
export function useFavourites(userId?: string) {
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setFavourites(new Set(JSON.parse(stored)));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  // Persist to localStorage whenever favourites change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...favourites]));
    } catch {
      // quota exceeded — ignore
    }
  }, [favourites, loaded]);

  const toggle = useCallback(
    (canalId: string) => {
      setFavourites((prev) => {
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

  const isFavourite = useCallback(
    (canalId: string) => favourites.has(canalId),
    [favourites],
  );

  return {
    favourites,
    toggle,
    isFavourite,
    loaded,
    count: favourites.size,
  };
}
