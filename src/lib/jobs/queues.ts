import { Queue, type Job } from "bullmq";
import IORedis from "ioredis";

export type ManagedQueueKey = "ism" | "acsc";

export type JobSummary = {
  id: string;
  name: string;
  status: string;
  progress: unknown;
  /** Truncated to 300 characters. */
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
};

export type QueueSummary = {
  key: ManagedQueueKey;
  label: string;
  description: string;
  counts: Record<string, number>;
  jobs: JobSummary[];
};

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const SNAPSHOT_TIMEOUT_MS = 4_000;
const ENQUEUE_TIMEOUT_MS = 4_000;
const FAILED_REASON_MAX_LENGTH = 300;

const QUEUE_CONFIG: Record<ManagedQueueKey, { name: string; label: string; description: string; jobName: string }> = {
  ism: {
    name: "ism-sync",
    label: "ISM controls",
    description: "Discovers released ISM OSCAL tags, persists snapshots and upserts controls into Meilisearch.",
    jobName: "refresh-ism-controls",
  },
  acsc: {
    name: "acsc-advisories-sync",
    label: "ACSC advisories",
    description: "Refreshes the persisted cyber.gov.au alerts and advisories snapshot and upserts the advisory index.",
    jobName: "refresh-acsc-advisories",
  },
};

declare global {
  var __ismJobConnection: IORedis | undefined;
  var __ismQueues: Partial<Record<ManagedQueueKey, Queue>> | undefined;
}

let lastErrorLogAt = 0;

function logRedisError(error: unknown) {
  // ioredis emits an error per reconnect attempt; keep the log readable.
  const now = Date.now();
  if (now - lastErrorLogAt < 60_000) return;
  lastErrorLogAt = now;
  console.error("[jobs] Redis connection error:", error instanceof Error ? error.message : error);
}

/**
 * Web-side Redis connection. Unlike the worker, the web app must fail fast when Redis
 * is down so pages and API routes stay responsive: no offline queue, one retry per
 * request, short connect timeout, and no connection until first use.
 */
function connection() {
  if (!globalThis.__ismJobConnection) {
    const redis = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3_000,
      lazyConnect: true,
    });
    redis.on("error", logRedisError);
    globalThis.__ismJobConnection = redis;
  }
  return globalThis.__ismJobConnection;
}

export function getManagedQueue(key: ManagedQueueKey) {
  const config = QUEUE_CONFIG[key];
  globalThis.__ismQueues ??= {};
  let queue = globalThis.__ismQueues[key];
  if (!queue) {
    queue = new Queue(config.name, { connection: connection() });
    queue.on("error", logRedisError);
    globalThis.__ismQueues[key] = queue;
  }
  return queue;
}

/**
 * Drops cached queues/connection after a failure. BullMQ caches a failed initial
 * connection forever, so without this the app would not recover once Redis comes back.
 */
function resetConnections() {
  const queues = globalThis.__ismQueues;
  const redis = globalThis.__ismJobConnection;
  globalThis.__ismQueues = undefined;
  globalThis.__ismJobConnection = undefined;
  for (const queue of Object.values(queues ?? {})) {
    queue?.close().catch(() => undefined);
  }
  redis?.disconnect();
}

async function withTimeout<T>(work: () => Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } catch (error) {
    resetConnections();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function summarizeJob(job: Job, status: string): JobSummary {
  const failedReason =
    typeof job.failedReason === "string" && job.failedReason.length > FAILED_REASON_MAX_LENGTH
      ? `${job.failedReason.slice(0, FAILED_REASON_MAX_LENGTH - 1)}…`
      : job.failedReason || undefined;
  return {
    id: String(job.id),
    name: job.name,
    status,
    progress: job.progress,
    failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };
}

/**
 * Enqueues a manual refresh. Uses BullMQ deduplication keyed per queue so repeated
 * clicks while a manual job is still waiting/active do not pile up extra jobs; the
 * existing job is returned instead.
 */
export async function enqueueManagedJob(key: ManagedQueueKey) {
  const config = QUEUE_CONFIG[key];
  return withTimeout(
    () =>
      getManagedQueue(key).add(
        config.jobName,
        { source: "manual", requestedAt: new Date().toISOString() },
        { removeOnComplete: 30, removeOnFail: 30, deduplication: { id: `manual-${key}` } },
      ),
    ENQUEUE_TIMEOUT_MS,
    "Timed out enqueueing job",
  );
}

export async function getJobsSnapshot(): Promise<QueueSummary[]> {
  return withTimeout(
    () =>
      Promise.all(
        (Object.keys(QUEUE_CONFIG) as ManagedQueueKey[]).map(async (key) => {
          const config = QUEUE_CONFIG[key];
          const queue = getManagedQueue(key);
          const [counts, jobs] = await Promise.all([
            queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
            queue.getJobs(["active", "waiting", "delayed", "completed", "failed"], 0, 12, false),
          ]);

          const jobsWithStatus = await Promise.all(
            jobs.filter(Boolean).map(async (job) => summarizeJob(job, await job.getState())),
          );

          return {
            key,
            label: config.label,
            description: config.description,
            counts,
            jobs: jobsWithStatus,
          };
        }),
      ),
    SNAPSHOT_TIMEOUT_MS,
    "Timed out reading job queues",
  );
}

export function isManagedQueueKey(value: string): value is ManagedQueueKey {
  return value === "ism" || value === "acsc";
}
