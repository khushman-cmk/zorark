import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { users } from "@/lib/schema";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  mobile: z.string().regex(/^\d{10,15}$/),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  try {
    await ensureDatabaseSetup();

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid account details." }, { status: 400 });
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
        { error: "Account already exists. Please log in." },
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
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not create account right now. Check PostgreSQL connection and try again.",
      },
      { status: 500 },
    );
  }
}
