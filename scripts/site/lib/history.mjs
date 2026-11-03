// Control history across releases and release-to-release diffs.
import { changedFields, compareControlIds, fieldChanges } from "./controls.mjs";

function indexRelease(release) {
  if (release.byId) return release.byId;
  const byId = new Map();
  for (const control of release.controls) byId.set(control.controlId, control);
  release.byId = byId;
  return byId;
}

/**
 * @param releases ascending (oldest first) [{ version, controls: NormalisedControl[] }]
 * @returns Map<controlId, { controlId, entries, firstSeen, lastSeen, current, removedIn, presentIn, latest }>
 */
export function computeHistories(releases) {
  const indexes = releases.map(indexRelease);
  const ids = new Set();
  for (const index of indexes) for (const id of index.keys()) ids.add(id);
  const latestVersion = releases.at(-1)?.version ?? null;

  const histories = new Map();
  for (const controlId of [...ids].sort(compareControlIds)) {
    const entries = [];
    let previous = null;
    let previousVersion = null;
    let presentBefore = false;
    let presentIn = 0;
    let firstSeen = null;
    releases.forEach((release, i) => {
      const control = indexes[i].get(controlId);
      if (control) {
        presentIn += 1;
        if (!previous) {
          firstSeen = release.version;
          entries.push({ type: "introduced", version: release.version, baseline: i === 0 });
        } else if (!presentBefore) {
          const fields = changedFields(previous, control);
          entries.push({
            type: "reintroduced",
            version: release.version,
            previousVersion,
            fields,
            changes: fieldChanges(previous, control, fields),
          });
        } else {
          const fields = changedFields(previous, control);
          if (fields.length > 0) {
            entries.push({
              type: "changed",
              version: release.version,
              previousVersion,
              fields,
              changes: fieldChanges(previous, control, fields),
            });
          }
        }
        previous = control;
        previousVersion = release.version;
      } else if (presentBefore) {
        entries.push({ type: "removed", version: release.version, previousVersion });
      }
      presentBefore = Boolean(control);
    });
    const current = presentBefore;
    const lastRemoval = entries.findLast((entry) => entry.type === "removed");
    histories.set(controlId, {
      controlId,
      current,
      firstSeen,
      lastSeen: previousVersion,
      removedIn: current ? null : (lastRemoval?.version ?? null),
      presentIn,
      latestVersion,
      latest: previous,
      entries,
    });
  }
  return histories;
}

/**
 * Diff two releases. `seenBefore` (optional Set) marks additions that are reintroductions.
 */
export function releaseDiff(previousRelease, currentRelease, seenBefore = null) {
  const prev = indexRelease(previousRelease);
  const cur = indexRelease(currentRelease);
  const added = [];
  const changed = [];
  const removed = [];
  for (const [id, control] of cur) {
    const before = prev.get(id);
    if (!before) {
      added.push({ controlId: id, reintroduced: Boolean(seenBefore?.has(id)), control });
    } else {
      const fields = changedFields(before, control);
      if (fields.length > 0) {
        changed.push({ controlId: id, fields, changes: fieldChanges(before, control, fields), before, control });
      }
    }
  }
  for (const [id, control] of prev) if (!cur.has(id)) removed.push({ controlId: id, control });
  const byId = (x, y) => compareControlIds(x.controlId, y.controlId);
  added.sort(byId);
  changed.sort(byId);
  removed.sort(byId);
  return {
    version: currentRelease.version,
    previousVersion: previousRelease.version,
    counts: { added: added.length, changed: changed.length, removed: removed.length },
    added,
    changed,
    removed,
  };
}

// Diffs for every release vs its predecessor; first release gets null.
export function computeReleaseDiffs(releases) {
  const diffs = new Map();
  const seen = new Set();
  releases.forEach((release, i) => {
    if (i === 0) diffs.set(release.version, null);
    else diffs.set(release.version, releaseDiff(releases[i - 1], release, seen));
    for (const id of indexRelease(release).keys()) seen.add(id);
  });
  return diffs;
}
