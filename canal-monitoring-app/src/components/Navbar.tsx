"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isHome = pathname === "/";

  const closeMobile = () => setMobileOpen(false);
  return (
    <header className="fixed top-0 left-0 z-50 w-full border-b border-[#2a517a] bg-[#0d3a6b]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 md:px-6">
        <Link href="/" className="flex flex-col leading-none text-white">
          <span className="text-xl font-bold uppercase tracking-wide md:text-2xl">
            IIMS
          </span>
          <span className="hidden text-[10px] font-medium tracking-wide text-blue-100 md:block">
            Intelligent Irrigation Monitoring System
          </span>
        </Link>

        <nav className="hidden items-center gap-2 text-xs text-blue-100 md:flex md:gap-4 md:text-sm">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <Link href="/map" className="hover:text-white">
            Maps
          </Link>
          {isHome && (
            <>
              <a href="#about" className="hover:text-white">
                About
              </a>
              <a href="#features" className="hover:text-white">
                Features
              </a>
            </>
          )}
          {session ? (
            <Link
              href="/app"
              className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0d3a6b] transition-colors hover:bg-blue-100 md:px-4 md:text-sm"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0d3a6b] transition-colors hover:bg-blue-100 md:px-4 md:text-sm"
            >
              Login
            </Link>
          )}
        </nav>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 text-white md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/15 bg-[#0d3a6b] px-3 py-3 md:hidden">
          <nav className="flex flex-col gap-2 text-sm text-blue-100">
            <Link
              href="/"
              onClick={closeMobile}
              className="rounded-md px-3 py-2 hover:bg-white/10 hover:text-white"
            >
              Home
            </Link>
            <Link
              href="/map"
              onClick={closeMobile}
              className="rounded-md px-3 py-2 hover:bg-white/10 hover:text-white"
            >
              Maps
            </Link>

            {isHome && (
              <>
                <a
                  href="#about"
                  onClick={closeMobile}
                  className="rounded-md px-3 py-2 hover:bg-white/10 hover:text-white"
                >
                  About
                </a>
                <a
                  href="#features"
                  onClick={closeMobile}
                  className="rounded-md px-3 py-2 hover:bg-white/10 hover:text-white"
                >
                  Features
                </a>
              </>
            )}

            {session ? (
              <Link
                href="/app"
                onClick={closeMobile}
                className="mt-1 rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-[#0d3a6b]"
              >
                Go to Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                onClick={closeMobile}
                className="mt-1 rounded-lg bg-white px-3 py-2 text-center text-sm font-semibold text-[#0d3a6b]"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
