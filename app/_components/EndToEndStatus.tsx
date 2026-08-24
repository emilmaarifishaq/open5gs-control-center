"use client";

import { useEffect, useState } from "react";
import type { CoreHealth, EndToEndHealth } from "../../lib/open5gs/health";

type CheckState = "passed" | "failed" | "unknown";

function StateBadge({ state }: { state: CheckState }) {
  return <span className={`e2e-state ${state}`}><i />{state}</span>;
}

function booleanState(value: boolean | undefined): CheckState {
  return value === true ? "passed" : value === false ? "failed" : "unknown";
}

export function EndToEndStatus({ initialHealth }: { initialHealth?: EndToEndHealth }) {
  const [health, setHealth] = useState(initialHealth);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/open5gs/health", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as CoreHealth;
        if (active) { setHealth(payload.endToEnd); setCheckedAt(payload.checkedAt); }
      } catch { /* Keep the last valid observation. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const rows = [
    ["Runtime", "gNB + UE services", booleanState(health?.services)],
    ["N2 / NGAP", "gNB associated with AMF", booleanState(health?.n2)],
    ["Registration", "UE authenticated and registered", booleanState(health?.registration)],
    ["PDU session", "PSI 1 established", booleanState(health?.pduSession)],
    ["UE tunnel", health?.tunnelIp ? `${health.tunnelName} · ${health.tunnelIp}` : "No tunnel observed", booleanState(health?.tunnel)],
    ["User plane", health?.userPlane ? `Ping ${health.userPlane.target} · ${health.userPlane.packetLoss ?? "—"}% loss` : "No probe result", health?.userPlane.status ?? "unknown"],
  ] as const;

  return <section className="e2e-panel" aria-label="End-to-end test status">
    <div className="e2e-summary"><div><p className="eyebrow">LIVE END-TO-END TEST</p><h2>UERANSIM readiness</h2><p>Registration and traffic path from simulated UE to Open5GS.</p></div><div className={`e2e-overall ${health?.overall ?? "unavailable"}`}><i /><span><b>{health?.overall ?? "unavailable"}</b><small>{checkedAt ? `Updated ${new Date(checkedAt).toLocaleTimeString()}` : "Refreshing every 10 seconds"}</small></span></div></div>
    <div className="e2e-checks">{rows.map(([label, detail, state]) => <article key={label}><span className="e2e-check-icon">{state === "passed" ? "✓" : state === "failed" ? "!" : "?"}</span><div><b>{label}</b><small>{detail}</small></div><StateBadge state={state} /></article>)}</div>
  </section>;
}
