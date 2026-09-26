#!/usr/bin/env python3
import sys
import random
from datetime import datetime, timedelta
from pathlib import Path

valid_users = ["root", "ubuntu", "admin", "aditya", "deploy", "postgres", "svc_backup"]
invalid_users = ["guest", "test", "oracle", "user1", "nagios", "ftpuser", "git", "temp"]
attacker_ips = [
    "198.51.100.42",
    "203.0.113.88",
    "192.0.2.144",
    "185.220.101.5",
    "45.33.32.156",
    "103.251.167.20"
]
internal_ips = ["192.168.1.15", "192.168.1.45", "10.0.0.12", "10.0.0.88"]

def generate_log_entry(dt, is_attack=False, attack_ip=None):
    ts = dt.strftime("%b %d %H:%M:%S")
    host = "srv-prod-app01"
    pid = random.randint(1000, 65000)
    
    if is_attack:
        ip = attack_ip or random.choice(attacker_ips)
        port = random.randint(30000, 65000)
        is_invalid = random.random() < 0.6
        user = random.choice(invalid_users) if is_invalid else random.choice(valid_users)
        
        if is_invalid:
            return (
                f"{ts} {host} sshd[{pid}]: Invalid user {user} from {ip} port {port}\n"
                f"{ts} {host} sshd[{pid}]: Failed password for invalid user {user} from {ip} port {port} ssh2"
            )
        else:
            return (
                f"{ts} {host} sshd[{pid}]: pam_unix(sshd:auth): authentication failure; "
                f"logname= uid=0 euid=0 tty=ssh ruser= rhost={ip} user={user}\n"
                f"{ts} {host} sshd[{pid}]: Failed password for {user} from {ip} port {port} ssh2"
            )

    ip = random.choice(internal_ips)
    port = random.randint(40000, 60000)
    user = random.choice(valid_users)
    
    if random.random() < 0.90:
        return (
            f"{ts} {host} sshd[{pid}]: Accepted publickey for {user} from {ip} port {port} ssh2: RSA SHA256:dGhpcy1pcy1hLWtleS1leGFtcGxl\n"
            f"{ts} {host} sshd[{pid}]: pam_unix(sshd:session): session opened for user {user} by (uid=0)"
        )
    return (
        f"{ts} {host} sshd[{pid}]: pam_unix(sshd:auth): authentication failure; "
        f"logname= uid=0 euid=0 tty=ssh ruser= rhost={ip} user={user}\n"
        f"{ts} {host} sshd[{pid}]: Failed password for {user} from {ip} port {port} ssh2"
    )

def generate_dataset(output_path, days=2):
    now = datetime.now()
    current_time = now - timedelta(days=days)
    delta = timedelta(seconds=20)
    
    spike1_start = now - timedelta(hours=18)
    spike1_end = spike1_start + timedelta(minutes=45)
    spike2_start = now - timedelta(hours=6)
    spike2_end = spike2_start + timedelta(minutes=35)

    print(f"Generating auth logs to {output_path}...")
    lines = []
    
    while current_time < now:
        if spike1_start <= current_time <= spike1_end:
            for _ in range(random.randint(8, 20)):
                offset = current_time + timedelta(seconds=random.randint(0, 18))
                lines.append(generate_log_entry(offset, is_attack=True, attack_ip="185.220.101.5"))
            current_time += delta
        elif spike2_start <= current_time <= spike2_end:
            for _ in range(random.randint(12, 28)):
                offset = current_time + timedelta(seconds=random.randint(0, 18))
                lines.append(generate_log_entry(offset, is_attack=True))
            current_time += delta
        else:
            if random.random() < 0.35:
                lines.append(generate_log_entry(current_time, is_attack=False))
            current_time += timedelta(seconds=random.randint(15, 60))
            
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write("\n".join(lines) + "\n")
        
    print(f"Wrote {len(lines)} log events to {output_path}")

if __name__ == "__main__":
    out_file = sys.argv[1] if len(sys.argv) > 1 else "sample_data/auth.log"
    generate_dataset(out_file)
