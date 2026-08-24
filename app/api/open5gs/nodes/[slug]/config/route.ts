export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const agentUrl = process.env.OPEN5GS_AGENT_URL?.replace(/\/$/, "");
  const token = process.env.OPEN5GS_AGENT_TOKEN;
  if (!agentUrl || !token) return Response.json({ ok: false, error: "Live agent is not configured" }, { status: 503 });
  const { slug } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "Invalid request" }, { status: 400 }); }
  const content = body && typeof body === "object" ? (body as { content?: unknown }).content : null;
  if (typeof content !== "string" || !content.trim() || new TextEncoder().encode(content).length > 131072) {
    return Response.json({ ok: false, error: "YAML must be between 1 byte and 128 KiB" }, { status: 400 });
  }
  try {
    const response = await fetch(`${agentUrl}/v1/nodes/${encodeURIComponent(slug)}/config`, {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }), cache: "no-store", signal: AbortSignal.timeout(65_000),
    });
    const result = await response.json() as { ok?: boolean; message?: string; error?: string };
    return Response.json(result, { status: response.status });
  } catch {
    return Response.json({ ok: false, error: "Open5GS agent did not respond" }, { status: 503 });
  }
}
