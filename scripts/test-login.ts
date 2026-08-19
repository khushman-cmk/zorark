import { Pool } from "pg";
import bcrypt from "bcryptjs";

async function test() {
  const pool = new Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/postgres" });
  const res = await pool.query("SELECT * FROM users WHERE email = 'zukashixx@gmail.com'");
  
  const user = res.rows[0];
  if (!user) {
    console.log("User not found!");
    process.exit(1);
  }

  console.log("User:", { email: user.email, isActive: user.is_active, deletedAt: user.deleted_at, role: user.role });

  const match1 = await bcrypt.compare("divu.idiot", user.password_hash);
  const match2 = await bcrypt.compare("\"divu.idiot\"", user.password_hash);

  console.log("Matches 'divu.idiot'?", match1);
  console.log("Matches '\"divu.idiot\"'?", match2);

  process.exit(0);
}

test();
