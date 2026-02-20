import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center h-16 px-6 border-b border-border bg-card shrink-0">
          <div className="flex-1">
            <input
              type="search"
              placeholder="Search canals by name or ID…"
              className="w-full max-w-sm rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="ml-4 flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary capitalize">
              {session.user?.role}
            </span>
            <span className="text-sm font-medium text-foreground">
              {session.user?.name}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
