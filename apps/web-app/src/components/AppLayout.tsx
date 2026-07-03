"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/feedings", label: "Feedings" },
  { href: "/recipes", label: "Recipes" },
  { href: "/bakes", label: "Bakes" },
  { href: "/planning", label: "Planning" },
  { href: "/analytics", label: "Analytics" },
  { href: "/devices", label: "Devices" },
  { href: "/voice-logs", label: "Voice logs" },
  { href: "/account", label: "Account" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-stone-800">Sourdough</Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-4 md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-stone-600 hover:text-stone-900">
                {l.label}
              </Link>
            ))}
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="rounded bg-stone-200 px-3 py-1.5 text-sm hover:bg-stone-300">Log out</button>
            </form>
          </nav>

          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-11 w-11 items-center justify-center rounded text-stone-700 hover:bg-stone-100 md:hidden"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <nav className="mt-3 flex flex-col border-t border-stone-100 pt-2 md:hidden">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded px-2 py-3 text-stone-700 hover:bg-stone-50 hover:text-stone-900"
              >
                {l.label}
              </Link>
            ))}
            <form action="/api/auth/signout" method="POST" className="px-2 py-3">
              <button type="submit" className="w-full rounded bg-stone-200 px-3 py-2 text-sm hover:bg-stone-300">Log out</button>
            </form>
          </nav>
        )}
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
