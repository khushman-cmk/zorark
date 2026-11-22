"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SidebarContent } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The dashboard chrome.
 *
 * A client component because it owns the mobile drawer state and the sidebar
 * needs the current path. Page content arrives as `children` and stays a
 * server component, so nothing on the dashboard itself is dragged across the
 * client boundary by this wrapper.
 */
export function Shell({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  // Dismiss the drawer whenever the route changes, including on browser back.
  // Adjusting state during render is React's recommended way to reset state
  // from a changing value; an effect here would cause a cascading re-render.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  // Don't let the page behind the drawer scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Desktop rail. shrink-0 keeps it from collapsing when content is wide. */}
      <aside className="sticky top-0 hidden h-dvh w-[var(--zp-sidebar-w)] shrink-0 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          tabIndex={drawerOpen ? 0 : -1}
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/55 transition-opacity duration-200",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-[min(19rem,85vw)] shadow-pill transition-transform duration-250 ease-out",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          <button
            type="button"
            tabIndex={drawerOpen ? 0 : -1}
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="absolute right-3 top-5 inline-flex size-9 items-center justify-center rounded-full text-panel-muted hover:bg-white/10 hover:text-panel-fg"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Main column. min-w-0 is what stops long content forcing page-level
          horizontal scroll: a flex child defaults to min-width:auto. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
          style={{ background: "var(--zp-hero-wash)" }}
        />

        <header className="relative z-30 flex items-center justify-end gap-1 px-4 py-4 sm:px-6 lg:px-8">
          <ThemeToggle />
          <TopBar userName={userName} onMenuClick={() => setDrawerOpen(true)} />
        </header>

        <main className="relative z-10 min-w-0 flex-1 px-4 pb-12 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
