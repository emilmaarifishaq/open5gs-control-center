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
  accessInterfaces?: AccessInterfaceHealth[];
  endToEnd?: EndToEndHealth;
};

export type EndToEndHealth = {
  overall: "passed" | "degraded" | "unavailable";
  services: boolean; n2: boolean; registration: boolean; pduSession: boolean; tunnel: boolean;
  tunnelName: string | null; tunnelIp: string | null;
  userPlane: { status: "passed" | "failed" | "unknown"; target: string; packetLoss: number | null; checkedAt?: string };
};

export type AccessInterfaceHealth = {
  id: "ueransim" | "external";
  label: string;
  interface: "N2 / NGAP";
  status: "connected" | "disconnected" | "unknown";
  peerAddress: string | null;
  associationCount: number;
  source: "sctp" | "service" | "unavailable";
};

const demoFunctions: NetworkFunctionHealth[] = [
  { name: "UERANSIM gNB", role: "Simulated 5G Radio Access", latencyMs: 6, status: "healthy" },
  { name: "UERANSIM UE", role: "Simulated 5G Subscriber", latencyMs: 7, status: "healthy" },
  { name: "MME", role: "Mobility Management", latencyMs: 9, status: "healthy" },
  { name: "HSS", role: "Subscriber Database", latencyMs: 11, status: "healthy" },
  { name: "PCRF", role: "Policy & Charging", latencyMs: 13, status: "healthy" },
  { name: "SGW-C", role: "Serving Gateway Control", latencyMs: 8, status: "healthy" },
  { name: "SGW-U", role: "Serving Gateway User Plane", latencyMs: 7, status: "healthy" },
  { name: "S/PGW-C", role: "Packet Gateway Control", latencyMs: 10, status: "healthy" },
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

function fallbackAccessInterfaces(networkFunctions: NetworkFunctionHealth[]): AccessInterfaceHealth[] {
  const simulator = networkFunctions.find((node) => node.name === "UERANSIM gNB");
  return [
    {
      id: "ueransim", label: "UERANSIM gNB", interface: "N2 / NGAP",
      status: simulator ? (simulator.status === "healthy" ? "connected" : "disconnected") : "unknown",
      peerAddress: null, associationCount: simulator?.status === "healthy" ? 1 : 0,
      source: simulator ? "service" : "unavailable",
    },
    {
      id: "external", label: "External gNB", interface: "N2 / NGAP", status: "unknown",
      peerAddress: null, associationCount: 0, source: "unavailable",
    },
  ];
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

    return { ...payload, accessInterfaces: payload.accessInterfaces ?? fallbackAccessInterfaces(payload.networkFunctions), mode: "live", checkedAt: new Date().toISOString() };
  } catch {
    return {
      mode: "live",
      coreStatus: "unavailable",
      checkedAt: new Date().toISOString(),
      networkFunctions: demoFunctions.map((nf) => ({ ...nf, latencyMs: null, status: "unavailable" })),
      accessInterfaces: fallbackAccessInterfaces([]),
    };
  }
}
