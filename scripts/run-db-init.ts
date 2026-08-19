import { ensureDatabaseSetup } from "../src/lib/db-init";

ensureDatabaseSetup()
  .then(() => {
    console.log("DB Init ran successfully!");
    process.exit(0);
  })
  .catch((e) => {
    console.error("DB Init failed:", e);
    process.exit(1);
  });
