"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Links" },
  { href: "/settings", label: "Settings" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-4 px-4 py-3 sm:px-6">
        <Image src="/logo-nav.png" alt="Readio" width={480} height={232} className="h-9 w-auto" priority />
        <div className="flex gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-2.5 py-1 text-sm font-medium ${
                  active
                    ? "bg-black/10 dark:bg-white/15"
                    : "text-zinc-600 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
