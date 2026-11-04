import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

// Copy the static assets Next.js leaves out of `.next/standalone`. Data is deliberately
// not copied: the Docker image and docker-compose mount/copy data/ explicitly.
const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function copyIfExists(source, destination) {
  if (!existsSync(source) || !existsSync(standalone)) return;
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

await copyIfExists(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
await copyIfExists(path.join(root, "public"), path.join(standalone, "public"));
