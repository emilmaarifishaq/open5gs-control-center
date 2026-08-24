import type { ReactNode } from "react";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext's RSC Link handler currently crashes and cancels shell navigation. */

type Section = "overview" | "epc" | "5gc";
const navItems = [
  { href: "/", label: "Overview", icon: "⌂", section: "overview" },
  { href: "/epc", label: "EPC / 4G", icon: "4G", section: "epc" },
  { href: "/5gc", label: "5G Core", icon: "5G", section: "5gc" },
] as const;

export function AppShell({ children, section }: { children: ReactNode; section: Section }) {
  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark">O5</span><span>Open5GS<small>Control Center</small></span></a>
      <div className="nav-label">Workspace</div>
      <nav aria-label="Navigasi utama">{navItems.map(item => <a className={`nav-item ${item.section === section ? "active" : ""}`} href={item.href} key={item.href}><span className="nav-icon">{item.icon}</span><b>{item.label}</b>{item.section === section ? <i className="nav-active-dot" /> : null}</a>)}</nav>
      <div className="nav-label nav-label-secondary">Quick guide</div>
      <div className="sidebar-guide"><span>1</span><p><b>Check status</b><small>Look for red</small></p><span>2</span><p><b>Open node</b><small>Inspect connections</small></p><span>3</span><p><b>Review logs</b><small>Find the cause</small></p></div>
      <div className="sidebar-foot"><div className="environment-row"><span className="pulse"/><div><b>Jakarta Lab</b><small>Core connected</small></div><span className="env-tag">LIVE</span></div><div className="operator"><span>EM</span><div><b>Emil Maarif</b><small>Administrator</small></div><i>•••</i></div></div>
    </aside>
    <section className="workspace"><div className="workspace-top"><div className="breadcrumb"><span>Open5GS</span><i>/</i><b>{section === "overview" ? "Overview" : section === "epc" ? "EPC Network" : "5G Core"}</b></div><div className="utility-actions"><span className="sync-label"><i/> Agent connected</span><button className="icon-button" type="button" aria-label="Notifications">●</button><span className="top-avatar">EM</span></div></div><div className="workspace-content">{children}</div></section>
  </main>;
}
