"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown, LogOut, Menu, User, Wallet } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/cn";
import { NOTIFICATIONS } from "@/lib/home-data";

export function TopBar({
  userName,
  onMenuClick,
}: {
  userName: string;
  onMenuClick: () => void;
}) {
  const [open, setOpen] = useState<"bell" | "user" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

  // Close either dropdown on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation"
        className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Notifications */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === "bell" ? null : "bell")}
          aria-label={`Notifications, ${unread} unread`}
          aria-expanded={open === "bell"}
          className="relative inline-flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken"
        >
          <Bell className="size-[19px]" />
          {unread > 0 && (
            <span className="zp-fill-pink absolute -right-0.5 -top-0.5 inline-flex size-[17px] items-center justify-center rounded-full text-[0.6rem] font-bold ring-2 ring-canvas">
              {unread}
            </span>
          )}
        </button>

        {open === "bell" && (
          <div className="absolute right-0 top-full z-50 mt-2 w-[19rem] overflow-hidden rounded-card border border-line bg-surface shadow-pill">
            <p className="border-b border-line px-4 py-3 text-sm font-bold text-ink">
              Notifications
            </p>
            <ul className="max-h-72 overflow-y-auto">
              {NOTIFICATIONS.map((n) => (
                <li
                  key={n.id}
                  className="border-b border-line-strong/40 px-4 py-3 last:border-0 hover:bg-sunken"
                >
                  <p className="text-[0.82rem] font-semibold text-ink">{n.title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted">{n.body}</p>
                  <p className="mt-1 text-[0.68rem] font-medium text-pink-ink">{n.when}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Account */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === "user" ? null : "user")}
          aria-expanded={open === "user"}
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-sunken"
        >
          <span className="zp-fill-pink inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase">
            {userName.charAt(0)}
          </span>
          <span className="hidden max-w-[9rem] truncate text-sm font-semibold text-ink sm:block">
            {userName}
          </span>
          <ChevronDown
            className={cn(
              "hidden size-4 shrink-0 text-muted transition-transform sm:block",
              open === "user" && "rotate-180",
            )}
          />
        </button>

        {open === "user" && (
          <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-card border border-line bg-surface shadow-pill">
            <p className="truncate border-b border-line px-4 py-3 text-sm font-bold text-ink">
              {userName}
            </p>
            <Link
              href="/home/profile"
              onClick={() => setOpen(null)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-sunken"
            >
              <User className="size-4" /> Profile
            </Link>
            <Link
              href="/home/wallet"
              onClick={() => setOpen(null)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-sunken"
            >
              <Wallet className="size-4" /> Wallet
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-sunken"
            >
              <LogOut className="size-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
