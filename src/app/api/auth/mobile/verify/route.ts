import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeOtp } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

const schema = z.object({
  mobile: z.string().regex(/^\d{10,15}$/),
  otp: z.string().length(6),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mobile number or OTP." }, { status: 400 });
  }

  const validOtp = await consumeOtp({
    mobile: parsed.data.mobile,
    code: parsed.data.otp,
    purpose: "login",
  });

  if (!validOtp) {
    return NextResponse.json({ error: "Invalid or expired OTP." }, { status: 401 });
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.mobile, parsed.data.mobile))
    .limit(1);

  return NextResponse.json({
    verified: true,
    existingUser: Boolean(existingUser),
  });
}
