/**
 * Sector registry (WS-4). Curated target-industry descriptors, each with a
 * Sector-Specialist persona line the LLM fills. Unknown sectors fall back to
 * the generic sector mandate.
 */
export interface SectorDescriptor {
  id: string;
  label: string;
  /** Sector-Specialist persona line for this industry. */
  persona: string;
}

export const SECTOR_REGISTRY: SectorDescriptor[] = [
  {
    id: "audio",
    label: "Audio / Sound",
    persona:
      "Audio and sound product workflows: digital signal processing, audio ML, latency and fidelity constraints, music and speech tooling.",
  },
  {
    id: "frontier-research",
    label: "Frontier Model Research",
    persona:
      "Frontier model research: large-scale training and inference, evaluation, safety and alignment, research engineering rigor.",
  },
  {
    id: "customer-insights",
    label: "Customer & Consumer Insights",
    persona:
      "Consumer insights: survey and behavioral data, segmentation, experimentation, privacy constraints on consumer data.",
  },
  {
    id: "fintech",
    label: "FinTech",
    persona:
      "FinTech: payments, ledgers, PCI-DSS, low latency, fraud, regulatory compliance.",
  },
  {
    id: "healthcare",
    label: "Healthcare / HealthTech",
    persona:
      "Healthcare: HIPAA, clinical workflows, patient safety, regulatory compliance, interoperability.",
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    persona:
      "E-commerce: catalog and order systems, payments, personalization, supply chain, peak-load reliability.",
  },
  {
    id: "gaming",
    label: "Gaming",
    persona:
      "Gaming: real-time engines, player telemetry, monetization, live-ops reliability, content pipelines.",
  },
  {
    id: "energy",
    label: "Energy",
    persona:
      "Energy: grid and utilities, IoT telemetry, reliability and safety, regulatory reporting, forecasting.",
  },
  {
    id: "robotics",
    label: "Robotics",
    persona:
      "Robotics: embedded and real-time systems, control loops, safety-critical validation, edge ML.",
  },
  {
    id: "defense",
    label: "Defense & Aerospace",
    persona:
      "Defense and aerospace: security-clearance context, safety-critical systems, compliance, reliability engineering.",
  },
  {
    id: "media",
    label: "Media & Entertainment",
    persona:
      "Media: streaming infrastructure, content pipelines, audience analytics, DRM, latency and quality of experience.",
  },
  {
    id: "logistics",
    label: "Logistics & Supply Chain",
    persona:
      "Logistics: route and capacity optimization, tracking systems, warehouse automation, SLA reliability.",
  },
];

/**
 * Persona line for a sector. Registry matches by id or case-insensitive label;
 * anything else (free-text) gets the generic sector mandate.
 */
export function sectorPersona(sector: string): string {
  const trimmed = sector.trim();
  const match = SECTOR_REGISTRY.find(
    (s) =>
      s.id === trimmed.toLowerCase() ||
      s.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match.persona;
  return `Industry-specific fit for ${trimmed}: domain protocols, compliance, industry stack, plus cross-sector transferable skills.`;
}

export function sectorLabel(id: string): string | undefined {
  return SECTOR_REGISTRY.find((s) => s.id === id)?.label;
}

/**
 * Whether a sector string is strong and specific enough to warrant a dedicated
 * Sector Specialist seat (Layer 1, plan section 4). Matches a registry id,
 * a registry label, or a concrete two-or-more-word sector phrase. Generic or
 * thin sectors return false so "sector / domain transferability" becomes a
 * lightly-weighted mandatory lens on every seat instead.
 */
export function isSpecificSector(sector?: string): boolean {
  if (!sector) return false;
  const trimmed = sector.trim();
  if (trimmed.length === 0) return false;
  const lower = trimmed.toLowerCase();
  const registered =
    SECTOR_REGISTRY.find(
      (s) => s.id === lower || s.label.toLowerCase() === lower,
    ) !== undefined;
  if (registered) return true;
  const GENERIC = new Set([
    "tech",
    "software",
    "technology",
    "saas",
    "startup",
    "startups",
    "ai",
    "it",
    "general",
    "internet",
    "enterprise",
  ]);
  if (GENERIC.has(lower)) return false;
  return trimmed.split(/\s+/).length >= 2;
}
