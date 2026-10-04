import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Terminal WebSocket Gateway
 * Supports native direct ssh2 client for real Linux remote servers and switches
 * with full interactive PTY streaming, input forwarding, and clean fallback.
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
      url.startsWith('/ssh')
    ) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);

    // Extract device_id from path /ws/ssh/:deviceId, /ws/terminal/:deviceId, /ssh/:deviceId or query params
    let deviceId = '';
    const cleanPath = parsedUrl.pathname.replace(/^\/+/, '');
    const parts = cleanPath.split('/');
    if (parts.length >= 3 && parts[0] === 'ws' && (parts[1] === 'ssh' || parts[1] === 'terminal')) {
      deviceId = parts[2];
    } else if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'terminal' && parts[2] === 'ws') {
      deviceId = parts[3];
    } else if (parts.length >= 2 && (parts[0] === 'ssh' || parts[0] === 'terminal')) {
      deviceId = parts[1];
    }

    if (!deviceId) {
      deviceId = parsedUrl.searchParams.get('deviceId') || parsedUrl.searchParams.get('device_id') || '';
    }

    let rawHost = parsedUrl.searchParams.get('host') || parsedUrl.searchParams.get('ip') || '';
    let host = rawHost === 'undefined' || rawHost === 'null' ? '' : rawHost;
    let portStr = parsedUrl.searchParams.get('port') || '22';
    let port = parseInt(portStr === 'undefined' || portStr === 'null' ? '22' : portStr, 10) || 22;
    let rawUser = parsedUrl.searchParams.get('username') || parsedUrl.searchParams.get('user') || 'root';
    let username = rawUser === 'undefined' || rawUser === 'null' ? 'root' : rawUser;
    let rawPassword = parsedUrl.searchParams.get('password') || '';
    let password = rawPassword === 'undefined' || rawPassword === 'null' ? '' : rawPassword;
    const shell = parsedUrl.searchParams.get('shell') || 'bash';

    // If host is not in query params or empty, look up in database_store.json
    if (!host && deviceId && deviceId !== 'undefined' && deviceId !== 'null') {
      try {
        const storePath = path.resolve(projectRoot, 'backend', 'database_store.json');
        if (fs.existsSync(storePath)) {
          const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
          const srv = (store.remote_servers || []).find(
            (s: any) => s.id === deviceId || s.name === deviceId || s.hostname === deviceId
          );
          if (srv) {
            host = srv.ip || srv.hostname || '';
            port = srv.ssh_port || 22;
            username = srv.ssh_username || 'root';
            if (!password && !srv.prompt_password_on_connect) {
              password = srv.ssh_password || '';
            }

            // Authoritative server scope check
            const token = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('auth') || '';
            if (token) {
              try {
                const { verifyToken } = await import('./auth');
                const payload = verifyToken(token);
                if (payload) {
                  const { getEffectivePolicyForUser, isServerActionPermitted } = await import('./db');
                  const eff = await getEffectivePolicyForUser(payload);
                  const cleanU = (payload.username || '').toLowerCase();
                  const cleanR = (payload.role || '').toLowerCase();
                  const isSuper = cleanU === 'admin' || cleanR.includes('super admin') || cleanR.includes('administrator');
                  if (!isSuper && eff) {
                    if (Array.isArray(eff.allowedServerIds)) {
                      const allowedSet = new Set(eff.allowedServerIds.map((id: string) => (id || '').trim().toLowerCase()));
                      if (!allowedSet.has((srv.id || '').toLowerCase()) && !allowedSet.has((srv.name || '').toLowerCase())) {
                        clientWs.send(JSON.stringify({ type: 'output', data: '\r\n\x1b[31m[Access Denied]: You do not have permission to access this server based on your assigned Device Groups in PostgreSQL.\x1b[0m\r\n' }));
                        clientWs.close(4003, 'Forbidden');
                        return;
                      }
                    }
                    if (!isServerActionPermitted(eff, srv.id, 'terminal')) {
                      clientWs.send(JSON.stringify({ type: 'output', data: '\r\n\x1b[31m[Access Denied]: Terminal and remote shell access to this server is prohibited by your RBAC access policy.\x1b[0m\r\n' }));
                      clientWs.close(4003, 'Forbidden');
                      return;
                    }
                  }
                }
              } catch (authErr: any) {
                console.warn('[TerminalWs] Scope verification notice:', authErr.message);
              }
            }
          } else {
            const dev = (store.devices || []).find((d: any) => d.id === deviceId || d.name === deviceId);
            if (dev) {
              host = dev.ip || '';
              port = dev.connection?.port || dev.ssh_port || 22;
              username = dev.connection?.username || dev.ssh_username || 'admin';
              if (!password) {
                password = dev.connection?.password || dev.ssh_password || '';
              }

              // Authoritative network equipment scope & terminal permission check
              const token = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('auth') || '';
              if (token) {
                try {
                  const { verifyToken } = await import('./auth');
                  const payload = verifyToken(token);
                  if (payload) {
                    const { getEffectivePolicyForUser, isDeviceActionPermitted } = await import('./db');
                    const eff = await getEffectivePolicyForUser(payload);
                    const cleanU = (payload.username || '').toLowerCase();
                    const cleanR = (payload.role || '').toLowerCase();
                    const isSuper = cleanU === 'admin' || cleanR.includes('super admin') || cleanR.includes('administrator');
                    if (!isSuper && eff) {
                      // 1. Device scope check (PostgreSQL device groups)
                      if (Array.isArray(eff.allowedDeviceIds)) {
                        const allowedSet = new Set(eff.allowedDeviceIds.map((id: string) => (id || '').trim().toLowerCase()));
                        if (!allowedSet.has((dev.id || '').toLowerCase()) && !allowedSet.has((dev.name || '').toLowerCase())) {
                          clientWs.send(JSON.stringify({
                            type: 'output',
                            data: '\r\n\x1b[31m[Access Denied]: You do not have permission to access this network device based on your assigned Device Groups in PostgreSQL.\x1b[0m\r\n'
                          }));
                          clientWs.close(4003, 'Forbidden');
                          return;
                        }
                      }
                      // 2. Granular device terminal action check
                      if (!isDeviceActionPermitted(eff, dev.id, 'terminal')) {
                        clientWs.send(JSON.stringify({
                          type: 'output',
                          data: '\r\n\x1b[31m[Access Denied]: Terminal and interactive CLI access to this network device is prohibited by your RBAC access policy in PostgreSQL.\x1b[0m\r\n'
                        }));
                        clientWs.close(4003, 'Forbidden');
                        return;
                      }
                    }
                  }
                } catch (authErr: any) {
                  console.warn('[TerminalWs] Device scope verification notice:', authErr.message);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[TerminalWs] Database store lookup warning:', err);
      }
    }

    const sendClient = (payload: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        if (typeof payload === 'string') {
          clientWs.send(payload);
        } else {
          clientWs.send(JSON.stringify(payload));
        }
      }
    };

    // Resolve SSH backend version and parameters
    const devSshVersion = parsedUrl.searchParams.get('ssh_version') || parsedUrl.searchParams.get('sshVersion') || '';
    let selectedProfile = parsedUrl.searchParams.get('selected_profile') || '';
    const platform = parsedUrl.searchParams.get('platform') || 'cisco_ios';
    const cols = parsedUrl.searchParams.get('cols') || '120';
    const rows = parsedUrl.searchParams.get('rows') || '36';

    if (!selectedProfile) {
      if (devSshVersion === 'legacy') {
        selectedProfile = 'legacy_cisco';
      } else if (devSshVersion === 'modern') {
        selectedProfile = 'modern_enterprise';
      }
    }

    if (!host) {
      sendClient({
        type: 'error',
        error: `No target host IP address found for device '${deviceId}'.`,
        code: 'MISSING_HOST',
      });
      sendClient({
        type: 'status',
        status: 'failed',
        message: 'No IP address found for this device.',
      });
      sendClient({
        type: 'data',
        data: `\r\n\x1b[1;31m[CONFIGURATION ERROR]\x1b[0m No target IP address or hostname assigned to device '${deviceId}'.\r\n`,
      });
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
    let isClientClosed = false;

    const connectToFastApi = (retryCount = 0) => {
      if (isClientClosed) return;
      try {
        fastApiWs = new WebSocket(fastApiUrl.toString());
      } catch (wsErr: any) {
        console.error('[TerminalWs] Failed to create WebSocket connection to FastAPI:', wsErr);
        sendClient({
          type: 'error',
          error: `FastAPI SSH backend connection error: ${wsErr.message}`,
          code: 'FASTAPI_CONNECT_ERROR',
        });
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
        // If FastAPI is still binding on port, retry once after short delay
        if (retryCount < 2 && (err.message.includes('ECONNREFUSED') || err.message.includes('connect'))) {
          console.log(`[TerminalWs Proxy] Retrying connection to FastAPI backend (attempt ${retryCount + 1})...`);
          setTimeout(() => connectToFastApi(retryCount + 1), 600);
          return;
        }
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'error',
            error: `Backend SSH error: ${err.message}`,
            code: 'BACKEND_SSH_ERROR',
          }));
        }
      });

      fastApiWs.on('close', (code, reason) => {
        console.log(`[TerminalWs Proxy] FastAPI backend closed connection (code: ${code}, reason: ${reason?.toString() || ''})`);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(code, reason);
        }
      });
    };

    connectToFastApi(0);

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
      isClientClosed = true;
      if (fastApiWs) {
        try {
          fastApiWs.close();
        } catch {}
      }
    });
  });
}
