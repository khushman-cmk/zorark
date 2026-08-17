import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtp } from "@/lib/auth-helpers";

const schema = z.object({
  mobile: z.string().regex(/^\d{10,15}$/),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
  }

  const otp = await createOtp(parsed.data.mobile, "password_reset");

  return NextResponse.json({
    message: "Password reset OTP sent.",
    otpPreview: process.env.NODE_ENV === "development" ? otp : undefined,
  });
}
