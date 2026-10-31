import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const sources = {};
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (
      ["node_modules", ".git", ".local", "dist", "artifacts"].includes(
        entry.name,
      ) ||
      entry.name === ".env"
    )
      continue;
    const file = folder === "." ? entry.name : `${folder}/${entry.name}`;
    if (entry.isDirectory()) await walk(file);
    else
      sources[file] = createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
  }
}
await walk(".");
let commit = null;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {}
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/source-manifest.json",
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      commit,
      node: process.version,
      sources,
    },
    null,
    2,
  ),
);
console.log(
  `Source evidence recorded; ${commit ? `commit ${commit}` : "no Git commit yet (repository creation pending)"}.`,
);
