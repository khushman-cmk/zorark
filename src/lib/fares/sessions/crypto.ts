import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { sessionKey } from "../config";
import type { ProviderId } from "../types";

/**
 * Sealing for stored provider sessions.
 *
 * These are third-party account credentials — functionally passwords. The
 * encryption protects against an exfiltrated database file, not against
 * someone with shell access on the box.
 *
 * The provider name is passed as additional authenticated data, so a sealed
 * blob cannot be lifted from one provider's row and replayed as another's:
 * unsealing under the wrong provider fails the auth tag rather than quietly
 * returning the wrong session.
 */

export type SessionPlaintext = {
  /** Playwright storageState: cookies plus origin local storage. */
  storageState: unknown;
  /** Any headers the provider needs replayed alongside the cookies. */
  authHeaders?: Record<string, string>;
  /**
   * Which device profile minted this. If the profile later changes we can
   * detect the mismatch and mark the session degraded, rather than silently
   * replaying it under a different fingerprint.
   */
  deviceProfileId: string;
  /**
   * The exact user agent of the browser that logged in. Replayed verbatim on
   * the HTTP path, so cookies minted by one browser identity are never sent
   * under a different one.
   */
  userAgent?: string;
};

export type SealedSession = {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
};

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export function seal(provider: ProviderId, plaintext: SessionPlaintext): SealedSession {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, sessionKey(), iv);
  cipher.setAAD(Buffer.from(provider, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(plaintext), "utf8"),
    cipher.final(),
  ]);

  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

export function unseal(provider: ProviderId, sealed: SealedSession): SessionPlaintext {
  const decipher = createDecipheriv(ALGORITHM, sessionKey(), toBuffer(sealed.iv));
  decipher.setAAD(Buffer.from(provider, "utf8"));
  decipher.setAuthTag(toBuffer(sealed.tag));

  const plaintext = Buffer.concat([
    decipher.update(toBuffer(sealed.ciphertext)),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext) as SessionPlaintext;
}

/** node-postgres hands bytea back as a Buffer, but be tolerant of Uint8Array. */
function toBuffer(value: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

/**
 * Shape check for an imported storageState before it is sealed. Catches an
 * operator pasting the wrong JSON far more cheaply than a failed fare fetch.
 */
export function looksLikeStorageState(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const cookies = (value as { cookies?: unknown }).cookies;
  return Array.isArray(cookies);
}
