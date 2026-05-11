import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function copyIfExists(source, destination) {
  if (!existsSync(source) || !existsSync(standalone)) return;
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

await copyIfExists(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
await copyIfExists(path.join(root, "public"), path.join(standalone, "public"));
await copyIfExists(path.join(root, "data"), path.join(standalone, "data"));
