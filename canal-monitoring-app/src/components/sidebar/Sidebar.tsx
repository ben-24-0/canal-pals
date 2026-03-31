"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Home,
  Map,
  PlusSquare,
  ShieldCheck,
  LogOut,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/app", icon: Home, label: "Canal Modules" },
  { href: "/app/map", icon: Map, label: "Map View" },
];

const adminItems = [
  { href: "/app/admin/add-module", icon: PlusSquare, label: "Add Module" },
  { href: "/app/admin/users", icon: Users, label: "Manage Users" },
];

const superAdminItems = [
  {
    href: "/app/admin/super-admin",
    icon: ShieldCheck,
    label: "Super Admin",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(true);
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperAdmin = role === "superadmin";
  const adminNavItems = isSuperAdmin
    ? [...adminItems, ...superAdminItems]
    : adminItems;
  const mobileItems = isAdmin ? [...navItems, ...adminNavItems] : navItems;

  useEffect(() => {
    const forceCollapsedOnSmallerScreens = () => {
      if (window.innerWidth < 1280) {
        setCollapsed(true);
      }
    };

    forceCollapsedOnSmallerScreens();
    window.addEventListener("resize", forceCollapsedOnSmallerScreens);
    return () =>
      window.removeEventListener("resize", forceCollapsedOnSmallerScreens);
  }, []);

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    return pathname.startsWith(href);
  }

  const handleSignOut = async () => {
    await signOut({ redirect: false });

    if (typeof window !== "undefined") {
      window.location.assign(`${window.location.origin}/`);
      return;
    }
  };

  return (
    <>
      <aside
        className={`
          relative hidden lg:flex lg:flex-col lg:h-screen bg-sidebar border-r border-border transition-all duration-200
          ${collapsed ? "lg:w-16" : "lg:w-55"}
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
          className="absolute -right-3 top-17.5 z-10 hidden xl:flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground shadow hover:opacity-90"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-2 flex-1 mt-2">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
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
              {adminNavItems.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
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
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
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

      <nav className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-border bg-card/95 backdrop-blur-sm">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${mobileItems.length + 1}, minmax(0, 1fr))`,
          }}
        >
          {mobileItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium ${
                isActive(href)
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}

          <button
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground"
          >
            <LogOut size={16} className="shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </nav>
    </>
  );
}
