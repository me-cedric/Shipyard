// Builds the `shipyard` CLI and copies it to the Tauri sidecar name: binaries/shipyard-<triple>.
// The release build runs it (crates/shipyard-app/tauri.release.conf.json). It needs no argument:
// Tauri sets TAURI_ENV_TARGET_TRIPLE, and without it the host triple is used.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const triple =
	process.env.TAURI_ENV_TARGET_TRIPLE ??
	execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)?.[1];
if (!triple) throw new Error("cannot find the target triple");

const ext = triple.includes("windows") ? ".exe" : "";
execFileSync("cargo", ["build", "--release", "-p", "shipyard-cli", "--target", triple], {
	cwd: root,
	stdio: "inherit",
});

const out = join(root, "crates/shipyard-app/binaries");
mkdirSync(out, { recursive: true });
copyFileSync(
	join(root, "target", triple, "release", `shipyard${ext}`),
	join(out, `shipyard-${triple}${ext}`),
);
