import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "../../_components/AppShell";
import { YamlEditor } from "../../_components/YamlEditor";
import { getCoreHealth } from "../../../lib/open5gs/health";
import { getNodeFile } from "../../../lib/open5gs/node-files";
import { getNode, nodes } from "../../../lib/network/catalog";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return nodes.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const node = getNode((await params).slug);
  if (!node) return { title: "Node not found" };
  return { title: `${node.name} · ${node.fullName}`, description: node.description, openGraph: { title: node.fullName, description: node.description, images: [] }, twitter: { title: node.fullName, description: node.description, images: [] } };
}

export default async function Page({ params }: Props) {
  const node = getNode((await params).slug);
  if (!node) notFound();
  const configPath = node.config ?? "";
  const logPath = node.service ? `/var/log/open5gs/${node.slug === "sepp" ? "sepp1" : node.slug === "spgwc" ? "smf" : node.slug}.log` : "";
  const [health, config, logs] = await Promise.all([getCoreHealth(), getNodeFile(node.slug, "config", configPath), getNodeFile(node.slug, "logs", logPath)]);
  const observed = health.networkFunctions.find((item) => item.name === node.name);
  const status = observed?.status ?? "healthy";
  return <AppShell section={node.core}>
    <a className="back-link" href={node.core === "epc" ? "/epc" : "/5gc"}>← Back to {node.core === "epc" ? "EPC" : "5G Core"} topology</a>
    <header className="node-hero"><span className={`hero-monogram ${node.layer}`}>{node.name}</span><div><p className="eyebrow">{node.core === "epc" ? "EPC / 4G" : "5G CORE"} · {node.layer.toUpperCase()}</p><h1>{node.fullName}</h1><p>{node.description}</p></div><span className={`status-chip ${status}`}><i />{status}</span></header>
    {node.slug === "amf" ? <section className="access-interface-panel"><div className="panel-head"><div><p className="eyebrow">N2 ACCESS INTERFACES</p><h2>gNB associations</h2></div><span className="read-only">LIVE · READ ONLY</span></div><div className="access-interface-grid">{health.accessInterfaces?.map((item) => <article className={`access-interface-card ${item.status}`} key={item.id}><div className="interface-card-head"><span className="interface-icon">{item.id === "ueransim" ? "SIM" : "RAN"}</span><span className={`interface-state ${item.status}`}><i />{item.status}</span></div><h3>{item.label}</h3><p>{item.id === "ueransim" ? "Simulator connection to AMF" : "Real radio access connection to AMF"}</p><dl><div><dt>INTERFACE</dt><dd>{item.interface}</dd></div><div><dt>PEER ADDRESS</dt><dd>{item.peerAddress ?? "Not observed"}</dd></div><div><dt>SCTP ASSOCIATIONS</dt><dd>{item.associationCount}</dd></div><div><dt>STATUS SOURCE</dt><dd>{item.source === "sctp" ? "Live SCTP socket" : item.source === "service" ? "Service fallback" : "Awaiting agent upgrade"}</dd></div></dl></article>)}</div></section> : null}
    <div className="detail-grid"><section className="detail-main panel"><div className="panel-head"><div><p className="eyebrow">NODE OVERVIEW</p><h2>Operational detail</h2></div><span className="read-only">LIVE</span></div><div className="detail-metrics"><div><small>STATUS</small><strong>{status}</strong></div><div><small>LATENCY</small><strong>{observed?.latencyMs == null ? "—" : `${observed.latencyMs} ms`}</strong></div><div><small>INTERFACES</small><strong>{node.interfaces.length}</strong></div><div><small>PEERS</small><strong>{node.peers.length}</strong></div></div><h3>Interfaces</h3><div className="tag-list">{node.interfaces.map((item) => <span key={item}>{item}</span>)}</div><h3>Connected nodes</h3><div className="peer-grid">{node.peers.map((slug) => { const peer = getNode(slug); return peer ? <a href={`/nodes/${slug}`} key={slug}><span className={`mini-dot ${peer.layer}`} />{peer.name}<small>{peer.role}</small><b>→</b></a> : null; })}</div></section><aside className="detail-side"><section className="panel compact"><p className="eyebrow">RUNTIME</p><dl><div><dt>Service</dt><dd>{node.service ?? "External node"}</dd></div><div><dt>Config</dt><dd>{node.config ?? "Managed externally"}</dd></div><div><dt>Data source</dt><dd>{health.mode === "live" ? "Open5GS agent" : "Demo data"}</dd></div></dl></section><section className="panel compact"><p className="eyebrow">SAFE OPERATIONS</p><span className="safe-note">Editing enabled</span><small className="helper">YAML validation, timestamped backup, service check, and automatic rollback are enforced.</small></section></aside></div>
    <section className="file-viewers">{config.available ? <YamlEditor slug={node.slug} path={config.path || configPath} initialContent={config.content} /> : <article className="file-panel"><header><div><p className="eyebrow">CONFIGURATION</p><h2>YAML configuration</h2></div><span>{configPath}</span></header><div className="empty-file">Configuration is not currently available from the agent for this node.</div></article>}<article className="file-panel"><header><div><p className="eyebrow">LATEST 200 LINES</p><h2>Service log</h2></div><span>{logs.path || logPath}</span></header>{logs.available ? <pre className="logs"><code>{logs.content || "The log is currently empty."}</code></pre> : <div className="empty-file">Logs are not currently available from the agent for this node.</div>}</article></section>
  </AppShell>;
}
