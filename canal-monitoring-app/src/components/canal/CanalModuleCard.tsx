"use client";

import Link from "next/link";
import { Heart, MapPin, Radio, Zap } from "lucide-react";
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
  const href = isAdmin
    ? `/app/admin/canal/${canal.canalId}`
    : `/app/canal/${canal.canalId}`;

  return (
    <Card className="group relative hover:shadow-lg transition-shadow">
      {/* Favourite toggle */}
      {onToggleFavourite && (
        <button
          onClick={(e) => {
            e.preventDefault();
            onToggleFavourite(canal.canalId);
          }}
          className="absolute top-3 right-3 z-10 p-1 rounded-full hover:bg-muted"
          title={isFavourite ? "Remove from favourites" : "Add to favourites"}
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              isFavourite
                ? "fill-red-500 text-red-500"
                : "text-muted-foreground group-hover:text-red-400"
            }`}
          />
        </button>
      )}

      <Link href={href}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate flex-1">
              {canal.name}
            </h3>
            <Badge variant={cfg.variant} className="shrink-0 text-[10px]">
              {cfg.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {canal.canalId}
          </p>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {reading?.flowRate != null && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Zap className="w-3 h-3" />
                <span>{reading.flowRate.toFixed(2)} m³/s</span>
              </div>
            )}
            {(reading?.depth != null || reading?.waterLevel != null) && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Radio className="w-3 h-3" />
                <span>
                  {(reading.depth ?? Number(reading.waterLevel ?? 0)).toFixed(
                    2,
                  )}{" "}
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
