import { getCoreHealth } from "../lib/open5gs/health";

export default async function Home() {
  const health = await getCoreHealth();
  const isHealthy = health.coreStatus === "healthy";
  const sourceLabel = health.mode === "live" ? "Live agent" : "Demo data";
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">O5</span><span>Open5GS<br /><small>Control Center</small></span></div>
        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#overview"><span>01</span>Overview</a>
          <a className="nav-item" href="#functions"><span>02</span>Network Functions</a>
          <a className="nav-item" href="#subscribers"><span>03</span>Subscribers</a>
          <a className="nav-item" href="#sessions"><span>04</span>Sessions</a>
          <a className="nav-item" href="#logs"><span>05</span>Logs</a>
          <a className="nav-item" href="#configuration"><span>06</span>Configuration</a>
        </nav>
        <div className="sidebar-foot"><span className={`pulse ${isHealthy ? "" : "offline"}`} /> {isHealthy ? "Core connected" : "Core unavailable"}<small>Jakarta Lab · {sourceLabel}</small></div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div><p className="eyebrow">NETWORK OVERVIEW · {sourceLabel.toUpperCase()}</p><h1>{isHealthy ? "Core network is healthy" : "Core network is unavailable"}</h1><p className="subtle">Read-only operational view of your 5G standalone core.</p></div>
          <div className="top-actions"><span className="last-sync">Checked just now</span><button type="button">Add subscriber</button><div className="avatar">EM</div></div>
        </header>

        <div className="metrics-grid">
          <article className="metric-card featured">
            <div className="metric-label"><span>●</span> Registered UE</div><strong>1,284</strong><p><b>+8.2%</b> from last hour</p>
            <div className="sparkline" aria-label="Registration trend">{[31,38,35,46,42,58,54,69,64,78,74,88].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div>
          </article>
          <article className="metric-card"><div className="metric-label">Active sessions</div><strong>1,102</strong><p><b>85.8%</b> session rate</p></article>
          <article className="metric-card"><div className="metric-label">Downlink traffic</div><strong>2.48 <em>Gbps</em></strong><p><b>↑ 14%</b> peak at 2.81 Gbps</p></article>
          <article className="metric-card"><div className="metric-label">Registration failures</div><strong>7</strong><p className="warning"><b>0.54%</b> within threshold</p></article>
        </div>

        <div className="content-grid">
          <article className="panel topology" id="functions">
            <div className="panel-head"><div><p className="eyebrow">SERVICE TOPOLOGY</p><h2>Network functions</h2></div><a href="#functions">View all 12 →</a></div>
            <div className="flow">
              <div className="node access"><small>ACCESS</small><b>gNB</b><span>4 connected</span></div><div className="connector"><span>NGAP</span></div>
              <div className="node primary"><small>CONTROL</small><b>AMF</b><span>Healthy</span></div><div className="connector"><span>SBI</span></div>
              <div className="node"><small>DISCOVERY</small><b>NRF</b><span>Healthy</span></div>
            </div>
            <div className="nf-list">{health.networkFunctions.map((nf)=><div className="nf-row" key={nf.name}><span className="nf-monogram">{nf.name.slice(0,2)}</span><div><b>{nf.name}</b><small>{nf.role}</small></div><span className="latency">{nf.latencyMs === null ? "—" : `${nf.latencyMs} ms`}</span><span className={`status ${nf.status}`}><i />{nf.status[0].toUpperCase()+nf.status.slice(1)}</span></div>)}</div>
          </article>

          <article className="panel activity" id="sessions">
            <div className="panel-head"><div><p className="eyebrow">LIVE ACTIVITY</p><h2>Recent events</h2></div><span className="live"><i /> LIVE</span></div>
            <div className="event-list">
              <div className="event"><span className="event-icon success">✓</span><div><b>Registration accepted</b><p>IMSI …000001284</p></div><time>4s</time></div>
              <div className="event"><span className="event-icon success">↗</span><div><b>PDU session established</b><p>internet · 10.45.0.18</p></div><time>12s</time></div>
              <div className="event"><span className="event-icon warn">!</span><div><b>Authentication rejected</b><p>MAC failure · AMF</p></div><time>48s</time></div>
              <div className="event"><span className="event-icon success">✓</span><div><b>NF heartbeat received</b><p>UPF · Jakarta edge</p></div><time>1m</time></div>
              <div className="event"><span className="event-icon neutral">↔</span><div><b>Handover completed</b><p>gNB-02 → gNB-04</p></div><time>3m</time></div>
            </div>
            <a className="all-events" href="#logs">Open event stream →</a>
          </article>
        </div>
      </section>
    </main>
  );
}
