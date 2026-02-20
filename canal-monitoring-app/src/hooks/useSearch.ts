"use client";

import { useState, useMemo, useCallback } from "react";
import type { CanalInfo } from "@/types/canal";

/**
 * Simple client-side search/filter hook for canal list.
 */
export function useSearch(canals: CanalInfo[]) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return canals;
    const q = query.toLowerCase();
    return canals.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.canalId.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [canals, query]);

  const reset = useCallback(() => setQuery(""), []);

  return { query, setQuery, filtered, reset };
}
