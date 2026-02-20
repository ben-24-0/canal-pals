import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isHome = pathname === "/";
  return (
    <header className="fixed top-0 left-0 z-50 w-full bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          Intelligent irrigation monitoring system
        </Link>

        <nav className="flex items-center space-x-6 text-sm text-gray-700">
          <Link href="/" className="hover:text-black">
            Home
          </Link>
          {isHome && (
            <>
              <a href="#about" className="hover:text-black">
                About
              </a>
              <a href="#features" className="hover:text-black">
                Features
              </a>
            </>
          )}
          {session ? (
            <Link
              href="/app"
              className="px-4 py-1.5 rounded-lg bg-[#2323FF] text-white text-sm font-medium hover:bg-[#1a1aee] transition-colors"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-4 py-1.5 rounded-lg bg-[#2323FF] text-white text-sm font-medium hover:bg-[#1a1aee] transition-colors"
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
