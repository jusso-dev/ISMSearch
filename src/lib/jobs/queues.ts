import { Queue, type Job } from "bullmq";
import IORedis from "ioredis";

export type ManagedQueueKey = "ism" | "acsc";

export type JobSummary = {
  id: string;
  name: string;
  status: string;
  progress: unknown;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  returnvalue?: unknown;
};

export type QueueSummary = {
  key: ManagedQueueKey;
  label: string;
  description: string;
  counts: Record<string, number>;
  jobs: JobSummary[];
};

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

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
    description: "Fetches Cyber.gov.au alerts and advisories, persists the latest snapshot and upserts the advisory index.",
    jobName: "refresh-acsc-advisories",
  },
};

declare global {
  var __ismJobConnection: IORedis | undefined;
  var __ismQueues: Partial<Record<ManagedQueueKey, Queue>> | undefined;
}

function connection() {
  globalThis.__ismJobConnection ??= new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  return globalThis.__ismJobConnection;
}

export function getManagedQueue(key: ManagedQueueKey) {
  const config = QUEUE_CONFIG[key];
  globalThis.__ismQueues ??= {};
  globalThis.__ismQueues[key] ??= new Queue(config.name, { connection: connection() });
  return globalThis.__ismQueues[key];
}

function summarizeJob(job: Job, status: string): JobSummary {
  return {
    id: String(job.id),
    name: job.name,
    status,
    progress: job.progress,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    returnvalue: job.returnvalue,
  };
}

export async function enqueueManagedJob(key: ManagedQueueKey) {
  const config = QUEUE_CONFIG[key];
  const queue = getManagedQueue(key);
  return queue.add(
    config.jobName,
    { source: "manual", requestedAt: new Date().toISOString() },
    { removeOnComplete: 30, removeOnFail: 30 },
  );
}

export async function getJobsSnapshot(): Promise<QueueSummary[]> {
  return Promise.all(
    (Object.keys(QUEUE_CONFIG) as ManagedQueueKey[]).map(async (key) => {
      const config = QUEUE_CONFIG[key];
      const queue = getManagedQueue(key);
      const [counts, jobs] = await Promise.all([
        queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
        queue.getJobs(["active", "waiting", "delayed", "completed", "failed"], 0, 12, false),
      ]);

      const jobsWithStatus = await Promise.all(
        jobs.map(async (job) => summarizeJob(job, await job.getState())),
      );

      return {
        key,
        label: config.label,
        description: config.description,
        counts,
        jobs: jobsWithStatus,
      };
    }),
  );
}

export function isManagedQueueKey(value: string): value is ManagedQueueKey {
  return value === "ism" || value === "acsc";
}
