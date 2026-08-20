# Open5GS Control Center

A web-based operations interface for Open5GS. The current milestone is a responsive dashboard prototype that establishes the product design and the integration boundary for a real Open5GS deployment.

## Current capabilities

- 5G core health overview
- Registered UE, active session, traffic, and failure indicators
- Network Function status and latency
- Simplified gNB → AMF → NRF service topology
- Recent operational event stream
- Responsive desktop and mobile layout
- Read-only `GET /api/open5gs/health` integration contract
- Demo/live adapter with safe timeout and unavailable-state fallback

The dashboard currently uses representative data. It does not execute privileged service commands or connect to a production Open5GS database yet.

## Planned integration

The management API will expose a constrained interface to:

- Open5GS MongoDB for subscriber management
- Prometheus/Open5GS metrics for operational statistics
- Open5GS infoAPI for UE, gNB, and session state
- systemd or Docker for allowlisted service lifecycle actions
- journald for filtered logs
- validated YAML configuration with automatic backups

The browser must never receive direct database credentials, unrestricted shell access, or filesystem access.

## Connect an Open5GS agent

Copy `.env.example` to `.env.local`, then set `OPEN5GS_AGENT_URL` to the management agent reachable from the Control Center server. The optional `OPEN5GS_AGENT_TOKEN` is sent only from the server as a bearer token. Without an agent URL, the application stays in clearly labelled demo mode.

The agent health endpoint is expected at `GET /v1/health` and must return:

```json
{
  "coreStatus": "healthy",
  "networkFunctions": [
    { "name": "AMF", "role": "Access & Mobility", "latencyMs": 12, "status": "healthy" }
  ]
}
```

The repository includes a dependency-free reference agent in `agent/`. It checks an allowlist of Open5GS systemd services, requires bearer authentication for `/v1/health`, and exposes no mutation or shell endpoint. `/healthz` is an unauthenticated process-level liveness check.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validate

```bash
npm test
```

## Project status

This is an early MVP. Authentication, subscriber mutations, live metrics, service controls, audit logging, and production deployment are intentionally deferred to the next milestone.
