import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { providerSessions } from "@/lib/schema";
import { DEVICE_PROFILE_ID } from "../device";
import type { ProviderId, SessionStatus } from "../types";
import { seal, unseal, type SessionPlaintext } from "./crypto";

/**
 * Reading, writing and expiring the stored provider sessions.
 */

export type SessionRecord = {
  provider: ProviderId;
  status: SessionStatus;
  failStreak: number;
  capturedAt: Date;
  refreshedAt: Date | null;
  lastOkAt: Date | null;
  lastFailAt: Date | null;
  deviceProfileId: string | null;
  /** True when the stored profile no longer matches the one we would replay. */
  profileMismatch: boolean;
};

export async function readSession(
  provider: ProviderId,
): Promise<{ record: SessionRecord; plaintext: SessionPlaintext } | null> {
  const [row] = await db
    .select()
    .from(providerSessions)
    .where(eq(providerSessions.provider, provider))
    .limit(1);

  if (!row) return null;

  let plaintext: SessionPlaintext;
  try {
    plaintext = unseal(provider, {
      iv: row.iv,
      tag: row.tag,
      ciphertext: row.ciphertext,
    });
  } catch {
    // A blob that will not unseal is unusable. Report it as expired rather
    // than throwing into a fare request.
    await markStatus(provider, "expired");
    return null;
  }

  return {
    record: toRecord(row),
    plaintext,
  };
}

/** Status without decrypting, for the admin dashboard. */
export async function readStatus(provider: ProviderId): Promise<SessionRecord | null> {
  const [row] = await db
    .select()
    .from(providerSessions)
    .where(eq(providerSessions.provider, provider))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function readAllStatuses(): Promise<SessionRecord[]> {
  const rows = await db.select().from(providerSessions);
  return rows.map(toRecord);
}

function toRecord(row: typeof providerSessions.$inferSelect): SessionRecord {
  return {
    provider: row.provider as ProviderId,
    status: row.status as SessionStatus,
    failStreak: row.failStreak,
    capturedAt: row.capturedAt,
    refreshedAt: row.refreshedAt,
    lastOkAt: row.lastOkAt,
    lastFailAt: row.lastFailAt,
    deviceProfileId: row.deviceProfileId,
    profileMismatch:
      row.deviceProfileId !== null && row.deviceProfileId !== DEVICE_PROFILE_ID,
  };
}

/** Stores a freshly captured session and marks the provider connected. */
export async function writeSession(
  provider: ProviderId,
  plaintext: SessionPlaintext,
): Promise<void> {
  const sealed = seal(provider, plaintext);
  const now = new Date();

  await db
    .insert(providerSessions)
    .values({
      provider,
      iv: sealed.iv,
      tag: sealed.tag,
      ciphertext: sealed.ciphertext,
      deviceProfileId: plaintext.deviceProfileId,
      capturedAt: now,
      refreshedAt: now,
      status: "connected",
      failStreak: 0,
    })
    .onConflictDoUpdate({
      target: providerSessions.provider,
      set: {
        iv: sealed.iv,
        tag: sealed.tag,
        ciphertext: sealed.ciphertext,
        deviceProfileId: plaintext.deviceProfileId,
        capturedAt: now,
        refreshedAt: now,
        status: "connected",
        failStreak: 0,
        lastFailAt: null,
      },
    });
}

/**
 * Session write-back, debounced.
 *
 * Hydrating from stored cookies and never writing back discards every rolling
 * refresh cookie the provider issues, which shortens session life for no
 * reason at all. Debounced to roughly once a minute so a busy provider does
 * not rewrite the row on every fetch.
 */
const lastWriteBack = new Map<ProviderId, number>();
const WRITE_BACK_INTERVAL_MS = 60_000;

export async function writeBack(
  provider: ProviderId,
  storageState: unknown,
  authHeaders?: Record<string, string>,
): Promise<void> {
  const now = Date.now();
  const last = lastWriteBack.get(provider) ?? 0;
  if (now - last < WRITE_BACK_INTERVAL_MS) return;
  lastWriteBack.set(provider, now);

  const sealed = seal(provider, {
    storageState,
    authHeaders,
    deviceProfileId: DEVICE_PROFILE_ID,
  });

  await db
    .update(providerSessions)
    .set({
      iv: sealed.iv,
      tag: sealed.tag,
      ciphertext: sealed.ciphertext,
      refreshedAt: new Date(),
    })
    .where(eq(providerSessions.provider, provider));
}

export async function markStatus(
  provider: ProviderId,
  status: SessionStatus,
): Promise<void> {
  await db
    .update(providerSessions)
    .set({ status })
    .where(eq(providerSessions.provider, provider));
}

/** A successful fetch is the cheapest possible health signal. */
export async function markSuccess(provider: ProviderId): Promise<void> {
  await db
    .update(providerSessions)
    .set({ lastOkAt: new Date(), failStreak: 0, status: "connected" })
    .where(eq(providerSessions.provider, provider));
}

/**
 * An auth failure. One transient 401 is not enough to tear down a working
 * login, so the session only flips to expired on the second consecutive
 * failure. Returns the status it landed on.
 */
export async function markAuthFailure(provider: ProviderId): Promise<SessionStatus> {
  const current = await readStatus(provider);
  const streak = (current?.failStreak ?? 0) + 1;
  const status: SessionStatus = streak >= 2 ? "expired" : "degraded";

  await db
    .update(providerSessions)
    .set({ failStreak: streak, lastFailAt: new Date(), status })
    .where(eq(providerSessions.provider, provider));

  return status;
}

export async function deleteSession(provider: ProviderId): Promise<void> {
  await db.delete(providerSessions).where(eq(providerSessions.provider, provider));
}
