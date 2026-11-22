import { cn } from "@/lib/cn";

export type FuelBrandKey = "iocl" | "bpcl" | "hpcl";

const TONE: Record<FuelBrandKey, string> = {
  iocl: "#f26522",
  bpcl: "#f7b500",
  hpcl: "#1b74e4",
};

/**
 * Brand marks for the nearby-pump list.
 *
 * These are deliberately abstract geometric marks, not reproductions. The
 * real Indian Oil, Bharat Petroleum and Hindustan Petroleum logos are
 * registered trademarks. Keeping the brand as a key in the data model means a
 * licensed asset can be dropped in later without touching any component.
 */
export function FuelBrandMark({
  brand,
  className,
}: {
  brand: FuelBrandKey;
  className?: string;
}) {
  const tone = TONE[brand];

  return (
    <span
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full",
        className,
      )}
      style={{ backgroundColor: `${tone}1f` }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="size-5"
      >
        {brand === "iocl" && (
          <path
            d="M12 3c3.4 3 5.6 5.9 5.6 9a5.6 5.6 0 1 1-11.2 0c0-3.1 2.2-6 5.6-9Z"
            fill={tone}
          />
        )}
        {brand === "bpcl" && (
          <>
            <path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z" fill={tone} opacity="0.28" />
            <path d="M12 7.5 16.5 10v5L12 17.5 7.5 15v-5L12 7.5Z" fill={tone} />
          </>
        )}
        {brand === "hpcl" && (
          <>
            <circle cx="12" cy="12" r="9" fill={tone} opacity="0.25" />
            <path
              d="M7 15.5c0-4.4 2.6-8 5-8s5 3.6 5 8"
              stroke={tone}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </span>
  );
}
