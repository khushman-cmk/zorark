"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Car,
  Clock,
  Fuel,
  Gift,
  Home,
  Bus,
  ShieldCheck,
  User,
  Wallet,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ZippiWordmark } from "@/components/zippi/art/ZippiMark";
import { SidebarSkyline } from "@/components/zippi/art/CardDecor";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/home/ride", label: "Ride", icon: Car },
  { href: "/home/directions", label: "Safe Directions", icon: ShieldCheck },
  { href: "/home/travel", label: "Travel", icon: Bus },
  { href: "/home/fuel", label: "Fuel Prices", icon: Fuel },
  { href: "/home/trips", label: "My Trips", icon: Clock },
  { href: "/home/wallet", label: "Wallet", icon: Wallet },
  { href: "/home/profile", label: "Profile", icon: User },
];

function isActive(pathname: string, href: string) {
  // "/home" must match exactly, or it would light up on every child route.
  return href === "/home" ? pathname === "/home" : pathname.startsWith(href);
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <div className="px-6 pt-7 pb-6">
        <Link href="/home" onClick={onNavigate} className="inline-flex">
          <ZippiWordmark textClassName="text-white" />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-4" aria-label="Main">
        <ul className="flex flex-col gap-1.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all",
                    active
                      ? "zp-fill-pink shadow-pink"
                      : "text-panel-muted hover:bg-white/5 hover:text-panel-fg",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-white/5 text-panel-muted group-hover:text-panel-fg",
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative z-10 px-4 pt-5">
        <Link
          href="/home/wallet"
          onClick={onNavigate}
          className="group flex items-center gap-3 rounded-2xl border border-panel-line bg-panel-card p-3.5 transition-colors hover:border-white/20"
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-pink-soft-2 text-pink">
            <Gift className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8rem] font-bold leading-tight text-panel-fg">
              Save more
              <br />
              with Zippi Wallet
            </span>
            <span className="mt-1 block text-[0.7rem] leading-tight text-panel-muted">
              Get cashback, offers and more!
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-panel-muted transition-transform group-hover:translate-x-0.5" />
        </Link>

      </div>

      {/* Decorative skyline bleeding off the bottom edge. */}
      <div className="pointer-events-none relative mt-4 h-36 shrink-0 overflow-hidden">
        <SidebarSkyline className="zp-fade-bottom absolute inset-0" />
      </div>
    </div>
  );
}
