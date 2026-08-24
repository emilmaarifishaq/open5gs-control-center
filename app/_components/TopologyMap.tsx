import type { CoreType, NetworkNode } from "../../lib/network/catalog";

type LinkState = "up" | "down" | "unknown";
type Point = { slug: string; x: number; y: number };
type Edge = { from: string; to: string; label: string };
type Diagram = { width: number; height: number; points: Point[]; edges: Edge[]; buses?: { label: string; x: number; y: number; width: number }[] };

const diagrams: Record<CoreType, Diagram> = {
  "5gc": {
    width: 1320, height: 570,
    points: [
      { slug: "nssf", x: 24, y: 38 }, { slug: "nrf", x: 164, y: 38 }, { slug: "ausf", x: 304, y: 38 },
      { slug: "udm", x: 444, y: 38 }, { slug: "udr", x: 584, y: 38 }, { slug: "pcf", x: 724, y: 38 },
      { slug: "bsf", x: 864, y: 38 }, { slug: "scp", x: 1004, y: 38 }, { slug: "sepp", x: 1144, y: 38 },
      { slug: "amf", x: 350, y: 262 }, { slug: "smf", x: 650, y: 262 },
      { slug: "ue-5g", x: 48, y: 448 }, { slug: "gnb", x: 300, y: 448 }, { slug: "upf", x: 720, y: 448 }, { slug: "dn", x: 1010, y: 448 },
    ],
    buses: [{ label: "SERVICE-BASED INTERFACE (SBI)", x: 76, y: 201, width: 1120 }],
    edges: [
      { from: "nssf", to: "amf", label: "N22" }, { from: "nrf", to: "amf", label: "Nnrf" },
      { from: "ausf", to: "amf", label: "N12" }, { from: "udm", to: "amf", label: "N8" },
      { from: "udr", to: "udm", label: "Nudr" }, { from: "pcf", to: "smf", label: "N7" },
      { from: "bsf", to: "pcf", label: "Nbsf" }, { from: "scp", to: "nrf", label: "SBI" },
      { from: "sepp", to: "scp", label: "N32" }, { from: "amf", to: "smf", label: "N11" },
      { from: "ue-5g", to: "amf", label: "N1" }, { from: "gnb", to: "amf", label: "N2" },
      { from: "gnb", to: "upf", label: "N3" }, { from: "smf", to: "upf", label: "N4" },
      { from: "upf", to: "dn", label: "N6" }, { from: "ue-5g", to: "gnb", label: "Uu" },
    ],
  },
  epc: {
    width: 1180, height: 540,
    points: [
      { slug: "hss", x: 430, y: 34 }, { slug: "pcrf", x: 860, y: 34 },
      { slug: "mme", x: 430, y: 210 }, { slug: "sgwc", x: 650, y: 210 }, { slug: "spgwc", x: 860, y: 210 },
      { slug: "ue-lte", x: 35, y: 410 }, { slug: "enb", x: 245, y: 410 }, { slug: "sgwu", x: 650, y: 410 },
    ],
    edges: [
      { from: "ue-lte", to: "enb", label: "LTE-Uu" }, { from: "enb", to: "mme", label: "S1-MME" },
      { from: "enb", to: "sgwu", label: "S1-U" }, { from: "mme", to: "hss", label: "S6a" },
      { from: "mme", to: "sgwc", label: "S11" }, { from: "sgwc", to: "sgwu", label: "PFCP" },
      { from: "sgwc", to: "spgwc", label: "S5-C" }, { from: "sgwu", to: "spgwc", label: "S5-U" },
      { from: "spgwc", to: "pcrf", label: "Gx" }, { from: "pcrf", to: "hss", label: "Rx / Cx" },
    ],
  },
};

function linkState(left: NetworkNode, right: NetworkNode, statuses: Record<string, string>): LinkState {
  const leftStatus = statuses[left.name];
  const rightStatus = statuses[right.name];
  if (!leftStatus || !rightStatus) return "unknown";
  if (leftStatus === "unavailable" || rightStatus === "unavailable") return "down";
  return "up";
}

export function TopologyMap({ core, nodes, statuses = {} }: { core: CoreType; nodes: NetworkNode[]; statuses?: Record<string, string> }) {
  const diagram = diagrams[core];
  const nodeMap = new Map(nodes.map((node) => [node.slug, node]));
  const pointMap = new Map(diagram.points.map((point) => [point.slug, point]));
  const nodeWidth = 120;
  const nodeHeight = 82;
  return <div className={`architecture-scroll ${core}`}><div className="architecture-canvas" style={{ width: diagram.width, height: diagram.height }}>
    <div className="architecture-zone zone-services">NETWORK &amp; SERVICE FUNCTIONS</div>
    <div className="architecture-zone zone-control">CONTROL PLANE</div>
    <div className="architecture-zone zone-access">ACCESS &amp; USER PLANE</div>
    {diagram.buses?.map((bus) => <div className="sbi-bus" key={bus.label} style={{ left: bus.x, top: bus.y, width: bus.width }}><span>{bus.label}</span></div>)}
    {diagram.edges.map((edge) => {
      const fromPoint = pointMap.get(edge.from); const toPoint = pointMap.get(edge.to);
      const fromNode = nodeMap.get(edge.from); const toNode = nodeMap.get(edge.to);
      if (!fromPoint || !toPoint || !fromNode || !toNode) return null;
      const x1 = fromPoint.x + nodeWidth / 2, y1 = fromPoint.y + nodeHeight / 2;
      const x2 = toPoint.x + nodeWidth / 2, y2 = toPoint.y + nodeHeight / 2;
      const length = Math.hypot(x2 - x1, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const state = linkState(fromNode, toNode, statuses);
      return <div className={`architecture-link ${state}`} key={`${edge.from}-${edge.to}-${edge.label}`} style={{ left: x1, top: y1, width: length, transform: `rotate(${angle}deg)` }} aria-label={`${fromNode.name} to ${toNode.name} via ${edge.label}: ${state}`}><span style={{ transform: `translate(-50%, -50%) rotate(${-angle}deg)` }}>{edge.label}<em>{state}</em></span></div>;
    })}
    {diagram.points.map((point) => { const node = nodeMap.get(point.slug); if (!node) return null; const nodeStatus = statuses[node.name] ?? "unknown"; return <a className={`architecture-node ${node.layer}`} href={`/nodes/${node.slug}`} key={point.slug} style={{ left: point.x, top: point.y }}><span className={`node-state ${nodeStatus}`} /><small>{node.layer}</small><strong>{node.name}</strong><span>{node.role}</span></a>; })}
  </div></div>;
}
