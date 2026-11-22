/**
 * Presentation data for the customer dashboard.
 *
 * Everything the dashboard renders comes from here, so swapping any one
 * section over to a real query is a single-file change. Where a real table
 * already exists in src/lib/schema.ts the field names mirror its columns
 * (fuelPrices, trips) to keep that swap cheap.
 */

export type FuelType = "petrol" | "diesel" | "e20";

export type QuickAction = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  icon: "ride" | "travel" | "fuel";
};

export type Destination = {
  key: string;
  /** trips.destination */
  name: string;
  /** Human-readable travel time from the user's current location. */
  travelTime: string;
  art: "taj" | "gate" | "towers" | "skyline";
  href: string;
};

export type FuelPump = {
  id: string;
  /** travelProviders.name equivalent for a fuel brand */
  brand: string;
  mark: "iocl" | "bpcl" | "hpcl";
  distanceKm: number;
  hours: string;
  /** fuelPrices.pricePerLitre, keyed by fuelPrices.fuelType */
  prices: Record<FuelType, number>;
};

export type RecentRide = {
  /** trips.origin / trips.destination */
  origin: string;
  destination: string;
  when: string;
  vehicle: string;
  /** trips.fuelCost + trips.tollCost */
  fare: number;
  /** trips.distanceKm */
  distanceKm: number;
  status: "completed" | "cancelled" | "ongoing";
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  when: string;
  unread: boolean;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "ride",
    title: "Book a Ride",
    subtitle: "Fast • Safe • Reliable",
    href: "/home/ride",
    icon: "ride",
  },
  {
    key: "travel",
    title: "Book Travel",
    subtitle: "Buses • Trains • Flights",
    href: "/home/travel",
    icon: "travel",
  },
  {
    key: "fuel",
    title: "Fuel Prices",
    subtitle: "Find cheapest near you",
    href: "/home/fuel",
    icon: "fuel",
  },
];

export const DESTINATIONS: Destination[] = [
  { key: "noida", name: "Noida", travelTime: "22 min", art: "towers", href: "/home/travel" },
  { key: "delhi", name: "Delhi", travelTime: "1 hr 10 min", art: "gate", href: "/home/travel" },
  { key: "gurgaon", name: "Gurgaon", travelTime: "48 min", art: "skyline", href: "/home/travel" },
  { key: "agra", name: "Agra", travelTime: "2 hr 45 min", art: "taj", href: "/home/travel" },
];

export const FUEL_LOCATION = "Sector 62, Noida";

export const FUEL_PUMPS: FuelPump[] = [
  {
    id: "iocl-62",
    brand: "Indian Oil",
    mark: "iocl",
    distanceKm: 1.2,
    hours: "Open 24x7",
    prices: { petrol: 94.12, diesel: 87.4, e20: 92.68 },
  },
  {
    id: "bpcl-63",
    brand: "Bharat Petroleum",
    mark: "bpcl",
    distanceKm: 2.4,
    hours: "Open 24x7",
    prices: { petrol: 93.76, diesel: 86.95, e20: 92.31 },
  },
  {
    id: "hpcl-58",
    brand: "Hindustan Petroleum",
    mark: "hpcl",
    distanceKm: 3.1,
    hours: "Open 24x7",
    prices: { petrol: 93.42, diesel: 86.6, e20: 91.98 },
  },
];

export const FUEL_TABS: { key: FuelType; label: string }[] = [
  { key: "petrol", label: "Petrol" },
  { key: "diesel", label: "Diesel" },
  { key: "e20", label: "E20" },
];

export const RECENT_RIDE: RecentRide = {
  origin: "Noida",
  destination: "Delhi",
  when: "Today, 9:12 AM",
  vehicle: "Sedan",
  fare: 340,
  distanceKm: 12.4,
  status: "completed",
};

export const WALLET_BALANCE = 1250;

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    title: "Ride confirmed",
    body: "Your ride to Delhi is confirmed for 9:12 AM.",
    when: "10 min ago",
    unread: true,
  },
  {
    id: "n2",
    title: "Fuel price drop",
    body: "Petrol is down ₹2.10 per litre at pumps near you.",
    when: "1 hour ago",
    unread: true,
  },
  {
    id: "n3",
    title: "Cashback credited",
    body: "₹45 cashback added to your Zippi Wallet.",
    when: "Yesterday",
    unread: true,
  },
];

/**
 * Groups an integer the Indian way: the last three digits, then pairs.
 * 1250 -> "1,250";  125000 -> "1,25,000".
 *
 * Hand-rolled rather than Intl.NumberFormat on purpose. ICU data differs
 * between Node and the browser, so an Intl-formatted string is a classic
 * source of hydration mismatches.
 */
function groupIndian(value: number): string {
  const digits = Math.abs(Math.trunc(value)).toString();
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

/** Formats whole rupees, e.g. 1250 -> "₹1,250". */
export function formatRupees(value: number): string {
  return `₹${groupIndian(value)}`;
}

/** Formats a per-litre fuel price, e.g. 94.12 -> "₹94.12". */
export function formatPrice(value: number): string {
  return `₹${groupIndian(Math.trunc(value))}.${Math.round((value % 1) * 100)
    .toString()
    .padStart(2, "0")}`;
}

/** Formats a distance, e.g. 12.4 -> "12.4 km". */
export function formatKm(value: number): string {
  return `${value} km`;
}

/** Picks the greeting that matches the time of day. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning,";
  if (hour < 17) return "Good afternoon,";
  return "Good evening,";
}
