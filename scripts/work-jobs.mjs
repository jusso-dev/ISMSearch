import { spawn } from "node:child_process";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const queues = {
  ism: new Queue("ism-sync", { connection }),
  acsc: new Queue("acsc-advisories-sync", { connection }),
};

function runScript(job, script, progressLabel) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        void job.log(line);
        if (line.startsWith(progressLabel)) void job.updateProgress(line);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        void job.log(line);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          completedAt: new Date().toISOString(),
          tail: output.trim().split(/\r?\n/).slice(-8),
        });
        return;
      }
      reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function scheduleRecurringJobs() {
  await queues.ism.add(
    "refresh-ism-controls",
    { source: "scheduler" },
    {
      jobId: "scheduled-ism-refresh",
      repeat: { pattern: process.env.ISM_SYNC_CRON ?? "0 */6 * * *" },
      removeOnComplete: 20,
      removeOnFail: 20,
    },
  );
  await queues.acsc.add(
    "refresh-acsc-advisories",
    { source: "scheduler" },
    {
      jobId: "scheduled-acsc-refresh",
      repeat: { pattern: process.env.ACSC_SYNC_CRON ?? "*/30 * * * *" },
      removeOnComplete: 30,
      removeOnFail: 30,
    },
  );
}

const workers = [
  new Worker(
    "ism-sync",
    async (job) => {
      await job.updateProgress("Starting ISM release discovery and Meilisearch upsert");
      return runScript(job, "scripts/sync-ism.mjs", "Wrote ");
    },
    { connection, concurrency: 1 },
  ),
  new Worker(
    "acsc-advisories-sync",
    async (job) => {
      await job.updateProgress("Starting ACSC advisory refresh and Meilisearch upsert");
      return runScript(job, "scripts/sync-acsc-advisories.mjs", "Synced ");
    },
    { connection, concurrency: 1 },
  ),
];

for (const worker of workers) {
  worker.on("completed", (job) => console.log(`${job.queueName} job ${job.id} completed`));
  worker.on("failed", (job, error) => console.error(`${job?.queueName ?? "unknown"} job ${job?.id ?? "unknown"} failed`, error));
}

await scheduleRecurringJobs();
console.log(`BullMQ workers ready on ${REDIS_URL}.`);

const shutdown = async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  await connection.quit();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
