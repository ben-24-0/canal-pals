"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Search, SlidersHorizontal } from "lucide-react";

import CanalModuleCard from "@/components/canal/CanalModuleCard";
import { useAllCanalsSSE } from "@/hooks/useAllCanalsSSE";
import { useFavourites } from "@/hooks/useFavourites";
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
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { readings, connected } = useAllCanalsSSE();
  const { isFavourite, toggle, favourites } = useFavourites();

  // Fetch canal list on mount
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/canals?limit=200`)
      .then((r) => r.json())
      .then((json) => setCanals(json.canals ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filter + search
  const filtered = canals.filter((c) => {
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
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

  // Favourite canals first
  const favCanals = filtered.filter((c) => isFavourite(c.canalId));
  const otherCanals = filtered.filter((c) => !isFavourite(c.canalId));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground animate-pulse">
          Loading canal modules…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Heading */}
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

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, ID, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          {["all", "irrigation", "drainage", "water-supply"].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Favourites strip */}
      {favCanals.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Favourites
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              {favourites.size}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {favCanals.map((canal) => (
              <CanalModuleCard
                key={canal.canalId}
                canal={canal}
                reading={readings.get(canal.canalId) ?? null}
                isFavourite
                onToggleFavourite={toggle}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Canals */}
      <div>
        {favCanals.length > 0 && (
          <h2 className="text-sm font-semibold text-foreground mb-3">
            All Canals
          </h2>
        )}
        {otherCanals.length === 0 && favCanals.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            {search ? "No canals match your search." : "No canals available."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {otherCanals.map((canal) => (
              <CanalModuleCard
                key={canal.canalId}
                canal={canal}
                reading={readings.get(canal.canalId) ?? null}
                isFavourite={false}
                onToggleFavourite={toggle}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
