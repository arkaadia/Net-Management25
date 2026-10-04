"""
backend/tests/test_ssh_fastapi_backend.py
Comprehensive Unit & Integration Test Suite for FastAPI Paramiko SSH Backend.

Strictly follows Phase 1 guidelines:
- Paramiko 2.12.0 verification
- Connection Manager state & lifecycle testing
- REST API validation using standard library urllib
- Transparent error handling
- Zero network device dependencies (No tests on local IP or real physical Cisco switches)
- Zero mock data generation in production code
"""

import unittest
import time
import os
import sys
import json
import urllib.request
import urllib.error

# Ensure backend is on sys.path
TEST_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(TEST_DIR)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)

for path in [PROJECT_ROOT, BACKEND_DIR]:
    if path not in sys.path:
        sys.path.insert(0, path)

import paramiko

from backend.ssh_fastapi import (
    app,
    SSHConnectionManager,
    SSHSession,
    SSHConnectRequest,
    SSHCommandRequest,
    SSHCloseRequest,
    connection_manager,
)

BASE_URL = os.environ.get("FASTAPI_SSH_URL", "http://127.0.0.1:5002")


def api_request(method: str, path: str, data: dict = None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"} if data is not None else {}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"raw": content}
        return e.code, parsed


class TestSSHBackendUnit(unittest.TestCase):
    """Unit tests for SSH models, session logic, and connection manager."""

    def setUp(self):
        self.mgr = SSHConnectionManager()

    def tearDown(self):
        self.mgr.close_all()

    def test_01_paramiko_engine_version(self):
        """Rule 2 requirement: verify Paramiko 2.12.0 engine."""
        version = getattr(paramiko, "__version__", "")
        self.assertTrue(version.startswith("2.12"), f"Expected Paramiko 2.12.x, got '{version}'")

    def test_02_connect_request_validation(self):
        """Rule 4 requirement: receives host, port, username, password."""
        req = SSHConnectRequest(
            host="192.168.1.1",
            port=22,
            username="admin",
            password="secretpassword",
            enable_password="enablesecret",
            platform="cisco_ios",
            cols=120,
            rows=36,
            timeout=5.0,
            use_legacy=True
        )
        self.assertEqual(req.host, "192.168.1.1")
        self.assertEqual(req.port, 22)
        self.assertEqual(req.username, "admin")
        self.assertEqual(req.password, "secretpassword")
        self.assertEqual(req.enable_password, "enablesecret")
        self.assertTrue(req.use_legacy)

    def test_03_session_lifecycle(self):
        """Rule 8 requirement: session properly managed and closed."""
        sess = SSHSession(
            session_id="test-session-001",
            host="10.0.0.1",
            port=22,
            username="netadmin",
            client=None,
            channel=None,
            platform="cisco_ios",
            is_legacy=False
        )
        self.assertEqual(sess.status, "connected")
        self.assertEqual(sess.host, "10.0.0.1")
        self.assertFalse(sess.is_active())  # None channel is inactive

        sess.close()
        self.assertEqual(sess.status, "closed")

    def test_04_connection_manager_session_registry(self):
        """Rule 3 requirement: connection manager manages sessions safely."""
        sess1 = SSHSession(
            session_id="sess-alpha",
            host="10.10.10.1",
            port=22,
            username="admin",
            client=None,
            channel=None
        )
        self.mgr.add_session(sess1)

        # Inactive session should be pruned when requested
        retrieved = self.mgr.get_session("sess-alpha")
        self.assertIsNone(retrieved)

        # Close session
        removed = self.mgr.close_session("sess-alpha")
        self.assertFalse(removed)  # Already popped because it was inactive

    def test_05_manager_health(self):
        """Verify health check returns engine info and Paramiko version."""
        h = self.mgr.health()
        self.assertEqual(h["status"], "healthy")
        self.assertEqual(h["engine"], "FastAPI Paramiko Cisco Backend")
        self.assertTrue(h["paramiko_version"].startswith("2.12"))
        self.assertIsInstance(h["active_sessions"], int)


class TestSSHBackendAPIIntegration(unittest.TestCase):
    """Integration tests for FastAPI REST endpoints over live HTTP port."""

    def test_06_health_endpoints(self):
        """Verify /health and /api/ssh/health endpoints."""
        for path in ["/", "/health", "/api/ssh/health"]:
            status, data = api_request("GET", path)
            self.assertEqual(status, 200, f"Failed on endpoint {path}")
            self.assertEqual(data["status"], "healthy")
            self.assertEqual(data["engine"], "FastAPI Paramiko Cisco Backend")
            self.assertTrue(data["paramiko_version"].startswith("2.12"))

    def test_07_list_sessions_endpoint(self):
        """Verify GET /api/ssh/sessions returns valid list."""
        status, data = api_request("GET", "/api/ssh/sessions")
        self.assertEqual(status, 200)
        self.assertTrue(data["success"])
        self.assertIsInstance(data["sessions"], list)

    def test_08_command_on_nonexistent_session(self):
        """Verify POST /api/ssh/command returns 404 for invalid session."""
        status, data = api_request("POST", "/api/ssh/command", {
            "session_id": "nonexistent-session-id-12345",
            "command": "show version"
        })
        self.assertEqual(status, 404)

    def test_09_close_nonexistent_session(self):
        """Verify POST /api/ssh/close handles nonexistent session gracefully."""
        status, data = api_request("POST", "/api/ssh/close", {
            "session_id": "nonexistent-session-id-12345"
        })
        self.assertEqual(status, 200)
        self.assertFalse(data["success"])

    def test_10_close_all_sessions_endpoint(self):
        """Verify POST /api/ssh/sessions/close-all cleans up sessions."""
        status, data = api_request("POST", "/api/ssh/sessions/close-all")
        self.assertEqual(status, 200)
        self.assertTrue(data["success"])
        self.assertIn("closed_count", data)

    def test_11_connect_validation_error(self):
        """Verify POST /api/ssh/connect rejects invalid or empty requests."""
        status, data = api_request("POST", "/api/ssh/connect", {
            "username": "admin"
        })
        self.assertEqual(status, 422)

    def test_12_connect_failure_transparency(self):
        """
        Verify transparent error reporting on connection failure:
        Attempting to connect to an unreachable loopback port must return 502 with error details.
        No mock or fake Cisco data must be returned (Rule 8 & 9).
        """
        status, data = api_request("POST", "/api/ssh/connect", {
            "host": "127.0.0.1",
            "port": 1,  # Port 1 is reserved and closed
            "username": "testuser",
            "password": "testpassword",
            "timeout": 1.0
        })
        self.assertEqual(status, 502)
        self.assertIn("detail", data)
        self.assertFalse(data["detail"]["success"])
        self.assertIn("error", data["detail"])
        self.assertEqual(data["detail"]["host"], "127.0.0.1")
        self.assertEqual(data["detail"]["port"], 1)


if __name__ == "__main__":
    unittest.main()
