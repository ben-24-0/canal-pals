"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { KeyRound, Loader2, UserCog } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

type Role = "user" | "admin" | "superadmin";

interface AccountProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export default function AccountSettingsPage() {
  const { data: session, status, update } = useSession();
  const apiToken = session?.user?.apiToken || "";

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!apiToken) {
        throw new Error(
          "Missing API token. Sign out and sign in again to refresh your session.",
        );
      }

      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${apiToken}`);
      if (init?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const res = await fetch(`${BACKEND_URL}${path}`, {
        ...init,
        headers,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload?.message || payload?.error || `Request failed (${res.status})`,
        );
      }

      return payload;
    },
    [apiToken],
  );

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await authFetch("/api/auth/account");
      const user = (payload.user || null) as AccountProfile | null;
      if (!user) {
        throw new Error("Failed to load account profile.");
      }

      setProfile(user);
      setName(user.name || "");
      setEmail(user.email || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (status !== "authenticated" || !apiToken) {
      return;
    }

    loadAccount();
  }, [status, apiToken, loadAccount]);

  const withBusy = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    const nextName = name.trim();
    const nextEmail = email.trim().toLowerCase();

    if (nextName.length < 2 || nextName.length > 100) {
      setError("Name must be between 2 and 100 characters.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    await withBusy(async () => {
      const payload = await authFetch("/api/auth/account", {
        method: "PATCH",
        body: JSON.stringify({
          name: nextName,
          email: nextEmail,
        }),
      });

      const updated = (payload.user || null) as AccountProfile | null;
      if (updated) {
        setProfile(updated);
        setName(updated.name || "");
        setEmail(updated.email || "");
      }

      try {
        await update({
          name: nextName,
          email: nextEmail,
        });
      } catch {
        // Session refresh is best-effort; profile is already updated server-side.
      }

      setMessage("Account profile updated.");
    });
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Current, new, and confirm password are required.");
      return;
    }

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("New password must be different from current password.");
      return;
    }

    await withBusy(async () => {
      await authFetch("/api/auth/account/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    });
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading session...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="w-6 h-6 text-primary" /> Account Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile details and password.
        </p>
      </div>

      {(error || message) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
              {message}
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading account details...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="accountName">Name</Label>
                  <Input
                    id="accountName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="accountEmail">Email</Label>
                  <Input
                    id="accountEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="text-xs text-muted-foreground capitalize">
                Role: {profile?.role || session?.user?.role || "user"}
              </div>

              <Button onClick={saveProfile} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Save Profile
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <Button onClick={changePassword} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Update Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
