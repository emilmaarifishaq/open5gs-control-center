"use client";

import { useState } from "react";

export function YamlEditor({ slug, path, initialContent }: { slug: string; path: string; initialContent: string }) {
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(initialContent);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const dirty = content !== saved;

  async function apply() {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/open5gs/nodes/${encodeURIComponent(slug)}/config`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
      });
      const result = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Configuration could not be applied");
      setSaved(content); setEditing(false); setNotice({ kind: "success", text: "Validated, backed up, applied, and service restarted." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Configuration could not be applied" });
    } finally { setBusy(false); }
  }

  return <article className={`file-panel yaml-editor ${editing ? "editing" : ""}`}>
    <header><div><p className="eyebrow">CONFIGURATION</p><h2>YAML config</h2></div><span>{path}</span></header>
    {notice ? <div className={`editor-notice ${notice.kind}`} role="status">{notice.text}</div> : null}
    {editing ? <textarea aria-label="YAML configuration" value={content} onChange={event => setContent(event.target.value)} spellCheck={false} /> : <pre><code>{content}</code></pre>}
    <footer className="editor-actions">
      {editing ? <><button className="editor-secondary" disabled={busy} onClick={() => { setContent(saved); setEditing(false); setNotice(null); }}>Cancel</button><button className="editor-primary" disabled={busy || !dirty} onClick={apply}>{busy ? "Validating & applying…" : "Save & apply"}</button></> : <button className="editor-primary" onClick={() => { setEditing(true); setNotice(null); }}>Edit YAML</button>}
      <small>{editing ? "A backup is created automatically. Failed restarts roll back." : "Changes are validated and applied through the secured VM agent."}</small>
    </footer>
  </article>;
}
