import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeOtp } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

const schema = z.object({
  mobile: z.string().regex(/^\d{10,15}$/),
  otp: z.string().length(6),
  newPassword: z.string().min(6),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reset payload." }, { status: 400 });
  }

  const otpValid = await consumeOtp({
    mobile: parsed.data.mobile,
    code: parsed.data.otp,
    purpose: "password_reset",
  });

  if (!otpValid) {
    return NextResponse.json({ error: "Invalid or expired OTP." }, { status: 401 });
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.mobile, parsed.data.mobile))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "No account found for this mobile." }, { status: 404 });
  }

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(parsed.data.newPassword, 10), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ message: "Password reset successfully." });
}
