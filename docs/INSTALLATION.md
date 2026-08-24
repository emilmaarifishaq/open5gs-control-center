# Deployment guide: Open5GS, UERANSIM, and Control Center

This guide builds a complete private 4G/5G lab and connects it to Open5GS Control Center. It is written for Ubuntu 22.04/24.04 and a separate macOS or Ubuntu dashboard host.

> This is lab infrastructure, not a production mobile network. Keep all management ports on a trusted LAN or VPN. Do not expose MongoDB, the agent, Open5GS SBI, or the dashboard directly to the internet.

## 1. Architecture and installation order

Recommended layout:

```text
Browser
  └── Control Center (macOS or Ubuntu, TCP 3000)
        └── HTTPS/HTTP agent API (Ubuntu VM, TCP 9105)
              ├── Open5GS systemd services
              ├── /etc/open5gs/*.yaml
              ├── Open5GS logs/journald
              └── UERANSIM gNB + UE

UERANSIM UE → UERANSIM gNB → AMF → SMF → UPF → Data Network
```

Install and start components in this order:

1. Ubuntu, networking, and time synchronization
2. MongoDB
3. Open5GS packages
4. Open5GS AMF/SMF/UPF configuration and IP forwarding
5. Subscriber record
6. UERANSIM build and YAML configuration
7. Manual end-to-end registration and ping test
8. Control Center management agent on Ubuntu
9. Control Center web application on macOS or Ubuntu
10. Optional systemd/LaunchAgent automatic startup

## 2. Official upstream documentation

- [Open5GS GitHub repository](https://github.com/open5gs/open5gs)
- [Open5GS documentation](https://open5gs.org/open5gs/docs/)
- [Open5GS official quickstart](https://open5gs.org/open5gs/docs/guide/01-quickstart/)
- [Open5GS source build guide](https://open5gs.org/open5gs/docs/guide/02-building-open5gs-from-sources/)
- [UERANSIM GitHub repository](https://github.com/aligungr/UERANSIM)
- [UERANSIM installation](https://github.com/aligungr/UERANSIM/wiki/Installation)
- [UERANSIM configuration](https://github.com/aligungr/UERANSIM/wiki/Configuration)
- [UERANSIM usage](https://github.com/aligungr/UERANSIM/wiki/Usage)

Always compare this guide with upstream release notes before installing on a new OS release.

## 3. Choose your addresses first

Write down values for your environment. The examples below use:

| Purpose | Example |
|---|---|
| Ubuntu/Open5GS host | `192.168.64.2` |
| Control Center host | `192.168.18.7` |
| Agent port | `9105` |
| Dashboard port | `3000` |
| MCC / MNC | `999 / 70` |
| TAC | `1` |
| DNN/APN | `internet` |
| 5G UE subnet | `10.45.0.0/16` |
| LTE UE subnet | `10.45.0.0/16` or your configured PGW subnet |

Replace every example address with the actual address visible on your hosts:

```bash
ip -brief address        # Ubuntu
ip route show default
```

On macOS:

```bash
ipconfig getifaddr en0
ipconfig getifaddr en1
```

The AMF NGAP address must be reachable from the gNB. The UPF GTP-U address must also be reachable from the gNB. MCC, MNC, TAC, DNN, subscriber IMSI, key, OP/OPc, and slice values must match on both Open5GS and UERANSIM.

## 4. Prepare Ubuntu

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y software-properties-common curl ca-certificates gnupg git jq openssl python3 python3-yaml iproute2 iptables
sudo timedatectl set-ntp true
```

Confirm the hostname and address:

```bash
hostnamectl
ip -brief address
timedatectl status
```

## 5. Install MongoDB

Open5GS uses MongoDB for subscriber and policy data. Follow the MongoDB version and repository currently listed in the [official Open5GS quickstart](https://open5gs.org/open5gs/docs/guide/01-quickstart/).

Example for MongoDB 8.0 on Ubuntu 22.04 (Jammy):

```bash
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
systemctl is-active mongod
```

For Ubuntu 24.04, use the repository codename supported by the current MongoDB/Open5GS documentation; do not blindly reuse `jammy`.

## 6. Install Open5GS

The Ubuntu package installation is the simplest reproducible path:

```bash
sudo add-apt-repository -y ppa:open5gs/latest
sudo apt update
sudo apt install -y open5gs
```

Check the core services:

```bash
systemctl --no-pager --type=service --state=running | grep open5gs
sudo ss -lntup | grep -E '7777|2152|38412'
```

Open5GS defaults are designed for an all-in-one localhost deployment. Back up configuration before changing it:

```bash
sudo mkdir -p /var/backups/open5gs-initial
sudo cp -a /etc/open5gs /var/backups/open5gs-initial/
```

### 6.1 Configure AMF for an external gNB

Edit `/etc/open5gs/amf.yaml` and set the NGAP server address to an address reachable by UERANSIM. Also verify PLMN and TAC:

```yaml
amf:
  ngap:
    server:
      - address: 192.168.64.2
  guami:
    - plmn_id:
        mcc: 999
        mnc: 70
      amf_id:
        region: 2
        set: 1
  tai:
    - plmn_id:
        mcc: 999
        mnc: 70
      tac: 1
```

Preserve the other sections from the packaged configuration.

### 6.2 Configure UPF and SMF

In `/etc/open5gs/upf.yaml`, bind GTP-U to the reachable Ubuntu address:

```yaml
upf:
  gtpu:
    server:
      - address: 192.168.64.2
        advertise: 192.168.64.2
  session:
    - subnet: 10.45.0.1/16
      dnn: internet
```

In `/etc/open5gs/smf.yaml`, verify that the session subnet and DNN match the UPF and UERANSIM configuration. Keep the packaged PFCP/SBI settings unless your topology requires different hosts.

Restart and inspect:

```bash
sudo systemctl restart open5gs-amfd open5gs-smfd open5gs-upfd
systemctl is-active open5gs-amfd open5gs-smfd open5gs-upfd
sudo journalctl -u open5gs-amfd -u open5gs-smfd -u open5gs-upfd -n 80 --no-pager
```

### 6.3 Enable subscriber traffic routing

The official quickstart requires IP forwarding and NAT for UE internet access:

```bash
sudo sysctl -w net.ipv4.ip_forward=1
echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-open5gs.conf
sudo iptables -I FORWARD 1 -i ogstun -j ACCEPT
sudo iptables -I FORWARD 1 -o ogstun -j ACCEPT
sudo iptables -t nat -A POSTROUTING -s 10.45.0.0/16 ! -o ogstun -j MASQUERADE
```

Persist firewall rules using the mechanism approved for your distribution. If `ufw` is enabled, add equivalent forwarding rules rather than disabling security globally.

## 7. Add a subscriber

The subscriber values must match `open5gs-ue.yaml` exactly. You may use the official Open5GS WebUI or `open5gs-dbctl`.

The official WebUI is only for subscriber management; it is separate from this Control Center. See the [Open5GS quickstart WebUI section](https://open5gs.org/open5gs/docs/guide/01-quickstart/#3-install-the-webui-of-open5gs).

To install the official subscriber WebUI, first install the Node.js version currently recommended by Open5GS (Node.js 20 at the time this guide was written):

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt install -y nodejs
curl -fsSL https://open5gs.org/open5gs/assets/webui/install | sudo -E bash -
```

Open `http://<OPEN5GS_HOST>:9999`. The upstream installer currently creates `admin` / `1423`; change that password immediately and restrict port 9999 to trusted administrators.

Record these values securely:

- IMSI/SUPI, for example `999700000000001`
- Subscriber key (`K`)
- OP or OPc and its type
- AMF value
- APN/DNN (`internet`)
- S-NSSAI SST and optional SD

Never commit real subscriber secrets to Git.

## 8. Install UERANSIM

UERANSIM provides the simulated 5G UE and gNodeB. Install build/runtime dependencies:

```bash
sudo apt update
sudo apt install -y make gcc g++ cmake libsctp-dev lksctp-tools iproute2 git
cd "$HOME"
git clone https://github.com/aligungr/UERANSIM.git
cd UERANSIM
make -j"$(nproc)"
ls -l build/nr-gnb build/nr-ue build/nr-cli
```

Review UERANSIM's current licensing terms before redistribution or commercial use.

### 8.1 Configure the gNodeB

Edit `~/UERANSIM/config/open5gs-gnb.yaml`. At minimum, verify:

```yaml
mcc: '999'
mnc: '70'
nci: '0x000000010'
idLength: 32
tac: 1

linkIp: 192.168.64.2
ngapIp: 192.168.64.2
gtpIp: 192.168.64.2

amfConfigs:
  - address: 192.168.64.2
    port: 38412

slices:
  - sst: 1
```

If UERANSIM runs on a separate host, use that host's address for `linkIp`, `ngapIp`, and `gtpIp`, while `amfConfigs.address` remains the Open5GS AMF address.

### 8.2 Configure the UE

Edit `~/UERANSIM/config/open5gs-ue.yaml` and match the subscriber record:

```yaml
supi: 'imsi-999700000000001'
mcc: '999'
mnc: '70'
key: '<SUBSCRIBER_KEY>'
op: '<OP_OR_OPC_VALUE>'
opType: 'OPC'
amf: '8000'

gnbSearchList:
  - 192.168.64.2

sessions:
  - type: 'IPv4'
    apn: 'internet'
    slice:
      sst: 1
```

Do not copy placeholder secrets literally.

### 8.3 Test UERANSIM manually first

Terminal 1:

```bash
cd ~/UERANSIM
sudo ./build/nr-gnb -c config/open5gs-gnb.yaml
```

Wait for the gNB to report a successful AMF connection. Then Terminal 2:

```bash
cd ~/UERANSIM
sudo ./build/nr-ue -c config/open5gs-ue.yaml
```

Expected sequence:

1. gNB establishes SCTP/NGAP with AMF on N2.
2. UE finds the simulated gNB.
3. UE completes registration/authentication.
4. UE establishes a PDU session.
5. UERANSIM creates `uesimtun0`.

Verify:

```bash
ip -brief address show uesimtun0
ping -I uesimtun0 -c 3 10.45.0.1
sudo ss -n -A sctp
```

Do not automate startup until this manual test works.

## 9. Install the Control Center agent on Ubuntu

The agent reads allowlisted health, YAML, and log data. It requires a bearer token. Clone the repository and prepare the agent directory:

```bash
cd "$HOME"
git clone https://github.com/emilmaarifishaq/open5gs-control-center.git open5gs-control-center-source
mkdir -p "$HOME/open5gs-control-agent"
cp -a "$HOME/open5gs-control-center-source/agent/." "$HOME/open5gs-control-agent/"
cp -a "$HOME/open5gs-control-center-source/deploy" "$HOME/open5gs-control-agent/"
mkdir -p "$HOME/.config" "$HOME/open5gs-control-agent/pending"
chmod 700 "$HOME/open5gs-control-agent/pending"
```

Generate a unique token locally on the Ubuntu host:

```bash
AGENT_TOKEN="$(openssl rand -hex 32)"
printf 'OPEN5GS_AGENT_HOST=0.0.0.0\nOPEN5GS_AGENT_PORT=9105\nOPEN5GS_AGENT_TOKEN=%s\n' "$AGENT_TOKEN" > "$HOME/.config/open5gs-control-agent.env"
chmod 600 "$HOME/.config/open5gs-control-agent.env"
```

Copy the token into your password manager. Do not paste it into issues, screenshots, shell history, or Git.

Install the user service:

```bash
mkdir -p "$HOME/.config/systemd/user"
cp "$HOME/open5gs-control-agent/open5gs-control-agent.service" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now open5gs-control-agent.service
sudo loginctl enable-linger "$USER"
systemctl --user status open5gs-control-agent.service --no-pager
```

Allow only the Control Center host to reach TCP 9105. Example with UFW:

```bash
sudo ufw allow from 192.168.18.7 to any port 9105 proto tcp
```

Test locally and from the dashboard host:

```bash
curl http://127.0.0.1:9105/healthz
curl -H "Authorization: Bearer $AGENT_TOKEN" http://127.0.0.1:9105/v1/health | jq
```

### Optional: enable controlled YAML editing

Keep the first deployment read-only until health and logs work. Editing uses an allowlisted privileged helper, timestamped backups, YAML validation, service restart checks, and rollback.

Review `agent/open5gs-config-apply` first because its default paths assume the Linux user `papibarra` and UERANSIM under `/home/papibarra/UERANSIM`. Change those paths for your host before installation.

Then install PyYAML and the helper:

```bash
sudo apt install -y python3-yaml
sudo install -m 755 "$HOME/open5gs-control-agent/open5gs-config-apply" /usr/local/sbin/open5gs-config-apply
echo "$USER ALL=(root) NOPASSWD: /usr/local/sbin/open5gs-config-apply *" | sudo tee /etc/sudoers.d/open5gs-config-editor
sudo chmod 440 /etc/sudoers.d/open5gs-config-editor
sudo visudo -cf /etc/sudoers.d/open5gs-config-editor
systemctl --user restart open5gs-control-agent.service
```

## 10. Install Control Center

Install Node.js 22.13 or newer on the dashboard host, then:

```bash
git clone https://github.com/emilmaarifishaq/open5gs-control-center.git
cd open5gs-control-center
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
OPEN5GS_AGENT_URL=http://192.168.64.2:9105
OPEN5GS_AGENT_TOKEN=<THE_AGENT_TOKEN>
```

Build and test:

```bash
npm run lint
npm test
npm run build
npm run start
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/epc`
- `http://localhost:3000/5gc`
- From the same LAN: `http://<CONTROL_CENTER_IP>:3000/5gc`

The production server listens on `0.0.0.0:3000`. Restrict the port to your LAN/VPN.

## 11. Automatic startup

### Ubuntu dashboard host

```bash
mkdir -p "$HOME/.config/systemd/user"
cp deploy/linux/open5gs-control-center.service "$HOME/.config/systemd/user/"
cat > "$HOME/.config/open5gs-control-center.env" <<'EOF'
OPEN5GS_AGENT_URL=http://192.168.64.2:9105
OPEN5GS_AGENT_TOKEN=<THE_AGENT_TOKEN>
EOF
chmod 600 "$HOME/.config/open5gs-control-center.env"
systemctl --user daemon-reload
systemctl --user enable --now open5gs-control-center.service
sudo loginctl enable-linger "$USER"
```

If `npm` is not `/usr/bin/npm`, update `ExecStart` in the copied service after checking `command -v npm`.

### macOS dashboard host

The template is `deploy/macos/com.open5gs.control-center.plist`. Before installing it, replace:

- `/Users/papibarra/open5gs-control-center` with your repository path
- `/opt/homebrew/bin/npm` with the output of `command -v npm`
- log paths with your macOS username
- add `OPEN5GS_AGENT_URL` and `OPEN5GS_AGENT_TOKEN` under `EnvironmentVariables`

Install and start:

```bash
cp deploy/macos/com.open5gs.control-center.plist "$HOME/Library/LaunchAgents/"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.open5gs.control-center.plist"
launchctl kickstart -k "gui/$(id -u)/com.open5gs.control-center"
```

Check logs:

```bash
tail -n 100 "$HOME/Library/Logs/Open5GSControlCenter.log"
tail -n 100 "$HOME/Library/Logs/Open5GSControlCenter.error.log"
```

## 12. Optional UERANSIM systemd deployment

This repository contains templates under `deploy/ueransim/`, including an isolated Linux network-namespace setup. They currently contain example username `papibarra` and address `192.168.64.2`.

Before running `setup-ueransim-netns.sh`, review and replace:

- `OWNER` and `OWNER_HOME`
- Open5GS host addresses
- UERANSIM paths
- UE subnet, DNN, MCC/MNC, TAC, and slice

The script changes Open5GS YAML, routing, iptables, systemd units, and UERANSIM YAML. It creates backups, but it is intentionally not a zero-configuration installer. Run it only after the manual test in section 8 succeeds.

## 13. Required startup order

For predictable registration, use:

```bash
sudo systemctl start mongod
sudo systemctl restart open5gs-nrfd open5gs-scpd
sudo systemctl restart open5gs-ausfd open5gs-udmd open5gs-udrd open5gs-pcfd open5gs-nssfd open5gs-bsfd
sudo systemctl restart open5gs-amfd open5gs-smfd open5gs-upfd
sudo systemctl restart ueransim-gnb
sudo systemctl restart ueransim-ue
systemctl --user restart open5gs-control-agent
```

Then start/restart the Control Center on its host. In practice, systemd dependencies handle most boot ordering, but this sequence is useful during installation and troubleshooting.

## 14. End-to-end verification checklist

Run these checks in order:

```bash
# Database
systemctl is-active mongod

# Open5GS
systemctl is-active open5gs-nrfd open5gs-amfd open5gs-smfd open5gs-upfd

# NGAP/SCTP
sudo ss -n -A sctp

# UERANSIM
systemctl is-active ueransim-gnb ueransim-ue
sudo journalctl -u ueransim-gnb -u ueransim-ue -n 100 --no-pager

# UE tunnel and user plane
ip -brief address show uesimtun0
ping -I uesimtun0 -c 3 10.45.0.1

# Agent
curl http://127.0.0.1:9105/healthz

# Dashboard
curl -I http://127.0.0.1:3000/5gc
```

The successful sequence is: gNB connected → UE registered → PDU session established → `uesimtun0` created → ping succeeds → dashboard reports the path as operational.

## 15. Troubleshooting

### Dashboard shows demo data

- Confirm `.env.local` exists on the dashboard host.
- Confirm `OPEN5GS_AGENT_URL` points to the Ubuntu address, not `localhost` when hosts differ.
- Restart the dashboard after changing environment variables.

### Agent returns 401

- The dashboard token and agent token differ.
- Remove accidental spaces/newlines when copying the token.
- Confirm the agent service loaded the correct environment file.

### Agent is unreachable

```bash
systemctl --user status open5gs-control-agent --no-pager
ss -lntp | grep 9105
curl http://127.0.0.1:9105/healthz
```

Check the VM network mode and firewall. NAT-only VMs may require port forwarding; bridged networking usually provides simpler LAN access.

### gNB cannot connect to AMF

- Verify AMF is listening on the address configured in `amf.yaml`.
- Verify UERANSIM `amfConfigs.address` and port `38412`.
- Verify SCTP is available and allowed by the firewall.
- Verify MCC, MNC, and TAC.

```bash
sudo ss -l -n -A sctp
sudo journalctl -u open5gs-amfd -n 100 --no-pager
```

### UE registration fails

- Compare IMSI, key, OP/OPc, AMF, MCC/MNC, APN/DNN, and slice with the subscriber database.
- Check AUSF, UDM, UDR, AMF, and UERANSIM UE logs.

### PDU session succeeds but ping fails

- Confirm `uesimtun0` exists.
- Confirm `ogstun` exists and uses the expected subnet.
- Check forwarding and NAT rules.
- Verify UPF GTP-U address and DNN.

### YAML apply fails

- Read the error displayed in Control Center.
- Check the agent journal.
- Confirm `python3-yaml`, the sudoers rule, helper path, pending directory, and target paths.
- Inspect timestamped backups under `~/open5gs-backups/config-edits`.

## 16. Enable Open5GS Prometheus metrics

Control Center reads the native Open5GS exporters directly from inside the Ubuntu VM. Current Open5GS releases provide metrics for AMF, SMF, and MME. Keep these listeners on loopback; they do not need to be exposed to the LAN.

Add or confirm the following top-level section in each file:

`/etc/open5gs/amf.yaml`:

```yaml
metrics:
  server:
    - address: 127.0.0.5
      port: 9090
```

`/etc/open5gs/smf.yaml`:

```yaml
metrics:
  server:
    - address: 127.0.0.4
      port: 9090
```

`/etc/open5gs/mme.yaml`:

```yaml
metrics:
  server:
    - address: 127.0.0.2
      port: 9090
```

Validate the YAML and restart only these three services:

```bash
sudo open5gs-amfd -t -c /etc/open5gs/amf.yaml
sudo open5gs-smfd -t -c /etc/open5gs/smf.yaml
sudo open5gs-mmed -t -c /etc/open5gs/mme.yaml
sudo systemctl restart open5gs-amfd open5gs-smfd open5gs-mmed
curl http://127.0.0.5:9090/metrics
curl http://127.0.0.4:9090/metrics
curl http://127.0.0.2:9090/metrics
```

Restart the Control Center agent after deploying its updated `server.py`. The dashboard polls the agent every 10 seconds and will show exporter state, active UE, PDU sessions, memory, and CPU time automatically. Endpoint overrides are available through `OPEN5GS_AMF_METRICS_URL`, `OPEN5GS_SMF_METRICS_URL`, and `OPEN5GS_MME_METRICS_URL` in the agent service environment.

Open5GS upstream reference: [Prometheus Metrics](https://open5gs.org/open5gs/docs/tutorial/04-metrics-prometheus/).

## 17. Updating

Control Center:

```bash
cd ~/open5gs-control-center
git pull --ff-only
npm install
npm test
npm run build
systemctl --user restart open5gs-control-center  # Ubuntu
```

On macOS, replace the last command with:

```bash
launchctl kickstart -k "gui/$(id -u)/com.open5gs.control-center"
```

Before upgrading Open5GS or UERANSIM, back up `/etc/open5gs`, subscriber data, and UERANSIM YAML. Read upstream release notes and re-run the full verification checklist.
