import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Destination search.
 *
 * A real GET form rather than a controlled input, so it stays a server
 * component, works before hydration, and submits with the Enter key for free.
 */
export function SearchBar({ className }: { className?: string }) {
  return (
    <form
      action="/home/ride"
      method="get"
      role="search"
      className={cn(
        "flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-5 shadow-pill",
        className,
      )}
    >
      <MapPin className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
      <label htmlFor="destination" className="sr-only">
        Search for a destination
      </label>
      <input
        id="destination"
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Search for a destination"
        className="min-w-0 flex-1 bg-transparent py-2.5 text-[0.95rem] text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        aria-label="Search"
        className="zp-fill-pink inline-flex size-11 shrink-0 items-center justify-center rounded-full shadow-pink transition-transform hover:scale-105"
      >
        <ArrowRight className="size-[18px]" />
      </button>
    </form>
  );
}
