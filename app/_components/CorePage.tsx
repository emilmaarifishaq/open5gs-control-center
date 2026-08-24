import type { CoreType, NetworkNode } from "../../lib/network/catalog";
import { getCoreNodes } from "../../lib/network/catalog";
import { getCoreHealth } from "../../lib/open5gs/health";
import { AppShell } from "./AppShell";
import { TopologyMap } from "./TopologyMap";
import { EndToEndStatus } from "./EndToEndStatus";

const servicePaths: Record<CoreType, string[]> = {
  epc: ["ue-lte", "enb", "mme", "sgwc", "sgwu", "spgwc"],
  "5gc": ["ue-5g", "gnb", "amf", "smf", "upf", "dn"],
};

const pathInterfaces: Record<CoreType, string[]> = {
  epc: ["LTE-Uu", "S1-MME", "S11", "PFCP", "S5 / SGi"],
  "5gc": ["Uu", "N2", "N11", "N4", "N6"],
};

function nodeState(node: NetworkNode, statuses: Record<string, string>) {
  return statuses[node.name] ?? "unknown";
}

function stateText(status: string) {
  if (status === "healthy") return "Running";
  if (status === "degraded") return "Needs attention";
  if (status === "unavailable") return "Unavailable";
  return "Unknown";
}

export async function CorePage({ core }: { core: CoreType }) {
  const health = await getCoreHealth();
  const coreNodes = getCoreNodes(core);
  const statuses = Object.fromEntries(health.networkFunctions.map((node) => [node.name, node.status]));
  const title = core === "epc" ? "EPC / 4G Core" : "5G Core Network";
  const pathNodes = servicePaths[core].map((slug) => coreNodes.find((node) => node.slug === slug)).filter((node): node is NetworkNode => Boolean(node));
  const unavailable = coreNodes.filter((node) => nodeState(node, statuses) === "unavailable");
  const healthy = coreNodes.filter((node) => nodeState(node, statuses) === "healthy").length;

  return <AppShell section={core}>
    <header className="page-header simplified-header">
      <div><p className="eyebrow">{core === "epc" ? "4G PACKET CORE" : "5G STANDALONE CORE"} · {health.mode.toUpperCase()}</p><h1>{title}</h1><p className="subtle">{core === "epc" ? "Monitor the LTE device path through the packet gateway." : "Monitor UERANSIM, UE registration, data sessions, and every 5G Core function."}</p></div>
      <div className={`operator-summary ${health.coreStatus}`}><span className={`pulse ${health.coreStatus === "unavailable" ? "offline" : ""}`} /><div><small>NETWORK STATUS</small><b>{health.coreStatus === "healthy" ? "Operational" : "Attention required"}</b><em>{healthy} of {coreNodes.length} nodes running</em></div></div>
    </header>

    {unavailable.length ? <section className="attention-banner"><span>!</span><div><b>{unavailable.length} {unavailable.length === 1 ? "node requires" : "nodes require"} attention</b><p>{unavailable.slice(0, 4).map((node) => node.name).join(", ")}{unavailable.length > 4 ? ` and ${unavailable.length - 4} more` : ""}</p></div><a href={`/nodes/${unavailable[0].slug}`}>Investigate now →</a></section> : <section className="all-clear-banner"><span>✓</span><div><b>No issues detected</b><p>The primary service path and network functions are responding normally.</p></div></section>}

    <section className="journey-panel" aria-labelledby="service-path-title">
      <div className="journey-heading"><div><p className="eyebrow">START HERE</p><h2 id="service-path-title">Primary service path</h2><p>Follow the connection from the device to the data network. Select any node to view its details.</p></div><span className="simple-view-tag">SIMPLE VIEW</span></div>
      <div className="service-path">{pathNodes.map((node, index) => { const status = nodeState(node, statuses); return <div className="service-path-step" key={node.slug}>
        <a className={`service-path-node ${node.layer} ${status}`} href={`/nodes/${node.slug}`}><span className="path-number">{String(index + 1).padStart(2, "0")}</span><span className="path-node-copy"><small>{node.role}</small><strong>{node.name}</strong><em><i />{stateText(status)}</em></span><b className="path-open">→</b></a>
        {index < pathNodes.length - 1 ? <div className={`path-connector ${status === "unavailable" || nodeState(pathNodes[index + 1], statuses) === "unavailable" ? "down" : status === "unknown" ? "unknown" : "up"}`}><span>{pathInterfaces[core][index]}</span><i /></div> : null}
      </div>; })}</div>
    </section>

    {core === "5gc" ? <div id="readiness"><EndToEndStatus initialHealth={health.endToEnd} /></div> : null}

    <details className="advanced-topology" id="topology" open>
      <summary><span><small>ENGINEERING VIEW</small><b>Full topology and interfaces</b></span><em>Expand / collapse map</em></summary>
      <section className="topology-panel"><div className="topology-toolbar"><div><p className="eyebrow">LIVE NETWORK MAP</p><h2>{title} architecture</h2></div><div className="legend"><span><i className="dot link-up" />Up</span><span><i className="dot link-down" />Down</span><span><i className="dot link-unknown" />Unknown</span></div></div><TopologyMap core={core} nodes={coreNodes} statuses={statuses} /><div className="canvas-footer"><span><i className="pulse" /> Link status is derived from both endpoints</span><em>Scroll horizontally when needed</em></div></section>
    </details>

    <section className="node-directory"><div className="panel-head"><div><p className="eyebrow">ALL NODES</p><h2>Select a network function</h2><p className="section-helper">Open a node to inspect status, connections, YAML configuration, and logs.</p></div><span className="read-only">{coreNodes.length} NODES</span></div><div className="directory-grid">{coreNodes.map((node) => { const status = nodeState(node, statuses); return <a href={`/nodes/${node.slug}`} className="directory-card" key={node.slug}><span className={`node-badge ${node.layer}`}>{node.name}</span><div><b>{node.fullName}</b><p>{node.role}</p></div><span className={`directory-status ${status}`}><i />{stateText(status)}</span><span className="arrow">→</span></a>; })}</div></section>
  </AppShell>;
}
