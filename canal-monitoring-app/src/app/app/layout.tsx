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
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex flex-wrap items-center gap-2 min-h-16 px-3 sm:px-4 lg:px-6 py-2 border-b border-border bg-card shrink-0">
          <div className="order-2 md:order-1 w-full md:w-auto md:flex-1">
            <input
              type="search"
              placeholder="Search canals..."
              className="w-full rounded-lg border border-border bg-background px-3 sm:px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary sm:max-w-sm"
            />
          </div>
          <div className="order-1 md:order-2 ml-auto flex items-center gap-2">
            <span className="hidden md:inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary capitalize">
              {session.user?.role}
            </span>
            <span className="hidden lg:inline text-sm font-medium text-foreground max-w-45 truncate">
              {session.user?.name}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
