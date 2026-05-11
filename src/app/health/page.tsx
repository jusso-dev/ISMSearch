import { Activity, AlertTriangle, CheckCircle2, Clock, Database, Globe2, Server, XCircle } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { getLatestAdvisories } from "@/lib/acsc/advisories";
import { getControls, getManifest } from "@/lib/ism/repository";
import { getJobsSnapshot } from "@/lib/jobs/queues";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "warn" | "down";

type HealthCheck = {
  name: string;
  status: HealthStatus;
  summary: string;
  detail?: string;
  checkedAt: string;
};

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
const MEILI_HOST = process.env.MEILI_HOST ?? "http://localhost:7700";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const CYBER_OSCAL_PAGE =
  "https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/ism/ism-oscal-releases";
const CYBER_RSS_URL = process.env.CYBER_RSS_URL ?? "https://www.cyber.gov.au/rss/news";
const GITHUB_TAGS_URL =
  "https://api.github.com/repos/AustralianCyberSecurityCentre/ism-oscal/tags?per_page=1";

function redacted(value: string) {
  return value.replace(/\/\/([^:@/]+):([^@/]+)@/g, "//$1:***@");
}

async function timedFetch(url: string, init?: RequestInit) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "ISMSearch healthcheck",
        ...(init?.headers ?? {}),
      },
    });
    return { response, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function checkOllama(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const { response, ms } = await timedFetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) {
      return { name: "Ollama", status: "down", summary: `HTTP ${response.status}`, detail: OLLAMA_HOST, checkedAt };
    }
    const json = (await response.json()) as { models?: { name?: string; model?: string }[] };
    const models = json.models ?? [];
    const hasModel = models.some((model) => model.name === OLLAMA_MODEL || model.model === OLLAMA_MODEL);
    return {
      name: "Ollama",
      status: hasModel ? "ok" : "warn",
      summary: hasModel ? `${OLLAMA_MODEL} available` : `${models.length} model(s), ${OLLAMA_MODEL} missing`,
      detail: `${OLLAMA_HOST} responded in ${ms} ms`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "Ollama",
      status: "down",
      summary: "Not reachable",
      detail: error instanceof Error ? error.message : OLLAMA_HOST,
      checkedAt,
    };
  }
}

async function checkMeilisearch(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const { response, ms } = await timedFetch(`${MEILI_HOST}/health`);
    if (!response.ok) {
      return { name: "Meilisearch", status: "down", summary: `HTTP ${response.status}`, detail: MEILI_HOST, checkedAt };
    }
    const json = (await response.json()) as { status?: string };
    return {
      name: "Meilisearch",
      status: json.status === "available" ? "ok" : "warn",
      summary: json.status ?? "Responded",
      detail: `${MEILI_HOST} responded in ${ms} ms`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "Meilisearch",
      status: "down",
      summary: "Not reachable",
      detail: error instanceof Error ? error.message : MEILI_HOST,
      checkedAt,
    };
  }
}

async function checkUrl(name: string, url: string): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const { response, ms } = await timedFetch(url);
    return {
      name,
      status: response.ok ? "ok" : "down",
      summary: response.ok ? "Reachable" : `HTTP ${response.status}`,
      detail: `${url} responded in ${ms} ms`,
      checkedAt,
    };
  } catch (error) {
    return {
      name,
      status: "down",
      summary: "Not reachable",
      detail: error instanceof Error ? error.message : url,
      checkedAt,
    };
  }
}

async function checkLocalSync(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  const manifest = await getManifest();
  const latest = manifest.releases[0];
  const controls = latest ? await getControls(latest.version) : [];
  const generatedAt = manifest.generatedAt ? new Date(manifest.generatedAt) : null;
  const ageHours = generatedAt ? Math.round((Date.now() - generatedAt.getTime()) / 36_000) / 10 : null;

  if (!latest || controls.length === 0) {
    return {
      name: "ISM local sync",
      status: "down",
      summary: "No usable local snapshot",
      detail: "Run npm run sync:ism or docker compose up seed",
      checkedAt,
    };
  }

  return {
    name: "ISM local sync",
    status: "ok",
    summary: `${manifest.releases.length} releases, latest ${latest.release}`,
    detail: `${controls.length} controls in latest snapshot. Last sync ${generatedAt?.toLocaleString() ?? "unknown"}${ageHours == null ? "" : ` (${ageHours}h ago)`}`,
    checkedAt,
  };
}

async function checkBullMq(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const queues = await getJobsSnapshot();
    const active = queues.reduce((sum, queue) => sum + (queue.counts.active ?? 0), 0);
    const failed = queues.reduce((sum, queue) => sum + (queue.counts.failed ?? 0), 0);
    return {
      name: "BullMQ jobs",
      status: failed > 0 ? "warn" : "ok",
      summary: `${queues.length} queues, ${active} active`,
      detail: `${redacted(REDIS_URL)}. Failed jobs retained: ${failed}`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "BullMQ jobs",
      status: "down",
      summary: "Redis or BullMQ not reachable",
      detail: error instanceof Error ? error.message : REDIS_URL,
      checkedAt,
    };
  }
}

async function checkAcscAdvisorySync(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await getLatestAdvisories(1);
    return {
      name: "ACSC advisory sync",
      status: result.advisories.length > 0 ? "ok" : "warn",
      summary: `${result.advisories.length} latest item available`,
      detail: `Last advisory snapshot/fetch ${new Date(result.fetchedAt).toLocaleString()}. Source: ${result.sourceUrl}`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "ACSC advisory sync",
      status: "down",
      summary: "No advisory data available",
      detail: error instanceof Error ? error.message : "Unable to read advisory sync",
      checkedAt,
    };
  }
}

function statusTone(status: HealthStatus) {
  if (status === "ok") return "border-[oklch(0.75_0.08_158)] bg-[oklch(0.965_0.025_158)] text-[oklch(0.32_0.09_158)]";
  if (status === "warn") return "border-[oklch(0.78_0.11_78)] bg-[oklch(0.972_0.03_78)] text-[oklch(0.42_0.1_78)]";
  return "border-[oklch(0.76_0.1_31)] bg-[oklch(0.968_0.026_31)] text-[oklch(0.38_0.1_31)]";
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "ok") return <CheckCircle2 size={18} />;
  if (status === "warn") return <AlertTriangle size={18} />;
  return <XCircle size={18} />;
}

export default async function HealthPage() {
  const [localSync, advisorySync, ollama, meilisearch, bullMq, acscPage, acscRss, githubMirror] = await Promise.all([
    checkLocalSync(),
    checkAcscAdvisorySync(),
    checkOllama(),
    checkMeilisearch(),
    checkBullMq(),
    checkUrl("ACSC ISM OSCAL page", CYBER_OSCAL_PAGE),
    checkUrl("ACSC RSS feed", CYBER_RSS_URL),
    checkUrl("ACSC GitHub OSCAL mirror", GITHUB_TAGS_URL),
  ]);

  const checks = [localSync, advisorySync, ollama, meilisearch, bullMq, acscPage, acscRss, githubMirror];
  const okCount = checks.filter((check) => check.status === "ok").length;
  const hasDown = checks.some((check) => check.status === "down");
  const hasWarn = checks.some((check) => check.status === "warn");
  const overall: HealthStatus = hasDown ? "down" : hasWarn ? "warn" : "ok";

  return (
    <main id="main-content" className="mx-auto w-[min(1180px,calc(100%-32px))] py-8 max-sm:w-[calc(100%-20px)] max-sm:py-4">
      <div className="mb-6">
        <AppNav active="health" />
      </div>
      <header className="mb-6 flex items-start justify-between gap-4 max-sm:grid">
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-[var(--muted)]">Operational health</p>
          <h1 className="m-0 text-3xl font-bold text-[var(--ink)]">ISM Search Health</h1>
          <p className="mt-3 max-w-[70ch] leading-relaxed text-[var(--muted)]">
            Live checks for local data, Ollama, Meilisearch and official ASD/ACSC source reachability.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-bold ${statusTone(overall)}`}>
          <StatusIcon status={overall} />
          {okCount}/{checks.length} healthy
        </div>
      </header>

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <SummaryCard icon={<Server size={18} />} label="App" value="Running" />
        <SummaryCard icon={<Database size={18} />} label="Data releases" value={localSync.summary} />
        <SummaryCard icon={<Clock size={18} />} label="Checked" value={new Date().toLocaleString()} />
      </section>

      <section className="grid gap-3">
        {checks.map((check) => (
          <article key={check.name} className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <div className="flex items-start justify-between gap-4 max-sm:grid">
              <div className="flex gap-3">
                <div className={`grid size-10 place-items-center rounded-lg border ${statusTone(check.status)}`}>
                  <StatusIcon status={check.status} />
                </div>
                <div>
                  <h2 className="m-0 text-base font-bold text-[var(--ink)]">{check.name}</h2>
                  <p className="mb-0 mt-1 text-[var(--muted)]">{check.summary}</p>
                  {check.detail && <p className="mb-0 mt-2 break-words text-sm leading-relaxed text-[var(--subtle)]">{check.detail}</p>}
                </div>
              </div>
              <span className="inline-flex min-h-7 items-center rounded-full border border-[var(--line)] bg-[oklch(0.982_0.006_92_/_0.78)] px-3 text-xs uppercase text-[var(--muted)]">
                {check.status}
              </span>
            </div>
          </article>
        ))}
      </section>

      <footer className="mt-6 rounded-lg border border-[var(--line)] bg-[oklch(0.986_0.006_92_/_0.9)] p-4 text-sm leading-relaxed text-[var(--muted)]">
        <div className="mb-2 flex items-center gap-2 font-bold text-[var(--ink)]">
          <Globe2 size={16} />
          Source endpoints
        </div>
        <p className="m-0 break-words">
          ACSC page: {CYBER_OSCAL_PAGE}. RSS: {CYBER_RSS_URL}. GitHub mirror: {GITHUB_TAGS_URL}.
        </p>
      </footer>
    </main>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-2 flex items-center gap-2 text-[var(--accent-strong)]">
        {icon}
        <span className="text-xs font-bold uppercase">{label}</span>
      </div>
      <p className="m-0 font-bold text-[var(--ink)]">{value}</p>
    </div>
  );
}
