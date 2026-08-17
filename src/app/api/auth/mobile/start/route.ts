import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtp } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

const schema = z.object({
  mobile: z.string().regex(/^\d{10,15}$/),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.mobile, parsed.data.mobile))
    .limit(1);

  const otp = await createOtp(parsed.data.mobile, "login");

  return NextResponse.json({
    message: "OTP sent successfully.",
    existingUser: Boolean(existingUser),
    otpPreview: process.env.NODE_ENV === "development" ? otp : undefined,
  });
}
