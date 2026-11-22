import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";

const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Signs in once through the real login form and saves the session for every
 * other project to reuse. Credentials come from .env.local and never leave
 * this machine.
 */
setup("authenticate", async ({ page }) => {
  const env = Object.fromEntries(
    fs
      .readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );

  await page.goto("/login");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await page.getByPlaceholder("Email Address").fill(env.ADMIN_EMAIL);
  await page.getByPlaceholder("Password").fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "LOG IN" }).click();
  await page.waitForURL(/\/(home|admin)/);

  fs.mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
  expect(fs.existsSync(AUTH_FILE)).toBe(true);
});
