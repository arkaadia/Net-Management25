#!/usr/bin/env python3
"""
backend/ssh_bridge.py - Unified SSH Engine Execution Bridge
Invoked strictly through the Node.js SSH Backend Resolver using the designated
Python virtual environment (venv_legacy with Paramiko 2.12.x or venv_modern with modern Paramiko).

Subcommands:
  - test-connection / probe: Authenticates and performs hardware discovery
  - terminal: Establishes live interactive PTY shell streamed over stdio
  - ports-sync: Live interface discovery via SSH
  - info / version: Returns active runtime, Paramiko version, and cipher capabilities
"""

import sys
import os
import json
import time
import socket
import select
import threading

# Ensure project root is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR) if os.path.basename(SCRIPT_DIR) == "backend" else SCRIPT_DIR
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import paramiko
from backend.connections.ssh_compat import (
    connect_ssh_device,
    ensure_paramiko_compatibility,
    is_modern_mode,
)
from backend.connections.hardware_discovery import execute_real_hardware_probe

ACTIVE_MODE = "modern" if is_modern_mode(os.environ.get("SSH_BACKEND_MODE", "legacy")) else "legacy"
ensure_paramiko_compatibility(ACTIVE_MODE)


def handle_info():
    ver = getattr(paramiko, "__version__", "unknown")
    res = {
        "success": True,
        "mode": ACTIVE_MODE,
        "is_modern": ACTIVE_MODE == "modern",
        "python": sys.executable,
        "paramiko_version": ver,
        "paramiko_path": os.path.dirname(paramiko.__file__),
    }
    print(json.dumps(res))


def handle_probe(args):
    raw_input = ""
    if len(args) > 0 and args[0].strip().startswith("{"):
        raw_input = args[0].strip()
    else:
        raw_input = sys.stdin.read().strip()

    if not raw_input:
        print(json.dumps({"success": False, "error": "No input payload provided for SSH probe"}))
        sys.exit(1)

    try:
        data = json.loads(raw_input)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON payload: {e}"}))
        sys.exit(1)

    ip = str(data.get("ssh_host") or data.get("ip") or data.get("host") or "").strip()
    proto = str(data.get("protocol") or data.get("connection_protocol") or "ssh").lower()
    default_port = 23 if proto == "telnet" else 22
    port = int(data.get("ssh_port") or data.get("port") or default_port)
    username = str(data.get("ssh_username") or data.get("username") or "admin").strip()
    password = str(data.get("ssh_password") or data.get("password") or "").strip()
    enable_password = str(data.get("enable_password") or "").strip()
    platform = str(data.get("platform") or "cisco_ios_xe").strip()
    lang = str(data.get("lang") or "en").strip()
    ssh_version = str(data.get("ssh_version") or data.get("sshVersion") or ACTIVE_MODE).strip().lower()

    probe_result = execute_real_hardware_probe(
        ip=ip,
        port=port,
        username=username,
        password=password,
        enable_password=enable_password,
        protocol=proto,
        platform=platform,
        lang=lang,
        ssh_version=ssh_version,
    )
    # Remove client instance before serialization
    probe_result.pop("paramiko_client", None)
    print(json.dumps(probe_result))


def handle_ports_sync(args):
    raw_input = ""
    if len(args) > 0 and args[0].strip().startswith("{"):
        raw_input = args[0].strip()
    else:
        raw_input = sys.stdin.read().strip()

    if not raw_input:
        print(json.dumps({"success": False, "error": "No device payload provided for port sync"}))
        sys.exit(1)

    try:
        device = json.loads(raw_input)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid device payload: {e}"}))
        sys.exit(1)

    conn = device.get("connection", {}) or {}
    host = str(conn.get("host") or device.get("ssh_host") or device.get("ip") or "").strip()
    port = int(conn.get("port") or device.get("ssh_port") or 22)
    username = str(conn.get("username") or device.get("ssh_username") or "admin").strip()
    password = str(conn.get("password") or device.get("ssh_password") or "").strip()
    platform = str(device.get("platform") or "cisco_ios_xe").strip()
    ssh_version = str(device.get("ssh_version") or device.get("sshVersion") or ACTIVE_MODE).strip().lower()

    p_client = paramiko.SSHClient()
    p_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connected, err = connect_ssh_device(
        p_client,
        hostname=host,
        port=port,
        username=username,
        password=password,
        timeout=7.0,
        banner_timeout=7.0,
        auth_timeout=7.0,
        platform=platform,
        ssh_version=ssh_version,
    )

    if not connected:
        print(json.dumps({
            "success": False,
            "connected": False,
            "error": str(err or "SSH Connection Failed"),
            "message": str(err or "SSH Connection Failed"),
        }))
        return

    try:
        channel = p_client.invoke_shell(term="vt100", width=200, height=80)
        channel.settimeout(5.0)
        time.sleep(0.5)

        is_cisco = "cisco" in platform.lower()
        commands = [
            "terminal length 0",
            "show ip interface brief",
            "show interfaces status",
        ] if is_cisco else [
            "/interface print detail without-paging",
        ]

        full_output = ""
        for cmd in commands:
            channel.send(f"{cmd}\n")
            time.sleep(0.7)
            deadline = time.time() + 3.0
            while time.time() < deadline:
                if channel.recv_ready():
                    chunk = channel.recv(8192).decode("utf-8", errors="ignore")
                    full_output += chunk
                    if len(chunk) < 8192:
                        break
                else:
                    time.sleep(0.1)

        p_client.close()

        from backend.connections.hardware_discovery import parse_cisco_show_interface_status, normalize_port_list
        ports = parse_cisco_show_interface_status(full_output)
        normalized = normalize_port_list(ports)

        print(json.dumps({
            "success": True,
            "connected": True,
            "ports": normalized,
            "total_ports": len(normalized),
            "paramiko_version": getattr(paramiko, "__version__", "unknown"),
            "ssh_version": ssh_version,
            "is_live": True,
            "raw_output": full_output[:4000],
        }))
    except Exception as e:
        try:
            p_client.close()
        except Exception:
            pass
        print(json.dumps({"success": False, "error": str(e), "message": str(e)}))


def handle_terminal(args):
    """
    Live PTY Terminal session bridge:
    Establishes real interactive SSH session and forwards bidirectional data over stdio.
    """
    raw_input = ""
    if len(args) > 0 and args[0].strip().startswith("{"):
        raw_input = args[0].strip()
    else:
        raw_input = sys.stdin.readline().strip()

    if not raw_input:
        sys.stderr.write("Error: missing connection configuration for terminal\n")
        sys.exit(1)

    try:
        cfg = json.loads(raw_input)
    except Exception as e:
        sys.stderr.write(f"Error: invalid JSON configuration: {e}\n")
        sys.exit(1)

    host = cfg.get("host") or cfg.get("ip") or ""
    port = int(cfg.get("port") or 22)
    username = cfg.get("username") or "admin"
    password = cfg.get("password") or ""
    platform = cfg.get("platform") or "cisco_ios_xe"
    term = cfg.get("term") or "xterm-256color"
    cols = int(cfg.get("cols") or 80)
    rows = int(cfg.get("rows") or 24)
    ssh_version = cfg.get("ssh_version") or ACTIVE_MODE

    p_client = paramiko.SSHClient()
    p_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connected, err = connect_ssh_device(
        p_client,
        hostname=host,
        port=port,
        username=username,
        password=password,
        timeout=8.0,
        banner_timeout=8.0,
        auth_timeout=8.0,
        platform=platform,
        ssh_version=ssh_version,
    )

    if not connected:
        sys.stderr.write(f"SSH Connection Failed: {err}\n")
        sys.exit(1)

    channel = p_client.invoke_shell(term=term, width=cols, height=rows)
    channel.settimeout(0.0)

    # Inform wrapper that channel is open
    sys.stdout.write(f"__NETMGMT_SSH_OPEN__:{json.dumps({'kex': getattr(p_client, '_negotiation_info', {}).get('kex', 'connected'), 'version': getattr(paramiko, '__version__', 'unknown')})}\n")
    sys.stdout.flush()

    stop_event = threading.Event()

    def read_from_ssh():
        while not stop_event.is_set():
            try:
                r, _, _ = select.select([channel], [], [], 0.05)
                if r:
                    data = channel.recv(4096)
                    if not data:
                        break
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
            except Exception:
                break
        stop_event.set()

    def write_to_ssh():
        while not stop_event.is_set():
            try:
                r, _, _ = select.select([sys.stdin.buffer], [], [], 0.05)
                if r:
                    chunk = sys.stdin.buffer.read(4096)
                    if not chunk:
                        break
                    channel.sendall(chunk)
            except Exception:
                break
        stop_event.set()

    t_read = threading.Thread(target=read_from_ssh, daemon=True)
    t_write = threading.Thread(target=write_to_ssh, daemon=True)
    t_read.start()
    t_write.start()

    while not stop_event.is_set():
        time.sleep(0.1)

    try:
        channel.close()
        p_client.close()
    except Exception:
        pass


def main():
    if len(sys.argv) < 2:
        handle_info()
        return

    cmd = sys.argv[1].lower().strip()
    args = sys.argv[2:]

    if cmd in ("info", "version", "--version"):
        handle_info()
    elif cmd in ("test-connection", "probe"):
        handle_probe(args)
    elif cmd in ("ports-sync", "ports_sync", "ports"):
        handle_ports_sync(args)
    elif cmd in ("terminal", "shell"):
        handle_terminal(args)
    else:
        sys.stderr.write(f"Unknown command: {cmd}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
