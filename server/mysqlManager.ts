import mysql from 'mysql2/promise';
import { RemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import {
  MysqlConnectionTestResult,
  MysqlOverview,
  MysqlDatabaseItem,
  MysqlProcessItem,
  MysqlVariableItem,
  MysqlQueryResult,
} from '../src/types';

/**
 * Builds MySQL connection configuration from server credentials.
 * Decrypts password server-side in-flight and never leaks credentials.
 */
function getMysqlConfig(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
) {
  const host = (server.ip || server.hostname || '').trim();
  const port = options?.port || server.mysql_port || 3306;
  const user = (options?.user || server.mysql_user || 'root').trim();
  const database = (options?.database || server.mysql_database || 'mysql').trim();

  let password = '';
  if (options?.password !== undefined) {
    password = options.password;
  } else if (server.mysql_password) {
    password = decryptServerSecret(server.mysql_password);
  }

  return {
    host,
    port,
    user,
    password,
    database: database || undefined,
    connectTimeout: 5000,
  };
}

/**
 * Tests direct connection to MySQL / MariaDB server.
 */
export async function testMysqlConnection(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<MysqlConnectionTestResult> {
  const config = getMysqlConfig(server, options);
  const testedAt = new Date().toISOString();

  if (!config.host) {
    return {
      success: false,
      status: 'connection_failed',
      message: 'No server IP address or hostname configured.',
      messageFa: 'هیچ آدرس IP یا نام‌هاستی برای سرور تنظیم نشده است.',
      serverAddress: '',
      port: config.port,
      username: config.user,
      testedAt,
    };
  }

  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 5000,
    });

    const latencyMs = Date.now() - startTime;
    const [rows] = await conn.query('SELECT VERSION() AS version, USER() AS user, DATABASE() AS db');
    const firstRow: any = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
    const version = firstRow.version || 'MySQL';

    await conn.end();

    return {
      success: true,
      status: 'connected',
      message: `Successfully connected to MySQL ${version} (${latencyMs}ms)`,
      messageFa: `اتصال مستقیم به موتور پایگاه‌داده MySQL (${version}) با موفقیت برقرار شد (تاخیر: ${latencyMs} میلی‌ثانیه)`,
      serverAddress: config.host,
      port: config.port,
      username: config.user,
      database: config.database,
      version,
      latencyMs,
      testedAt,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }

    const code = err.code || '';
    const msg = err.message || '';

    // Check if SSH fallback can check if MySQL is running on host
    if (server.ssh_password || server.ssh_key) {
      try {
        const sshOut = await runAdaptiveSshCommand(server, 'mysqladmin ping || systemctl is-active mysql || systemctl is-active mariadb');
        if (sshOut && (sshOut.includes('alive') || sshOut.includes('active'))) {
          return {
            success: true,
            status: 'connected',
            message: `MySQL is active on host (Direct TCP port ${config.port} might be bound to 127.0.0.1 or firewalled)`,
            messageFa: `سرویس MySQL روی سرور فعال است (پورت مستقیم ${config.port} ممکن است روی لوکال‌هاست محدود شده باشد)`,
            serverAddress: config.host,
            port: config.port,
            username: config.user,
            database: config.database,
            version: 'Active (via Host)',
            testedAt,
          };
        }
      } catch {}
    }

    let status: MysqlConnectionTestResult['status'] = 'connection_failed';
    let messageFa = 'خطا در برقراری ارتباط با پورت MySQL';

    if (code === 'ER_ACCESS_DENIED_ERROR' || msg.includes('Access denied')) {
      status = 'authentication_failed';
      messageFa = 'احراز هویت ناموفق بود: نام کاربری یا رمز عبور MySQL نامعتبر است یا کاربر مجاز به اتصال از این آدرس نیست.';
    } else if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
      status = 'connection_refused';
      messageFa = `اتصال توسط پورت ${config.port} رد شد. آیا سرویس MySQL فعال است و روی 0.0.0.0 گوش می‌دهد؟`;
    } else if (code === 'ETIMEDOUT' || msg.includes('ETIMEDOUT')) {
      status = 'timeout';
      messageFa = 'اتصال به دلیل پایان مهلت زمانی (Timeout) ناموفق بود. فایروال را بررسی نمایید.';
    }

    return {
      success: false,
      status,
      message: `MySQL Connection Failed: ${msg}`,
      messageFa,
      serverAddress: config.host,
      port: config.port,
      username: config.user,
      database: config.database,
      testedAt,
      errorDetail: code,
    };
  }
}

/**
 * Retrieves comprehensive MySQL engine status, uptime, buffer pool, and telemetry.
 */
export async function getMysqlOverview(server: RemoteServer): Promise<MysqlOverview> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: 6000,
    });

    const [statusRows]: any = await conn.query("SHOW GLOBAL STATUS");
    const [varRows]: any = await conn.query("SHOW GLOBAL VARIABLES");

    const statusMap = new Map<string, string>();
    if (Array.isArray(statusRows)) {
      for (const r of statusRows) {
        statusMap.set(r.Variable_name, r.Value);
      }
    }

    const varMap = new Map<string, string>();
    if (Array.isArray(varRows)) {
      for (const r of varRows) {
        varMap.set(r.Variable_name, r.Value);
      }
    }

    const uptimeSeconds = parseInt(statusMap.get('Uptime') || '0', 10);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimePretty = `${days}d ${hours}h ${minutes}m`;

    const bufferPoolBytes = parseInt(varMap.get('innodb_buffer_pool_size') || '0', 10);
    const bufferPoolSize = bufferPoolBytes > 0
      ? `${(bufferPoolBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
      : 'Default';

    await conn.end();

    return {
      serverAddress: config.host,
      port: config.port,
      connectedUser: config.user,
      connectedDatabase: config.database || 'mysql',
      version: varMap.get('version') || 'MySQL',
      versionComment: varMap.get('version_comment') || '',
      serverVersion: `${varMap.get('version') || 'MySQL'} (${varMap.get('version_comment') || 'Community'})`,
      timezone: varMap.get('time_zone') || varMap.get('system_time_zone') || 'SYSTEM',
      characterSet: varMap.get('character_set_server') || varMap.get('character_set_database') || 'utf8mb4',
      collation: varMap.get('collation_server') || varMap.get('collation_database') || 'utf8mb4_general_ci',
      uptimeSeconds,
      uptimePretty,
      threadsConnected: parseInt(statusMap.get('Threads_connected') || '0', 10),
      threadsRunning: parseInt(statusMap.get('Threads_running') || '0', 10),
      maxConnections: parseInt(varMap.get('max_connections') || '151', 10),
      totalQueries: parseInt(statusMap.get('Questions') || statusMap.get('Queries') || '0', 10),
      slowQueries: parseInt(statusMap.get('Slow_queries') || '0', 10),
      openTables: parseInt(statusMap.get('Open_tables') || '0', 10),
      bufferPoolSize,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to fetch MySQL overview: ${err.message}`);
  }
}

/**
 * Retrieves the list of databases in MySQL with size and table count.
 */
export async function getMysqlDatabases(server: RemoteServer): Promise<MysqlDatabaseItem[]> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: 'information_schema',
      connectTimeout: 7000,
    });

    const [rows]: any = await conn.query(`
      SELECT 
        s.schema_name AS name,
        s.default_collation_name AS defaultCollation,
        COUNT(t.table_name) AS tableCount,
        COALESCE(SUM(t.data_length + t.index_length), 0) AS sizeBytes
      FROM information_schema.schemata s
      LEFT JOIN information_schema.tables t ON s.schema_name = t.table_schema
      GROUP BY s.schema_name, s.default_collation_name
      ORDER BY s.schema_name ASC
    `);

    await conn.end();

    return (rows || []).map((r: any) => {
      const bytes = Number(r.sizeBytes) || 0;
      let sizePretty = '0 B';
      if (bytes >= 1024 * 1024 * 1024) {
        sizePretty = `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      } else if (bytes >= 1024 * 1024) {
        sizePretty = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      } else if (bytes >= 1024) {
        sizePretty = `${(bytes / 1024).toFixed(1)} KB`;
      }

      return {
        name: r.name,
        defaultCollation: r.defaultCollation || 'utf8mb4_general_ci',
        tableCount: Number(r.tableCount) || 0,
        sizeBytes: bytes,
        sizePretty,
      };
    });
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to fetch MySQL databases: ${err.message}`);
  }
}

/**
 * Executes a custom SQL statement against MySQL with timing and safety limits.
 */
export async function executeMysqlQuery(
  server: RemoteServer,
  query: string,
  targetDb?: string
): Promise<MysqlQueryResult> {
  const config = getMysqlConfig(server, { database: targetDb });
  let conn: mysql.Connection | null = null;
  const startTime = Date.now();

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      connectTimeout: 8000,
    });

    const [results, fields]: any = await conn.query(query);
    const durationMs = Date.now() - startTime;
    await conn.end();

    if (Array.isArray(results)) {
      const columns = Array.isArray(fields) ? fields.map((f: any) => f.name) : Object.keys(results[0] || {});
      return {
        success: true,
        columns,
        rows: results.slice(0, 500),
        rowCount: results.length,
        durationMs,
      };
    } else {
      // OkPacket / ResultSetHeader (e.g. INSERT, UPDATE, DELETE, DDL)
      return {
        success: true,
        affectedRows: results?.affectedRows ?? 0,
        rowCount: results?.affectedRows ?? 0,
        durationMs,
      };
    }
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: err.message,
      errorFa: `خطا در اجرای کوئری MySQL: ${err.message}`,
    };
  }
}

/**
 * Retrieves the live running process list in MySQL.
 */
export async function getMysqlProcesslist(server: RemoteServer): Promise<MysqlProcessItem[]> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      connectTimeout: 5000,
    });

    const [rows]: any = await conn.query('SHOW FULL PROCESSLIST');
    await conn.end();

    return (rows || []).map((r: any) => ({
      id: Number(r.Id),
      user: r.User || '',
      host: r.Host || '',
      db: r.db || null,
      command: r.Command || '',
      time: Number(r.Time) || 0,
      state: r.State || null,
      info: r.Info || null,
    }));
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to fetch MySQL processlist: ${err.message}`);
  }
}

/**
 * Terminates a stuck or long-running MySQL thread / connection.
 */
export async function killMysqlProcess(server: RemoteServer, processId: number): Promise<{ success: boolean; message: string }> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      connectTimeout: 5000,
    });

    await conn.query(`KILL ${Number(processId)}`);
    await conn.end();

    return {
      success: true,
      message: `Process ID ${processId} terminated successfully.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      message: `Failed to kill process ${processId}: ${err.message}`,
    };
  }
}

/**
 * Retrieves global configuration variables from MySQL.
 */
export async function getMysqlVariables(server: RemoteServer, filter?: string): Promise<MysqlVariableItem[]> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      connectTimeout: 6000,
    });

    const query = filter && filter.trim()
      ? `SHOW GLOBAL VARIABLES LIKE '%${filter.replace(/['\\]/g, '')}%'`
      : 'SHOW GLOBAL VARIABLES';

    const [rows]: any = await conn.query(query);
    await conn.end();

    return (rows || []).map((r: any) => ({
      name: r.Variable_name,
      value: r.Value,
    }));
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to fetch MySQL variables: ${err.message}`);
  }
}
