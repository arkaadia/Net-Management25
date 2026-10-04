import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Terminal WebSocket Gateway
 * 
 * Pipeline: React (Frontend) -> FastAPI (Python Backend) -> Paramiko (invoke_shell) -> Cisco (Hardware)
 * 
 * Strictly adheres to user requirements:
 * 1. Frontend does not directly connect to Cisco.
 * 2. Backend Python handles SSH Connection via Paramiko.
 * 3. Uses Paramiko with invoke_shell() interactive PTY shell.
 * 4. Connects using host, port, username, password.
 * 5. Authentic Cisco hardware connection - strictly zero mock/fake data.
 * 6. Proper session creation and closure.
 * 7. Authentic CLI output streamed directly to frontend without alterations.
 */
export function setupTerminalWebSocket(
  server: http.Server,
  pythonPort: number,
  projectRoot: string,
  pythonWsPort: number = 5002
) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (
      url.startsWith('/ws/terminal') ||
      url.startsWith('/api/terminal/ws') ||
      url.startsWith('/ws/ssh') ||
      url.startsWith('/ssh') ||
      url.startsWith('/ws/server') ||
      url.startsWith('/api/server')
    ) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);

    // Extract deviceId from path /ws/ssh/:deviceId, /ws/terminal/:deviceId or query params
    let deviceId = '';
    const cleanPath = parsedUrl.pathname.replace(/^\/+/, '');
    const parts = cleanPath.split('/');
    if (parts.length >= 3 && parts[0] === 'ws' && (parts[1] === 'ssh' || parts[1] === 'terminal' || parts[1] === 'server')) {
      deviceId = parts[2];
    } else if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'terminal' && parts[2] === 'ws') {
      deviceId = parts[3];
    } else if (parts.length >= 2 && (parts[0] === 'ssh' || parts[0] === 'terminal' || parts[0] === 'server')) {
      deviceId = parts[1];
    }

    if (!deviceId) {
      deviceId = parsedUrl.searchParams.get('deviceId') || parsedUrl.searchParams.get('device_id') || '';
    }

    let rawHost = parsedUrl.searchParams.get('host') || parsedUrl.searchParams.get('ip') || '';
    let host = rawHost === 'undefined' || rawHost === 'null' ? '' : rawHost;
    let portStr = parsedUrl.searchParams.get('port') || '22';
    let port = parseInt(portStr === 'undefined' || portStr === 'null' ? '22' : portStr, 10) || 22;
    let rawUser = parsedUrl.searchParams.get('username') || parsedUrl.searchParams.get('user') || 'admin';
    let username = rawUser === 'undefined' || rawUser === 'null' ? 'admin' : rawUser;
    let rawPassword = parsedUrl.searchParams.get('password') || '';
    let password = rawPassword === 'undefined' || rawPassword === 'null' ? '' : rawPassword;
    let platform = parsedUrl.searchParams.get('platform') || 'cisco_ios';
    const cols = parsedUrl.searchParams.get('cols') || '120';
    const rows = parsedUrl.searchParams.get('rows') || '36';
    const selectedProfile = parsedUrl.searchParams.get('selected_profile') || parsedUrl.searchParams.get('selectedSshProfile') || 'auto';

    // If host or credentials missing, lookup in inventory
    if (deviceId && (!host || !password || !username)) {
      try {
        const netPath = path.resolve(projectRoot, 'backend', 'network_data.json');
        if (fs.existsSync(netPath)) {
          const netData = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
          const dev = (netData.devices || []).find((d: any) => d.id === deviceId || d.name === deviceId);
          if (dev) {
            if (!host) host = dev.ssh_host || dev.ip || dev.connection?.host || '';
            if (!port || port === 22) port = dev.ssh_port || dev.connection?.port || 22;
            if (!username || username === 'admin') username = dev.ssh_username || dev.connection?.username || 'admin';
            if (!password) password = dev.ssh_password || dev.connection?.password || '';
            if (!platform || platform === 'cisco_ios') platform = dev.platform || dev.type || 'cisco_ios';
          }
        }
      } catch (err) {
        console.warn('[TerminalWs] network_data.json lookup warning:', err);
      }

      if (!host) {
        try {
          const storePath = path.resolve(projectRoot, 'backend', 'database_store.json');
          if (fs.existsSync(storePath)) {
            const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
            const srv = (store.remote_servers || []).find((s: any) => s.id === deviceId || s.name === deviceId);
            if (srv) {
              host = srv.ip || srv.hostname || '';
              port = srv.ssh_port || 22;
              username = srv.ssh_username || 'root';
              password = srv.ssh_password || '';
              platform = 'linux';
            }
          }
        } catch (err) {
          console.warn('[TerminalWs] database_store.json lookup warning:', err);
        }
      }
    }

    if (!host) {
      clientWs.send(JSON.stringify({
        type: 'error',
        error: 'No target Cisco IP or hostname specified for device terminal.',
        code: 'MISSING_HOST',
      }));
      clientWs.send(JSON.stringify({
        type: 'status',
        status: 'failed',
        message: 'No IP address found for this device.',
      }));
      clientWs.send(JSON.stringify({
        type: 'data',
        data: `\r\n\x1b[1;31m[CONFIGURATION ERROR]\x1b[0m No target IP address or hostname assigned to device '${deviceId}'.\r\n`,
      }));
      return;
    }

    console.log(`[TerminalWs Proxy] Forwarding React terminal stream -> FastAPI Paramiko backend (Target: ${username}@${host}:${port}, Profile: ${selectedProfile})`);

    // Build URL to FastAPI WebSocket endpoint
    const fastApiUrl = new URL(`ws://127.0.0.1:${pythonWsPort}/ws/ssh`);
    fastApiUrl.searchParams.set('host', host);
    fastApiUrl.searchParams.set('port', String(port));
    fastApiUrl.searchParams.set('username', username);
    if (password) fastApiUrl.searchParams.set('password', password);
    fastApiUrl.searchParams.set('platform', platform);
    fastApiUrl.searchParams.set('cols', cols);
    fastApiUrl.searchParams.set('rows', rows);
    fastApiUrl.searchParams.set('selected_profile', selectedProfile);

    let fastApiWs: WebSocket | null = null;
    try {
      fastApiWs = new WebSocket(fastApiUrl.toString());
    } catch (wsErr: any) {
      console.error('[TerminalWs] Failed to create WebSocket connection to FastAPI:', wsErr);
      clientWs.send(JSON.stringify({
        type: 'error',
        error: `FastAPI SSH backend connection error: ${wsErr.message}`,
        code: 'FASTAPI_CONNECT_ERROR',
      }));
      return;
    }

    fastApiWs.on('open', () => {
      console.log(`[TerminalWs Proxy] Connected to FastAPI Paramiko backend for ${host}:${port}`);
    });

    // Pipe authentic CLI stream directly from FastAPI/Paramiko to React
    fastApiWs.on('message', (data: WebSocket.Data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(data);
        } catch (err: any) {
          console.warn('[TerminalWs Proxy] Forward to client warning:', err.message);
        }
      }
    });

    fastApiWs.on('error', (err: Error) => {
      console.warn(`[TerminalWs Proxy] FastAPI backend error for ${host}:${port}:`, err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'error',
          error: `Backend SSH error: ${err.message}`,
          code: 'BACKEND_SSH_ERROR',
        }));
      }
    });

    fastApiWs.on('close', (code, reason) => {
      console.log(`[TerminalWs Proxy] FastAPI backend closed connection (code: ${code}, reason: ${reason.toString()})`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(code, reason);
      }
    });

    // Pipe user keystrokes / commands from React to FastAPI Paramiko channel
    clientWs.on('message', (raw: WebSocket.Data) => {
      if (fastApiWs && fastApiWs.readyState === WebSocket.OPEN) {
        try {
          fastApiWs.send(raw);
        } catch (err: any) {
          console.warn('[TerminalWs Proxy] Forward to FastAPI warning:', err.message);
        }
      }
    });

    clientWs.on('close', () => {
      if (fastApiWs) {
        try {
          fastApiWs.close();
        } catch {}
      }
    });
  });
}
