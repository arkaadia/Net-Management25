"""
backend/ssh_fastapi.py - FastAPI SSH Connection Backend Engine
Pipeline: React -> FastAPI -> Paramiko -> Cisco

Features:
- Pure Paramiko SSH Client with invoke_shell() interactive shell
- Session management: create, track, write, read, and close sessions
- WebSocket streaming and REST endpoints for Cisco / network devices
- Zero mock / fake data policy (Rule 8): Authentic Cisco CLI output only
- Full error transparency and proper resource cleanup
"""

import os
import sys
import time
import socket
import asyncio
import logging
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Setup sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import paramiko

try:
    from backend.security.crypto import decrypt_credential
except ImportError:
    try:
        from security.crypto import decrypt_credential
    except ImportError:
        def decrypt_credential(v): return v or ""

logger = logging.getLogger("ssh_fastapi")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="NetTopology Cisco SSH Engine",
    description="Authentic Paramiko SSH interactive shell backend for Cisco & network devices",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# Models
# ==============================================================================
class SSHConnectRequest(BaseModel):
    host: str = Field(..., description="Target Cisco IP address or hostname")
    port: int = Field(22, description="SSH TCP port")
    username: str = Field("admin", description="SSH username")
    password: Optional[str] = Field("", description="SSH password")
    enable_password: Optional[str] = Field("", description="Cisco enable secret/password")
    device_id: Optional[str] = Field(None, description="Optional registered device ID")
    platform: Optional[str] = Field("cisco_ios", description="Device platform (cisco_ios, cisco_ios_xe, etc.)")
    term: Optional[str] = Field("xterm-256color", description="Terminal emulator type")
    cols: Optional[int] = Field(120, description="Terminal width in columns")
    rows: Optional[int] = Field(36, description="Terminal height in rows")
    timeout: Optional[float] = Field(10.0, description="Connection timeout in seconds")
    use_legacy: Optional[bool] = Field(False, description="Enforce legacy Cisco ciphers/KEX")

class SSHCommandRequest(BaseModel):
    session_id: str = Field(..., description="Active SSH session ID")
    command: str = Field(..., description="CLI command or input text")

class SSHCloseRequest(BaseModel):
    session_id: str = Field(..., description="SSH session ID to terminate")


# ==============================================================================
# Active SSH Session Registry
# ==============================================================================
class SSHSession:
    def __init__(
        self,
        session_id: str,
        host: str,
        port: int,
        username: str,
        client: paramiko.SSHClient,
        channel: paramiko.Channel,
        transport: Optional[paramiko.Transport] = None,
        platform: str = "cisco_ios",
        is_legacy: bool = False
    ):
        self.session_id = session_id
        self.host = host
        self.port = port
        self.username = username
        self.client = client
        self.channel = channel
        self.transport = transport or client.get_transport()
        self.platform = platform
        self.is_legacy = is_legacy
        self.created_at = time.time()
        self.last_activity = time.time()
        self.status = "connected"

    def is_active(self) -> bool:
        if not self.channel or self.channel.closed:
            return False
        if not self.transport or not self.transport.is_active():
            return False
        return True

    def close(self):
        self.status = "closed"
        if self.channel:
            try:
                self.channel.close()
            except Exception:
                pass
            self.channel = None

        if self.client:
            try:
                self.client.close()
            except Exception:
                pass
            self.client = None

        if self.transport:
            try:
                self.transport.close()
            except Exception:
                pass
            self.transport = None


class SSHSessionManager:
    def __init__(self):
        self.sessions: Dict[str, SSHSession] = {}

    def add_session(self, session: SSHSession):
        self.sessions[session.session_id] = session

    def get_session(self, session_id: str) -> Optional[SSHSession]:
        sess = self.sessions.get(session_id)
        if sess and not sess.is_active():
            sess.close()
            self.sessions.pop(session_id, None)
            return None
        return sess

    def remove_session(self, session_id: str) -> bool:
        sess = self.sessions.pop(session_id, None)
        if sess:
            sess.close()
            return True
        return False

    def list_sessions(self) -> List[Dict[str, Any]]:
        result = []
        expired = []
        for s_id, s in self.sessions.items():
            if s.is_active():
                result.append({
                    "session_id": s.session_id,
                    "host": s.host,
                    "port": s.port,
                    "username": s.username,
                    "platform": s.platform,
                    "status": s.status,
                    "created_at": s.created_at,
                    "uptime_seconds": round(time.time() - s.created_at, 1),
                    "is_legacy": s.is_legacy,
                })
            else:
                expired.append(s_id)
        for s_id in expired:
            self.remove_session(s_id)
        return result


session_manager = SSHSessionManager()


# ==============================================================================
# Paramiko Connection Factory (invoke_shell)
# ==============================================================================
def open_paramiko_cisco_session(
    host: str,
    port: int,
    username: str,
    password: str,
    term: str = "xterm-256color",
    cols: int = 120,
    rows: int = 36,
    timeout: float = 10.0,
    use_legacy: bool = False
) -> tuple[paramiko.SSHClient, paramiko.Channel, bool]:
    """
    Connects to real Cisco hardware and opens an authentic interactive PTY shell via invoke_shell().
    Strictly authentic device output - Zero Mock/Fake Generation.
    """
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    plain_pass = decrypt_credential(password) if password else ""

    # Legacy Cisco Catalyst (2960/3560/3750, IOS 12/15) algorithm suite
    if use_legacy:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, port))

        transport = paramiko.Transport(sock)
        sec = transport.get_security_options()

        legacy_kex = (
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group-exchange-sha256',
        )
        sec.kex = legacy_kex + tuple(k for k in sec.kex if k not in legacy_kex)

        legacy_ciphers = (
            'aes128-cbc',
            '3des-cbc',
            'aes256-cbc',
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
        )
        sec.ciphers = legacy_ciphers + tuple(c for c in sec.ciphers if c not in legacy_ciphers)

        legacy_keys = ('ssh-rsa', 'ssh-dss')
        sec.key_types = legacy_keys + tuple(k for k in sec.key_types if k not in legacy_keys)

        transport.start_client(timeout=timeout)

        # Authenticate with password or keyboard-interactive
        auth_success = False
        try:
            transport.auth_password(username=username, password=plain_pass)
            auth_success = transport.is_authenticated()
        except paramiko.BadAuthenticationType:
            def handler(title, instructions, prompts):
                return [plain_pass for _ in prompts]
            transport.auth_interactive(username=username, handler=handler)
            auth_success = transport.is_authenticated()

        if not auth_success:
            raise paramiko.AuthenticationException(f"Authentication failed for user '{username}' on Cisco host {host}:{port}")

        channel = transport.open_session(timeout=timeout)
        channel.get_pty(term=term, width=cols, height=rows)
        channel.invoke_shell()
        channel.settimeout(0.0)
        return client, channel, True

    # Modern Fast Path (Cisco IOS-XE, Nexus, Linux, MikroTik)
    try:
        client.connect(
            hostname=host,
            port=port,
            username=username,
            password=plain_pass,
            timeout=timeout,
            banner_timeout=timeout,
            auth_timeout=timeout,
            look_for_keys=False,
            allow_agent=False
        )
        transport = client.get_transport()
        if not transport or not transport.is_authenticated():
            raise paramiko.AuthenticationException(f"Authentication failed for user '{username}' on Cisco host {host}:{port}")

        channel = client.invoke_shell(term=term, width=cols, height=rows)
        channel.settimeout(0.0)
        return client, channel, False
    except (paramiko.SSHException, socket.error) as err:
        err_msg = str(err).lower()
        if any(w in err_msg for w in ["kex", "algorithm", "cipher", "handshake", "key", "negotiation", "unknown cipher"]):
            logger.info(f"[FastAPI SSH] Modern algorithm negotiation rejected by {host}:{port} ({err}). Retrying with Legacy Cisco suite...")
            try:
                client.close()
            except Exception:
                pass
            return open_paramiko_cisco_session(
                host=host,
                port=port,
                username=username,
                password=password,
                term=term,
                cols=cols,
                rows=rows,
                timeout=timeout,
                use_legacy=True
            )
        raise err


# ==============================================================================
# REST API Endpoints
# ==============================================================================
@app.get("/api/ssh/health")
def health_check():
    return {
        "status": "healthy",
        "engine": "FastAPI Paramiko Cisco Backend",
        "paramiko_version": getattr(paramiko, "__version__", "unknown"),
        "active_sessions": len(session_manager.sessions)
    }

@app.post("/api/ssh/connect")
def connect_ssh(req: SSHConnectRequest):
    """
    Establishes real SSH connection to Cisco hardware and invokes interactive shell.
    """
    session_id = f"cisco-{int(time.time()*1000)}-{os.urandom(3).hex()}"
    start_t = time.time()
    try:
        client, channel, is_legacy = open_paramiko_cisco_session(
            host=req.host,
            port=req.port,
            username=req.username,
            password=req.password or "",
            term=req.term or "xterm-256color",
            cols=req.cols or 120,
            rows=req.rows or 36,
            timeout=req.timeout or 10.0,
            use_legacy=req.use_legacy or False
        )
        latency_ms = round((time.time() - start_t) * 1000, 1)

        sess = SSHSession(
            session_id=session_id,
            host=req.host,
            port=req.port,
            username=req.username,
            client=client,
            channel=channel,
            platform=req.platform or "cisco_ios",
            is_legacy=is_legacy
        )
        session_manager.add_session(sess)

        # Allow Cisco banner/prompt to arrive
        time.sleep(0.3)
        initial_output = ""
        if channel.recv_ready():
            initial_output = channel.recv(4096).decode("utf-8", errors="replace")

        return {
            "success": True,
            "session_id": session_id,
            "status": "connected",
            "host": req.host,
            "port": req.port,
            "username": req.username,
            "is_real": True,
            "latency_ms": latency_ms,
            "is_legacy": is_legacy,
            "initial_output": initial_output,
            "message": f"Authentic Cisco interactive shell established on {req.host}:{req.port}"
        }
    except Exception as e:
        logger.error(f"[FastAPI SSH] Connection failed to {req.host}:{req.port}: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "success": False,
                "error": str(e),
                "host": req.host,
                "port": req.port,
                "username": req.username,
                "message": f"Failed to connect to Cisco device at {req.host}:{req.port} ({str(e)})"
            }
        )

@app.post("/api/ssh/command")
def send_command(req: SSHCommandRequest):
    """
    Sends a CLI command to the active Cisco interactive shell and returns the authentic response.
    """
    sess = session_manager.get_session(req.session_id)
    if not sess or not sess.is_active():
        raise HTTPException(status_code=404, detail="SSH session not found or disconnected")

    try:
        cmd_text = req.command
        if not cmd_text.endswith("\n"):
            cmd_text += "\n"

        sess.channel.send(cmd_text)
        sess.last_activity = time.time()

        # Read authentic output from Cisco CLI
        time.sleep(0.3)
        chunks = []
        max_wait = 3.0
        start_wait = time.time()
        while time.time() - start_wait < max_wait:
            if sess.channel.recv_ready():
                raw = sess.channel.recv(4096).decode("utf-8", errors="replace")
                chunks.append(raw)
                start_wait = time.time()  # reset timer on new data
            elif chunks:
                break
            time.sleep(0.05)

        output = "".join(chunks)
        return {
            "success": True,
            "session_id": req.session_id,
            "output": output
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute command: {e}")

@app.post("/api/ssh/close")
def close_session(req: SSHCloseRequest):
    """
    Properly closes an active SSH session and frees all Paramiko socket resources.
    """
    removed = session_manager.remove_session(req.session_id)
    return {
        "success": removed,
        "session_id": req.session_id,
        "message": "SSH session closed successfully" if removed else "Session was already closed"
    }

@app.get("/api/ssh/sessions")
def list_active_sessions():
    return {
        "success": True,
        "sessions": session_manager.list_sessions()
    }


# ==============================================================================
# WebSocket Interactive Streaming Engine (React -> FastAPI -> Paramiko -> Cisco)
# ==============================================================================
@app.websocket("/ws/ssh")
@app.websocket("/ws/ssh/{target_id}")
@app.websocket("/ws/terminal")
@app.websocket("/api/terminal/ws")
async def websocket_ssh_terminal(websocket: WebSocket, target_id: Optional[str] = None):
    """
    Live bidirectional interactive PTY shell streaming between React and Cisco hardware.
    Pipes keystrokes into invoke_shell() and streams Cisco CLI output back over WebSocket.
    """
    await websocket.accept()
    query_params = dict(websocket.query_params)

    # Resolve target details
    host = query_params.get("host") or query_params.get("ip") or ""
    port_str = query_params.get("port") or "22"
    port = int(port_str) if port_str.isdigit() else 22
    username = query_params.get("username") or query_params.get("user") or "admin"
    password = query_params.get("password") or ""
    platform = query_params.get("platform") or "cisco_ios"
    cols = int(query_params.get("cols") or 120)
    rows = int(query_params.get("rows") or 36)
    use_legacy = query_params.get("selected_profile") == "legacy_cisco"

    # If host missing but target_id provided, look up in inventory
    if not host and target_id:
        try:
            import json
            net_path = os.path.join(PROJECT_ROOT, "backend", "network_data.json")
            if os.path.exists(net_path):
                with open(net_path, "r", encoding="utf-8") as f:
                    inv = json.load(f)
                    for d in inv.get("devices", []):
                        if d.get("id") == target_id or d.get("name") == target_id:
                            host = d.get("ssh_host") or d.get("ip") or ""
                            port = int(d.get("ssh_port") or 22)
                            username = d.get("ssh_username") or username
                            password = d.get("ssh_password") or password
                            platform = d.get("platform") or platform
                            break
        except Exception as e:
            logger.warn(f"[FastAPI WS] Inventory lookup warning: {e}")

    if not host:
        await websocket.send_json({
            "type": "error",
            "error": "No target Cisco host or IP provided for SSH connection.",
            "code": "MISSING_HOST"
        })
        await websocket.send_json({
            "type": "status",
            "status": "failed",
            "message": "Missing host IP address."
        })
        await websocket.close()
        return

    # Notify WebSocket lifecycle stages
    await websocket.send_json({
        "type": "lifecycle_event",
        "event": {
            "id": f"evt-{int(time.time()*1000)}",
            "stage": "ws_connect",
            "title": "WebSocket Stream Open",
            "detail": f"FastAPI stream connected for Cisco target {host}:{port}",
            "status": "info",
            "timestamp": time.strftime("%H:%M:%S")
        }
    })

    await websocket.send_json({
        "type": "lifecycle_event",
        "event": {
            "id": f"evt-{int(time.time()*1000)}",
            "stage": "tcp_handshake",
            "title": "Initiating Paramiko SSH Connection",
            "detail": f"Establishing SSH connection to {host}:{port} via Paramiko...",
            "status": "info",
            "timestamp": time.strftime("%H:%M:%S")
        }
    })

    # Establish real Paramiko connection
    start_t = time.time()
    try:
        # Run blocking Paramiko connect in a separate thread so asyncio loop is not blocked
        loop = asyncio.get_running_loop()
        client, channel, is_legacy = await loop.run_in_executor(
            None,
            lambda: open_paramiko_cisco_session(
                host=host,
                port=port,
                username=username,
                password=password,
                term="xterm-256color",
                cols=cols,
                rows=rows,
                timeout=8.0,
                use_legacy=use_legacy
            )
        )
    except Exception as conn_err:
        logger.error(f"[FastAPI WS] Paramiko connect failed: {conn_err}")
        err_msg = str(conn_err)
        await websocket.send_json({
            "type": "lifecycle_event",
            "event": {
                "id": f"evt-{int(time.time()*1000)}",
                "stage": "exception",
                "title": "SSH Connection Failed",
                "detail": err_msg,
                "status": "error",
                "timestamp": time.strftime("%H:%M:%S")
            }
        })
        await websocket.send_json({
            "type": "error",
            "error": err_msg,
            "code": "SSH_CONNECTION_FAILED"
        })
        await websocket.send_json({
            "type": "status",
            "status": "failed",
            "error": err_msg,
            "message": f"Cisco connection failed: {err_msg}"
        })
        await websocket.send_json({
            "type": "data",
            "data": f"\r\n\x1b[1;31m[AUTHENTIC CISCO SSH FAILED]\x1b[0m Cannot connect to {host}:{port}\r\n\x1b[33mError:\x1b[0m {err_msg}\r\n"
        })
        await websocket.close()
        return

    latency_ms = max(1, round((time.time() - start_t) * 1000, 1))
    session_id = f"cisco-ws-{int(time.time()*1000)}-{os.urandom(3).hex()}"
    active_session = SSHSession(
        session_id=session_id,
        host=host,
        port=port,
        username=username,
        client=client,
        channel=channel,
        platform=platform,
        is_legacy=is_legacy
    )
    session_manager.add_session(active_session)

    # Success events
    await websocket.send_json({
        "type": "lifecycle_event",
        "event": {
            "id": f"evt-{int(time.time()*1000)}",
            "stage": "authentication",
            "title": "Authentication Succeeded",
            "detail": f"Authenticated user '{username}' on Cisco device {host}:{port} in {latency_ms}ms",
            "status": "success",
            "timestamp": time.strftime("%H:%M:%S")
        }
    })

    await websocket.send_json({
        "type": "lifecycle_event",
        "event": {
            "id": f"evt-{int(time.time()*1000)}",
            "stage": "shell_creation",
            "title": "Interactive Shell Active",
            "detail": "Paramiko invoke_shell() active. Authentic Cisco CLI stream open.",
            "status": "success",
            "timestamp": time.strftime("%H:%M:%S")
        }
    })

    await websocket.send_json({
        "type": "status",
        "status": "connected",
        "session_id": session_id,
        "is_real": True,
        "latency_ms": latency_ms,
        "legacy_algorithms": is_legacy,
        "message": f"Live Cisco SSH session established to {host}:{port}"
    })

    # ==========================================================================
    # Concurrent Bidirectional Streaming Loop
    # ==========================================================================
    stop_event = asyncio.Event()

    async def cisco_to_websocket_reader():
        """Reads authentic CLI output bytes from Cisco channel and sends over WebSocket."""
        try:
            while not stop_event.is_set():
                if channel.closed or channel.exit_status_ready():
                    break

                # Non-blocking check for available output
                has_data = await loop.run_in_executor(None, channel.recv_ready)
                if has_data:
                    raw_bytes = await loop.run_in_executor(None, lambda: channel.recv(4096))
                    if not raw_bytes:
                        break
                    text = raw_bytes.decode("utf-8", errors="replace")
                    # Send authentic Cisco CLI output directly without alteration
                    await websocket.send_json({
                        "type": "data",
                        "data": text
                    })
                else:
                    await asyncio.sleep(0.02)
        except Exception as e:
            logger.info(f"[FastAPI WS] Reader stopped: {e}")
        finally:
            stop_event.set()

    async def websocket_to_cisco_writer():
        """Reads keystrokes and commands from React WebSocket and writes to Cisco channel."""
        try:
            while not stop_event.is_set():
                raw_msg = await websocket.receive_text()
                try:
                    msg = json.loads(raw_msg)
                except Exception:
                    msg = {"type": "input", "data": raw_msg}

                msg_type = msg.get("type", "input")
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": int(time.time() * 1000)})
                elif msg_type in ("input", "stdin"):
                    input_data = msg.get("data", "")
                    if input_data and not channel.closed:
                        await loop.run_in_executor(None, lambda: channel.send(input_data))
                elif msg_type == "resize":
                    w = int(msg.get("cols") or cols)
                    h = int(msg.get("rows") or rows)
                    if not channel.closed:
                        await loop.run_in_executor(None, lambda: channel.resize_pty(width=w, height=h))
                elif msg_type == "close":
                    break
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        except Exception as e:
            logger.info(f"[FastAPI WS] Writer stopped: {e}")
        finally:
            stop_event.set()

    # Run reader and writer concurrently
    try:
        await asyncio.gather(
            cisco_to_websocket_reader(),
            websocket_to_cisco_writer(),
            return_exceptions=True
        )
    finally:
        stop_event.set()
        session_manager.remove_session(session_id)
        active_session.close()
        try:
            await websocket.send_json({
                "type": "status",
                "status": "disconnected",
                "message": f"Cisco SSH connection to {host}:{port} closed."
            })
            await websocket.close()
        except Exception:
            pass


# ==============================================================================
# Standalone Server Launcher
# ==============================================================================
def start_fastapi_server(port: int = 5002, host: str = "0.0.0.0"):
    import uvicorn
    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 5002
    start_fastapi_server(port=port)
