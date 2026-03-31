"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Cpu,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

type Role = "user" | "admin" | "superadmin";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isApproved: boolean;
  approvedAt?: string | null;
  managedByAdminId: string | null;
  managedByAdmin?: {
    id: string;
    name: string;
    email: string;
  } | null;
  directAssignedCanals: string[];
  inheritedGroupIds: string[];
  extraGroupIds: string[];
  effectiveGroupIds: string[];
  effectiveCanalIds: string[];
  groupNames: string[];
  allowedDeviceIds: string[];
  hiddenDeviceIds: string[];
}

interface CanalGroupItem {
  id: string;
  name: string;
  description: string;
  canalIds: string[];
  adminUserIds: string[];
  isActive: boolean;
}

interface DeviceItem {
  _id?: string;
  deviceId: string;
  status: "active" | "decommissioned";
  canalId?: string | null;
  decommissionReason?: string;
  decommissionedAt?: string | null;
  updatedAt?: string;
}

interface CanalOption {
  canalId: string;
  name: string;
}

interface LoginLogItem {
  id: string;
  userId: string;
  role: "user" | "admin";
  email: string;
  loginAt: string;
  ipAddress: string;
  userAgent: string;
  userName: string;
  managedByAdminId: string | null;
  managedByAdmin?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export default function SuperAdminPage() {
  const { data: session, status } = useSession();
  const currentUserId = session?.user?.id || "";
  const apiToken = session?.user?.apiToken || "";
  const isSuperAdmin = session?.user?.role === "superadmin";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [groups, setGroups] = useState<CanalGroupItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [canals, setCanals] = useState<CanalOption[]>([]);
  const [loginLogs, setLoginLogs] = useState<LoginLogItem[]>([]);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userManagedByAdminId, setUserManagedByAdminId] = useState("");
  const [userExtraGroupIds, setUserExtraGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [userAllowedDeviceIds, setUserAllowedDeviceIds] = useState<Set<string>>(
    new Set(),
  );
  const [userHiddenDeviceIds, setUserHiddenDeviceIds] = useState<Set<string>>(
    new Set(),
  );

  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [adminSelectedCanals, setAdminSelectedCanals] = useState<Set<string>>(
    new Set(),
  );

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupIsActive, setGroupIsActive] = useState(true);
  const [groupCanalIds, setGroupCanalIds] = useState<Set<string>>(new Set());
  const [groupAdminIds, setGroupAdminIds] = useState<Set<string>>(new Set());

  const [newDeviceId, setNewDeviceId] = useState("");
  const [newDeviceCanalId, setNewDeviceCanalId] = useState("");
  const [deviceAssignDrafts, setDeviceAssignDrafts] = useState<
    Record<string, string>
  >({});

  const admins = useMemo(
    () => users.filter((user) => user.role === "admin"),
    [users],
  );

  const selectedAdmin = useMemo(
    () => admins.find((admin) => admin.id === selectedAdminId) || null,
    [admins, selectedAdminId],
  );

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  );

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        usersPayload,
        groupsPayload,
        devicesPayload,
        canalsPayload,
        logsPayload,
      ] = await Promise.all([
        authFetch("/api/super-admin/users"),
        authFetch("/api/super-admin/groups"),
        authFetch("/api/super-admin/devices"),
        fetch(`${BACKEND_URL}/api/canals?active=true&limit=500`).then((res) =>
          res.json(),
        ),
        authFetch("/api/super-admin/login-logs?limit=100&page=1"),
      ]);

      const nextUsers = (usersPayload.users || []) as ManagedUser[];
      const nextGroups = (groupsPayload.groups || []) as CanalGroupItem[];
      const nextDevices = (devicesPayload.devices || []) as DeviceItem[];
      const nextLogs = (logsPayload.logs || []) as LoginLogItem[];
      const nextCanals = ((canalsPayload.canals || []) as CanalOption[])
        .map((canal) => ({ canalId: canal.canalId, name: canal.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setUsers(nextUsers);
      setGroups(nextGroups);
      setDevices(nextDevices);
      setCanals(nextCanals);
      setLoginLogs(nextLogs);

      const draftMap: Record<string, string> = {};
      for (const device of nextDevices) {
        draftMap[device.deviceId] = device.canalId || "";
      }
      setDeviceAssignDrafts(draftMap);

      const firstAdmin = nextUsers.find((u) => u.role === "admin");
      const firstUser = nextUsers.find((u) => u.role === "user");
      setSelectedAdminId((prev) => {
        if (prev && nextUsers.some((u) => u.id === prev && u.role === "admin")) {
          return prev;
        }
        return firstAdmin?.id || "";
      });
      setSelectedUserId((prev) => {
        if (prev && nextUsers.some((u) => u.id === prev && u.role === "user")) {
          return prev;
        }
        return firstUser?.id || "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (!isSuperAdmin || !apiToken) {
      setLoading(false);
      return;
    }

    loadData();
  }, [isSuperAdmin, apiToken, loadData]);

  useEffect(() => {
    if (!selectedAdmin) {
      setAdminSelectedCanals(new Set());
      return;
    }

    setAdminSelectedCanals(new Set(selectedAdmin.directAssignedCanals || []));
  }, [selectedAdmin]);

  useEffect(() => {
    if (!selectedUser) {
      setUserManagedByAdminId("");
      setUserExtraGroupIds(new Set());
      setUserAllowedDeviceIds(new Set());
      setUserHiddenDeviceIds(new Set());
      return;
    }

    setUserManagedByAdminId(selectedUser.managedByAdminId || "");
    setUserExtraGroupIds(new Set(selectedUser.extraGroupIds || []));
    setUserAllowedDeviceIds(new Set(selectedUser.allowedDeviceIds || []));
    setUserHiddenDeviceIds(new Set(selectedUser.hiddenDeviceIds || []));
  }, [selectedUser]);

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

  const updateRole = async (
    user: ManagedUser,
    nextRole: Role,
    managedByAdminId?: string | null,
  ) => {
    await withBusy(async () => {
      await authFetch(`/api/super-admin/users/${user.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({
          role: nextRole,
          ...(managedByAdminId !== undefined
            ? { managedByAdminId: managedByAdminId || null }
            : {}),
        }),
      });
      setMessage(`Updated ${user.email}.`);
      await loadData();
    });
  };

  const deleteUser = async (user: ManagedUser) => {
    const confirmed = window.confirm(
      `Delete user ${user.email}? This action cannot be undone.`,
    );
    if (!confirmed) return;

    await withBusy(async () => {
      await authFetch(`/api/super-admin/users/${user.id}`, {
        method: "DELETE",
      });
      setMessage(`Deleted ${user.email}.`);
      await loadData();
    });
  };

  const toggleAdminCanal = (canalId: string) => {
    setAdminSelectedCanals((prev) => {
      const next = new Set(prev);
      if (next.has(canalId)) next.delete(canalId);
      else next.add(canalId);
      return next;
    });
  };

  const saveAdminCanals = async () => {
    if (!selectedAdminId) return;

    await withBusy(async () => {
      await authFetch(`/api/super-admin/users/${selectedAdminId}/canals`, {
        method: "PUT",
        body: JSON.stringify({ canalIds: uniqueSorted(adminSelectedCanals) }),
      });
      setMessage("Direct canal assignments updated.");
      await loadData();
    });
  };

  const toggleUserExtraGroup = (groupId: string) => {
    setUserExtraGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleAllowedDevice = (deviceId: string) => {
    setUserAllowedDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });

    setUserHiddenDeviceIds((prev) => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  };

  const toggleHiddenDevice = (deviceId: string) => {
    setUserHiddenDeviceIds((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });

    setUserAllowedDeviceIds((prev) => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  };

  const saveUserAccess = async () => {
    if (!selectedUser) return;

    await withBusy(async () => {
      await authFetch(`/api/super-admin/users/${selectedUser.id}/access`, {
        method: "PATCH",
        body: JSON.stringify({
          managedByAdminId: userManagedByAdminId || null,
          extraGroupIds: uniqueSorted(userExtraGroupIds),
          allowedDeviceIds: uniqueSorted(userAllowedDeviceIds),
          hiddenDeviceIds: uniqueSorted(userHiddenDeviceIds),
        }),
      });

      setMessage(`Updated access for ${selectedUser.email}.`);
      await loadData();
    });
  };

  const approvePendingUser = async (user: ManagedUser) => {
    await updateRole(
      user,
      user.role,
      user.managedByAdminId || userManagedByAdminId || null,
    );
  };

  const resetGroupForm = () => {
    setEditingGroupId(null);
    setGroupName("");
    setGroupDescription("");
    setGroupIsActive(true);
    setGroupCanalIds(new Set());
    setGroupAdminIds(new Set());
  };

  const startEditGroup = (group: CanalGroupItem) => {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupDescription(group.description || "");
    setGroupIsActive(group.isActive !== false);
    setGroupCanalIds(new Set(group.canalIds || []));
    setGroupAdminIds(new Set(group.adminUserIds || []));
  };

  const toggleGroupCanal = (canalId: string) => {
    setGroupCanalIds((prev) => {
      const next = new Set(prev);
      if (next.has(canalId)) next.delete(canalId);
      else next.add(canalId);
      return next;
    });
  };

  const toggleGroupAdmin = (adminId: string) => {
    setGroupAdminIds((prev) => {
      const next = new Set(prev);
      if (next.has(adminId)) next.delete(adminId);
      else next.add(adminId);
      return next;
    });
  };

  const saveGroup = async () => {
    const name = groupName.trim();
    if (name.length < 2) {
      setError("Group name must have at least 2 characters.");
      return;
    }

    await withBusy(async () => {
      const payload = {
        name,
        description: groupDescription.trim(),
        isActive: groupIsActive,
        canalIds: uniqueSorted(groupCanalIds),
        adminUserIds: uniqueSorted(groupAdminIds),
      };

      if (editingGroupId) {
        await authFetch(`/api/super-admin/groups/${editingGroupId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage("Group updated.");
      } else {
        await authFetch(`/api/super-admin/groups`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setMessage("Group created.");
      }

      resetGroupForm();
      await loadData();
    });
  };

  const deleteGroup = async (groupId: string, name: string) => {
    const confirmed = window.confirm(`Delete group "${name}"?`);
    if (!confirmed) return;

    await withBusy(async () => {
      await authFetch(`/api/super-admin/groups/${groupId}`, {
        method: "DELETE",
      });
      if (editingGroupId === groupId) {
        resetGroupForm();
      }
      setMessage("Group deleted.");
      await loadData();
    });
  };

  const addDevice = async () => {
    const deviceId = newDeviceId.trim();
    if (!deviceId) {
      setError("Device ID is required.");
      return;
    }

    await withBusy(async () => {
      await authFetch("/api/super-admin/devices", {
        method: "POST",
        body: JSON.stringify({
          deviceId,
          canalId: newDeviceCanalId || null,
        }),
      });
      setNewDeviceId("");
      setNewDeviceCanalId("");
      setMessage("Device saved.");
      await loadData();
    });
  };

  const applyDeviceAssignment = async (deviceId: string) => {
    const canalId = deviceAssignDrafts[deviceId] || null;

    await withBusy(async () => {
      await authFetch(`/api/super-admin/devices/${encodeURIComponent(deviceId)}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ canalId }),
      });
      setMessage(`Updated assignment for ${deviceId}.`);
      await loadData();
    });
  };

  const decommissionDevice = async (deviceId: string) => {
    const reason = window.prompt(
      "Optional reason for decommissioning this device:",
      "",
    );

    await withBusy(async () => {
      await authFetch(
        `/api/super-admin/devices/${encodeURIComponent(deviceId)}/decommission`,
        {
          method: "POST",
          body: JSON.stringify({ reason: reason || "" }),
        },
      );
      setMessage(`${deviceId} decommissioned.`);
      await loadData();
    });
  };

  const recommissionDevice = async (deviceId: string) => {
    await withBusy(async () => {
      await authFetch(
        `/api/super-admin/devices/${encodeURIComponent(deviceId)}/recommission`,
        { method: "POST" },
      );
      setMessage(`${deviceId} recommissioned.`);
      await loadData();
    });
  };

  const deleteDevice = async (deviceId: string) => {
    const confirmed = window.confirm(
      `Delete ${deviceId} from the registry? This also unassigns it from any canal.`,
    );
    if (!confirmed) return;

    await withBusy(async () => {
      await authFetch(`/api/super-admin/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
      });
      setMessage(`${deviceId} removed.`);
      await loadData();
    });
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading session...
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Card className="max-w-3xl mx-auto border-amber-300 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="text-base">Super Admin Access Required</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your account does not have super-admin privileges.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Super Admin Console
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage roles, canal access, canal groups, and device lifecycle.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading || busy}>
          {loading || busy ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1.5" />
          )}
          Refresh
        </Button>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Users</p>
            <p className="text-2xl font-semibold">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Admins</p>
            <p className="text-2xl font-semibold">{admins.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Canal Groups</p>
            <p className="text-2xl font-semibold">{groups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Device IDs</p>
            <p className="text-2xl font-semibold">{devices.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> User Role Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading users...</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-180 text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Email</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Role</th>
                    <th className="text-left px-3 py-2">Groups</th>
                    <th className="text-left px-3 py-2">Canals</th>
                    <th className="text-right px-3 py-2">Actions</th>
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
                      <td className="px-3 py-2">
                        <select
                          className="h-8 rounded-md border bg-background px-2"
                          value={user.role}
                          disabled={busy}
                          onChange={(e) =>
                            updateRole(user, e.target.value as Role)
                          }
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                          <option value="superadmin">superadmin</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {user.groupNames.length > 0
                          ? user.groupNames.join(", ")
                          : "No groups"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {user.role === "superadmin"
                          ? "All canals"
                          : user.role === "admin"
                          ? `${user.directAssignedCanals.length} direct / ${user.effectiveCanalIds.length} effective`
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || user.isApproved}
                          onClick={() => approvePendingUser(user)}
                        >
                          Activate
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={busy || user.id === currentUserId}
                          onClick={() => deleteUser(user)}
                          className="ml-2"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Delete
                        </Button>
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
          <CardTitle className="text-base">User Access Overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {users.filter((user) => user.role === "user").length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No user-role accounts available.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Select User</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    disabled={busy}
                  >
                    {users
                      .filter((user) => user.role === "user")
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label>Managing Admin</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={userManagedByAdminId}
                    onChange={(e) => setUserManagedByAdminId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">No manager</option>
                    {admins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} ({admin.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Extra groups ({userExtraGroupIds.size} selected)
                  </p>
                  <div className="max-h-52 overflow-auto rounded-md border p-2 space-y-1">
                    {groups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={userExtraGroupIds.has(group.id)}
                          onChange={() => toggleUserExtraGroup(group.id)}
                          disabled={busy}
                        />
                        <span className="truncate">{group.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Device visibility (+allow / -hide)
                  </p>
                  <div className="max-h-52 overflow-auto rounded-md border p-2 space-y-2">
                    {devices.map((device) => (
                      <div
                        key={device.deviceId}
                        className="rounded-md border px-2 py-1.5"
                      >
                        <p className="text-xs font-medium">{device.deviceId}</p>
                        <div className="mt-1 flex items-center gap-3 text-xs">
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={userAllowedDeviceIds.has(device.deviceId)}
                              onChange={() => toggleAllowedDevice(device.deviceId)}
                              disabled={busy}
                            />
                            Allow
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={userHiddenDeviceIds.has(device.deviceId)}
                              onChange={() => toggleHiddenDevice(device.deviceId)}
                              disabled={busy}
                            />
                            Hide
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Effective groups: {selectedUser?.effectiveGroupIds.length || 0} | Effective canals: {selectedUser?.effectiveCanalIds.length || 0}
              </div>

              <Button onClick={saveUserAccess} disabled={busy || !selectedUser}>
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Save User Access
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Direct Canal Assignment (Per Admin)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Promote a user to admin to manage direct canal assignments.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Select Admin</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={selectedAdminId}
                    onChange={(e) => setSelectedAdminId(e.target.value)}
                    disabled={busy}
                  >
                    {admins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} ({admin.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Direct canals: {selectedAdmin?.directAssignedCanals.length || 0}</p>
                  <p>
                    Effective canals (direct + groups): {selectedAdmin?.effectiveCanalIds.length || 0}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Select canals this admin should access directly.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto pr-1">
                  {canals.map((canal) => (
                    <label
                      key={canal.canalId}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={adminSelectedCanals.has(canal.canalId)}
                        onChange={() => toggleAdminCanal(canal.canalId)}
                        disabled={busy}
                      />
                      <span className="truncate">
                        {canal.name} ({canal.canalId})
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <Button onClick={saveAdminCanals} disabled={busy || !selectedAdminId}>
                {busy ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : null}
                Save Direct Assignments
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canal Group Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="groupName">Group Name</Label>
                <Input
                  id="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Section A Officers"
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="groupDescription">Description</Label>
                <Input
                  id="groupDescription"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Optional"
                  disabled={busy}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={groupIsActive}
                onChange={(e) => setGroupIsActive(e.target.checked)}
                disabled={busy}
              />
              Group is active
            </label>

            <Separator />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Admin members ({groupAdminIds.size} selected)
                </p>
                <div className="max-h-44 overflow-auto rounded-md border p-2 space-y-1">
                  {admins.map((admin) => (
                    <label
                      key={admin.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={groupAdminIds.has(admin.id)}
                        onChange={() => toggleGroupAdmin(admin.id)}
                        disabled={busy}
                      />
                      <span className="truncate">{admin.name} ({admin.email})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Group canals ({groupCanalIds.size} selected)
                </p>
                <div className="max-h-44 overflow-auto rounded-md border p-2 space-y-1">
                  {canals.map((canal) => (
                    <label
                      key={canal.canalId}
                      className="flex items-center gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={groupCanalIds.has(canal.canalId)}
                        onChange={() => toggleGroupCanal(canal.canalId)}
                        disabled={busy}
                      />
                      <span className="truncate">{canal.name} ({canal.canalId})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveGroup} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                {editingGroupId ? "Update Group" : "Create Group"}
              </Button>
              {(editingGroupId || groupName || groupDescription) && (
                <Button variant="outline" onClick={resetGroupForm} disabled={busy}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-160 text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Group</th>
                  <th className="text-left px-3 py-2">Members</th>
                  <th className="text-left px-3 py-2">Canals</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={5}>
                      No canal groups yet.
                    </td>
                  </tr>
                ) : (
                  groups.map((group) => (
                    <tr key={group.id} className="border-t">
                      <td className="px-3 py-2">
                        <p className="font-medium">{group.name}</p>
                        {group.description && (
                          <p className="text-xs text-muted-foreground">
                            {group.description}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {group.adminUserIds.length}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {group.canalIds.length}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={group.isActive ? "default" : "outline"}>
                          {group.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditGroup(group)}
                            disabled={busy}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteGroup(group.id, group.name)}
                            disabled={busy}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Login Audit (Admin & User)</CardTitle>
        </CardHeader>
        <CardContent>
          {loginLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No login logs found.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-220 text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Role</th>
                    <th className="text-left px-3 py-2">User</th>
                    <th className="text-left px-3 py-2">Manager</th>
                    <th className="text-left px-3 py-2">IP</th>
                    <th className="text-left px-3 py-2">Client</th>
                  </tr>
                </thead>
                <tbody>
                  {loginLogs.map((log) => (
                    <tr key={log.id} className="border-t align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(log.loginAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{log.role}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <p>{log.userName}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {log.email}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {log.managedByAdmin?.name || "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {log.ipAddress || "-"}
                      </td>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="w-4 h-4" /> Device Registry & Decommissioning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
            <div className="space-y-1">
              <Label htmlFor="newDeviceId">Device ID</Label>
              <Input
                id="newDeviceId"
                value={newDeviceId}
                onChange={(e) => setNewDeviceId(e.target.value)}
                placeholder="ESP32_NEW_DEVICE_001"
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <Label>Assign to canal (optional)</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={newDeviceCanalId}
                onChange={(e) => setNewDeviceCanalId(e.target.value)}
                disabled={busy}
              >
                <option value="">Unassigned</option>
                {canals.map((canal) => (
                  <option key={canal.canalId} value={canal.canalId}>
                    {canal.name} ({canal.canalId})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={addDevice} disabled={busy}>
                Add Device
              </Button>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-220 text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Device ID</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Assigned Canal</th>
                  <th className="text-left px-3 py-2">Decommission Info</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={5}>
                      No devices in the registry.
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.deviceId} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{device.deviceId}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            device.status === "decommissioned"
                              ? "destructive"
                              : "default"
                          }
                        >
                          {device.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                            value={deviceAssignDrafts[device.deviceId] || ""}
                            disabled={busy || device.status === "decommissioned"}
                            onChange={(e) =>
                              setDeviceAssignDrafts((prev) => ({
                                ...prev,
                                [device.deviceId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Unassigned</option>
                            {canals.map((canal) => (
                              <option key={canal.canalId} value={canal.canalId}>
                                {canal.canalId}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applyDeviceAssignment(device.deviceId)}
                            disabled={busy || device.status === "decommissioned"}
                          >
                            Apply
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {device.status === "decommissioned" ? (
                          <>
                            <p>{device.decommissionReason || "No reason provided"}</p>
                            {device.decommissionedAt && (
                              <p>
                                {new Date(device.decommissionedAt).toLocaleString()}
                              </p>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2 flex-wrap">
                          {device.status === "decommissioned" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => recommissionDevice(device.deviceId)}
                              disabled={busy}
                            >
                              Recommission
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => decommissionDevice(device.deviceId)}
                              disabled={busy}
                            >
                              Decommission
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteDevice(device.deviceId)}
                            disabled={busy}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
