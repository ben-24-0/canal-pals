"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Home,
  Map,
  Star,
  PlusSquare,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/app", icon: Home, label: "Canal Modules" },
  { href: "/app/map", icon: Map, label: "Map View" },
  { href: "/app/favourites", icon: Star, label: "Favourites" },
];

const adminItems = [
  { href: "/app/admin/add-module", icon: PlusSquare, label: "Add Module" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = session?.user?.role === "admin";

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={`
        relative flex flex-col h-screen bg-sidebar border-r border-border transition-all duration-200
        ${collapsed ? "w-[64px]" : "w-[220px]"}
      `}
    >
      {/* Logo row */}
      <div className="flex items-center h-16 px-4 border-b border-border shrink-0 overflow-hidden">
        {!collapsed && (
          <span className="font-bold text-sm text-primary truncate leading-tight">
            Irrigation
            <br />
            Monitor
          </span>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-[70px] z-10 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground shadow hover:opacity-90"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Nav */}
      <nav className="flex flex-col gap-1 p-2 flex-1 mt-2">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${
                isActive(href)
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
              }
            `}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            {!collapsed && (
              <p className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </p>
            )}
            {!collapsed && <div className="border-t border-border mb-1" />}
            {adminItems.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    isActive(href)
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                  }
                `}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User + logout */}
      <div className="p-2 border-t border-border shrink-0">
        <div
          className={`flex items-center gap-2 px-3 py-2 ${collapsed ? "justify-center" : ""}`}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground shrink-0">
            <User size={14} />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">
                {session?.user?.name ?? "User"}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize">
                {session?.user?.role}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className={`
            mt-1 flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground
            hover:bg-destructive/10 hover:text-destructive transition-colors
            ${collapsed ? "justify-center" : ""}
          `}
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
