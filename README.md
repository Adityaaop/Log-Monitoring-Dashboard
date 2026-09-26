# Linux Auth Log Monitoring & Spike Detection (Splunk)

A Splunk-based monitoring solution for detecting brute-force attacks and authentication anomalies across Linux systems (`/var/log/auth.log` and `/var/log/secure`).

Instead of relying on static thresholds (which trigger false positives during busy shifts and miss low-volume off-hours attacks), this project implements a dynamic baseline detection model in SPL using moving averages and standard deviation to identify anomalous failure surge in real time.

---

## Architecture Overview

```
Linux Auth Logs (/var/log/auth.log, /var/log/secure)
  └── Splunk Forwarder (inputs.conf)
        └── Splunk Indexer (props.conf regex extractions & CIM normalization)
              └── Search Head (Dynamic SPL anomaly detection)
                    ├── Splunk XML / Dashboard Studio (Interactive SOC Views)
                    └── Local Preview Server (Zero-dependency Node test bench)
```

- **Log Ingestion:** Monitors Debian/Ubuntu (`/var/log/auth.log`) and RHEL/CentOS (`/var/log/secure`) log paths.
- **Field Extractions (`props.conf`):** Regex-based parser extracting `src_ip`, `src_port`, `user`, and failure reasons, normalized to Splunk Common Information Model (CIM) standards.
- **Spike Detection Engine:** Evaluates rolling 2-hour windows (8x 15-min intervals) using `streamstats` to compute moving mean ($\mu$) and standard deviation ($\sigma$). Surges breaching $\mu + 2.5\sigma$ are flagged as anomalies.
- **Visual Dashboards:** High-contrast dark theme optimized for SOC workflows, featuring KPI summaries, volume timecharts, attacker distribution tables, and raw event drilldowns.

---

## Detection Logic & SPL

### 1. Dynamic Anomaly Spike Detection

Static counts (e.g., `count > 50`) fail in production because legitimate daytime developer activity has a different baseline than weekend/night hours. The following query calculates an adaptive threshold:

```spl
index=os_security sourcetype=linux_secure action=failure host="$selected_host$" user="$user_filter$"
| timechart span=15m count as Failed_Attempts
| streamstats window=8 avg(Failed_Attempts) as Baseline_Mean, stdev(Failed_Attempts) as Baseline_Stdev
| eval Spike_Threshold = round(Baseline_Mean + (2.5 * Baseline_Stdev), 1)
| eval Anomaly_Spike = if(Failed_Attempts > Spike_Threshold AND Failed_Attempts > 20, Failed_Attempts, null())
```

- `timechart span=15m count`: Aggregates authentication failures into 15-minute buckets.
- `streamstats window=8`: Computes a sliding 2-hour window of the average and standard deviation.
- `Baseline_Mean + (2.5 * Baseline_Stdev)`: Dynamically computes an upper bound. Legitimate gradual increases raise the baseline smoothly, while sudden bursts pierce the threshold.
- `Failed_Attempts > 20`: Establishes a floor so small fluctuations during low-traffic periods do not trigger alerts.

### 2. Top Offending Source IPs

Aggregates attacking IPs with attack share percentages and target counts:

```spl
index=os_security sourcetype=linux_secure action=failure
| stats count as attempts, dc(user) as targeted_users by src_ip
| eventstats sum(attempts) as total_attacks
| eval pct_of_attacks = round((attempts/total_attacks)*100, 2) . "%"
| sort 10 - attempts
| fields src_ip, attempts, pct_of_attacks, targeted_users
```

### 3. Account Vulnerability: Targeted vs. Spraying

Differentiates between targeted brute-force attacks against existing accounts (e.g. `root`, `deploy`) and dictionary spraying across non-existent usernames:

```spl
index=os_security sourcetype=linux_secure action=failure
| eval user_type = if(match(_raw, "invalid user"), "Invalid User (Spraying)", "Valid User (Targeted)")
| top limit=10 user by user_type
| fields user, count, user_type
```

---

## Splunk Configuration Files

### `splunk_configs/inputs.conf`
Configures file monitors for auth logs:

```ini
[monitor:///var/log/auth.log]
disabled = false
index = os_security
sourcetype = linux_secure
followTail = 0

[monitor:///var/log/secure]
disabled = false
index = os_security
sourcetype = linux_secure
followTail = 0
```

### `splunk_configs/props.conf`
Defines line breaking, timestamp extraction, and regex field parsing:

```ini
[linux_secure]
SHOULD_LINEMERGE = false
LINE_BREAKER = ([\r\n]+)\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}
TIME_PREFIX = ^
TIME_FORMAT = %b %d %H:%M:%S
MAX_TIMESTAMP_LOOKAHEAD = 16

# Regex extractions
EXTRACT-ssh_failed_invalid = Failed password for invalid user (?<user>\S+) from (?<src_ip>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}) port (?<src_port>\d+)
EXTRACT-ssh_failed_valid   = Failed password for (?!invalid user)(?<user>\S+) from (?<src_ip>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}) port (?<src_port>\d+)
EXTRACT-ssh_accepted       = Accepted (?:publickey|password) for (?<user>\S+) from (?<src_ip>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}) port (?<src_port>\d+)
EXTRACT-pam_auth_failure   = pam_unix\(sshd:auth\): authentication failure;.*rhost=(?<src_ip>\S*)\s+user=(?<user>\S*)

# CIM normalization
EVAL-action = case(match(_raw, "Failed password|authentication failure"), "failure", match(_raw, "Accepted"), "success", true(), "unknown")
EVAL-app = "sshd"
EVAL-dest = host
```

---

## Project Structure

```
├── server.js                          # Lightweight local preview server
├── start.sh                           # Quick launch shell script
├── package.json                       # Scripts and metadata
├── sample_data/
│   └── auth.log                       # Synthetic auth logs with brute-force spikes
├── scripts/
│   └── generate_auth_logs.py          # Log generator script
├── splunk_configs/
│   ├── inputs.conf                    # Splunk log inputs configuration
│   └── props.conf                     # Splunk field extractions & CIM mappings
├── splunk_dashboards/
│   ├── failed_logins_dashboard.xml    # Classic Splunk XML dashboard with token drilldown
│   ├── dashboard_studio.json          # Splunk Dashboard Studio layout
│   └── static/
│       └── custom_dashboard.css       # Custom CSS for dark SOC interface
└── standalone_preview/                # Browser-based test preview
    ├── app.js                         # Dynamic threshold calculation & Chart.js rendering
    ├── index.html                     # Dashboard UI layout
    └── style.css                      # Modern dark theme styles
```

---

## Running the Standalone Preview

To explore the dashboard layout and test the dynamic threshold calculation locally without a running Splunk server:

```bash
npm run dev
# or
./start.sh
```

This starts the preview server at `http://localhost:3000` and opens it in your default browser.

### Key Interactive Features:
- **Dynamic Threshold Adjustment:** Change sensitivity between 2.0$\sigma$, 2.5$\sigma$, and 3.0$\sigma$ to observe threshold recalculation in real time.
- **Attacker Drilldown:** Click "Isolate" on any source IP to filter the raw log table.
- **Target User Breakdown:** Bar chart separating dictionary enumeration from targeted valid user attacks.

---

## Generating Test Data

To generate a new synthetic `/var/log/auth.log` dataset containing 48 hours of normal traffic and simulated brute-force bursts:

```bash
python3 scripts/generate_auth_logs.py sample_data/auth.log
```

---

## Splunk Deployment Guide

1. **Create an App:**
   In Splunk Web, go to **Settings > Add-ons / Apps > Create App**, name it `linux_auth_monitoring`.
2. **Install Configurations:**
   - Copy `splunk_configs/inputs.conf` and `splunk_configs/props.conf` into `$SPLUNK_HOME/etc/apps/linux_auth_monitoring/local/`.
   - Copy `splunk_dashboards/static/custom_dashboard.css` into `$SPLUNK_HOME/etc/apps/linux_auth_monitoring/appserver/static/`.
3. **Import Dashboard:**
   - Go to **Dashboards > Create New Dashboard > Edit Source (XML)**.
   - Paste the contents of `splunk_dashboards/failed_logins_dashboard.xml` and save.
   - For Dashboard Studio, import `splunk_dashboards/dashboard_studio.json`.
4. **Restart Splunk:**
   Run `$SPLUNK_HOME/bin/splunk restart` or reload configs via `https://<splunk-host>:8000/en-US/debug/refresh`.
