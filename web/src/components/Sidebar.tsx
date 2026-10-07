"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  ChartNoAxesCombined,
  Database,
  Megaphone,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { cx } from "./ui";

export const NAV = [
  { href: "/", label: "Forecast", icon: ChartNoAxesCombined },
  { href: "/retention", label: "Retention", icon: Repeat },
  { href: "/pipeline", label: "Pipeline", icon: Target },
  { href: "/cash", label: "Cash", icon: Banknote },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/scenarios", label: "Scenarios", icon: SlidersHorizontal },
  { href: "/trust", label: "Model trust", icon: ShieldCheck },
  { href: "/data", label: "Data & architecture", icon: Database },
] as const;

function useActive() {
  const path = usePathname() ?? "/";
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

export function Sidebar() {
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-gray-100 bg-white lg:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <Link href="/" aria-label="Hamina RevOps home" className="flex items-center">
          <Image src="/hamina-logo.svg" alt="Hamina" width={96} height={24} priority />
        </Link>
        <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-500">
          RevOps
        </span>
      </div>
      <nav className="flex-1 px-3 py-3" aria-label="Main">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Revenue</p>
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150",
                    active
                      ? "bg-[#EAECFC] text-gray-900"
                      : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                  )}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.5}
                    className={active ? "text-blue-500" : "text-gray-500"}
                    aria-hidden
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="m-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
        <span className="inline-block rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning-text">
          Demo
        </span>
        <p className="mt-1.5 text-xs leading-5 text-gray-500">
          Synthetic data · prepared for Hamina Wireless. Not affiliated.
        </p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="flex gap-1 overflow-x-auto border-b border-gray-100 bg-white px-3 py-2 lg:hidden"
    >
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cx(
            "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium",
            isActive(href) ? "bg-[#EAECFC] text-gray-900" : "text-gray-600 hover:bg-gray-100",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
