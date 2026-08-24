#!/usr/bin/env python3
"""Constrained read-only agent for an Open5GS systemd host."""

from __future__ import annotations

import hmac
import json
import os
import subprocess
import time
import re
import urllib.error
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


NETWORK_FUNCTIONS = (
    ("UERANSIM gNB", "Simulated 5G Radio Access", "ueransim-gnb"),
    ("UERANSIM UE", "Simulated 5G Subscriber", "ueransim-ue"),
    ("MME", "Mobility Management", "open5gs-mmed"),
    ("HSS", "Subscriber Database", "open5gs-hssd"),
    ("PCRF", "Policy & Charging", "open5gs-pcrfd"),
    ("SGW-C", "Serving Gateway Control", "open5gs-sgwcd"),
    ("SGW-U", "Serving Gateway User Plane", "open5gs-sgwud"),
    ("S/PGW-C", "Packet Gateway Control", "open5gs-smfd"),
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

UERANSIM_HOME = str(Path.home() / "UERANSIM")
NODE_FILES = {
    "gnb": (f"{UERANSIM_HOME}/config/open5gs-gnb.yaml", "journal:ueransim-gnb"),
    "ue-5g": (f"{UERANSIM_HOME}/config/open5gs-ue.yaml", "journal:ueransim-ue"),
    "amf": ("/etc/open5gs/amf.yaml", "/var/log/open5gs/amf.log"),
    "ausf": ("/etc/open5gs/ausf.yaml", "/var/log/open5gs/ausf.log"),
    "bsf": ("/etc/open5gs/bsf.yaml", "/var/log/open5gs/bsf.log"),
    "hss": ("/etc/open5gs/hss.yaml", "/var/log/open5gs/hss.log"),
    "mme": ("/etc/open5gs/mme.yaml", "/var/log/open5gs/mme.log"),
    "nrf": ("/etc/open5gs/nrf.yaml", "/var/log/open5gs/nrf.log"),
    "nssf": ("/etc/open5gs/nssf.yaml", "/var/log/open5gs/nssf.log"),
    "pcf": ("/etc/open5gs/pcf.yaml", "/var/log/open5gs/pcf.log"),
    "pcrf": ("/etc/open5gs/pcrf.yaml", "/var/log/open5gs/pcrf.log"),
    "scp": ("/etc/open5gs/scp.yaml", "/var/log/open5gs/scp.log"),
    "sepp": ("/etc/open5gs/sepp.yaml", "/var/log/open5gs/sepp1.log"),
    "sgwc": ("/etc/open5gs/sgwc.yaml", "/var/log/open5gs/sgwc.log"),
    "sgwu": ("/etc/open5gs/sgwu.yaml", "/var/log/open5gs/sgwu.log"),
    "smf": ("/etc/open5gs/smf.yaml", "/var/log/open5gs/smf.log"),
    "spgwc": ("/etc/open5gs/smf.yaml", "/var/log/open5gs/smf.log"),
    "udm": ("/etc/open5gs/udm.yaml", "/var/log/open5gs/udm.log"),
    "udr": ("/etc/open5gs/udr.yaml", "/var/log/open5gs/udr.log"),
    "upf": ("/etc/open5gs/upf.yaml", "/var/log/open5gs/upf.log"),
}

AMF_NGAP_PORT = 38412
E2E_STATUS_FILE = Path.home() / "open5gs-control-agent" / "ueransim-e2e-status.json"
PENDING_DIR = Path.home() / "open5gs-control-agent" / "pending"
CONFIG_APPLY_HELPER = "/usr/local/sbin/open5gs-config-apply"
PROMETHEUS_ENDPOINTS = {
    "AMF": os.environ.get("OPEN5GS_AMF_METRICS_URL", "http://127.0.0.5:9090/metrics"),
    "SMF": os.environ.get("OPEN5GS_SMF_METRICS_URL", "http://127.0.0.4:9090/metrics"),
    "MME": os.environ.get("OPEN5GS_MME_METRICS_URL", "http://127.0.0.2:9090/metrics"),
}


def _prometheus_values(content: str) -> dict[str, float]:
    values: dict[str, float] = {}
    for line in content.splitlines():
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$", line.strip())
        if not match:
            continue
        name, raw = match.groups()
        values[name] = values.get(name, 0.0) + float(raw)
    return values


def _first_metric(values: dict[str, float], *names: str) -> float | None:
    for name in names:
        if name in values:
            return values[name]
    return None


def prometheus_health() -> dict[str, object]:
    """Collect a small allowlisted summary from local Open5GS exporters."""
    sources: list[dict[str, object]] = []
    active_ues = 0.0
    pdu_sessions = 0.0
    total_rss = 0.0
    total_cpu = 0.0
    for name, endpoint in PROMETHEUS_ENDPOINTS.items():
        started = time.monotonic()
        try:
            request = urllib.request.Request(endpoint, headers={"Accept": "text/plain"})
            with urllib.request.urlopen(request, timeout=2) as response:
                content = response.read(524288).decode("utf-8", errors="replace")
            values = _prometheus_values(content)
            ue_count = _first_metric(values, "ues_active", "fivegs_amffunction_rm_registeredsubnbr")
            session_count = _first_metric(values, "fivegs_smffunction_sm_sessionnbr", "pdu_sessions_active")
            rss = _first_metric(values, "process_resident_memory_bytes")
            cpu = _first_metric(values, "process_cpu_seconds_total")
            active_ues += ue_count or 0
            pdu_sessions += session_count or 0
            total_rss += rss or 0
            total_cpu += cpu or 0
            sources.append({"name": name, "available": True, "latencyMs": max(1, round((time.monotonic() - started) * 1000)), "metricCount": len(values)})
        except (OSError, ValueError, urllib.error.URLError):
            sources.append({"name": name, "available": False, "latencyMs": None, "metricCount": 0})
    available = sum(1 for source in sources if source["available"])
    return {
        "available": available > 0,
        "availableSources": available,
        "totalSources": len(sources),
        "activeUes": int(active_ues),
        "pduSessions": int(pdu_sessions),
        "processResidentMemoryBytes": int(total_rss),
        "processCpuSeconds": round(total_cpu, 3),
        "sources": sources,
    }


def _configured_ueransim_ip() -> str | None:
    configured = os.environ.get("UERANSIM_GNB_IP", "").strip()
    if configured:
        return configured
    try:
        content = Path(NODE_FILES["gnb"][0]).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    match = re.search(r"^\s*(?:linkIp|ngapIp):\s*([^\s#]+)", content, re.MULTILINE)
    return match.group(1).strip("'\"") if match else None


def access_interface_health() -> list[dict[str, object]]:
    """Read established N2 SCTP associations without changing host state."""
    try:
        result = subprocess.run(
            ["ss", "-H", "-n", "-A", "sctp", "state", "established"],
            check=False, capture_output=True, text=True, timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        result = None

    available = result is not None and result.returncode == 0
    base = {"interface": "N2 / NGAP", "peerAddress": None, "associationCount": 0, "source": "sctp" if available else "unavailable"}
    simulator = {**base, "id": "ueransim", "label": "UERANSIM gNB", "status": "disconnected" if available else "unknown"}
    external = {**base, "id": "external", "label": "External gNB", "status": "disconnected" if available else "unknown"}
    if not available:
        return [simulator, external]

    simulator_ip = _configured_ueransim_ip()
    external_ip = os.environ.get("EXTERNAL_GNB_IP", "").strip() or None
    peers: list[str] = []
    endpoint_pattern = re.compile(r"(\[[0-9a-fA-F:]+\]|[0-9.]+):(\d+)")
    for line in result.stdout.splitlines():
        endpoints = endpoint_pattern.findall(line)
        if len(endpoints) < 2:
            continue
        left, right = endpoints[-2], endpoints[-1]
        if int(left[1]) == AMF_NGAP_PORT:
            peers.append(right[0].strip("[]"))
        elif int(right[1]) == AMF_NGAP_PORT:
            peers.append(left[0].strip("[]"))

    simulator_peers = sorted({peer for peer in peers if simulator_ip and peer == simulator_ip})
    external_peers = sorted({peer for peer in peers if peer == external_ip}) if external_ip else sorted({peer for peer in peers if not simulator_ip or peer != simulator_ip})
    for item, matched in ((simulator, simulator_peers), (external, external_peers)):
        item["associationCount"] = len(matched)
        item["peerAddress"] = matched[0] if matched else None
        item["status"] = "connected" if matched else "disconnected"
    if not simulator_ip:
        simulator["status"] = "unknown"
        simulator["source"] = "unavailable"
    return [simulator, external]


def read_node_file(slug: str, kind: str) -> dict[str, object] | None:
    files = NODE_FILES.get(slug)
    if not files or kind not in {"config", "logs"}:
        return None
    path_value = files[0 if kind == "config" else 1]
    if kind == "logs" and (path_value.startswith("journal:") or path_value.startswith("user-journal:")):
        user_unit = path_value.startswith("user-journal:")
        unit = path_value.split(":", 1)[1]
        command = ["journalctl", *(["--user"] if user_unit else []), "-u", unit, "-n", "200", "--no-pager", "--output=short-iso"]
        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
        except (OSError, subprocess.TimeoutExpired):
            return {"node": slug, "kind": kind, "path": f"journalctl -u {unit}", "available": False, "content": "", "modifiedAt": None}
        return {"node": slug, "kind": kind, "path": f"journalctl -u {unit}", "available": result.returncode == 0, "content": result.stdout, "modifiedAt": None}
    path = Path(path_value)
    try:
        if kind == "logs":
            with path.open("r", encoding="utf-8", errors="replace") as stream:
                content = "".join(deque(stream, maxlen=200))
        else:
            content = path.read_text(encoding="utf-8", errors="replace")[:131072]
        modified = path.stat().st_mtime
    except OSError:
        return {"node": slug, "kind": kind, "path": str(path), "available": False, "content": "", "modifiedAt": None}
    return {"node": slug, "kind": kind, "path": str(path), "available": True, "content": content, "modifiedAt": modified}


def apply_node_config(slug: str, content: str) -> tuple[int, dict[str, object]]:
    if slug not in NODE_FILES or not isinstance(content, str) or not content.strip() or len(content.encode()) > 131072:
        return 400, {"ok": False, "error": "Invalid configuration payload"}
    PENDING_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    pending = PENDING_DIR / f"{slug}.yaml"
    temporary = PENDING_DIR / f".{slug}.{os.getpid()}.tmp"
    try:
        temporary.write_text(content, encoding="utf-8")
        temporary.chmod(0o600)
        temporary.replace(pending)
        result = subprocess.run(
            ["sudo", "-n", CONFIG_APPLY_HELPER, slug], check=False,
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        temporary.unlink(missing_ok=True)
        return 503, {"ok": False, "error": f"Apply helper unavailable: {error}"}
    message = (result.stdout or result.stderr).strip()
    if result.returncode != 0:
        return 422, {"ok": False, "error": message or "Validation or service restart failed"}
    return 200, {"ok": True, "message": message}


def service_health(name: str) -> tuple[str, int]:
    started = time.monotonic()
    try:
        command = ["systemctl", "is-active", "--quiet", name]
        result = subprocess.run(
            command,
            check=False,
            timeout=2,
        )
        status = "healthy" if result.returncode == 0 else "unavailable"
        if status == "unavailable" and name in {"ueransim-gnb", "ueransim-ue"}:
            binary = "nr-gnb" if name.endswith("gnb") else "nr-ue"
            process = subprocess.run(["pgrep", "-x", binary], check=False, capture_output=True, timeout=2)
            status = "healthy" if process.returncode == 0 else "unavailable"
    except (OSError, subprocess.TimeoutExpired):
        status = "unavailable"
    latency_ms = max(1, round((time.monotonic() - started) * 1000))
    return status, latency_ms


def _journal(unit: str) -> str:
    try:
        result = subprocess.run(
            ["journalctl", "-u", unit, "-n", "300", "--no-pager", "--output=cat"],
            check=False, capture_output=True, text=True, timeout=3,
        )
        return result.stdout if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def end_to_end_health(access_interfaces: list[dict[str, object]]) -> dict[str, object]:
    gnb_status, _ = service_health("ueransim-gnb")
    ue_status, _ = service_health("ueransim-ue")
    logs = _journal("ueransim-ue")
    tunnel_matches = re.findall(r"TUN interface\[([^,\]]+),\s*([^\]]+)\] is up", logs)
    simulator = next((item for item in access_interfaces if item["id"] == "ueransim"), None)
    tunnel_name, tunnel_ip = tunnel_matches[-1] if tunnel_matches else (None, None)
    user_plane: dict[str, object] = {"status": "unknown", "target": "10.45.0.1", "packetLoss": None}
    try:
        probe = json.loads(E2E_STATUS_FILE.read_text(encoding="utf-8"))
        if isinstance(probe, dict):
            user_plane.update({key: probe.get(key) for key in ("status", "target", "packetLoss", "checkedAt") if key in probe})
    except (OSError, ValueError, TypeError):
        pass
    checks = {
        "services": gnb_status == "healthy" and ue_status == "healthy",
        "n2": bool(simulator and simulator["status"] == "connected"),
        "registration": "Initial Registration is successful" in logs,
        "pduSession": "PDU Session establishment is successful" in logs,
        "tunnel": bool(tunnel_name and tunnel_ip),
    }
    overall = "passed" if all(checks.values()) and user_plane["status"] == "passed" else "degraded"
    if not any(checks.values()):
        overall = "unavailable"
    return {"overall": overall, **checks, "tunnelName": tunnel_name, "tunnelIp": tunnel_ip, "userPlane": user_plane}


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
    interfaces = access_interface_health()
    return {"coreStatus": core_status, "networkFunctions": functions, "accessInterfaces": interfaces, "endToEnd": end_to_end_health(interfaces), "metrics": prometheus_health()}


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
        path = urlparse(self.path).path
        if path == "/healthz":
            self._json(200, {"status": "ok"})
            return
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        if path == "/v1/health":
            self._json(200, build_health())
            return
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[:2] == ["v1", "nodes"]:
            payload = read_node_file(parts[2], parts[3])
            if payload is not None:
                self._json(200, payload)
                return
        self._json(404, {"error": "not_found"})

    def do_PUT(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 4 or parts[:2] != ["v1", "nodes"] or parts[3] != "config":
            self._json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 140000:
                raise ValueError("invalid length")
            body = json.loads(self.rfile.read(length))
            content = body.get("content") if isinstance(body, dict) else None
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"ok": False, "error": "Invalid JSON payload"})
            return
        status, payload = apply_node_config(parts[2], content)
        self._json(status, payload)

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
