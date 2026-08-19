import { db } from "../src/lib/db";
import { users } from "../src/lib/schema";
import { eq } from "drizzle-orm";

async function test() {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, "zukashixx@gmail.com"))
    .limit(1);

  console.log("Keys:", Object.keys(user));
  console.log("passwordHash exists?", "passwordHash" in user);
  console.log("password_hash exists?", "password_hash" in user);
  process.exit(0);
}

test();
