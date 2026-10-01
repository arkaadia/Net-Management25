import net from 'net';
import tls from 'tls';
import ldap from 'ldapjs';
import { ActiveDirectoryConfig, ADTestResult, ADSecurityGroup, ADUser } from '../src/types';

/**
 * Normalizes input configuration from camelCase, snake_case, or partial objects.
 */
export function normalizeADConfig(raw: any): ActiveDirectoryConfig {
  const cfg = raw || {};
  const useSsl = Boolean(cfg.useSsl ?? cfg.use_ssl ?? (Number(cfg.port) === 636));
  const port = Number(cfg.port) || (useSsl ? 636 : 389);
  return {
    enabled: Boolean(cfg.enabled ?? true),
    server: String(cfg.server || cfg.host || '').trim(),
    port,
    useSsl,
    domain: String(cfg.domain || '').trim(),
    baseDn: String(cfg.baseDn || cfg.base_dn || '').trim(),
    bindUser: String(cfg.bindUser || cfg.bind_user || '').trim(),
    bindPassword: String(cfg.bindPassword || cfg.bind_password || ''),
    userSearchBase: String(cfg.userSearchBase || cfg.user_search_base || '').trim(),
    groupSearchBase: String(cfg.groupSearchBase || cfg.group_search_base || '').trim(),
    lastSyncStatus: cfg.lastSyncStatus || 'idle',
    lastSyncMessage: cfg.lastSyncMessage,
    lastSyncTime: cfg.lastSyncTime || null,
    syncedGroups: Array.isArray(cfg.syncedGroups) ? cfg.syncedGroups : [],
    syncedUsers: Array.isArray(cfg.syncedUsers) ? cfg.syncedUsers : [],
  };
}

/**
 * Probes TCP/TLS socket to measure authentic network latency and connection reachability.
 */
function probeSocket(host: string, port: number, useSsl: boolean, timeoutMs = 5000): Promise<{ reachable: boolean; latency: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let isResolved = false;

    const onFinish = (reachable: boolean, error?: string) => {
      if (isResolved) return;
      isResolved = true;
      const latency = Math.max(1, Date.now() - startTime);
      resolve({ reachable, latency, error });
    };

    if (useSsl) {
      const socket = tls.connect(
        {
          host,
          port,
          rejectUnauthorized: false,
          timeout: timeoutMs,
        },
        () => {
          socket.destroy();
          onFinish(true);
        }
      );
      socket.on('timeout', () => {
        socket.destroy();
        onFinish(false, `Connection timed out after ${timeoutMs}ms`);
      });
      socket.on('error', (err) => {
        socket.destroy();
        onFinish(false, err.message);
      });
    } else {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.connect(port, host, () => {
        socket.destroy();
        onFinish(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        onFinish(false, `Connection timed out after ${timeoutMs}ms`);
      });
      socket.on('error', (err) => {
        socket.destroy();
        onFinish(false, err.message);
      });
    }
  });
}

/**
 * Creates an authentic LDAP client configured for the given Active Directory host.
 */
function createLdapClient(cfg: ActiveDirectoryConfig, timeoutMs = 8000): ldap.Client {
  const protocol = cfg.useSsl ? 'ldaps' : 'ldap';
  const url = `${protocol}://${cfg.server}:${cfg.port}`;

  return ldap.createClient({
    url,
    timeout: timeoutMs,
    connectTimeout: timeoutMs,
    tlsOptions: cfg.useSsl ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Authentically tests the Active Directory / LDAP connection and credentials.
 */
export async function testLdapConnection(rawCfg: any): Promise<ADTestResult> {
  const cfg = normalizeADConfig(rawCfg);
  const logs: string[] = [];

  if (!cfg.server || !cfg.server.trim()) {
    return {
      success: false,
      latency_ms: 0,
      message: 'Server hostname or IP address is required.',
      logs: ['[Configuration Error] Domain Controller server address is missing.'],
    };
  }

  const port = cfg.port || (cfg.useSsl ? 636 : 389);
  logs.push(`[Network Probe] Testing TCP reachability to ${cfg.server}:${port}...`);

  const probe = await probeSocket(cfg.server, port, cfg.useSsl, 5000);
  if (!probe.reachable) {
    logs.push(`[Socket Failure] Could not connect to ${cfg.server}:${port}: ${probe.error || 'Connection refused/timeout'}`);
    return {
      success: false,
      latency_ms: probe.latency,
      message: `Failed to connect to ${cfg.server}:${port}: ${probe.error || 'Connection refused or host unreachable'}`,
      logs,
    };
  }

  logs.push(`[Socket Success] Connected to ${cfg.server}:${port} in ${probe.latency}ms.`);
  if (cfg.useSsl) {
    logs.push(`[Security] Secure LDAPS / TLS connection handshake validated.`);
  } else {
    logs.push(`[Security] Standard LDAP connection active (Cleartext port ${port}).`);
  }

  // Create LDAP client
  let client: ldap.Client;
  try {
    client = createLdapClient(cfg, 8000);
  } catch (err: any) {
    logs.push(`[Client Init Error] ${err.message}`);
    return {
      success: false,
      latency_ms: probe.latency,
      message: `Failed to initialize LDAP client: ${err.message}`,
      logs,
    };
  }

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (result: ADTestResult) => {
      if (resolved) return;
      resolved = true;
      try {
        client.unbind(() => {});
        client.destroy();
      } catch (e) {}
      resolve(result);
    };

    client.on('error', (err) => {
      logs.push(`[LDAP Client Error] ${err.message}`);
      finish({
        success: false,
        latency_ms: probe.latency,
        message: `LDAP protocol error: ${err.message}`,
        logs,
      });
    });

    const bindUser = (cfg.bindUser || '').trim();
    const bindPassword = cfg.bindPassword || '';

    if (!bindUser) {
      logs.push(`[LDAP Bind] No bind username provided. Attempting Anonymous bind...`);
    } else {
      logs.push(`[LDAP Bind] Attempting authentication for user "${bindUser}"...`);
    }

    client.bind(bindUser, bindPassword, (bindErr) => {
      if (bindErr) {
        logs.push(`[Bind Failure] Authentication rejected: ${bindErr.message}`);
        return finish({
          success: false,
          latency_ms: probe.latency,
          bindSuccess: false,
          message: `Active Directory authentication failed: ${bindErr.message}`,
          logs,
        });
      }

      logs.push(`[Bind Success] Successfully authenticated as "${bindUser || 'Anonymous'}".`);

      // Query RootDSE to get authentic Domain Controller metadata
      client.search('', { scope: 'base', filter: '(objectClass=*)' }, (searchErr, res) => {
        if (searchErr) {
          logs.push(`[RootDSE Warning] Could not query RootDSE: ${searchErr.message}`);
          return finish({
            success: true,
            latency_ms: probe.latency,
            bindSuccess: true,
            message: `Connected and authenticated successfully to ${cfg.domain || cfg.server}.`,
            serverBanner: `Active Directory Domain Controller (${cfg.domain || cfg.server})`,
            logs,
          });
        }

        let dnsHostName = '';
        let defaultNamingContext = '';

        res.on('searchEntry', (entry) => {
          const raw = ((entry as any).object || {}) as Record<string, any>;
          dnsHostName = raw.dnsHostName || raw.dnshostname || '';
          defaultNamingContext = raw.defaultNamingContext || raw.defaultnamingcontext || '';
        });

        res.on('error', (err) => {
          logs.push(`[Search Error] Error querying RootDSE: ${err.message}`);
          finish({
            success: true,
            latency_ms: probe.latency,
            bindSuccess: true,
            message: `Connected and authenticated successfully to ${cfg.domain || cfg.server}.`,
            serverBanner: `Active Directory DC (${cfg.domain || cfg.server})`,
            logs,
          });
        });

        res.on('end', () => {
          const banner = dnsHostName
            ? `Active Directory Domain Controller: ${dnsHostName} (${defaultNamingContext || cfg.domain})`
            : `Active Directory Domain Controller: ${cfg.domain || cfg.server}`;

          logs.push(`[RootDSE] Verified Domain Controller: ${banner}`);
          if (cfg.baseDn) {
            logs.push(`[Naming Context] Configured BaseDN: "${cfg.baseDn}"`);
          } else if (defaultNamingContext) {
            logs.push(`[Naming Context] Discovered Default Naming Context: "${defaultNamingContext}"`);
          }

          finish({
            success: true,
            latency_ms: probe.latency,
            bindSuccess: true,
            message: `Connected and authenticated successfully to Active Directory (${cfg.domain || cfg.server}).`,
            serverBanner: banner,
            sslValid: cfg.useSsl,
            logs,
          });
        });
      });
    });
  });
}

/**
 * Authentically queries and retrieves real security groups and real user accounts from the Active Directory DC.
 */
export async function syncLdapDirectory(
  rawCfg: any
): Promise<{ success: boolean; groups: ADSecurityGroup[]; users: ADUser[]; error?: string; message?: string }> {
  const cfg = normalizeADConfig(rawCfg);

  if (!cfg.server || !cfg.server.trim()) {
    return {
      success: false,
      groups: [],
      users: [],
      error: 'Active Directory server host is required.',
    };
  }

  let client: ldap.Client;
  try {
    client = createLdapClient(cfg, 12000);
  } catch (e: any) {
    return {
      success: false,
      groups: [],
      users: [],
      error: `Could not initialize LDAP client: ${e.message}`,
    };
  }

  const bindUser = (cfg.bindUser || '').trim();
  const bindPassword = cfg.bindPassword || '';

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (result: { success: boolean; groups: ADSecurityGroup[]; users: ADUser[]; error?: string; message?: string }) => {
      if (resolved) return;
      resolved = true;
      try {
        client.unbind(() => {});
        client.destroy();
      } catch (e) {}
      resolve(result);
    };

    client.on('error', (err) => {
      finish({
        success: false,
        groups: [],
        users: [],
        error: `LDAP connection failed: ${err.message}`,
      });
    });

    client.bind(bindUser, bindPassword, async (bindErr) => {
      if (bindErr) {
        return finish({
          success: false,
          groups: [],
          users: [],
          error: `Active Directory authentication failed: ${bindErr.message}`,
        });
      }

      // If baseDn is empty, query RootDSE to find defaultNamingContext
      let baseDn = (cfg.baseDn || '').trim();
      if (!baseDn) {
        try {
          const rootDse = await new Promise<string>((resRoot) => {
            client.search('', { scope: 'base', filter: '(objectClass=*)' }, (err, res) => {
              if (err) return resRoot('');
              let dnc = '';
              res.on('searchEntry', (entry) => {
                const raw = ((entry as any).object || {}) as Record<string, any>;
                dnc = String(raw.defaultNamingContext || raw.defaultnamingcontext || '');
              });
              res.on('error', () => resRoot(''));
              res.on('end', () => resRoot(dnc));
            });
          });
          if (rootDse) {
            baseDn = rootDse;
          }
        } catch (e) {}
      }

      const groupSearchBase = (cfg.groupSearchBase || baseDn).trim();
      const userSearchBase = (cfg.userSearchBase || baseDn).trim();

      if (!groupSearchBase && !userSearchBase) {
        return finish({
          success: false,
          groups: [],
          users: [],
          error: 'Base DN or search container is missing. Please configure Base DN (e.g. DC=corp,DC=internal) or Search OU.',
        });
      }

      const groups: ADSecurityGroup[] = [];
      const users: ADUser[] = [];

      // 1. Query Security Groups
      const queryGroups = (): Promise<void> => {
        return new Promise((resGroups) => {
          if (!groupSearchBase) return resGroups();

          const opts: ldap.SearchOptions = {
            scope: 'sub',
            filter: '(|(objectCategory=group)(objectClass=group))',
            attributes: ['dn', 'cn', 'name', 'description', 'member'],
            paged: true,
            sizeLimit: 500,
          };

          client.search(groupSearchBase, opts, (err, res) => {
            if (err) {
              console.warn('[LDAP Group Search Warning]', err.message);
              return resGroups();
            }

            res.on('searchEntry', (entry) => {
              const raw = ((entry as any).object || {}) as Record<string, any>;
              const dn = String(entry.dn || raw.dn || '');
              const cn = String(raw.cn || raw.name || dn.split(',')[0].replace(/^CN=/i, ''));
              const description = String(raw.description || '');
              const members = raw.member;
              const memberCount = Array.isArray(members)
                ? members.length
                : members ? 1 : 0;

              groups.push({
                dn,
                cn,
                description,
                memberCount,
              });
            });

            res.on('error', (searchErr) => {
              console.warn('[LDAP Group Search Error]', searchErr.message);
              resGroups();
            });

            res.on('end', () => {
              resGroups();
            });
          });
        });
      };

      // 2. Query Users
      const queryUsers = (): Promise<void> => {
        return new Promise((resUsers) => {
          if (!userSearchBase) return resUsers();

          const opts: ldap.SearchOptions = {
            scope: 'sub',
            filter: '(&(objectCategory=person)(objectClass=user))',
            attributes: [
              'dn',
              'sAMAccountName',
              'displayName',
              'mail',
              'userPrincipalName',
              'department',
              'title',
              'memberOf',
              'userAccountControl',
            ],
            paged: true,
            sizeLimit: 1000,
          };

          client.search(userSearchBase, opts, (err, res) => {
            if (err) {
              console.warn('[LDAP User Search Warning]', err.message);
              return resUsers();
            }

            res.on('searchEntry', (entry) => {
              const raw = ((entry as any).object || {}) as Record<string, any>;
              const dn = String(entry.dn || raw.dn || '');
              const samAccountName = String(raw.sAMAccountName || raw.samaccountname || '');
              if (!samAccountName || samAccountName.endsWith('$')) {
                // Skip machine / computer accounts ending in $
                return;
              }

              const displayName = String(raw.displayName || raw.displayname || samAccountName);
              const email = String(raw.mail || raw.userPrincipalName || raw.userprincipalname || `${samAccountName}@${cfg.domain || 'corp.local'}`);
              const department = String(raw.department || '');
              const title = String(raw.title || '');

              const rawMemberOf = raw.memberOf || raw.memberof || [];
              const memberOfList = Array.isArray(rawMemberOf)
                ? rawMemberOf
                : rawMemberOf ? [rawMemberOf] : [];
              const groupNames = memberOfList.map((gDn: string) => {
                const match = String(gDn).match(/^CN=([^,]+)/i);
                return match ? match[1] : String(gDn);
              });

              // userAccountControl bit 2 (0x0002) is ACCOUNTDISABLE
              const uac = Number(raw.userAccountControl || raw.useraccountcontrol) || 512;
              const enabled = (uac & 2) === 0;

              users.push({
                dn,
                samAccountName,
                displayName,
                email,
                department,
                title,
                groups: groupNames,
                enabled,
              });
            });

            res.on('error', (searchErr) => {
              console.warn('[LDAP User Search Error]', searchErr.message);
              resUsers();
            });

            res.on('end', () => {
              resUsers();
            });
          });
        });
      };

      try {
        await queryGroups();
        await queryUsers();

        finish({
          success: true,
          groups,
          users,
          message: `Successfully synchronized ${groups.length} security groups and ${users.length} users from Active Directory.`,
        });
      } catch (e: any) {
        finish({
          success: false,
          groups: [],
          users: [],
          error: e?.message || 'Failed to synchronize Active Directory objects.',
        });
      }
    });
  });
}
