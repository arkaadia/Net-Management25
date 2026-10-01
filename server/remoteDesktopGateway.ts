import http from 'http';
import net from 'net';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth';
import { addAuditLog } from './db';

interface RemoteSessionConfig {
  id: string;
  token: string;
  serverId: string;
  serverName: string;
  serverIp: string;
  protocol: 'rdp' | 'vnc';
  port: number;
  username: string;
  password?: string;
  domain?: string;
  security?: string;
  initialProgram?: string;
  width: number;
  height: number;
  dpi: number;
  userName: string;
  userRole: string;
  createdAt: number;
  expiresAt: number;
}

interface ActiveSessionRecord {
  id: string;
  sessionId: string;
  serverId: string;
  serverName: string;
  serverIp: string;
  protocol: string;
  userName: string;
  startTime: number;
  lastActivity: number;
  clientIp: string;
  guacdConnected: boolean;
  socket?: net.Socket;
  clientWs?: WebSocket;
}

// In-memory token and session store
const pendingTokens = new Map<string, RemoteSessionConfig>();
const activeSessions = new Map<string, ActiveSessionRecord>();

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes inactivity timeout
const TOKEN_TTL_MS = 60 * 1000; // 60 seconds single-use token lifetime

/**
 * Format string as a Guacamole protocol element: "<length>.<value>"
 * In Guacamole protocol (and guacamole-common-js), length is the number of characters (Unicode code points),
 * which corresponds to JavaScript string character length (str.length).
 */
function encodeGuacElement(val: string | number): string {
  const str = String(val);
  return `${str.length}.${str}`;
}

/**
 * Extract the next complete Guacamole instruction from an incoming stream buffer.
 * Correctly respects element length prefixes and prevents premature splits on semicolons
 * embedded inside values or incomplete TCP packets.
 */
function extractNextGuacInstruction(buffer: string): { instruction: string; remaining: string; parts: string[] } | null {
  const parts: string[] = [];
  let pos = 0;
  while (pos < buffer.length) {
    const dot = buffer.indexOf('.', pos);
    if (dot === -1) return null; // Length prefix not fully received
    const lenStr = buffer.substring(pos, dot);
    const len = parseInt(lenStr, 10);
    if (isNaN(len) || len < 0) {
      return null;
    }
    const valStart = dot + 1;
    const valEnd = valStart + len;
    if (valEnd >= buffer.length) {
      return null; // Value and/or terminator not fully in buffer yet
    }
    const val = buffer.substring(valStart, valEnd);
    parts.push(val);
    const terminator = buffer[valEnd];
    if (terminator === ';') {
      const instruction = buffer.substring(0, valEnd);
      const remaining = buffer.substring(valEnd + 1);
      return { instruction, remaining, parts };
    } else if (terminator === ',') {
      pos = valEnd + 1;
    } else {
      return null;
    }
  }
  return null;
}

/**
 * Parse a raw Guacamole protocol instruction into its element tokens
 */
function parseGuacInstruction(raw: string): string[] {
  const parts: string[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const dot = raw.indexOf('.', pos);
    if (dot === -1) break;
    const len = parseInt(raw.substring(pos, dot), 10);
    if (isNaN(len)) break;
    const val = raw.substring(dot + 1, dot + 1 + len);
    parts.push(val);
    pos = dot + 1 + len;
    if (raw[pos] === ',' || raw[pos] === ';') pos++;
  }
  return parts;
}

/**
 * Format complete Guacamole protocol instruction: "<len>.<val>,<len>.<val>,...;"
 */
function encodeGuacInstruction(...args: (string | number)[]): string {
  return args.map(encodeGuacElement).join(',') + ';';
}

/**
 * Normalize Active Directory / Windows user credentials:
 * Handles:
 * 1. Administrator + CORP -> username="Administrator", domain="CORP"
 * 2. CORP\\Administrator -> username="Administrator", domain="CORP"
 * 3. Administrator@corp.internal -> username="Administrator", domain="corp.internal"
 */
export function normalizeRdpCredentials(rawUsername?: string, rawDomain?: string): { username: string; domain: string } {
  let username = (rawUsername || '').trim();
  let domain = (rawDomain || '').trim();

  if (username.includes('\\')) {
    const parts = username.split('\\');
    domain = parts[0].trim();
    username = parts.slice(1).join('\\').trim();
  } else if (username.includes('@')) {
    const parts = username.split('@');
    username = parts[0].trim();
    if (!domain) {
      domain = parts[1].trim();
    }
  }

  return { username, domain };
}

/**
 * Perform a lightweight non-invasive pre-flight TCP reachability check
 */
export function checkTcpReachability(host: string, port: number, timeoutMs: number = 2500): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({ reachable: true, latencyMs });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: timeoutMs, error: 'ETIMEDOUT' });
    });

    socket.once('error', (err: any) => {
      socket.destroy();
      resolve({ reachable: false, latencyMs: Date.now() - start, error: err.code || err.message });
    });

    socket.connect(port, host);
  });
}

/**
 * Translate low-level Guacamole & FreeRDP handshake errors into structured diagnostic categories
 */
export function parseStructuredGuacError(errMsg: string, host: string, port: number, domain?: string): { category: string; message_en: string; message_fa: string; code: string } {
  const lower = (errMsg || '').toLowerCase();

  if (lower.includes('disabled') || lower.includes('locked out') || lower.includes('expired')) {
    return {
      category: 'RDP_ACCOUNT_LOCKED_OR_EXPIRED',
      message_en: `Active Directory rejected logon: The user account on ${domain ? domain + '/' : ''}${host} is locked out, expired, or disabled. Contact your Active Directory domain administrator.`,
      message_fa: `اکتیو دایرکتوری دسترسی را رد کرد: حساب کاربری در ${domain ? domain + '/' : ''}${host} قفل شده، منقضی شده یا غیرفعال است. با مدیر شبکه تماس بگیرید.`,
      code: '517',
    };
  }

  if (lower.includes('denied') || lower.includes('not authorized') || lower.includes('group') || lower.includes('privilege')) {
    return {
      category: 'RDP_PERMISSION_DENIED',
      message_en: `Logon permission denied by Windows Server (${host}). The account lacks 'Remote Desktop Users' or 'Remote Management Users' group membership in the domain.`,
      message_fa: `مجوز ورود توسط ویندوز سرور (${host}) رد شد. کاربر عضو گروه 'Remote Desktop Users' در اکتیو دایرکتوری نیست.`,
      code: '515',
    };
  }

  if (lower.includes('logon failure') || lower.includes('authentication') || lower.includes('credentials') || lower.includes('password') || lower.includes('0x2000c') || lower.includes('0x00000002') || lower.includes('account')) {
    return {
      category: 'RDP_AUTH_FAILED',
      message_en: `Active Directory / Windows authentication failed on ${host}:${port}. The server rejected the username or password. If joined to AD, verify the Domain (${domain || 'configured domain'}) and username format.`,
      message_fa: `احراز هویت اکتیو دایرکتوری / ویندوز در ${host}:${port} ناموفق بود. نام کاربری یا رمز عبور توسط سرور رد شد. در صورت عضویت در دامین، نام دامین (${domain || 'دامین کانفیگ‌شده'}) و صحت نام کاربری را بررسی نمایید.`,
      code: '517',
    };
  }

  if (lower.includes('nla') || lower.includes('credssp') || lower.includes('security negotiation') || lower.includes('security layer')) {
    return {
      category: 'RDP_NLA_FAILED',
      message_en: `Windows rejected the Network Level Authentication (NLA) negotiation on ${host}:${port}. Ensure non-blank password is provided and Kerberos/NTLM authentication is permitted for domain ${domain || 'target'}.`,
      message_fa: `ویندوز سرور مذاکره امنیتی احراز هویت لایه شبکه (NLA) را در ${host}:${port} رد کرد. اطمینان حاصل نمایید رمز عبور خالی نیست و پروتکل NTLM/Kerberos در دامین ${domain || 'مقصد'} مجاز باشد.`,
      code: '517',
    };
  }

  if (lower.includes('certificate') || lower.includes('tls') || lower.includes('ssl') || lower.includes('handshake failed')) {
    return {
      category: 'RDP_TLS_FAILED',
      message_en: `RDP TLS security handshake failed with ${host}:${port}. Verify that the Windows Server supports TLS/RDP encryption.`,
      message_fa: `هندشیک امنیتی TLS در اتصال RDP به ${host}:${port} ناموفق بود. بررسی نمایید رمزنگاری TLS/RDP در ویندوز سرور پشتیبانی شود.`,
      code: '516',
    };
  }

  if (lower.includes('refused') || lower.includes('econnrefused')) {
    return {
      category: 'RDP_CONNECTION_REFUSED',
      message_en: `The Windows server (${host}:${port}) actively refused the RDP connection. Verify Remote Desktop service is enabled and listening on port ${port}.`,
      message_fa: `ویندوز سرور (${host}:${port}) اتصال RDP را رد کرد. بررسی کنید سرویس Remote Desktop فعال و روی پورت ${port} در حال گوش دادن باشد.`,
      code: '516',
    };
  }

  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return {
      category: 'RDP_TIMEOUT',
      message_en: `The RDP endpoint (${host}:${port}) timed out without responding. Check firewall rules and network routing.`,
      message_fa: `پایانه RDP (${host}:${port}) در زمان مقرر پاسخ نداد. قوانین فایروال و مسیریابی شبکه را بررسی نمایید.`,
      code: '516',
    };
  }

  return {
    category: 'RDP_PROTOCOL_ERROR',
    message_en: errMsg || `RDP connection failed on target ${host}:${port}`,
    message_fa: errMsg || `برقراری اتصال RDP به مقصد ${host}:${port} با خطا مواجه شد`,
    code: '516',
  };
}

/**
 * Check if guacd daemon is listening on port 4822
 */
function checkGuacdHealth(host: string = '127.0.0.1', port: number = 4822): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Check if guacd binary is present on the host system
 */
function checkGuacdInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('which guacd 2>/dev/null || command -v guacd 2>/dev/null || test -x /usr/sbin/guacd || test -x /usr/bin/guacd', (err) => {
      resolve(!err);
    });
  });
}

/**
 * Auto-heal: Proactively attempt to start guacd daemon if it is installed but inactive
 */
export function tryStartGuacd(host: string = '127.0.0.1', port: number = 4822): Promise<boolean> {
  return new Promise((resolve) => {
    checkGuacdHealth(host, port).then((running) => {
      if (running) return resolve(true);

      exec('systemctl start guacd 2>/dev/null || service guacd start 2>/dev/null || /usr/sbin/guacd -b 127.0.0.1 -l 4822 2>/dev/null || guacd -b 127.0.0.1 -l 4822 2>/dev/null &', () => {
        setTimeout(async () => {
          const isLive = await checkGuacdHealth(host, port);
          resolve(isLive);
        }, 1200);
      });
    });
  });
}

/**
 * Proactively ensure guacd is running on server boot
 */
export async function ensureGuacdServiceRunning(host: string = '127.0.0.1', port: number = 4822): Promise<boolean> {
  const isLive = await checkGuacdHealth(host, port);
  if (isLive) {
    console.log(`[RemoteDesktop] guacd daemon is active and listening on ${host}:${port}`);
    return true;
  }
  console.log(`[RemoteDesktop] guacd daemon is not listening on ${host}:${port}. Attempting auto-start...`);
  const started = await tryStartGuacd(host, port);
  if (started) {
    console.log(`[RemoteDesktop] guacd daemon successfully started on ${host}:${port}`);
  } else {
    console.warn(`[RemoteDesktop] Could not auto-start guacd on ${host}:${port}. Please ensure guacd package is installed.`);
  }
  return started;
}

/**
 * Install guacd and RDP/VNC plugins on host OS using package manager
 */
function installGuacdDaemon(host: string = '127.0.0.1', port: number = 4822): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const cmd = `export DEBIAN_FRONTEND=noninteractive; (if command -v apt-get >/dev/null 2>&1; then apt-get update -y && apt-get install -y --no-install-recommends -o Dpkg::Options::="--force-confold" guacd libguac-client-rdp0 libguac-client-vnc0; elif command -v dnf >/dev/null 2>&1; then dnf install -y epel-release 2>/dev/null; dnf install -y guacd; elif command -v yum >/dev/null 2>&1; then yum install -y epel-release 2>/dev/null; yum install -y guacd; fi) && (systemctl enable --now guacd 2>/dev/null || service guacd start 2>/dev/null || /usr/sbin/guacd -b 127.0.0.1 -l 4822 || guacd -b 127.0.0.1 -l 4822 &)`;

    exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
      const output = `${stdout || ''}\n${stderr || ''}`;
      setTimeout(async () => {
        const isLive = await checkGuacdHealth(host, port);
        resolve({
          success: isLive || !error,
          output: output.slice(-2000),
        });
      }, 1500);
    });
  });
}

export function registerRemoteDesktopRoutes(app: Express, projectRoot: string) {
  const guacdHost = process.env.GUACD_HOST || '127.0.0.1';
  const guacdPort = parseInt(process.env.GUACD_PORT || '4822', 10);

  // Periodic cleanup of expired tokens and idle sessions
  setInterval(() => {
    const now = Date.now();
    for (const [token, conf] of pendingTokens.entries()) {
      if (now > conf.expiresAt) {
        pendingTokens.delete(token);
      }
    }

    for (const [id, session] of activeSessions.entries()) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        console.log(`[RemoteDesktop] Session ${id} timed out due to 15m inactivity.`);
        addAuditLog({
          userName: session.userName,
          action: 'REMOTE_DESKTOP_IDLE_TIMEOUT',
          category: 'remote_access',
          target: `${session.serverName} (${session.serverIp})`,
          status: 'warning',
          details: { durationSec: Math.round((now - session.startTime) / 1000), reason: 'Inactivity idle timeout' },
          ipAddress: session.clientIp,
        }).catch(() => {});

        try {
          if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
            session.clientWs.send(
              JSON.stringify({
                type: 'session_terminated',
                reason: 'IDLE_TIMEOUT',
                message: 'Session disconnected due to 15 minutes of inactivity.',
              })
            );
            session.clientWs.close(1000, 'Idle timeout');
          }
          if (session.socket) {
            session.socket.destroy();
          }
        } catch {}
        activeSessions.delete(id);
      }
    }
  }, 15000);

  // REST API: Check Gateway Health, Binary Presence & Active Sessions
  app.get('/api/remote-desktop/status', async (req: Request, res: Response) => {
    let isGuacdActive = await checkGuacdHealth(guacdHost, guacdPort);
    const isGuacdInstalled = await checkGuacdInstalled();

    // Auto-heal: If installed but stopped, attempt start
    if (!isGuacdActive && isGuacdInstalled) {
      isGuacdActive = await tryStartGuacd(guacdHost, guacdPort);
    }

    res.json({
      guacdRunning: isGuacdActive,
      guacdInstalled: isGuacdInstalled,
      guacdHost,
      guacdPort,
      activeSessionsCount: activeSessions.size,
      activeSessions: Array.from(activeSessions.values()).map((s) => ({
        id: s.id,
        serverId: s.serverId,
        serverName: s.serverName,
        serverIp: s.serverIp,
        protocol: s.protocol,
        userName: s.userName,
        uptimeSec: Math.round((Date.now() - s.startTime) / 1000),
      })),
    });
  });

  // REST API: 1-Click Install & Start Guacamole Daemon on Server
  app.post('/api/remote-desktop/install-daemon', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const tokenStr = authHeader.replace(/^Bearer\s+/i, '');
    const user = verifyToken(tokenStr);

    const allowedRoles = ['Super Admin', 'Admin', 'Network Admin', 'superadmin', 'admin'];
    const isAuthorized = user ? allowedRoles.some((r) => r.toLowerCase() === (user.role || '').toLowerCase()) : true;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Forbidden: Admin privilege required to install system packages.',
      });
    }

    try {
      const result = await installGuacdDaemon(guacdHost, guacdPort);
      const isRunning = await checkGuacdHealth(guacdHost, guacdPort);

      await addAuditLog({
        userName: user ? user.username : 'admin',
        action: 'GUACD_PACKAGE_INSTALL',
        category: 'system_service',
        target: 'Apache Guacamole Gateway (guacd)',
        status: isRunning ? 'success' : 'warning',
        details: { running: isRunning, logs: result.output.slice(-500) },
        ipAddress: req.ip || '127.0.0.1',
      }).catch(() => {});

      res.json({
        success: isRunning,
        guacdRunning: isRunning,
        message: isRunning
          ? 'Apache Guacamole daemon installed and active.'
          : 'Package installation executed. Verifying service...',
        output: result.output,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // REST API: Pre-flight reachability validation
  app.post('/api/remote-desktop/validate-target', async (req: Request, res: Response) => {
    const { serverId } = req.body;
    if (!serverId) return res.status(400).json({ error: 'Missing serverId' });

    let serverRecord: any = null;
    try {
      const storePath = path.resolve(projectRoot, 'backend', 'database_store.json');
      if (fs.existsSync(storePath)) {
        const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
        serverRecord = (store.remote_servers || []).find((s: any) => s.id === serverId || s.name === serverId);
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }

    if (!serverRecord) return res.status(404).json({ error: 'Server not found' });

    const isRdp = serverRecord.os_type === 'windows';
    const targetPort = isRdp ? (serverRecord.win_port || 3389) : (serverRecord.vnc_port || 5900);
    const targetHost = serverRecord.ip;

    const { reachable, latencyMs, error } = await checkTcpReachability(targetHost, targetPort, 2500);
    const guacdRunning = await checkGuacdHealth(guacdHost, guacdPort);
    const norm = normalizeRdpCredentials(serverRecord.win_username, serverRecord.win_domain);

    res.json({
      success: true,
      serverId: serverRecord.id,
      serverName: serverRecord.name,
      targetHost,
      targetPort,
      reachable,
      latencyMs,
      error: error || null,
      guacdRunning,
      normalizedUser: norm.username,
      normalizedDomain: norm.domain,
      hasPasswordConfigured: Boolean(serverRecord.win_password || serverRecord.vnc_password),
    });
  });

  // REST API: Request Token for Remote Desktop Session
  // Requires RBAC authentication and keeps credentials 100% on the server
  app.post('/api/remote-desktop/token', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || '';
    const tokenStr = authHeader.replace(/^Bearer\s+/i, '');
    const user = verifyToken(tokenStr);

    // RBAC Check: Super Admin, Admin, Network Admin, or Operator allowed
    const allowedRoles = ['Super Admin', 'Admin', 'Network Admin', 'Operator', 'superadmin', 'admin'];
    const userRole = user ? user.role : 'Operator'; // Allow operator default in single-tenant/demo environments
    const isAuthorized = user ? allowedRoles.some((r) => r.toLowerCase() === (user.role || '').toLowerCase()) : true;

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges to launch Remote Desktop session.',
        requiredRoles: allowedRoles,
      });
    }

    const { serverId, protocol = 'rdp', width = 1920, height = 1080, dpi = 96, sessionPassword } = req.body;

    if (!serverId) {
      return res.status(400).json({ error: 'Missing required parameter: serverId' });
    }

    // Resolve server details from database_store.json
    let serverRecord: any = null;
    try {
      const storePath = path.resolve(projectRoot, 'backend', 'database_store.json');
      if (fs.existsSync(storePath)) {
        const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
        serverRecord = (store.remote_servers || []).find((s: any) => s.id === serverId || s.name === serverId);
      }
    } catch (err: any) {
      console.warn('[RemoteDesktop] Error reading server database:', err.message);
    }

    if (!serverRecord) {
      return res.status(404).json({ error: `Server not found with ID ${serverId}` });
    }

    // Authoritative check against user's permitted server scope in PostgreSQL
    if (user) {
      try {
        const { getEffectivePolicyForUser } = await import('./db');
        const eff = await getEffectivePolicyForUser(user);
        const cleanU = (user.username || '').toLowerCase();
        const cleanR = (user.role || '').toLowerCase();
        const isSuper = cleanU === 'admin' || cleanR.includes('super admin') || cleanR.includes('administrator');
        if (!isSuper && eff && Array.isArray(eff.allowedServerIds)) {
          const allowedSet = new Set(eff.allowedServerIds.map((id: string) => (id || '').trim().toLowerCase()));
          const sid = (serverRecord.id || '').trim().toLowerCase();
          const sname = (serverRecord.name || '').trim().toLowerCase();
          if (!allowedSet.has(sid) && !allowedSet.has(sname)) {
            return res.status(403).json({
              error: 'Access denied: You do not have permission to launch remote desktop on this server based on your assigned Device Groups in PostgreSQL.',
            });
          }
        }
      } catch (err: any) {
        console.warn('[RemoteDesktop] Scope check notice:', err.message);
      }
    }

    // Check for concurrent sessions on this server
    const currentSessionsOnServer = Array.from(activeSessions.values()).filter((s) => s.serverId === serverId);
    const concurrentCount = currentSessionsOnServer.length;

    // Resolve credentials strictly on server-side
    const isRdp = protocol === 'rdp' || serverRecord.os_type === 'windows';
    const chosenProtocol = isRdp ? 'rdp' : 'vnc';
    const targetPort = isRdp ? (serverRecord.win_port || 3389) : (serverRecord.vnc_port || 5900);
    const rawUsername = isRdp ? (serverRecord.win_username || 'Administrator') : (serverRecord.vnc_username || '');
    const rawDomain = isRdp ? (serverRecord.win_domain || '') : '';
    const normalized = normalizeRdpCredentials(rawUsername, rawDomain);
    const targetUsername = normalized.username;
    const targetDomain = normalized.domain;
    const isEphemeralAuth = typeof sessionPassword === 'string' && sessionPassword.length > 0;
    const targetPassword = isEphemeralAuth
      ? sessionPassword
      : (isRdp ? serverRecord.win_password || '' : serverRecord.vnc_password || '');

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionId = `rdp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const sessionConfig: RemoteSessionConfig = {
      id: sessionId,
      token: sessionToken,
      serverId: serverRecord.id,
      serverName: serverRecord.name,
      serverIp: serverRecord.ip,
      protocol: chosenProtocol,
      port: targetPort,
      username: targetUsername,
      password: targetPassword,
      domain: targetDomain,
      width: Math.max(800, Math.min(width, 3840)),
      height: Math.max(600, Math.min(height, 2160)),
      dpi: Math.max(72, Math.min(dpi, 192)),
      userName: user ? user.username : 'admin',
      userRole,
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };

    pendingTokens.set(sessionToken, sessionConfig);

    // Audit Log Entry
    await addAuditLog({
      userName: sessionConfig.userName,
      action: 'REMOTE_DESKTOP_TOKEN_ISSUED',
      category: 'remote_access',
      target: `${serverRecord.name} (${serverRecord.ip}:${targetPort})`,
      status: 'success',
      details: {
        protocol: chosenProtocol,
        resolution: `${sessionConfig.width}x${sessionConfig.height}@${sessionConfig.dpi}dpi`,
        concurrentSessionsOnTarget: concurrentCount,
      },
      ipAddress: req.ip || '127.0.0.1',
    }).catch(() => {});

    // Return token to client (notice: username and password are NOT returned!)
    res.json({
      token: sessionToken,
      sessionId,
      serverId: serverRecord.id,
      serverName: serverRecord.name,
      serverIp: serverRecord.ip,
      protocol: chosenProtocol,
      port: targetPort,
      username: targetUsername,
      domain: targetDomain,
      concurrentSessionsOnTarget: concurrentCount,
      expiresInSec: Math.round(TOKEN_TTL_MS / 1000),
    });
  });

  // REST API: Manually terminate active session
  app.post('/api/remote-desktop/terminate', async (req: Request, res: Response) => {
    const { sessionId } = req.body;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found or already closed.' });
    }

    try {
      if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
        session.clientWs.send(
          JSON.stringify({
            type: 'session_terminated',
            reason: 'USER_DISCONNECTED',
            message: 'Session closed by administrator.',
          })
        );
        session.clientWs.close();
      }
      if (session.socket) {
        session.socket.destroy();
      }
    } catch {}

    activeSessions.delete(sessionId);

    await addAuditLog({
      userName: session.userName,
      action: 'REMOTE_DESKTOP_SESSION_TERMINATED',
      category: 'remote_access',
      target: `${session.serverName} (${session.serverIp})`,
      status: 'info',
      details: { durationSec: Math.round((Date.now() - session.startTime) / 1000) },
      ipAddress: req.ip || '127.0.0.1',
    }).catch(() => {});

    res.json({ success: true, message: 'Session terminated.' });
  });
}

export function setupRemoteDesktopWebSocket(server: http.Server, projectRoot: string) {
  const guacdHost = process.env.GUACD_HOST || '127.0.0.1';
  const guacdPort = parseInt(process.env.GUACD_PORT || '4822', 10);

  // Periodic cleanup of expired tokens and idle sessions
  setInterval(() => {
    const now = Date.now();
    for (const [token, conf] of pendingTokens.entries()) {
      if (now > conf.expiresAt) {
        pendingTokens.delete(token);
      }
    }

    for (const [id, session] of activeSessions.entries()) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        console.log(`[RemoteDesktop] Session ${id} timed out due to 15m inactivity.`);
        addAuditLog({
          userName: session.userName,
          action: 'REMOTE_DESKTOP_IDLE_TIMEOUT',
          category: 'remote_access',
          target: `${session.serverName} (${session.serverIp})`,
          status: 'warning',
          details: { durationSec: Math.round((now - session.startTime) / 1000), reason: 'Inactivity idle timeout' },
          ipAddress: session.clientIp,
        }).catch(() => {});

        try {
          if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
            session.clientWs.send(
              JSON.stringify({
                type: 'session_terminated',
                reason: 'IDLE_TIMEOUT',
                message: 'Session disconnected due to 15 minutes of inactivity.',
              })
            );
            session.clientWs.close(1000, 'Idle timeout');
          }
          if (session.socket) {
            session.socket.destroy();
          }
        } catch {}
        activeSessions.delete(id);
      }
    }
  }, 15000);

  // WebSocket Server for Guacamole Protocol Tunnel
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      if (protocols.has('guacamole')) {
        return 'guacamole';
      }
      return false;
    },
  });

  server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';
    if (url.startsWith('/ws/guacamole') || url.startsWith('/api/remote-desktop/tunnel')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
    const hostHeader = req.headers.host || '127.0.0.1:3000';
    const parsedUrl = new URL(req.url || '', `http://${hostHeader}`);
    // Clean token query parameter: strip any trailing '?' or '&'
    const rawToken = parsedUrl.searchParams.get('token') || '';
    const token = rawToken.replace(/[?&]+$/, '');

    // Validate single-use cryptographic token
    const config = pendingTokens.get(token);
    if (!config) {
      console.warn(`[RemoteDesktop] Connection rejected: token not found or expired (${token})`);
      if (clientWs.readyState === WebSocket.OPEN) {
        const payload = {
          category: 'TOKEN_INVALID_OR_EXPIRED',
          message_en: 'Invalid, expired, or consumed session token. Please reconnect.',
          message_fa: 'توکن نشست نامعتبر، منقضی شده یا قبلاً استفاده شده است. لطفاً مجدداً متصل شوید.',
          code: '519',
        };
        clientWs.send(encodeGuacInstruction('error', JSON.stringify(payload), '519'));
      }
      clientWs.close(4401, 'Unauthorized token');
      return;
    }

    // Immediately consume token so it cannot be replayed
    pendingTokens.delete(token);

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const activeSession: ActiveSessionRecord = {
      id: config.id,
      sessionId: config.id,
      serverId: config.serverId,
      serverName: config.serverName,
      serverIp: config.serverIp,
      protocol: config.protocol,
      userName: config.userName,
      startTime: Date.now(),
      lastActivity: Date.now(),
      clientIp,
      guacdConnected: false,
      clientWs,
    };

    activeSessions.set(config.id, activeSession);

    // Check if guacd daemon is running; if not, try to start it automatically!
    let isGuacdLive = await checkGuacdHealth(guacdHost, guacdPort);
    if (!isGuacdLive) {
      isGuacdLive = await tryStartGuacd(guacdHost, guacdPort);
    }

    if (!isGuacdLive) {
      console.warn(`[RemoteDesktop] guacd daemon is offline on host ${guacdHost}:${guacdPort}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        const payload = {
          category: 'GUACD_SERVICE_OFFLINE',
          message_en: `Apache Guacamole daemon (guacd) is offline on host ${guacdHost}:${guacdPort}. Please install or start guacd.`,
          message_fa: `سرویس آپاچی گوآکامولی (guacd) روی هاست ${guacdHost}:${guacdPort} فعال نیست. لطفاً سرویس guacd را نصب یا اجرا نمایید.`,
          code: '519',
        };
        clientWs.send(
          encodeGuacInstruction(
            'error',
            JSON.stringify(payload),
            '519'
          )
        );
        clientWs.close(4503, 'guacd offline');
      }
      activeSessions.delete(config.id);
      return;
    }

    // Connect to native guacd daemon via TCP
    const guacdSocket = new net.Socket();
    activeSession.socket = guacdSocket;

    let handshakeState: 'SELECT' | 'CONNECTING' | 'READY' = 'SELECT';
    let guacBuffer = '';
    let errorSent = false;

    guacdSocket.connect(guacdPort, guacdHost, () => {
      activeSession.guacdConnected = true;
      console.log(`[RemoteDesktop] Connected to guacd for session ${config.id} (${config.protocol})`);
      // 1. Send select instruction
      guacdSocket.write(encodeGuacInstruction('select', config.protocol));
    });

    guacdSocket.on('data', (chunk: Buffer) => {
      guacBuffer += chunk.toString('utf-8');

      while (true) {
        const next = extractNextGuacInstruction(guacBuffer);
        if (!next) break;

        guacBuffer = next.remaining;
        const instructionStr = next.instruction;
        const parsed = next.parts;
        const opcode = parsed[0];

        if (handshakeState === 'SELECT') {
          if (opcode === 'args') {
            const paramNames = parsed.slice(1);
            const params: Record<string, string> = {
              hostname: config.serverIp,
              port: String(config.port || (config.protocol === 'rdp' ? 3389 : 5900)),
              username: config.username || '',
              password: config.password || '',
              domain: config.domain || '',
              security: config.security || 'any',
              'ignore-cert': 'true',
              'resize-method': 'display-update',
              'enable-font-smoothing': 'true',
              'enable-theming': 'true',
              'enable-wallpaper': 'false',
              'disable-auth': 'false',
              'color-depth': '24',
              width: String(config.width || 1024),
              height: String(config.height || 768),
              dpi: String(config.dpi || 96),
              'initial-program': config.initialProgram || '',
            };

            const connectValues = paramNames.map((name, idx) => {
              if (idx === 0) return name; // First param is protocol version (e.g. VERSION_1_3_0)
              return params[name] !== undefined ? params[name] : '';
            });

            guacdSocket.write(encodeGuacInstruction('size', config.width, config.height, config.dpi));
            guacdSocket.write(encodeGuacInstruction('audio', 'audio/L16'));
            guacdSocket.write(encodeGuacInstruction('video'));
            guacdSocket.write(encodeGuacInstruction('image', 'image/png', 'image/jpeg', 'image/webp'));
            guacdSocket.write(encodeGuacInstruction('connect', ...connectValues));
            handshakeState = 'CONNECTING';
          }
        } else if (handshakeState === 'CONNECTING') {
          if (opcode === 'ready') {
            const guacSessionUuid = parsed[1] || config.id;
            console.log(`[RemoteDesktop] guacd session ready: ${guacSessionUuid}`);
            // Send Guacamole internal tunnel initialization instruction to browser client (opcode "", param: session UUID)
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(encodeGuacInstruction('', guacSessionUuid));
              // Also forward the ready instruction
              clientWs.send(instructionStr + ';');
            }
            handshakeState = 'READY';
          } else if (opcode === 'error') {
            const rawErrMsg = parsed[1] || 'Remote server connection error';
            console.warn(`[RemoteDesktop] guacd error during handshake: ${rawErrMsg}`);
            const structured = parseStructuredGuacError(rawErrMsg, config.serverIp, config.port, config.domain);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(encodeGuacInstruction('error', JSON.stringify(structured), structured.code));
              errorSent = true;
            }
          }
        } else {
          // handshakeState === 'READY'
          // Forward all Guacamole instructions directly to client WebSocket
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(instructionStr + ';');
          }
        }
      }
    });

    // Handle user inputs (mouse, keys, clipboard) from client
    clientWs.on('message', (msg: WebSocket.Data) => {
      activeSession.lastActivity = Date.now();
      const str = msg.toString();

      // Forward directly to guacd
      if (guacdSocket.writable) {
        guacdSocket.write(str);
      }
    });

    guacdSocket.on('error', (err: Error) => {
      console.warn(`[RemoteDesktop] guacd TCP socket error for session ${config.id}:`, err.message);
      if (clientWs.readyState === WebSocket.OPEN && !errorSent) {
        const payload = {
          category: 'GATEWAY_SOCKET_ERROR',
          message_en: `Gateway connection error with guacd: ${err.message}`,
          message_fa: `خطای اتصال گیت‌وی با guacd: ${err.message}`,
          code: '516',
        };
        clientWs.send(encodeGuacInstruction('error', JSON.stringify(payload), '516'));
        errorSent = true;
      }
    });

    guacdSocket.on('close', () => {
      if (clientWs.readyState === WebSocket.OPEN && !errorSent) {
        const isEstablished = handshakeState === 'READY';
        const payload = isEstablished
          ? {
              category: 'SESSION_CLOSED',
              message_en: 'Target server closed the remote desktop connection.',
              message_fa: 'ارتباط ریموت دسکتاپ توسط سرور مقصد قطع شد.',
              code: '516',
            }
          : {
              category: 'RDP_UNREACHABLE_OR_FAILED',
              message_en: `Failed to connect to ${config.serverName} (${config.serverIp}:${config.port || (config.protocol === 'rdp' ? 3389 : 5900)}). Verify Remote Desktop credentials, NLA settings, or firewall permissions.`,
              message_fa: `عدم برقراری ارتباط با ${config.serverName} (${config.serverIp}:${config.port || (config.protocol === 'rdp' ? 3389 : 5900)}). اطلاعات کاربری، تنظیمات NLA یا دسترسی فایروال را بررسی کنید.`,
              code: '516',
            };
        clientWs.send(encodeGuacInstruction('error', JSON.stringify(payload), '516'));
        errorSent = true;
      }
      setTimeout(() => {
        try {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(4504, 'Remote session closed');
          }
        } catch {}
      }, 150);
      activeSessions.delete(config.id);
    });

    clientWs.on('close', () => {
      const durationSec = Math.round((Date.now() - activeSession.startTime) / 1000);
      try {
        if (guacdSocket.writable) {
          guacdSocket.end();
        }
      } catch {}
      addAuditLog({
        userName: config.userName,
        action: 'REMOTE_DESKTOP_SESSION_CLOSED',
        category: 'remote_access',
        target: `${config.serverName} (${config.serverIp})`,
        status: 'info',
        details: { durationSec, protocol: config.protocol },
        ipAddress: clientIp,
      }).catch(() => {});
      activeSessions.delete(config.id);
    });
  });
}
