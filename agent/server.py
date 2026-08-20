#!/usr/bin/env python3
"""Minimal read-only health agent for an Open5GS systemd host."""

from __future__ import annotations

import hmac
import json
import os
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


NETWORK_FUNCTIONS = (
    ("AMF", "Access & Mobility", "open5gs-amfd"),
    ("SMF", "Session Management", "open5gs-smfd"),
    ("UPF", "User Plane", "open5gs-upfd"),
    ("NRF", "NF Repository", "open5gs-nrfd"),
    ("AUSF", "Authentication", "open5gs-ausfd"),
    ("UDM", "Unified Data Management", "open5gs-udmd"),
    ("UDR", "Unified Data Repository", "open5gs-udrd"),
    ("PCF", "Policy Control", "open5gs-pcfd"),
    ("NSSF", "Slice Selection", "open5gs-nssfd"),
    ("BSF", "Binding Support", "open5gs-bsfd"),
    ("SCP", "Service Communication Proxy", "open5gs-scpd"),
    ("SEPP", "Edge Protection", "open5gs-seppd"),
)


def service_health(name: str) -> tuple[str, int]:
    started = time.monotonic()
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "--quiet", name],
            check=False,
            timeout=2,
        )
        status = "healthy" if result.returncode == 0 else "unavailable"
    except (OSError, subprocess.TimeoutExpired):
        status = "unavailable"
    latency_ms = max(1, round((time.monotonic() - started) * 1000))
    return status, latency_ms


def build_health() -> dict[str, object]:
    functions = []
    for name, role, service in NETWORK_FUNCTIONS:
        status, latency_ms = service_health(service)
        functions.append(
            {"name": name, "role": role, "latencyMs": latency_ms, "status": status}
        )

    statuses = {item["status"] for item in functions}
    core_status = "healthy" if statuses == {"healthy"} else "degraded"
    if statuses == {"unavailable"}:
        core_status = "unavailable"
    return {"coreStatus": core_status, "networkFunctions": functions}


class AgentHandler(BaseHTTPRequestHandler):
    server_version = "Open5GSControlAgent/0.1"

    def _json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        token = os.environ.get("OPEN5GS_AGENT_TOKEN", "")
        if not token:
            return False
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, f"Bearer {token}")

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path == "/healthz":
            self._json(200, {"status": "ok"})
            return
        if self.path != "/v1/health":
            self._json(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        self._json(200, build_health())

    def log_message(self, message: str, *args: object) -> None:
        print(f"{self.address_string()} {message % args}", flush=True)


def main() -> None:
    host = os.environ.get("OPEN5GS_AGENT_HOST", "127.0.0.1")
    port = int(os.environ.get("OPEN5GS_AGENT_PORT", "9105"))
    server = ThreadingHTTPServer((host, port), AgentHandler)
    print(f"Open5GS Control Agent listening on {host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
