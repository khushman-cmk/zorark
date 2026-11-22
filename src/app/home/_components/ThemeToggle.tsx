"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Theme switch.
 *
 * Reads nothing from useTheme except the setter. Both icons are always
 * rendered and one is hidden with a `dark:` utility, so the button's markup is
 * identical on the server and the client. That sidesteps the usual
 * next-themes dance where `resolvedTheme` is undefined on first render and a
 * `mounted` guard causes a visible pop.
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle colour theme"
      className="inline-flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink"
    >
      <Sun className="size-[18px] dark:hidden" />
      <Moon className="hidden size-[18px] dark:block" />
    </button>
  );
}
