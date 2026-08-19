export type NetworkFunctionHealth = {
  name: string;
  role: string;
  latencyMs: number | null;
  status: "healthy" | "degraded" | "unavailable";
};

export type CoreHealth = {
  mode: "demo" | "live";
  coreStatus: "healthy" | "degraded" | "unavailable";
  checkedAt: string;
  networkFunctions: NetworkFunctionHealth[];
};

const demoFunctions: NetworkFunctionHealth[] = [
  { name: "AMF", role: "Access & Mobility", latencyMs: 12, status: "healthy" },
  { name: "SMF", role: "Session Management", latencyMs: 18, status: "healthy" },
  { name: "UPF", role: "User Plane", latencyMs: 8, status: "healthy" },
  { name: "NRF", role: "NF Repository", latencyMs: 14, status: "healthy" },
];

function isCoreHealth(value: unknown): value is Omit<CoreHealth, "mode" | "checkedAt"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    ["healthy", "degraded", "unavailable"].includes(String(candidate.coreStatus)) &&
    Array.isArray(candidate.networkFunctions)
  );
}

export async function getCoreHealth(): Promise<CoreHealth> {
  const agentUrl = process.env.OPEN5GS_AGENT_URL?.replace(/\/$/, "");

  if (!agentUrl) {
    return { mode: "demo", coreStatus: "healthy", checkedAt: new Date().toISOString(), networkFunctions: demoFunctions };
  }

  try {
    const headers = new Headers({ Accept: "application/json" });
    if (process.env.OPEN5GS_AGENT_TOKEN) headers.set("Authorization", `Bearer ${process.env.OPEN5GS_AGENT_TOKEN}`);

    const response = await fetch(`${agentUrl}/v1/health`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) throw new Error(`Agent returned ${response.status}`);
    const payload: unknown = await response.json();
    if (!isCoreHealth(payload)) throw new Error("Agent returned an invalid health payload");

    return { ...payload, mode: "live", checkedAt: new Date().toISOString() };
  } catch {
    return {
      mode: "live",
      coreStatus: "unavailable",
      checkedAt: new Date().toISOString(),
      networkFunctions: demoFunctions.map((nf) => ({ ...nf, latencyMs: null, status: "unavailable" })),
    };
  }
}
