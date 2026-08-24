"use client";

import { useEffect, useMemo, useState } from "react";
import type { CoreHealth, Open5GSMetrics } from "../../lib/open5gs/health";

function memoryLabel(bytes: number) {
  return bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "0 MB";
}

export function MetricsOverview({ initialMetrics }: { initialMetrics?: Open5GSMetrics }) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [samples, setSamples] = useState<number[]>(initialMetrics?.available ? [initialMetrics.activeUes] : []);

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/open5gs/health", { cache: "no-store" });
        if (!response.ok) return;
        const health = await response.json() as CoreHealth;
        if (!health.metrics) return;
        setMetrics(health.metrics);
        if (health.metrics.available) setSamples((current) => [...current, health.metrics!.activeUes].slice(-20));
      } catch { /* Preserve the last sample during a transient refresh failure. */ }
    };
    const timer = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const peak = useMemo(() => Math.max(1, ...samples), [samples]);
  const available = Boolean(metrics?.available);

  return <section className="telemetry-panel" aria-labelledby="telemetry-title">
    <div className="telemetry-heading"><div><p className="eyebrow">PROMETHEUS TELEMETRY</p><h2 id="telemetry-title">Core activity</h2><p>Live counters collected locally from Open5GS exporters.</p></div><span className={`exporter-summary ${available ? "up" : "down"}`}>{metrics?.availableSources ?? 0} / {metrics?.totalSources ?? 3} EXPORTERS</span></div>
    <div className="telemetry-metrics">
      <article><small>ACTIVE UE</small><strong>{available ? metrics!.activeUes.toLocaleString() : "—"}</strong><span>AMF registration counter</span></article>
      <article><small>PDU SESSIONS</small><strong>{available ? metrics!.pduSessions.toLocaleString() : "—"}</strong><span>SMF session counter</span></article>
      <article><small>PROCESS MEMORY</small><strong>{available ? memoryLabel(metrics!.processResidentMemoryBytes) : "—"}</strong><span>Combined exporters</span></article>
      <article><small>CPU TIME</small><strong>{available ? `${metrics!.processCpuSeconds.toFixed(1)} s` : "—"}</strong><span>Since process start</span></article>
    </div>
    {available ? <div className="telemetry-chart" aria-label="Recent active UE samples">{samples.map((value, index) => <i key={`${index}-${value}`} style={{ height: `${Math.max(8, value / peak * 100)}%` }} />)}</div> : <div className="telemetry-empty"><b>Metrics are not enabled yet.</b><span>Add the metrics server to amf.yaml, smf.yaml, and mme.yaml, restart those services, then this panel will update automatically.</span></div>}
    <div className="exporter-list">{(metrics?.sources ?? []).map((source) => <span className={source.available ? "up" : "down"} key={source.name}><i />{source.name}<em>{source.available ? `${source.latencyMs ?? 0} ms` : "Unavailable"}</em></span>)}</div>
  </section>;
}
