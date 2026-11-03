import { NextRequest } from "next/server";
import { z } from "zod";
import { ollamaNdjsonResponse, textFallbackResponse } from "@/lib/ndjson";
import { createOllamaStream } from "@/lib/ollama";
import { clientIp, checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseJson, PolicyType, requestErrorResponse } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PolicyBody = z.object({
  policyType: PolicyType,
  orgName: z.string().min(2).max(120),
  orgSize: z.string().min(1).max(40),
  industry: z.string().max(80).optional().default("General"),
  jurisdiction: z.string().max(80).optional().default("Australia"),
  dataTypes: z.array(z.string().max(80)).max(12).default([]),
  workModes: z.array(z.string().max(80)).max(8).default([]),
  criticalSystems: z.string().max(1000).optional().default(""),
  contactRole: z.string().max(80).optional().default("Security Manager"),
});

const POLICY_LABELS: Record<string, string> = {
  acceptable_use: "Acceptable Use Policy",
  email_use: "Acceptable Email Policy",
  incident_response: "Incident Response Policy",
  access_control: "Access Control Policy",
  data_handling: "Data Handling and Classification Policy",
  remote_work: "Remote Work Policy",
  supplier_security: "Supplier Security Policy",
  backup_recovery: "Backup and Recovery Policy",
};

function policyTitle(policyType: string) {
  return POLICY_LABELS[policyType] ?? policyType;
}

function fallbackPolicy(input: z.infer<typeof PolicyBody>) {
  const title = policyTitle(input.policyType);
  const dataTypes = input.dataTypes.length ? input.dataTypes.join(", ") : "business information";
  const workModes = input.workModes.length ? input.workModes.join(", ") : "standard office and remote work";
  const criticalSystems = input.criticalSystems || "business systems and supporting cloud services";

  return `# ${title}

## 1. Purpose
This policy defines minimum security and acceptable-use expectations for ${input.orgName}. It supports consistent protection of ${dataTypes} across ${criticalSystems}.

## 2. Scope
This policy applies to all employees, contractors, third parties and service providers who access ${input.orgName} systems or information. It applies to ${workModes}.

## 3. Organisation Context
- Organisation: ${input.orgName}
- Size: ${input.orgSize}
- Industry: ${input.industry || "General"}
- Jurisdiction: ${input.jurisdiction || "Australia"}
- Data handled: ${dataTypes}
- Primary contact role: ${input.contactRole || "Security Manager"}

## 4. Policy Requirements
1. Users must access systems only for approved business purposes.
2. Access must be authorised, uniquely attributable and reviewed on a regular basis.
3. Sensitive information must be handled according to its classification and business impact.
4. Security incidents, suspected compromise, data loss or policy breaches must be reported promptly to ${input.contactRole || "Security Manager"}.
5. Business systems must use secure configuration, logging, backup and recovery practices appropriate to their risk.
6. Third-party access must be approved, time-bound where practical and removed when no longer required.

## 5. Responsibilities
- Executives approve the policy and support enforcement.
- Managers ensure staff understand policy obligations.
- System owners document controls, exceptions and risk acceptances.
- Users follow this policy and report suspected issues.

## 6. Exceptions
Exceptions require documented business justification, compensating controls, an owner and an expiry date.

## 7. Review Cycle
This policy should be reviewed at least annually, or after material system, business, regulatory or threat changes.

## 8. Related ISM Alignment
Use the ISM Search Workbench to map this policy to current ISM controls for access control, logging, incident response, secure administration, backups, data handling and supplier security.`;
}

function buildPrompt(input: z.infer<typeof PolicyBody>) {
  return `Draft a practical cyber security policy for an Australian organisation.
Use professional policy language. Do not include legal disclaimers. Use concise sections with numbered requirements.
Make the policy directly usable as a first draft and include placeholders where the organisation must fill details.

Policy type: ${policyTitle(input.policyType)}
Organisation: ${input.orgName}
Organisation size: ${input.orgSize}
Industry: ${input.industry || "General"}
Jurisdiction: ${input.jurisdiction || "Australia"}
Common data types: ${input.dataTypes.join(", ") || "business information"}
Work modes: ${input.workModes.join(", ") || "office and remote work"}
Critical systems: ${input.criticalSystems || "business systems and cloud services"}
Security contact role: ${input.contactRole || "Security Manager"}

Required sections:
1. Purpose
2. Scope
3. Definitions
4. Policy requirements
5. Roles and responsibilities
6. Monitoring, exceptions and enforcement
7. Review cycle
8. ISM alignment notes`;
}

/**
 * Streams NDJSON events: meta, token*, optional error, done (exactly once).
 * Validation / rate-limit failures are plain JSON with 400/413/429.
 */
export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(`policy:${clientIp(request)}`, 10, 60_000);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.resetAt);

  let parsed: z.infer<typeof PolicyBody>;
  try {
    parsed = await parseJson(request, PolicyBody);
  } catch (error) {
    return requestErrorResponse(error);
  }

  const title = policyTitle(parsed.policyType);
  const generatedAt = new Date().toISOString();

  try {
    const generated = await createOllamaStream(buildPrompt(parsed), 0.25, request.signal);
    return ollamaNdjsonResponse(
      generated.body,
      {
        type: "meta",
        ...parsed,
        model: generated.model,
        degraded: false,
        title,
        generatedAt,
      },
      { firstChunkTimeoutMs: generated.firstChunkTimeoutMs, idleTimeoutMs: generated.idleTimeoutMs },
    );
  } catch {
    return textFallbackResponse(
      {
        type: "meta",
        ...parsed,
        model: null,
        degraded: true,
        title,
        generatedAt,
      },
      fallbackPolicy(parsed),
    );
  }
}
