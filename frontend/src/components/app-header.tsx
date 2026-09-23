"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/dataset", label: "Датасет", icon: Database },
];

export function AppHeader() {
  const pathname = usePathname() ?? "/";
  return <header className="border-b border-border bg-white">
    <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
      <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-md" aria-label="HackAlem, на главную">
        <Image src="/brand-mark.svg" width={36} height={36} alt="" aria-hidden="true" priority />
        <span className="truncate text-base font-extrabold text-foreground sm:text-lg">HackAlem<span className="text-primary">.</span></span>
      </Link>
      <nav aria-label="Основная навигация" className="flex shrink-0 items-center gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === href : pathname.startsWith(href);
          return <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3",
              active && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4 max-[359px]:hidden" />
            <span>{label}</span>
          </Link>;
        })}
      </nav>
    </div>
  </header>;
}
