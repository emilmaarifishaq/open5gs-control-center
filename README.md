# Open5GS Control Center

A web-based operations interface for Open5GS. The current milestone is a responsive dashboard prototype that establishes the product design and the integration boundary for a real Open5GS deployment.

## Current capabilities

- 5G core health overview
- Registered UE, active session, traffic, and failure indicators
- Network Function status and latency
- Simplified gNB → AMF → NRF service topology
- Recent operational event stream
- Responsive desktop and mobile layout

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
