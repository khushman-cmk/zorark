import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { otpVerifications } from "@/lib/schema";

const OTP_EXPIRY_MINUTES = 5;

export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOtp(mobile: string, purpose: "login" | "register" | "password_reset") {
  const code = generateOtpCode();

  await db.insert(otpVerifications).values({
    mobile,
    purpose,
    code,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
  });

  return code;
}

export async function consumeOtp(params: {
  mobile: string;
  code: string;
  purpose: "login" | "register" | "password_reset";
}) {
  const [record] = await db
    .select()
    .from(otpVerifications)
    .where(
      and(
        eq(otpVerifications.mobile, params.mobile),
        eq(otpVerifications.code, params.code),
        eq(otpVerifications.purpose, params.purpose),
        isNull(otpVerifications.consumedAt),
        gt(otpVerifications.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpVerifications.createdAt))
    .limit(1);

  if (!record) {
    return false;
  }

  await db
    .update(otpVerifications)
    .set({ consumedAt: new Date() })
    .where(eq(otpVerifications.id, record.id));

  return true;
}
