# Open5GS Control Center

A web operations dashboard for Open5GS EPC/4G and 5G Core networks. It provides operator-friendly health views, clickable network topology, UERANSIM end-to-end status, per-node logs, and controlled YAML configuration workflows.

## Features

- Separate EPC/4G and 5G Core workspaces
- Simple service-path view plus full 3GPP topology
- Network-function and interface health monitoring
- UERANSIM UE and gNodeB visibility
- Per-node YAML configuration and service logs
- Secured management agent with an allowlist and bearer authentication
- Automatic configuration backup, service validation, and rollback support
- Responsive desktop and mobile interface

## Installation

Follow the complete guide:

**[Open5GS + UERANSIM + Control Center deployment guide](docs/INSTALLATION.md)**

The guide covers Ubuntu and network preparation, MongoDB and Open5GS installation, AMF/UPF configuration, UERANSIM, Control Center deployment on macOS or Ubuntu, the management agent, startup order, verification, LAN access, and troubleshooting.

## Upstream projects

- [Open5GS](https://github.com/open5gs/open5gs)
- [Open5GS documentation](https://open5gs.org/open5gs/docs/)
- [UERANSIM](https://github.com/aligungr/UERANSIM)

## Quick local preview

Requirements: Node.js 22.13 or newer.

```bash
git clone https://github.com/emilmaarifishaq/open5gs-control-center.git
cd open5gs-control-center
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Without an agent URL, the dashboard runs in clearly labelled demo mode.

## Validate

```bash
npm run lint
npm test
```

## Security

Do not expose the agent port or the Control Center directly to the public internet. Use a private LAN, VPN, or a TLS reverse proxy with authentication. Never commit `.env.local`, agent tokens, subscriber keys, or production YAML files.

## License

This repository is independent from Open5GS and UERANSIM. Review the upstream licenses before redistribution or commercial use.
