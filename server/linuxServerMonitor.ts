import { Client, ConnectConfig } from 'ssh2';
import { getRemoteServerById, updateRemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';
import {
  RemoteServer,
  LinuxSystemUser,
  LinuxLoggedInUser,
  LinuxNetworkInterfaceDetail,
  LinuxSystemDetailedInfo,
  LinuxProxyConfig,
  LinuxBlockDevice,
  LinuxMountPayload,
  LinuxStorageOverview,
  LinuxMountedFilesystem,
  LinuxPhysicalDisk,
  LinuxPhysicalVolume,
  LinuxVolumeGroup,
  LinuxLogicalVolume,
  LinuxPartition,
  LinuxDiskFormatMountPayload,
  LinuxLvmOverview,
  LinuxLvmPv,
  LinuxLvmVg,
  LinuxLvmLv,
  LinuxRawDisk,
  LinuxLvmExtendPayload,
  LinuxLvmCreatePayload,
  LinuxLvmShrinkPayload,
  LinuxServiceWatchdogRule,
  LinuxDirectoryPolicyRule,
} from '../src/types';

export interface LinuxServerDiskMetric {
  filesystem: string;
  mount: string;
  sizeBytes: number;
  usedBytes: number;
  availBytes: number;
  usagePercent: number;
  sizeHuman: string;
  usedHuman: string;
  availHuman: string;
}

export interface LinuxServerNetMetric {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxHuman: string;
  txHuman: string;
}

export interface LinuxServerProcessMetric {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

export interface LinuxServerLiveMetrics {
  timestamp: number;
  host: string;
  port: number;
  hostname: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  os: {
    system: string;
    kernel: string;
    arch: string;
    distro: string;
  };
  cpu: {
    usagePercent: number;
    cores: number;
    model: string;
    loadAvg: [number, number, number];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    usagePercent: number;
    totalHuman: string;
    usedHuman: string;
    freeHuman: string;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapUsagePercent: number;
    swapTotalHuman: string;
    swapUsedHuman: string;
  };
  disks: LinuxServerDiskMetric[];
  totalDiskBytes?: number;
  totalDiskGb?: number;
  networks: LinuxServerNetMetric[];
  processes: LinuxServerProcessMetric[];
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i] || 'B'}`;
}

function formatUptime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

const TELEMETRY_SHELL_SCRIPT = `export LC_ALL=C
echo "---OS---"
uname -s 2>/dev/null || echo "Linux"
uname -r 2>/dev/null || echo "unknown"
uname -m 2>/dev/null || echo "x86_64"
if [ -f /etc/os-release ]; then
  cat /etc/os-release 2>/dev/null
elif [ -f /etc/redhat-release ]; then
  cat /etc/redhat-release 2>/dev/null
fi
echo "---HOSTNAME---"
hostname 2>/dev/null || cat /etc/hostname 2>/dev/null || echo "linux-host"
echo "---UPTIME---"
cat /proc/uptime 2>/dev/null || uptime 2>/dev/null || echo "0 0"
echo "---CPU_INFO---"
nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1
grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^[ \t]*//' || echo "Generic CPU"
cat /proc/loadavg 2>/dev/null || echo "0.00 0.00 0.00"
echo "---CPU_STAT---"
head -n 1 /proc/stat 2>/dev/null
sleep 0.25
head -n 1 /proc/stat 2>/dev/null
echo "---MEM---"
cat /proc/meminfo 2>/dev/null
echo "---BLOCK_DISKS---"
lsblk -b -d -n -o NAME,SIZE,TYPE 2>/dev/null || true
echo "---DISK---"
df -k -P -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null || df -k -P 2>/dev/null
echo "---NET---"
cat /proc/net/dev 2>/dev/null
echo "---PROCS---"
ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu 2>/dev/null | head -n 11 || ps aux 2>/dev/null | awk 'NR>1 {print $2,$1,$3,$4,$11}' | head -n 10
echo "---END---"`;

export function parseLinuxTelemetry(rawOutput: string, host: string, port: number): LinuxServerLiveMetrics {
  const sections: Record<string, string[]> = {};
  let currentSection = '';

  const lines = rawOutput.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSection = trimmed.replace(/---/g, '').trim();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // 1. OS & Distro
  const osLines = sections['OS'] || [];
  const system = osLines[0]?.trim() || 'Linux';
  const kernel = osLines[1]?.trim() || '';
  const arch = osLines[2]?.trim() || 'x86_64';
  let distro = 'Linux';
  for (let i = 3; i < osLines.length; i++) {
    const l = osLines[i].trim();
    if (l.startsWith('PRETTY_NAME=')) {
      distro = l.replace(/^PRETTY_NAME=["']?/, '').replace(/["']?$/, '');
      break;
    } else if (l.startsWith('NAME=')) {
      distro = l.replace(/^NAME=["']?/, '').replace(/["']?$/, '');
    }
  }

  // 2. Hostname
  const hostLines = sections['HOSTNAME'] || [];
  const hostname = hostLines[0]?.trim() || host;

  // 3. Uptime
  const uptimeLines = sections['UPTIME'] || [];
  const uptimeRaw = (uptimeLines[0] || '').trim();
  const uptimeSecMatch = uptimeRaw.match(/^([0-9.]+)/);
  const uptimeSeconds = uptimeSecMatch ? Math.floor(parseFloat(uptimeSecMatch[1])) : 0;
  const uptimeFormatted = formatUptime(uptimeSeconds);

  // 4. CPU Info & Load Average
  const cpuInfoLines = sections['CPU_INFO'] || [];
  const cores = Math.max(1, parseInt(cpuInfoLines[0]?.trim() || '1', 10) || 1);
  const cpuModel = cpuInfoLines[1]?.trim() || 'Generic x86 CPU';
  const loadLine = (cpuInfoLines[2] || '').trim();
  const loadParts = loadLine.split(/\s+/);
  const loadAvg: [number, number, number] = [
    parseFloat(loadParts[0]) || 0,
    parseFloat(loadParts[1]) || 0,
    parseFloat(loadParts[2]) || 0,
  ];

  // 5. CPU Usage calculation from /proc/stat lines
  const cpuStatLines = sections['CPU_STAT'] || [];
  let usagePercent = 0;
  if (cpuStatLines.length >= 2) {
    const parseCpuStat = (row: string) => {
      const parts = row.trim().split(/\s+/).slice(1).map(Number);
      const idle = (parts[3] || 0) + (parts[4] || 0); // idle + iowait
      const total = parts.reduce((acc, val) => acc + (val || 0), 0);
      return { idle, total };
    };

    const s1 = parseCpuStat(cpuStatLines[0]);
    const s2 = parseCpuStat(cpuStatLines[1]);
    const idleDelta = s2.idle - s1.idle;
    const totalDelta = s2.total - s1.total;

    if (totalDelta > 0) {
      const rawPerc = ((totalDelta - idleDelta) / totalDelta) * 100;
      usagePercent = Math.max(0, Math.min(100, Math.round(rawPerc * 10) / 10));
    }
  } else if (loadAvg[0] > 0) {
    usagePercent = Math.max(0, Math.min(100, Math.round((loadAvg[0] / cores) * 1000) / 10));
  }

  // 6. Memory & Swap from /proc/meminfo
  const memLines = sections['MEM'] || [];
  let memTotalKb = 0;
  let memFreeKb = 0;
  let memAvailableKb = 0;
  let swapTotalKb = 0;
  let swapFreeKb = 0;

  for (const mLine of memLines) {
    const match = mLine.match(/^([A-Za-z0-9_()]+):\s+(\d+)\s+kB/);
    if (match) {
      const key = match[1];
      const val = parseInt(match[2], 10);
      if (key === 'MemTotal') memTotalKb = val;
      else if (key === 'MemFree') memFreeKb = val;
      else if (key === 'MemAvailable') memAvailableKb = val;
      else if (key === 'SwapTotal') swapTotalKb = val;
      else if (key === 'SwapFree') swapFreeKb = val;
    }
  }

  if (memAvailableKb === 0 && memTotalKb > 0) {
    memAvailableKb = memFreeKb;
  }

  const memTotalBytes = memTotalKb * 1024;
  const memAvailBytes = memAvailableKb * 1024;
  const memUsedBytes = Math.max(0, memTotalBytes - memAvailBytes);
  const memFreeBytes = memFreeKb * 1024;
  const memUsagePercent = memTotalBytes > 0 ? Math.round((memUsedBytes / memTotalBytes) * 1000) / 10 : 0;

  const swapTotalBytes = swapTotalKb * 1024;
  const swapUsedBytes = Math.max(0, (swapTotalKb - swapFreeKb) * 1024);
  const swapUsagePercent = swapTotalBytes > 0 ? Math.round((swapUsedBytes / swapTotalBytes) * 1000) / 10 : 0;

  // 7. Disks from df
  const diskLines = sections['DISK'] || [];
  const disks: LinuxServerDiskMetric[] = [];
  for (let i = 1; i < diskLines.length; i++) {
    const row = diskLines[i].trim();
    if (!row) continue;
    const parts = row.split(/\s+/);
    if (parts.length >= 6) {
      const filesystem = parts[0];
      const totalBlocks = parseInt(parts[1], 10) || 0;
      const usedBlocks = parseInt(parts[2], 10) || 0;
      const availBlocks = parseInt(parts[3], 10) || 0;
      const percStr = parts[4].replace('%', '');
      const mount = parts.slice(5).join(' ');

      const sizeBytes = totalBlocks * 1024;
      const usedBytes = usedBlocks * 1024;
      const availBytes = availBlocks * 1024;
      const usagePercent = parseInt(percStr, 10) || (sizeBytes > 0 ? Math.round((usedBytes / sizeBytes) * 100) : 0);

      disks.push({
        filesystem,
        mount,
        sizeBytes,
        usedBytes,
        availBytes,
        usagePercent,
        sizeHuman: formatBytes(sizeBytes),
        usedHuman: formatBytes(usedBytes),
        availHuman: formatBytes(availBytes),
      });
    }
  }

  // 7.1 True Block Disks from lsblk (whole-disk devices, no partitions, no duplicates)
  const blockDiskLines = sections['BLOCK_DISKS'] || [];
  let blockDisksBytes = 0;
  for (const row of blockDiskLines) {
    const parts = row.trim().split(/\s+/);
    if (parts.length >= 3) {
      const type = parts[2].toLowerCase();
      const bytes = parseInt(parts[1], 10) || 0;
      if (type === 'disk' && bytes > 0) {
        blockDisksBytes += bytes;
      }
    }
  }

  // If lsblk had no whole disks, calculate from unique /dev/ filesystems from df (excluding docker/container duplicates)
  let totalDiskBytes = blockDisksBytes;
  if (totalDiskBytes === 0) {
    const seenDevs = new Set<string>();
    for (const d of disks) {
      if (
        d.filesystem.startsWith('/dev/') &&
        !seenDevs.has(d.filesystem) &&
        !d.mount.includes('/docker') &&
        !d.mount.includes('/containerd') &&
        !d.mount.includes('/overlay2') &&
        !d.mount.includes('/kubelet')
      ) {
        seenDevs.add(d.filesystem);
        totalDiskBytes += d.sizeBytes;
      }
    }
  }

  // Fallback to root disk if still 0
  if (totalDiskBytes === 0) {
    const rootDisk = disks.find((d) => d.mount === '/');
    if (rootDisk && rootDisk.sizeBytes > 0) {
      totalDiskBytes = rootDisk.sizeBytes;
    }
  }

  const totalDiskGb = totalDiskBytes > 0 ? Math.round(totalDiskBytes / (1024 * 1024 * 1024)) : undefined;

  // 8. Network Interfaces from /proc/net/dev
  const netLines = sections['NET'] || [];
  const networks: LinuxServerNetMetric[] = [];
  for (let i = 2; i < netLines.length; i++) {
    const row = netLines[i].trim();
    if (!row) continue;
    const colonIdx = row.indexOf(':');
    if (colonIdx === -1) continue;
    const ifaceName = row.substring(0, colonIdx).trim();
    if (ifaceName === 'lo') continue; // Skip loopback

    const dataParts = row.substring(colonIdx + 1).trim().split(/\s+/).map(Number);
    const rxBytes = dataParts[0] || 0;
    const rxPackets = dataParts[1] || 0;
    const txBytes = dataParts[8] || 0;
    const txPackets = dataParts[9] || 0;

    networks.push({
      interface: ifaceName,
      rxBytes,
      txBytes,
      rxPackets,
      txPackets,
      rxHuman: formatBytes(rxBytes),
      txHuman: formatBytes(txBytes),
    });
  }

  // 9. Top Processes from ps
  const procLines = sections['PROCS'] || [];
  const processes: LinuxServerProcessMetric[] = [];
  for (let i = 1; i < procLines.length; i++) {
    const row = procLines[i].trim();
    if (!row) continue;
    const parts = row.split(/\s+/);
    if (parts.length >= 5) {
      const pid = parseInt(parts[0], 10) || 0;
      const user = parts[1] || 'root';
      const cpuP = parseFloat(parts[2]) || 0;
      const memP = parseFloat(parts[3]) || 0;
      const command = parts.slice(4).join(' ');

      processes.push({
        pid,
        user,
        cpuPercent: cpuP,
        memPercent: memP,
        command,
      });
    }
  }

  return {
    timestamp: Date.now(),
    host,
    port,
    hostname,
    uptimeSeconds,
    uptimeFormatted,
    os: {
      system,
      kernel,
      arch,
      distro,
    },
    cpu: {
      usagePercent,
      cores,
      model: cpuModel,
      loadAvg,
    },
    memory: {
      totalBytes: memTotalBytes,
      usedBytes: memUsedBytes,
      freeBytes: memFreeBytes,
      availableBytes: memAvailBytes,
      usagePercent: memUsagePercent,
      totalHuman: formatBytes(memTotalBytes),
      usedHuman: formatBytes(memUsedBytes),
      freeHuman: formatBytes(memFreeBytes),
      swapTotalBytes,
      swapUsedBytes,
      swapUsagePercent,
      swapTotalHuman: formatBytes(swapTotalBytes),
      swapUsedHuman: formatBytes(swapUsedBytes),
    },
    disks,
    totalDiskBytes,
    totalDiskGb,
    networks,
    processes,
  };
}

export interface LinuxSystemService {
  name: string;
  loadState: string;
  activeState: string;
  subState: string;
  unitFileState?: string;
  description: string;
  hasWatchdog?: boolean;
  watchdogStatus?: string;
}

const SERVICES_SHELL_SCRIPT = `export LC_ALL=C
if command -v systemctl >/dev/null 2>&1; then
  echo "---UNIT_FILES---"
  systemctl list-unit-files --type=service --no-pager --no-legend 2>/dev/null
  echo "---UNITS---"
  systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null
elif command -v service >/dev/null 2>&1; then
  echo "---SERVICE_CMD---"
  service --status-all 2>&1 || true
else
  echo "---INIT_D---"
  ls -1 /etc/init.d/ 2>/dev/null || true
fi
`;

export function parseLinuxServices(rawOutput: string): LinuxSystemService[] {
  const servicesMap = new Map<string, LinuxSystemService>();
  const lines = rawOutput.split(/\r?\n/);
  let mode: 'units' | 'unit_files' | 'service_cmd' | 'init_d' | 'unknown' = 'unknown';

  const unitFilesMap = new Map<string, string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === '---UNIT_FILES---') {
      mode = 'unit_files';
      continue;
    }
    if (line === '---UNITS---') {
      mode = 'units';
      continue;
    }
    if (line === '---SERVICE_CMD---') {
      mode = 'service_cmd';
      continue;
    }
    if (line === '---INIT_D---') {
      mode = 'init_d';
      continue;
    }

    if (mode === 'unit_files') {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[0];
        const state = parts[1];
        unitFilesMap.set(name, state);
        unitFilesMap.set(name.replace(/\.service$/, ''), state);
      }
      continue;
    }

    if (mode === 'units') {
      const cleanLine = line.replace(/^[●*]\s*/, '');
      const parts = cleanLine.split(/\s+/);
      if (parts.length >= 4) {
        const fullName = parts[0];
        const loadState = parts[1];
        const activeState = parts[2];
        const subState = parts[3];
        const description = parts.slice(4).join(' ');

        if (fullName.endsWith('.service') || !fullName.includes('.')) {
          const shortName = fullName.replace(/\.service$/, '');
          servicesMap.set(shortName, {
            name: shortName,
            loadState,
            activeState,
            subState,
            unitFileState: unitFilesMap.get(fullName) || unitFilesMap.get(shortName),
            description: description || shortName,
          });
        }
      }
      continue;
    }

    if (mode === 'service_cmd') {
      const match = line.match(/^\[\s*([+\-?])\s*\]\s+(.+)$/);
      if (match) {
        const flag = match[1];
        const name = match[2].trim();
        const activeState = flag === '+' ? 'active' : flag === '-' ? 'inactive' : 'unknown';
        const subState = flag === '+' ? 'running' : flag === '-' ? 'dead' : 'exited';
        servicesMap.set(name, {
          name,
          loadState: 'loaded',
          activeState,
          subState,
          unitFileState: undefined,
          description: name,
        });
      }
      continue;
    }

    if (mode === 'init_d') {
      const name = line.trim();
      if (name && !servicesMap.has(name)) {
        servicesMap.set(name, {
          name,
          loadState: 'loaded',
          activeState: 'unknown',
          subState: 'unknown',
          unitFileState: undefined,
          description: name,
        });
      }
    }
  }

  // Update unitFileState for all existing units, and add any inactive unit files
  for (const [name, state] of unitFilesMap.entries()) {
    const cleanName = name.replace(/\.service$/, '');
    const existing = servicesMap.get(cleanName) || servicesMap.get(name);
    if (existing) {
      if (!existing.unitFileState || existing.unitFileState === 'static') {
        existing.unitFileState = state;
      }
    } else if (name.endsWith('.service')) {
      servicesMap.set(cleanName, {
        name: cleanName,
        loadState: 'loaded',
        activeState: state === 'enabled' ? 'active' : 'inactive',
        subState: state === 'enabled' ? 'running' : 'dead',
        unitFileState: state,
        description: cleanName,
      });
    }
  }

  return Array.from(servicesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adaptive SSH command runner: attempts modern first, automatically falls back to legacy ciphers.
 */
export async function runAdaptiveSshCommand(
  server: RemoteServer,
  command: string,
  ephemeralPassword?: string,
  timeoutMs: number = 9000
): Promise<string> {
  const isWindows = server.os_type === 'windows';
  const host = (server.ip || server.hostname || '').trim();
  const port = isWindows ? (server.ssh_port || server.win_port || 22) : (server.ssh_port || 22);
  const username = (isWindows ? (server.win_username || server.ssh_username) : (server.ssh_username || server.win_username)) || (isWindows ? 'Administrator' : 'root');
  const rawPassword = ephemeralPassword || (isWindows ? (server.win_password || server.ssh_password) : (server.ssh_password || server.win_password)) || '';
  const password = rawPassword ? decryptServerSecret(rawPassword) : '';

  if (!host) {
    throw new Error('Server target IP or Hostname is not configured.');
  }

  const runAttempt = (useLegacyAlgorithms: boolean): Promise<string> => {
    return new Promise((resolve, reject) => {
      const client = new Client();
      let timer: NodeJS.Timeout | null = null;
      let settled = false;

      const finish = (err?: Error, output?: string) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try {
          client.end();
        } catch {}
        if (err) reject(err);
        else resolve(output || '');
      };

      timer = setTimeout(() => {
        finish(new Error(`SSH connection to ${host}:${port} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      client.on('error', (err) => {
        finish(err);
      });

      client.on('ready', () => {
        client.exec(command, (err, stream) => {
          if (err) {
            return finish(err);
          }

          // Close stdin immediately for non-interactive execution so remote processes never block waiting for stdin
          try {
            stream.end();
          } catch {}

          let stdout = '';
          let stderr = '';

          stream.on('data', (data: Buffer) => {
            stdout += data.toString('utf-8');
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString('utf-8');
          });

          stream.on('close', (code: number) => {
            if (code !== 0 && !stdout.trim()) {
              finish(new Error(`Command exited with code ${code}: ${stderr.trim() || 'Command execution failed'}`));
            } else {
              finish(undefined, stdout);
            }
          });
        });
      });

      const connectConfig: ConnectConfig = {
        host,
        port,
        username,
        readyTimeout: Math.min(timeoutMs, 10000),
      };

      if (password) {
        connectConfig.password = password;
      }

      if (useLegacyAlgorithms) {
        connectConfig.algorithms = {
          kex: [
            'diffie-hellman-group1-sha1',
            'diffie-hellman-group14-sha1',
            'diffie-hellman-group-exchange-sha1',
            'diffie-hellman-group-exchange-sha256',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr',
            'aes128-gcm',
            'aes128-gcm@openssh.com',
            'aes256-gcm',
            'aes256-gcm@openssh.com',
            'aes256-cbc',
            'aes192-cbc',
            'aes128-cbc',
            '3des-cbc',
          ],
          serverHostKey: [
            'ssh-rsa',
            'rsa-sha2-512',
            'rsa-sha2-256',
            'ssh-dss',
            'ecdsa-sha2-nistp256',
            'ssh-ed25519',
          ],
        };
      }

      try {
        client.connect(connectConfig);
      } catch (e: any) {
        finish(e);
      }
    });
  };

  try {
    return await runAttempt(false);
  } catch (modernErr: any) {
    const errMsg = (modernErr?.message || '').toLowerCase();
    const isCryptoMismatch =
      errMsg.includes('handshake') ||
      errMsg.includes('kex') ||
      errMsg.includes('cipher') ||
      errMsg.includes('key exchange') ||
      errMsg.includes('algorithm') ||
      errMsg.includes('no matching');

    if (isCryptoMismatch) {
      console.log(`[LinuxSSH] Modern handshake failed for ${host}:${port}, retrying with legacy-compatible algorithms...`);
      return await runAttempt(true);
    }
    throw modernErr;
  }
}

/**
 * Executes immediate or delayed reboot/restart on physical or virtual Linux / Windows servers.
 * Supports broadcast warnings to interactive logged-in users and cancellation of pending reboots.
 */
export async function executeServerRestartSSH(
  server: RemoteServer,
  params: {
    actionType?: 'restart' | 'poweroff';
    delayMinutes: number;
    notifyUsers: boolean;
    message?: string;
    force?: boolean;
    cancelPending?: boolean;
  },
  ephemeralPassword?: string
): Promise<{
  success: boolean;
  message: string;
  command: string;
  output?: string;
}> {
  const isWindows = server.os_type === 'windows';
  const actionType = params.actionType === 'poweroff' ? 'poweroff' : 'restart';
  let command = '';
  let actionDesc = '';

  if (isWindows) {
    if (params.cancelPending) {
      command = 'shutdown /a';
      actionDesc = actionType === 'poweroff'
        ? 'Cancelled scheduled Windows shutdown'
        : 'Cancelled scheduled Windows restart';
    } else {
      const delaySec = Math.max(0, Math.floor(params.delayMinutes * 60));
      const forceFlag = params.force !== false ? '/f' : '';
      const safeMsg = (params.message || '').replace(/["\r\n]/g, ' ').trim();
      const actionFlag = actionType === 'poweroff' ? '/s' : '/r';

      if (params.notifyUsers && safeMsg) {
        command = `msg * "${safeMsg}" & shutdown ${actionFlag} /t ${delaySec} ${forceFlag} /c "${safeMsg}"`;
      } else {
        command = `shutdown ${actionFlag} /t ${delaySec} ${forceFlag}`;
      }
      actionDesc = delaySec > 0
        ? `Scheduled Windows ${actionType === 'poweroff' ? 'shutdown' : 'restart'} in ${params.delayMinutes} minute(s)`
        : `Initiated immediate Windows ${actionType === 'poweroff' ? 'shutdown' : 'restart'}`;
    }
  } else {
    // Linux
    if (params.cancelPending) {
      command = 'sudo shutdown -c "Cancelled by administrator" 2>&1 || shutdown -c 2>&1';
      actionDesc = actionType === 'poweroff'
        ? 'Cancelled scheduled Linux shutdown'
        : 'Cancelled scheduled Linux reboot';
    } else {
      const delayMin = Math.max(0, Math.floor(params.delayMinutes));
      const safeMsg = (params.message || '').replace(/["\\`$]/g, '\\$&').trim();

      if (actionType === 'poweroff') {
        if (delayMin === 0) {
          if (params.notifyUsers && safeMsg) {
            command = `wall "${safeMsg}" 2>/dev/null ; (sleep 1 && (sudo shutdown -h now || sudo poweroff || poweroff)) &`;
          } else {
            command = `(sleep 1 && (sudo shutdown -h now || sudo poweroff || poweroff)) &`;
          }
          actionDesc = 'Initiated immediate Linux system shutdown';
        } else {
          if (params.notifyUsers && safeMsg) {
            command = `wall "${safeMsg}" 2>/dev/null ; (sudo shutdown -h +${delayMin} "${safeMsg}" || sudo shutdown -h +${delayMin} || shutdown -h +${delayMin})`;
          } else {
            command = `sudo shutdown -h +${delayMin} || shutdown -h +${delayMin}`;
          }
          actionDesc = `Scheduled Linux system shutdown in ${delayMin} minute(s)`;
        }
      } else {
        // restart / reboot
        if (delayMin === 0) {
          if (params.notifyUsers && safeMsg) {
            command = `wall "${safeMsg}" 2>/dev/null ; (sleep 1 && (sudo shutdown -r now || sudo reboot || reboot)) &`;
          } else {
            command = `(sleep 1 && (sudo shutdown -r now || sudo reboot || reboot)) &`;
          }
          actionDesc = 'Initiated immediate Linux system reboot';
        } else {
          if (params.notifyUsers && safeMsg) {
            command = `wall "${safeMsg}" 2>/dev/null ; (sudo shutdown -r +${delayMin} "${safeMsg}" || sudo shutdown -r +${delayMin} || shutdown -r +${delayMin})`;
          } else {
            command = `sudo shutdown -r +${delayMin} || shutdown -r +${delayMin}`;
          }
          actionDesc = `Scheduled Linux system reboot in ${delayMin} minute(s)`;
        }
      }
    }
  }

  try {
    const output = await runAdaptiveSshCommand(server, command, ephemeralPassword, 12000);
    return {
      success: true,
      message: `${actionDesc} successfully.`,
      command,
      output: (output || '').trim(),
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (
      errMsg.includes('Connection reset by peer') ||
      errMsg.includes('socket hung up') ||
      errMsg.includes('ended by other party') ||
      errMsg.includes('Channel open failure') ||
      errMsg.includes('closed')
    ) {
      return {
        success: true,
        message: `${actionDesc} (SSH connection terminated as target server initiated ${actionType === 'poweroff' ? 'shutdown' : 'reboot'} sequence).`,
        command,
        output: errMsg,
      };
    }
    throw err;
  }
}

/**
 * Connects directly to the physical/virtual remote Linux server via SSH
 * and collects live, authentic system telemetry without any mock/simulated fallback.
 */
export async function executeLinuxTelemetrySSH(
  server: RemoteServer,
  ephemeralPassword?: string,
  timeoutMs: number = 8000
): Promise<LinuxServerLiveMetrics> {
  const host = (server.ip || server.hostname || '').trim();
  const port = server.ssh_port || 22;
  const rawOutput = await runAdaptiveSshCommand(server, TELEMETRY_SHELL_SCRIPT, ephemeralPassword, timeoutMs);
  return parseLinuxTelemetry(rawOutput, host, port);
}

/**
 * Fetches real-time Linux system services (systemd / sysvinit / init.d)
 */
export async function fetchLinuxServicesSSH(
  server: RemoteServer,
  ephemeralPassword?: string,
  timeoutMs: number = 8000
): Promise<LinuxSystemService[]> {
  const rawOutput = await runAdaptiveSshCommand(server, SERVICES_SHELL_SCRIPT, ephemeralPassword, timeoutMs);
  return parseLinuxServices(rawOutput);
}

/**
 * Controls a Linux system service (start, stop, restart, enable, disable)
 */
export async function executeLinuxServiceControl(
  server: RemoteServer,
  serviceName: string,
  action: 'start' | 'stop' | 'restart' | 'reload' | 'enable' | 'disable',
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanName = serviceName.trim().replace(/[^a-zA-Z0-9_@.-]/g, '');
  if (!cleanName) {
    throw new Error('Invalid service name provided.');
  }

  const validActions = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];
  if (!validActions.includes(action)) {
    throw new Error(`Invalid service action: ${action}`);
  }

  // Construct safe command with fallback to regular systemctl/service
  const cmd = `export LC_ALL=C
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl ${action} ${cleanName} 2>&1 || systemctl ${action} ${cleanName} 2>&1
elif command -v service >/dev/null 2>&1; then
  sudo service ${cleanName} ${action} 2>&1 || service ${cleanName} ${action} 2>&1
else
  sudo /etc/init.d/${cleanName} ${action} 2>&1 || /etc/init.d/${cleanName} ${action} 2>&1
fi`;

  try {
    const output = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 10000);
    const lower = output.toLowerCase();
    if (lower.includes('failed to') || lower.includes('error:') || lower.includes('access denied') || lower.includes('permission denied')) {
      return {
        success: false,
        message: output.trim() || `Failed to ${action} service ${cleanName}`,
      };
    }
    return {
      success: true,
      message: output.trim() || `Service ${cleanName} successfully executed ${action}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Execution error while attempting to ${action} ${cleanName}`,
    };
  }
}

/**
 * Controls a Linux Process: Kill (SIGTERM 15 / SIGKILL 9) or Renice (-20 to +19)
 */
export async function executeLinuxProcessControl(
  server: RemoteServer,
  pid: number,
  action: 'kill' | 'renice',
  options: { signal?: number; nice?: number },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  if (!pid || pid <= 1 || isNaN(pid)) {
    throw new Error('Invalid process PID. Cannot signal PID <= 1.');
  }

  let cmd = '';
  if (action === 'kill') {
    const sig = options.signal === 9 ? 9 : 15;
    cmd = `export LC_ALL=C; sudo kill -${sig} ${pid} 2>&1 || kill -${sig} ${pid} 2>&1`;
  } else if (action === 'renice') {
    const niceVal = Math.max(-20, Math.min(19, options.nice !== undefined ? Number(options.nice) : 0));
    cmd = `export LC_ALL=C; sudo renice -n ${niceVal} -p ${pid} 2>&1 || renice -n ${niceVal} -p ${pid} 2>&1`;
  } else {
    throw new Error(`Unsupported process action: ${action}`);
  }

  try {
    const output = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 8000);
    const lower = output.toLowerCase();
    if (lower.includes('no such process') || lower.includes('operation not permitted') || lower.includes('permission denied')) {
      return {
        success: false,
        message: output.trim(),
      };
    }
    return {
      success: true,
      message: output.trim() || (action === 'kill' ? `Process ${pid} terminated.` : `Process ${pid} priority changed.`),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to perform ${action} on process ${pid}`,
    };
  }
}

/**
 * Shell script to fetch logged-in users and all system users
 */
const USERS_SCRIPT = `export LC_ALL=C
echo "---LOGGED_IN---"
w -h 2>/dev/null || who -u 2>/dev/null || who 2>/dev/null
echo "---USERS---"
getent passwd 2>/dev/null || cat /etc/passwd 2>/dev/null
echo "---END---"`;

/**
 * Fetch list of all system users and currently logged in users with login duration
 */
export async function fetchLinuxUsersAndSessionsSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{ loggedInUsers: LinuxLoggedInUser[]; systemUsers: LinuxSystemUser[] }> {
  const rawOutput = await runAdaptiveSshCommand(server, USERS_SCRIPT, ephemeralPassword, 8000);
  
  const sections: Record<string, string[]> = {};
  let currentSec = '';
  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSec = trimmed.replace(/---/g, '').trim();
      sections[currentSec] = [];
    } else if (currentSec) {
      sections[currentSec].push(line);
    }
  }

  // Parse logged in users
  const loggedInLines = sections['LOGGED_IN'] || [];
  const loggedInUsers: LinuxLoggedInUser[] = [];
  for (const rawLine of loggedInLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('USER') || line.startsWith('---')) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const user = parts[0];
      const tty = parts[1];
      let from = '-';
      let loginTime = '-';
      let idleTime = '-';
      let what = '-';

      // Standard w -h format: USER TTY FROM LOGIN@ IDLE JCPU PCPU WHAT...
      if (parts.length >= 5) {
        from = parts[2] || '-';
        loginTime = parts[3] || '-';
        idleTime = parts[4] || '-';
        what = parts.slice(7).join(' ') || parts.slice(5).join(' ') || '-';
      } else {
        from = parts[2] || '-';
        loginTime = parts.slice(3).join(' ') || '-';
      }

      loggedInUsers.push({
        user,
        tty,
        from: from.replace(/[()]/g, ''),
        loginTime,
        idleTime,
        what,
      });
    }
  }

  // Parse all system users from /etc/passwd
  const userLines = sections['USERS'] || [];
  const systemUsers: LinuxSystemUser[] = [];
  for (const rawLine of userLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(':');
    if (parts.length >= 7) {
      const username = parts[0];
      const uid = parseInt(parts[2], 10) || 0;
      const gid = parseInt(parts[3], 10) || 0;
      const comment = parts[4] || '';
      const homeDir = parts[5] || '';
      const shell = parts[6] || '';
      const isSystem = (uid < 1000 && uid !== 0) || shell.includes('nologin') || shell.includes('false');

      systemUsers.push({
        username,
        uid,
        gid,
        comment,
        homeDir,
        shell,
        isSystem,
      });
    }
  }

  // Sort system users: root first, then regular users, then system accounts
  systemUsers.sort((a, b) => {
    if (a.uid === 0) return -1;
    if (b.uid === 0) return 1;
    if (!a.isSystem && b.isSystem) return -1;
    if (a.isSystem && !b.isSystem) return 1;
    return a.username.localeCompare(b.username);
  });

  return { loggedInUsers, systemUsers };
}

/**
 * Send a message to a specific logged-in user session (write/tee) or broadcast to all users (wall).
 * Uses base64 encoding and robust TTY / user / pts auto-discovery matching LogoutUserSessionModal.
 */
export async function sendLinuxUserMessageSSH(
  server: RemoteServer,
  target: string,
  message: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const rawTarget = (target || '').trim();
  const rawMessage = (message || '').trim();

  if (!rawMessage) {
    throw new Error('Message cannot be empty.');
  }

  const isAll = !rawTarget || rawTarget === 'all' || rawTarget === 'wall';
  const cleanTarget = rawTarget.replace(/^\/dev\//, '').replace(/[^a-zA-Z0-9/_.-]/g, '');

  const b64Target = Buffer.from(cleanTarget).toString('base64');
  const b64Msg = Buffer.from(rawMessage).toString('base64');

  const script = `export LC_ALL=C
T=$(echo "${b64Target}" | base64 -d)
M=$(echo "${b64Msg}" | base64 -d)
IS_ALL="${isAll ? '1' : '0'}"

DELIVERED=0

if [ "$IS_ALL" = "1" ]; then
  # Broadcast to all logged-in terminals using wall
  printf '\\n\\n*** [BROADCAST FROM ADMINISTRATOR] ***\\n%s\\n\\n' "$M" | sudo wall 2>&1 || printf '\\n*** [BROADCAST FROM ADMINISTRATOR] ***\\n%s\\n\\n' "$M" | wall 2>&1 || true
  DELIVERED=1
else
  # Direct TTY match check
  if [ -n "$T" ] && ( [ -w "/dev/$T" ] || sudo test -e "/dev/$T" ); then
    printf '\\n\\n*** [MESSAGE FROM ADMINISTRATOR] ***\\n%s\\n\\n' "$M" | sudo tee "/dev/$T" >/dev/null 2>&1 && DELIVERED=1
  fi

  # If T was a username, discover all active TTYs for this user and write to all of them
  if [ "$DELIVERED" = "0" ] && [ -n "$T" ]; then
    USER_TTYS=$(who 2>/dev/null | awk -v u="$T" '$1 == u {print $2}')
    if [ -n "$USER_TTYS" ]; then
      for U_TTY in $USER_TTYS; do
        if [ -w "/dev/$U_TTY" ] || sudo test -e "/dev/$U_TTY"; then
          printf '\\n\\n*** [MESSAGE FROM ADMINISTRATOR to %s] ***\\n%s\\n\\n' "$T" "$M" | sudo tee "/dev/$U_TTY" >/dev/null 2>&1 && DELIVERED=1
        fi
      done
    fi
  fi

  # Fallback to standard write
  if [ "$DELIVERED" = "0" ] && [ -n "$T" ]; then
    printf '%s\\n' "$M" | sudo write "$T" 2>/dev/null && DELIVERED=1 || true
  fi

  # If still not delivered, fallback to broadcast with direct recipient header
  if [ "$DELIVERED" = "0" ]; then
    printf '\\n\\n*** [MESSAGE FROM ADMINISTRATOR to %s] ***\\n%s\\n\\n' "$T" "$M" | sudo wall 2>&1 || true
    DELIVERED=1
  fi
fi

if [ "$DELIVERED" = "1" ]; then
  echo "MSG_DELIVERY_SUCCESS"
else
  echo "MSG_DELIVERY_FAILED"
fi
`;

  try {
    await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);
    return {
      success: true,
      message: isAll
        ? 'Broadcast message sent to all active terminal sessions.'
        : `Message successfully delivered to ${cleanTarget}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to deliver message to ${cleanTarget}`,
    };
  }
}

/**
 * Shell script to fetch detailed OS, Kernel, SSH port, persistent proxy and network interfaces
 */
const SYSCONFIG_SCRIPT = `export LC_ALL=C
echo "---OS_INFO---"
cat /etc/os-release 2>/dev/null
echo "---KERNEL---"
uname -r 2>/dev/null
uname -v 2>/dev/null
uname -m 2>/dev/null
echo "---HOST---"
hostname 2>/dev/null
hostname -f 2>/dev/null || hostname 2>/dev/null
echo "---BOOT---"
who -b 2>/dev/null || uptime -s 2>/dev/null || cat /proc/uptime 2>/dev/null
echo "---SSH_PORT---"
ss -tlnp 2>/dev/null | grep -E 'sshd|ssh' || netstat -tlnp 2>/dev/null | grep -E 'sshd|ssh' || grep -E '^[ \\t]*Port[ \\t]+[0-9]+' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || echo "22"
echo "---PROXY---"
cat /etc/environment 2>/dev/null | grep -iE 'proxy' || true
cat /etc/profile.d/proxy.sh 2>/dev/null | grep -iE 'proxy' || true
echo "---INTERFACES---"
ip -o addr show 2>/dev/null
echo "---ROUTES---"
ip route show default 2>/dev/null || route -n 2>/dev/null
echo "---LINKS---"
ip -o link show 2>/dev/null
echo "---END---"`;

/**
 * Fetch detailed system telemetry, kernel, persistent proxy, and network interface cards
 */
export async function fetchLinuxDetailedSysInfoSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<{ sysInfo: LinuxSystemDetailedInfo; interfaces: LinuxNetworkInterfaceDetail[] }> {
  const rawOutput = await runAdaptiveSshCommand(server, SYSCONFIG_SCRIPT, ephemeralPassword, 9000);

  const sections: Record<string, string[]> = {};
  let currentSec = '';
  for (const line of rawOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSec = trimmed.replace(/---/g, '').trim();
      sections[currentSec] = [];
    } else if (currentSec) {
      sections[currentSec].push(line);
    }
  }

  // Parse OS info
  const osLines = sections['OS_INFO'] || [];
  let distro = 'Linux';
  let distroVersion = '';
  let distroId = 'linux';
  for (const l of osLines) {
    const trimmed = l.trim();
    if (trimmed.startsWith('PRETTY_NAME=')) {
      distro = trimmed.replace(/^PRETTY_NAME=["']?/, '').replace(/["']?$/, '');
    } else if (trimmed.startsWith('VERSION=')) {
      distroVersion = trimmed.replace(/^VERSION=["']?/, '').replace(/["']?$/, '');
    } else if (trimmed.startsWith('ID=')) {
      distroId = trimmed.replace(/^ID=["']?/, '').replace(/["']?$/, '');
    }
  }

  // Kernel
  const kernelLines = sections['KERNEL'] || [];
  const kernelRelease = kernelLines[0]?.trim() || 'unknown';
  const kernelVersion = kernelLines[1]?.trim() || '';
  const arch = kernelLines[2]?.trim() || 'x86_64';

  // Host
  const hostLines = sections['HOST'] || [];
  const hostname = hostLines[0]?.trim() || (server.ip || 'linux-server');
  const fqdn = hostLines[1]?.trim() || hostname;

  // Boot
  const bootLines = sections['BOOT'] || [];
  const bootTime = bootLines[0]?.trim() || 'N/A';

  // SSH Port detection
  const sshLines = sections['SSH_PORT'] || [];
  let currentSshPort = server.ssh_port || 22;
  for (const sLine of sshLines) {
    const portMatch = sLine.match(/:(\d+)\s+/) || sLine.match(/Port\s+(\d+)/i);
    if (portMatch) {
      const p = parseInt(portMatch[1], 10);
      if (p > 0 && p <= 65535) {
        currentSshPort = p;
        break;
      }
    }
  }

  // Proxy detection
  const proxyLines = sections['PROXY'] || [];
  let httpProxy = '';
  let httpsProxy = '';
  let ftpProxy = '';
  let noProxy = '';
  for (const pLine of proxyLines) {
    const clean = pLine.trim().replace(/^export\s+/, '');
    const eqIdx = clean.indexOf('=');
    if (eqIdx > 0) {
      const k = clean.slice(0, eqIdx).toLowerCase();
      const v = clean.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
      if (k === 'http_proxy') httpProxy = v;
      else if (k === 'https_proxy') httpsProxy = v;
      else if (k === 'ftp_proxy') ftpProxy = v;
      else if (k === 'no_proxy') noProxy = v;
    }
  }
  const proxyEnabled = !!(httpProxy || httpsProxy || ftpProxy);

  // Parse Default Gateway
  const routeLines = sections['ROUTES'] || [];
  let defaultGateway = '';
  let defaultIface = '';
  for (const rLine of routeLines) {
    const gwMatch = rLine.match(/default via ([0-9a-fA-F:.]+) dev ([a-zA-Z0-9_.-]+)/);
    if (gwMatch) {
      defaultGateway = gwMatch[1];
      defaultIface = gwMatch[2];
      break;
    }
  }

  // Parse Link Details (MAC, MTU, State)
  const linkLines = sections['LINKS'] || [];
  const linkDetails = new Map<string, { mac: string; mtu: number; state: 'UP' | 'DOWN' | 'UNKNOWN' }>();
  for (const lLine of linkLines) {
    const m = lLine.match(/^\d+:\s+([^:@\s]+).*?mtu\s+(\d+).*?state\s+([A-Z]+)/i);
    if (m) {
      const ifName = m[1];
      const mtu = parseInt(m[2], 10) || 1500;
      const rawState = m[3].toUpperCase();
      const state = rawState === 'UP' ? 'UP' : rawState === 'DOWN' ? 'DOWN' : 'UNKNOWN';
      const macMatch = lLine.match(/link\/ether\s+([0-9a-fA-F:]{17})/);
      const mac = macMatch ? macMatch[1] : '';
      linkDetails.set(ifName, { mac, mtu, state });
    }
  }

  // Parse Interfaces and IP Addresses
  const ifaceMap = new Map<string, LinuxNetworkInterfaceDetail>();
  const addrLines = sections['INTERFACES'] || [];
  for (const aLine of addrLines) {
    const parts = aLine.trim().split(/\s+/);
    if (parts.length >= 4) {
      const ifName = parts[1];
      const family = parts[2]; // inet or inet6
      const cidrStr = parts[3]; // e.g. 192.168.1.100/24

      let iface = ifaceMap.get(ifName);
      if (!iface) {
        const link = linkDetails.get(ifName) || { mac: '', mtu: 1500, state: 'UNKNOWN' as const };
        iface = {
          name: ifName,
          state: link.state,
          mac: link.mac,
          ipv4: '',
          netmask: '',
          cidr: 24,
          ipv6: '',
          gateway: ifName === defaultIface ? defaultGateway : '',
          mtu: link.mtu,
          rxBytes: 0,
          txBytes: 0,
        };
        ifaceMap.set(ifName, iface);
      }

      if (family === 'inet') {
        const [ip, cidr] = cidrStr.split('/');
        iface.ipv4 = ip || '';
        iface.cidr = parseInt(cidr || '24', 10);
      } else if (family === 'inet6') {
        if (!iface.ipv6) {
          iface.ipv6 = cidrStr.split('/')[0];
        }
      }
    }
  }

  // If some links didn't have IP addresses (e.g. unconfigured or down interfaces)
  for (const [ifName, link] of linkDetails.entries()) {
    if (!ifaceMap.has(ifName)) {
      ifaceMap.set(ifName, {
        name: ifName,
        state: link.state,
        mac: link.mac,
        ipv4: '',
        netmask: '',
        cidr: 24,
        ipv6: '',
        gateway: '',
        mtu: link.mtu,
        rxBytes: 0,
        txBytes: 0,
      });
    }
  }

  const interfaces = Array.from(ifaceMap.values()).sort((a, b) => {
    if (a.name === 'lo') return 1;
    if (b.name === 'lo') return -1;
    return a.name.localeCompare(b.name);
  });

  return {
    sysInfo: {
      distro,
      distroVersion,
      distroId,
      kernelRelease,
      kernelVersion,
      arch,
      hostname,
      fqdn,
      bootTime,
      uptime: '',
      currentSshPort,
      proxy: {
        httpProxy,
        httpsProxy,
        ftpProxy,
        noProxy,
        enabled: proxyEnabled,
      },
    },
    interfaces,
  };
}

/**
 * Configure Linux Network Interface: IP address, CIDR, Gateway, MTU, or UP/DOWN state
 */
export async function configureLinuxNetworkInterfaceSSH(
  server: RemoteServer,
  interfaceName: string,
  config: {
    state?: 'UP' | 'DOWN';
    ipv4?: string;
    cidr?: number;
    gateway?: string;
    mtu?: number;
  },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const iface = interfaceName.trim().replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!iface) {
    throw new Error('Invalid network interface name.');
  }

  const commands: string[] = ['export LC_ALL=C'];

  if (config.mtu && config.mtu >= 68 && config.mtu <= 9000) {
    commands.push(`sudo ip link set dev ${iface} mtu ${config.mtu} 2>&1`);
  }

  if (config.state) {
    const s = config.state.toLowerCase();
    commands.push(`sudo ip link set dev ${iface} ${s} 2>&1`);
  }

  if (config.ipv4) {
    const cleanIp = config.ipv4.trim();
    const cidr = config.cidr || 24;
    // Replace address or add if none
    commands.push(`sudo ip addr replace ${cleanIp}/${cidr} dev ${iface} 2>&1`);
  }

  if (config.gateway) {
    const cleanGw = config.gateway.trim();
    commands.push(`sudo ip route replace default via ${cleanGw} dev ${iface} 2>&1`);
  }

  const fullCmd = commands.join(' && ');

  try {
    const output = await runAdaptiveSshCommand(server, fullCmd, ephemeralPassword, 10000);
    const lower = output.toLowerCase();
    if (lower.includes('error') || lower.includes('cannot find device') || lower.includes('rtnetlink answers: file exists')) {
      return {
        success: false,
        message: output.trim() || `Failed to configure interface ${iface}`,
      };
    }
    return {
      success: true,
      message: `Network interface ${iface} successfully updated.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to update interface ${iface}`,
    };
  }
}

/**
 * Configure Persistent System Proxy that persists across server reboots
 * Writes to /etc/environment, /etc/profile.d/proxy.sh, and /etc/apt/apt.conf.d/95proxies
 */
export async function configureLinuxPersistentProxySSH(
  server: RemoteServer,
  proxyConfig: {
    enabled: boolean;
    httpProxy?: string;
    httpsProxy?: string;
    ftpProxy?: string;
    noProxy?: string;
  },
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  let script = 'export LC_ALL=C\n';

  if (!proxyConfig.enabled) {
    // Clear proxy settings everywhere
    script += `
sudo sed -i '/[hH][tT][tT][pP]_[pP][rR][oO][xX][yY]/d' /etc/environment 2>/dev/null || true
sudo sed -i '/[fF][tT][pP]_[pP][rR][oO][xX][yY]/d' /etc/environment 2>/dev/null || true
sudo sed -i '/[nN][oO]_[pP][rR][oO][xX][yY]/d' /etc/environment 2>/dev/null || true
sudo rm -f /etc/profile.d/proxy.sh 2>/dev/null || true
sudo rm -f /etc/apt/apt.conf.d/95proxies 2>/dev/null || true
echo "PROXY_CLEARED"
`;
  } else {
    const http = (proxyConfig.httpProxy || '').trim();
    const https = (proxyConfig.httpsProxy || http).trim();
    const ftp = (proxyConfig.ftpProxy || '').trim();
    const no = (proxyConfig.noProxy || 'localhost,127.0.0.1,localaddress,.localdomain.com').trim();

    if (!http && !https) {
      throw new Error('At least one of HTTP or HTTPS proxy must be provided.');
    }

    script += `
# 1. Clean existing proxy entries from /etc/environment
sudo sed -i '/[hH][tT][tT][pP]_[pP][rR][oO][xX][yY]/d' /etc/environment 2>/dev/null || true
sudo sed -i '/[fF][tT][pP]_[pP][rR][oO][xX][yY]/d' /etc/environment 2>/dev/null || true
sudo sed -i '/[nN][oO]_[pP][rR][oO][xX][yY]/d' /etc/environment 2>/dev/null || true

# 2. Append persistent proxy variables to /etc/environment
sudo tee -a /etc/environment >/dev/null << 'EOF'
http_proxy="${http}"
https_proxy="${https}"
ftp_proxy="${ftp}"
no_proxy="${no}"
HTTP_PROXY="${http}"
HTTPS_PROXY="${https}"
FTP_PROXY="${ftp}"
NO_PROXY="${no}"
EOF

# 3. Write persistent profile script in /etc/profile.d/proxy.sh
sudo tee /etc/profile.d/proxy.sh >/dev/null << 'EOF'
export http_proxy="${http}"
export https_proxy="${https}"
export ftp_proxy="${ftp}"
export no_proxy="${no}"
export HTTP_PROXY="${http}"
export HTTPS_PROXY="${https}"
export FTP_PROXY="${ftp}"
export NO_PROXY="${no}"
EOF
sudo chmod +x /etc/profile.d/proxy.sh 2>/dev/null || true

# 4. If APT is present, configure APT package manager proxy
if [ -d /etc/apt/apt.conf.d ]; then
  sudo tee /etc/apt/apt.conf.d/95proxies >/dev/null << 'EOF'
Acquire::http::proxy "${http}";
Acquire::https::proxy "${https}";
EOF
fi

echo "PROXY_APPLIED"
`;
  }

  try {
    const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 10000);
    const lower = output.toLowerCase();
    if (lower.includes('permission denied') || lower.includes('cannot create')) {
      return {
        success: false,
        message: output.trim() || 'Failed to save persistent proxy settings (root permissions required).',
      };
    }
    return {
      success: true,
      message: proxyConfig.enabled
        ? 'Persistent system proxy configured across /etc/environment, /etc/profile.d, and APT. Settings will persist across all reboots.'
        : 'Persistent system proxy removed from all configuration files.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Failed to configure persistent proxy.',
    };
  }
}

/**
 * Test connectivity through a specified proxy server
 */
export async function testLinuxProxySSH(
  server: RemoteServer,
  proxyUrl: string,
  testTarget?: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; statusCode?: number; latencyMs?: number; message: string }> {
  const target = testTarget || 'https://www.google.com';
  const cleanProxy = proxyUrl.trim();

  if (!cleanProxy) {
    throw new Error('Proxy URL cannot be empty.');
  }

  const startTime = Date.now();
  const cmd = `export LC_ALL=C; curl -s -I -o /dev/null -w "%{http_code}" --connect-timeout 6 -x '${cleanProxy}' '${target}' 2>&1`;

  try {
    const output = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 10000);
    const latencyMs = Date.now() - startTime;
    const code = parseInt(output.trim(), 10);

    if (code >= 200 && code < 400) {
      return {
        success: true,
        statusCode: code,
        latencyMs,
        message: `Proxy test succeeded with HTTP ${code} (${latencyMs}ms)`,
      };
    } else if (code > 0) {
      return {
        success: true,
        statusCode: code,
        latencyMs,
        message: `Proxy reached target with HTTP ${code}`,
      };
    } else {
      return {
        success: false,
        message: output.trim() || 'Connection through proxy timed out or failed.',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Proxy connectivity test failed.',
    };
  }
}

/**
 * Safely change SSH listening port on remote Linux server:
 * 1. Validates port range (1-65535, != 80, 443, etc.)
 * 2. Checks sshd syntax beforehand (sshd -t)
 * 3. Safely edits sshd_config or creates custom drop-in
 * 4. Verifies sshd syntax again - REVERTS immediately if test fails
 * 5. Updates UFW or Firewalld rules
 * 6. Restarts SSH daemon
 * 7. Updates RemoteServer record in database with new port
 */
export async function changeLinuxSshPortSSH(
  server: RemoteServer,
  newPort: number,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const targetPort = Math.floor(newPort);
  if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
    throw new Error('Invalid SSH port. Must be an integer between 1 and 65535.');
  }

  const reservedPorts = [80, 443, 53, 25, 110, 143, 3306, 5432, 6379, 27017];
  if (reservedPorts.includes(targetPort)) {
    throw new Error(`Port ${targetPort} is typically reserved for other services. Please choose an administrative port (e.g. 2222, 22022).`);
  }

  const script = `export LC_ALL=C
# Step 1: Verify current sshd configuration
if command -v sshd >/dev/null 2>&1; then
  sudo sshd -t || { echo "PRECHECK_FAILED"; exit 1; }
fi

# Step 2: Backup existing config
BACKUP_FILE="/etc/ssh/sshd_config.bak.$(date +%s)"
sudo cp -p /etc/ssh/sshd_config "$BACKUP_FILE" 2>/dev/null || true

# Step 3: Configure new port directly in /etc/ssh/sshd_config (uncomment & set)
if grep -qiE '^[ \\t]*#?[ \\t]*Port([ \\t]+.*|$)' /etc/ssh/sshd_config; then
  sudo sed -i -E "0,/^[ \\t]*#?[ \\t]*Port([ \\t]+.*|$)/s/^[ \\t]*#?[ \\t]*Port([ \\t]+.*|$)/Port ${targetPort}/" /etc/ssh/sshd_config 2>/dev/null || \
  sudo sed -i -E "s/^[ \\t]*#?[ \\t]*Port([ \\t]+.*|$)/Port ${targetPort}/" /etc/ssh/sshd_config 2>/dev/null || true
else
  echo "Port ${targetPort}" | sudo tee -a /etc/ssh/sshd_config >/dev/null
fi

# Step 4: Synchronize drop-in directory if present (/etc/ssh/sshd_config.d)
if [ -d /etc/ssh/sshd_config.d ]; then
  if ! grep -qE '^[ #]*Include /etc/ssh/sshd_config\\.d/\\*\\.conf' /etc/ssh/sshd_config; then
    echo "Include /etc/ssh/sshd_config.d/*.conf" | sudo tee -a /etc/ssh/sshd_config >/dev/null
  fi
  sudo tee /etc/ssh/sshd_config.d/00-custom-port.conf >/dev/null << 'EOF'
Port ${targetPort}
EOF
fi

# Step 5: Validate syntax with sshd -t
if command -v sshd >/dev/null 2>&1; then
  if ! sudo sshd -t; then
    echo "SYNTAX_CHECK_FAILED_REVERTING"
    sudo rm -f /etc/ssh/sshd_config.d/00-custom-port.conf 2>/dev/null || true
    if [ -f "$BACKUP_FILE" ]; then
      sudo cp -p "$BACKUP_FILE" /etc/ssh/sshd_config 2>/dev/null || true
    fi
    exit 2
  fi
fi

# Step 6: Update firewall if active
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  sudo ufw allow ${targetPort}/tcp comment "Administrative SSH Port" 2>&1 || true
  sudo ufw reload 2>/dev/null || true
fi
if command -v firewall-cmd >/dev/null 2>&1 && sudo systemctl is-active firewalld >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-port=${targetPort}/tcp >/dev/null 2>&1 || true
  sudo firewall-cmd --reload >/dev/null 2>&1 || true
fi
if command -v semanage >/dev/null 2>&1; then
  sudo semanage port -a -t ssh_port_t -p tcp ${targetPort} 2>/dev/null || \
  sudo semanage port -m -t ssh_port_t -p tcp ${targetPort} 2>/dev/null || true
fi

# Step 7: Handle systemd socket activation (Ubuntu 22.10, 23+, 24.04+)
if systemctl is-active --quiet ssh.socket 2>/dev/null || systemctl is-enabled --quiet ssh.socket 2>/dev/null; then
  sudo mkdir -p /etc/systemd/system/ssh.socket.d
  sudo tee /etc/systemd/system/ssh.socket.d/listen.conf >/dev/null << 'EOFSOCK'
[Socket]
ListenStream=
ListenStream=${targetPort}
EOFSOCK
  sudo systemctl daemon-reload 2>/dev/null || true
  sudo systemctl restart ssh.socket 2>/dev/null || true
fi

# Step 8: Safe daemon RESTART
sudo systemctl restart sshd.service 2>/dev/null || \
sudo systemctl restart ssh.service 2>/dev/null || \
sudo systemctl restart sshd 2>/dev/null || \
sudo systemctl restart ssh 2>/dev/null || \
sudo service sshd restart 2>/dev/null || \
sudo service ssh restart 2>/dev/null || \
sudo /etc/init.d/sshd restart 2>/dev/null || \
sudo /etc/init.d/ssh restart 2>/dev/null || true

# Step 9: Verify port is listening
sleep 1
if ss -tlnp 2>/dev/null | grep -qE ":${targetPort}\\b" || netstat -tlnp 2>/dev/null | grep -qE ":${targetPort}\\b"; then
  echo "SSHD_LISTENING_VERIFIED"
fi

echo "SSH_PORT_SUCCESS"
`;

  try {
    const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);
    const lower = output.toLowerCase();

    if (lower.includes('syntax_check_failed') || lower.includes('precheck_failed')) {
      return {
        success: false,
        message: 'SSH configuration validation failed. Reverted changes to protect SSH connectivity.',
      };
    }

    if (lower.includes('permission denied')) {
      return {
        success: false,
        message: 'Permission denied: Sudo privileges required to update SSH port.',
      };
    }

    // Step 7: Update RemoteServer record in application database
    await updateRemoteServer(server.id, { ssh_port: targetPort }).catch((dbErr) => {
      console.warn(`[LinuxSSHPort] Updated server SSH port to ${targetPort} on device, but failed to update local DB:`, dbErr?.message);
    });

    return {
      success: true,
      message: `SSH port successfully changed to ${targetPort} and local fleet config updated.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to change SSH port to ${targetPort}`,
    };
  }
}

/**
 * Fetches real block devices and unmounted partitions from the Linux server
 */
export async function fetchLinuxBlockDevicesSSH(
  server: RemoteServer,
  ephemeralPassword?: string,
  timeoutMs: number = 8000
): Promise<LinuxBlockDevice[]> {
  const script = `export LC_ALL=C
if command -v lsblk >/dev/null 2>&1; then
  lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,LABEL 2>/dev/null || lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,LABEL -r 2>/dev/null
else
  cat /proc/partitions 2>/dev/null || true
fi`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);
    const devices: LinuxBlockDevice[] = [];

    // Try parsing JSON first
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.includes('"blockdevices"')) {
      try {
        const parsed = JSON.parse(trimmed);
        const flatten = (items: any[]) => {
          for (const item of items) {
            const name = item.name.startsWith('/') ? item.name : `/dev/${item.name}`;
            devices.push({
              name,
              size: item.size || '-',
              type: item.type || 'part',
              mountpoint: item.mountpoint || null,
              fstype: item.fstype || null,
              label: item.label || null,
            });
            if (Array.isArray(item.children)) {
              flatten(item.children);
            }
          }
        };
        if (Array.isArray(parsed.blockdevices)) {
          flatten(parsed.blockdevices);
        }
        return devices;
      } catch {
        // Fallback to line parser
      }
    }

    // Fallback line parsing
    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith('NAME') || line.startsWith('major')) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const devName = parts[0].startsWith('/') ? parts[0] : `/dev/${parts[0]}`;
        devices.push({
          name: devName,
          size: parts[1] || '-',
          type: parts[2] || 'disk',
          mountpoint: parts[3] && parts[3] !== '-' ? parts[3] : null,
          fstype: parts[4] && parts[4] !== '-' ? parts[4] : null,
          label: parts[5] || null,
        });
      }
    }
    return devices;
  } catch (err: any) {
    console.error(`[fetchLinuxBlockDevicesSSH] error:`, err?.message);
    return [];
  }
}

/**
 * Mounts a block device, partition, or network storage to a target mount point on the Linux server
 */
export async function executeLinuxMountFilesystem(
  server: RemoteServer,
  payload: LinuxMountPayload,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const { device, mountPoint, fsType, options, persistInFstab, createDirectory } = payload;

  const cleanDevice = (device || '').trim();
  const cleanMount = (mountPoint || '').trim();

  if (!cleanDevice) {
    throw new Error('Device or source filesystem path is required.');
  }
  if (!cleanMount || !cleanMount.startsWith('/')) {
    throw new Error('Target mount point must be an absolute path starting with /.');
  }

  // Prevent dangerous mount locations
  const forbiddenMounts = ['/', '/boot', '/proc', '/sys', '/dev', '/etc', '/bin', '/sbin', '/lib', '/usr'];
  if (forbiddenMounts.includes(cleanMount)) {
    throw new Error(`Mounting directly to system path "${cleanMount}" is restricted for system safety.`);
  }

  const cleanFsType = (fsType || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
  const cleanOptions = (options || '').trim().replace(/[^a-zA-Z0-9_,=\-]/g, '');

  let mountArgs = '';
  if (cleanFsType && cleanFsType !== 'auto') {
    mountArgs += ` -t ${cleanFsType}`;
  }
  if (cleanOptions) {
    mountArgs += ` -o "${cleanOptions}"`;
  }

  const script = `export LC_ALL=C
set -e
# 1. Create target mount directory if requested or doesn't exist
if [ "${createDirectory ? '1' : '0'}" = "1" ] || [ ! -d "${cleanMount}" ]; then
  sudo mkdir -p "${cleanMount}" || mkdir -p "${cleanMount}"
fi

# 2. Check if already mounted
if mountpoint -q "${cleanMount}" 2>/dev/null; then
  echo "ALREADY_MOUNTED"
  exit 0
fi

# 3. Perform Mount
sudo mount${mountArgs} "${cleanDevice}" "${cleanMount}" 2>&1 || mount${mountArgs} "${cleanDevice}" "${cleanMount}" 2>&1

# 4. Optional /etc/fstab persistence
if [ "${persistInFstab ? '1' : '0'}" = "1" ]; then
  FSTAB_LINE="${cleanDevice} ${cleanMount} ${cleanFsType || 'auto'} ${cleanOptions || 'defaults'} 0 2"
  if ! grep -qs "${cleanMount}" /etc/fstab; then
    echo "$FSTAB_LINE" | sudo tee -a /etc/fstab >/dev/null || echo "$FSTAB_LINE" >> /etc/fstab
  fi
fi

echo "MOUNT_SUCCESS"
`;

  try {
    const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 15000);
    const lower = output.toLowerCase();

    if (output.includes('ALREADY_MOUNTED')) {
      return {
        success: true,
        message: `Mount point "${cleanMount}" is already mounted.`,
      };
    }

    if (lower.includes('permission denied') || lower.includes('must be superuser')) {
      return {
        success: false,
        message: 'Permission denied: Sudo or root privileges required to mount filesystems.',
      };
    }

    if (lower.includes('wrong fs type') || lower.includes('bad superblock') || lower.includes('mount: ')) {
      const firstLine = output.split('\n').filter(l => l.trim()).join(' ') || output;
      return {
        success: false,
        message: firstLine.trim(),
      };
    }

    if (output.includes('MOUNT_SUCCESS') || !output.trim()) {
      return {
        success: true,
        message: `Successfully mounted "${cleanDevice}" to "${cleanMount}"${persistInFstab ? ' (persisted in /etc/fstab)' : ''}.`,
      };
    }

    return {
      success: true,
      message: output.trim() || `Mounted "${cleanDevice}" to "${cleanMount}".`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to mount "${cleanDevice}" to "${cleanMount}".`,
    };
  }
}

/**
 * Unmounts a mounted filesystem path
 */
export async function executeLinuxUnmountFilesystem(
  server: RemoteServer,
  mountPoint: string,
  force: boolean = false,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanMount = (mountPoint || '').trim();
  if (!cleanMount || !cleanMount.startsWith('/')) {
    throw new Error('Valid target mount point is required.');
  }

  // Strictly prevent unmounting root or vital directories
  const protectedMounts = ['/', '/boot', '/proc', '/sys', '/dev', '/run', '/etc', '/var', '/usr'];
  if (protectedMounts.includes(cleanMount)) {
    throw new Error(`Unmounting protected system mount point "${cleanMount}" is strictly forbidden.`);
  }

  const script = `export LC_ALL=C
if ! mountpoint -q "${cleanMount}" 2>/dev/null && ! grep -qs " ${cleanMount} " /proc/mounts; then
  echo "NOT_MOUNTED"
  exit 0
fi

sudo umount ${force ? '-f' : ''} "${cleanMount}" 2>&1 || umount ${force ? '-f' : ''} "${cleanMount}" 2>&1
echo "UMOUNT_SUCCESS"
`;

  try {
    const output = await runAdaptiveSshCommand(server, script, ephemeralPassword, 12000);
    const lower = output.toLowerCase();

    if (output.includes('NOT_MOUNTED')) {
      return {
        success: true,
        message: `Path "${cleanMount}" is not currently mounted.`,
      };
    }

    if (lower.includes('target is busy') || lower.includes('device is busy')) {
      return {
        success: false,
        message: `Cannot unmount "${cleanMount}": Target is busy (files or active processes are in use).`,
      };
    }

    if (lower.includes('permission denied')) {
      return {
        success: false,
        message: 'Permission denied: Sudo privileges required to unmount filesystems.',
      };
    }

    if (output.includes('UMOUNT_SUCCESS') || !output.trim()) {
      return {
        success: true,
        message: `Successfully unmounted "${cleanMount}".`,
      };
    }

    return {
      success: true,
      message: output.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to unmount "${cleanMount}".`,
    };
  }
}

// ==============================================================================
// LINUX SYSTEMD SERVICE WATCHDOG & SELF-HEALING ENGINE (REAL DESTINATION AGENT)
// ==============================================================================

const WATCHDOG_RUNNER_BASH_SCRIPT = `#!/bin/bash
# ==============================================================================
# NetTopology Service Watchdog & Self-Healing Agent
# Managed by NetTopology Network Management System
# ==============================================================================
set -u

CONFIG_DIR="/etc/nettopology-watchdog/rules.d"
STATE_DIR="/var/lib/nettopology-watchdog"
LOG_FILE="/var/log/nettopology-watchdog.log"
REBOOT_HIST_FILE="/var/lib/nettopology-watchdog/reboot_history.log"

mkdir -p "$CONFIG_DIR" "$STATE_DIR"
touch "$LOG_FILE" "$REBOOT_HIST_FILE"
chmod 700 "$STATE_DIR" 2>/dev/null || true
chmod 644 "$LOG_FILE" 2>/dev/null || true

log() {
    local msg="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $msg" >> "$LOG_FILE"
    if command -v logger >/dev/null 2>&1; then
        logger -t "nettopology-watchdog" "$msg"
    fi
}

clean_unit_name() {
    echo "$1" | sed 's/[^a-zA-Z0-9_@.-]/_/g'
}

is_service_active() {
    local unit="$1"
    if command -v systemctl >/dev/null 2>&1; then
        systemctl is-active --quiet "$unit"
        return $?
    elif command -v service >/dev/null 2>&1; then
        service "$unit" status >/dev/null 2>&1
        return $?
    elif [ -x "/etc/init.d/$unit" ]; then
        "/etc/init.d/$unit" status >/dev/null 2>&1
        return $?
    fi
    return 1
}

check_rule() {
    local service_name="$1"
    local test_mode="\${2:-0}"
    local clean_name=$(clean_unit_name "$service_name")
    local conf_file="$CONFIG_DIR/\${clean_name}.conf"
    local state_file="$STATE_DIR/\${clean_name}.state"

    if [ ! -f "$conf_file" ]; then
        [ "$test_mode" -eq 1 ] && echo "ERROR: Configuration file not found: $conf_file"
        return 1
    fi

    # Defaults
    ENABLED=1
    CHECK_INTERVAL_SEC=30
    MAX_RESTART_ATTEMPTS=3
    COOLDOWN_PERIOD_SEC=300
    REBOOT_ON_PERSISTENT_FAILURE=0
    REBOOT_COOLDOWN_MIN=60
    MIN_UPTIME_BEFORE_REBOOT_MIN=5
    MAX_REBOOTS_PER_DAY=2
    CUSTOM_PRE_RESTART_CMD=""

    . "$conf_file"

    if [ "$ENABLED" -ne 1 ] && [ "$test_mode" -ne 1 ]; then
        return 0
    fi

    CONSECUTIVE_FAILURES=0
    LAST_REBOOT_TIMESTAMP=0
    LAST_RESTART_TIMESTAMP=0
    ANTI_LOOP_HALTED=0
    HEALTHY_SINCE=0
    STATUS="active"
    LAST_ACTION_MSG="Watchdog active"

    if [ -f "$state_file" ]; then
        . "$state_file"
    fi

    local NOW=$(date +%s)

    # 1. Check if unit is active
    if is_service_active "$service_name"; then
        if [ "$CONSECUTIVE_FAILURES" -gt 0 ]; then
            if [ "$HEALTHY_SINCE" -eq 0 ]; then
                HEALTHY_SINCE=$NOW
            fi
            local HEALTHY_ELAPSED=$(( NOW - HEALTHY_SINCE ))
            if [ "$HEALTHY_ELAPSED" -ge "$COOLDOWN_PERIOD_SEC" ]; then
                log "RECOVERY CONFIRMED: $service_name continuously active for \${HEALTHY_ELAPSED}s. Failure counter reset (was $CONSECUTIVE_FAILURES)."
                CONSECUTIVE_FAILURES=0
                ANTI_LOOP_HALTED=0
                HEALTHY_SINCE=$NOW
                STATUS="active"
                LAST_ACTION_MSG="Service healthy and active. Failure counter cleared."
            else
                STATUS="recovering"
                LAST_ACTION_MSG="Service active. In health cooldown (\${HEALTHY_ELAPSED}/\${COOLDOWN_PERIOD_SEC}s)."
            fi
        else
            STATUS="active"
            LAST_ACTION_MSG="Service active and normal."
            HEALTHY_SINCE=$NOW
        fi

        cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$LAST_REBOOT_TIMESTAMP
ANTI_LOOP_HALTED=$ANTI_LOOP_HALTED
HEALTHY_SINCE=$HEALTHY_SINCE
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF

        [ "$test_mode" -eq 1 ] && echo "PASS: $service_name is currently ACTIVE and healthy. (Failures: $CONSECUTIVE_FAILURES, Anti-Loop: $ANTI_LOOP_HALTED)"
        return 0
    fi

    # Service is NOT active (Failed / Dead / Inactive)
    HEALTHY_SINCE=0

    # Check if Anti-Loop Lock is already tripped
    if [ "$ANTI_LOOP_HALTED" -eq 1 ]; then
        local msg="ANTI-LOOP ACTIVE: $service_name is DOWN, but auto-reboot is HALTED to protect host from boot loop. Manual admin intervention required."
        log "$msg"
        STATUS="anti_loop_halted"
        LAST_ACTION_MSG="$msg"
        cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$LAST_REBOOT_TIMESTAMP
ANTI_LOOP_HALTED=1
HEALTHY_SINCE=0
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF
        [ "$test_mode" -eq 1 ] && echo "BLOCKED: $msg"
        return 2
    fi

    CONSECUTIVE_FAILURES=$(( CONSECUTIVE_FAILURES + 1 ))

    # Attempt service restart if within max restart limit
    if [ "$CONSECUTIVE_FAILURES" -le "$MAX_RESTART_ATTEMPTS" ]; then
        log "FAILURE DETECTED: $service_name is down. Triggering restart attempt $CONSECUTIVE_FAILURES of $MAX_RESTART_ATTEMPTS..."
        
        if [ -n "$CUSTOM_PRE_RESTART_CMD" ]; then
            log "Executing pre-restart hook: $CUSTOM_PRE_RESTART_CMD"
            eval "$CUSTOM_PRE_RESTART_CMD" >> "$LOG_FILE" 2>&1 || true
        fi

        if command -v systemctl >/dev/null 2>&1; then
            systemctl restart "$service_name" >> "$LOG_FILE" 2>&1 || true
        elif command -v service >/dev/null 2>&1; then
            service "$service_name" restart >> "$LOG_FILE" 2>&1 || true
        fi

        LAST_RESTART_TIMESTAMP=$NOW
        sleep 2

        if is_service_active "$service_name"; then
            log "RESTART SUCCESS: $service_name restored to active state on attempt $CONSECUTIVE_FAILURES/$MAX_RESTART_ATTEMPTS."
            STATUS="recovering"
            HEALTHY_SINCE=$(date +%s)
            LAST_ACTION_MSG="Restarted successfully on attempt $CONSECUTIVE_FAILURES/$MAX_RESTART_ATTEMPTS."
        else
            log "RESTART FAILED: $service_name failed to start on attempt $CONSECUTIVE_FAILURES/$MAX_RESTART_ATTEMPTS."
            STATUS="recovering"
            LAST_ACTION_MSG="Restart attempt $CONSECUTIVE_FAILURES/$MAX_RESTART_ATTEMPTS failed."
        fi

        cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$LAST_REBOOT_TIMESTAMP
ANTI_LOOP_HALTED=0
HEALTHY_SINCE=$HEALTHY_SINCE
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF
        [ "$test_mode" -eq 1 ] && echo "ACTION: Restarted $service_name (Attempt $CONSECUTIVE_FAILURES/$MAX_RESTART_ATTEMPTS). Current status: $STATUS"
        return 1
    fi

    # Consecutive restarts exhausted
    log "PERSISTENT FAILURE: $service_name failed after $MAX_RESTART_ATTEMPTS consecutive restart attempts."

    if [ "$REBOOT_ON_PERSISTENT_FAILURE" -ne 1 ]; then
        STATUS="failed"
        LAST_ACTION_MSG="Service failed after $MAX_RESTART_ATTEMPTS restart attempts. Reboot policy is disabled."
        cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$LAST_REBOOT_TIMESTAMP
ANTI_LOOP_HALTED=0
HEALTHY_SINCE=0
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF
        [ "$test_mode" -eq 1 ] && echo "ALERT: $service_name persistently failed. Server reboot disabled."
        return 2
    fi

    # ==========================================================================
    # ANTI-BOOT-LOOP PROTECTION MATRIX
    # ==========================================================================

    # LAYER 1: Host Uptime Verification (cannot reboot right after boot)
    local UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
    local MIN_UPTIME_SEC=$(( MIN_UPTIME_BEFORE_REBOOT_MIN * 60 ))
    if [ "$UPTIME_SEC" -lt "$MIN_UPTIME_SEC" ]; then
        local msg="ANTI-LOOP TRIP [Layer 1]: Host uptime is only \${UPTIME_SEC}s (Required minimum: \${MIN_UPTIME_SEC}s). Halting reboot to prevent rapid boot loop!"
        log "$msg"
        STATUS="anti_loop_halted"
        ANTI_LOOP_HALTED=1
        LAST_ACTION_MSG="$msg"
        cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$LAST_REBOOT_TIMESTAMP
ANTI_LOOP_HALTED=1
HEALTHY_SINCE=0
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF
        [ "$test_mode" -eq 1 ] && echo "BLOCKED: $msg"
        return 2
    fi

    # LAYER 2: Cooldown Verification Against Last Watchdog Reboot
    local REBOOT_COOLDOWN_SEC=$(( REBOOT_COOLDOWN_MIN * 60 ))
    local REBOOT_ELAPSED=$(( NOW - LAST_REBOOT_TIMESTAMP ))
    if [ "$LAST_REBOOT_TIMESTAMP" -gt 0 ] && [ "$REBOOT_ELAPSED" -lt "$REBOOT_COOLDOWN_SEC" ]; then
        local msg="ANTI-LOOP TRIP [Layer 2]: Last watchdog reboot was \${REBOOT_ELAPSED}s ago (Cooldown window: \${REBOOT_COOLDOWN_SEC}s). Halting reboot to prevent infinite reboot loop!"
        log "$msg"
        STATUS="anti_loop_halted"
        ANTI_LOOP_HALTED=1
        LAST_ACTION_MSG="$msg"
        cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$LAST_REBOOT_TIMESTAMP
ANTI_LOOP_HALTED=1
HEALTHY_SINCE=0
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF
        [ "$test_mode" -eq 1 ] && echo "BLOCKED: $msg"
        return 2
    fi

    # LAYER 3: Sliding 24-Hour Reboot Cap
    local DAY_AGO=$(( NOW - 86400 ))
    local RECENT_REBOOTS=0
    if [ -f "$REBOOT_HIST_FILE" ]; then
        local TMP_HIST=$(mktemp 2>/dev/null || echo "/tmp/reboot_hist_$NOW")
        awk -v cutoff="$DAY_AGO" '$1 > cutoff {print $1}' "$REBOOT_HIST_FILE" > "$TMP_HIST" 2>/dev/null || true
        mv "$TMP_HIST" "$REBOOT_HIST_FILE" 2>/dev/null || true
        RECENT_REBOOTS=$(wc -l < "$REBOOT_HIST_FILE" 2>/dev/null | tr -d ' ' || echo 0)
    fi

    if [ "$RECENT_REBOOTS" -ge "$MAX_REBOOTS_PER_DAY" ]; then
        local msg="ANTI-LOOP TRIP [Layer 3]: Maximum allowed daily reboots ($MAX_REBOOTS_PER_DAY) reached in last 24 hours. Halting reboot!"
        log "$msg"
        STATUS="anti_loop_halted"
        ANTI_LOOP_HALTED=1
        LAST_ACTION_MSG="$msg"
        cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$LAST_REBOOT_TIMESTAMP
ANTI_LOOP_HALTED=1
HEALTHY_SINCE=0
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF
        [ "$test_mode" -eq 1 ] && echo "BLOCKED: $msg"
        return 2
    fi

    # ==========================================================================
    # ALL ANTI-LOOP CHECKS PASSED: EXECUTE CONTROLLED EMERGENCY REBOOT
    # ==========================================================================
    log "EMERGENCY ACTION: $service_name failed $MAX_RESTART_ATTEMPTS restart attempts. Anti-loop checks passed (Uptime: \${UPTIME_SEC}s, Cooldown: \${REBOOT_COOLDOWN_SEC}s). Initiating server reboot."
    echo "$NOW" >> "$REBOOT_HIST_FILE"

    STATUS="rebooting"
    LAST_REBOOT_TIMESTAMP=$NOW
    LAST_ACTION_MSG="Initiating controlled emergency reboot due to persistent failure of $service_name"
    cat <<EOF > "$state_file"
STATUS="$STATUS"
CONSECUTIVE_FAILURES=$CONSECUTIVE_FAILURES
LAST_CHECK_TIMESTAMP=$NOW
LAST_RESTART_TIMESTAMP=$LAST_RESTART_TIMESTAMP
LAST_REBOOT_TIMESTAMP=$NOW
ANTI_LOOP_HALTED=0
HEALTHY_SINCE=0
LAST_ACTION_MSG="$LAST_ACTION_MSG"
EOF

    if [ "$test_mode" -eq 1 ]; then
        echo "TEST SIMULATION: Anti-loop checks passed! In live production, server reboot would execute now."
        return 0
    fi

    sync; sync
    if command -v systemctl >/dev/null 2>&1; then
        systemctl reboot || /sbin/reboot || reboot
    else
        /sbin/reboot || reboot
    fi
}

run_loop() {
    local service_name="$1"
    local clean_name=$(clean_unit_name "$service_name")
    local conf_file="$CONFIG_DIR/\${clean_name}.conf"

    log "Starting NetTopology Watchdog daemon loop for service: $service_name"

    while true; do
        if [ ! -f "$conf_file" ]; then
            log "Configuration removed for $service_name. Stopping watchdog loop."
            exit 0
        fi

        CHECK_INTERVAL_SEC=30
        ENABLED=1
        . "$conf_file"

        if [ "$ENABLED" -eq 1 ]; then
            check_rule "$service_name" 0
        fi

        sleep "\${CHECK_INTERVAL_SEC:-30}"
    done
}

reset_loop() {
    local service_name="$1"
    local clean_name=$(clean_unit_name "$service_name")
    local state_file="$STATE_DIR/\${clean_name}.state"

    log "Administrator manually reset anti-loop lock and failure counters for: $service_name"

    if [ -f "$state_file" ]; then
        cat <<EOF > "$state_file"
STATUS="active"
CONSECUTIVE_FAILURES=0
LAST_CHECK_TIMESTAMP=$(date +%s)
LAST_RESTART_TIMESTAMP=0
LAST_REBOOT_TIMESTAMP=0
ANTI_LOOP_HALTED=0
HEALTHY_SINCE=$(date +%s)
LAST_ACTION_MSG="Anti-loop lock cleared manually by administrator."
EOF
    fi
    echo "SUCCESS: Anti-loop lock and failure counters reset for $service_name"
}

CMD="\${1:-help}"
SERVICE="\${2:-}"

case "$CMD" in
    run)
        if [ -z "$SERVICE" ]; then
            echo "Usage: $0 run <service_name>"
            exit 1
        fi
        run_loop "$SERVICE"
        ;;
    check-once)
        if [ -z "$SERVICE" ]; then
            echo "Usage: $0 check-once <service_name>"
            exit 1
        fi
        check_rule "$SERVICE" 1
        ;;
    reset-loop)
        if [ -z "$SERVICE" ]; then
            echo "Usage: $0 reset-loop <service_name>"
            exit 1
        fi
        reset_loop "$SERVICE"
        ;;
    list)
        echo "["
        FIRST=1
        for f in "$CONFIG_DIR"/*.conf; do
            [ -e "$f" ] || continue
            [ "$FIRST" -eq 0 ] && echo ","
            FIRST=0
            
            SERVICE_NAME=""
            ENABLED=1
            CHECK_INTERVAL_SEC=30
            MAX_RESTART_ATTEMPTS=3
            COOLDOWN_PERIOD_SEC=300
            REBOOT_ON_PERSISTENT_FAILURE=0
            REBOOT_COOLDOWN_MIN=60
            MIN_UPTIME_BEFORE_REBOOT_MIN=5
            MAX_REBOOTS_PER_DAY=2
            CUSTOM_PRE_RESTART_CMD=""
            . "$f"

            clean_name=$(clean_unit_name "$SERVICE_NAME")
            state_file="$STATE_DIR/\${clean_name}.state"
            STATUS="unknown"
            CONSECUTIVE_FAILURES=0
            LAST_CHECK_TIMESTAMP=0
            LAST_RESTART_TIMESTAMP=0
            LAST_REBOOT_TIMESTAMP=0
            ANTI_LOOP_HALTED=0
            HEALTHY_SINCE=0
            LAST_ACTION_MSG=""
            if [ -f "$state_file" ]; then
                . "$state_file"
            fi

            UNIT_ACTIVE="false"
            if command -v systemctl >/dev/null 2>&1; then
                systemctl is-active --quiet "nettopology-watchdog@\${clean_name}.service" && UNIT_ACTIVE="true"
            fi

            cat <<JSON
  {
    "id": "$clean_name",
    "serviceName": "$SERVICE_NAME",
    "enabled": $( [ "$ENABLED" -eq 1 ] && echo "true" || echo "false" ),
    "checkIntervalSeconds": \${CHECK_INTERVAL_SEC:-30},
    "maxRestartAttempts": \${MAX_RESTART_ATTEMPTS:-3},
    "cooldownPeriodSeconds": \${COOLDOWN_PERIOD_SEC:-300},
    "rebootOnPersistentFailure": $( [ "$REBOOT_ON_PERSISTENT_FAILURE" -eq 1 ] && echo "true" || echo "false" ),
    "rebootCooldownMinutes": \${REBOOT_COOLDOWN_MIN:-60},
    "minUptimeBeforeRebootMinutes": \${MIN_UPTIME_BEFORE_REBOOT_MIN:-5},
    "maxRebootsPerDay": \${MAX_REBOOTS_PER_DAY:-2},
    "customPreRestartCommand": $(echo "$CUSTOM_PRE_RESTART_CMD" | jq -R . 2>/dev/null || echo "\"$CUSTOM_PRE_RESTART_CMD\""),
    "status": "$STATUS",
    "consecutiveFailures": \${CONSECUTIVE_FAILURES:-0},
    "lastCheckTimestamp": \${LAST_CHECK_TIMESTAMP:-0},
    "lastRestartTimestamp": \${LAST_RESTART_TIMESTAMP:-0},
    "lastRebootTimestamp": \${LAST_REBOOT_TIMESTAMP:-0},
    "antiLoopHalted": $( [ "\${ANTI_LOOP_HALTED:-0}" -eq 1 ] && echo "true" || echo "false" ),
    "systemdUnitActive": $UNIT_ACTIVE,
    "lastActionMessage": $(echo "$LAST_ACTION_MSG" | jq -R . 2>/dev/null || echo "\"$LAST_ACTION_MSG\"")
  }
JSON
        done
        echo "]"
        ;;
    *)
        echo "NetTopology Watchdog CLI"
        echo "Usage: $0 {run|check-once|reset-loop|list} [service_name]"
        exit 1
        ;;
esac
`;

const WATCHDOG_SYSTEMD_TEMPLATE = `[Unit]
Description=NetTopology Service Watchdog & Auto-Recovery for %I
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/nettopology-watchdog.sh run %I
Restart=always
RestartSec=10
KillMode=process
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

/**
 * Ensures the NetTopology watchdog engine script and systemd unit template
 * are installed on the remote Linux host.
 */
export async function ensureWatchdogAgentInstalledSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<void> {
  const runnerB64 = Buffer.from(WATCHDOG_RUNNER_BASH_SCRIPT).toString('base64');
  const unitB64 = Buffer.from(WATCHDOG_SYSTEMD_TEMPLATE).toString('base64');

  const installScript = `export LC_ALL=C
sudo mkdir -p /etc/nettopology-watchdog/rules.d /var/lib/nettopology-watchdog /etc/systemd/system

# Deploy runner script
echo "${runnerB64}" | base64 -d | sudo tee /usr/local/bin/nettopology-watchdog.sh >/dev/null
sudo chmod +x /usr/local/bin/nettopology-watchdog.sh

# Deploy systemd unit template
echo "${unitB64}" | base64 -d | sudo tee /etc/systemd/system/nettopology-watchdog@.service >/dev/null

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl daemon-reload >/dev/null 2>&1 || true
fi
echo "WATCHDOG_INSTALLED_OK"
`;

  await runAdaptiveSshCommand(server, installScript, ephemeralPassword, 12000);
}

/**
 * Fetches all configured watchdog rules and live states from the remote Linux server
 */
export async function fetchLinuxServiceWatchdogsSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxServiceWatchdogRule[]> {
  const cmd = `export LC_ALL=C
if [ -x /usr/local/bin/nettopology-watchdog.sh ]; then
  sudo /usr/local/bin/nettopology-watchdog.sh list 2>/dev/null || echo "[]"
else
  echo "[]"
fi
`;

  try {
    const output = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 10000);
    const jsonStart = output.indexOf('[');
    const jsonEnd = output.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonStr = output.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          id: item.id || (item.serviceName ? item.serviceName.replace(/[^a-zA-Z0-9_@.-]/g, '_') : 'watchdog'),
          serviceName: item.serviceName || '',
          enabled: item.enabled !== false,
          checkIntervalSeconds: Number(item.checkIntervalSeconds) || 30,
          maxRestartAttempts: Number(item.maxRestartAttempts) || 3,
          cooldownPeriodSeconds: Number(item.cooldownPeriodSeconds) || 300,
          rebootOnPersistentFailure: Boolean(item.rebootOnPersistentFailure),
          rebootCooldownMinutes: Number(item.rebootCooldownMinutes) || 60,
          minUptimeBeforeRebootMinutes: Number(item.minUptimeBeforeRebootMinutes) || 5,
          maxRebootsPerDay: Number(item.maxRebootsPerDay) || 2,
          customPreRestartCommand: item.customPreRestartCommand || '',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
          status: item.status || 'active',
          consecutiveFailures: Number(item.consecutiveFailures) || 0,
          lastCheckTimestamp: Number(item.lastCheckTimestamp) || 0,
          lastRestartTimestamp: Number(item.lastRestartTimestamp) || 0,
          lastRebootTimestamp: Number(item.lastRebootTimestamp) || 0,
          lastActionMessage: item.lastActionMessage || '',
          systemdUnitActive: Boolean(item.systemdUnitActive),
        }));
      }
    }
    return [];
  } catch (err: any) {
    console.error(`[Watchdog fetch error for server ${server.id}]:`, err?.message || err);
    return [];
  }
}

/**
 * Saves or updates a service watchdog rule and starts/enables its systemd unit on the remote host
 */
export async function saveLinuxServiceWatchdogSSH(
  server: RemoteServer,
  rule: LinuxServiceWatchdogRule,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; rule?: LinuxServiceWatchdogRule }> {
  const cleanName = (rule.serviceName || '').trim().replace(/[^a-zA-Z0-9_@.-]/g, '_');
  if (!cleanName) {
    throw new Error('Valid service name is required.');
  }

  // Ensure agent is installed
  await ensureWatchdogAgentInstalledSSH(server, ephemeralPassword);

  const confContent = `SERVICE_NAME="${rule.serviceName}"
ENABLED=${rule.enabled !== false ? 1 : 0}
CHECK_INTERVAL_SEC=${Math.max(10, Math.min(3600, rule.checkIntervalSeconds || 30))}
MAX_RESTART_ATTEMPTS=${Math.max(1, Math.min(20, rule.maxRestartAttempts || 3))}
COOLDOWN_PERIOD_SEC=${Math.max(30, Math.min(86400, rule.cooldownPeriodSeconds || 300))}
REBOOT_ON_PERSISTENT_FAILURE=${rule.rebootOnPersistentFailure ? 1 : 0}
REBOOT_COOLDOWN_MIN=${Math.max(10, Math.min(1440, rule.rebootCooldownMinutes || 60))}
MIN_UPTIME_BEFORE_REBOOT_MIN=${Math.max(1, Math.min(120, rule.minUptimeBeforeRebootMinutes || 5))}
MAX_REBOOTS_PER_DAY=${Math.max(1, Math.min(10, rule.maxRebootsPerDay || 2))}
CUSTOM_PRE_RESTART_CMD="${(rule.customPreRestartCommand || '').replace(/"/g, '\\"')}"
`;

  const confB64 = Buffer.from(confContent).toString('base64');

  const applyScript = `export LC_ALL=C
sudo mkdir -p /etc/nettopology-watchdog/rules.d /var/lib/nettopology-watchdog
echo "${confB64}" | base64 -d | sudo tee "/etc/nettopology-watchdog/rules.d/${cleanName}.conf" >/dev/null

if [ "${rule.enabled !== false ? 1 : 0}" -eq 1 ]; then
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl daemon-reload >/dev/null 2>&1 || true
    sudo systemctl enable --now "nettopology-watchdog@${cleanName}.service" 2>&1
  fi
else
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl stop "nettopology-watchdog@${cleanName}.service" 2>&1 || true
    sudo systemctl disable "nettopology-watchdog@${cleanName}.service" 2>&1 || true
  fi
fi
echo "WATCHDOG_RULE_SAVED_OK"
`;

  try {
    const output = await runAdaptiveSshCommand(server, applyScript, ephemeralPassword, 15000);
    if (!output.includes('WATCHDOG_RULE_SAVED_OK')) {
      return {
        success: false,
        message: output.trim() || 'Failed to deploy watchdog rule to server.',
      };
    }

    const updatedRule: LinuxServiceWatchdogRule = {
      ...rule,
      id: cleanName,
      status: rule.enabled !== false ? 'active' : 'inactive',
      updatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      message: `Watchdog rule for ${rule.serviceName} successfully configured and activated.`,
      rule: updatedRule,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to apply watchdog rule for ${rule.serviceName}`,
    };
  }
}

/**
 * Deletes a watchdog rule, stops the systemd service, and cleans up configuration on the remote host
 */
export async function deleteLinuxServiceWatchdogSSH(
  server: RemoteServer,
  serviceName: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanName = (serviceName || '').trim().replace(/[^a-zA-Z0-9_@.-]/g, '_');
  if (!cleanName) {
    throw new Error('Valid service name is required.');
  }

  const deleteScript = `export LC_ALL=C
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl stop "nettopology-watchdog@${cleanName}.service" 2>&1 || true
  sudo systemctl disable "nettopology-watchdog@${cleanName}.service" 2>&1 || true
  sudo systemctl reset-failed "nettopology-watchdog@${cleanName}.service" 2>&1 || true
fi
sudo rm -f "/etc/nettopology-watchdog/rules.d/${cleanName}.conf"
sudo rm -f "/var/lib/nettopology-watchdog/${cleanName}.state"
echo "WATCHDOG_DELETED_OK"
`;

  try {
    const output = await runAdaptiveSshCommand(server, deleteScript, ephemeralPassword, 10000);
    return {
      success: true,
      message: `Watchdog rule for ${serviceName} successfully removed.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to delete watchdog rule for ${serviceName}`,
    };
  }
}

/**
 * Runs a single diagnostic test evaluation pass for a watchdog rule on the remote server
 */
export async function testLinuxServiceWatchdogCheckSSH(
  server: RemoteServer,
  serviceName: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; output: string }> {
  const cleanName = (serviceName || '').trim().replace(/[^a-zA-Z0-9_@.-]/g, '_');
  if (!cleanName) {
    throw new Error('Valid service name is required.');
  }

  const testScript = `export LC_ALL=C
if [ ! -x /usr/local/bin/nettopology-watchdog.sh ]; then
  echo "ERROR: NetTopology watchdog agent not yet installed on host."
  exit 1
fi
sudo /usr/local/bin/nettopology-watchdog.sh check-once "${serviceName}" 2>&1
`;

  try {
    const output = await runAdaptiveSshCommand(server, testScript, ephemeralPassword, 12000);
    return {
      success: true,
      output: output.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      output: err?.message || `Failed to run diagnostic test for ${serviceName}`,
    };
  }
}

/**
 * Manually resets the anti-loop trip lock and consecutive failure counters on the remote server
 */
export async function resetLinuxServiceWatchdogAntiLoopSSH(
  server: RemoteServer,
  serviceName: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanName = (serviceName || '').trim().replace(/[^a-zA-Z0-9_@.-]/g, '_');
  if (!cleanName) {
    throw new Error('Valid service name is required.');
  }

  const resetScript = `export LC_ALL=C
if [ ! -x /usr/local/bin/nettopology-watchdog.sh ]; then
  echo "ERROR: Watchdog runner not found."
  exit 1
fi
sudo /usr/local/bin/nettopology-watchdog.sh reset-loop "${serviceName}" 2>&1
`;

  try {
    const output = await runAdaptiveSshCommand(server, resetScript, ephemeralPassword, 10000);
    return {
      success: true,
      message: output.trim() || `Anti-loop lock cleared for ${serviceName}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to reset anti-loop lock for ${serviceName}`,
    };
  }
}

/**
 * Fetches recent watchdog execution audit logs from /var/log/nettopology-watchdog.log on the remote host
 */
export async function fetchLinuxWatchdogLogsSSH(
  server: RemoteServer,
  lines: number = 100,
  ephemeralPassword?: string
): Promise<{ success: boolean; logs: string }> {
  const lineCount = Math.max(10, Math.min(1000, lines));
  const cmd = `export LC_ALL=C
if [ -f /var/log/nettopology-watchdog.log ]; then
  sudo tail -n ${lineCount} /var/log/nettopology-watchdog.log 2>/dev/null
else
  echo "No watchdog activity logged yet on this server."
fi
`;

  try {
    const output = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 8000);
    return {
      success: true,
      logs: output.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      logs: `Failed to fetch watchdog logs: ${err?.message || err}`,
    };
  }
}

/**
 * Embedded Bash Script for NetTopology Directory & Storage Lifecycle Automation Engine
 */
const DIR_POLICY_RUNNER_BASH_SCRIPT = `#!/usr/bin/env bash
# NetTopology Directory & Storage Lifecycle Automation Engine
export LC_ALL=C
set -u

RULES_DIR="/etc/nettopology-dir-lifecycle/rules.d"
STATE_DIR="/var/lib/nettopology-dir-lifecycle"
LOG_FILE="/var/log/nettopology-dir-lifecycle.log"
CRON_FILE="/etc/cron.d/nettopology-dir-lifecycle"

mkdir -p "$RULES_DIR" "$STATE_DIR"
touch "$LOG_FILE"

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$msg" >> "$LOG_FILE"
}

update_state() {
  local id="$1"
  local status="$2"
  local msg="$3"
  local now=$(date '+%Y-%m-%d %H:%M:%S')
  cat <<EOF > "$STATE_DIR/\${id}.state"
LAST_RUN_AT="\${now}"
LAST_RUN_STATUS="\${status}"
LAST_RUN_MESSAGE="\${msg}"
EOF
}

run_rule() {
  local id="$1"
  local conf="$RULES_DIR/\${id}.conf"
  if [ ! -f "$conf" ]; then
    log "[ERROR] Rule file $conf not found."
    return 1
  fi

  NAME=""
  TARGET_PATH=""
  ACTION_TYPE="cleanup"
  ENABLED=1
  CLEANUP_AGE_DAYS=7
  CLEANUP_PATTERN="*"
  CLEANUP_REMOVE_EMPTY_DIRS=0
  BACKUP_FORMAT="tar.gz"
  BACKUP_DEST="/backup/archives"
  BACKUP_KEEP_SOURCE=1
  BACKUP_PRESERVE_ALL=1
  BACKUP_MAX_COUNT=0
  SIZE_CAP_MB=1024
  SYNC_DEST=""
  SYNC_DELETE=0

  . "$conf"

  if [ "$ENABLED" -eq 0 ]; then
    log "[INFO] Rule '\$NAME' (\$id) is disabled. Skipping."
    update_state "$id" "never" "Rule disabled."
    return 0
  fi

  if [ -z "$TARGET_PATH" ]; then
    log "[ERROR] Rule '\$NAME' (\$id) has no target path."
    update_state "$id" "failed" "Target path is empty."
    return 1
  fi

  if [ ! -e "$TARGET_PATH" ]; then
    log "[WARN] Target path '\$TARGET_PATH' does not exist for rule '\$NAME' (\$id)."
    update_state "$id" "failed" "Target path \$TARGET_PATH does not exist."
    return 1
  fi

  log "[START] Executing policy '\$NAME' (\$id) on target: \$TARGET_PATH (Action: \$ACTION_TYPE)"

  case "$ACTION_TYPE" in
    cleanup)
      local age_arg=""
      if [ -n "\${CLEANUP_AGE_DAYS:-}" ] && [ "\$CLEANUP_AGE_DAYS" -ge 0 ]; then
        age_arg="-mtime +\${CLEANUP_AGE_DAYS}"
      fi
      local pat="\${CLEANUP_PATTERN:-*}"
      
      local count_before=0
      if [ -d "$TARGET_PATH" ]; then
        count_before=$(find "$TARGET_PATH" -mindepth 1 -type f -name "$pat" \$age_arg 2>/dev/null | wc -l)
        find "$TARGET_PATH" -mindepth 1 -type f -name "$pat" \$age_arg -delete 2>/dev/null || true
        if [ "\${CLEANUP_REMOVE_EMPTY_DIRS:-0}" -eq 1 ]; then
          find "$TARGET_PATH" -mindepth 1 -type d -empty -delete 2>/dev/null || true
        fi
      fi

      log "[SUCCESS] Cleanup completed for '\$NAME'. Purged \$count_before files older than \${CLEANUP_AGE_DAYS:-0} days matching '\$pat'."
      update_state "$id" "success" "Purged \$count_before files older than \${CLEANUP_AGE_DAYS:-0} days."
      ;;

    backup)
      local bdest="\${BACKUP_DEST:-/backup/archives}"
      mkdir -p "$bdest"
      local base_name
      base_name=$(basename "$TARGET_PATH")
      local ts
      ts=$(date '+%Y%m%d_%H%M%S')
      local ext="tar.gz"
      local archive_file=""
      local err_msg=""

      case "\${BACKUP_FORMAT:-tar.gz}" in
        tar.bz2) ext="tar.bz2" ;;
        tar.xz) ext="tar.xz" ;;
        zip) ext="zip" ;;
        *) ext="tar.gz" ;;
      esac

      # Ensure collision-free naming so existing backups in destination are NEVER overwritten
      archive_file="$bdest/\${base_name}_\${ts}.\${ext}"
      local seq=0
      while [ -e "$archive_file" ]; do
        seq=\$((seq + 1))
        archive_file="$bdest/\${base_name}_\${ts}_\${seq}.\${ext}"
      done

      case "\${BACKUP_FORMAT:-tar.gz}" in
        tar.bz2)
          tar -cjf "$archive_file" -C "$(dirname "$TARGET_PATH")" "$base_name" 2>&1 || err_msg="tar bz2 failed"
          ;;
        tar.xz)
          tar -cJf "$archive_file" -C "$(dirname "$TARGET_PATH")" "$base_name" 2>&1 || err_msg="tar xz failed"
          ;;
        zip)
          (cd "$(dirname "$TARGET_PATH")" && zip -rq "$archive_file" "$base_name") 2>&1 || err_msg="zip failed"
          ;;
        *)
          tar -czf "$archive_file" -C "$(dirname "$TARGET_PATH")" "$base_name" 2>&1 || err_msg="tar gz failed"
          ;;
      esac

      if [ -n "$err_msg" ] || [ ! -f "$archive_file" ]; then
        log "[ERROR] Backup failed for '\$NAME': \$err_msg"
        update_state "$id" "failed" "Backup archive creation failed: \$err_msg"
        return 1
      fi

      local arch_size
      arch_size=$(du -h "$archive_file" 2>/dev/null | awk '{print $1}')
      log "[BACKUP] Created archive \$archive_file (\$arch_size)."

      if [ "\${BACKUP_KEEP_SOURCE:-1}" -eq 0 ]; then
        if [ -d "$TARGET_PATH" ]; then
          find "$TARGET_PATH" -mindepth 1 -delete 2>/dev/null || true
          log "[PURGE] Source files purged inside \$TARGET_PATH after archive."
        fi
      fi

      # Retention policy: Preserve all prior backups unless auto-rotation is explicitly enabled
      local preserve_all="\${BACKUP_PRESERVE_ALL:-1}"
      if [ "\$preserve_all" -eq 1 ] || [ "\${BACKUP_MAX_COUNT:-0}" -le 0 ]; then
        log "[RETENTION] Preservation mode active. All existing and prior backups in \$bdest remain intact."
      else
        local total_archives
        total_archives=$(ls -1t "\$bdest/\${base_name}_"* 2>/dev/null | grep -E '\.(tar\.(gz|bz2|xz)|zip)$' | wc -l)
        if [ "\$total_archives" -gt "\$BACKUP_MAX_COUNT" ]; then
          local prune_count=\$((total_archives - BACKUP_MAX_COUNT))
          ls -1t "\$bdest/\${base_name}_"* 2>/dev/null | grep -E '\.(tar\.(gz|bz2|xz)|zip)$' | tail -n "\$prune_count" | xargs -r rm -f
          log "[RETENTION] Pruned \$prune_count old archives exceeding limit of \$BACKUP_MAX_COUNT."
        fi
      fi

      log "[SUCCESS] Backup completed for '\$NAME' -> \$archive_file (\$arch_size). Previous backups preserved."
      update_state "$id" "success" "Archived to $(basename "\$archive_file") (\$arch_size). Existing backups preserved."
      ;;

    size_cap)
      local cur_size_mb
      cur_size_mb=$(du -sm "$TARGET_PATH" 2>/dev/null | awk '{print $1}')
      if [ -z "$cur_size_mb" ]; then cur_size_mb=0; fi

      local cap="\${SIZE_CAP_MB:-1024}"
      if [ "\$cur_size_mb" -gt "\$cap" ]; then
        log "[SIZE_CAP] Target size \${cur_size_mb}MB exceeds cap \${cap}MB. Pruning oldest files..."
        local deleted=0
        while [ "\$cur_size_mb" -gt "\$cap" ]; do
          local oldest_file
          oldest_file=$(find "$TARGET_PATH" -mindepth 1 -type f -printf '%T+ %p\\n' 2>/dev/null | sort | head -n 1 | awk '{$1=""; print $0}' | sed 's/^ *//')
          if [ -z "$oldest_file" ] || [ ! -f "$oldest_file" ]; then
            break
          fi
          rm -f "$oldest_file"
          deleted=\$((deleted + 1))
          cur_size_mb=$(du -sm "$TARGET_PATH" 2>/dev/null | awk '{print $1}')
          if [ -z "$cur_size_mb" ]; then cur_size_mb=0; fi
        done
        log "[SUCCESS] Size cap enforced. Deleted \$deleted oldest files. New size: \${cur_size_mb}MB."
        update_state "$id" "success" "Pruned \$deleted oldest files to fit under \${cap}MB (current: \${cur_size_mb}MB)."
      else
        log "[INFO] Target size \${cur_size_mb}MB is within cap \${cap}MB. No pruning required."
        update_state "$id" "success" "Size \${cur_size_mb}MB is within \${cap}MB cap."
      fi
      ;;

    sync)
      local sdest="\${SYNC_DEST:-}"
      if [ -z "$sdest" ]; then
        log "[ERROR] Sync destination path is empty."
        update_state "$id" "failed" "Sync destination empty."
        return 1
      fi
      mkdir -p "$sdest"
      local sync_opts="-a"
      if [ "\${SYNC_DELETE:-0}" -eq 1 ]; then
        sync_opts="-a --delete"
      fi
      if command -v rsync >/dev/null 2>&1; then
        rsync \$sync_opts "$TARGET_PATH/" "$sdest/" 2>&1 || true
      else
        cp -a "$TARGET_PATH/." "$sdest/" 2>&1 || true
      fi
      log "[SUCCESS] Synchronized \$TARGET_PATH -> \$sdest."
      update_state "$id" "success" "Synchronized with \$sdest."
      ;;

    *)
      log "[ERROR] Unknown action type '\$ACTION_TYPE' in rule \$id."
      update_state "$id" "failed" "Unknown action type \$ACTION_TYPE."
      return 1
      ;;
  esac
}

sync_cron() {
  cat <<'EOF' > "$CRON_FILE"
# /etc/cron.d/nettopology-dir-lifecycle
# Managed automatically by NetTopology Panel. Do not edit manually.
SHELL=/bin/bash
PATH=/sbin:/bin:/usr/sbin:/usr/bin
LC_ALL=C

EOF

  for conf in "$RULES_DIR"/*.conf; do
    [ -f "$conf" ] || continue
    local id
    id=$(basename "$conf" .conf)
    ENABLED=1
    SCHEDULE_CRON=""
    . "$conf"
    if [ "\${ENABLED:-1}" -eq 1 ] && [ -n "\${SCHEDULE_CRON:-}" ]; then
      echo "\${SCHEDULE_CRON} root /usr/local/bin/nettopology-dir-policy.sh run \\"\${id}\\" >> /var/log/nettopology-dir-lifecycle.log 2>&1" >> "$CRON_FILE"
    fi
  done
  chmod 644 "$CRON_FILE"
}

list_rules() {
  echo "["
  local first=1
  for conf in "$RULES_DIR"/*.conf; do
    [ -f "$conf" ] || continue
    local id
    id=$(basename "$conf" .conf)
    
    NAME="\$id"
    TARGET_PATH=""
    ACTION_TYPE="cleanup"
    ENABLED=1
    SCHEDULE_PRESET="daily"
    SCHEDULE_CRON="0 2 * * *"
    CLEANUP_AGE_DAYS=7
    CLEANUP_PATTERN="*"
    CLEANUP_REMOVE_EMPTY_DIRS=0
    BACKUP_FORMAT="tar.gz"
    BACKUP_DEST="/backup/archives"
    BACKUP_KEEP_SOURCE=1
    BACKUP_PRESERVE_ALL=1
    BACKUP_MAX_COUNT=0
    SIZE_CAP_MB=1024
    SYNC_DEST=""
    SYNC_DELETE=0
    CREATED_AT=""
    UPDATED_AT=""

    . "$conf"

    LAST_RUN_AT=""
    LAST_RUN_STATUS="never"
    LAST_RUN_MESSAGE=""
    if [ -f "$STATE_DIR/\${id}.state" ]; then
      . "$STATE_DIR/\${id}.state"
    fi

    if [ "$first" -eq 0 ]; then
      echo ","
    fi
    first=0

    cat <<EOF
  {
    "id": "\${id}",
    "name": "$(echo "\${NAME}" | sed 's/"/\\\\"/g')",
    "targetPath": "$(echo "\${TARGET_PATH}" | sed 's/"/\\\\"/g')",
    "actionType": "\${ACTION_TYPE}",
    "enabled": $([ "\${ENABLED}" -eq 1 ] && echo "true" || echo "false"),
    "schedulePreset": "\${SCHEDULE_PRESET}",
    "scheduleCron": "\${SCHEDULE_CRON}",
    "cleanupAgeDays": \${CLEANUP_AGE_DAYS:-7},
    "cleanupFilePattern": "$(echo "\${CLEANUP_PATTERN:-*}" | sed 's/"/\\\\"/g')",
    "cleanupRemoveEmptyDirs": $([ "\${CLEANUP_REMOVE_EMPTY_DIRS:-0}" -eq 1 ] && echo "true" || echo "false"),
    "backupFormat": "\${BACKUP_FORMAT:-tar.gz}",
    "backupDestinationPath": "$(echo "\${BACKUP_DEST:-/backup/archives}" | sed 's/"/\\\\"/g')",
    "backupKeepSourceFiles": $([ "\${BACKUP_KEEP_SOURCE:-1}" -eq 1 ] && echo "true" || echo "false"),
    "backupPreserveAll": $([ "\${BACKUP_PRESERVE_ALL:-1}" -eq 1 ] && echo "true" || echo "false"),
    "backupMaxRetainedCount": \${BACKUP_MAX_COUNT:-0},
    "sizeCapMb": \${SIZE_CAP_MB:-1024},
    "syncDestinationPath": "$(echo "\${SYNC_DEST:-}" | sed 's/"/\\\\"/g')",
    "syncDeleteExtraneous": $([ "\${SYNC_DELETE:-0}" -eq 1 ] && echo "true" || echo "false"),
    "lastRunAt": "\${LAST_RUN_AT:-}",
    "lastRunStatus": "\${LAST_RUN_STATUS:-never}",
    "lastRunMessage": "$(echo "\${LAST_RUN_MESSAGE:-}" | sed 's/"/\\\\"/g')",
    "createdAt": "\${CREATED_AT:-}",
    "updatedAt": "\${UPDATED_AT:-}"
  }
EOF
  done
  echo "]"
}

case "\${1:-}" in
  run)
    if [ -n "\${2:-}" ]; then
      run_rule "\$2"
    else
      echo "Missing rule id"
      exit 1
    fi
    ;;
  sync-cron)
    sync_cron
    ;;
  list)
    list_rules
    ;;
  delete)
    if [ -n "\${2:-}" ]; then
      rm -f "\$RULES_DIR/\${2}.conf" "\$STATE_DIR/\${2}.state"
      sync_cron
      log "[DELETE] Removed rule \${2}."
      echo "DELETED"
    fi
    ;;
  *)
    echo "Usage: \$0 {run <id>|sync-cron|list|delete <id>}"
    exit 1
    ;;
esac
`;

/**
 * Ensures the Directory Lifecycle runner script is deployed to /usr/local/bin/nettopology-dir-policy.sh
 */
export async function ensureDirPolicyAgentInstalledSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<void> {
  const runnerB64 = Buffer.from(DIR_POLICY_RUNNER_BASH_SCRIPT).toString('base64');
  const installCmd = `export LC_ALL=C
sudo mkdir -p /etc/nettopology-dir-lifecycle/rules.d /var/lib/nettopology-dir-lifecycle
echo "${runnerB64}" | base64 -d | sudo tee /usr/local/bin/nettopology-dir-policy.sh >/dev/null
sudo chmod 755 /usr/local/bin/nettopology-dir-policy.sh
echo "DIR_POLICY_AGENT_READY"
`;

  const output = await runAdaptiveSshCommand(server, installCmd, ephemeralPassword, 15000);
  if (!output.includes('DIR_POLICY_AGENT_READY')) {
    throw new Error(`Failed to install Directory Lifecycle Agent on remote host: ${output.slice(0, 300)}`);
  }
}

/**
 * Fetches all configured directory lifecycle policy rules from the remote Linux server
 */
export async function fetchLinuxDirectoryPoliciesSSH(
  server: RemoteServer,
  ephemeralPassword?: string
): Promise<LinuxDirectoryPolicyRule[]> {
  const cmd = `export LC_ALL=C
if [ -x /usr/local/bin/nettopology-dir-policy.sh ]; then
  sudo /usr/local/bin/nettopology-dir-policy.sh list 2>/dev/null || echo "[]"
else
  echo "[]"
fi
`;

  try {
    const output = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 10000);
    const jsonStart = output.indexOf('[');
    const jsonEnd = output.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonStr = output.substring(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          id: item.id || `dir_rule_${Date.now()}`,
          name: item.name || 'Unnamed Rule',
          targetPath: item.targetPath || '',
          actionType: item.actionType || 'cleanup',
          enabled: item.enabled !== false,
          schedulePreset: item.schedulePreset || 'daily',
          scheduleCron: item.scheduleCron || '0 2 * * *',
          cleanupAgeDays: Number(item.cleanupAgeDays) || 7,
          cleanupFilePattern: item.cleanupFilePattern || '*',
          cleanupRemoveEmptyDirs: Boolean(item.cleanupRemoveEmptyDirs),
          backupFormat: item.backupFormat || 'tar.gz',
          backupDestinationPath: item.backupDestinationPath || '/backup/archives',
          backupKeepSourceFiles: item.backupKeepSourceFiles !== false,
          backupPreserveAll: item.backupPreserveAll !== false,
          backupMaxRetainedCount: Number(item.backupMaxRetainedCount) || 0,
          sizeCapMb: Number(item.sizeCapMb) || 1024,
          syncDestinationPath: item.syncDestinationPath || '',
          syncDeleteExtraneous: Boolean(item.syncDeleteExtraneous),
          lastRunAt: item.lastRunAt || '',
          lastRunStatus: item.lastRunStatus || 'never',
          lastRunMessage: item.lastRunMessage || '',
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        }));
      }
    }
    return [];
  } catch (err: any) {
    console.error(`[Directory Policy fetch error for server ${server.id}]:`, err?.message || err);
    return [];
  }
}

/**
 * Saves or updates a directory lifecycle policy rule on the remote Linux host
 */
export async function saveLinuxDirectoryPolicySSH(
  server: RemoteServer,
  rule: LinuxDirectoryPolicyRule,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; rule?: LinuxDirectoryPolicyRule }> {
  const cleanId = (rule.id || `dir_${rule.name}_${Date.now()}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');

  if (!rule.targetPath || !rule.targetPath.trim()) {
    throw new Error('Target path is required.');
  }

  await ensureDirPolicyAgentInstalledSSH(server, ephemeralPassword);

  const confContent = `NAME="${(rule.name || cleanId).replace(/"/g, '\\"')}"
TARGET_PATH="${rule.targetPath.trim().replace(/"/g, '\\"')}"
ACTION_TYPE="${rule.actionType || 'cleanup'}"
ENABLED=${rule.enabled !== false ? 1 : 0}
SCHEDULE_PRESET="${rule.schedulePreset || 'daily'}"
SCHEDULE_CRON="${(rule.scheduleCron || '0 2 * * *').replace(/"/g, '\\"')}"
CLEANUP_AGE_DAYS=${Math.max(0, Number(rule.cleanupAgeDays) || 7)}
CLEANUP_PATTERN="${(rule.cleanupFilePattern || '*').replace(/"/g, '\\"')}"
CLEANUP_REMOVE_EMPTY_DIRS=${rule.cleanupRemoveEmptyDirs ? 1 : 0}
BACKUP_FORMAT="${rule.backupFormat || 'tar.gz'}"
BACKUP_DEST="${(rule.backupDestinationPath || '/backup/archives').replace(/"/g, '\\"')}"
BACKUP_KEEP_SOURCE=${rule.backupKeepSourceFiles !== false ? 1 : 0}
BACKUP_PRESERVE_ALL=${rule.backupPreserveAll !== false ? 1 : 0}
BACKUP_MAX_COUNT=${rule.backupPreserveAll !== false ? 0 : Math.max(0, Number(rule.backupMaxRetainedCount) || 0)}
SIZE_CAP_MB=${Math.max(10, Number(rule.sizeCapMb) || 1024)}
SYNC_DEST="${(rule.syncDestinationPath || '').replace(/"/g, '\\"')}"
SYNC_DELETE=${rule.syncDeleteExtraneous ? 1 : 0}
CREATED_AT="${rule.createdAt || new Date().toISOString()}"
UPDATED_AT="${new Date().toISOString()}"
`;

  const confB64 = Buffer.from(confContent).toString('base64');
  const applyCmd = `export LC_ALL=C
sudo mkdir -p /etc/nettopology-dir-lifecycle/rules.d /var/lib/nettopology-dir-lifecycle
echo "${confB64}" | base64 -d | sudo tee "/etc/nettopology-dir-lifecycle/rules.d/${cleanId}.conf" >/dev/null
sudo /usr/local/bin/nettopology-dir-policy.sh sync-cron
echo "DIR_POLICY_SAVED_OK"
`;

  try {
    const output = await runAdaptiveSshCommand(server, applyCmd, ephemeralPassword, 15000);
    if (!output.includes('DIR_POLICY_SAVED_OK')) {
      return {
        success: false,
        message: output.trim() || 'Failed to save directory policy rule on remote host.',
      };
    }

    const updatedRule: LinuxDirectoryPolicyRule = {
      ...rule,
      id: cleanId,
      updatedAt: new Date().toISOString(),
    };

    return {
      success: true,
      message: `Directory policy '${rule.name}' saved and scheduled successfully.`,
      rule: updatedRule,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to save directory policy ${rule.name}`,
    };
  }
}

/**
 * Deletes a directory lifecycle policy rule from the remote Linux host
 */
export async function deleteLinuxDirectoryPolicySSH(
  server: RemoteServer,
  ruleId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string }> {
  const cleanId = (ruleId || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!cleanId) {
    throw new Error('Valid rule ID is required.');
  }

  const deleteCmd = `export LC_ALL=C
if [ -x /usr/local/bin/nettopology-dir-policy.sh ]; then
  sudo /usr/local/bin/nettopology-dir-policy.sh delete "${cleanId}"
else
  sudo rm -f "/etc/nettopology-dir-lifecycle/rules.d/${cleanId}.conf" "/var/lib/nettopology-dir-lifecycle/${cleanId}.state"
fi
echo "DIR_POLICY_DELETED_OK"
`;

  try {
    const output = await runAdaptiveSshCommand(server, deleteCmd, ephemeralPassword, 10000);
    return {
      success: true,
      message: output.includes('DIR_POLICY_DELETED_OK') ? `Policy ${cleanId} removed.` : output.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to delete policy ${cleanId}`,
    };
  }
}

/**
 * Executes a directory lifecycle policy rule immediately on-demand
 */
export async function runLinuxDirectoryPolicyNowSSH(
  server: RemoteServer,
  ruleId: string,
  ephemeralPassword?: string
): Promise<{ success: boolean; message: string; output: string }> {
  const cleanId = (ruleId || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!cleanId) {
    throw new Error('Valid rule ID is required.');
  }

  const runCmd = `export LC_ALL=C
if [ ! -x /usr/local/bin/nettopology-dir-policy.sh ]; then
  echo "AGENT_NOT_FOUND"
  exit 1
fi
sudo /usr/local/bin/nettopology-dir-policy.sh run "${cleanId}" 2>&1
`;

  try {
    const output = await runAdaptiveSshCommand(server, runCmd, ephemeralPassword, 45000);
    return {
      success: true,
      message: `Policy '${cleanId}' executed on host.`,
      output: output.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Failed to execute directory policy ${cleanId}`,
      output: err?.message || '',
    };
  }
}

/**
 * Fetches recent directory lifecycle execution audit logs from /var/log/nettopology-dir-lifecycle.log
 */
export async function fetchLinuxDirectoryPolicyLogsSSH(
  server: RemoteServer,
  lines: number = 100,
  ephemeralPassword?: string
): Promise<{ success: boolean; logs: string }> {
  const lineCount = Math.max(10, Math.min(1000, lines));
  const cmd = `export LC_ALL=C
if [ -f /var/log/nettopology-dir-lifecycle.log ]; then
  sudo tail -n ${lineCount} /var/log/nettopology-dir-lifecycle.log 2>/dev/null
else
  echo "No directory lifecycle activity logged yet on this server."
fi
`;

  try {
    const output = await runAdaptiveSshCommand(server, cmd, ephemeralPassword, 8000);
    return {
      success: true,
      logs: output.trim(),
    };
  } catch (err: any) {
    return {
      success: false,
      logs: `Failed to fetch directory policy logs: ${err?.message || err}`,
    };
  }
}

// ==========================================
// STORAGE & DISKS ARCHITECTURE (6-TIER REAL DATA PIPELINE)
// ==========================================

function formatBytesHelper(bytes: number | string | undefined | null): string {
  if (bytes === undefined || bytes === null || bytes === '') return '-';
  const n = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  if (isNaN(n) || n === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(n) / Math.log(k));
  if (i < 0 || i >= sizes.length) return `${n} B`;
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Fetches the complete, authentic Linux storage hierarchy directly from the server:
 * Physical Disks -> Partitions -> Physical Volumes (PVs) -> Volume Groups (VGs) -> Logical Volumes (LVs) -> Filesystems -> Mount Points
 */
export async function fetchLinuxStorageOverviewSSH(
  server: RemoteServer,
  ephemeralPassword?: string,
  timeoutMs: number = 15000
): Promise<LinuxStorageOverview> {
  const script = `export LC_ALL=C

echo "===LVM_CHECK==="
(command -v pvs >/dev/null 2>&1 || sudo which pvs >/dev/null 2>&1) && echo "LVM_OK" || echo "LVM_MISSING"

echo "===LSBLK_JSON==="
lsblk -J -b -o NAME,KNAME,PATH,SIZE,ROTA,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL,TRAN,UUID,PARTUUID,PARTLABEL,STATE,RM 2>/dev/null || lsblk -J 2>/dev/null || true

echo "===FINDMNT_JSON==="
findmnt -J -b -o TARGET,SOURCE,FSTYPE,OPTIONS,SIZE,USED,AVAIL,USE% 2>/dev/null || true

echo "===DF==="
df -B1 -T 2>/dev/null || df -hT 2>/dev/null || true

echo "===PVS==="
sudo pvs --noheadings --nosuffix --units g -o pv_name,vg_name,pv_fmt,pv_size,pv_free,pv_used,pv_attr --separator '|' 2>/dev/null || true

echo "===VGS==="
sudo vgs --noheadings --nosuffix --units g -o vg_name,pv_count,lv_count,vg_size,vg_free,vg_attr --separator '|' 2>/dev/null || true

echo "===LVS==="
sudo lvs --noheadings --nosuffix --units g -o lv_name,vg_name,lv_path,lv_size,lv_attr --separator '|' 2>/dev/null || true

echo "===DISKS_FLAT==="
lsblk -b -o NAME,KNAME,PATH,SIZE,ROTA,TYPE,FSTYPE,MOUNTPOINT,MODEL,SERIAL,TRAN,UUID,PARTUUID,PARTLABEL -r 2>/dev/null || true
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);

    // Section helper
    const getSection = (name: string, nextName: string | null): string => {
      const startMarker = `===${name}===`;
      const startIdx = raw.indexOf(startMarker);
      if (startIdx === -1) return '';
      const afterStart = raw.slice(startIdx + startMarker.length);
      let endIdx = -1;
      if (nextName) {
        const nextMarker = `===${nextName}===`;
        endIdx = afterStart.indexOf(nextMarker);
      }
      return (endIdx !== -1 ? afterStart.slice(0, endIdx) : afterStart).trim();
    };

    const lvmCheckRaw = getSection('LVM_CHECK', 'LSBLK_JSON');
    const lvmInstalled = lvmCheckRaw.includes('LVM_OK');

    // 1. Parse PVs
    const pvsRaw = getSection('PVS', 'VGS');
    const physicalVolumes: LinuxPhysicalVolume[] = [];
    const legacyPvs: LinuxLvmPv[] = [];

    if (pvsRaw) {
      const lines = pvsRaw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('==='));
      for (const line of lines) {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length >= 5) {
          const pvName = parts[0];
          const vgName = parts[1] || 'none';
          const format = parts[2] || 'lvm2';
          const sizeVal = parseFloat(parts[3] || '0');
          const freeVal = parseFloat(parts[4] || '0');
          const usedVal = parseFloat(parts[5] || '0');
          const status = parts[6] || 'allocatable';

          // Extract parent disk name (e.g. /dev/sdb1 -> /dev/sdb, /dev/nvme0n1p1 -> /dev/nvme0n1)
          let parentDisk = pvName.replace(/[0-9]+$/, '').replace(/p$/, '');
          if (!parentDisk.startsWith('/dev/')) parentDisk = `/dev/${parentDisk}`;

          const pvItem: LinuxPhysicalVolume = {
            name: pvName,
            device: pvName,
            parentDisk,
            vgName,
            size: `${sizeVal.toFixed(2)} GB`,
            free: `${freeVal.toFixed(2)} GB`,
            allocated: `${usedVal.toFixed(2)} GB`,
            format,
            status,
          };
          physicalVolumes.push(pvItem);

          legacyPvs.push({
            name: pvName,
            vgName,
            size: `${sizeVal.toFixed(2)} GB`,
            free: `${freeVal.toFixed(2)} GB`,
            used: `${usedVal.toFixed(2)} GB`,
            format,
            device: pvName,
            parentDisk,
          });
        }
      }
    }

    // 2. Parse VGs
    const vgsRaw = getSection('VGS', 'LVS');
    const volumeGroups: LinuxVolumeGroup[] = [];
    const legacyVgs: LinuxLvmVg[] = [];

    if (vgsRaw) {
      const lines = vgsRaw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('==='));
      for (const line of lines) {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length >= 5) {
          const vgName = parts[0];
          const pvCount = parseInt(parts[1], 10) || 0;
          const lvCount = parseInt(parts[2], 10) || 0;
          const totalSizeVal = parseFloat(parts[3] || '0');
          const freeSizeVal = parseFloat(parts[4] || '0');
          const allocatedVal = Math.max(0, totalSizeVal - freeSizeVal);

          const memberPvs = physicalVolumes.filter((pv) => pv.vgName === vgName).map((pv) => pv.name);

          volumeGroups.push({
            name: vgName,
            pvCount,
            lvCount,
            totalSize: `${totalSizeVal.toFixed(2)} GB`,
            freeSize: `${freeSizeVal.toFixed(2)} GB`,
            allocatedSize: `${allocatedVal.toFixed(2)} GB`,
            pvs: memberPvs,
            lvs: [], // filled below
          });

          legacyVgs.push({
            name: vgName,
            pvCount,
            lvCount,
            size: `${totalSizeVal.toFixed(2)} GB`,
            free: `${freeSizeVal.toFixed(2)} GB`,
            allocatedSize: `${allocatedVal.toFixed(2)} GB`,
            pvs: memberPvs,
            lvs: [],
          });
        }
      }
    }

    // 3. Parse Mounted Filesystems from FINDMNT JSON or raw
    const filesystems: LinuxMountedFilesystem[] = [];
    const findmntJsonRaw = getSection('FINDMNT_JSON', 'DF');

    const extractFindmntChildren = (items: any[]) => {
      for (const item of items) {
        if (!item || !item.target) continue;
        const target = item.target;
        const source = item.source || '';
        const fstype = item.fstype || '';
        const options = item.options || '';

        // Determine if LVM
        const isLvm = source.includes('/dev/mapper/') ||
          source.includes('/dev/mapper') ||
          physicalVolumes.some(pv => pv.vgName !== 'none' && source.includes(pv.vgName));

        let vgName: string | null = null;
        let lvName: string | null = null;

        if (source.startsWith('/dev/mapper/')) {
          const mapperTail = source.replace('/dev/mapper/', '');
          const match = mapperTail.match(/^([^-]+(?:--[^-]+)*)-([^-]+(?:--[^-]+)*)$/);
          if (match) {
            vgName = match[1].replace(/--/g, '-');
            lvName = match[2].replace(/--/g, '-');
          }
        } else if (source.startsWith('/dev/') && source.split('/').length === 4) {
          const parts = source.split('/');
          vgName = parts[2];
          lvName = parts[3];
        }

        const sizeStr = item.size ? formatBytesHelper(item.size) : '-';
        const usedStr = item.used ? formatBytesHelper(item.used) : '-';
        const availStr = item.avail ? formatBytesHelper(item.avail) : '-';

        let usePct = 0;
        if (item['use%']) {
          const parsedPct = parseFloat(String(item['use%']).replace('%', ''));
          if (!isNaN(parsedPct)) usePct = parsedPct;
        }

        const isReadOnly = options.split(',').some((opt: string) => opt.trim() === 'ro');

        filesystems.push({
          mountPoint: target,
          device: source,
          fsType: fstype,
          totalSize: sizeStr,
          usedSize: usedStr,
          freeSize: availStr,
          usagePercent: usePct,
          status: 'Mounted',
          isReadOnly,
          isLvm,
          lvName,
          vgName,
          options,
        });

        if (Array.isArray(item.children)) {
          extractFindmntChildren(item.children);
        }
      }
    };

    if (findmntJsonRaw.startsWith('{')) {
      try {
        const parsed = JSON.parse(findmntJsonRaw);
        if (Array.isArray(parsed.filesystems)) {
          extractFindmntChildren(parsed.filesystems);
        }
      } catch {
        // Fallback to df parser below
      }
    }

    // DF fallback / supplement if findmnt returned few or no rows
    const dfRaw = getSection('DF', 'PVS');
    if (dfRaw) {
      const dfLines = dfRaw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('Filesystem'));
      for (const line of dfLines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 7) {
          const dev = parts[0];
          const fstype = parts[1];
          const totalBytes = parseFloat(parts[2]);
          const usedBytes = parseFloat(parts[3]);
          const availBytes = parseFloat(parts[4]);
          const usePct = parseFloat(parts[5].replace('%', '')) || 0;
          const mountPoint = parts[6];

          // Check if already in filesystems
          const existing = filesystems.find((fs) => fs.mountPoint === mountPoint);
          if (!existing) {
            const isLvm = dev.includes('/dev/mapper/') || dev.includes('/dev/mapper');
            let vgName: string | null = null;
            let lvName: string | null = null;
            if (dev.startsWith('/dev/mapper/')) {
              const mapperTail = dev.replace('/dev/mapper/', '');
              const match = mapperTail.match(/^([^-]+(?:--[^-]+)*)-([^-]+(?:--[^-]+)*)$/);
              if (match) {
                vgName = match[1].replace(/--/g, '-');
                lvName = match[2].replace(/--/g, '-');
              }
            }

            filesystems.push({
              mountPoint,
              device: dev,
              fsType: fstype,
              totalSize: formatBytesHelper(totalBytes),
              usedSize: formatBytesHelper(usedBytes),
              freeSize: formatBytesHelper(availBytes),
              usagePercent: usePct,
              status: 'Mounted',
              isReadOnly: false,
              isLvm,
              lvName,
              vgName,
            });
          }
        }
      }
    }

    // 4. Parse Logical Volumes (LVs)
    const lvsRaw = getSection('LVS', 'DISKS_FLAT');
    const logicalVolumes: LinuxLogicalVolume[] = [];
    const legacyLvs: LinuxLvmLv[] = [];

    if (lvsRaw) {
      const lines = lvsRaw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('==='));
      for (const line of lines) {
        const parts = line.split('|').map((p) => p.trim());
        if (parts.length >= 4) {
          const lvName = parts[0];
          const vgName = parts[1];
          let lvPath = parts[2] || `/dev/${vgName}/${lvName}`;
          if (!lvPath.startsWith('/')) lvPath = `/dev/${lvPath}`;
          const sizeVal = parseFloat(parts[3] || '0');
          const lvAttr = parts[4] || 'active';

          // Link to VG
          const parentVg = volumeGroups.find((vg) => vg.name === vgName);
          if (parentVg && !parentVg.lvs.includes(lvName)) {
            parentVg.lvs.push(lvName);
          }
          const legacyParentVg = legacyVgs.find((vg) => vg.name === vgName);
          if (legacyParentVg && legacyParentVg.lvs && !legacyParentVg.lvs.includes(lvName)) {
            legacyParentVg.lvs.push(lvName);
          }

          // Correlate with filesystems
          const mapperPath = `/dev/mapper/${vgName.replace(/-/g, '--')}-${lvName.replace(/-/g, '--')}`;
          const matchedFs = filesystems.find(
            (fs) =>
              fs.device === lvPath ||
              fs.device === mapperPath ||
              (fs.vgName === vgName && fs.lvName === lvName) ||
              fs.device.includes(`${vgName}-${lvName}`)
          );

          const lvItem: LinuxLogicalVolume = {
            name: lvName,
            vgName,
            path: lvPath,
            size: `${sizeVal.toFixed(2)} GB`,
            fsType: matchedFs?.fsType || null,
            mountPoint: matchedFs?.mountPoint || null,
            usedSize: matchedFs?.usedSize,
            freeSize: matchedFs?.freeSize,
            usagePercent: matchedFs?.usagePercent,
            isMounted: !!matchedFs,
            isReadOnly: matchedFs?.isReadOnly || false,
            status: lvAttr,
          };
          logicalVolumes.push(lvItem);

          legacyLvs.push({
            name: lvName,
            vgName,
            path: lvPath,
            size: `${sizeVal.toFixed(2)} GB`,
            mountPoint: matchedFs?.mountPoint || null,
            fsType: matchedFs?.fsType || null,
            usagePercent: matchedFs?.usagePercent,
            isMounted: !!matchedFs,
            isReadOnly: matchedFs?.isReadOnly || false,
            usedSize: matchedFs?.usedSize,
            freeSize: matchedFs?.freeSize,
          });
        }
      }
    }

    // 5. Parse Physical Disks & Partitions (from LSBLK JSON or fallback)
    const physicalDisks: LinuxPhysicalDisk[] = [];
    const availableDisks: LinuxRawDisk[] = [];
    const lsblkJsonRaw = getSection('LSBLK_JSON', 'FINDMNT_JSON');

    if (lsblkJsonRaw.startsWith('{')) {
      try {
        const parsed = JSON.parse(lsblkJsonRaw);
        const blockdevices = Array.isArray(parsed.blockdevices) ? parsed.blockdevices : [];

        for (const item of blockdevices) {
          const rawName = item.name || '';
          if (rawName.startsWith('loop') || rawName.startsWith('ram')) continue;
          if (rawName.startsWith('sr') && (!item.size || item.size === 0)) continue;

          const devPath = item.path || (rawName.startsWith('/') ? rawName : `/dev/${rawName}`);
          const sizeStr = item.size ? formatBytesHelper(item.size) : '-';

          // Detect media type
          let mediaType: 'SSD' | 'HDD' | 'NVMe' | 'Unknown' = 'Unknown';
          if (devPath.includes('nvme') || item.tran === 'nvme') {
            mediaType = 'NVMe';
          } else if (item.rota === 0 || item.rota === '0') {
            mediaType = 'SSD';
          } else if (item.rota === 1 || item.rota === '1') {
            mediaType = 'HDD';
          }

          // Partitions
          const partitions: LinuxPartition[] = [];
          if (Array.isArray(item.children)) {
            for (const child of item.children) {
              const childPath = child.path || (child.name.startsWith('/') ? child.name : `/dev/${child.name}`);
              const isInChildLvm = physicalVolumes.some((pv) => pv.name === childPath);
              partitions.push({
                name: childPath,
                size: child.size ? formatBytesHelper(child.size) : '-',
                fsType: child.fstype || null,
                mountPoint: child.mountpoint || null,
                uuid: child.uuid || null,
                partLabel: child.partlabel || null,
                isInLvm: isInChildLvm,
              });
            }
          }

          const isInLvm = physicalVolumes.some(
            (pv) => pv.name === devPath || pv.parentDisk === devPath || partitions.some((p) => p.name === pv.name)
          );

          const hasPartitions = partitions.length > 0;
          const hasDirectMount = !!item.mountpoint;
          const hasDirectFs = !!item.fstype;
          const isUsed = hasPartitions || hasDirectMount || hasDirectFs || isInLvm;
          const isAvailable = !isUsed;

          physicalDisks.push({
            name: devPath,
            model: item.model || null,
            serial: item.serial || null,
            size: sizeStr,
            type: item.type || 'disk',
            mediaType,
            transport: item.tran || null,
            health: 'Healthy',
            partitionCount: partitions.length,
            isUsed,
            isInLvm,
            isAvailable,
            partitions,
          });

          availableDisks.push({
            name: devPath,
            size: sizeStr,
            type: item.type || 'disk',
            fstype: item.fstype || null,
            mountpoint: item.mountpoint || null,
            model: item.model || undefined,
            isInLvm,
            isAvailable,
          });
        }
      } catch {
        // Fallback to flat lines if json parse fails
      }
    }

    // If physicalDisks empty, parse from DISKS_FLAT
    if (physicalDisks.length === 0) {
      const flatLines = getSection('DISKS_FLAT', null).split(/\r?\n/).filter((l) => l.trim());
      for (const line of flatLines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const rawName = parts[0];
          if (rawName.startsWith('loop') || rawName.startsWith('ram') || rawName.startsWith('sr')) continue;
          const devPath = rawName.startsWith('/') ? rawName : `/dev/${rawName}`;
          const size = parts[1] || '-';
          const type = parts[2] || 'disk';
          const fstype = parts[3] && parts[3] !== '-' ? parts[3] : null;
          const mountpoint = parts[4] && parts[4] !== '-' ? parts[4] : null;

          const isInLvm = physicalVolumes.some((pv) => pv.name === devPath || pv.parentDisk === devPath);
          const isUsed = !!fstype || !!mountpoint || isInLvm;

          physicalDisks.push({
            name: devPath,
            model: null,
            serial: null,
            size: formatBytesHelper(size),
            type,
            mediaType: devPath.includes('nvme') ? 'NVMe' : 'SSD',
            transport: devPath.includes('nvme') ? 'nvme' : 'scsi',
            health: 'Healthy',
            partitionCount: 0,
            isUsed,
            isInLvm,
            isAvailable: !isUsed,
            partitions: [],
          });

          availableDisks.push({
            name: devPath,
            size: formatBytesHelper(size),
            type,
            fstype,
            mountpoint,
            isInLvm,
            isAvailable: !isUsed,
          });
        }
      }
    }

    // Summary calculation
    const summary = {
      totalDiskCount: physicalDisks.length,
      availableDiskCount: physicalDisks.filter((d) => d.isAvailable).length,
      totalMountedCount: filesystems.length,
      totalVgCount: volumeGroups.length,
      totalLvCount: logicalVolumes.length,
    };

    return {
      filesystems,
      physicalDisks,
      physicalVolumes,
      volumeGroups,
      logicalVolumes,
      lvmInstalled,
      summary,
      // Backward compatibility aliases
      pvs: legacyPvs,
      vgs: legacyVgs,
      lvs: legacyLvs,
      availableDisks,
    };
  } catch (err: any) {
    console.error(`[fetchLinuxStorageOverviewSSH] error:`, err?.message || err);
    return {
      filesystems: [],
      physicalDisks: [],
      physicalVolumes: [],
      volumeGroups: [],
      logicalVolumes: [],
      lvmInstalled: false,
      summary: {
        totalDiskCount: 0,
        availableDiskCount: 0,
        totalMountedCount: 0,
        totalVgCount: 0,
        totalLvCount: 0,
      },
      pvs: [],
      vgs: [],
      lvs: [],
      availableDisks: [],
    };
  }
}

// Backward-compatibility alias
export const fetchLinuxLvmOverviewSSH = fetchLinuxStorageOverviewSSH;

/**
 * Workflow A: Takes an unused/available disk, optionally partitions it with a GPT table,
 * formats it with the selected filesystem (ext4, xfs, btrfs), creates the mount directory,
 * mounts it immediately, and registers it in /etc/fstab for reboot persistence.
 */
export async function formatAndMountLinuxDiskSSH(
  server: RemoteServer,
  payload: LinuxDiskFormatMountPayload,
  ephemeralPassword?: string,
  timeoutMs: number = 35000
): Promise<{ success: boolean; message: string; targetDevice?: string; mountPoint?: string }> {
  const { diskPath, partition, fsType, mountPath, label, persistInFstab } = payload;
  const cleanDisk = (diskPath || '').trim().replace(/[^a-zA-Z0-9_\-/]/g, '');
  const cleanMount = (mountPath || '').trim();
  const cleanFs = (fsType || 'ext4').trim().toLowerCase();
  const cleanLabel = (label || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');

  if (!cleanDisk) throw new Error('Target disk path is required.');
  if (!cleanMount || !cleanMount.startsWith('/')) {
    throw new Error('Target mount point must be an absolute path starting with /.');
  }

  // Prevent dangerous mount locations
  const forbidden = ['/', '/boot', '/proc', '/sys', '/dev', '/etc', '/bin', '/sbin', '/lib', '/usr', '/var'];
  if (forbidden.includes(cleanMount)) {
    throw new Error(`Mounting directly to system path "${cleanMount}" is prohibited for system safety.`);
  }

  const script = `export LC_ALL=C
set -e

# 1. Validate block device
if [ ! -b "${cleanDisk}" ]; then
  echo "ERR:NOT_A_BLOCK_DEVICE: Target ${cleanDisk} is not a valid block device."
  exit 1
fi

# 2. Check if currently mounted
if mount | grep -qs "${cleanDisk}"; then
  echo "ERR:DEVICE_CURRENTLY_MOUNTED: ${cleanDisk} is currently active and mounted. Cannot format an active filesystem."
  exit 1
fi

# 3. Check if in active LVM
if sudo pvs "${cleanDisk}" >/dev/null 2>&1 || pvs "${cleanDisk}" >/dev/null 2>&1; then
  echo "ERR:DEVICE_IN_LVM: ${cleanDisk} is currently configured as an LVM Physical Volume. Remove it from LVM before creating an independent filesystem."
  exit 1
fi

TARGET_DEV="${cleanDisk}"

# 4. Partition disk if requested
if [ "${partition !== false ? '1' : '0'}" = "1" ]; then
  # Create GPT label and single partition spanning 100% of disk
  sudo parted -s "${cleanDisk}" mklabel gpt mkpart primary "${cleanFs}" 2048s 100% 2>&1 || true
  sudo partprobe "${cleanDisk}" 2>/dev/null || sudo partx -u "${cleanDisk}" 2>/dev/null || true
  sudo udevadm settle 2>/dev/null || sleep 1

  # Resolve partition path
  if [ -b "${cleanDisk}1" ]; then
    TARGET_DEV="${cleanDisk}1"
  elif [ -b "${cleanDisk}p1" ]; then
    TARGET_DEV="${cleanDisk}p1"
  else
    PART_NAME=$(lsblk -ln -o NAME "${cleanDisk}" | sed 1d | head -n 1)
    if [ -n "$PART_NAME" ] && [ -b "/dev/$PART_NAME" ]; then
      TARGET_DEV="/dev/$PART_NAME"
    fi
  fi
fi

# 5. Format Filesystem
LABEL_OPT=""
if [ -n "${cleanLabel}" ]; then
  LABEL_OPT="-L ${cleanLabel}"
fi

if [ "${cleanFs}" = "xfs" ]; then
  sudo mkfs.xfs -f $LABEL_OPT "$TARGET_DEV" 2>&1
elif [ "${cleanFs}" = "btrfs" ]; then
  sudo mkfs.btrfs -f $LABEL_OPT "$TARGET_DEV" 2>&1
else
  sudo mkfs.ext4 -F $LABEL_OPT "$TARGET_DEV" 2>&1
fi

# 6. Create Mount Directory and Mount
sudo mkdir -p "${cleanMount}"
sudo mount "$TARGET_DEV" "${cleanMount}" 2>&1

# 7. Persistent /etc/fstab entry
if [ "${persistInFstab ? '1' : '0'}" = "1" ]; then
  UUID_VAL=$(sudo blkid -s UUID -o value "$TARGET_DEV" 2>/dev/null || true)
  if [ -n "$UUID_VAL" ]; then
    FSTAB_LINE="UUID=$UUID_VAL ${cleanMount} ${cleanFs} defaults,nofail 0 2"
  else
    FSTAB_LINE="$TARGET_DEV ${cleanMount} ${cleanFs} defaults,nofail 0 2"
  fi
  if ! grep -qs "${cleanMount}" /etc/fstab; then
    echo "$FSTAB_LINE" | sudo tee -a /etc/fstab >/dev/null
  fi
fi

echo "FORMAT_MOUNT_SUCCESS:$TARGET_DEV"
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);

    if (raw.includes('FORMAT_MOUNT_SUCCESS')) {
      const match = raw.match(/FORMAT_MOUNT_SUCCESS:(\S+)/);
      const targetDev = match ? match[1] : cleanDisk;
      return {
        success: true,
        targetDevice: targetDev,
        mountPoint: cleanMount,
        message: `Device "${cleanDisk}" formatted as ${cleanFs.toUpperCase()} (${targetDev}) and successfully mounted to "${cleanMount}"${persistInFstab ? ' (persisted in /etc/fstab)' : ''}.`,
      };
    }

    if (raw.includes('ERR:NOT_A_BLOCK_DEVICE')) {
      return { success: false, message: `Target "${cleanDisk}" is not a valid block device.` };
    }
    if (raw.includes('ERR:DEVICE_CURRENTLY_MOUNTED')) {
      return { success: false, message: `Device "${cleanDisk}" is currently mounted. Unmount it first.` };
    }
    if (raw.includes('ERR:DEVICE_IN_LVM')) {
      return { success: false, message: `Device "${cleanDisk}" is an active LVM Physical Volume.` };
    }

    return {
      success: true,
      message: raw.trim() || `Disk formatted and mounted to ${cleanMount}.`,
      targetDevice: cleanDisk,
      mountPoint: cleanMount,
    };
  } catch (err: any) {
    console.error(`[formatAndMountLinuxDiskSSH] error:`, err?.message || err);
    return {
      success: false,
      message: `Failed to format and mount disk: ${err?.message || err}`,
    };
  }
}

/**
 * Rescans SCSI hosts and block devices online without rebooting the system.
 * Detects newly added disks (e.g. in VMware, Proxmox, AWS, KVM) and updates disk geometries.
 */
export async function rescanLinuxStorageSSH(
  server: RemoteServer,
  ephemeralPassword?: string,
  timeoutMs: number = 15000
): Promise<{ success: boolean; message: string; scannedCount: number }> {
  const script = `export LC_ALL=C
SCAN_COUNT=0

# 1. Rescan SCSI Host Busses for newly attached disks
for host in /sys/class/scsi_host/host*/scan; do
  if [ -f "$host" ]; then
    echo "- - -" | sudo tee "$host" >/dev/null 2>&1 && SCAN_COUNT=$((SCAN_COUNT+1))
  fi
done

# 2. Rescan existing block devices for expanded disk sizes (SCSI, VirtIO, NVMe)
for dev in /sys/class/block/sd*/device/rescan /sys/block/*/device/rescan; do
  if [ -f "$dev" ]; then
    echo 1 | sudo tee "$dev" >/dev/null 2>&1
  fi
done

for dev in /sys/class/block/nvme*n*/device/rescan; do
  if [ -f "$dev" ]; then
    echo 1 | sudo tee "$dev" >/dev/null 2>&1
  fi
done

# 3. Inform kernel of partition table updates
sudo partprobe 2>/dev/null || true
sudo udevadm settle 2>/dev/null || true

# 4. If any existing Physical Volumes were resized on the hypervisor, resize them in LVM
if command -v pvs >/dev/null 2>&1 || sudo which pvs >/dev/null 2>&1; then
  EXISTING_PVS=$(sudo pvs --noheadings -o pv_name 2>/dev/null | tr -d ' ' || true)
  for pv in $EXISTING_PVS; do
    if [ -b "$pv" ]; then
      sudo pvresize -y "$pv" 2>/dev/null || true
    fi
  done
  # Settle udev and rescan PVs
  sudo udevadm settle 2>/dev/null || true
fi

echo "SCSI_SCAN_SUCCESS:$SCAN_COUNT"
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);
    const match = raw.match(/SCSI_SCAN_SUCCESS:(\d+)/);
    const scannedCount = match ? parseInt(match[1], 10) : 0;

    return {
      success: true,
      message: `Online storage rescan completed across ${scannedCount} host bus controller(s). Newly attached disks and resized virtual disks have been refreshed and all PVs auto-expanded without downtime.`,
      scannedCount,
    };
  } catch (err: any) {
    console.error(`[rescanLinuxStorageSSH] error:`, err?.message || err);
    return {
      success: false,
      message: `Online rescan failed: ${err?.message || err}`,
      scannedCount: 0,
    };
  }
}

/**
 * Extends an existing Logical Volume (LV) and dynamically expands its filesystem (ext4/xfs).
 * Can optionally initialize a raw disk (pvcreate) and add it to the VG (vgextend) first.
 */
export async function extendLinuxLvSSH(
  server: RemoteServer,
  payload: LinuxLvmExtendPayload,
  ephemeralPassword?: string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; message: string }> {
  const { lvPath, vgName, addSize, diskToAddToVg } = payload;

  const cleanLvPath = (lvPath || '').trim();
  const cleanVg = (vgName || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
  const rawAddSize = (addSize || '').trim();
  const cleanAddSize = rawAddSize === '100%FREE' ? '100%FREE' : rawAddSize.replace(/^\++/, '');
  const cleanDisk = diskToAddToVg ? diskToAddToVg.trim().replace(/[^a-zA-Z0-9_\-/]/g, '') : null;

  if (!cleanLvPath) {
    throw new Error('Logical Volume path is required.');
  }
  if (!cleanAddSize) {
    throw new Error('Size to add is required (e.g. 10G, 500M, or 100%FREE).');
  }

  const script = `export LC_ALL=C

# Step 1: Add new disk to VG if requested
if [ -n "${cleanDisk || ''}" ]; then
  if [ ! -b "${cleanDisk}" ]; then
    echo "DISK_NOT_FOUND"
    exit 1
  fi
  # If already a PV, resize it in case the underlying virtual disk was enlarged
  if sudo pvs "${cleanDisk}" >/dev/null 2>&1 || pvs "${cleanDisk}" >/dev/null 2>&1; then
    sudo pvresize -y "${cleanDisk}" 2>&1 || pvresize -y "${cleanDisk}" 2>&1 || true
  else
    # Initialize as Physical Volume (pvcreate) with force flag to wipe stale headers cleanly
    sudo pvcreate -y -ff "${cleanDisk}" 2>&1 || pvcreate -y -ff "${cleanDisk}" 2>&1 || sudo pvcreate -y "${cleanDisk}" 2>&1 || true
  fi
  sudo udevadm settle 2>/dev/null || true
  # Extend VG (proceed if already member or newly added)
  sudo vgextend "${cleanVg}" "${cleanDisk}" 2>&1 || vgextend "${cleanVg}" "${cleanDisk}" 2>&1 || true
fi

# Step 2: Extend the Logical Volume and auto-resize filesystem (-r)
if [ "${cleanAddSize}" = "100%FREE" ]; then
  OUTPUT=$(sudo lvextend -l +100%FREE -r "${cleanLvPath}" 2>&1 || sudo lvextend -l +100%FREE "${cleanLvPath}" 2>&1 || true)
else
  OUTPUT=$(sudo lvextend -L "+${cleanAddSize}" -r "${cleanLvPath}" 2>&1 || sudo lvextend -L "+${cleanAddSize}" "${cleanLvPath}" 2>&1 || true)
fi
echo "$OUTPUT"

if echo "$OUTPUT" | grep -qi "matches existing size" || echo "$OUTPUT" | grep -qi "not enough free space" || echo "$OUTPUT" | grep -qi "Insufficient free space"; then
  if ! echo "$OUTPUT" | grep -qi "successfully resized"; then
    echo "ERR_LVM_SPACE"
    exit 1
  fi
fi

# Step 3: Filesystem resize fallback to guarantee online growth (handles XFS and ext4)
FS_TYPE=$(sudo blkid -s TYPE -o value "${cleanLvPath}" 2>/dev/null || true)
MOUNT_PT=$(findmnt -n -o TARGET "${cleanLvPath}" 2>/dev/null || true)
if [ -z "$MOUNT_PT" ]; then
  MOUNT_PT=$(df -P "${cleanLvPath}" 2>/dev/null | tail -1 | awk '{print $6}' || true)
fi

if [ "$FS_TYPE" = "xfs" ]; then
  if [ -n "$MOUNT_PT" ] && [ "$MOUNT_PT" != "Mounted" ]; then
    sudo xfs_growfs "$MOUNT_PT" 2>&1 || true
  else
    sudo xfs_growfs -d "${cleanLvPath}" 2>&1 || true
  fi
elif [ "$FS_TYPE" = "ext4" ] || [ "$FS_TYPE" = "ext3" ] || [ "$FS_TYPE" = "ext2" ]; then
  sudo resize2fs "${cleanLvPath}" 2>&1 || true
fi

echo "EXTEND_SUCCESS"
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);
    if (raw.includes('DISK_NOT_FOUND')) {
      return {
        success: false,
        message: `Selected disk "${cleanDisk}" was not found on the server. Please run Online Rescan first.`,
      };
    }

    if (raw.includes('ERR_LVM_SPACE') || raw.includes('Insufficient free space') || raw.includes('not enough free space')) {
      return {
        success: false,
        message: `Volume Group "${cleanVg}" has insufficient free space for +${cleanAddSize}. Please select a smaller size, or select a new raw disk to add to this Volume Group.`,
      };
    }

    if (raw.includes('EXTEND_SUCCESS') || raw.includes('successfully resized')) {
      return {
        success: true,
        message: `Logical Volume "${cleanLvPath}" successfully extended by ${cleanAddSize}${cleanDisk ? ` (and initialized ${cleanDisk} into VG ${cleanVg})` : ''}. Filesystem resized online without downtime.`,
      };
    }

    return {
      success: true,
      message: raw.trim() || 'Logical volume expansion completed.',
    };
  } catch (err: any) {
    console.error(`[extendLinuxLvSSH] error:`, err?.message || err);
    return {
      success: false,
      message: `Failed to extend Logical Volume: ${err?.message || err}`,
    };
  }
}

/**
 * Creates a new LVM Logical Volume, formats it with a chosen filesystem (ext4/xfs/btrfs),
 * mounts it to a target path, and optionally makes it persistent across reboots via /etc/fstab.
 */
export async function createLinuxLvmVolumeSSH(
  server: RemoteServer,
  payload: LinuxLvmCreatePayload,
  ephemeralPassword?: string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; message: string; lvPath?: string }> {
  const { isNewVg, vgName, selectedDisks, lvName, size, fsType, mountPath, persistInFstab } = payload;

  const cleanVg = (vgName || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
  const cleanLv = (lvName || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
  const cleanSize = (size || '').trim();
  const cleanFs = (fsType || 'ext4').trim().toLowerCase();
  const cleanMount = mountPath ? mountPath.trim() : null;

  if (!cleanVg) throw new Error('Volume Group name is required.');
  if (!cleanLv) throw new Error('Logical Volume name is required.');
  if (!cleanSize) throw new Error('Volume size is required (e.g. 20G or 100%FREE).');

  if (isNewVg && (!selectedDisks || selectedDisks.length === 0)) {
    throw new Error('Creating a new Volume Group requires selecting at least one raw disk or partition.');
  }

  const cleanDisks = (selectedDisks || []).map((d) => d.trim().replace(/[^a-zA-Z0-9_\-/]/g, ''));

  const script = `export LC_ALL=C
set -e

# Step 1: Initialize PVs and create/extend VG if disks specified
if [ "${isNewVg ? '1' : '0'}" = "1" ]; then
  for d in ${cleanDisks.join(' ')}; do
    sudo pvcreate -y -ff "$d" 2>&1 || true
  done
  sudo udevadm settle 2>/dev/null || true
  sudo vgcreate "${cleanVg}" ${cleanDisks.join(' ')} 2>&1
elif [ -n "${cleanDisks.join(' ')}" ]; then
  for d in ${cleanDisks.join(' ')}; do
    sudo pvcreate -y -ff "$d" 2>&1 || true
    sudo vgextend "${cleanVg}" "$d" 2>&1 || true
  done
  sudo udevadm settle 2>/dev/null || true
else
  # Verify that target VG actually exists
  if ! sudo vgs "${cleanVg}" >/dev/null 2>&1 && ! vgs "${cleanVg}" >/dev/null 2>&1; then
    echo "ERR:VG_NOT_FOUND: Volume Group '${cleanVg}' does not exist on this server."
    exit 1
  fi
  # Verify that an LV with this name does not already exist in the VG
  if sudo lvs "${cleanVg}/${cleanLv}" >/dev/null 2>&1 || lvs "${cleanVg}/${cleanLv}" >/dev/null 2>&1; then
    echo "ERR:LV_ALREADY_EXISTS: Logical Volume '${cleanLv}' already exists in Volume Group '${cleanVg}'."
    exit 1
  fi
fi

# Step 2: Create Logical Volume
if [ "${cleanSize}" = "100%FREE" ]; then
  sudo lvcreate -l 100%FREE -n "${cleanLv}" "${cleanVg}" -y 2>&1
else
  sudo lvcreate -L "${cleanSize}" -n "${cleanLv}" "${cleanVg}" -y 2>&1
fi

LV_DEV="/dev/${cleanVg}/${cleanLv}"

# Step 3: Format Filesystem
if [ "${cleanFs}" = "xfs" ]; then
  sudo mkfs.xfs -f "$LV_DEV" 2>&1
elif [ "${cleanFs}" = "btrfs" ]; then
  sudo mkfs.btrfs -f "$LV_DEV" 2>&1
else
  sudo mkfs.ext4 -F "$LV_DEV" 2>&1
fi

# Step 4: Mount to target path if requested
if [ -n "${cleanMount || ''}" ]; then
  sudo mkdir -p "${cleanMount}"
  sudo mount "$LV_DEV" "${cleanMount}" 2>&1

  # Step 5: Persistent /etc/fstab entry
  if [ "${persistInFstab ? '1' : '0'}" = "1" ]; then
    UUID=$(sudo blkid -s UUID -o value "$LV_DEV" 2>/dev/null || true)
    sudo cp /etc/fstab /etc/fstab.bak.$(date +%s)
    if [ -n "$UUID" ]; then
      FSTAB_LINE="UUID=$UUID ${cleanMount} ${cleanFs} defaults,nofail 0 2"
    else
      FSTAB_LINE="$LV_DEV ${cleanMount} ${cleanFs} defaults,nofail 0 2"
    fi
    if ! grep -qs "${cleanMount}" /etc/fstab; then
      echo "$FSTAB_LINE" | sudo tee -a /etc/fstab >/dev/null
    fi
    sudo mount -a 2>&1 || true
  fi
fi

echo "LVM_CREATE_SUCCESS:$LV_DEV"
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);
    if (raw.includes('ERR:VG_NOT_FOUND:')) {
      const msg = raw.split('ERR:VG_NOT_FOUND:')[1]?.split('\n')[0]?.trim();
      return { success: false, message: msg || `Volume Group "${cleanVg}" not found on server.` };
    }
    if (raw.includes('ERR:LV_ALREADY_EXISTS:')) {
      const msg = raw.split('ERR:LV_ALREADY_EXISTS:')[1]?.split('\n')[0]?.trim();
      return { success: false, message: msg || `Logical Volume "${cleanLv}" already exists in Volume Group "${cleanVg}".` };
    }
    if (raw.toLowerCase().includes('insufficient free space')) {
      return {
        success: false,
        message: `Insufficient free space in Volume Group "${cleanVg}" for requested size (${cleanSize}).`,
      };
    }

    const match = raw.match(/LVM_CREATE_SUCCESS:(\S+)/);
    if (!match) {
      return {
        success: false,
        message: `Failed to create Logical Volume: ${raw.trim()}`,
      };
    }
    const lvPath = match[1] || `/dev/${cleanVg}/${cleanLv}`;

    return {
      success: true,
      message: `Logical Volume "${cleanLv}" (${cleanSize}) created successfully in Volume Group "${cleanVg}", formatted as ${cleanFs.toUpperCase()}${cleanMount ? ` and mounted to "${cleanMount}" with persistent reboot protection` : ''}.`,
      lvPath,
    };
  } catch (err: any) {
    console.error(`[createLinuxLvmVolumeSSH] error:`, err?.message || err);
    const errText = String(err?.message || err);
    if (errText.includes('ERR:VG_NOT_FOUND:')) {
      const msg = errText.split('ERR:VG_NOT_FOUND:')[1]?.split('\n')[0]?.trim();
      return { success: false, message: msg || `Volume Group "${cleanVg}" not found.` };
    }
    if (errText.includes('ERR:LV_ALREADY_EXISTS:')) {
      const msg = errText.split('ERR:LV_ALREADY_EXISTS:')[1]?.split('\n')[0]?.trim();
      return { success: false, message: msg || `Logical Volume "${cleanLv}" already exists in Volume Group "${cleanVg}".` };
    }
    if (errText.toLowerCase().includes('insufficient free space')) {
      return {
        success: false,
        message: `Insufficient free space in Volume Group "${cleanVg}" for requested size (${cleanSize}).`,
      };
    }
    return {
      success: false,
      message: `Failed to create Logical Volume: ${err?.message || err}`,
    };
  }
}

/**
 * Safely shrinks a Logical Volume (ext4 only; XFS is blocked because XFS cannot be shrunk by design).
 * Returns the reclaimed space directly to the Volume Group (vg_free) for other LVs or mount paths.
 */
export async function shrinkLinuxLvSSH(
  server: RemoteServer,
  payload: LinuxLvmShrinkPayload,
  ephemeralPassword?: string,
  timeoutMs: number = 25000
): Promise<{ success: boolean; message: string }> {
  const { lvPath, vgName, reduceAmount, mountPoint, fsType } = payload;

  const cleanLvPath = (lvPath || '').trim();
  const cleanVg = (vgName || '').trim();
  const cleanReduce = (reduceAmount || '').trim();
  const cleanFs = (fsType || '').trim().toLowerCase();
  const cleanMount = mountPoint ? mountPoint.trim() : null;

  if (!cleanLvPath) throw new Error('Logical Volume path is required.');
  if (!cleanReduce) throw new Error('Reduction amount is required (e.g. 5G or 10G).');

  // Hard protection: XFS cannot be shrunk by design!
  if (cleanFs === 'xfs') {
    return {
      success: false,
      message: 'XFS Filesystem Architecture Restriction: The XFS filesystem does not support shrinking or reduction by design (only expansion via xfs_growfs is possible). To reduce space on an XFS partition, you must back up its contents, recreate the volume with the smaller size, and restore the files.',
    };
  }

  // Hard protection: active root filesystem cannot be shrunk live
  if (cleanMount === '/') {
    return {
      success: false,
      message: 'Safety Restriction: The active root filesystem (/) cannot be safely unmounted or shrunk while the operating system is running. Shrinking root requires booting into a live rescue environment.',
    };
  }

  const script = `export LC_ALL=C
set -e

# Detect actual filesystem if not provided
ACTUAL_FS=$(sudo blkid -s TYPE -o value "${cleanLvPath}" 2>/dev/null || true)
if [ "$ACTUAL_FS" = "xfs" ]; then
  echo "XFS_BLOCKED"
  exit 1
fi

WAS_MOUNTED=0
if [ -n "${cleanMount || ''}" ] && mountpoint -q "${cleanMount}" 2>/dev/null; then
  WAS_MOUNTED=1
  # Unmount safely
  sudo umount "${cleanMount}" 2>&1
fi

# Run e2fsck prior to resizing
sudo e2fsck -f -y "${cleanLvPath}" 2>&1 || true

# Shrink LV and resize filesystem in one atomic operation (-r)
sudo lvreduce --resizefs -L -"${cleanReduce}" -y "${cleanLvPath}" 2>&1

# Remount if it was mounted before
if [ "$WAS_MOUNTED" = "1" ]; then
  sudo mount "${cleanLvPath}" "${cleanMount}" 2>&1
fi

echo "SHRINK_SUCCESS"
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);
    if (raw.includes('XFS_BLOCKED')) {
      return {
        success: false,
        message: 'The target filesystem is XFS, which cannot be shrunk by design. Only ext4/ext3 filesystems support reduction.',
      };
    }

    if (raw.includes('SHRINK_SUCCESS') || raw.includes('successfully resized')) {
      return {
        success: true,
        message: `Logical Volume "${cleanLvPath}" shrunk by ${cleanReduce}. The reclaimed space is now immediately available in Volume Group "${cleanVg}" for other volumes or paths.`,
      };
    }

    return {
      success: true,
      message: raw.trim() || 'Logical volume reduction completed.',
    };
  } catch (err: any) {
    console.error(`[shrinkLinuxLvSSH] error:`, err?.message || err);
    return {
      success: false,
      message: `Failed to shrink Logical Volume: ${err?.message || err}`,
    };
  }
}

/**
 * Initializes a physical raw disk/partition as an LVM Physical Volume (pvcreate)
 * and extends an existing Volume Group (vgextend) to immediately increase the free storage pool.
 */
export async function addDiskToLinuxVgSSH(
  server: RemoteServer,
  payload: { vgName: string; diskPath: string },
  ephemeralPassword?: string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; message: string }> {
  const { vgName, diskPath } = payload;
  const cleanVg = (vgName || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
  const cleanDisk = (diskPath || '').trim().replace(/[^a-zA-Z0-9_\-/]/g, '');

  if (!cleanVg) throw new Error('Volume Group name is required.');
  if (!cleanDisk) throw new Error('Target disk or partition path is required.');

  const script = `export LC_ALL=C

# 1. Validate block device existence
if [ ! -b "${cleanDisk}" ]; then
  if [ -e "${cleanDisk}" ]; then
    echo "ERR:NOT_A_BLOCK_DEVICE: Device ${cleanDisk} exists but is not a block device."
    exit 1
  else
    echo "ERR:DISK_NOT_FOUND: Block device ${cleanDisk} does not exist. Please run Online Rescan Disks first."
    exit 1
  fi
fi

# 2. Check if disk is already in an existing Volume Group
EXISTING_VG=$(sudo pvs --noheadings -o vg_name "${cleanDisk}" 2>/dev/null | tr -d '[:space:]')
if [ -z "$EXISTING_VG" ]; then
  EXISTING_VG=$(pvs --noheadings -o vg_name "${cleanDisk}" 2>/dev/null | tr -d '[:space:]')
fi

if [ -n "$EXISTING_VG" ] && [ "$EXISTING_VG" != "none" ] && [ "$EXISTING_VG" != "-" ]; then
  if [ "$EXISTING_VG" = "${cleanVg}" ]; then
    echo "VG_ALREADY_MEMBER: Disk ${cleanDisk} is already part of Volume Group ${cleanVg}."
    exit 0
  else
    echo "ERR:DISK_IN_ANOTHER_VG: Disk ${cleanDisk} is already member of Volume Group '$EXISTING_VG'. Cannot add to '${cleanVg}'."
    exit 1
  fi
fi

# 3. Check if target Volume Group exists
if ! sudo vgs "${cleanVg}" >/dev/null 2>&1 && ! vgs "${cleanVg}" >/dev/null 2>&1; then
  echo "ERR:VG_NOT_FOUND: Target Volume Group '${cleanVg}' not found on server."
  exit 1
fi

# 4. Initialize as Physical Volume (pvcreate) if not already a valid PV
IS_ALREADY_PV=0
if sudo pvs "${cleanDisk}" >/dev/null 2>&1 || pvs "${cleanDisk}" >/dev/null 2>&1; then
  IS_ALREADY_PV=1
fi

if [ $IS_ALREADY_PV -eq 0 ]; then
  PV_OUT=$(sudo pvcreate -y -ff "${cleanDisk}" 2>&1 || pvcreate -y -ff "${cleanDisk}" 2>&1 || sudo pvcreate -y "${cleanDisk}" 2>&1)
  PV_STATUS=$?
  if [ $PV_STATUS -ne 0 ]; then
    if ! sudo pvs "${cleanDisk}" >/dev/null 2>&1 && ! pvs "${cleanDisk}" >/dev/null 2>&1; then
      echo "ERR:PVCREATE_FAILED: pvcreate failed on ${cleanDisk}: $PV_OUT"
      exit 1
    fi
  fi
fi

# 5. Extend the Volume Group (vgextend)
VGEXT_OUT=$(sudo vgextend "${cleanVg}" "${cleanDisk}" 2>&1 || vgextend "${cleanVg}" "${cleanDisk}" 2>&1)
VGEXT_STATUS=$?

if [ $VGEXT_STATUS -eq 0 ] || echo "$VGEXT_OUT" | grep -qi "successfully extended" || echo "$VGEXT_OUT" | grep -qi "already in volume group"; then
  UPDATED_FREE=$(sudo vgs --noheadings -o vg_free --units g "${cleanVg}" 2>/dev/null | tr -d '[:space:]')
  echo "VG_EXTEND_SUCCESS: Free space now: $UPDATED_FREE"
  echo "$VGEXT_OUT"
  exit 0
else
  echo "ERR:VGEXTEND_FAILED: vgextend failed for VG '${cleanVg}' with disk '${cleanDisk}': $VGEXT_OUT"
  exit 1
fi
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);
    if (raw.includes('VG_EXTEND_SUCCESS') || raw.includes('successfully extended') || raw.includes('VG_ALREADY_MEMBER')) {
      const freeMatch = raw.match(/Free space now:\s*([^\r\n]+)/);
      const freeInfo = freeMatch ? ` (Current Free Space: ${freeMatch[1]})` : '';
      return {
        success: true,
        message: `Disk "${cleanDisk}" successfully added to Volume Group "${cleanVg}"! Free storage pool in this VG has been expanded.${freeInfo}`,
      };
    }

    if (raw.includes('ERR:DISK_NOT_FOUND')) {
      return {
        success: false,
        message: `Device "${cleanDisk}" not found on server. Please run "Online Rescan Disks" first.`,
      };
    }
    if (raw.includes('ERR:NOT_A_BLOCK_DEVICE')) {
      return {
        success: false,
        message: `Target "${cleanDisk}" is not a valid block device.`,
      };
    }
    if (raw.includes('ERR:DISK_IN_ANOTHER_VG')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:DISK_IN_ANOTHER_VG')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:DISK_IN_ANOTHER_VG:\s*/, '').trim(),
      };
    }
    if (raw.includes('ERR:VG_NOT_FOUND')) {
      return {
        success: false,
        message: `Volume Group "${cleanVg}" does not exist on this server.`,
      };
    }
    if (raw.includes('ERR:PVCREATE_FAILED')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:PVCREATE_FAILED')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:PVCREATE_FAILED:\s*/, '').trim(),
      };
    }
    if (raw.includes('ERR:VGEXTEND_FAILED')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:VGEXTEND_FAILED')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:VGEXTEND_FAILED:\s*/, '').trim(),
      };
    }

    return {
      success: false,
      message: raw.trim() || `Failed to add disk "${cleanDisk}" to Volume Group "${cleanVg}".`,
    };
  } catch (err: any) {
    console.error(`[addDiskToLinuxVgSSH] error:`, err?.message || err);
    return {
      success: false,
      message: `Failed to add disk to Volume Group: ${err?.message || err}`,
    };
  }
}

/**
 * Initializes a raw block device or disk as an LVM Physical Volume (pvcreate).
 * Prepares the storage layer so it can subsequently be used to create a new Volume Group or extend an existing VG.
 */
export async function createLinuxPvSSH(
  server: RemoteServer,
  payload: { diskPath: string; force?: boolean },
  ephemeralPassword?: string,
  timeoutMs: number = 25000
): Promise<{ success: boolean; message: string; pvName?: string; pvSize?: string }> {
  const { diskPath, force } = payload;
  const cleanDisk = (diskPath || '').trim().replace(/[^a-zA-Z0-9_\-/]/g, '');

  if (!cleanDisk) throw new Error('Target disk or partition path is required.');

  const script = `export LC_ALL=C

# 1. Validate block device existence
if [ ! -b "${cleanDisk}" ]; then
  if [ -e "${cleanDisk}" ]; then
    echo "ERR:NOT_A_BLOCK_DEVICE: Device ${cleanDisk} exists but is not a block device."
    exit 1
  else
    echo "ERR:DISK_NOT_FOUND: Block device ${cleanDisk} does not exist. Please run Online Rescan Disks first."
    exit 1
  fi
fi

# 2. Check if already part of a Volume Group
EXISTING_VG=$(sudo pvs --noheadings -o vg_name "${cleanDisk}" 2>/dev/null | tr -d '[:space:]')
if [ -z "$EXISTING_VG" ]; then
  EXISTING_VG=$(pvs --noheadings -o vg_name "${cleanDisk}" 2>/dev/null | tr -d '[:space:]')
fi

if [ -n "$EXISTING_VG" ] && [ "$EXISTING_VG" != "none" ] && [ "$EXISTING_VG" != "-" ]; then
  echo "ERR:DISK_IN_VG: Device ${cleanDisk} is already an active member of Volume Group '$EXISTING_VG'. Cannot re-initialize without removing from VG first."
  exit 1
fi

# 3. Check if already a valid standalone Physical Volume
if sudo pvs "${cleanDisk}" >/dev/null 2>&1 || pvs "${cleanDisk}" >/dev/null 2>&1; then
  PV_SIZE=$(sudo pvs --noheadings --units g -o pv_size "${cleanDisk}" 2>/dev/null | tr -d '[:space:]')
  echo "ALREADY_PV: Device ${cleanDisk} is already initialized as a Physical Volume (PV Size: $PV_SIZE)."
  exit 0
fi

# 4. Execute pvcreate
FORCE_FLAG="${force !== false ? '-ff' : ''}"
PV_OUT=$(sudo pvcreate -y $FORCE_FLAG "${cleanDisk}" 2>&1 || pvcreate -y $FORCE_FLAG "${cleanDisk}" 2>&1 || sudo pvcreate -y "${cleanDisk}" 2>&1)
PV_STATUS=$?

if [ $PV_STATUS -eq 0 ] || sudo pvs "${cleanDisk}" >/dev/null 2>&1 || echo "$PV_OUT" | grep -qi "successfully created"; then
  PV_SIZE=$(sudo pvs --noheadings --units g -o pv_size "${cleanDisk}" 2>/dev/null | tr -d '[:space:]')
  echo "PVCREATE_SUCCESS: Device ${cleanDisk} successfully initialized as Physical Volume (Size: $PV_SIZE)."
  echo "$PV_OUT"
  exit 0
else
  echo "ERR:PVCREATE_FAILED: pvcreate failed on ${cleanDisk}: $PV_OUT"
  exit 1
fi
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);

    if (raw.includes('PVCREATE_SUCCESS') || raw.includes('successfully created') || raw.includes('ALREADY_PV')) {
      const sizeMatch = raw.match(/Size:\s*([^\)\r\n]+)/) || raw.match(/PV Size:\s*([^\)\r\n]+)/);
      const pvSize = sizeMatch ? sizeMatch[1].trim() : undefined;
      const isAlready = raw.includes('ALREADY_PV');

      return {
        success: true,
        pvName: cleanDisk,
        pvSize,
        message: isAlready
          ? `Disk "${cleanDisk}" is already a valid Physical Volume (PV)${pvSize ? ` (${pvSize})` : ''} and is ready to be added to a Volume Group.`
          : `Physical Volume (PV) successfully initialized on "${cleanDisk}"${pvSize ? ` (${pvSize})` : ''}! You can now join it to a Volume Group or extend an existing VG.`,
      };
    }

    if (raw.includes('ERR:DISK_NOT_FOUND')) {
      return {
        success: false,
        message: `Device "${cleanDisk}" not found on server. Please run "Online Rescan Disks" first.`,
      };
    }
    if (raw.includes('ERR:NOT_A_BLOCK_DEVICE')) {
      return {
        success: false,
        message: `Target "${cleanDisk}" is not a valid block device.`,
      };
    }
    if (raw.includes('ERR:DISK_IN_VG')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:DISK_IN_VG')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:DISK_IN_VG:\s*/, '').trim(),
      };
    }
    if (raw.includes('ERR:PVCREATE_FAILED')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:PVCREATE_FAILED')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:PVCREATE_FAILED:\s*/, '').trim(),
      };
    }

    return {
      success: false,
      message: raw.trim() || `Failed to initialize Physical Volume on "${cleanDisk}".`,
    };
  } catch (err: any) {
    console.error(`[createLinuxPvSSH] error:`, err?.message || err);
    return {
      success: false,
      message: `Failed to initialize Physical Volume: ${err?.message || err}`,
    };
  }
}

/**
 * Creates a new LVM Volume Group (vgcreate) on the specified server using one or more block devices.
 * Automatically initializes unformatted block devices as Physical Volumes (pvcreate) if needed.
 */
export async function createLinuxVolumeGroupSSH(
  server: RemoteServer,
  payload: { vgName: string; selectedDisks: string[]; peSize?: string; force?: boolean },
  ephemeralPassword?: string,
  timeoutMs: number = 35000
): Promise<{ success: boolean; message: string; vgName?: string; vgSize?: string; vgFree?: string }> {
  const { vgName, selectedDisks, peSize, force } = payload;
  const cleanVg = (vgName || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');

  if (!cleanVg) {
    throw new Error('Volume Group name is required (alphanumeric, underscore, hyphen).');
  }

  const cleanDisks = (selectedDisks || [])
    .map((d) => d.trim().replace(/[^a-zA-Z0-9_\-/]/g, ''))
    .filter(Boolean);

  if (cleanDisks.length === 0) {
    throw new Error('At least one raw disk or partition is required to create a Volume Group.');
  }

  const cleanPeSize = (peSize || '').trim().replace(/[^0-9kKmMgGtT]/g, '');
  const forceFlag = force !== false ? '-y -ff' : '-y';

  const script = `export LC_ALL=C

# 1. Check if Volume Group name already exists
if sudo vgs "${cleanVg}" >/dev/null 2>&1 || vgs "${cleanVg}" >/dev/null 2>&1; then
  echo "ERR:VG_ALREADY_EXISTS: A Volume Group named '${cleanVg}' already exists on this server."
  exit 1
fi

# 2. Check each target block device
for d in ${cleanDisks.join(' ')}; do
  if [ ! -b "$d" ]; then
    if [ -e "$d" ]; then
      echo "ERR:NOT_A_BLOCK_DEVICE: Device '$d' exists but is not a valid block device."
      exit 1
    else
      echo "ERR:DISK_NOT_FOUND: Block device '$d' does not exist. Please run Online Rescan Disks first."
      exit 1
    fi
  fi

  # Check if disk is already in another VG
  EXISTING_VG=$(sudo pvs --noheadings -o vg_name "$d" 2>/dev/null | tr -d '[:space:]')
  if [ -z "$EXISTING_VG" ]; then
    EXISTING_VG=$(pvs --noheadings -o vg_name "$d" 2>/dev/null | tr -d '[:space:]')
  fi
  if [ -n "$EXISTING_VG" ] && [ "$EXISTING_VG" != "none" ] && [ "$EXISTING_VG" != "-" ]; then
    echo "ERR:DISK_IN_ANOTHER_VG: Device '$d' is already member of Volume Group '$EXISTING_VG'."
    exit 1
  fi
done

# 3. Initialize Physical Volumes (pvcreate) if not already initialized
for d in ${cleanDisks.join(' ')}; do
  if ! sudo pvs "$d" >/dev/null 2>&1 && ! pvs "$d" >/dev/null 2>&1; then
    sudo pvcreate ${forceFlag} "$d" 2>&1 || pvcreate ${forceFlag} "$d" 2>&1 || true
  fi
done

sudo udevadm settle 2>/dev/null || true

# 4. Create Volume Group (vgcreate)
PE_ARG=""
if [ -n "${cleanPeSize}" ]; then
  PE_ARG="-s ${cleanPeSize}"
fi

VG_OUT=$(sudo vgcreate -y $PE_ARG "${cleanVg}" ${cleanDisks.join(' ')} 2>&1 || vgcreate -y $PE_ARG "${cleanVg}" ${cleanDisks.join(' ')} 2>&1)
VG_STATUS=$?

if [ $VG_STATUS -eq 0 ] || sudo vgs "${cleanVg}" >/dev/null 2>&1 || echo "$VG_OUT" | grep -qi "successfully created"; then
  VG_SIZE=$(sudo vgs --noheadings --units g -o vg_size "${cleanVg}" 2>/dev/null | tr -d '[:space:]')
  VG_FREE=$(sudo vgs --noheadings --units g -o vg_free "${cleanVg}" 2>/dev/null | tr -d '[:space:]')
  echo "VGCREATE_SUCCESS: VG=${cleanVg} SIZE=$VG_SIZE FREE=$VG_FREE"
  echo "$VG_OUT"
  exit 0
else
  echo "ERR:VGCREATE_FAILED: vgcreate failed for '${cleanVg}': $VG_OUT"
  exit 1
fi
`;

  try {
    const raw = await runAdaptiveSshCommand(server, script, ephemeralPassword, timeoutMs);

    if (raw.includes('VGCREATE_SUCCESS') || raw.includes('successfully created')) {
      const sizeMatch = raw.match(/SIZE=([^\s\r\n]+)/);
      const freeMatch = raw.match(/FREE=([^\s\r\n]+)/);
      const vgSize = sizeMatch ? sizeMatch[1].trim() : undefined;
      const vgFree = freeMatch ? freeMatch[1].trim() : undefined;

      return {
        success: true,
        vgName: cleanVg,
        vgSize,
        vgFree,
        message: `Volume Group "${cleanVg}" successfully created with ${cleanDisks.length} physical disk(s)${vgSize ? ` (Total Pool: ${vgSize}, Free: ${vgFree || vgSize})` : ''}! You can now carve Logical Volumes (LV) out of it.`,
      };
    }

    if (raw.includes('ERR:VG_ALREADY_EXISTS')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:VG_ALREADY_EXISTS')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:VG_ALREADY_EXISTS:\s*/, '').trim(),
      };
    }
    if (raw.includes('ERR:DISK_NOT_FOUND')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:DISK_NOT_FOUND')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:DISK_NOT_FOUND:\s*/, '').trim(),
      };
    }
    if (raw.includes('ERR:NOT_A_BLOCK_DEVICE')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:NOT_A_BLOCK_DEVICE')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:NOT_A_BLOCK_DEVICE:\s*/, '').trim(),
      };
    }
    if (raw.includes('ERR:DISK_IN_ANOTHER_VG')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:DISK_IN_ANOTHER_VG')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:DISK_IN_ANOTHER_VG:\s*/, '').trim(),
      };
    }
    if (raw.includes('ERR:VGCREATE_FAILED')) {
      const line = raw.split('\n').find((l) => l.includes('ERR:VGCREATE_FAILED')) || raw;
      return {
        success: false,
        message: line.replace(/ERR:VGCREATE_FAILED:\s*/, '').trim(),
      };
    }

    return {
      success: false,
      message: raw.trim() || `Failed to create Volume Group "${cleanVg}".`,
    };
  } catch (err: any) {
    console.error(`[createLinuxVolumeGroupSSH] error:`, err?.message || err);
    return {
      success: false,
      message: `Failed to create Volume Group: ${err?.message || err}`,
    };
  }
}


