"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import type { LngLat, PotholeMarker } from "@/lib/safety/types";
import { cn } from "@/lib/cn";

const SEVERITY = [
  { value: 1, label: "Minor", hint: "Rough patch, easy to steer around" },
  { value: 2, label: "Bad", hint: "Deep enough to jolt a car or bike" },
  { value: 3, label: "Dangerous", hint: "Crater, open manhole, flooded hole" },
] as const;

export type ReportOutcome = { pothole: PotholeMarker; deduped: boolean; alreadyConfirmed: boolean };

export function ReportPothole({
  at,
  signedIn,
  onClose,
  onReported,
}: {
  at: LngLat | null;
  signedIn: boolean;
  onClose: () => void;
  onReported: (outcome: ReportOutcome) => void;
}) {
  const [severity, setSeverity] = useState<1 | 2 | 3>(2);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!at || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/potholes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lng: at[0], lat: at[1], severity, note: note.trim() || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: ReportOutcome; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error ?? "Could not save the report");
      setNote("");
      onReported(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={at !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          data-testid="report-dialog"
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-line bg-surface p-6 shadow-pill"
        >
          <Dialog.Title className="text-lg font-bold tracking-tight text-ink">Report a pothole</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            We snap your pin to the nearest road. Safe routes avoid it from the next search.
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-sunken hover:text-ink"
          >
            <X className="size-4" />
          </Dialog.Close>

          {!signedIn ? (
            <p className="mt-5 text-sm text-ink-soft">
              Please{" "}
              <Link href="/login" className="font-semibold text-pink-ink underline">
                sign in
              </Link>{" "}
              to report potholes, so reports stay trustworthy.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-xs font-semibold text-muted">How bad is it?</legend>
                {SEVERITY.map((s) => (
                  <label
                    key={s.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-tile border p-3 transition-colors",
                      severity === s.value ? "border-pink bg-pink-soft" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name="severity"
                      value={s.value}
                      checked={severity === s.value}
                      onChange={() => setSeverity(s.value)}
                      className="mt-1 accent-[var(--zp-pink-strong)]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{s.label}</span>
                      <span className="block text-xs text-muted">{s.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted">Note (optional)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={280}
                  rows={2}
                  className="rounded-tile border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-pink"
                  placeholder="e.g. left lane, near the temple gate"
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-pink-ink">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="zp-fill-pink inline-flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold shadow-pink transition-all disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Submit report
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
