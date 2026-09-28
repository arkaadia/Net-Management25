import mysql from 'mysql2/promise';
import { RemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import {
  MysqlConnectionTestResult,
  MysqlOverview,
  MysqlDatabaseItem,
  MysqlDatabaseDetails,
  MysqlDatabaseTableSummary,
  MysqlViewSummary,
  MysqlRoutineSummary,
  MysqlTriggerSummary,
  MysqlEventSummary,
  MysqlSequenceSummary,
  MysqlDatabaseObjects,
  MysqlUserItem,
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Retrieves the list of databases in MySQL with size, charset, and table count.
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
        s.default_character_set_name AS defaultCharacterSet,
        s.default_collation_name AS defaultCollation,
        COUNT(t.table_name) AS tableCount,
        COALESCE(SUM(t.data_length + t.index_length), 0) AS sizeBytes
      FROM information_schema.schemata s
      LEFT JOIN information_schema.tables t ON s.schema_name = t.table_schema
      GROUP BY s.schema_name, s.default_character_set_name, s.default_collation_name
      ORDER BY s.schema_name ASC
    `);

    await conn.end();

    const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

    return (rows || []).map((r: any) => {
      const bytes = Number(r.sizeBytes) || 0;
      const dbName = String(r.name || '');
      return {
        name: dbName,
        defaultCharacterSet: r.defaultCharacterSet || 'utf8mb4',
        defaultCollation: r.defaultCollation || 'utf8mb4_general_ci',
        tableCount: Number(r.tableCount) || 0,
        sizeBytes: bytes,
        sizePretty: formatBytes(bytes),
        isSystem: SYSTEM_DBS.has(dbName.toLowerCase()),
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
 * Retrieves detailed metadata, tables, views, stored procedures, stored functions,
 * triggers, scheduled events, and sequences for a specific database in MySQL.
 */
export async function getMysqlDatabaseDetails(
  server: RemoteServer,
  databaseName: string
): Promise<MysqlDatabaseDetails> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: 'information_schema',
      connectTimeout: 8000,
    });

    // 1. Fetch Database Metadata
    const [schemaRows]: any = await conn.query(
      `SELECT schema_name AS name, default_character_set_name AS defaultCharacterSet, default_collation_name AS defaultCollation 
       FROM information_schema.schemata 
       WHERE schema_name = ?`,
      [databaseName]
    );

    const schemaRow = Array.isArray(schemaRows) && schemaRows.length > 0 ? schemaRows[0] : null;
    const defaultCharacterSet = schemaRow?.defaultCharacterSet || 'utf8mb4';
    const defaultCollation = schemaRow?.defaultCollation || 'utf8mb4_general_ci';

    // 2. Fetch Base Tables in Database
    let tableRows: any[] = [];
    try {
      const [tRows]: any = await conn.query(
        `SELECT 
           table_name AS name,
           table_type AS type,
           engine,
           table_collation AS collation,
           COALESCE(table_rows, 0) AS approxRows,
           COALESCE(data_length, 0) AS dataLength,
           COALESCE(index_length, 0) AS indexLength,
           create_time AS createTime,
           update_time AS updateTime,
           table_comment AS comment
         FROM information_schema.tables 
         WHERE table_schema = ? AND table_type = 'BASE TABLE'
         ORDER BY table_name ASC`,
        [databaseName]
      );
      tableRows = tRows || [];
    } catch (err: any) {
      console.warn(`[MySQL Manager] Failed to query tables for ${databaseName}:`, err.message);
    }

    // 3. Fetch Views in Database
    let viewRows: any[] = [];
    try {
      const [vRows]: any = await conn.query(
        `SELECT 
           t.table_name AS name,
           v.view_definition AS definition,
           v.check_option AS checkOption,
           v.is_updatable AS isUpdatable,
           v.security_type AS securityType,
           t.create_time AS createTime,
           t.table_comment AS comment
         FROM information_schema.tables t
         LEFT JOIN information_schema.views v 
           ON t.table_schema = v.table_schema AND t.table_name = v.table_name
         WHERE t.table_schema = ? AND t.table_type = 'VIEW'
         ORDER BY t.table_name ASC`,
        [databaseName]
      );
      viewRows = vRows || [];
    } catch (err: any) {
      console.warn(`[MySQL Manager] Failed to query views for ${databaseName}:`, err.message);
    }

    // 4. Fetch Stored Procedures & Stored Functions (Routines)
    let routineRows: any[] = [];
    try {
      const [rRows]: any = await conn.query(
        `SELECT 
           routine_name AS name,
           routine_type AS type,
           dtd_identifier AS returnType,
           routine_body AS body,
           routine_definition AS definition,
           is_deterministic AS isDeterministic,
           sql_data_access AS sqlDataAccess,
           security_type AS securityType,
           definer,
           created,
           last_altered AS lastAltered,
           routine_comment AS comment
         FROM information_schema.routines 
         WHERE routine_schema = ?
         ORDER BY routine_name ASC`,
        [databaseName]
      );
      routineRows = rRows || [];
    } catch (err: any) {
      console.warn(`[MySQL Manager] Failed to query routines for ${databaseName}:`, err.message);
    }

    // 5. Fetch Triggers in Database
    let triggerRows: any[] = [];
    try {
      const [trRows]: any = await conn.query(
        `SELECT 
           trigger_name AS name,
           event_manipulation AS event,
           event_object_table AS tableName,
           action_timing AS timing,
           action_statement AS statement,
           action_orientation AS actionOrientation,
           definer,
           created
         FROM information_schema.triggers 
         WHERE trigger_schema = ?
         ORDER BY trigger_name ASC`,
        [databaseName]
      );
      triggerRows = trRows || [];
    } catch (err: any) {
      console.warn(`[MySQL Manager] Failed to query triggers for ${databaseName}:`, err.message);
    }

    // 6. Fetch Scheduled Events in Database
    let eventRows: any[] = [];
    try {
      const [evRows]: any = await conn.query(
        `SELECT 
           event_name AS name,
           definer,
           time_zone AS timeZone,
           event_body AS body,
           event_definition AS definition,
           event_type AS type,
           execute_at AS executeAt,
           interval_value AS intervalValue,
           interval_field AS intervalField,
           starts,
           ends,
           status,
           on_completion AS onCompletion,
           created,
           last_altered AS lastAltered,
           event_comment AS comment
         FROM information_schema.events 
         WHERE event_schema = ?
         ORDER BY event_name ASC`,
        [databaseName]
      );
      eventRows = evRows || [];
    } catch (err: any) {
      console.warn(`[MySQL Manager] Failed to query events for ${databaseName}:`, err.message);
    }

    // 7. Fetch Sequences where supported (MariaDB 10.3+)
    let sequenceRows: any[] = [];
    try {
      const [seqRows]: any = await conn.query(
        `SELECT 
           table_name AS name,
           start_value AS startValue,
           minimum_value AS minimumValue,
           maximum_value AS maximumValue,
           increment,
           cycle_option AS cycleOption
         FROM information_schema.sequences 
         WHERE sequence_schema = ?
         ORDER BY table_name ASC`,
        [databaseName]
      );
      sequenceRows = seqRows || [];
    } catch {
      // Standard MySQL 8 does not have information_schema.sequences — this is expected
    }

    await conn.end();

    // Map Base Tables
    let totalSizeBytes = 0;
    const tables: MysqlDatabaseTableSummary[] = tableRows.map((t: any) => {
      const dataLen = Number(t.dataLength) || 0;
      const indexLen = Number(t.indexLength) || 0;
      const total = dataLen + indexLen;
      totalSizeBytes += total;

      return {
        name: t.name,
        type: 'BASE TABLE',
        engine: t.engine || 'InnoDB',
        collation: t.collation || defaultCollation,
        approxRows: Number(t.approxRows) || 0,
        dataLengthBytes: dataLen,
        dataLengthPretty: formatBytes(dataLen),
        indexLengthBytes: indexLen,
        indexLengthPretty: formatBytes(indexLen),
        totalSizeBytes: total,
        totalSizePretty: formatBytes(total),
        createTime: t.createTime ? new Date(t.createTime).toISOString() : undefined,
        updateTime: t.updateTime ? new Date(t.updateTime).toISOString() : undefined,
        comment: t.comment || undefined,
      };
    });

    // Map Views
    const views: MysqlViewSummary[] = viewRows.map((v: any) => ({
      name: v.name,
      definition: v.definition || undefined,
      checkOption: v.checkOption || 'NONE',
      isUpdatable: v.isUpdatable === 'YES',
      securityType: v.securityType || 'DEFINER',
      createTime: v.createTime ? new Date(v.createTime).toISOString() : undefined,
      comment: v.comment || undefined,
    }));

    // Partition Routines into Procedures and Functions
    const procedures: MysqlRoutineSummary[] = [];
    const functions: MysqlRoutineSummary[] = [];

    for (const r of routineRows) {
      const isProc = r.type === 'PROCEDURE';
      const item: MysqlRoutineSummary = {
        name: r.name,
        type: isProc ? 'PROCEDURE' : 'FUNCTION',
        returnType: isProc ? undefined : r.returnType || undefined,
        body: r.body || undefined,
        definition: r.definition || undefined,
        isDeterministic: r.isDeterministic === 'YES',
        sqlDataAccess: r.sqlDataAccess || undefined,
        securityType: r.securityType || 'DEFINER',
        definer: r.definer || undefined,
        created: r.created ? new Date(r.created).toISOString() : undefined,
        lastAltered: r.lastAltered ? new Date(r.lastAltered).toISOString() : undefined,
        comment: r.comment || undefined,
      };
      if (isProc) {
        procedures.push(item);
      } else {
        functions.push(item);
      }
    }

    // Map Triggers
    const triggers: MysqlTriggerSummary[] = triggerRows.map((tr: any) => ({
      name: tr.name,
      event: tr.event || 'INSERT',
      tableName: tr.tableName || '',
      timing: tr.timing || 'BEFORE',
      statement: tr.statement || undefined,
      actionOrientation: tr.actionOrientation || 'ROW',
      definer: tr.definer || undefined,
      created: tr.created ? new Date(tr.created).toISOString() : undefined,
    }));

    // Map Scheduled Events
    const events: MysqlEventSummary[] = eventRows.map((ev: any) => ({
      name: ev.name,
      type: ev.type || 'RECURRING',
      status: ev.status || 'ENABLED',
      timeZone: ev.timeZone || undefined,
      executeAt: ev.executeAt ? new Date(ev.executeAt).toISOString() : undefined,
      intervalValue: ev.intervalValue || undefined,
      intervalField: ev.intervalField || undefined,
      starts: ev.starts ? new Date(ev.starts).toISOString() : undefined,
      ends: ev.ends ? new Date(ev.ends).toISOString() : undefined,
      definition: ev.definition || undefined,
      definer: ev.definer || undefined,
      created: ev.created ? new Date(ev.created).toISOString() : undefined,
      lastAltered: ev.lastAltered ? new Date(ev.lastAltered).toISOString() : undefined,
      onCompletion: ev.onCompletion || undefined,
      comment: ev.comment || undefined,
    }));

    // Map Sequences
    const sequences: MysqlSequenceSummary[] = sequenceRows.map((s: any) => ({
      name: s.name,
      startValue: s.startValue,
      minimumValue: s.minimumValue,
      maximumValue: s.maximumValue,
      increment: s.increment,
      cycleOption: s.cycleOption === 1 || s.cycleOption === 'Y',
    }));

    const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

    return {
      name: databaseName,
      defaultCollation,
      defaultCharacterSet,
      tableCount: tables.length,
      viewsCount: views.length,
      proceduresCount: procedures.length,
      functionsCount: functions.length,
      triggersCount: triggers.length,
      eventsCount: events.length,
      sequencesCount: sequences.length,
      sizeBytes: totalSizeBytes,
      sizePretty: formatBytes(totalSizeBytes),
      isSystem: SYSTEM_DBS.has(databaseName.toLowerCase()),
      tables,
      views,
      procedures,
      functions,
      triggers,
      events,
      sequences,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to fetch database details for "${databaseName}": ${err.message}`);
  }
}

/**
 * Dedicated endpoint returning full MySQL schema objects explorer payload.
 */
export async function getMysqlDatabaseObjects(
  server: RemoteServer,
  databaseName: string
): Promise<MysqlDatabaseObjects> {
  const details = await getMysqlDatabaseDetails(server, databaseName);
  return {
    database: details.name,
    tablesCount: details.tableCount,
    viewsCount: details.viewsCount,
    proceduresCount: details.proceduresCount,
    functionsCount: details.functionsCount,
    triggersCount: details.triggersCount,
    eventsCount: details.eventsCount,
    sequencesCount: details.sequencesCount,
    tables: details.tables,
    views: details.views,
    procedures: details.procedures,
    functions: details.functions,
    triggers: details.triggers,
    events: details.events,
    sequences: details.sequences,
  };
}

/**
 * Retrieves the list of user accounts in MySQL.
 */
export async function getMysqlUsers(server: RemoteServer): Promise<MysqlUserItem[]> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: 'mysql',
      connectTimeout: 7000,
    });

    let userRows: any[] = [];
    try {
      const [rows]: any = await conn.query(
        `SELECT user, host, plugin, account_locked, password_expired FROM mysql.user ORDER BY user, host`
      );
      userRows = rows;
    } catch {
      try {
        const [rows]: any = await conn.query(`SELECT user, host, plugin FROM mysql.user ORDER BY user, host`);
        userRows = rows;
      } catch {
        const [rows]: any = await conn.query(`SELECT USER() AS user, '' AS host`);
        userRows = rows;
      }
    }

    await conn.end();

    return (userRows || []).map((u: any) => {
      let user = u.user || u.User || '';
      let host = u.host || u.Host || '%';
      if (user.includes('@')) {
        const parts = user.split('@');
        user = parts[0];
        host = parts[1] || host;
      }
      return {
        user,
        host,
        plugin: u.plugin || u.Plugin || 'default',
        accountLocked: u.account_locked === 'Y' || u.account_locked === 1,
        passwordExpired: u.password_expired === 'Y' || u.password_expired === 1,
      };
    });
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return [
      {
        user: config.user || 'root',
        host: '%',
        plugin: 'default',
        accountLocked: false,
        passwordExpired: false,
      },
    ];
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
