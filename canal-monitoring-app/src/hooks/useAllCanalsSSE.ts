/**
 * useAllCanalsSSE — subscribe to real-time SSE updates for ALL canals.
 *
 * @returns  Map of canalId → latest CanalReading, updated in real-time.
 *
 * Used by the Canal Hub page to show live status dots without polling.
 */

"use client";

import { useEffect, useState } from "react";
import type { CanalReading } from "@/types/canal";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export function useAllCanalsSSE(): {
  readings: Map<string, CanalReading>;
  connected: boolean;
} {
  const [readings, setReadings] = useState<Map<string, CanalReading>>(
    new Map(),
  );
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = `${BACKEND_URL}/api/stream/canals`;
    const es = new EventSource(url);

    es.addEventListener("reading", (e: MessageEvent) => {
      try {
        const { canalId, reading } = JSON.parse(e.data) as {
          canalId: string;
          reading: CanalReading;
        };
        setReadings((prev) => {
          const next = new Map(prev);
          next.set(canalId, reading);
          return next;
        });
        setConnected(true);
      } catch {
        /* ignore */
      }
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return { readings, connected };
}
