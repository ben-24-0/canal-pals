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
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

export function useCanalSSE(canalId: string): {
  reading: CanalReading | null;
  connected: boolean;
} {
  const [reading, setReading] = useState<CanalReading | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !canalId) return;

    const url = `${BACKEND_URL}/api/stream/canal/${encodeURIComponent(canalId)}`;
    console.log(`[SSE] Connecting to: ${url}`);
    
    const es = new EventSource(url);

    es.addEventListener("reading", (e: MessageEvent) => {
      try {
        console.log(`[SSE] Received event:`, e.data);
        const { reading: r } = JSON.parse(e.data) as {
          canalId: string;
          reading: CanalReading;
        };
        console.log(`[SSE] Parsed reading:`, r);
        setReading(r);
        setConnected(true);
      } catch (err) {
        console.error(`[SSE] Parse error:`, err, e.data);
      }
    });

    es.onopen = () => {
      console.log(`[SSE] Connected to stream for canal: ${canalId}`);
      setConnected(true);
    };

    es.onerror = (err) => {
      console.error(`[SSE] Connection error:`, err);
      setConnected(false);
    };

    return () => {
      console.log(`[SSE] Closing connection for canal: ${canalId}`);
      es.close();
      setConnected(false);
    };
  }, [canalId]);

  return { reading, connected };
}
