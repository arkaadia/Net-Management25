import mysql from 'mysql2/promise';
import { RemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import { analyzeMysqlSqlSafety, MysqlSqlQuerySafetyReport } from './mysqlSqlSafety';
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
  MysqlColumnStructure,
  MysqlIndexDetail,
  MysqlForeignKeyConstraint,
  MysqlTableMetadataStats,
  MysqlTableStructure,
  MysqlTableDataRequest,
  MysqlTableDataColumnInfo,
  MysqlTableDataResult,
  MysqlRowColumnValue,
  MysqlRowInsertRequest,
  MysqlRowUpdateRequest,
  MysqlRowDeleteRequest,
  MysqlRowMutationResult,
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

export { analyzeMysqlSqlSafety } from './mysqlSqlSafety';

export interface MysqlQueryExecutionOptions {
  confirmedDestructive?: boolean;
  auditNotes?: string;
  maxRows?: number;
}

/**
 * Phase 8 & 9: Executes a custom SQL statement against MySQL with server-side safety guard,
 * risk classification, and timing limits. Destructive operations require explicit confirmation.
 */
export async function executeMysqlQuery(
  server: RemoteServer,
  query: string,
  targetDb?: string,
  options?: MysqlQueryExecutionOptions
): Promise<MysqlQueryResult> {
  const startTime = Date.now();
  if (!query || !query.trim()) {
    return {
      success: false,
      durationMs: 0,
      error: 'Query string cannot be empty.',
      errorFa: 'متن کوئری نمی‌تواند خالی باشد.',
    };
  }

  // Phase 9: Server-Side SQL Safety Guard & Risk Classification
  const safetyReport = analyzeMysqlSqlSafety(query);

  // If query contains destructive operations and user hasn't explicitly confirmed it, block execution server-side
  if (safetyReport.isDestructive && !options?.confirmedDestructive) {
    return {
      success: false,
      requiresConfirmation: true,
      safetyReport,
      durationMs: 0,
      error: `Destructive operation blocked by MySQL Safety Guard: ${safetyReport.destructiveReasons.join('; ')}. Explicit operator confirmation is required.`,
      errorFa: `عملیات مخرب توسط سامانه ایمنی MySQL متوقف شد: ${safetyReport.destructiveReasonsFa.join('؛ ')}. نیاز به تأیید صریح اپراتور دارد.`,
    };
  }

  // If confirmed destructive, log operator audit details
  if (safetyReport.isDestructive && options?.confirmedDestructive) {
    console.log(
      `[MYSQL AUDIT] Destructive query executed on server ${server.name} (${server.ip}), database: ${targetDb || 'default'}, reasons: ${safetyReport.destructiveReasons.join('; ')}, operator notes: ${options.auditNotes || 'None'}`
    );
  }

  const config = getMysqlConfig(server, { database: targetDb });
  let conn: mysql.Connection | null = null;

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

    const maxLimit = options?.maxRows || 1000;

    if (Array.isArray(results)) {
      const columns = Array.isArray(fields) ? fields.map((f: any) => f.name) : Object.keys(results[0] || {});
      const sanitizedRows = results.slice(0, maxLimit).map((r: any) => {
        const sanitized: Record<string, any> = {};
        for (const [k, v] of Object.entries(r || {})) {
          if (v === null || v === undefined) {
            sanitized[k] = null;
          } else if (v instanceof Date) {
            sanitized[k] = v.toISOString();
          } else if (Buffer.isBuffer(v)) {
            sanitized[k] = v.toString('utf-8');
          } else if (typeof v === 'bigint') {
            sanitized[k] = Number(v);
          } else {
            sanitized[k] = v;
          }
        }
        return sanitized;
      });

      return {
        success: true,
        columns,
        rows: sanitizedRows,
        rowCount: results.length,
        durationMs,
        safetyReport,
      };
    } else {
      // OkPacket / ResultSetHeader (e.g. INSERT, UPDATE, DELETE, DDL)
      return {
        success: true,
        affectedRows: results?.affectedRows ?? 0,
        rowCount: results?.affectedRows ?? 0,
        durationMs,
        safetyReport,
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
      safetyReport,
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

/**
 * Phase 5: Retrieves detailed table structure, column definitions, keys,
 * indexes, foreign key constraints, table storage options, and generated DDL.
 */
export async function getMysqlTableStructure(
  server: RemoteServer,
  databaseName: string,
  tableName: string
): Promise<MysqlTableStructure> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: databaseName,
      connectTimeout: 8000,
    });

    // 1. Columns
    const [cols]: any = await conn.query(
      `SELECT 
        COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, 
        DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, 
        COLUMN_TYPE, COLUMN_KEY, EXTRA, COLLATION_NAME, COLUMN_COMMENT 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = ? 
       ORDER BY ORDINAL_POSITION`,
      [databaseName, tableName]
    );

    const primaryKeyColumns: string[] = [];
    const columns: MysqlColumnStructure[] = (cols || []).map((c: any) => {
      const isPk = c.COLUMN_KEY === 'PRI';
      if (isPk) primaryKeyColumns.push(c.COLUMN_NAME);
      return {
        name: c.COLUMN_NAME,
        ordinalPosition: Number(c.ORDINAL_POSITION || 0),
        dataType: c.DATA_TYPE || '',
        columnType: c.COLUMN_TYPE || c.DATA_TYPE || '',
        isNullable: c.IS_NULLABLE === 'YES',
        columnDefault: c.COLUMN_DEFAULT !== null ? String(c.COLUMN_DEFAULT) : null,
        columnKey: c.COLUMN_KEY || '',
        isPrimaryKey: isPk,
        isUniqueKey: c.COLUMN_KEY === 'UNI',
        isIndexed: Boolean(c.COLUMN_KEY && c.COLUMN_KEY !== ''),
        extra: c.EXTRA || '',
        collation: c.COLLATION_NAME || null,
        comment: c.COLUMN_COMMENT || null,
      };
    });

    // 2. Indexes from information_schema.statistics
    const [idxRows]: any = await conn.query(
      `SELECT 
        INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, 
        COLLATION, CARDINALITY, SUB_PART, PACKED, NULLABLE, 
        INDEX_TYPE, COMMENT, INDEX_COMMENT 
       FROM information_schema.statistics 
       WHERE table_schema = ? AND table_name = ? 
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [databaseName, tableName]
    );

    const indexMap = new Map<string, MysqlIndexDetail>();
    for (const r of idxRows || []) {
      const idxName = r.INDEX_NAME;
      if (!indexMap.has(idxName)) {
        indexMap.set(idxName, {
          name: idxName,
          isUnique: Number(r.NON_UNIQUE) === 0,
          isPrimary: idxName === 'PRIMARY',
          indexType: r.INDEX_TYPE || 'BTREE',
          columns: [],
          cardinality: r.CARDINALITY !== null && r.CARDINALITY !== undefined ? Number(r.CARDINALITY) : null,
          comment: r.INDEX_COMMENT || r.COMMENT || null,
        });
      }
      const entry = indexMap.get(idxName)!;
      entry.columns.push({
        name: r.COLUMN_NAME,
        seqInIndex: Number(r.SEQ_IN_INDEX || 1),
        collation: r.COLLATION || undefined,
        subPart: r.SUB_PART !== null && r.SUB_PART !== undefined ? Number(r.SUB_PART) : null,
        nullable: r.NULLABLE || undefined,
      });
    }
    const indexes = Array.from(indexMap.values());

    // 3. Foreign Keys from information_schema.key_column_usage and referential_constraints
    let foreignKeys: MysqlForeignKeyConstraint[] = [];
    try {
      const [fkRows]: any = await conn.query(
        `SELECT 
          kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, 
          kcu.REFERENCED_TABLE_SCHEMA, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
          rc.UPDATE_RULE, rc.DELETE_RULE
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc 
           ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA 
          AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
         WHERE kcu.table_schema = ? AND kcu.table_name = ? 
           AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
        [databaseName, tableName]
      );
      foreignKeys = (fkRows || []).map((fk: any) => ({
        name: fk.CONSTRAINT_NAME,
        column: fk.COLUMN_NAME,
        referencedSchema: fk.REFERENCED_TABLE_SCHEMA || databaseName,
        referencedTable: fk.REFERENCED_TABLE_NAME,
        referencedColumn: fk.REFERENCED_COLUMN_NAME,
        updateRule: fk.UPDATE_RULE || 'NO ACTION',
        deleteRule: fk.DELETE_RULE || 'NO ACTION',
      }));
    } catch {}

    // 4. Table Stats from information_schema.tables
    const [tStats]: any = await conn.query(
      `SELECT 
        TABLE_NAME, ENGINE, VERSION, ROW_FORMAT, TABLE_ROWS, 
        AVG_ROW_LENGTH, DATA_LENGTH, MAX_DATA_LENGTH, INDEX_LENGTH, 
        DATA_FREE, AUTO_INCREMENT, CREATE_TIME, UPDATE_TIME, CHECK_TIME, 
        TABLE_COLLATION, TABLE_COMMENT 
       FROM information_schema.tables 
       WHERE table_schema = ? AND table_name = ?`,
      [databaseName, tableName]
    );

    const statRow = tStats?.[0] || {};
    const dataLen = Number(statRow.DATA_LENGTH || 0);
    const idxLen = Number(statRow.INDEX_LENGTH || 0);
    const dataFree = Number(statRow.DATA_FREE || 0);
    const totalSize = dataLen + idxLen;

    const metadata: MysqlTableMetadataStats = {
      engine: statRow.ENGINE || 'InnoDB',
      version: statRow.VERSION ? Number(statRow.VERSION) : null,
      rowFormat: statRow.ROW_FORMAT || 'Dynamic',
      approxRows: Number(statRow.TABLE_ROWS || 0),
      avgRowLength: Number(statRow.AVG_ROW_LENGTH || 0),
      dataLengthBytes: dataLen,
      dataLengthPretty: formatBytes(dataLen),
      indexLengthBytes: idxLen,
      indexLengthPretty: formatBytes(idxLen),
      totalSizeBytes: totalSize,
      totalSizePretty: formatBytes(totalSize),
      dataFreeBytes: dataFree,
      dataFreePretty: formatBytes(dataFree),
      autoIncrementNext: statRow.AUTO_INCREMENT !== null && statRow.AUTO_INCREMENT !== undefined ? Number(statRow.AUTO_INCREMENT) : null,
      createTime: statRow.CREATE_TIME ? new Date(statRow.CREATE_TIME).toISOString() : null,
      updateTime: statRow.UPDATE_TIME ? new Date(statRow.UPDATE_TIME).toISOString() : null,
      checkTime: statRow.CHECK_TIME ? new Date(statRow.CHECK_TIME).toISOString() : null,
      collation: statRow.TABLE_COLLATION || null,
      comment: statRow.TABLE_COMMENT || null,
    };

    // 5. SHOW CREATE TABLE
    let createTableSql = '';
    try {
      const [createRes]: any = await conn.query(`SHOW CREATE TABLE \`${databaseName.replace(/`/g, '``')}\`.\`${tableName.replace(/`/g, '``')}\``);
      if (createRes && createRes[0]) {
        createTableSql = createRes[0]['Create Table'] || createRes[0]['Create View'] || '';
      }
    } catch (e: any) {
      createTableSql = `-- Failed to fetch SHOW CREATE TABLE: ${e.message}`;
    }

    await conn.end();

    return {
      databaseName,
      tableName,
      metadata,
      columns,
      indexes,
      foreignKeys,
      primaryKeyColumns,
      createTableSql,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to retrieve MySQL table structure for '${databaseName}.${tableName}': ${err.message}`);
  }
}

/**
 * Phase 5: Live paginated data query for MySQL table with filtering, sorting and search.
 */
export async function getMysqlTableData(
  server: RemoteServer,
  request: MysqlTableDataRequest
): Promise<MysqlTableDataResult> {
  const {
    database,
    table,
    page = 1,
    pageSize = 50,
    sortColumn,
    sortDirection = 'ASC',
    search,
    filters = [],
  } = request;

  if (!database || !database.trim()) {
    throw new Error('Database name is required');
  }
  if (!table || !table.trim()) {
    throw new Error('Table name is required');
  }

  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;
  const startTime = Date.now();

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database,
      connectTimeout: 8000,
    });

    // 1. Fetch column info to know valid column names and types
    const [cols]: any = await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, COLUMN_KEY 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = ? 
       ORDER BY ORDINAL_POSITION`,
      [database, table]
    );

    const validColMap = new Map<string, any>();
    const columns: MysqlTableDataColumnInfo[] = (cols || []).map((c: any) => {
      validColMap.set(c.COLUMN_NAME, c);
      return {
        name: c.COLUMN_NAME,
        dataType: c.DATA_TYPE || '',
        columnType: c.COLUMN_TYPE || c.DATA_TYPE || '',
        isPrimaryKey: c.COLUMN_KEY === 'PRI',
      };
    });

    // 2. Build WHERE clauses safely
    const whereClauses: string[] = [];
    const queryParams: any[] = [];

    // Global search across text/varchar/char columns
    if (search && search.trim()) {
      const searchTerms = search.trim();
      const stringCols = columns.filter((c) =>
        ['varchar', 'char', 'text', 'mediumtext', 'longtext', 'tinytext'].includes(c.dataType.toLowerCase())
      );
      if (stringCols.length > 0) {
        const searchOrs = stringCols.map((c) => `\`${c.name.replace(/`/g, '``')}\` LIKE ?`);
        whereClauses.push(`(${searchOrs.join(' OR ')})`);
        for (let i = 0; i < stringCols.length; i++) {
          queryParams.push(`%${searchTerms}%`);
        }
      }
    }

    // Column-level filters
    if (filters && filters.length > 0) {
      for (const f of filters) {
        if (!validColMap.has(f.column)) continue;
        const colEsc = `\`${f.column.replace(/`/g, '``')}\``;
        switch (f.operator) {
          case 'eq':
            whereClauses.push(`${colEsc} = ?`);
            queryParams.push(f.value ?? '');
            break;
          case 'neq':
            whereClauses.push(`${colEsc} != ?`);
            queryParams.push(f.value ?? '');
            break;
          case 'contains':
            whereClauses.push(`${colEsc} LIKE ?`);
            queryParams.push(`%${f.value ?? ''}%`);
            break;
          case 'notContains':
            whereClauses.push(`${colEsc} NOT LIKE ?`);
            queryParams.push(`%${f.value ?? ''}%`);
            break;
          case 'startsWith':
            whereClauses.push(`${colEsc} LIKE ?`);
            queryParams.push(`${f.value ?? ''}%`);
            break;
          case 'endsWith':
            whereClauses.push(`${colEsc} LIKE ?`);
            queryParams.push(`%${f.value ?? ''}`);
            break;
          case 'gt':
            whereClauses.push(`${colEsc} > ?`);
            queryParams.push(f.value ?? '');
            break;
          case 'gte':
            whereClauses.push(`${colEsc} >= ?`);
            queryParams.push(f.value ?? '');
            break;
          case 'lt':
            whereClauses.push(`${colEsc} < ?`);
            queryParams.push(f.value ?? '');
            break;
          case 'lte':
            whereClauses.push(`${colEsc} <= ?`);
            queryParams.push(f.value ?? '');
            break;
          case 'isNull':
            whereClauses.push(`${colEsc} IS NULL`);
            break;
          case 'isNotNull':
            whereClauses.push(`${colEsc} IS NOT NULL`);
            break;
        }
      }
    }

    const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

    // 3. Count total matching rows
    const countSql = `SELECT COUNT(*) as total FROM \`${database.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\`${whereSql}`;
    const [countRows]: any = await conn.query(countSql, queryParams);
    const totalRows = Number(countRows?.[0]?.total || 0);

    // 4. Sort clause (validated column name)
    let orderSql = '';
    if (sortColumn && validColMap.has(sortColumn)) {
      const dir = sortDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderSql = ` ORDER BY \`${sortColumn.replace(/`/g, '``')}\` ${dir}`;
    }

    // 5. Pagination
    const validPage = Math.max(1, page);
    const validPageSize = Math.max(1, Math.min(500, pageSize));
    const offset = (validPage - 1) * validPageSize;

    const dataSql = `SELECT * FROM \`${database.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\`${whereSql}${orderSql} LIMIT ? OFFSET ?`;
    const [rows]: any = await conn.query(dataSql, [...queryParams, validPageSize, offset]);

    await conn.end();
    const executionTimeMs = Date.now() - startTime;

    // Sanitize rows for JSON response (handling Buffer, Date, BigInt)
    const formattedRows = (rows || []).map((row: any) => {
      const sanitized: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) {
          sanitized[k] = null;
        } else if (v instanceof Date) {
          sanitized[k] = v.toISOString();
        } else if (Buffer.isBuffer(v)) {
          sanitized[k] = v.toString('utf-8');
        } else if (typeof v === 'bigint') {
          sanitized[k] = Number(v);
        } else {
          sanitized[k] = v;
        }
      }
      return sanitized;
    });

    return {
      databaseName: database,
      tableName: table,
      columns,
      rows: formattedRows,
      totalRows,
      page: validPage,
      pageSize: validPageSize,
      totalPages: Math.ceil(totalRows / validPageSize) || 1,
      executionTimeMs,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to fetch data for MySQL table '${database}.${table}': ${err.message}`);
  }
}

/**
 * Phase 7: Inserts a single row into a MySQL table within a safe transaction.
 * Supports auto-increment columns, default values, JSON serialization, and NULL flags.
 */
export async function insertMysqlTableRow(
  server: RemoteServer,
  params: MysqlRowInsertRequest
): Promise<MysqlRowMutationResult> {
  const startTime = Date.now();
  const { database, table, values } = params;

  if (!database || !database.trim() || !table || !table.trim()) {
    return {
      success: false,
      operation: 'insert',
      affectedRows: 0,
      error: 'Missing required parameters: database or table.',
      errorFa: 'پارامترهای الزامی نام دیتابیس یا جدول ارسال نشده است.',
    };
  }

  const config = getMysqlConfig(server, {
    port: params.port,
    user: params.user,
    password: params.password,
    database,
  });

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database,
      connectTimeout: 8000,
    });

    // 1. Fetch column catalog to validate column names and types
    const [cols]: any = await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = ?`,
      [database, table]
    );

    if (!cols || cols.length === 0) {
      await conn.end();
      return {
        success: false,
        operation: 'insert',
        affectedRows: 0,
        error: `Table '${database}.${table}' does not exist or has no columns.`,
        errorFa: `جدول '${database}.${table}' یافت نشد یا ستونی ندارد.`,
      };
    }

    const colMap = new Map<string, any>();
    for (const c of cols) {
      colMap.set(c.COLUMN_NAME, c);
    }

    const insertCols: string[] = [];
    const valPlaceholders: string[] = [];
    const queryParams: any[] = [];

    for (const [colName, colVal] of Object.entries(values || {})) {
      const catalogCol = colMap.get(colName);
      if (!catalogCol) continue;

      // If DEFAULT requested or empty auto_increment, omit so MySQL assigns default/generated value
      if (colVal.isDefault) continue;

      const isAutoInc = String(catalogCol.EXTRA || '').toLowerCase().includes('auto_increment');
      if (isAutoInc && (colVal.isNull || colVal.value === '' || colVal.value === undefined || colVal.value === null)) {
        continue;
      }

      insertCols.push(`\`${colName.replace(/`/g, '``')}\``);

      if (colVal.isNull || colVal.value === null || colVal.value === undefined) {
        valPlaceholders.push('NULL');
      } else {
        let finalVal = colVal.value;
        const lowerType = String(catalogCol.DATA_TYPE || '').toLowerCase();

        // If JSON type and passed as object, stringify
        if (lowerType === 'json' && typeof finalVal === 'object' && finalVal !== null) {
          finalVal = JSON.stringify(finalVal);
        } else if ((lowerType.includes('tinyint') || lowerType.includes('bool')) && typeof finalVal === 'boolean') {
          finalVal = finalVal ? 1 : 0;
        } else if (typeof finalVal === 'string' && finalVal.trim() === '') {
          // If empty string on non-textual type and nullable, insert NULL
          if (!lowerType.includes('char') && !lowerType.includes('text')) {
            valPlaceholders.push('NULL');
            continue;
          }
        }

        valPlaceholders.push('?');
        queryParams.push(finalVal);
      }
    }

    const safeDb = `\`${database.replace(/`/g, '``')}\``;
    const safeTbl = `\`${table.replace(/`/g, '``')}\``;

    let insertSql = '';
    if (insertCols.length === 0) {
      insertSql = `INSERT INTO ${safeDb}.${safeTbl} () VALUES ()`;
    } else {
      insertSql = `INSERT INTO ${safeDb}.${safeTbl} (${insertCols.join(', ')}) VALUES (${valPlaceholders.join(', ')})`;
    }

    await conn.beginTransaction();
    const [result]: any = await conn.query(insertSql, queryParams);
    await conn.commit();
    await conn.end();

    return {
      success: true,
      operation: 'insert',
      affectedRows: result.affectedRows ?? 1,
      insertId: result.insertId || undefined,
      executionTimeMs: Date.now() - startTime,
      message: 'Row successfully inserted into table.',
      messageFa: 'سطر جدید با موفقیت در جدول درج شد.',
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      operation: 'insert',
      affectedRows: 0,
      executionTimeMs: Date.now() - startTime,
      error: err.message || 'Error inserting table row',
      errorFa: `خطا در درج سطر جدول: ${err.message}`,
    };
  }
}

/**
 * Phase 7: Updates an identified target row within a safe transaction with strict LIMIT 1 protection.
 * Uses primary key values where available, or full original row matching with MySQL's NULL-safe operator (<=>).
 */
export async function updateMysqlTableRow(
  server: RemoteServer,
  params: MysqlRowUpdateRequest
): Promise<MysqlRowMutationResult> {
  const startTime = Date.now();
  const { database, table, primaryKeyValues, originalRow, updatedValues } = params;

  if (!database || !database.trim() || !table || !table.trim()) {
    return {
      success: false,
      operation: 'update',
      affectedRows: 0,
      error: 'Missing required parameters: database or table.',
      errorFa: 'پارامترهای الزامی نام دیتابیس یا جدول ارسال نشده است.',
    };
  }

  if (!updatedValues || Object.keys(updatedValues).length === 0) {
    return {
      success: false,
      operation: 'update',
      affectedRows: 0,
      error: 'No column changes provided for update.',
      errorFa: 'هیچ مقداری برای به‌روزرسانی ارسال نشده است.',
    };
  }

  // Safety protection: require primary key or original row to prevent mass updates
  const hasPk = primaryKeyValues && Object.keys(primaryKeyValues).length > 0;
  const hasOrig = originalRow && Object.keys(originalRow).length > 0;
  if (!hasPk && !hasOrig) {
    return {
      success: false,
      operation: 'update',
      affectedRows: 0,
      error: 'Safety restriction: Primary key or original row values are required to target the update and prevent mass updates.',
      errorFa: 'محدودیت امنیتی: جهت جلوگیری از ویرایش سراسری، مشخص بودن کلید اصلی یا مقادیر سطر الزامی است.',
    };
  }

  const config = getMysqlConfig(server, {
    port: params.port,
    user: params.user,
    password: params.password,
    database,
  });

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database,
      connectTimeout: 8000,
    });

    // 1. Fetch column catalog to validate column names and types
    const [cols]: any = await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA 
       FROM information_schema.columns 
       WHERE table_schema = ? AND table_name = ?`,
      [database, table]
    );

    if (!cols || cols.length === 0) {
      await conn.end();
      return {
        success: false,
        operation: 'update',
        affectedRows: 0,
        error: `Table '${database}.${table}' does not exist.`,
        errorFa: `جدول '${database}.${table}' یافت نشد.`,
      };
    }

    const colMap = new Map<string, any>();
    for (const c of cols) {
      colMap.set(c.COLUMN_NAME, c);
    }

    // 2. Build SET clause
    const setClauses: string[] = [];
    const setParams: any[] = [];

    for (const [colName, colVal] of Object.entries(updatedValues)) {
      const catalogCol = colMap.get(colName);
      if (!catalogCol) continue;

      const safeCol = `\`${colName.replace(/`/g, '``')}\``;

      if (colVal.isDefault) {
        setClauses.push(`${safeCol} = DEFAULT`);
      } else if (colVal.isNull || colVal.value === null || colVal.value === undefined) {
        setClauses.push(`${safeCol} = NULL`);
      } else {
        let finalVal = colVal.value;
        const lowerType = String(catalogCol.DATA_TYPE || '').toLowerCase();

        if (lowerType === 'json' && typeof finalVal === 'object' && finalVal !== null) {
          finalVal = JSON.stringify(finalVal);
        } else if ((lowerType.includes('tinyint') || lowerType.includes('bool')) && typeof finalVal === 'boolean') {
          finalVal = finalVal ? 1 : 0;
        }

        setClauses.push(`${safeCol} = ?`);
        setParams.push(finalVal);
      }
    }

    if (setClauses.length === 0) {
      await conn.end();
      return {
        success: false,
        operation: 'update',
        affectedRows: 0,
        error: 'No valid columns provided for update.',
        errorFa: 'ستون معتبری جهت به‌روزرسانی ارسال نشده است.',
      };
    }

    // 3. Build WHERE clause with primary key or original row matching
    const whereClauses: string[] = [];
    const whereParams: any[] = [];

    if (hasPk) {
      for (const [pkCol, pkVal] of Object.entries(primaryKeyValues!)) {
        const safePk = `\`${pkCol.replace(/`/g, '``')}\``;
        if (pkVal === null || pkVal === undefined) {
          whereClauses.push(`${safePk} <=> NULL`);
        } else {
          whereClauses.push(`${safePk} = ?`);
          whereParams.push(pkVal);
        }
      }
    } else {
      for (const [col, val] of Object.entries(originalRow!)) {
        if (!colMap.has(col)) continue;
        const safeCol = `\`${col.replace(/`/g, '``')}\``;
        whereClauses.push(`${safeCol} <=> ?`);
        whereParams.push(val === undefined ? null : val);
      }
    }

    const safeDb = `\`${database.replace(/`/g, '``')}\``;
    const safeTbl = `\`${table.replace(/`/g, '``')}\``;

    // Strict safety protection: LIMIT 1 prevents mass updates
    const updateSql = `UPDATE ${safeDb}.${safeTbl} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} LIMIT 1`;

    await conn.beginTransaction();
    const [result]: any = await conn.query(updateSql, [...setParams, ...whereParams]);
    await conn.commit();
    await conn.end();

    return {
      success: true,
      operation: 'update',
      affectedRows: result.affectedRows ?? 1,
      executionTimeMs: Date.now() - startTime,
      message: 'Row successfully updated.',
      messageFa: 'سطر با موفقیت به‌روزرسانی شد.',
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      operation: 'update',
      affectedRows: 0,
      executionTimeMs: Date.now() - startTime,
      error: err.message || 'Error updating table row',
      errorFa: `خطا در به‌روزرسانی سطر جدول: ${err.message}`,
    };
  }
}

/**
 * Phase 7: Deletes an identified target row within a safe transaction with strict LIMIT 1 protection.
 * Uses primary key values where available, or full original row matching with MySQL's NULL-safe operator (<=>).
 */
export async function deleteMysqlTableRow(
  server: RemoteServer,
  params: MysqlRowDeleteRequest
): Promise<MysqlRowMutationResult> {
  const startTime = Date.now();
  const { database, table, primaryKeyValues, originalRow } = params;

  if (!database || !database.trim() || !table || !table.trim()) {
    return {
      success: false,
      operation: 'delete',
      affectedRows: 0,
      error: 'Missing required parameters: database or table.',
      errorFa: 'پارامترهای الزامی نام دیتابیس یا جدول ارسال نشده است.',
    };
  }

  // Safety protection: require primary key or original row to prevent mass deletion
  const hasPk = primaryKeyValues && Object.keys(primaryKeyValues).length > 0;
  const hasOrig = originalRow && Object.keys(originalRow).length > 0;
  if (!hasPk && !hasOrig) {
    return {
      success: false,
      operation: 'delete',
      affectedRows: 0,
      error: 'Safety restriction: Primary key or original row values are required to prevent mass deletion.',
      errorFa: 'محدودیت امنیتی: جهت جلوگیری از حذف سراسری جدول، کلید اصلی یا اطلاعات سطر الزامی است.',
    };
  }

  const config = getMysqlConfig(server, {
    port: params.port,
    user: params.user,
    password: params.password,
    database,
  });

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database,
      connectTimeout: 8000,
    });

    // 1. Fetch column catalog to validate column names
    const [cols]: any = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
      [database, table]
    );

    if (!cols || cols.length === 0) {
      await conn.end();
      return {
        success: false,
        operation: 'delete',
        affectedRows: 0,
        error: `Table '${database}.${table}' does not exist.`,
        errorFa: `جدول '${database}.${table}' یافت نشد.`,
      };
    }

    const colSet = new Set<string>(cols.map((c: any) => c.COLUMN_NAME));

    // 2. Build WHERE clause with primary key or original row matching
    const whereClauses: string[] = [];
    const whereParams: any[] = [];

    if (hasPk) {
      for (const [pkCol, pkVal] of Object.entries(primaryKeyValues!)) {
        const safePk = `\`${pkCol.replace(/`/g, '``')}\``;
        if (pkVal === null || pkVal === undefined) {
          whereClauses.push(`${safePk} <=> NULL`);
        } else {
          whereClauses.push(`${safePk} = ?`);
          whereParams.push(pkVal);
        }
      }
    } else {
      for (const [col, val] of Object.entries(originalRow!)) {
        if (!colSet.has(col)) continue;
        const safeCol = `\`${col.replace(/`/g, '``')}\``;
        whereClauses.push(`${safeCol} <=> ?`);
        whereParams.push(val === undefined ? null : val);
      }
    }

    const safeDb = `\`${database.replace(/`/g, '``')}\``;
    const safeTbl = `\`${table.replace(/`/g, '``')}\``;

    // Strict safety protection: LIMIT 1 prevents mass deletes
    const deleteSql = `DELETE FROM ${safeDb}.${safeTbl} WHERE ${whereClauses.join(' AND ')} LIMIT 1`;

    await conn.beginTransaction();
    const [result]: any = await conn.query(deleteSql, whereParams);

    if (result.affectedRows === 0) {
      await conn.rollback();
      await conn.end();
      return {
        success: false,
        operation: 'delete',
        affectedRows: 0,
        error: 'Target row not found or was already deleted.',
        errorFa: 'سطر مورد نظر یافت نشد یا پیش‌تر حذف شده است.',
      };
    }

    await conn.commit();
    await conn.end();

    return {
      success: true,
      operation: 'delete',
      affectedRows: result.affectedRows,
      executionTimeMs: Date.now() - startTime,
      message: 'Row successfully deleted.',
      messageFa: 'سطر با موفقیت از جدول حذف شد.',
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      operation: 'delete',
      affectedRows: 0,
      executionTimeMs: Date.now() - startTime,
      error: err.message || 'Error deleting table row',
      errorFa: `خطا در حذف سطر جدول: ${err.message}`,
    };
  }
}

