"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

const STEPS = [
  "Canal Details",
  "Location",
  "Sensor & Manning's",
  "Review & Submit",
] as const;

type SensorType = "radar" | "ultrasonic";
type Shape = "trapezoid" | "rectangle" | "circle";
type CanalType = "irrigation" | "drainage" | "water-supply";

interface FormData {
  canalId: string;
  name: string;
  type: CanalType;
  description: string;
  longitude: string;
  latitude: string;
  sensorType: SensorType;
  shape: Shape;
  b: string;
  z: string;
  D: string;
  S: string;
  n: string;
  u: string;
  depthMax: string;
}

const DEFAULT_FORM: FormData = {
  canalId: "",
  name: "",
  type: "irrigation",
  description: "",
  longitude: "",
  latitude: "",
  sensorType: "radar",
  shape: "trapezoid",
  b: "3.0",
  z: "1.5",
  D: "",
  S: "0.0005",
  n: "0.025",
  u: "1",
  depthMax: "2.5",
};

export default function AddModulePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canProceed = () => {
    switch (step) {
      case 0:
        return form.canalId.trim().length >= 3 && form.name.trim().length >= 2;
      case 1:
        return (
          form.longitude.trim() !== "" &&
          form.latitude.trim() !== "" &&
          !isNaN(+form.longitude) &&
          !isNaN(+form.latitude)
        );
      case 2:
        return form.S.trim() !== "" && form.n.trim() !== "";
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    const body = {
      canalId: form.canalId.trim().toLowerCase(),
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim(),
      location: {
        type: "Point",
        coordinates: [parseFloat(form.longitude), parseFloat(form.latitude)],
      },
      sensorType: form.sensorType,
      manningsParams: {
        shape: form.shape,
        ...(form.shape !== "circle" && form.b ? { b: parseFloat(form.b) } : {}),
        ...(form.shape === "trapezoid" && form.z
          ? { z: parseFloat(form.z) }
          : {}),
        ...(form.shape === "circle" && form.D ? { D: parseFloat(form.D) } : {}),
        S: parseFloat(form.S),
        n: parseFloat(form.n),
        u: parseFloat(form.u) || 1,
        ...(form.depthMax ? { depthMax: parseFloat(form.depthMax) } : {}),
      },
      isActive: true,
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/canals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? j.message ?? `HTTP ${res.status}`);
      }

      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Add New Module</h1>
        <p className="text-sm text-muted-foreground">
          Register a new canal monitoring module in the system.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground border-primary"
                  : i < step
                    ? "bg-primary/10 text-primary border-primary/30 cursor-pointer"
                    : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {i < step ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="canalId">Canal ID</Label>
                <Input
                  id="canalId"
                  placeholder="e.g. peechi-canal"
                  value={form.canalId}
                  onChange={(e) => update("canalId", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier (lowercase, no spaces). Min 3 chars.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Canal Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Peechi Irrigation Canal"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2 flex-wrap">
                  {(
                    ["irrigation", "drainage", "water-supply"] as CanalType[]
                  ).map((t) => (
                    <button
                      key={t}
                      onClick={() => update("type", t)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        form.type === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Description (optional)</Label>
                <Textarea
                  id="desc"
                  placeholder="Brief description of the canal…"
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">
                Enter the GPS coordinates where the sensor module is installed.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lon">Longitude</Label>
                  <Input
                    id="lon"
                    type="number"
                    step="any"
                    placeholder="e.g. 76.2805"
                    value={form.longitude}
                    onChange={(e) => update("longitude", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitude</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    placeholder="e.g. 10.5360"
                    value={form.latitude}
                    onChange={(e) => update("latitude", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Sensor Type</Label>
                <div className="flex gap-2">
                  {(["radar", "ultrasonic"] as SensorType[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => update("sensorType", s)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                        form.sensorType === s
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cross-Section Shape</Label>
                <div className="flex gap-2">
                  {(["trapezoid", "rectangle", "circle"] as Shape[]).map(
                    (s) => (
                      <button
                        key={s}
                        onClick={() => update("shape", s)}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                          form.shape === s
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        {s}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {form.shape !== "circle" && (
                  <div className="space-y-2">
                    <Label htmlFor="b">Bottom Width b (m)</Label>
                    <Input
                      id="b"
                      type="number"
                      step="any"
                      value={form.b}
                      onChange={(e) => update("b", e.target.value)}
                    />
                  </div>
                )}
                {form.shape === "trapezoid" && (
                  <div className="space-y-2">
                    <Label htmlFor="z">Side Slope z (H:V)</Label>
                    <Input
                      id="z"
                      type="number"
                      step="any"
                      value={form.z}
                      onChange={(e) => update("z", e.target.value)}
                    />
                  </div>
                )}
                {form.shape === "circle" && (
                  <div className="space-y-2">
                    <Label htmlFor="D">Diameter D (m)</Label>
                    <Input
                      id="D"
                      type="number"
                      step="any"
                      value={form.D}
                      onChange={(e) => update("D", e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="S">Bed Slope S</Label>
                  <Input
                    id="S"
                    type="number"
                    step="any"
                    value={form.S}
                    onChange={(e) => update("S", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="n">Manning&apos;s n</Label>
                  <Input
                    id="n"
                    type="number"
                    step="any"
                    value={form.n}
                    onChange={(e) => update("n", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="u">Unit Factor u</Label>
                  <Input
                    id="u"
                    type="number"
                    step="any"
                    value={form.u}
                    onChange={(e) => update("u", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    1 for SI, 1.49 for US
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="depthMax">Max Depth (m)</Label>
                  <Input
                    id="depthMax"
                    type="number"
                    step="any"
                    value={form.depthMax}
                    onChange={(e) => update("depthMax", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <span className="text-muted-foreground">Canal ID</span>
                    <p className="font-mono">{form.canalId || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Name</span>
                    <p>{form.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Type</span>
                    <p className="capitalize">{form.type}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sensor</span>
                    <p className="capitalize">{form.sensorType}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Coordinates</span>
                    <p className="font-mono">
                      {form.latitude}, {form.longitude}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Shape</span>
                    <p className="capitalize">{form.shape}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Slope S</span>
                    <p>{form.S}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      Manning&apos;s n
                    </span>
                    <p>{form.n}</p>
                  </div>
                </div>
                {form.description && (
                  <div>
                    <span className="text-muted-foreground">Description</span>
                    <p>{form.description}</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? router.back() : setStep(step - 1))}
          disabled={submitting}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {step === 0 ? "Cancel" : "Back"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
            Next
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Create Module
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
