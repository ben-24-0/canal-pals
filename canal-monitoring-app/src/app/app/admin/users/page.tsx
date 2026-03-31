"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, UserPlus, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin" | "superadmin";
  isApproved: boolean;
  managedByAdminId: string | null;
  inheritedGroupIds: string[];
  extraGroupIds: string[];
  effectiveGroupIds: string[];
  allowedDeviceIds: string[];
  hiddenDeviceIds: string[];
  effectiveCanalIds: string[];
  createdAt: string;
}

interface LoginLogRow {
  id: string;
  userId: string;
  userName: string;
  role: "user" | "admin";
  email: string;
  loginAt: string;
  ipAddress: string;
  userAgent: string;
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const apiToken = session?.user?.apiToken || "";
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "superadmin";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [logs, setLogs] = useState<LoginLogRow[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!apiToken) {
        throw new Error("Missing API token. Sign out and sign in again.");
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

  const loadData = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [usersPayload, logsPayload] = await Promise.all([
        authFetch("/api/admin/users"),
        authFetch("/api/admin/login-logs?limit=100&page=1"),
      ]);

      setUsers((usersPayload.users || []) as ManagedUser[]);
      setLogs((logsPayload.logs || []) as LoginLogRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [authFetch, isAdmin]);

  useEffect(() => {
    if (status === "loading") return;
    loadData();
  }, [status, loadData]);

  const createUser = async () => {
    setError(null);
    setMessage(null);

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email, and password are required.");
      return;
    }

    setBusy(true);
    try {
      await authFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      setName("");
      setEmail("");
      setPassword("");
      setMessage("User created and activated successfully.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading session...
      </div>
    );
  }

  if (isSuperAdmin) {
    return (
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-base">Use Super Admin Console</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Super-admin accounts can manage all users, groups, devices, and logs from
          the Super Admin page.
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="max-w-3xl mx-auto border-amber-300 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base">Admin Access Required</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This page is available to admin users only.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> Team Users
        </h1>
        <p className="text-sm text-muted-foreground">
          Create sub-users under your department and review their login activity.
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
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Sub User
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <div className="space-y-1">
            <Label htmlFor="newUserName">Name</Label>
            <Input
              id="newUserName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="newUserEmail">Email</Label>
            <Input
              id="newUserEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@org.com"
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="newUserPassword">Temporary password</Label>
            <Input
              id="newUserPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              disabled={busy}
            />
          </div>
          <Button onClick={createUser} disabled={busy} className="h-10">
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Create
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Managed Users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users yet.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-160 text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Email</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Groups</th>
                    <th className="text-left px-3 py-2">Devices</th>
                    <th className="text-left px-3 py-2">Canals</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t">
                      <td className="px-3 py-2">{user.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{user.email}</td>
                      <td className="px-3 py-2">
                        <Badge variant={user.isApproved ? "default" : "outline"}>
                          {user.isApproved ? "Active" : "Pending"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {user.effectiveGroupIds.length}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        +{user.allowedDeviceIds.length} / -{user.hiddenDeviceIds.length}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {user.effectiveCanalIds.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User Login Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No login logs yet.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-200 text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">User</th>
                    <th className="text-left px-3 py-2">Email</th>
                    <th className="text-left px-3 py-2">IP</th>
                    <th className="text-left px-3 py-2">Client</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(log.loginAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{log.userName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{log.email}</td>
                      <td className="px-3 py-2 font-mono text-xs">{log.ipAddress || "-"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-120 break-all">
                        {log.userAgent || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
