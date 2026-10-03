import path from 'path';
import fs from 'fs';
import { execSync, spawn, ChildProcess } from 'child_process';

export type SshVersionMode = 'legacy' | 'modern';

export interface SshBackendResolution {
  version: SshVersionMode;
  pythonBin: string;
  scriptPath: string;
  venvDir: string;
  paramikoExpected: string;
  env: NodeJS.ProcessEnv;
}

// Safely determine project root
const getCurrentDir = () => (typeof __dirname !== 'undefined' ? __dirname : process.cwd());
const curDir = getCurrentDir();
const projectRoot =
  path.basename(curDir) === 'dist' || path.basename(curDir) === 'server'
    ? path.resolve(curDir, '..')
    : curDir;

export const LEGACY_PYTHON_BIN = path.join(projectRoot, 'backend', 'venv_legacy', 'bin', 'python3');
export const MODERN_PYTHON_BIN = path.join(projectRoot, 'backend', 'venv_modern', 'bin', 'python3');
export const SSH_BRIDGE_SCRIPT = path.join(projectRoot, 'backend', 'ssh_bridge.py');

/**
 * Single Authoritative Backend Resolver:
 * Given an ssh_version value ("legacy" | "modern"), returns the correct
 * Python executable and script. All SSH code paths (Test & Fetch, Terminal,
 * Port modal) must use this resolver, with strictly NO fallback to system Python.
 */
export function resolveSshBackend(sshVersion?: string | null): SshBackendResolution {
  const clean = String(sshVersion || '').toLowerCase().trim();
  const version: SshVersionMode = clean.includes('modern') ? 'modern' : 'legacy';

  const venvDirName = version === 'modern' ? 'venv_modern' : 'venv_legacy';
  const venvDir = path.join(projectRoot, 'backend', venvDirName);
  const pythonBin = path.join(venvDir, 'bin', 'python3');
  const scriptPath = SSH_BRIDGE_SCRIPT;

  // Auto-provision if missing; strictly NEVER fall back to system Python
  if (!fs.existsSync(pythonBin)) {
    console.warn(`[SSH Backend Resolver] Dedicated ${version.toUpperCase()} Python venv not found at '${pythonBin}'. Auto-provisioning...`);
    try {
      const pipInstallArgs =
        version === 'modern'
          ? '"paramiko>=3.4.0" cryptography websockets requests'
          : '"paramiko>=2.12.0,<2.13.0" cryptography websockets requests';
      execSync(
        `python3 -m venv "${venvDir}" && "${pythonBin}" -m pip install ${pipInstallArgs} 2>/dev/null || true`,
        {
          cwd: projectRoot,
          timeout: 60000,
          stdio: 'ignore',
        }
      );
    } catch (e: any) {
      console.warn(`[SSH Backend Resolver] Auto-provision notice: ${e.message}`);
    }
  }

  // Absolute Prohibition of Fallback to System Python
  if (!fs.existsSync(pythonBin)) {
    const errMsg = `[SSH Backend Resolver] CRITICAL ERROR: Dedicated ${version.toUpperCase()} Python virtual environment with Paramiko not found at '${pythonBin}'. Fallback to system /usr/bin/python3 or any other system Paramiko is strictly prohibited.`;
    console.error(errMsg);
    throw new Error(errMsg);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VIRTUAL_ENV: venvDir,
    PATH: `${path.join(venvDir, 'bin')}:${process.env.PATH}`,
    SSH_BACKEND_MODE: version,
    PYTHONUNBUFFERED: '1',
  };

  return {
    version,
    pythonBin,
    scriptPath,
    venvDir,
    paramikoExpected: version === 'modern' ? '>=3.4.0' : '2.12.x',
    env,
  };
}

/**
 * Executes an authentic SSH Bridge action (test-connection, ports-sync)
 * using the designated virtual environment without fallback.
 */
export async function executeSshBridgeAction(
  action: 'test-connection' | 'probe' | 'ports-sync' | 'info',
  payload: any,
  sshVersion?: string | null,
  timeoutMs: number = 18000
): Promise<any> {
  const backend = resolveSshBackend(sshVersion);

  return new Promise((resolve, reject) => {
    const proc = spawn(backend.pythonBin, [backend.scriptPath, action], {
      cwd: projectRoot,
      env: backend.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill('SIGKILL');
      } catch {}
      reject(new Error(`SSH execution timed out after ${timeoutMs}ms for action '${action}'`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      // Extract JSON from stdout (ignoring deprecation warnings)
      const trimmed = stdout.trim();
      const lastLine = trimmed.split('\n').filter((l) => l.trim().startsWith('{')).pop();
      if (lastLine) {
        try {
          const parsed = JSON.parse(lastLine);
          return resolve(parsed);
        } catch {
          // fallback to full stdout parse
        }
      }

      try {
        const parsed = JSON.parse(trimmed);
        return resolve(parsed);
      } catch {
        if (code !== 0 || !stdout) {
          const errDetail = stderr.trim() || stdout.trim() || `Process exited with code ${code}`;
          return resolve({
            success: false,
            connected: false,
            error: errDetail,
            message: errDetail,
            ssh_version: backend.version,
          });
        }
        resolve({
          success: false,
          error: 'Unparseable response from SSH bridge',
          raw: stdout,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Write input payload via stdin and close stdin
    if (payload !== undefined && payload !== null) {
      const jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      proc.stdin.write(jsonStr);
    }
    proc.stdin.end();
  });
}
