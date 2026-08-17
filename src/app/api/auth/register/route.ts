import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { consumeOtp } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";

const schema = z.object({
  name: z.string().min(2),
  email: z.email(),
  mobile: z.string().regex(/^\d{10,15}$/),
  password: z.string().min(6),
  otp: z.string().length(6),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid registration data." }, { status: 400 });
  }

  const otpValid = await consumeOtp({
    mobile: parsed.data.mobile,
    code: parsed.data.otp,
    purpose: "login",
  });

  if (!otpValid) {
    return NextResponse.json({ error: "OTP is invalid or expired." }, { status: 401 });
  }

  const [duplicate] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      or(eq(users.email, parsed.data.email), eq(users.mobile, parsed.data.mobile)),
    )
    .limit(1);

  if (duplicate) {
    return NextResponse.json(
      { error: "Account already registered. Please login." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await db.insert(users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    mobile: parsed.data.mobile,
    passwordHash,
  });

  return NextResponse.json({ message: "Account created successfully." });
}
