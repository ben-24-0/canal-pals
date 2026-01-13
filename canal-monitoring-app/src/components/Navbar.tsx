import Link from "next/link";
import { usePathname } from "next/navigation";
export default function Navbar() {
  const pathname = usePathname();

  const isHome = pathname === "/";
  return (
    <header className="fixed top-0 left-0 z-50 w-full bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Intelligent irrigation monitoring system</h1>

        <nav className="space-x-6 text-sm text-gray-700">
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
          <Link href="/dashboard" className="hover:text-black">
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
