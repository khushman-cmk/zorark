import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Locating the external tools safe routing needs.
 *
 * winget installs Java and uv but only new terminals see the updated PATH,
 * so after PATH we also look in the standard install locations. Commands are
 * spawned with argument arrays because the repo path contains spaces.
 */

export const ROOT = process.cwd();
export const GH_DIR = path.join(ROOT, "graphhopper");
export const GH_VERSION = "11.1";
export const GH_JAR = path.join(GH_DIR, `graphhopper-web-${GH_VERSION}.jar`);
export const SAFETY_DIR = path.join(ROOT, "scripts", "safety");

function onPath(cmd: string): string | null {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  if (probe.status !== 0) return null;
  return probe.stdout.split(/\r?\n/).find(Boolean) ?? null;
}

function firstExisting(candidates: string[]): string | null {
  return candidates.find((c) => existsSync(c)) ?? null;
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir).map((d) => path.join(dir, d));
  } catch {
    return [];
  }
}

export function findJava(): string {
  const exe = process.platform === "win32" ? "java.exe" : "java";
  const fromHome = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", exe) : null;
  const found =
    (fromHome && existsSync(fromHome) ? fromHome : null) ??
    onPath("java") ??
    firstExisting(
      ["C:\\Program Files\\Eclipse Adoptium", "C:\\Program Files\\Java", "C:\\Program Files\\Microsoft"]
        .flatMap(subdirs)
        .filter((d) => /(jdk|jre)-?(1[7-9]|2\d)/i.test(path.basename(d)))
        .sort()
        .reverse()
        .map((d) => path.join(d, "bin", exe)),
    );
  if (!found) {
    throw new Error("Java 17+ not found. Install it with: winget install EclipseAdoptium.Temurin.21.JRE");
  }
  return found;
}

export function findUv(): string {
  const local = process.env.LOCALAPPDATA ?? "";
  const found =
    onPath("uv") ??
    firstExisting([
      path.join(local, "Microsoft", "WinGet", "Links", "uv.exe"),
      ...subdirs(path.join(local, "Microsoft", "WinGet", "Packages"))
        .filter((d) => path.basename(d).startsWith("astral-sh.uv"))
        .map((d) => path.join(d, "uv.exe")),
      path.join(process.env.USERPROFILE ?? "", ".local", "bin", "uv.exe"),
    ]);
  if (!found) throw new Error("uv not found. Install it with: winget install astral-sh.uv");
  return found;
}

/** Run a command to completion, streaming its output; rejects on a non-zero exit. */
export function run(cmd: string, args: string[], options: SpawnOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}`))));
  });
}
