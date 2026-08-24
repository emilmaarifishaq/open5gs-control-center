#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this setup with sudo." >&2
  exit 1
fi

OWNER=papibarra
OWNER_HOME=/home/papibarra
SOURCE_DIR="$OWNER_HOME/open5gs-control-agent/deploy/ueransim"
UERANSIM_DIR="$OWNER_HOME/UERANSIM"
BACKUP_DIR="$OWNER_HOME/open5gs-backups/ueransim-netns-$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ${1:-} == "--install-config-editor" ]]; then
  HELPER_SOURCE="$OWNER_HOME/open5gs-control-agent/open5gs-config-apply"
  [[ -f "$HELPER_SOURCE" ]] || { echo "Missing helper: $HELPER_SOURCE" >&2; exit 1; }
  install -m 755 "$HELPER_SOURCE" /usr/local/sbin/open5gs-config-apply
  install -d -m 700 -o "$OWNER" -g "$OWNER" "$OWNER_HOME/open5gs-control-agent/pending"
  cat > /etc/sudoers.d/open5gs-config-editor <<EOF
$OWNER ALL=(root) NOPASSWD: /usr/local/sbin/open5gs-config-apply *
EOF
  chmod 440 /etc/sudoers.d/open5gs-config-editor
  visudo -cf /etc/sudoers.d/open5gs-config-editor
  echo "Open5GS configuration editor helper installed."
  exit 0
fi

for file in /etc/open5gs/amf.yaml /etc/open5gs/upf.yaml "$UERANSIM_DIR/config/open5gs-gnb.yaml" "$UERANSIM_DIR/config/open5gs-ue.yaml"; do
  [[ -f "$file" ]] || { echo "Missing required file: $file" >&2; exit 1; }
done
for file in ueransim-netns.service ueransim-gnb-system.service ueransim-ue-system.service; do
  [[ -f "$SOURCE_DIR/$file" ]] || { echo "Missing deployment file: $SOURCE_DIR/$file" >&2; exit 1; }
done

mkdir -p "$BACKUP_DIR"
cp -a /etc/open5gs/amf.yaml /etc/open5gs/upf.yaml "$UERANSIM_DIR/config/open5gs-gnb.yaml" "$UERANSIM_DIR/config/open5gs-ue.yaml" "$BACKUP_DIR/"
chown -R "$OWNER:$OWNER" "$OWNER_HOME/open5gs-backups"

python3 - <<'PY'
from pathlib import Path

def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    content = target.read_text()
    if new in content:
        return
    if old not in content:
        raise SystemExit(f"Expected configuration block not found in {path}")
    target.write_text(content.replace(old, new, 1))

replace(
    "/etc/open5gs/amf.yaml",
    "  ngap:\n    server:\n      - address: 127.0.0.5\n",
    "  ngap:\n    server:\n      - address: 127.0.0.5\n      - address: 192.168.64.2\n",
)
replace(
    "/etc/open5gs/upf.yaml",
    "  gtpu:\n    server:\n      - address: 127.0.0.7\n",
    "  gtpu:\n    server:\n      - address: 192.168.64.2\n",
)
replace(
    "/etc/open5gs/upf.yaml",
    "  gtpu:\n    server:\n      - address: 192.168.64.2\n",
    "  gtpu:\n    server:\n      - address: 192.168.64.2\n        advertise: 192.168.64.2\n",
)
gnb = "/home/papibarra/UERANSIM/config/open5gs-gnb.yaml"
replace(gnb, "linkIp: 127.0.0.1", "linkIp: 10.200.0.2")
replace(gnb, "ngapIp: 127.0.0.1", "ngapIp: 10.200.0.2")
replace(gnb, "gtpIp: 127.0.0.1", "gtpIp: 10.200.0.2")
replace(gnb, "  - address: 127.0.0.5", "  - address: 192.168.64.2")
replace(
    "/home/papibarra/UERANSIM/config/open5gs-ue.yaml",
    "  - 127.0.0.1",
    "  - 10.200.0.2",
)
PY

cat >/usr/local/sbin/ueransim-netns-up <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ip netns list | grep -q '^ueransim\b' || ip netns add ueransim
ip link show ueran-host >/dev/null 2>&1 || ip link add ueran-host type veth peer name ueran-ns
ip link set ueran-ns netns ueransim 2>/dev/null || true
ip address replace 10.200.0.1/24 dev ueran-host
ip link set ueran-host up
ip netns exec ueransim ip link set lo up
ip netns exec ueransim ip address replace 10.200.0.2/24 dev ueran-ns
ip netns exec ueransim ip link set ueran-ns up
ip netns exec ueransim ip route replace default via 10.200.0.1
sysctl -q -w net.ipv4.ip_forward=1
iptables -C INPUT -i ueran-host -p udp --dport 2152 -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i ueran-host -p udp --dport 2152 -j ACCEPT
iptables -C FORWARD -i ogstun -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -i ogstun -j ACCEPT
iptables -C FORWARD -o ogstun -j ACCEPT 2>/dev/null || iptables -I FORWARD 1 -o ogstun -j ACCEPT
iptables -t nat -C POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE
EOF

cat >/usr/local/sbin/ueransim-netns-down <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
ip netns del ueransim 2>/dev/null || true
ip link del ueran-host 2>/dev/null || true
EOF
chmod 755 /usr/local/sbin/ueransim-netns-up /usr/local/sbin/ueransim-netns-down

install -m 644 "$SOURCE_DIR/ueransim-netns.service" /etc/systemd/system/ueransim-netns.service
install -m 644 "$SOURCE_DIR/ueransim-gnb-system.service" /etc/systemd/system/ueransim-gnb.service
install -m 644 "$SOURCE_DIR/ueransim-ue-system.service" /etc/systemd/system/ueransim-ue.service

systemctl --user -M "$OWNER@" disable --now ueransim-gnb.service ueransim-ue.service 2>/dev/null || true
pkill -x nr-ue 2>/dev/null || true
pkill -x nr-gnb 2>/dev/null || true
systemctl daemon-reload
systemctl enable ueransim-netns.service ueransim-gnb.service ueransim-ue.service
systemctl restart open5gs-amfd.service open5gs-smfd.service open5gs-upfd.service
systemctl restart ueransim-netns.service
# Let AMF and the SMF/UPF PFCP association settle before radio access starts.
sleep 8
systemctl restart ueransim-gnb.service
systemctl restart ueransim-ue.service

sleep 12
echo "--- UERANSIM gNB status ---"
systemctl --no-pager --full status ueransim-gnb.service | tail -n 12 || true
echo "--- UERANSIM UE registration/session ---"
journalctl -u ueransim-ue.service --since '-30 seconds' --no-pager | tail -n 30 || true
echo "--- UE tunnel ---"
ip netns exec ueransim ip -brief address show uesimtun0 2>/dev/null || true
echo "--- User-plane gateway test ---"
if ip netns exec ueransim ping -I uesimtun0 -c 3 -W 2 10.45.0.1; then
  PROBE_STATUS=passed
  PACKET_LOSS=0
else
  PROBE_STATUS=failed
  PACKET_LOSS=100
fi
cat > "$OWNER_HOME/open5gs-control-agent/ueransim-e2e-status.json" <<EOF
{"status":"$PROBE_STATUS","target":"10.45.0.1","packetLoss":$PACKET_LOSS,"checkedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
chown "$OWNER:$OWNER" "$OWNER_HOME/open5gs-control-agent/ueransim-e2e-status.json"
chmod 644 "$OWNER_HOME/open5gs-control-agent/ueransim-e2e-status.json"

echo "UERANSIM namespace deployment complete. Backups: $BACKUP_DIR"
