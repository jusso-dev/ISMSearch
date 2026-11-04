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
const ACSC_ALERTS_RSS_URL = "https://www.cyber.gov.au/rss/alerts";
const GITHUB_TAGS_URL =
  "https://api.github.com/repos/AustralianCyberSecurityCentre/ism-oscal/tags?per_page=1";
const ADVISORY_STALE_DAYS = 14;
const EXTERNAL_CHECK_TTL_MS = 60_000;

/** Removes any username/password from a URL before it is displayed. */
function redactUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    const text = url.toString();
    // URL normalisation adds a trailing slash to bare origins; keep the original shape.
    return !value.endsWith("/") && text.endsWith("/") && url.pathname === "/" ? text.slice(0, -1) : text;
  } catch {
    return value.replace(/\/\/[^/@\s]*@/g, "//");
  }
}

/** Redacts credentials in any URLs embedded in free text (e.g. error messages). */
function redactText(value: string) {
  return value.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/gi, "$1");
}

function errorDetail(error: unknown, fallback: string) {
  return redactText(error instanceof Error ? error.message : fallback);
}

function formatAge(ms: number) {
  const hours = Math.round(ms / 360_000) / 10;
  return hours >= 48 ? `${Math.round(hours / 2.4) / 10} days` : `${hours}h`;
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
  const host = redactUrl(OLLAMA_HOST);
  try {
    const { response, ms } = await timedFetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) {
      return { name: "Ollama", status: "down", summary: `HTTP ${response.status}`, detail: host, checkedAt };
    }
    const json = (await response.json()) as { models?: { name?: string; model?: string }[] };
    const models = json.models ?? [];
    const hasModel = models.some((model) => model.name === OLLAMA_MODEL || model.model === OLLAMA_MODEL);
    return {
      name: "Ollama",
      status: hasModel ? "ok" : "warn",
      summary: hasModel ? `${OLLAMA_MODEL} available` : `${models.length} model(s), ${OLLAMA_MODEL} missing`,
      detail: `${host} responded in ${ms} ms`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "Ollama",
      status: "down",
      summary: "Not reachable",
      detail: `${host}: ${errorDetail(error, "request failed")}`,
      checkedAt,
    };
  }
}

async function checkMeilisearch(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  const host = redactUrl(MEILI_HOST);
  try {
    const { response, ms } = await timedFetch(`${MEILI_HOST}/health`);
    if (!response.ok) {
      return { name: "Meilisearch", status: "down", summary: `HTTP ${response.status}`, detail: host, checkedAt };
    }
    const json = (await response.json()) as { status?: string };
    return {
      name: "Meilisearch",
      status: json.status === "available" ? "ok" : "warn",
      summary: json.status ?? "Responded",
      detail: `${host} responded in ${ms} ms`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "Meilisearch",
      status: "down",
      summary: "Not reachable",
      detail: `${host}: ${errorDetail(error, "request failed")}`,
      checkedAt,
    };
  }
}

// External source checks are cached per server process so reloading the page does not
// hammer cyber.gov.au or GitHub's unauthenticated API (60 requests/hour per IP).
const externalCheckCache = new Map<string, { expiresAt: number; result: Promise<HealthCheck> }>();

function checkUrlCached(name: string, url: string): Promise<HealthCheck> {
  const now = Date.now();
  const cached = externalCheckCache.get(url);
  if (cached && cached.expiresAt > now) return cached.result;
  const result = checkUrl(name, url);
  externalCheckCache.set(url, { expiresAt: now + EXTERNAL_CHECK_TTL_MS, result });
  return result;
}

async function checkUrl(name: string, url: string): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const { response, ms } = await timedFetch(url);
    await response.body?.cancel().catch(() => undefined);
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
      detail: `${url}: ${errorDetail(error, "request failed")}`,
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
  const ageMs = generatedAt && !Number.isNaN(generatedAt.getTime()) ? Date.now() - generatedAt.getTime() : null;

  if (!latest || controls.length === 0) {
    return {
      name: "ISM local sync",
      status: "down",
      summary: "No usable local snapshot",
      detail: "Run pnpm sync:ism or docker compose up seed",
      checkedAt,
    };
  }

  // ISM releases are infrequent, so manifest age is reported but never flagged.
  return {
    name: "ISM local sync",
    status: "ok",
    summary: `${manifest.releases.length} releases, latest ${latest.release}`,
    detail: `${controls.length} controls in latest snapshot. Last sync ${generatedAt?.toLocaleString() ?? "unknown"}${ageMs == null ? "" : ` (${formatAge(ageMs)} ago)`}`,
    checkedAt,
  };
}

async function checkBullMq(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  const redisUrl = redactUrl(REDIS_URL);
  try {
    // getJobsSnapshot fails fast (4 s timeout, no offline queue) when Redis is down.
    const queues = await getJobsSnapshot();
    const active = queues.reduce((sum, queue) => sum + (queue.counts.active ?? 0), 0);
    const failed = queues.reduce((sum, queue) => sum + (queue.counts.failed ?? 0), 0);
    return {
      name: "BullMQ jobs",
      status: failed > 0 ? "warn" : "ok",
      summary: `${queues.length} queues, ${active} active`,
      detail: `${redisUrl}. Failed jobs retained: ${failed}`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "BullMQ jobs",
      status: "down",
      summary: "Redis or BullMQ not reachable",
      detail: `${redisUrl}: ${errorDetail(error, "connection failed")}`,
      checkedAt,
    };
  }
}

async function checkAcscAdvisorySync(): Promise<HealthCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await getLatestAdvisories(1);
    if (!result) {
      return {
        name: "ACSC advisory sync",
        status: "down",
        summary: "No advisory snapshot",
        detail: "Run pnpm sync:acsc or trigger the ACSC advisories job.",
        checkedAt,
      };
    }
    const fetchedAt = new Date(result.fetchedAt);
    const ageMs = Number.isNaN(fetchedAt.getTime()) ? null : Date.now() - fetchedAt.getTime();
    const stale = ageMs == null || ageMs > ADVISORY_STALE_DAYS * 24 * 3_600_000;
    return {
      name: "ACSC advisory sync",
      status: result.total === 0 || stale ? "warn" : "ok",
      summary: stale
        ? `Snapshot is ${ageMs == null ? "undated" : `${formatAge(ageMs)} old`} (older than ${ADVISORY_STALE_DAYS} days)`
        : `${result.total} advisories in snapshot`,
      detail: `Last snapshot ${ageMs == null ? "unknown" : `${fetchedAt.toLocaleString()} (${formatAge(ageMs)} ago)`}. Source: ${result.sourceUrl}`,
      checkedAt,
    };
  } catch (error) {
    return {
      name: "ACSC advisory sync",
      status: "down",
      summary: "No advisory data available",
      detail: errorDetail(error, "Unable to read advisory snapshot"),
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
    checkUrlCached("ACSC ISM OSCAL page", CYBER_OSCAL_PAGE),
    checkUrlCached("ACSC alerts RSS feed", ACSC_ALERTS_RSS_URL),
    checkUrlCached("ACSC GitHub OSCAL mirror", GITHUB_TAGS_URL),
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
            Live checks for local data, Ollama, Meilisearch and official ASD/ACSC source reachability. External
            source checks are cached for 60 seconds.
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
          ACSC page: {CYBER_OSCAL_PAGE}. RSS: {ACSC_ALERTS_RSS_URL}. GitHub mirror: {GITHUB_TAGS_URL}.
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
