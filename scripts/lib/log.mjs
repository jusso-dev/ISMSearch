const inActions = () => process.env.GITHUB_ACTIONS === "true";

/** Escape a message for GitHub Actions workflow commands. */
function escapeCommand(message) {
  return String(message).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

export function warn(message) {
  if (inActions()) console.log(`::warning::${escapeCommand(message)}`);
  else console.warn(`Warning: ${message}`);
}

export function fail(message) {
  if (inActions()) console.log(`::error::${escapeCommand(message)}`);
  else console.error(`Error: ${message}`);
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
