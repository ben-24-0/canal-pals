"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CanalPageRedirect() {
  const params = useParams();
  const router = useRouter();
  const canalId = String(params.canalId || "").trim();

  useEffect(() => {
    if (!canalId) return;
    router.replace(`/app/admin/canal/${canalId}`);
  }, [canalId, router]);

  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground animate-pulse">
        Opening canal dashboard...
      </p>
    </div>
  );
}
