import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Canonical on-disk JSON form: 2-space indent plus a trailing newline. */
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Read a file as UTF-8, returning null when it does not exist. */
export async function readTextIfExists(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/** Read and parse a JSON file, returning null when missing or unparseable. */
export async function readJsonIfExists(file) {
  const text = await readTextIfExists(file);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Write via a sibling temp file and rename so readers never see partial output. */
export async function writeFileAtomic(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, contents);
    await rename(tmp, file);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Write `value` as canonical JSON only when the bytes differ from what is on disk.
 * Returns true when the file was (re)written.
 */
export async function writeJsonIfChanged(file, value) {
  const next = serializeJson(value);
  const current = await readTextIfExists(file);
  if (current === next) return false;
  await writeFileAtomic(file, next);
  return true;
}
