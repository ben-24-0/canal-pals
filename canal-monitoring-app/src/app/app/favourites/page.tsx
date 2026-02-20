"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Heart } from "lucide-react";

import CanalModuleCard from "@/components/canal/CanalModuleCard";
import { useAllCanalsSSE } from "@/hooks/useAllCanalsSSE";
import { useFavourites } from "@/hooks/useFavourites";
import type { CanalInfo } from "@/types/canal";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export default function FavouritesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [canals, setCanals] = useState<CanalInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const { readings } = useAllCanalsSSE();
  const { isFavourite, toggle, favourites } = useFavourites();

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/canals?limit=200`)
      .then((r) => r.json())
      .then((json) => setCanals(json.canals ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const favCanals = canals.filter((c) => isFavourite(c.canalId));

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
          <Heart className="w-6 h-6 text-red-500 fill-red-500" />
          Favourites
        </h1>
        <p className="text-sm text-muted-foreground">
          {favourites.size} canal{favourites.size !== 1 ? "s" : ""} saved
        </p>
      </div>

      {favCanals.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <Heart className="w-8 h-8" />
          <p className="text-sm">No favourites yet.</p>
          <p className="text-xs">
            Click the heart icon on any canal card to add it here.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
