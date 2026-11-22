import { Pool } from "pg";
import * as fs from "fs";

const pool = new Pool({
  connectionString: "postgres://postgres:postgres@localhost:5432/postgres",
});

async function main() {
  const sql = fs.readFileSync("drizzle/0002_bored_hawkeye.sql", "utf-8");
  const statements = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(s => s.length > 0);
  
  for (const statement of statements) {
    try {
      console.log("Executing:", statement);
      await pool.query(statement);
      console.log("Success.");
    } catch (err: any) {
      console.error("Failed:", err.message);
    }
  }
  
  pool.end();
}

main();
