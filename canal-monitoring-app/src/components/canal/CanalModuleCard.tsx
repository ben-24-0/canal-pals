"use client";

import Link from "next/link";
import {
  Activity,
  BookmarkCheck,
  BookmarkPlus,
  Droplets,
  MapPin,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CanalInfo, CanalReading } from "@/types/canal";

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
  }
> = {
  FLOWING: { label: "Flowing", variant: "default" },
  LOW_FLOW: { label: "Low Flow", variant: "secondary" },
  HIGH_FLOW: { label: "High Flow", variant: "destructive" },
  STOPPED: { label: "Stopped", variant: "outline" },
  BLOCKED: { label: "Blocked", variant: "destructive" },
  ERROR: { label: "Error", variant: "destructive" },
};

interface Props {
  canal: CanalInfo;
  reading: CanalReading | null;
  isFavourite?: boolean;
  onToggleFavourite?: (canalId: string) => void;
  isAdmin?: boolean;
}

export default function CanalModuleCard({
  canal,
  reading,
  isFavourite = false,
  onToggleFavourite,
  isAdmin = false,
}: Props) {
  const status = reading?.status ?? "STOPPED";
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.STOPPED;
  const receivedTs = reading?.receivedAt ? new Date(reading.receivedAt).getTime() : NaN;
  const readingTs = reading?.timestamp ? new Date(reading.timestamp).getTime() : NaN;
  const ts = Number.isFinite(receivedTs)
    ? receivedTs
    : Number.isFinite(readingTs)
      ? readingTs
      : 0;
  const deviceOnline = Number.isFinite(ts) && ts > 0;
  const measuredAt = ts > 0 ? new Date(ts).toLocaleString() : "Waiting for reading";
  const href = isAdmin
    ? `/app/admin/canal/${canal.canalId}`
    : `/app/canal/${canal.canalId}`;

  return (
    <Card className="group relative hover:shadow-lg transition-shadow">
      {/* Pinned toggle */}
      {onToggleFavourite && (
        <button
          onClick={(e) => {
            e.preventDefault();
            onToggleFavourite(canal.canalId);
          }}
          className="absolute top-3 right-3 z-10 p-1 rounded-full hover:bg-muted"
          title={isFavourite ? "Remove from pinned" : "Pin canal"}
        >
          {isFavourite ? (
            <BookmarkCheck className="w-4 h-4 text-primary" />
          ) : (
            <BookmarkPlus className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
          )}
        </button>
      )}

      <Link href={href}>
        <CardHeader className="pb-2 pr-12">
          <div className="space-y-1.5 pr-2">
            <h3 className="font-semibold text-sm leading-tight wrap-break-word pr-4">
              {canal.name}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={deviceOnline ? "default" : "outline"}
                className="shrink-0 text-[10px]"
              >
                {deviceOnline ? "Online" : "Offline"}
              </Badge>
              <Badge variant={cfg.variant} className="shrink-0 text-[10px]">
                {cfg.label}
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {canal.canalId}
          </p>
        </CardHeader>

        <CardContent className="pt-0">
          {(reading?.height != null ||
            reading?.depth != null ||
            reading?.waterLevel != null) && (
            <div className="mb-3 rounded-md border border-blue-200/60 bg-blue-50/70 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold">
                Live Height
              </p>
              <p className="text-lg font-bold text-blue-900 leading-tight">
                {(
                  reading.height ??
                  reading.depth ??
                  Number(reading.waterLevel ?? 0)
                ).toFixed(2)}{" "}
                m
              </p>
              <p className="text-[11px] text-blue-800/90 mt-0.5">
                Measured at: {measuredAt}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            {reading?.speed != null && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Activity className="w-3 h-3" />
                <span>{reading.speed.toFixed(2)} m/s</span>
              </div>
            )}
            {reading?.flowRate != null && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Zap className="w-3 h-3" />
                <span>{reading.flowRate.toFixed(2)} m³/s</span>
              </div>
            )}
            {(reading?.height != null ||
              reading?.depth != null ||
              reading?.waterLevel != null) && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Droplets className="w-3 h-3" />
                <span>
                  {(
                    reading.height ??
                    reading.depth ??
                    Number(reading.waterLevel ?? 0)
                  ).toFixed(2)}{" "}
                  m
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 text-muted-foreground col-span-2">
              <MapPin className="w-3 h-3" />
              <span className="truncate">
                {canal.location.coordinates[1].toFixed(4)},{" "}
                {canal.location.coordinates[0].toFixed(4)}
              </span>
            </div>
          </div>

          {/* Sensor badge */}
          <div className="mt-2">
            <Badge variant="outline" className="text-[10px] capitalize">
              {canal.sensorType ?? "radar"}
            </Badge>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
