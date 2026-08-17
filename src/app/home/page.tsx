"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";

const quickData: QuickRow[] = [
  { item: "Location Permission", status: "Required" },
  { item: "Mobile Verified", status: "Completed" },
  { item: "Account Status", status: "Active" },
];

type QuickRow = {
  item: string;
  status: string;
};

export default function HomePage() {
  const [locationStatus, setLocationStatus] = useState("Not requested");

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Location not supported on this device.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => setLocationStatus("Location granted. Pickup point can be detected."),
      () => setLocationStatus("Location denied. Please enable GPS permission."),
    );
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#ff78b655,#fff5fa_44%,#ffffff_100%)] px-5 py-10">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mx-auto w-full max-w-4xl rounded-3xl border border-black/10 bg-white/95 p-6 shadow-xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Welcome to Zorark</h1>
            <p className="mt-2 text-zinc-600">
              Your account is ready. Start by choosing what you want to do.
            </p>
          </div>
          <Link
            href="/login"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Switch Account
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/my-vehicle"
            className="rounded-2xl bg-zinc-900 px-5 py-6 text-center text-lg font-semibold text-white transition hover:bg-black"
          >
            My Vehicle
          </Link>
          <Link
            href="/book-travel"
            className="rounded-2xl bg-pink-600 px-5 py-6 text-center text-lg font-semibold text-white transition hover:bg-pink-700"
          >
            Book Travel
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-200 p-4">
          <h2 className="text-lg font-semibold text-zinc-900">Location Access</h2>
          <p className="mt-1 text-sm text-zinc-600">Allow location to detect pickup point and nearby drivers.</p>
          <button
            type="button"
            onClick={requestLocation}
            className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Request Location Permission
          </button>
          <p className="mt-2 text-sm text-zinc-700">{locationStatus}</p>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Checklist</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {quickData.map((row) => (
                <tr key={row.item} className="border-t border-zinc-200">
                  <td className="px-4 py-3 text-zinc-700">{row.item}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>
    </main>
  );
}
