import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { Client, ConnectConfig } from 'ssh2';

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

    // If host is configured, attempt native ssh2 client connection directly
    if (host && host !== '0.0.0.0') {
      let isSshConnected = false;
      let hasRetriedLegacy = false;
      let activeSshClient: Client | null = null;

      const attemptSshConnect = (useLegacyAlgorithms = false) => {
        const sshClient = new Client();
        activeSshClient = sshClient;

        sendClient({
          type: 'status',
          status: 'connecting',
          host,
          port,
          message: useLegacyAlgorithms
            ? `Connecting to ${host}:${port} via SSH2 (Legacy Adaptive Mode)...`
            : `Connecting to ${host}:${port} via SSH2 Native Engine...`,
        });

        sshClient.on('ready', () => {
          isSshConnected = true;
          sshClient.shell(
            { term: 'xterm-256color', cols: 120, rows: 36 },
            (err, stream) => {
              if (err) {
                console.warn(`[TerminalWs] PTY Shell creation error on ${host}:`, err.message);
                sendClient({
                  type: 'status',
                  status: 'failed',
                  error: err.message,
                  message: `Failed to open PTY shell on ${host}: ${err.message}`,
                });
                return;
              }

              sendClient({
                type: 'status',
                status: 'connected',
                is_real: true,
                host,
                port,
                username,
                message: `Live SSH connected to ${host}:${port} (${shell})`,
              });

              stream.on('data', (chunk: Buffer) => {
                sendClient({
                  type: 'data',
                  data: chunk.toString('utf-8'),
                });
              });

              stream.on('close', () => {
                sendClient({
                  type: 'status',
                  status: 'disconnected',
                  message: `SSH stream from ${host} closed.`,
                });
                try {
                  sshClient.end();
                } catch {}
              });

              clientWs.on('message', (raw: WebSocket.Data) => {
                try {
                  const text = raw.toString();
                  let msgData = text;
                  try {
                    const parsed = JSON.parse(text);
                    if (parsed.type === 'input' || parsed.type === 'stdin') {
                      msgData = parsed.data || '';
                    } else if (parsed.type === 'resize') {
                      stream.setWindow(parsed.rows || 36, parsed.cols || 120, 0, 0);
                      return;
                    }
                  } catch {}
                  stream.write(msgData);
                } catch (writeErr: any) {
                  console.warn('[TerminalWs] Stream write error:', writeErr.message);
                }
              });
            }
          );
        });

        sshClient.on('error', (err: Error) => {
          console.warn(`[TerminalWs] SSH2 connection error to ${host}:${port}:`, err.message);

          // Rule 12: Adaptive Protocol Negotiation - modern first, automatic legacy fallback
          const isAlgorithmOrHandshakeError =
            err.message.includes('handshake') ||
            err.message.includes('algorithm') ||
            err.message.includes('kex') ||
            err.message.includes('key') ||
            err.message.includes('cipher') ||
            err.message.includes('negotiation');

          if (!useLegacyAlgorithms && !hasRetriedLegacy && isAlgorithmOrHandshakeError) {
            hasRetriedLegacy = true;
            try {
              sshClient.end();
            } catch {}
            sendClient({
              type: 'data',
              data: `\r\n\x1b[36m[Adaptive SSH]\x1b[0m Modern algorithm negotiation failed (${err.message}). Retrying with legacy cryptographic ciphers...\r\n`,
            });
            setTimeout(() => {
              attemptSshConnect(true);
            }, 300);
            return;
          }

          sendClient({
            type: 'status',
            status: 'failed',
            error: err.message,
            message: `Connection failed: ${err.message}`,
          });
          sendClient({
            type: 'data',
            data: `\r\n\x1b[33m[SSH Notice]\x1b[0m Direct SSH to ${host}:${port} unreachable (${err.message}).\r\n\x1b[90mActive in interactive terminal emulator runtime.\x1b[0m\r\n`,
          });
        });

        sshClient.on('close', () => {
          if (isSshConnected) {
            sendClient({
              type: 'status',
              status: 'disconnected',
              message: 'SSH connection terminated.',
            });
          }
        });

        const connectConfig: ConnectConfig = {
          host,
          port,
          username,
          readyTimeout: 7000,
          keepaliveInterval: 10000,
        };

        if (password) {
          connectConfig.password = password;
        }

        if (useLegacyAlgorithms) {
          connectConfig.algorithms = {
            kex: [
              'ecdh-sha2-nistp256',
              'ecdh-sha2-nistp384',
              'ecdh-sha2-nistp521',
              'diffie-hellman-group16-sha512',
              'diffie-hellman-group18-sha512',
              'diffie-hellman-group-exchange-sha256',
              'diffie-hellman-group14-sha256',
              'diffie-hellman-group14-sha1',
              'diffie-hellman-group-exchange-sha1',
              'diffie-hellman-group1-sha1',
            ],
            cipher: [
              'chacha20-poly1305@openssh.com',
              'aes256-gcm@openssh.com',
              'aes128-gcm@openssh.com',
              'aes256-gcm',
              'aes128-gcm',
              'aes256-ctr',
              'aes192-ctr',
              'aes128-ctr',
              'aes256-cbc',
              'aes192-cbc',
              'aes128-cbc',
              '3des-cbc',
            ],
            serverHostKey: [
              'ssh-ed25519',
              'ecdsa-sha2-nistp256',
              'ecdsa-sha2-nistp384',
              'ecdsa-sha2-nistp521',
              'rsa-sha2-512',
              'rsa-sha2-256',
              'ssh-rsa',
              'ssh-dss',
            ],
          };
        }

        try {
          sshClient.connect(connectConfig);
        } catch (connErr: any) {
          sendClient({
            type: 'status',
            status: 'failed',
            error: connErr.message,
          });
        }
      };

      clientWs.on('close', () => {
        try {
          activeSshClient?.end();
        } catch {}
      });

      attemptSshConnect(false);
      return;
    }

    // Default fallback when no specific host is configured
    sendClient({
      type: 'status',
      status: 'connected',
      is_real: false,
      message: 'Connected to interactive terminal emulator runtime.',
    });
  });
}
