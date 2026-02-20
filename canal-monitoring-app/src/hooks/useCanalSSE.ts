/**
 * useCanalSSE — subscribe to real-time SSE updates for a single canal.
 *
 * @param canalId  The canal to subscribe to
 * @returns        The latest CanalReading received over SSE (or null while connecting)
 *
 * Behaviour:
 *  - Opens EventSource on mount, closes on unmount.
 *  - Falls back to null (no data) if EventSource is unavailable (SSR).
 *  - EventSource reconnects automatically on network interruption.
 */

"use client";

import { useEffect, useState } from "react";
import type { CanalReading } from "@/types/canal";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export function useCanalSSE(canalId: string): {
  reading: CanalReading | null;
  connected: boolean;
} {
  const [reading, setReading] = useState<CanalReading | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !canalId) return;

    const url = `${BACKEND_URL}/api/stream/canal/${encodeURIComponent(canalId)}`;
    const es = new EventSource(url);

    es.addEventListener("reading", (e: MessageEvent) => {
      try {
        const { reading: r } = JSON.parse(e.data) as {
          canalId: string;
          reading: CanalReading;
        };
        setReading(r);
        setConnected(true);
      } catch {
        /* ignore malformed */
      }
    });

    es.onopen = () => setConnected(true);

    es.onerror = () => {
      // EventSource will auto-reconnect; just reflect disconnected state
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [canalId]);

  return { reading, connected };
}
