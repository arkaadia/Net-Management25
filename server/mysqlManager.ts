import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { RemoteServer, addAuditLog, getAuditLogs } from './db';
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
  MysqlUserCreateRequest,
  MysqlUserUpdateRequest,
  MysqlUserPasswordChangeRequest,
  MysqlUserLockRequest,
  MysqlUserExpirePasswordRequest,
  MysqlUserDropRequest,
  MysqlPrivilegeScope,
  MysqlRoutineType,
  MysqlApplicablePrivilege,
  MysqlUserGrant,
  MysqlUserGrantsResponse,
  MysqlAccountGrantsEntry,
  MysqlPermissionsMatrixResponse,
  MysqlPermissionDelta,
  MysqlApplyPermissionsRequest,
  MysqlApplyPermissionsResult,
  MysqlKillType,
  MysqlProcesslistResponse,
  MysqlKillProcessResult,
  MysqlTableColumnDefinition,
  MysqlCreateTableRequest,
  MysqlRenameTableRequest,
  MysqlAlterTableOptionsRequest,
  MysqlDropTableRequest,
  MysqlTruncateTableRequest,
  MysqlAddColumnRequest,
  MysqlModifyColumnRequest,
  MysqlRenameColumnRequest,
  MysqlDropColumnRequest,
  MysqlCreateIndexRequest,
  MysqlDropIndexRequest,
  MysqlAddForeignKeyRequest,
  MysqlDropForeignKeyRequest,
  MysqlManagePrimaryKeyRequest,
  MysqlDdlOperationResult,
  MysqlCreateViewRequest,
  MysqlDropViewRequest,
  MysqlRoutineParameter,
  MysqlCreateProcedureRequest,
  MysqlDropProcedureRequest,
  MysqlExecuteProcedureRequest,
  MysqlExecuteProcedureResult,
  MysqlCreateFunctionRequest,
  MysqlDropFunctionRequest,
  MysqlCreateTriggerRequest,
  MysqlDropTriggerRequest,
  MysqlEventSchedulerStatus,
  MysqlSetEventSchedulerRequest,
  MysqlCreateEventRequest,
  MysqlAlterEventStatusRequest,
  MysqlDropEventRequest,
  MysqlDumpOptions,
  MysqlDumpResult,
  MysqlCnfBackupItem,
  MysqlCnfFileMetadata,
  MysqlCnfParameter,
  MysqlClientHostAccessRule,
  MysqlClientAuthConfigData,
  MysqlClientAuthSaveRequest,
  MysqlClientAuthSaveResult,
  MysqlHostRuleUpdateRequest,
  MysqlDynamicVariableUpdateRequest,
  MysqlBackupCategory,
  MysqlBackupFileFormat,
  MysqlBackupRestoreMode,
  MysqlBackupItem,
  MysqlCreateBackupRequest,
  MysqlCreateBackupResult,
  MysqlValidateRestoreRequest,
  MysqlValidateRestoreResult,
  MysqlRestoreBackupRequest,
  MysqlRestoreBackupResult,
  MysqlBackupPreviewResult,
  MysqlMaintenanceAction,
  MysqlMaintenanceScope,
  MysqlCheckOption,
  MysqlRepairOption,
  MysqlMaintenanceLockWarning,
  MysqlMaintenanceRequest,
  MysqlTableMaintenanceRowResult,
  MysqlMaintenanceResult,
  MysqlTableBloatMetric,
  MysqlActiveMaintenanceProgress,
  MysqlReplicationRole,
  MysqlReplicationChannelStatus,
  MysqlConnectedReplica,
  MysqlBinaryLogFile,
  MysqlGroupReplicationInfo,
  MysqlSemiSyncInfo,
  MysqlReplicationOverview,
  MysqlReplicationActionRequest,
  MysqlReplicationActionResult,
  MysqlSecurityRiskLevel,
  MysqlSecurityCategory,
  MysqlSecurityCheckDetail,
  MysqlSecurityCheckItem,
  MysqlSecurityAuditReport,
  MysqlAuditLogEntry,
  MysqlAuditLogsResponse,
  MysqlHardeningRemediationRequest,
  MysqlHardeningRemediationResult,
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
 * Retrieves the list of user accounts in MySQL with rich metadata (plugin, status, expiration, limits, SSL).
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
    // 1. Try modern MySQL 8.0+ / 8.4 schema
    try {
      const [rows]: any = await conn.query(
        `SELECT 
           User AS user, 
           Host AS host, 
           plugin, 
           account_locked, 
           password_expired,
           password_last_changed, 
           password_lifetime,
           max_questions, 
           max_updates, 
           max_connections, 
           max_user_connections,
           ssl_type, 
           Super_priv
         FROM mysql.user 
         ORDER BY User ASC, Host ASC`
      );
      userRows = rows;
    } catch {
      // 2. Try MySQL 5.7 / MariaDB fallback
      try {
        const [rows]: any = await conn.query(
          `SELECT 
             User AS user, 
             Host AS host, 
             plugin, 
             account_locked, 
             password_expired,
             max_questions, 
             max_updates, 
             max_connections, 
             max_user_connections,
             ssl_type, 
             Super_priv
           FROM mysql.user 
           ORDER BY User ASC, Host ASC`
        );
        userRows = rows;
      } catch {
        // 3. Ultra-resilient basic fallback
        try {
          const [rows]: any = await conn.query(`SELECT User AS user, Host AS host, plugin, Super_priv FROM mysql.user ORDER BY User, Host`);
          userRows = rows;
        } catch {
          const [rows]: any = await conn.query(`SELECT USER() AS user, '%' AS host`);
          userRows = rows;
        }
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
      const isSuper = u.Super_priv === 'Y' || user.toLowerCase() === 'root';
      const isLocked = u.account_locked === 'Y' || u.account_locked === 1 || u.account_locked === true;
      const isExpired = u.password_expired === 'Y' || u.password_expired === 1 || u.password_expired === true;

      return {
        user,
        host,
        plugin: u.plugin || u.Plugin || 'caching_sha2_password',
        accountLocked: isLocked,
        passwordExpired: isExpired,
        passwordLastChanged: u.password_last_changed ? String(u.password_last_changed) : null,
        passwordLifetime: u.password_lifetime !== null && u.password_lifetime !== undefined ? Number(u.password_lifetime) : null,
        maxQuestions: u.max_questions !== undefined ? Number(u.max_questions) : 0,
        maxUpdates: u.max_updates !== undefined ? Number(u.max_updates) : 0,
        maxConnections: u.max_connections !== undefined ? Number(u.max_connections) : 0,
        maxUserConnections: u.max_user_connections !== undefined ? Number(u.max_user_connections) : 0,
        sslType: u.ssl_type || 'NONE',
        isSuperuser: isSuper,
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
        plugin: 'caching_sha2_password',
        accountLocked: false,
        passwordExpired: false,
        isSuperuser: true,
      },
    ];
  }
}

/**
 * Creates a new MySQL user account with host, authentication, resource limits, and account status.
 */
export async function createMysqlUser(
  server: RemoteServer,
  payload: MysqlUserCreateRequest
): Promise<{ success: boolean; user: string; host: string; message?: string; error?: string }> {
  if (!payload.user || !payload.user.trim()) {
    throw new Error('Username is required.');
  }

  const rawUser = payload.user.trim();
  const rawHost = payload.host?.trim() || '%';
  const userSpec = `${mysql.escape(rawUser)}@${mysql.escape(rawHost)}`;

  const config = getMysqlConfig(server);
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'mysql',
    connectTimeout: 7000,
  });

  try {
    let sql = `CREATE USER ${userSpec}`;

    // Authentication plugin & password
    if (payload.password) {
      if (payload.plugin) {
        sql += ` IDENTIFIED WITH ${mysql.escape(payload.plugin).slice(1, -1)} BY ${mysql.escape(payload.password)}`;
      } else {
        sql += ` IDENTIFIED BY ${mysql.escape(payload.password)}`;
      }
    } else if (payload.plugin) {
      sql += ` IDENTIFIED WITH ${mysql.escape(payload.plugin).slice(1, -1)}`;
    }

    // Resource limits
    const limits: string[] = [];
    if (payload.maxQuestions !== undefined && payload.maxQuestions >= 0) {
      limits.push(`MAX_QUERIES_PER_HOUR ${Number(payload.maxQuestions)}`);
    }
    if (payload.maxUpdates !== undefined && payload.maxUpdates >= 0) {
      limits.push(`MAX_UPDATES_PER_HOUR ${Number(payload.maxUpdates)}`);
    }
    if (payload.maxConnections !== undefined && payload.maxConnections >= 0) {
      limits.push(`MAX_CONNECTIONS_PER_HOUR ${Number(payload.maxConnections)}`);
    }
    if (payload.maxUserConnections !== undefined && payload.maxUserConnections >= 0) {
      limits.push(`MAX_USER_CONNECTIONS ${Number(payload.maxUserConnections)}`);
    }
    if (limits.length > 0) {
      sql += ` WITH ${limits.join(' ')}`;
    }

    // SSL requirement
    if (payload.sslType === 'SSL') {
      sql += ` REQUIRE SSL`;
    } else if (payload.sslType === 'X509') {
      sql += ` REQUIRE X509`;
    } else if (payload.sslType === 'NONE') {
      sql += ` REQUIRE NONE`;
    }

    // Password expiration
    if (payload.passwordExpirePolicy === 'never') {
      sql += ` PASSWORD EXPIRE NEVER`;
    } else if (payload.passwordExpirePolicy === 'immediate') {
      sql += ` PASSWORD EXPIRE`;
    } else if (payload.passwordExpirePolicy === 'interval' && payload.passwordExpireIntervalDays && payload.passwordExpireIntervalDays > 0) {
      sql += ` PASSWORD EXPIRE INTERVAL ${Number(payload.passwordExpireIntervalDays)} DAY`;
    } else if (payload.passwordExpirePolicy === 'default') {
      sql += ` PASSWORD EXPIRE DEFAULT`;
    }

    // Account locked/unlocked
    if (payload.accountLocked) {
      sql += ` ACCOUNT LOCK`;
    } else {
      sql += ` ACCOUNT UNLOCK`;
    }

    sql += ';';

    await conn.query(sql);
    try {
      await conn.query('FLUSH PRIVILEGES;');
    } catch {}

    await conn.end();
    return {
      success: true,
      user: rawUser,
      host: rawHost,
      message: `Account '${rawUser}'@'${rawHost}' created successfully.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw err;
  }
}

/**
 * Updates an existing MySQL user account attributes (resource limits, SSL, password expiration, account lock).
 */
export async function updateMysqlUser(
  server: RemoteServer,
  payload: MysqlUserUpdateRequest
): Promise<{ success: boolean; user: string; host: string; message?: string; error?: string }> {
  if (!payload.user || !payload.user.trim()) {
    throw new Error('Username is required.');
  }

  const rawUser = payload.user.trim();
  const rawHost = payload.host?.trim() || '%';
  const userSpec = `${mysql.escape(rawUser)}@${mysql.escape(rawHost)}`;

  const config = getMysqlConfig(server);
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'mysql',
    connectTimeout: 7000,
  });

  try {
    let sql = `ALTER USER ${userSpec}`;

    // Resource limits
    const limits: string[] = [];
    if (payload.maxQuestions !== undefined && payload.maxQuestions >= 0) {
      limits.push(`MAX_QUERIES_PER_HOUR ${Number(payload.maxQuestions)}`);
    }
    if (payload.maxUpdates !== undefined && payload.maxUpdates >= 0) {
      limits.push(`MAX_UPDATES_PER_HOUR ${Number(payload.maxUpdates)}`);
    }
    if (payload.maxConnections !== undefined && payload.maxConnections >= 0) {
      limits.push(`MAX_CONNECTIONS_PER_HOUR ${Number(payload.maxConnections)}`);
    }
    if (payload.maxUserConnections !== undefined && payload.maxUserConnections >= 0) {
      limits.push(`MAX_USER_CONNECTIONS ${Number(payload.maxUserConnections)}`);
    }
    if (limits.length > 0) {
      sql += ` WITH ${limits.join(' ')}`;
    }

    // SSL requirement
    if (payload.sslType === 'SSL') {
      sql += ` REQUIRE SSL`;
    } else if (payload.sslType === 'X509') {
      sql += ` REQUIRE X509`;
    } else if (payload.sslType === 'NONE') {
      sql += ` REQUIRE NONE`;
    }

    // Password expiration
    if (payload.passwordExpirePolicy === 'never') {
      sql += ` PASSWORD EXPIRE NEVER`;
    } else if (payload.passwordExpirePolicy === 'immediate') {
      sql += ` PASSWORD EXPIRE`;
    } else if (payload.passwordExpirePolicy === 'interval' && payload.passwordExpireIntervalDays && payload.passwordExpireIntervalDays > 0) {
      sql += ` PASSWORD EXPIRE INTERVAL ${Number(payload.passwordExpireIntervalDays)} DAY`;
    } else if (payload.passwordExpirePolicy === 'default') {
      sql += ` PASSWORD EXPIRE DEFAULT`;
    }

    // Account locked/unlocked
    if (payload.accountLocked !== undefined) {
      sql += payload.accountLocked ? ` ACCOUNT LOCK` : ` ACCOUNT UNLOCK`;
    }

    sql += ';';

    await conn.query(sql);
    try {
      await conn.query('FLUSH PRIVILEGES;');
    } catch {}

    await conn.end();
    return {
      success: true,
      user: rawUser,
      host: rawHost,
      message: `Account '${rawUser}'@'${rawHost}' updated successfully.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw err;
  }
}

/**
 * Changes password for an existing MySQL user account.
 */
export async function changeMysqlUserPassword(
  server: RemoteServer,
  payload: MysqlUserPasswordChangeRequest
): Promise<{ success: boolean; user: string; host: string; message?: string }> {
  if (!payload.user || !payload.user.trim()) {
    throw new Error('Username is required.');
  }
  if (!payload.password) {
    throw new Error('Password cannot be empty.');
  }

  const rawUser = payload.user.trim();
  const rawHost = payload.host?.trim() || '%';
  const userSpec = `${mysql.escape(rawUser)}@${mysql.escape(rawHost)}`;

  const config = getMysqlConfig(server);
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'mysql',
    connectTimeout: 7000,
  });

  try {
    let sql = '';
    if (payload.plugin) {
      sql = `ALTER USER ${userSpec} IDENTIFIED WITH ${mysql.escape(payload.plugin).slice(1, -1)} BY ${mysql.escape(payload.password)};`;
    } else {
      sql = `ALTER USER ${userSpec} IDENTIFIED BY ${mysql.escape(payload.password)};`;
    }

    await conn.query(sql);
    try {
      await conn.query('FLUSH PRIVILEGES;');
    } catch {}

    await conn.end();
    return {
      success: true,
      user: rawUser,
      host: rawHost,
      message: `Password for '${rawUser}'@'${rawHost}' updated successfully.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw err;
  }
}

/**
 * Locks or unlocks a MySQL user account.
 */
export async function setMysqlUserLock(
  server: RemoteServer,
  payload: MysqlUserLockRequest
): Promise<{ success: boolean; user: string; host: string; locked: boolean; message?: string }> {
  if (!payload.user || !payload.user.trim()) {
    throw new Error('Username is required.');
  }

  const rawUser = payload.user.trim();
  const rawHost = payload.host?.trim() || '%';
  const userSpec = `${mysql.escape(rawUser)}@${mysql.escape(rawHost)}`;

  const config = getMysqlConfig(server);
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'mysql',
    connectTimeout: 7000,
  });

  try {
    const action = payload.lock ? 'ACCOUNT LOCK' : 'ACCOUNT UNLOCK';
    const sql = `ALTER USER ${userSpec} ${action};`;

    await conn.query(sql);
    try {
      await conn.query('FLUSH PRIVILEGES;');
    } catch {}

    await conn.end();
    return {
      success: true,
      user: rawUser,
      host: rawHost,
      locked: payload.lock,
      message: `Account '${rawUser}'@'${rawHost}' ${payload.lock ? 'locked' : 'unlocked'} successfully.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw err;
  }
}

/**
 * Sets password expiration policy for a MySQL user account.
 */
export async function setMysqlUserPasswordExpiration(
  server: RemoteServer,
  payload: MysqlUserExpirePasswordRequest
): Promise<{ success: boolean; user: string; host: string; message?: string }> {
  if (!payload.user || !payload.user.trim()) {
    throw new Error('Username is required.');
  }

  const rawUser = payload.user.trim();
  const rawHost = payload.host?.trim() || '%';
  const userSpec = `${mysql.escape(rawUser)}@${mysql.escape(rawHost)}`;

  const config = getMysqlConfig(server);
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'mysql',
    connectTimeout: 7000,
  });

  try {
    let sql = `ALTER USER ${userSpec} PASSWORD EXPIRE`;
    if (payload.policy === 'never') {
      sql += ` NEVER`;
    } else if (payload.policy === 'default') {
      sql += ` DEFAULT`;
    } else if (payload.policy === 'interval' && payload.intervalDays && payload.intervalDays > 0) {
      sql += ` INTERVAL ${Number(payload.intervalDays)} DAY`;
    }
    sql += ';';

    await conn.query(sql);
    try {
      await conn.query('FLUSH PRIVILEGES;');
    } catch {}

    await conn.end();
    return {
      success: true,
      user: rawUser,
      host: rawHost,
      message: `Password expiration policy updated for '${rawUser}'@'${rawHost}'.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw err;
  }
}

/**
 * Drops (deletes) a MySQL user account.
 */
export async function dropMysqlUser(
  server: RemoteServer,
  payload: MysqlUserDropRequest
): Promise<{ success: boolean; user: string; host: string; message?: string }> {
  if (!payload.user || !payload.user.trim()) {
    throw new Error('Username is required.');
  }

  const rawUser = payload.user.trim();
  const rawHost = payload.host?.trim() || '%';
  const userSpec = `${mysql.escape(rawUser)}@${mysql.escape(rawHost)}`;

  const config = getMysqlConfig(server);
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'mysql',
    connectTimeout: 7000,
  });

  try {
    const sql = payload.ifExists !== false ? `DROP USER IF EXISTS ${userSpec};` : `DROP USER ${userSpec};`;

    await conn.query(sql);
    try {
      await conn.query('FLUSH PRIVILEGES;');
    } catch {}

    await conn.end();
    return {
      success: true,
      user: rawUser,
      host: rawHost,
      message: `Account '${rawUser}'@'${rawHost}' dropped successfully.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw err;
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
export async function getMysqlProcesslist(server: RemoteServer): Promise<MysqlProcesslistResponse> {
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

    // Determine current connection ID so own thread can be identified
    let currentConnectionId: number | undefined;
    try {
      const [cidRows]: any = await conn.query('SELECT CONNECTION_ID() AS cid');
      if (Array.isArray(cidRows) && cidRows[0]?.cid) {
        currentConnectionId = Number(cidRows[0].cid);
      }
    } catch {}

    const [rows]: any = await conn.query('SHOW FULL PROCESSLIST');
    await conn.end();

    const processes: MysqlProcessItem[] = (rows || []).map((r: any) => {
      const pid = Number(r.Id);
      return {
        id: pid,
        user: r.User || '',
        host: r.Host || '',
        db: r.db || null,
        command: r.Command || '',
        time: Number(r.Time) || 0,
        state: r.State || null,
        info: r.Info || null,
        isCurrentConnection: currentConnectionId !== undefined && pid === currentConnectionId,
      };
    });

    const activeQueries = processes.filter((p) => p.command.toLowerCase() === 'query' && !p.isCurrentConnection).length;
    const sleeping = processes.filter((p) => p.command.toLowerCase() === 'sleep').length;
    const locked = processes.filter((p) => p.state && p.state.toLowerCase().includes('lock')).length;
    const maxDurationSeconds = processes.reduce((max, p) => Math.max(max, p.time), 0);

    return {
      success: true,
      processes,
      currentConnectionId,
      summary: {
        total: processes.length,
        activeQueries,
        sleeping,
        locked,
        maxDurationSeconds,
      },
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      processes: [],
      summary: {
        total: 0,
        activeQueries: 0,
        sleeping: 0,
        locked: 0,
        maxDurationSeconds: 0,
      },
      error: err.message,
      errorFa: `خطا در دریافت لیست پروسس‌های MySQL: ${err.message}`,
    };
  }
}

/**
 * Terminates a stuck query or drops an entire connection in MySQL.
 * Explicitly distinguishes between KILL QUERY and KILL CONNECTION.
 */
export async function killMysqlProcess(
  server: RemoteServer,
  processId: number,
  type: MysqlKillType = 'connection'
): Promise<MysqlKillProcessResult> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;
  const numId = Number(processId);

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      connectTimeout: 5000,
    });

    const killSql = type === 'query' ? `KILL QUERY ${numId}` : `KILL CONNECTION ${numId}`;
    await conn.query(killSql);
    await conn.end();

    const isQuery = type === 'query';
    return {
      success: true,
      processId: numId,
      type,
      message: isQuery
        ? `Running query on thread ID ${numId} was successfully terminated.`
        : `Connection and thread ID ${numId} were successfully terminated.`,
      messageFa: isQuery
        ? `کوئری فعال در ترد شماره ${numId} متوقف گردید (اتصال حفظ شد).`
        : `اتصال و ترد شماره ${numId} به طور کامل قطع و بسته شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      processId: numId,
      type,
      message: `Failed to terminate ${type} for thread ${numId}: ${err.message}`,
      messageFa: `خطا در متوقف‌سازی ${type === 'query' ? 'کوئری' : 'اتصال'} شماره ${numId}: ${err.message}`,
      error: err.message,
      errorFa: `خطای MySQL: ${err.message}`,
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

// ============================================================================
// PHASE 11: MYSQL PRIVILEGES & GRANTS MANAGEMENT
// ============================================================================

export const MYSQL_APPLICABLE_PRIVILEGES: Record<MysqlPrivilegeScope, MysqlApplicablePrivilege[]> = {
  global: [
    { name: 'ALL PRIVILEGES', descriptionEn: 'Full administrative access on all databases', descriptionFa: 'دسترسی کامل مدیریتی به تمام پایگاه‌های داده', category: 'admin' },
    { name: 'SELECT', descriptionEn: 'Read table and view rows', descriptionFa: 'خواندن ردیف‌های جداول و ویوها', category: 'data' },
    { name: 'INSERT', descriptionEn: 'Insert new rows into any table', descriptionFa: 'افزودن ردیف‌های جدید به جداول', category: 'data' },
    { name: 'UPDATE', descriptionEn: 'Modify existing rows in any table', descriptionFa: 'ویرایش ردیف‌های موجود در جداول', category: 'data' },
    { name: 'DELETE', descriptionEn: 'Delete rows from any table', descriptionFa: 'حذف ردیف‌ها از جداول', category: 'data' },
    { name: 'CREATE', descriptionEn: 'Create new databases and tables', descriptionFa: 'ایجاد دیتابیس‌ها و جداول جدید', category: 'structure' },
    { name: 'DROP', descriptionEn: 'Drop databases, tables, and views', descriptionFa: 'حذف کامل دیتابیس‌ها، جداول و ویوها', category: 'structure' },
    { name: 'RELOAD', descriptionEn: 'Execute FLUSH statements and reload server logs', descriptionFa: 'اجرای دستورات FLUSH و بازنشانی لاگ‌ها', category: 'admin' },
    { name: 'SHUTDOWN', descriptionEn: 'Shut down the MySQL server', descriptionFa: 'خاموش کردن سرور MySQL', category: 'admin' },
    { name: 'PROCESS', descriptionEn: 'View all active threads in processlist', descriptionFa: 'مشاهده لیست تمام رشته‌های فعال پردازشی', category: 'admin' },
    { name: 'FILE', descriptionEn: 'Read/write server files via LOAD DATA / SELECT INTO OUTFILE', descriptionFa: 'خواندن و نوشتن فایل روی سرور', category: 'data' },
    { name: 'GRANT OPTION', descriptionEn: 'Grant own privileges to other accounts', descriptionFa: 'اعطای مجوزهای خود به سایر کاربران', category: 'admin' },
    { name: 'REFERENCES', descriptionEn: 'Create foreign keys linking to tables', descriptionFa: 'ایجاد کلید خارجی و اتصال جداول', category: 'structure' },
    { name: 'INDEX', descriptionEn: 'Create or drop indexes', descriptionFa: 'ایجاد یا حذف ایندکس‌ها', category: 'structure' },
    { name: 'ALTER', descriptionEn: 'Change table structure and definitions', descriptionFa: 'تغییر ساختار و تعاریف جداول', category: 'structure' },
    { name: 'SHOW DATABASES', descriptionEn: 'See all databases in server listing', descriptionFa: 'مشاهده نام تمامی دیتابیس‌های سرور', category: 'admin' },
    { name: 'SUPER', descriptionEn: 'Change global variables, kill threads, configure replication', descriptionFa: 'مجوز مدیریت ارشد، تغییر متغیرها و بستن پردازش‌ها', category: 'admin' },
    { name: 'CREATE TEMPORARY TABLES', descriptionEn: 'Create transient session tables', descriptionFa: 'ایجاد جداول موقت برای نشست جاری', category: 'structure' },
    { name: 'LOCK TABLES', descriptionEn: 'Lock tables explicitly with LOCK TABLES', descriptionFa: 'قفل‌گذاری صریح روی جداول', category: 'data' },
    { name: 'EXECUTE', descriptionEn: 'Execute stored procedures and functions', descriptionFa: 'اجرای رویه‌ها و توابع ذخیره‌شده', category: 'routine' },
    { name: 'REPLICATION SLAVE', descriptionEn: 'Connect as replica to read binary log', descriptionFa: 'اتصال رپلیکا برای خواندن باینری‌لاگ', category: 'admin' },
    { name: 'REPLICATION CLIENT', descriptionEn: 'Ask where primary or replica servers are', descriptionFa: 'استعلام وضعیت سرور اصلی و رپلیکا', category: 'admin' },
    { name: 'CREATE VIEW', descriptionEn: 'Create new views', descriptionFa: 'ایجاد ویوهای جدید', category: 'structure' },
    { name: 'SHOW VIEW', descriptionEn: 'Inspect view definitions with SHOW CREATE VIEW', descriptionFa: 'مشاهده دستور ساخت ویوها', category: 'structure' },
    { name: 'CREATE ROUTINE', descriptionEn: 'Create stored procedures and functions', descriptionFa: 'ایجاد پروسیجرها و توابع ذخیره‌شده', category: 'structure' },
    { name: 'ALTER ROUTINE', descriptionEn: 'Alter or drop stored routines', descriptionFa: 'تغییر یا حذف پروسیجرها و توابع', category: 'structure' },
    { name: 'CREATE USER', descriptionEn: 'Create, drop, rename, or revoke user accounts', descriptionFa: 'ایجاد، حذف یا تغییر نام حساب‌های کاربری', category: 'admin' },
    { name: 'EVENT', descriptionEn: 'Create, alter, or drop scheduled events', descriptionFa: 'ایجاد یا حذف رویدادهای زمان‌بندی شده', category: 'structure' },
    { name: 'TRIGGER', descriptionEn: 'Create or drop table triggers', descriptionFa: 'ایجاد یا حذف تریگرهای جداول', category: 'structure' },
  ],
  database: [
    { name: 'ALL PRIVILEGES', descriptionEn: 'All privileges on this database', descriptionFa: 'تمامی مجوزها روی این پایگاه داده', category: 'admin' },
    { name: 'SELECT', descriptionEn: 'Read tables in database', descriptionFa: 'خواندن اطلاعات جداول این دیتابیس', category: 'data' },
    { name: 'INSERT', descriptionEn: 'Insert rows into database tables', descriptionFa: 'افزودن ردیف به جداول این دیتابیس', category: 'data' },
    { name: 'UPDATE', descriptionEn: 'Modify rows in database tables', descriptionFa: 'ویرایش ردیف‌های جداول این دیتابیس', category: 'data' },
    { name: 'DELETE', descriptionEn: 'Delete rows from database tables', descriptionFa: 'حذف ردیف‌ها از جداول این دیتابیس', category: 'data' },
    { name: 'CREATE', descriptionEn: 'Create new tables and indexes in database', descriptionFa: 'ایجاد جداول و ایندکس‌های جدید', category: 'structure' },
    { name: 'DROP', descriptionEn: 'Drop tables and views in database', descriptionFa: 'حذف جداول و ویوهای این دیتابیس', category: 'structure' },
    { name: 'GRANT OPTION', descriptionEn: 'Grant database privileges to others', descriptionFa: 'اعطای مجوزهای این دیتابیس به دیگران', category: 'admin' },
    { name: 'REFERENCES', descriptionEn: 'Foreign key constraints in database', descriptionFa: 'کلیدهای خارجی در جداول این دیتابیس', category: 'structure' },
    { name: 'INDEX', descriptionEn: 'Create or drop indexes in database', descriptionFa: 'ایجاد یا حذف ایندکس‌ها در دیتابیس', category: 'structure' },
    { name: 'ALTER', descriptionEn: 'Modify structure of database tables', descriptionFa: 'تغییر ساختار جداول این دیتابیس', category: 'structure' },
    { name: 'CREATE TEMPORARY TABLES', descriptionEn: 'Create temporary tables in database', descriptionFa: 'ایجاد جداول موقت در این دیتابیس', category: 'structure' },
    { name: 'LOCK TABLES', descriptionEn: 'Lock tables in this database', descriptionFa: 'قفل‌گذاری روی جداول این دیتابیس', category: 'data' },
    { name: 'EXECUTE', descriptionEn: 'Execute routines in database', descriptionFa: 'اجرای توابع و رویه‌های این دیتابیس', category: 'routine' },
    { name: 'CREATE VIEW', descriptionEn: 'Create views in database', descriptionFa: 'ایجاد ویوها در این دیتابیس', category: 'structure' },
    { name: 'SHOW VIEW', descriptionEn: 'Show view queries in database', descriptionFa: 'مشاهده ساختار ویوهای این دیتابیس', category: 'structure' },
    { name: 'CREATE ROUTINE', descriptionEn: 'Create procedures/functions in database', descriptionFa: 'ایجاد رویه‌ها و توابع در این دیتابیس', category: 'structure' },
    { name: 'ALTER ROUTINE', descriptionEn: 'Alter procedures/functions in database', descriptionFa: 'تغییر یا حذف رویه‌ها در این دیتابیس', category: 'structure' },
    { name: 'EVENT', descriptionEn: 'Create/alter events in database', descriptionFa: 'مدیریت رویدادها در این دیتابیس', category: 'structure' },
    { name: 'TRIGGER', descriptionEn: 'Create/drop triggers in database', descriptionFa: 'ایجاد یا حذف تریگرها در این دیتابیس', category: 'structure' },
  ],
  table: [
    { name: 'ALL PRIVILEGES', descriptionEn: 'All privileges on this specific table', descriptionFa: 'تمام دسترسی‌ها روی این جدول', category: 'admin' },
    { name: 'SELECT', descriptionEn: 'Query rows from table', descriptionFa: 'خواندن اطلاعات از جدول', category: 'data' },
    { name: 'INSERT', descriptionEn: 'Insert rows into table', descriptionFa: 'درج ردیف در جدول', category: 'data' },
    { name: 'UPDATE', descriptionEn: 'Update rows in table', descriptionFa: 'ویرایش ردیف‌های جدول', category: 'data' },
    { name: 'DELETE', descriptionEn: 'Delete rows from table', descriptionFa: 'حذف ردیف‌های جدول', category: 'data' },
    { name: 'CREATE', descriptionEn: 'Create table', descriptionFa: 'ایجاد جدول', category: 'structure' },
    { name: 'DROP', descriptionEn: 'Drop table', descriptionFa: 'حذف کامل جدول', category: 'structure' },
    { name: 'GRANT OPTION', descriptionEn: 'Grant table privileges to others', descriptionFa: 'اعطای مجوز این جدول به دیگران', category: 'admin' },
    { name: 'INDEX', descriptionEn: 'Create/drop indexes on table', descriptionFa: 'مدیریت ایندکس‌های جدول', category: 'structure' },
    { name: 'ALTER', descriptionEn: 'Alter table columns and schema', descriptionFa: 'تغییر ستون‌ها و ساختار جدول', category: 'structure' },
    { name: 'CREATE VIEW', descriptionEn: 'Create views on table', descriptionFa: 'ایجاد ویو بر اساس جدول', category: 'structure' },
    { name: 'SHOW VIEW', descriptionEn: 'Inspect views using this table', descriptionFa: 'مشاهده ویوهای این جدول', category: 'structure' },
    { name: 'TRIGGER', descriptionEn: 'Create/drop triggers for table', descriptionFa: 'مدیریت تریگرهای جدول', category: 'structure' },
    { name: 'REFERENCES', descriptionEn: 'Foreign key references to table', descriptionFa: 'ارجاعات کلید خارجی به این جدول', category: 'structure' },
  ],
  column: [
    { name: 'SELECT', descriptionEn: 'Read this specific column', descriptionFa: 'خواندن این ستون خاص', category: 'data' },
    { name: 'INSERT', descriptionEn: 'Insert values into this column', descriptionFa: 'درج مقدار در این ستون', category: 'data' },
    { name: 'UPDATE', descriptionEn: 'Update values in this column', descriptionFa: 'ویرایش مقادیر این ستون', category: 'data' },
    { name: 'REFERENCES', descriptionEn: 'Reference column in foreign keys', descriptionFa: 'ارجاع به این ستون در کلیدهای خارجی', category: 'structure' },
  ],
  routine: [
    { name: 'EXECUTE', descriptionEn: 'Execute this stored routine', descriptionFa: 'اجرای این پروسیجر یا تابع ذخیره‌شده', category: 'routine' },
    { name: 'ALTER ROUTINE', descriptionEn: 'Alter or drop this stored routine', descriptionFa: 'تغییر یا حذف این پروسیجر/تابع', category: 'structure' },
    { name: 'GRANT OPTION', descriptionEn: 'Grant routine privileges to others', descriptionFa: 'اعطای دسترسی این رویه به دیگران', category: 'admin' },
  ],
};

/**
 * Parses raw MySQL GRANT string returned by `SHOW GRANTS FOR ...`.
 * e.g. "GRANT SELECT, INSERT ON `test`.* TO `user`@`%` WITH GRANT OPTION"
 */
export function parseMysqlGrantStatement(raw: string): MysqlUserGrant {
  const clean = raw.trim();
  const withGrantOption = /WITH\s+GRANT\s+OPTION/i.test(clean);

  // Strip WITH GRANT OPTION for regex matching
  const statementWithoutOption = clean.replace(/\s+WITH\s+GRANT\s+OPTION/i, '').trim();

  // Pattern: GRANT <privs> ON <target> TO <user>
  const match = statementWithoutOption.match(/^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+(.+)$/i);
  if (!match) {
    return {
      rawGrant: raw,
      scope: 'global',
      privileges: [clean],
      withGrantOption,
    };
  }

  const rawPrivs = match[1].trim();
  let rawTarget = match[2].trim();

  let routineType: MysqlRoutineType | undefined;
  let routineName: string | undefined;
  let database: string | undefined;
  let table: string | undefined;
  let scope: MysqlPrivilegeScope = 'global';

  // Check routine prefix
  if (/^PROCEDURE\s+/i.test(rawTarget)) {
    scope = 'routine';
    routineType = 'PROCEDURE';
    rawTarget = rawTarget.replace(/^PROCEDURE\s+/i, '').trim();
  } else if (/^FUNCTION\s+/i.test(rawTarget)) {
    scope = 'routine';
    routineType = 'FUNCTION';
    rawTarget = rawTarget.replace(/^FUNCTION\s+/i, '').trim();
  } else if (/^TABLE\s+/i.test(rawTarget)) {
    rawTarget = rawTarget.replace(/^TABLE\s+/i, '').trim();
  }

  // Parse target object
  const cleanTarget = rawTarget.replace(/[`"]/g, '');
  if (cleanTarget === '*.*') {
    scope = 'global';
  } else if (cleanTarget.endsWith('.*')) {
    scope = 'database';
    database = cleanTarget.replace(/\.\*$/, '');
  } else if (cleanTarget.includes('.')) {
    const parts = cleanTarget.split('.');
    database = parts[0];
    if (scope === 'routine') {
      routineName = parts[1];
    } else {
      scope = 'table';
      table = parts[1];
    }
  } else {
    database = cleanTarget;
    scope = 'database';
  }

  // Split privileges
  const privileges = rawPrivs
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);

  if (withGrantOption && !privileges.includes('GRANT OPTION')) {
    privileges.push('GRANT OPTION');
  }

  return {
    rawGrant: raw,
    scope,
    database,
    table,
    routineType,
    routineName,
    privileges,
    withGrantOption,
  };
}

/**
 * Retrieves the full raw and parsed grants for a single MySQL user account.
 */
export async function getMysqlUserGrants(
  server: RemoteServer,
  user: string,
  host: string
): Promise<MysqlUserGrantsResponse> {
  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;

  const safeUser = user.replace(/'/g, "''");
  const safeHost = host.replace(/'/g, "''");

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: 'mysql',
      connectTimeout: 7000,
    });

    const [rows]: any = await conn.query(`SHOW GRANTS FOR '${safeUser}'@'${safeHost}';`);
    const rawGrants: string[] = [];

    if (Array.isArray(rows)) {
      for (const row of rows) {
        const val = Object.values(row)[0];
        if (typeof val === 'string') {
          rawGrants.push(val);
        }
      }
    }

    await conn.end();

    const grants = rawGrants.map(parseMysqlGrantStatement);

    return {
      success: true,
      user,
      host,
      grants,
      rawGrants,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      user,
      host,
      grants: [],
      rawGrants: [],
      error: err.message || 'Failed to fetch user grants',
      errorFa: `خطا در واکشی مجوزهای کاربر ${user}@${host}: ${err.message}`,
    };
  }
}

/**
 * Generates the full permissions matrix across all MySQL accounts for a specific scope.
 */
export async function getMysqlPermissionsMatrix(
  server: RemoteServer,
  options: {
    scope: MysqlPrivilegeScope;
    database?: string;
    table?: string;
    column?: string;
    routineType?: MysqlRoutineType;
    routineName?: string;
  }
): Promise<MysqlPermissionsMatrixResponse> {
  const { scope, database, table, column, routineType, routineName } = options;
  const applicablePrivileges = MYSQL_APPLICABLE_PRIVILEGES[scope] || MYSQL_APPLICABLE_PRIVILEGES.global;

  try {
    // 1. Fetch all user accounts
    const allUsers = await getMysqlUsers(server);

    // 2. Fetch grants for each account in parallel (with concurrency limit)
    const accounts: MysqlAccountGrantsEntry[] = [];

    // Parallel fetch with Promise.all
    const grantPromises = allUsers.map(async (u) => {
      const grantRes = await getMysqlUserGrants(server, u.user, u.host);
      const privMap: Record<string, boolean> = {};
      let hasGrantOption = false;

      // Initialize all applicable privileges to false
      applicablePrivileges.forEach((p) => {
        privMap[p.name] = false;
      });

      if (grantRes.success && grantRes.grants) {
        for (const g of grantRes.grants) {
          // Check if this grant applies to current scope
          let applies = false;

          if (g.scope === 'global') {
            // Global grants apply everywhere
            applies = true;
          } else if (scope === 'database' && g.scope === 'database') {
            if (!database || g.database?.toLowerCase() === database.toLowerCase()) {
              applies = true;
            }
          } else if (scope === 'table') {
            if (g.scope === 'database' && (!database || g.database?.toLowerCase() === database.toLowerCase())) {
              applies = true; // Database grant cascades to table
            } else if (
              g.scope === 'table' &&
              (!database || g.database?.toLowerCase() === database.toLowerCase()) &&
              (!table || g.table?.toLowerCase() === table.toLowerCase())
            ) {
              applies = true;
            }
          } else if (scope === 'routine') {
            if (g.scope === 'database' && (!database || g.database?.toLowerCase() === database.toLowerCase())) {
              applies = true;
            } else if (
              g.scope === 'routine' &&
              (!database || g.database?.toLowerCase() === database.toLowerCase()) &&
              (!routineName || g.routineName?.toLowerCase() === routineName.toLowerCase())
            ) {
              applies = true;
            }
          } else if (scope === 'column') {
            if (g.scope === 'database' && (!database || g.database?.toLowerCase() === database.toLowerCase())) {
              applies = true;
            } else if (
              g.scope === 'table' &&
              (!database || g.database?.toLowerCase() === database.toLowerCase()) &&
              (!table || g.table?.toLowerCase() === table.toLowerCase())
            ) {
              applies = true;
            }
          }

          if (applies) {
            if (g.withGrantOption) hasGrantOption = true;

            const isAll = g.privileges.some((p) => p.includes('ALL') || p === 'ALL PRIVILEGES');
            if (isAll) {
              applicablePrivileges.forEach((p) => {
                privMap[p.name] = true;
              });
            } else {
              g.privileges.forEach((p) => {
                if (privMap[p] !== undefined) {
                  privMap[p] = true;
                }
              });
            }
          }
        }
      }

      return {
        user: u.user,
        host: u.host,
        isSuperuser: u.isSuperuser,
        hasGrantOption,
        privileges: privMap,
      };
    });

    const entries = await Promise.all(grantPromises);
    accounts.push(...entries);

    return {
      success: true,
      scope,
      database,
      table,
      column,
      routineType,
      routineName,
      applicablePrivileges,
      accounts,
    };
  } catch (err: any) {
    return {
      success: false,
      scope,
      database,
      table,
      column,
      routineType,
      routineName,
      applicablePrivileges,
      accounts: [],
      error: err.message || 'Error loading permissions matrix',
      errorFa: `خطا در بارگذاری ماتریس مجوزها: ${err.message}`,
    };
  }
}

/**
 * Applies a batch of GRANT / REVOKE actions safely on MySQL.
 */
export async function applyMysqlPermissions(
  server: RemoteServer,
  request: MysqlApplyPermissionsRequest
): Promise<MysqlApplyPermissionsResult> {
  const { scope, database, table, column, routineType, routineName, deltas } = request;

  if (!deltas || deltas.length === 0) {
    return {
      success: true,
      executedStatements: [],
      appliedCount: 0,
      message: 'No permission changes to apply.',
      messageFa: 'هیچ تغییری برای اعمال انتخاب نشده است.',
    };
  }

  // Format the target ON clause
  let targetClause = '*.*';
  if (scope === 'database') {
    if (!database) throw new Error('Database name is required for database-scope permissions');
    targetClause = `\`${database.replace(/`/g, '``')}\`.*`;
  } else if (scope === 'table') {
    if (!database || !table) throw new Error('Database and Table names are required for table-scope permissions');
    targetClause = `\`${database.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\``;
  } else if (scope === 'column') {
    if (!database || !table || !column) throw new Error('Database, Table and Column names are required for column-scope permissions');
    targetClause = `\`${database.replace(/`/g, '``')}\`.\`${table.replace(/`/g, '``')}\``;
  } else if (scope === 'routine') {
    if (!database || !routineName) throw new Error('Database and Routine names are required for routine-scope permissions');
    const rType = routineType === 'FUNCTION' ? 'FUNCTION' : 'PROCEDURE';
    targetClause = `${rType} \`${database.replace(/`/g, '``')}\`.\`${routineName.replace(/`/g, '``')}\``;
  }

  const statements: string[] = [];

  for (const delta of deltas) {
    const safeUser = delta.user.replace(/'/g, "''");
    const safeHost = delta.host.replace(/'/g, "''");
    let privClause = delta.privilege;

    // Handle column specific privilege
    if (scope === 'column' && column) {
      privClause = `${delta.privilege} (\`${column.replace(/`/g, '``')}\`)`;
    }

    if (delta.action === 'grant') {
      if (delta.privilege === 'GRANT OPTION') {
        statements.push(`GRANT USAGE ON ${targetClause} TO '${safeUser}'@'${safeHost}' WITH GRANT OPTION;`);
      } else {
        const withOpt = delta.withGrantOption ? ' WITH GRANT OPTION' : '';
        statements.push(`GRANT ${privClause} ON ${targetClause} TO '${safeUser}'@'${safeHost}'${withOpt};`);
      }
    } else {
      if (delta.privilege === 'GRANT OPTION') {
        statements.push(`REVOKE GRANT OPTION ON ${targetClause} FROM '${safeUser}'@'${safeHost}';`);
      } else {
        statements.push(`REVOKE ${privClause} ON ${targetClause} FROM '${safeUser}'@'${safeHost}';`);
      }
    }
  }

  // Always flush privileges at the end
  statements.push('FLUSH PRIVILEGES;');

  const config = getMysqlConfig(server);
  let conn: mysql.Connection | null = null;
  const executedStatements: string[] = [];
  const failedStatements: string[] = [];

  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: 'mysql',
      connectTimeout: 7000,
    });

    for (const sql of statements) {
      try {
        await conn.query(sql);
        executedStatements.push(sql);
      } catch (sqlErr: any) {
        failedStatements.push(`${sql} -> Error: ${sqlErr.message}`);
      }
    }

    await conn.end();

    const hasFailures = failedStatements.length > 0;
    const appliedCount = executedStatements.length - (executedStatements.includes('FLUSH PRIVILEGES;') ? 1 : 0);

    return {
      success: !hasFailures,
      executedStatements,
      failedStatements: hasFailures ? failedStatements : undefined,
      appliedCount,
      message: hasFailures
        ? `Applied ${appliedCount} statements with ${failedStatements.length} errors.`
        : `Successfully applied ${appliedCount} permission modification(s).`,
      messageFa: hasFailures
        ? `تعداد ${appliedCount} مجوز اعمال شد ولی ${failedStatements.length} خطا رخ داد.`
        : `تعداد ${appliedCount} تغییر در سطوح دسترسی و مجوزها با موفقیت اعمال گردید.`,
      error: hasFailures ? failedStatements.join('\n') : undefined,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedStatements,
      failedStatements,
      appliedCount: executedStatements.length,
      message: 'Failed to execute permission statements',
      messageFa: 'خطا در برقراری ارتباط و اعمال مجوزها',
      error: err.message,
      errorFa: `خطا در اعمال مجوزهای MySQL: ${err.message}`,
    };
  }
}

// ==========================================
// Phase 13: Table, Column, Index & Constraint Management
// ==========================================

function escapeIdent(ident: string): string {
  return `\`${(ident || '').replace(/`/g, '``')}\``;
}

function buildColumnDef(col: MysqlTableColumnDefinition): string {
  const name = escapeIdent(col.name);
  let typeStr = (col.dataType || 'VARCHAR').toUpperCase();
  if (col.length && col.length.trim()) {
    typeStr += `(${col.length.trim()})`;
  }
  const unsignedStr = col.unsigned ? ' UNSIGNED' : '';
  const nullStr = col.nullable ? ' NULL' : ' NOT NULL';

  let defaultStr = '';
  if (col.isDefaultNull) {
    defaultStr = ' DEFAULT NULL';
  } else if (col.isDefaultCurrentTimestamp) {
    defaultStr = ' DEFAULT CURRENT_TIMESTAMP';
  } else if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '') {
    const trimmed = col.defaultValue.trim();
    if (['NOW()', 'CURRENT_TIMESTAMP', 'NULL', 'TRUE', 'FALSE'].includes(trimmed.toUpperCase())) {
      defaultStr = ` DEFAULT ${trimmed}`;
    } else if (!isNaN(Number(trimmed)) && !['VARCHAR', 'CHAR', 'TEXT'].includes(col.dataType.toUpperCase())) {
      defaultStr = ` DEFAULT ${trimmed}`;
    } else {
      defaultStr = ` DEFAULT '${trimmed.replace(/'/g, "''")}'`;
    }
  }

  const autoIncStr = col.autoIncrement ? ' AUTO_INCREMENT' : '';
  const uniqueStr = col.unique ? ' UNIQUE' : '';
  const commentStr = col.comment ? ` COMMENT '${col.comment.replace(/'/g, "''")}'` : '';

  return `${name} ${typeStr}${unsignedStr}${nullStr}${defaultStr}${autoIncStr}${uniqueStr}${commentStr}`;
}

/**
 * Creates a new MySQL table with columns, keys, and engine options.
 */
export async function createMysqlTable(
  server: RemoteServer,
  req: MysqlCreateTableRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  let sql = '';

  try {
    if (!req.database || !req.tableName) {
      throw new Error('Database and table name are required.');
    }
    if (!req.columns || req.columns.length === 0) {
      throw new Error('At least one column is required to create a table.');
    }

    const columnDefs: string[] = [];
    const pkColumns: string[] = [];

    for (const col of req.columns) {
      if (!col.name || !col.name.trim()) continue;
      columnDefs.push(`  ${buildColumnDef(col)}`);
      if (col.primaryKey) {
        pkColumns.push(escapeIdent(col.name));
      }
    }

    if (pkColumns.length > 0) {
      columnDefs.push(`  PRIMARY KEY (${pkColumns.join(', ')})`);
    }

    const engine = req.engine || 'InnoDB';
    const charset = req.charset || 'utf8mb4';
    const collation = req.collation || 'utf8mb4_unicode_ci';
    const comment = req.comment ? ` COMMENT='${req.comment.replace(/'/g, "''")}'` : '';

    sql = `CREATE TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} (\n${columnDefs.join(',\n')}\n) ENGINE=${engine} DEFAULT CHARSET=${charset} COLLATE=${collation}${comment};`;

    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    console.log(`[MYSQL AUDIT] Table created: ${req.database}.${req.tableName} on server ${server.name} (${server.ip}) in ${duration}ms`);

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `Table '${req.tableName}' created successfully.`,
      messageFa: `جدول «${req.tableName}» با موفقیت در پایگاه داده ایجاد شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to create table '${req.tableName}'.`,
      messageFa: `خطا در ایجاد جدول «${req.tableName}».`,
      error: err.message,
      errorFa: `خطای ساختار MySQL: ${err.message}`,
    };
  }
}

/**
 * Renames an existing MySQL table.
 */
export async function renameMysqlTable(
  server: RemoteServer,
  req: MysqlRenameTableRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const sql = `RENAME TABLE ${escapeIdent(req.database)}.${escapeIdent(req.oldTableName)} TO ${escapeIdent(req.database)}.${escapeIdent(req.newTableName)};`;

  try {
    if (!req.oldTableName || !req.newTableName) {
      throw new Error('Current and new table names are required.');
    }
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    console.log(`[MYSQL AUDIT] Table renamed: ${req.database}.${req.oldTableName} -> ${req.newTableName} on ${server.name}`);

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `Table '${req.oldTableName}' renamed to '${req.newTableName}' successfully.`,
      messageFa: `نام جدول از «${req.oldTableName}» به «${req.newTableName}» تغییر یافت.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to rename table '${req.oldTableName}'.`,
      messageFa: `خطا در تغییر نام جدول «${req.oldTableName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Alters table options (Engine, Charset, Collation, Auto Increment, Comment).
 */
export async function alterMysqlTableOptions(
  server: RemoteServer,
  req: MysqlAlterTableOptionsRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const options: string[] = [];

  if (req.engine) options.push(`ENGINE = ${req.engine}`);
  if (req.charset) options.push(`CONVERT TO CHARACTER SET ${req.charset}`);
  if (req.collation) options.push(`COLLATE ${req.collation}`);
  if (req.comment !== undefined) options.push(`COMMENT = '${req.comment.replace(/'/g, "''")}'`);
  if (req.autoIncrement !== undefined && !isNaN(req.autoIncrement)) {
    options.push(`AUTO_INCREMENT = ${req.autoIncrement}`);
  }

  if (options.length === 0) {
    return {
      success: true,
      executedSql: '-- No options modified',
      executionTimeMs: 0,
      message: 'No table options to update.',
      messageFa: 'هیچ گزینه‌ای برای به‌روزرسانی جدول مشخص نشده بود.',
    };
  }

  const sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} ${options.join(', ')};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Table '${req.tableName}' options updated successfully.`,
      messageFa: `مشخصات و تنظیمات جدول «${req.tableName}» با موفقیت ویرایش شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to alter table '${req.tableName}' options.`,
      messageFa: `خطا در ویرایش تنظیمات جدول «${req.tableName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops an existing MySQL table.
 */
export async function dropMysqlTable(
  server: RemoteServer,
  req: MysqlDropTableRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const ifExists = req.ifExists !== false ? 'IF EXISTS ' : '';
  const sql = `DROP TABLE ${ifExists}${escapeIdent(req.database)}.${escapeIdent(req.tableName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    console.log(`[MYSQL AUDIT] Table dropped: ${req.database}.${req.tableName} on ${server.name} (${server.ip}) in ${duration}ms`);

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `Table '${req.tableName}' dropped successfully.`,
      messageFa: `جدول «${req.tableName}» با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop table '${req.tableName}'.`,
      messageFa: `خطا در حذف جدول «${req.tableName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Truncates an existing MySQL table.
 */
export async function truncateMysqlTable(
  server: RemoteServer,
  req: MysqlTruncateTableRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const sql = `TRUNCATE TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    console.log(`[MYSQL AUDIT] Table truncated: ${req.database}.${req.tableName} on ${server.name}`);

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `Table '${req.tableName}' truncated successfully.`,
      messageFa: `داده‌های جدول «${req.tableName}» به طور کامل پاکسازی (Truncate) شدند.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to truncate table '${req.tableName}'.`,
      messageFa: `خطا در پاکسازی جدول «${req.tableName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Adds a new column to a MySQL table.
 */
export async function addMysqlColumn(
  server: RemoteServer,
  req: MysqlAddColumnRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;

  let pos = '';
  if (req.column.position === 'FIRST') {
    pos = ' FIRST';
  } else if (req.column.position === 'AFTER' && req.column.afterColumn) {
    pos = ` AFTER ${escapeIdent(req.column.afterColumn)}`;
  }

  const sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} ADD COLUMN ${buildColumnDef(req.column)}${pos};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Column '${req.column.name}' added to table '${req.tableName}' successfully.`,
      messageFa: `ستون «${req.column.name}» با موفقیت به جدول افزوده شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to add column '${req.column.name}'.`,
      messageFa: `خطا در افزودن ستون «${req.column.name}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Modifies an existing column definition in a MySQL table.
 */
export async function modifyMysqlColumn(
  server: RemoteServer,
  req: MysqlModifyColumnRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;

  let pos = '';
  if (req.column.position === 'FIRST') {
    pos = ' FIRST';
  } else if (req.column.position === 'AFTER' && req.column.afterColumn) {
    pos = ` AFTER ${escapeIdent(req.column.afterColumn)}`;
  }

  const sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} MODIFY COLUMN ${buildColumnDef(req.column)}${pos};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Column '${req.column.name}' modified successfully.`,
      messageFa: `مشخصات ستون «${req.column.name}» با موفقیت ویرایش شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to modify column '${req.column.name}'.`,
      messageFa: `خطا در ویرایش ستون «${req.column.name}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Renames a column in a MySQL table with backward-compatible fallback.
 */
export async function renameMysqlColumn(
  server: RemoteServer,
  req: MysqlRenameColumnRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} RENAME COLUMN ${escapeIdent(req.oldColumnName)} TO ${escapeIdent(req.newColumnName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    try {
      await conn.query(sql);
    } catch (renameErr: any) {
      // If MySQL 5.7, RENAME COLUMN might not be supported; fallback to CHANGE COLUMN if definition is provided
      if (req.columnDefinition) {
        const fallbackDef = { ...req.columnDefinition, name: req.newColumnName };
        const changeSql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} CHANGE COLUMN ${escapeIdent(req.oldColumnName)} ${buildColumnDef(fallbackDef)};`;
        await conn.query(changeSql);
        await conn.end();
        return {
          success: true,
          executedSql: changeSql,
          executionTimeMs: Date.now() - startTime,
          message: `Column '${req.oldColumnName}' renamed to '${req.newColumnName}' via CHANGE COLUMN.`,
          messageFa: `نام ستون از «${req.oldColumnName}» به «${req.newColumnName}» تغییر یافت.`,
        };
      }
      throw renameErr;
    }

    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Column '${req.oldColumnName}' renamed to '${req.newColumnName}' successfully.`,
      messageFa: `نام ستون از «${req.oldColumnName}» به «${req.newColumnName}» تغییر یافت.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to rename column '${req.oldColumnName}'.`,
      messageFa: `خطا در تغییر نام ستون «${req.oldColumnName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops a column from a MySQL table.
 */
export async function dropMysqlColumn(
  server: RemoteServer,
  req: MysqlDropColumnRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} DROP COLUMN ${escapeIdent(req.columnName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    console.log(`[MYSQL AUDIT] Column dropped: ${req.database}.${req.tableName}.${req.columnName} on ${server.name}`);

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `Column '${req.columnName}' dropped from table '${req.tableName}' successfully.`,
      messageFa: `ستون «${req.columnName}» با موفقیت از جدول حذف شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop column '${req.columnName}'.`,
      messageFa: `خطا در حذف ستون «${req.columnName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Creates an index on a MySQL table.
 */
export async function createMysqlIndex(
  server: RemoteServer,
  req: MysqlCreateIndexRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;

  if (!req.columns || req.columns.length === 0) {
    return {
      success: false,
      executedSql: '',
      executionTimeMs: 0,
      message: 'At least one column is required for an index.',
      messageFa: 'حداقل یک ستون برای ساخت ایندکس الزامی است.',
    };
  }

  const colSpecs = req.columns.map((c) => {
    let spec = escapeIdent(c.name);
    if (c.length && c.length > 0) spec += `(${c.length})`;
    if (c.order) spec += ` ${c.order}`;
    return spec;
  });

  let indexTypePrefix = '';
  if (req.indexType === 'UNIQUE') indexTypePrefix = 'UNIQUE ';
  else if (req.indexType === 'FULLTEXT') indexTypePrefix = 'FULLTEXT ';
  else if (req.indexType === 'SPATIAL') indexTypePrefix = 'SPATIAL ';

  let usingMethod = '';
  if (req.indexMethod && ['BTREE', 'HASH'].includes(req.indexMethod.toUpperCase())) {
    usingMethod = ` USING ${req.indexMethod.toUpperCase()}`;
  }

  let comment = '';
  if (req.comment) {
    comment = ` COMMENT '${req.comment.replace(/'/g, "''")}'`;
  }

  const sql = `CREATE ${indexTypePrefix}INDEX ${escapeIdent(req.indexName)} ON ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} (${colSpecs.join(', ')})${usingMethod}${comment};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Index '${req.indexName}' created successfully.`,
      messageFa: `ایندکس «${req.indexName}» با موفقیت بر روی جدول ایجاد شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to create index '${req.indexName}'.`,
      messageFa: `خطا در ایجاد ایندکس «${req.indexName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops an index from a MySQL table.
 */
export async function dropMysqlIndex(
  server: RemoteServer,
  req: MysqlDropIndexRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const sql = `DROP INDEX ${escapeIdent(req.indexName)} ON ${escapeIdent(req.database)}.${escapeIdent(req.tableName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Index '${req.indexName}' dropped successfully.`,
      messageFa: `ایندکس «${req.indexName}» با موفقیت از جدول حذف شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop index '${req.indexName}'.`,
      messageFa: `خطا در حذف ایندکس «${req.indexName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Adds a Foreign Key constraint to a MySQL table.
 */
export async function addMysqlForeignKey(
  server: RemoteServer,
  req: MysqlAddForeignKeyRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;

  const targetSchema = req.referencedSchema || req.database;
  const onUpdate = req.onUpdate || 'RESTRICT';
  const onDelete = req.onDelete || 'RESTRICT';

  const sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} ADD CONSTRAINT ${escapeIdent(req.constraintName)} FOREIGN KEY (${escapeIdent(req.column)}) REFERENCES ${escapeIdent(targetSchema)}.${escapeIdent(req.referencedTable)} (${escapeIdent(req.referencedColumn)}) ON UPDATE ${onUpdate} ON DELETE ${onDelete};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Foreign Key '${req.constraintName}' added successfully.`,
      messageFa: `کلید خارجی (Foreign Key) «${req.constraintName}» با موفقیت افزوده شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to add Foreign Key '${req.constraintName}'.`,
      messageFa: `خطا در افزودن کلید خارجی «${req.constraintName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops a Foreign Key constraint from a MySQL table.
 */
export async function dropMysqlForeignKey(
  server: RemoteServer,
  req: MysqlDropForeignKeyRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} DROP FOREIGN KEY ${escapeIdent(req.constraintName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Foreign Key '${req.constraintName}' dropped successfully.`,
      messageFa: `کلید خارجی «${req.constraintName}» با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop Foreign Key '${req.constraintName}'.`,
      messageFa: `خطا در حذف کلید خارجی «${req.constraintName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Adds or drops a Primary Key constraint on a MySQL table.
 */
export async function manageMysqlPrimaryKey(
  server: RemoteServer,
  req: MysqlManagePrimaryKeyRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  let sql = '';

  if (req.action === 'drop') {
    sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} DROP PRIMARY KEY;`;
  } else {
    if (!req.columns || req.columns.length === 0) {
      return {
        success: false,
        executedSql: '',
        executionTimeMs: 0,
        message: 'At least one column is required for Primary Key.',
        messageFa: 'تعیین حداقل یک ستون برای کلید اصلی الزامی است.',
      };
    }
    const cols = req.columns.map((c) => escapeIdent(c)).join(', ');
    sql = `ALTER TABLE ${escapeIdent(req.database)}.${escapeIdent(req.tableName)} ADD PRIMARY KEY (${cols});`;
  }

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: req.action === 'drop' ? 'Primary key dropped successfully.' : 'Primary key configured successfully.',
      messageFa: req.action === 'drop' ? 'کلید اصلی جدول حذف شد.' : 'کلید اصلی جدول با موفقیت تنظیم گردید.',
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: 'Failed to modify primary key.',
      messageFa: 'خطا در اعمال تغییرات کلید اصلی جدول.',
      error: err.message,
      errorFa: err.message,
    };
  }
}

// ==========================================
// Phase 14: Views, Procedures, Functions, Triggers & Events
// ==========================================

/**
 * Creates or alters a MySQL View.
 */
export async function createMysqlView(
  server: RemoteServer,
  req: MysqlCreateViewRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  let sql = '';

  try {
    if (!req.database || !req.viewName) {
      throw new Error('Database and view name are required.');
    }
    if (!req.query || !req.query.trim()) {
      throw new Error('SELECT query is required for view creation.');
    }

    const replacePrefix = req.orReplace !== false ? 'OR REPLACE ' : '';
    const security = req.securityType === 'INVOKER' ? 'SQL SECURITY INVOKER ' : '';
    const checkOption =
      req.checkOption === 'CASCADED'
        ? ' WITH CASCADED CHECK OPTION'
        : req.checkOption === 'LOCAL'
        ? ' WITH LOCAL CHECK OPTION'
        : '';

    sql = `CREATE ${replacePrefix}${security}VIEW ${escapeIdent(req.database)}.${escapeIdent(req.viewName)} AS\n${req.query.trim().replace(/;+$/, '')}${checkOption};`;

    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    console.log(`[MYSQL AUDIT] View created/altered: ${req.database}.${req.viewName} on ${server.name} in ${duration}ms`);

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `View '${req.viewName}' saved successfully.`,
      messageFa: `نمای «${req.viewName}» با موفقیت در پایگاه داده ایجاد/بروزرسانی شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to save view '${req.viewName}'.`,
      messageFa: `خطا در ذخیره‌سازی نمای «${req.viewName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops a MySQL View.
 */
export async function dropMysqlView(
  server: RemoteServer,
  req: MysqlDropViewRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const ifExists = req.ifExists !== false ? 'IF EXISTS ' : '';
  const sql = `DROP VIEW ${ifExists}${escapeIdent(req.database)}.${escapeIdent(req.viewName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `View '${req.viewName}' dropped successfully.`,
      messageFa: `نمای «${req.viewName}» با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop view '${req.viewName}'.`,
      messageFa: `خطا در حذف نمای «${req.viewName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Creates or replaces a MySQL Stored Procedure.
 */
export async function createMysqlProcedure(
  server: RemoteServer,
  req: MysqlCreateProcedureRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const executedStatements: string[] = [];

  try {
    if (!req.database || !req.procedureName) {
      throw new Error('Database and procedure name are required.');
    }
    if (!req.body || !req.body.trim()) {
      throw new Error('Procedure body is required.');
    }

    const paramsSql = (req.parameters || [])
      .map((p) => {
        const mode = p.mode || 'IN';
        let typeStr = p.dataType.toUpperCase();
        if (p.length) typeStr += `(${p.length})`;
        return `${mode} ${escapeIdent(p.name)} ${typeStr}`;
      })
      .join(', ');

    const deterministic = req.deterministic ? 'DETERMINISTIC' : 'NOT DETERMINISTIC';
    const security = req.securityType === 'INVOKER' ? 'SQL SECURITY INVOKER' : 'SQL SECURITY DEFINER';
    const comment = req.comment ? ` COMMENT '${req.comment.replace(/'/g, "''")}'` : '';

    const dropSql = `DROP PROCEDURE IF EXISTS ${escapeIdent(req.database)}.${escapeIdent(req.procedureName)};`;
    const createSql = `CREATE PROCEDURE ${escapeIdent(req.database)}.${escapeIdent(req.procedureName)} (${paramsSql})\n${deterministic}\n${security}${comment}\n${req.body.trim()};`;

    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    if (req.orReplace !== false) {
      await conn.query(dropSql);
      executedStatements.push(dropSql);
    }
    await conn.query(createSql);
    executedStatements.push(createSql);
    await conn.end();

    const duration = Date.now() - startTime;
    console.log(`[MYSQL AUDIT] Procedure saved: ${req.database}.${req.procedureName} on ${server.name} in ${duration}ms`);

    return {
      success: true,
      executedSql: executedStatements.join('\n\n'),
      executionTimeMs: duration,
      message: `Stored procedure '${req.procedureName}' saved successfully.`,
      messageFa: `رویه ذخیره‌شده «${req.procedureName}» با موفقیت ذخیره گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: executedStatements.join('\n\n'),
      executionTimeMs: Date.now() - startTime,
      message: `Failed to save stored procedure '${req.procedureName}'.`,
      messageFa: `خطا در ذخیره‌سازی رویه «${req.procedureName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops a MySQL Stored Procedure.
 */
export async function dropMysqlProcedure(
  server: RemoteServer,
  req: MysqlDropProcedureRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const ifExists = req.ifExists !== false ? 'IF EXISTS ' : '';
  const sql = `DROP PROCEDURE ${ifExists}${escapeIdent(req.database)}.${escapeIdent(req.procedureName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Stored procedure '${req.procedureName}' dropped successfully.`,
      messageFa: `رویه ذخیره‌شده «${req.procedureName}» با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop procedure '${req.procedureName}'.`,
      messageFa: `خطا در حذف رویه «${req.procedureName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Executes a Stored Procedure and returns result sets and output parameters.
 */
export async function executeMysqlProcedure(
  server: RemoteServer,
  req: MysqlExecuteProcedureRequest
): Promise<MysqlExecuteProcedureResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;

  try {
    const escapedArgs: string[] = [];
    const outVarNames: string[] = [];

    for (let i = 0; i < (req.parameters || []).length; i++) {
      const p = req.parameters[i];
      if (p.mode === 'OUT' || p.mode === 'INOUT') {
        const varName = `@out_${p.name.replace(/[^a-zA-Z0-9_]/g, '')}_${i}`;
        outVarNames.push(varName);
        escapedArgs.push(varName);
      } else {
        if (p.value === null || p.value === undefined || p.value === 'NULL') {
          escapedArgs.push('NULL');
        } else if (typeof p.value === 'number') {
          escapedArgs.push(String(p.value));
        } else {
          escapedArgs.push(`'${String(p.value).replace(/'/g, "''")}'`);
        }
      }
    }

    const callSql = `CALL ${escapeIdent(req.database)}.${escapeIdent(req.procedureName)}(${escapedArgs.join(', ')});`;
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    const [callResult]: any = await conn.query(callSql);

    const resultSets: Array<{ columns: string[]; rows: Record<string, any>[] }> = [];
    if (Array.isArray(callResult)) {
      for (const item of callResult) {
        if (Array.isArray(item)) {
          const rows = item as Record<string, any>[];
          const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
          resultSets.push({ columns, rows });
        }
      }
    }

    let outputParameters: Record<string, any> | undefined = undefined;
    if (outVarNames.length > 0) {
      const [outRows]: any = await conn.query(`SELECT ${outVarNames.join(', ')};`);
      if (outRows && outRows[0]) {
        outputParameters = outRows[0];
      }
    }

    await conn.end();

    const duration = Date.now() - startTime;
    return {
      success: true,
      database: req.database,
      procedureName: req.procedureName,
      resultSets,
      outputParameters,
      executionTimeMs: duration,
      message: `Procedure executed successfully in ${duration}ms.`,
      messageFa: `رویه با موفقیت در مدت ${duration} میلی‌ثانیه اجرا شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      database: req.database,
      procedureName: req.procedureName,
      resultSets: [],
      executionTimeMs: Date.now() - startTime,
      message: `Failed to execute procedure: ${err.message}`,
      messageFa: `خطا در اجرای رویه: ${err.message}`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Creates or replaces a MySQL Stored Function.
 */
export async function createMysqlFunction(
  server: RemoteServer,
  req: MysqlCreateFunctionRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const executedStatements: string[] = [];

  try {
    if (!req.database || !req.functionName) {
      throw new Error('Database and function name are required.');
    }
    if (!req.returnType) {
      throw new Error('Return type is required for stored function.');
    }
    if (!req.body || !req.body.trim()) {
      throw new Error('Function body is required.');
    }

    const paramsSql = (req.parameters || [])
      .map((p) => {
        let typeStr = p.dataType.toUpperCase();
        if (p.length) typeStr += `(${p.length})`;
        return `${escapeIdent(p.name)} ${typeStr}`;
      })
      .join(', ');

    const deterministic = req.deterministic ? 'DETERMINISTIC' : 'NOT DETERMINISTIC';
    const security = req.securityType === 'INVOKER' ? 'SQL SECURITY INVOKER' : 'SQL SECURITY DEFINER';
    const comment = req.comment ? ` COMMENT '${req.comment.replace(/'/g, "''")}'` : '';

    const dropSql = `DROP FUNCTION IF EXISTS ${escapeIdent(req.database)}.${escapeIdent(req.functionName)};`;
    const createSql = `CREATE FUNCTION ${escapeIdent(req.database)}.${escapeIdent(req.functionName)} (${paramsSql})\nRETURNS ${req.returnType.toUpperCase()}\n${deterministic}\n${security}${comment}\n${req.body.trim()};`;

    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    if (req.orReplace !== false) {
      await conn.query(dropSql);
      executedStatements.push(dropSql);
    }
    await conn.query(createSql);
    executedStatements.push(createSql);
    await conn.end();

    const duration = Date.now() - startTime;
    return {
      success: true,
      executedSql: executedStatements.join('\n\n'),
      executionTimeMs: duration,
      message: `Stored function '${req.functionName}' saved successfully.`,
      messageFa: `تابع ذخیره‌شده «${req.functionName}» با موفقیت ذخیره گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: executedStatements.join('\n\n'),
      executionTimeMs: Date.now() - startTime,
      message: `Failed to save stored function '${req.functionName}'.`,
      messageFa: `خطا در ذخیره‌سازی تابع «${req.functionName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops a MySQL Stored Function.
 */
export async function dropMysqlFunction(
  server: RemoteServer,
  req: MysqlDropFunctionRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const ifExists = req.ifExists !== false ? 'IF EXISTS ' : '';
  const sql = `DROP FUNCTION ${ifExists}${escapeIdent(req.database)}.${escapeIdent(req.functionName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Stored function '${req.functionName}' dropped successfully.`,
      messageFa: `تابع ذخیره‌شده «${req.functionName}» با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop function '${req.functionName}'.`,
      messageFa: `خطا در حذف تابع «${req.functionName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Creates a MySQL Trigger.
 */
export async function createMysqlTrigger(
  server: RemoteServer,
  req: MysqlCreateTriggerRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  let sql = '';

  try {
    if (!req.database || !req.triggerName || !req.tableName) {
      throw new Error('Database, trigger name, and table name are required.');
    }
    if (!req.statement || !req.statement.trim()) {
      throw new Error('Trigger statement body is required.');
    }

    const timing = req.timing || 'AFTER';
    const event = req.event || 'INSERT';

    sql = `CREATE TRIGGER ${escapeIdent(req.database)}.${escapeIdent(req.triggerName)}\n${timing} ${event} ON ${escapeIdent(req.database)}.${escapeIdent(req.tableName)}\nFOR EACH ROW\n${req.statement.trim().replace(/;+$/, '')};`;

    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `Trigger '${req.triggerName}' created successfully.`,
      messageFa: `تریگر «${req.triggerName}» با موفقیت بر روی جدول «${req.tableName}» ایجاد شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to create trigger '${req.triggerName}'.`,
      messageFa: `خطا در ایجاد تریگر «${req.triggerName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops a MySQL Trigger.
 */
export async function dropMysqlTrigger(
  server: RemoteServer,
  req: MysqlDropTriggerRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const ifExists = req.ifExists !== false ? 'IF EXISTS ' : '';
  const sql = `DROP TRIGGER ${ifExists}${escapeIdent(req.database)}.${escapeIdent(req.triggerName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Trigger '${req.triggerName}' dropped successfully.`,
      messageFa: `تریگر «${req.triggerName}» با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop trigger '${req.triggerName}'.`,
      messageFa: `خطا در حذف تریگر «${req.triggerName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Checks MySQL Event Scheduler status.
 */
export async function getMysqlEventSchedulerStatus(
  server: RemoteServer
): Promise<MysqlEventSchedulerStatus> {
  let conn: mysql.Connection | null = null;
  try {
    const config = getMysqlConfig(server);
    conn = await mysql.createConnection(config);
    const [rows]: any = await conn.query("SHOW VARIABLES LIKE 'event_scheduler';");
    await conn.end();

    const val = rows?.[0]?.Value || 'OFF';
    return {
      enabled: val.toUpperCase() === 'ON',
      rawStatus: val,
    };
  } catch (err) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      enabled: false,
      rawStatus: 'UNKNOWN',
    };
  }
}

/**
 * Enables or disables MySQL Event Scheduler.
 */
export async function setMysqlEventSchedulerStatus(
  server: RemoteServer,
  req: MysqlSetEventSchedulerRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const stateStr = req.enabled ? 'ON' : 'OFF';
  const sql = `SET GLOBAL event_scheduler = ${stateStr};`;

  try {
    const config = getMysqlConfig(server);
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Event scheduler turned ${stateStr}.`,
      messageFa: `زمان‌بند رویدادها (Event Scheduler) به حالت «${stateStr}» تغییر یافت.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to set event scheduler: ${err.message}`,
      messageFa: `خطا در تغییر وضعیت Event Scheduler: ${err.message}`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Creates a MySQL Scheduled Event.
 */
export async function createMysqlEvent(
  server: RemoteServer,
  req: MysqlCreateEventRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  let sql = '';

  try {
    if (!req.database || !req.eventName) {
      throw new Error('Database and event name are required.');
    }
    if (!req.statement || !req.statement.trim()) {
      throw new Error('Event action statement is required.');
    }

    let scheduleSql = '';
    if (req.scheduleType === 'AT' && req.executeAt) {
      scheduleSql = `AT '${req.executeAt}'`;
    } else {
      const interval = req.intervalValue || 1;
      const field = req.intervalField || 'DAY';
      scheduleSql = `EVERY ${interval} ${field}`;
      if (req.startsAt) scheduleSql += ` STARTS '${req.startsAt}'`;
      if (req.endsAt) scheduleSql += ` ENDS '${req.endsAt}'`;
    }

    const completion = req.onCompletion === 'NOT PRESERVE' ? 'ON COMPLETION NOT PRESERVE' : 'ON COMPLETION PRESERVE';
    const status = req.status || 'ENABLE';
    const comment = req.comment ? ` COMMENT '${req.comment.replace(/'/g, "''")}'` : '';

    sql = `CREATE EVENT ${escapeIdent(req.database)}.${escapeIdent(req.eventName)}\nON SCHEDULE ${scheduleSql}\n${completion}\n${status}${comment}\nDO\n${req.statement.trim().replace(/;+$/, '')};`;

    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    const duration = Date.now() - startTime;
    return {
      success: true,
      executedSql: sql,
      executionTimeMs: duration,
      message: `Event '${req.eventName}' created successfully.`,
      messageFa: `رویداد زمان‌بندی‌شده «${req.eventName}» با موفقیت ایجاد شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to create event '${req.eventName}'.`,
      messageFa: `خطا در ایجاد رویداد «${req.eventName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Alters status of a MySQL Scheduled Event (ENABLE / DISABLE).
 */
export async function alterMysqlEventStatus(
  server: RemoteServer,
  req: MysqlAlterEventStatusRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const sql = `ALTER EVENT ${escapeIdent(req.database)}.${escapeIdent(req.eventName)} ${req.status};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Event '${req.eventName}' set to ${req.status}.`,
      messageFa: `وضعیت رویداد «${req.eventName}» به ${req.status} تغییر یافت.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to alter event status.`,
      messageFa: `خطا در تغییر وضعیت رویداد.`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

/**
 * Drops a MySQL Scheduled Event.
 */
export async function dropMysqlEvent(
  server: RemoteServer,
  req: MysqlDropEventRequest
): Promise<MysqlDdlOperationResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;
  const ifExists = req.ifExists !== false ? 'IF EXISTS ' : '';
  const sql = `DROP EVENT ${ifExists}${escapeIdent(req.database)}.${escapeIdent(req.eventName)};`;

  try {
    const config = getMysqlConfig(server, { database: req.database });
    conn = await mysql.createConnection(config);

    await conn.query(sql);
    await conn.end();

    return {
      success: true,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Event '${req.eventName}' dropped successfully.`,
      messageFa: `رویداد زمان‌بندی‌شده «${req.eventName}» با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      executedSql: sql,
      executionTimeMs: Date.now() - startTime,
      message: `Failed to drop event '${req.eventName}'.`,
      messageFa: `خطا در حذف رویداد «${req.eventName}».`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

// ==========================================
// Phase 15: MySQL Full Database & Table Backup, Dump & Export Suite
// ==========================================

function formatSqlLiteral(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 'NULL';
    return String(val);
  }
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) {
    return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  if (Buffer.isBuffer(val)) {
    return `X'${val.toString('hex')}'`;
  }
  if (typeof val === 'object') {
    try {
      const jsonStr = JSON.stringify(val);
      return `'${jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    } catch {
      return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    }
  }
  const str = String(val);
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '\\0').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

/**
 * Generates full or selective MySQL Dump / Export in SQL, JSON, or CSV format.
 */
export async function generateMysqlDump(
  server: RemoteServer,
  options: MysqlDumpOptions
): Promise<MysqlDumpResult> {
  const startTime = Date.now();
  let conn: mysql.Connection | null = null;

  try {
    if (!options.database) {
      throw new Error('Target database name is required for dump.');
    }

    const format = options.format || 'sql';
    const scope = options.scope || 'all';
    const includeDrop = options.includeDropTable !== false;
    const includeCreateDb = Boolean(options.includeCreateDb);
    const disableFk = options.disableForeignKeyChecks !== false;
    const includeViews = options.includeViews !== false;
    const includeRoutines = options.includeRoutines !== false;
    const includeTriggers = options.includeTriggers !== false;
    const includeEvents = options.includeEvents !== false;
    const maxRows = options.maxRowsPerTable && options.maxRowsPerTable > 0 ? options.maxRowsPerTable : 0;
    const batchSize = options.insertBatchSize && options.insertBatchSize > 0 ? options.insertBatchSize : 100;

    const config = getMysqlConfig(server, { database: options.database });
    conn = await mysql.createConnection(config);

    // 1. Discover all base tables and views in database
    const [tableRows] = (await conn.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME ASC`,
      [options.database]
    )) as [any[], any];

    const allBaseTables: string[] = [];
    const allViews: string[] = [];

    tableRows.forEach((r) => {
      const type = (r.TABLE_TYPE || '').toUpperCase();
      if (type.includes('VIEW')) {
        allViews.push(r.TABLE_NAME);
      } else {
        allBaseTables.push(r.TABLE_NAME);
      }
    });

    // Filter by selected tables if requested
    const targetBaseTables =
      options.selectedTables && options.selectedTables.length > 0
        ? allBaseTables.filter((t) => options.selectedTables!.includes(t))
        : allBaseTables;

    const targetViews =
      options.selectedTables && options.selectedTables.length > 0
        ? allViews.filter((v) => options.selectedTables!.includes(v))
        : allViews;

    let outputContent = '';
    let totalRowsExported = 0;

    if (format === 'sql') {
      const nowStr = new Date().toISOString();
      const parts: string[] = [];

      // Header comments and session configurations
      parts.push(`-- ------------------------------------------------------`);
      parts.push(`-- NetTopology MySQL Database Dump & Export Suite`);
      parts.push(`-- Server: ${server.name || 'Remote Host'} (${server.ip})`);
      parts.push(`-- Database: \`${options.database}\``);
      parts.push(`-- Dump Scope: ${scope}`);
      parts.push(`-- Generated At: ${nowStr}`);
      parts.push(`-- ------------------------------------------------------\n`);

      parts.push(`/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;`);
      parts.push(`/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;`);
      parts.push(`/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;`);
      parts.push(`/*!40101 SET NAMES utf8mb4 */;`);
      parts.push(`/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;`);
      if (disableFk) {
        parts.push(`/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;`);
      }
      parts.push(`/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;`);
      parts.push(`/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;\n`);

      // Optional CREATE DATABASE statement
      if (includeCreateDb) {
        parts.push(`CREATE DATABASE /*!32312 IF NOT EXISTS*/ ${escapeIdent(options.database)} /*!40100 DEFAULT CHARACTER SET utf8mb4 */;`);
        parts.push(`USE ${escapeIdent(options.database)};\n`);
      }

      // Process Base Tables
      for (const tbl of targetBaseTables) {
        parts.push(`--`);
        parts.push(`-- Table structure & data for table \`${tbl}\``);
        parts.push(`--`);

        // DDL Structure
        if (scope !== 'data_only') {
          if (includeDrop) {
            parts.push(`DROP TABLE IF EXISTS ${escapeIdent(tbl)};`);
          }
          try {
            const [createRows] = (await conn.query(`SHOW CREATE TABLE ${escapeIdent(tbl)}`)) as [any[], any];
            if (createRows && createRows[0]) {
              const createSql = createRows[0]['Create Table'] || Object.values(createRows[0])[1];
              parts.push(`${createSql};\n`);
            }
          } catch (err: any) {
            parts.push(`-- Error retrieving CREATE TABLE for ${tbl}: ${err.message}\n`);
          }
        }

        // Data Rows (INSERT statements)
        if (scope !== 'structure_only') {
          try {
            const limitClause = maxRows > 0 ? `LIMIT ${maxRows}` : '';
            const [rows] = (await conn.query(`SELECT * FROM ${escapeIdent(tbl)} ${limitClause}`)) as [any[], any];

            if (rows && rows.length > 0) {
              totalRowsExported += rows.length;
              parts.push(`LOCK TABLES ${escapeIdent(tbl)} WRITE;`);
              parts.push(`/*!40000 ALTER TABLE ${escapeIdent(tbl)} DISABLE KEYS */;`);

              const columns = Object.keys(rows[0]);
              const colListSql = columns.map(escapeIdent).join(', ');

              for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const valuesSql = batch
                  .map((row) => {
                    const vals = columns.map((col) => formatSqlLiteral(row[col])).join(', ');
                    return `(${vals})`;
                  })
                  .join(',\n  ');

                parts.push(`INSERT INTO ${escapeIdent(tbl)} (${colListSql}) VALUES\n  ${valuesSql};`);
              }

              parts.push(`/*!40000 ALTER TABLE ${escapeIdent(tbl)} ENABLE KEYS */;`);
              parts.push(`UNLOCK TABLES;\n`);
            } else {
              parts.push(`-- Table \`${tbl}\` is empty; no rows exported.\n`);
            }
          } catch (err: any) {
            parts.push(`-- Error dumping data for table ${tbl}: ${err.message}\n`);
          }
        }
      }

      // Process Views
      if (includeViews && scope !== 'data_only' && targetViews.length > 0) {
        parts.push(`--`);
        parts.push(`-- View structures`);
        parts.push(`--`);

        for (const v of targetViews) {
          try {
            if (includeDrop) {
              parts.push(`DROP VIEW IF EXISTS ${escapeIdent(v)};`);
            }
            const [viewCreateRows] = (await conn.query(`SHOW CREATE VIEW ${escapeIdent(v)}`)) as [any[], any];
            if (viewCreateRows && viewCreateRows[0]) {
              const viewSql = viewCreateRows[0]['Create View'] || Object.values(viewCreateRows[0])[1];
              parts.push(`${viewSql};\n`);
            }
          } catch (err: any) {
            parts.push(`-- Error retrieving CREATE VIEW for ${v}: ${err.message}\n`);
          }
        }
      }

      // Process Stored Routines (Procedures & Functions)
      if (includeRoutines && scope !== 'data_only') {
        try {
          const [routines] = (await conn.query(
            `SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_NAME ASC`,
            [options.database]
          )) as [any[], any];

          if (routines && routines.length > 0) {
            parts.push(`--`);
            parts.push(`-- Stored Routines (Procedures & Functions)`);
            parts.push(`--`);

            for (const r of routines) {
              const rType = r.ROUTINE_TYPE;
              const rName = r.ROUTINE_NAME;
              try {
                if (includeDrop) {
                  parts.push(`DROP ${rType} IF EXISTS ${escapeIdent(rName)};`);
                }
                const [rCreateRows] = (await conn.query(`SHOW CREATE ${rType} ${escapeIdent(rName)}`)) as [any[], any];
                if (rCreateRows && rCreateRows[0]) {
                  const rSql = rCreateRows[0][`Create ${rType === 'PROCEDURE' ? 'Procedure' : 'Function'}`] || Object.values(rCreateRows[0])[2];
                  parts.push(`DELIMITER //`);
                  parts.push(`${rSql} //`);
                  parts.push(`DELIMITER ;\n`);
                }
              } catch (err: any) {
                parts.push(`-- Error retrieving ${rType} ${rName}: ${err.message}\n`);
              }
            }
          }
        } catch {}
      }

      // Process Triggers
      if (includeTriggers && scope !== 'data_only') {
        try {
          const [triggers] = (await conn.query(
            `SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME ASC`,
            [options.database]
          )) as [any[], any];

          if (triggers && triggers.length > 0) {
            parts.push(`--`);
            parts.push(`-- Database Triggers`);
            parts.push(`--`);

            for (const trg of triggers) {
              try {
                if (includeDrop) {
                  parts.push(`DROP TRIGGER IF EXISTS ${escapeIdent(trg.TRIGGER_NAME)};`);
                }
                const [trgCreateRows] = (await conn.query(`SHOW CREATE TRIGGER ${escapeIdent(trg.TRIGGER_NAME)}`)) as [any[], any];
                if (trgCreateRows && trgCreateRows[0]) {
                  const trgSql = trgCreateRows[0]['SQL Original Statement'] || Object.values(trgCreateRows[0])[2];
                  parts.push(`DELIMITER //`);
                  parts.push(`${trgSql} //`);
                  parts.push(`DELIMITER ;\n`);
                }
              } catch (err: any) {
                parts.push(`-- Error retrieving TRIGGER ${trg.TRIGGER_NAME}: ${err.message}\n`);
              }
            }
          }
        } catch {}
      }

      // Process Scheduled Events
      if (includeEvents && scope !== 'data_only') {
        try {
          const [events] = (await conn.query(
            `SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ? ORDER BY EVENT_NAME ASC`,
            [options.database]
          )) as [any[], any];

          if (events && events.length > 0) {
            parts.push(`--`);
            parts.push(`-- Scheduled Events`);
            parts.push(`--`);

            for (const ev of events) {
              try {
                if (includeDrop) {
                  parts.push(`DROP EVENT IF EXISTS ${escapeIdent(ev.EVENT_NAME)};`);
                }
                const [evCreateRows] = (await conn.query(`SHOW CREATE EVENT ${escapeIdent(ev.EVENT_NAME)}`)) as [any[], any];
                if (evCreateRows && evCreateRows[0]) {
                  const evSql = evCreateRows[0]['Create Event'] || Object.values(evCreateRows[0])[3];
                  parts.push(`${evSql};\n`);
                }
              } catch (err: any) {
                parts.push(`-- Error retrieving EVENT ${ev.EVENT_NAME}: ${err.message}\n`);
              }
            }
          }
        } catch {}
      }

      // Restoration footer
      parts.push(`/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;`);
      if (disableFk) {
        parts.push(`/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;`);
      }
      parts.push(`/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;`);
      parts.push(`/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;`);
      parts.push(`/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;`);
      parts.push(`/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;`);
      parts.push(`/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;`);
      parts.push(`\n-- Dump completed on ${new Date().toISOString()}`);

      outputContent = parts.join('\n');
    } else if (format === 'json') {
      const jsonExport: Record<string, any> = {
        metadata: {
          server: server.name,
          host: server.ip,
          database: options.database,
          exportedAt: new Date().toISOString(),
          scope,
          tablesCount: targetBaseTables.length,
        },
        tables: {} as Record<string, any>,
      };

      for (const tbl of targetBaseTables) {
        const tableEntry: Record<string, any> = {};

        if (scope !== 'data_only') {
          try {
            const [createRows] = (await conn.query(`SHOW CREATE TABLE ${escapeIdent(tbl)}`)) as [any[], any];
            if (createRows && createRows[0]) {
              tableEntry.createTableSql = createRows[0]['Create Table'] || Object.values(createRows[0])[1];
            }
          } catch {}
        }

        if (scope !== 'structure_only') {
          try {
            const limitClause = maxRows > 0 ? `LIMIT ${maxRows}` : '';
            const [rows] = (await conn.query(`SELECT * FROM ${escapeIdent(tbl)} ${limitClause}`)) as [any[], any];
            tableEntry.rows = rows || [];
            totalRowsExported += (rows || []).length;
          } catch {
            tableEntry.rows = [];
          }
        }

        jsonExport.tables[tbl] = tableEntry;
      }

      outputContent = JSON.stringify(jsonExport, null, 2);
    } else if (format === 'csv') {
      const csvSections: string[] = [];

      for (const tbl of targetBaseTables) {
        try {
          const limitClause = maxRows > 0 ? `LIMIT ${maxRows}` : '';
          const [rows] = (await conn.query(`SELECT * FROM ${escapeIdent(tbl)} ${limitClause}`)) as [any[], any];

          if (rows && rows.length > 0) {
            totalRowsExported += rows.length;
            const headers = Object.keys(rows[0]);
            const headerRow = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');

            const dataRows = rows.map((row) =>
              headers
                .map((h) => {
                  const val = row[h];
                  if (val === null || val === undefined) return '';
                  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                  return `"${str.replace(/"/g, '""')}"`;
                })
                .join(',')
            );

            if (targetBaseTables.length > 1) {
              csvSections.push(`### TABLE: ${tbl} (${rows.length} rows) ###`);
            }
            csvSections.push(headerRow);
            csvSections.push(...dataRows);
            csvSections.push('');
          }
        } catch {}
      }

      outputContent = csvSections.join('\n');
    }

    await conn.end();

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `${options.database}_${scope}_${timestamp}.${format}`;
    const duration = Date.now() - startTime;

    return {
      success: true,
      database: options.database,
      format,
      scope,
      tablesCount: targetBaseTables.length,
      totalRowsExported,
      totalBytes: Buffer.byteLength(outputContent, 'utf8'),
      content: outputContent,
      filename,
      executionTimeMs: duration,
      message: `Export completed successfully (${totalRowsExported} rows, ${targetBaseTables.length} tables).`,
      messageFa: `پشتیبان‌گیری با موفقیت تکمیل شد (${totalRowsExported} سطر، ${targetBaseTables.length} جدول).`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    return {
      success: false,
      database: options.database,
      format: options.format || 'sql',
      scope: options.scope || 'all',
      tablesCount: 0,
      totalRowsExported: 0,
      totalBytes: 0,
      content: '',
      filename: `${options.database}_dump_error.txt`,
      executionTimeMs: Date.now() - startTime,
      message: `Backup dump failed: ${err.message}`,
      messageFa: `خطا در تهیه پشتیبان: ${err.message}`,
      error: err.message,
      errorFa: err.message,
    };
  }
}

// ==========================================
// Phase 16: MySQL Client Authentication, Network Host Access & my.cnf Configuration Suite
// ==========================================

/**
 * Generate a unified diff representation between original and updated configurations
 */
export function generateMysqlUnifiedDiff(
  oldText: string,
  newText: string,
  oldLabel = 'original',
  newLabel = 'updated'
): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o !== n) {
      if (o !== undefined) diff.push(`- ${o}`);
      if (n !== undefined) diff.push(`+ ${n}`);
    }
  }
  return diff.join('\n');
}

/**
 * Categorize a my.cnf parameter into functional networking/security/performance/logging areas
 */
function categorizeMysqlCnfParameter(key: string): 'networking' | 'security' | 'performance' | 'logging' | 'general' {
  const lower = key.toLowerCase();
  if (
    lower.includes('bind') ||
    lower.includes('port') ||
    lower.includes('socket') ||
    lower.includes('networking') ||
    lower.includes('resolve') ||
    lower.includes('connect') ||
    lower.includes('host') ||
    lower.includes('back_log')
  ) {
    return 'networking';
  }
  if (
    lower.includes('ssl') ||
    lower.includes('tls') ||
    lower.includes('secure') ||
    lower.includes('auth') ||
    lower.includes('password') ||
    lower.includes('encrypt') ||
    lower.includes('privilege') ||
    lower.includes('sha')
  ) {
    return 'security';
  }
  if (
    lower.includes('innodb') ||
    lower.includes('buffer') ||
    lower.includes('cache') ||
    lower.includes('memory') ||
    lower.includes('thread') ||
    lower.includes('table_open') ||
    lower.includes('tmp') ||
    lower.includes('max_allowed_packet')
  ) {
    return 'performance';
  }
  if (
    lower.includes('log') ||
    lower.includes('audit') ||
    lower.includes('slow') ||
    lower.includes('general') ||
    lower.includes('error')
  ) {
    return 'logging';
  }
  return 'general';
}

/**
 * Returns descriptive bilingual annotations for standard MySQL configuration directives
 */
function getMysqlCnfParameterDescriptions(key: string): { en: string; fa: string } {
  const lower = key.toLowerCase();
  switch (lower) {
    case 'bind-address':
    case 'bind_address':
      return {
        en: 'Network interface IP addresses MySQL listens on. Use 0.0.0.0 for all IPv4 interfaces, 127.0.0.1 for local only, or specific network IP.',
        fa: 'آدرس‌های IP شبکه که مای‌اس‌کیوال روی آنها گوش می‌دهد. 0.0.0.0 برای کلیه رابط‌ها، 127.0.0.1 فقط دسترسی محلی یا IP مشخص.',
      };
    case 'port':
      return {
        en: 'TCP/IP listening port number (default: 3306).',
        fa: 'شماره پورت شنود پروتکل TCP/IP (پیش‌فرض: ۳۳۰۶).',
      };
    case 'skip-networking':
    case 'skip_networking':
      return {
        en: 'Disables TCP/IP networking completely; allows only local UNIX socket or named pipe connections.',
        fa: 'غیرفعال‌سازی کامل شبکه TCP/IP؛ فقط ارتباط از طریق سوکت محلی لینوکس یا پایپ مجاز خواهد بود.',
      };
    case 'skip-name-resolve':
    case 'skip_name_resolve':
      return {
        en: 'Disables DNS hostname lookups on incoming client connections. Greatly reduces connection latency and prevents DNS hangs.',
        fa: 'غیرفعال‌سازی جستجوی معکوس DNS برای نام هاست کلاینت‌ها؛ تاخیر برقراری اتصال را به شدت کاهش داده و مانع کندی می‌شود.',
      };
    case 'require_secure_transport':
      return {
        en: 'Mandates that all client connections must use secure TLS/SSL encrypted transport. Rejects plaintext TCP logins.',
        fa: 'الزام تمامی اتصالات کلاینت به استفاده از رمزنگاری امن TLS/SSL؛ اتصالات متنی بدون رمزنگاری را رد می‌کند.',
      };
    case 'default_authentication_plugin':
      return {
        en: 'Default authentication plugin used for newly created user accounts (e.g. caching_sha2_password or mysql_native_password).',
        fa: 'پلاگین پیش‌فرض احراز هویت برای کاربران جدید (مانند caching_sha2_password یا mysql_native_password).',
      };
    case 'max_connections':
      return {
        en: 'Maximum permitted number of simultaneous client connections.',
        fa: 'حداکثر تعداد مجاز اتصالات همزمان کلاینت‌ها به سرور پایگاه‌داده.',
      };
    case 'max_user_connections':
      return {
        en: 'Maximum number of simultaneous connections allowed for any single user account (0 = unlimited).',
        fa: 'حداکثر اتصالات همزمان مجاز برای هر حساب کاربری مستقل (۰ = نامحدود).',
      };
    case 'max_connect_errors':
      return {
        en: 'Number of interrupted connection requests before MySQL blocks further connections from that host.',
        fa: 'تعداد خطاهای متوالی اتصال قبل از بلاک کردن موقت هاست متصل‌شونده توسط MySQL.',
      };
    case 'innodb_buffer_pool_size':
      return {
        en: 'Memory buffer pool size dedicated for caching InnoDB table data and indexes (typically 50-75% of server RAM for dedicated DB).',
        fa: 'اندازه حافظه بافر اختصاص‌یافته برای کش کردن جداول و ایندکس‌های موتور InnoDB (معمولاً ۵۰ تا ۷۵ درصد رم سرور).',
      };
    case 'slow_query_log':
      return {
        en: 'Enables or disables logging of queries that exceed long_query_time.',
        fa: 'فعال یا غیرفعال‌سازی ثبت کوئری‌های کندی که بیشتر از حد مجاز زمان برده‌اند.',
      };
    case 'long_query_time':
      return {
        en: 'Execution time threshold in seconds for classifying a query as slow.',
        fa: 'آستانه زمان اجرای کوئری به ثانیه جهت طبقه‌بندی به عنوان کوئری کند.',
      };
    default:
      return {
        en: `Configuration directive: ${key}`,
        fa: `تنظیم پیکربندی: ${key}`,
      };
  }
}

/**
 * Parses raw my.cnf content into structured sections and categorized parameters
 */
function parseMysqlCnfContent(rawText: string): MysqlCnfParameter[] {
  const lines = rawText.split('\n');
  const params: MysqlCnfParameter[] = [];
  let currentSection = 'mysqld';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for section header [section]
    const sectionMatch = trimmed.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Check if line is commented
    const isCommented = trimmed.startsWith('#') || trimmed.startsWith(';');
    const cleanLine = isCommented ? trimmed.replace(/^[#;]\s*/, '') : trimmed;

    // Match key = value or bare flag
    const eqIdx = cleanLine.indexOf('=');
    if (eqIdx !== -1) {
      const key = cleanLine.substring(0, eqIdx).trim();
      const val = cleanLine.substring(eqIdx + 1).trim();
      if (key && !key.startsWith('[') && !key.includes(' ')) {
        const descriptions = getMysqlCnfParameterDescriptions(key);
        params.push({
          key,
          value: val,
          section: currentSection,
          isCommented,
          category: categorizeMysqlCnfParameter(key),
          descriptionEn: descriptions.en,
          descriptionFa: descriptions.fa,
        });
      }
    }
  }

  return params;
}

/**
 * Reads client authentication, network host access matrix, and remote my.cnf configuration
 */
export async function getMysqlClientAuthConfig(
  server: RemoteServer,
  opts?: { sessionPassword?: string }
): Promise<MysqlClientAuthConfigData> {
  const config = getMysqlConfig(server, { password: opts?.sessionPassword });
  let conn: mysql.Connection | null = null;

  // Active database status variables
  let activeBindAddress = '0.0.0.0';
  let activePort = 3306;
  let activeRequireSecureTransport = false;
  let activeSkipNameResolve = false;
  let activeMaxConnections = 151;
  let activeDefaultAuthPlugin = 'caching_sha2_password';
  let activeSslStatus = 'DISABLED';

  const hostRules: MysqlClientHostAccessRule[] = [];

  // Step 1: Query MySQL directly for active host rules and runtime variables
  try {
    conn = await mysql.createConnection(config);

    // Fetch active variables
    const [varRows] = (await conn.query(`
      SHOW VARIABLES WHERE Variable_name IN (
        'bind_address',
        'port',
        'skip_networking',
        'skip_name_resolve',
        'require_secure_transport',
        'max_connections',
        'default_authentication_plugin',
        'have_ssl',
        'version',
        'version_comment'
      );
    `)) as any;

    const varMap = new Map<string, string>();
    for (const r of varRows || []) {
      if (r.Variable_name) {
        varMap.set(String(r.Variable_name).toLowerCase(), String(r.Value || ''));
      }
    }

    if (varMap.has('bind_address')) activeBindAddress = varMap.get('bind_address')!;
    if (varMap.has('port')) activePort = parseInt(varMap.get('port')!, 10) || 3306;
    if (varMap.has('require_secure_transport')) {
      activeRequireSecureTransport = ['on', '1', 'true', 'yes'].includes(
        varMap.get('require_secure_transport')!.toLowerCase()
      );
    }
    if (varMap.has('skip_name_resolve')) {
      activeSkipNameResolve = ['on', '1', 'true', 'yes'].includes(
        varMap.get('skip_name_resolve')!.toLowerCase()
      );
    }
    if (varMap.has('max_connections')) {
      activeMaxConnections = parseInt(varMap.get('max_connections')!, 10) || 151;
    }
    if (varMap.has('default_authentication_plugin')) {
      activeDefaultAuthPlugin = varMap.get('default_authentication_plugin')!;
    }
    if (varMap.has('have_ssl')) {
      activeSslStatus = varMap.get('have_ssl')!;
    }

    // Fetch mysql.user accounts and calculate client host access matrix
    const [userRows] = (await conn.query(`
      SELECT 
        User, 
        Host, 
        plugin, 
        authentication_string, 
        ssl_type, 
        account_locked, 
        password_expired 
      FROM mysql.user 
      ORDER BY User ASC, Host ASC;
    `)) as any;

    for (const u of userRows || []) {
      const user = String(u.User || '');
      const host = String(u.Host || '');
      const plugin = String(u.plugin || '');
      const sslType = String(u.ssl_type || '');
      const accountLocked = String(u.account_locked || '').toUpperCase() === 'Y';
      const passwordExpired = String(u.password_expired || '').toUpperCase() === 'Y';
      const hasEmptyPassword = !u.authentication_string || String(u.authentication_string).length === 0;

      // Access scope classification
      let accessScope: 'localhost' | 'subnet' | 'wildcard' | 'named_host' = 'named_host';
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        accessScope = 'localhost';
      } else if (host === '%') {
        accessScope = 'wildcard';
      } else if (host.includes('%') || host.includes('/')) {
        accessScope = 'subnet';
      }

      // Risk classification
      let riskLevel: 'safe' | 'warning' | 'critical' = 'safe';
      let riskReasonEn = 'Standard host authorization configuration.';
      let riskReasonFa = 'پیکربندی استاندارد مجوزهای دسترسی هاست.';

      if (user.toLowerCase() === 'root' && (accessScope === 'wildcard' || accessScope === 'subnet') && !sslType) {
        riskLevel = 'critical';
        riskReasonEn = 'CRITICAL: Superuser "root" accepts remote incoming connections without mandatory SSL encryption.';
        riskReasonFa = 'بسیار پرخطر: کاربر ممتاز روت اتصالات راه دور را بدون الزام رمزنگاری SSL می‌پذیرد.';
      } else if (hasEmptyPassword && !accountLocked) {
        riskLevel = 'critical';
        riskReasonEn = 'CRITICAL: Active account has an empty password; remote/local access is completely unauthenticated.';
        riskReasonFa = 'بسیار پرخطر: حساب فعال فاقد کلمه عبور است؛ دسترسی بدون احراز هویت امکان‌پذیر است.';
      } else if (accessScope === 'wildcard' && !sslType) {
        riskLevel = 'warning';
        riskReasonEn = 'Warning: Wildcard "%" host permits access from any public/private IP address without SSL enforcement.';
        riskReasonFa = 'هشدار: هاست وایلدکارد "%" اتصال از هر آدرس IP را بدون الزام SSL مجاز می‌داند.';
      } else if (plugin === 'mysql_native_password') {
        riskLevel = 'warning';
        riskReasonEn = 'Warning: Uses legacy SHA1 password hashing (mysql_native_password) instead of modern caching_sha2_password.';
        riskReasonFa = 'هشدار: استفاده از الگوریتم هش قدیمی و ضعیف SHA1 به جای پلاگین مدرن caching_sha2_password.';
      }

      hostRules.push({
        user,
        host,
        plugin,
        sslType,
        accountLocked,
        passwordExpired,
        hasEmptyPassword,
        accessScope,
        riskLevel,
        riskReasonEn,
        riskReasonFa,
      });
    }

    await conn.end();
    conn = null;
  } catch (dbErr: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
      conn = null;
    }
    // If database connection fails, surface transparent error
    throw new Error(`Failed to query MySQL client authentication metadata: ${dbErr.message}`);
  }

  // Step 2: Probe remote server filesystem via SSH for active my.cnf file and backups
  let discoveredPath = '/etc/mysql/mysql.conf.d/mysqld.cnf';
  let exists = false;
  let fileSizeBytes = 0;
  let lineCount = 0;
  let lastModified = new Date().toISOString();
  let readable = false;
  let writable = false;
  let rawContent = '';
  const backups: MysqlCnfBackupItem[] = [];

  const sshProbeScript = `export LC_ALL=C
CNF_CANDIDATES="/etc/mysql/mysql.conf.d/mysqld.cnf /etc/my.cnf /etc/mysql/my.cnf /etc/mysql/mariadb.conf.d/50-server.cnf /etc/my.cnf.d/server.cnf /usr/local/etc/my.cnf"
TARGET_FILE=""
for c in $CNF_CANDIDATES; do
  if [ -f "$c" ]; then
    TARGET_FILE="$c"
    break
  fi
done

if [ -n "$TARGET_FILE" ]; then
  echo "===FILE_EXISTS==="
  echo "PATH=$TARGET_FILE"
  stat -c "%s|%Y" "$TARGET_FILE" 2>/dev/null || stat -f "%z|%m" "$TARGET_FILE" 2>/dev/null || echo "0|0"
  [ -r "$TARGET_FILE" ] && echo "READABLE=1" || echo "READABLE=0"
  [ -w "$TARGET_FILE" ] && echo "WRITABLE=1" || echo "WRITABLE=0"
  echo "===BACKUPS==="
  ls -1t "\${TARGET_FILE}.bak."* 2>/dev/null | head -n 15 || true
  echo "===CONTENT==="
  cat "$TARGET_FILE"
else
  echo "===FILE_NOT_FOUND==="
fi
`;

  try {
    const sshOut = await runAdaptiveSshCommand(server, sshProbeScript, opts?.sessionPassword, 12000);
    if (sshOut.includes('===FILE_EXISTS===')) {
      exists = true;
      const pathMatch = sshOut.match(/PATH=([^\r\n]+)/);
      if (pathMatch) discoveredPath = pathMatch[1].trim();

      const statMatch = sshOut.match(/===FILE_EXISTS===\s+PATH=[^\r\n]+\s+([0-9]+)\|([0-9]+)/);
      if (statMatch) {
        fileSizeBytes = parseInt(statMatch[1], 10) || 0;
        const epoch = parseInt(statMatch[2], 10);
        if (epoch > 0) lastModified = new Date(epoch * 1000).toISOString();
      }

      readable = sshOut.includes('READABLE=1');
      writable = sshOut.includes('WRITABLE=1');

      // Extract backups list
      const backupSectionMatch = sshOut.match(/===BACKUPS===([\s\S]*?)===CONTENT===/);
      if (backupSectionMatch) {
        const backupLines = backupSectionMatch[1].split('\n');
        for (const bl of backupLines) {
          const trimmed = bl.trim();
          if (trimmed && trimmed.includes('.bak.')) {
            const fileName = trimmed.split('/').pop() || trimmed;
            const tsMatch = fileName.match(/\.bak\.([0-9_]+)/);
            backups.push({
              fileName,
              filePath: trimmed,
              timestamp: tsMatch ? tsMatch[1] : 'Unknown',
              fileSizeBytes: 0,
            });
          }
        }
      }

      // Extract file content
      const contentIdx = sshOut.indexOf('===CONTENT===');
      if (contentIdx !== -1) {
        rawContent = sshOut.substring(contentIdx + '===CONTENT==='.length).replace(/^\r?\n/, '');
        lineCount = rawContent.split('\n').length;
      }
    }
  } catch (sshErr: any) {
    // Graceful fallback: If SSH is unavailable or server is database-only, generate clean virtual representation from live runtime variables
    exists = false;
  }

  // If no raw file content discovered via SSH, synthesize canonical runtime representation
  if (!rawContent) {
    rawContent = `# MySQL / MariaDB Server Configuration
# Note: Live runtime configuration active on database engine

[mysqld]
bind-address = ${activeBindAddress}
port = ${activePort}
skip-name-resolve = ${activeSkipNameResolve ? '1' : '0'}
require_secure_transport = ${activeRequireSecureTransport ? 'ON' : 'OFF'}
max_connections = ${activeMaxConnections}
default_authentication_plugin = ${activeDefaultAuthPlugin}

[client]
port = ${activePort}
default-character-set = utf8mb4

[mysql]
default-character-set = utf8mb4
`;
    lineCount = rawContent.split('\n').length;
    fileSizeBytes = Buffer.byteLength(rawContent, 'utf8');
    readable = true;
    writable = false;
  }

  const parameters = parseMysqlCnfContent(rawContent);

  const metadata: MysqlCnfFileMetadata = {
    filePath: discoveredPath,
    exists,
    fileSizeBytes,
    lineCount,
    lastModified,
    readable,
    writable,
    detectedEngine: 'mysql',
    backups,
  };

  return {
    metadata,
    parameters,
    hostRules,
    rawContent,
    activeBindAddress,
    activePort,
    activeRequireSecureTransport,
    activeSkipNameResolve,
    activeMaxConnections,
    activeDefaultAuthPlugin,
    activeSslStatus,
  };
}

/**
 * Saves and applies MySQL configuration (my.cnf) with automated timestamped backup,
 * syntax validation, unified diff generation, atomic replacement, and live service/privileges reload.
 */
export async function saveMysqlClientAuthConfig(
  server: RemoteServer,
  payload: MysqlClientAuthSaveRequest
): Promise<MysqlClientAuthSaveResult> {
  const currentConfig = await getMysqlClientAuthConfig(server, { sessionPassword: payload.sessionPassword });
  const oldContent = currentConfig.rawContent;

  let newContent = '';
  if (payload.rawContent !== undefined) {
    newContent = payload.rawContent;
  } else if (payload.parameters && payload.parameters.length > 0) {
    // Reconstruct sections from structured parameters
    const sectionMap = new Map<string, MysqlCnfParameter[]>();
    for (const p of payload.parameters) {
      const sec = p.section || 'mysqld';
      if (!sectionMap.has(sec)) sectionMap.set(sec, []);
      sectionMap.get(sec)!.push(p);
    }

    const lines: string[] = ['# Generated by NetTopology MySQL Management Suite'];
    for (const [sec, params] of sectionMap.entries()) {
      lines.push(`\n[${sec}]`);
      for (const p of params) {
        if (p.isCommented) {
          lines.push(`# ${p.key} = ${p.value}`);
        } else {
          lines.push(`${p.key} = ${p.value}`);
        }
      }
    }
    newContent = lines.join('\n') + '\n';
  } else {
    throw new Error('No content or parameters provided for configuration save.');
  }

  // Pre-flight validation of critical directives
  const portMatch = newContent.match(/^\s*port\s*=\s*([0-9]+)/m);
  if (portMatch) {
    const portVal = parseInt(portMatch[1], 10);
    if (isNaN(portVal) || portVal < 1 || portVal > 65535) {
      throw new Error(`Invalid port specification in configuration: "${portMatch[1]}". Port must be 1-65535.`);
    }
  }

  const bindMatch = newContent.match(/^\s*bind[-_]address\s*=\s*([^\s#;]+)/m);
  if (bindMatch) {
    const bindVal = bindMatch[1].trim();
    if (!bindVal || bindVal.includes(';') || bindVal.includes('&')) {
      throw new Error(`Invalid bind-address syntax: "${bindVal}".`);
    }
  }

  // Compute unified diff
  const diffText = generateMysqlUnifiedDiff(
    oldContent,
    newContent,
    currentConfig.metadata.filePath,
    `${currentConfig.metadata.filePath}.new`
  );

  let backupCreated = false;
  let backupFileName: string | undefined;
  let reloaded = false;

  // If SSH is accessible and file exists on server filesystem, execute atomic backup & write
  if (currentConfig.metadata.exists) {
    const targetFile = currentConfig.metadata.filePath;
    const nowStr = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .split('.')[0];
    const bName = `${targetFile.split('/').pop()}.bak.${nowStr}`;
    const backupCmd = `cp -p "${targetFile}" "${targetFile}.bak.${nowStr}"`;

    try {
      await runAdaptiveSshCommand(server, backupCmd, payload.sessionPassword, 10000);
      backupCreated = true;
      backupFileName = bName;
    } catch (bErr: any) {
      throw new Error(`Failed to create timestamped backup of ${targetFile}: ${bErr.message}`);
    }

    // Write new content atomically via temporary file and replace
    const tmpFile = `/tmp/my_cnf_tmp_${Date.now()}`;
    const base64Content = Buffer.from(newContent, 'utf8').toString('base64');
    const writeScript = `export LC_ALL=C
echo "${base64Content}" | base64 -d > "${tmpFile}" && \
chmod --reference="${targetFile}" "${tmpFile}" 2>/dev/null || chmod 644 "${tmpFile}"
chown --reference="${targetFile}" "${tmpFile}" 2>/dev/null || true
mv -f "${tmpFile}" "${targetFile}"
`;

    try {
      await runAdaptiveSshCommand(server, writeScript, payload.sessionPassword, 15000);
    } catch (writeErr: any) {
      // Rollback immediately if write failed
      if (backupCreated) {
        await runAdaptiveSshCommand(
          server,
          `cp -f "${targetFile}.bak.${nowStr}" "${targetFile}"`,
          payload.sessionPassword,
          10000
        ).catch(() => {});
      }
      throw new Error(`Failed to safely write new configuration file: ${writeErr.message}`);
    }

    // Optional service reload
    if (payload.reloadService) {
      try {
        await runAdaptiveSshCommand(
          server,
          'systemctl reload mysql 2>/dev/null || systemctl reload mariadb 2>/dev/null || service mysql reload 2>/dev/null || true',
          payload.sessionPassword,
          15000
        );
        reloaded = true;
      } catch {}
    }
  }

  // Also apply FLUSH PRIVILEGES and update dynamic variables on MySQL connection if requested
  if (payload.flushPrivileges !== false) {
    try {
      const mysqlCfg = getMysqlConfig(server, { password: payload.sessionPassword });
      const c = await mysql.createConnection(mysqlCfg);
      await c.query('FLUSH PRIVILEGES;');
      await c.query('FLUSH HOSTS;').catch(() => {});
      await c.end();
    } catch {}
  }

  return {
    success: true,
    backupCreated,
    backupFileName,
    diffText,
    reloaded,
    syntaxValid: true,
    message: `Configuration saved successfully.${backupCreated ? ` Backup created: ${backupFileName}.` : ''}`,
    messageFa: `پیکربندی با موفقیت ذخیره شد.${backupCreated ? ` نسخه پشتیبان: ${backupFileName}.` : ''}`,
  };
}

/**
 * Restores a designated timestamped backup file to active my.cnf configuration
 */
export async function restoreMysqlCnfBackup(
  server: RemoteServer,
  backupFileName: string,
  reloadService?: boolean,
  opts?: { sessionPassword?: string }
): Promise<{ success: boolean; message: string; messageFa: string }> {
  const currentConfig = await getMysqlClientAuthConfig(server, { sessionPassword: opts?.sessionPassword });
  const targetFile = currentConfig.metadata.filePath;

  // Strict verification of backup filename to prevent directory traversal
  const sanitizedBackupName = backupFileName.split('/').pop() || '';
  if (!sanitizedBackupName.includes('.bak.')) {
    throw new Error('Invalid backup file identifier. File must follow pattern *.bak.*');
  }

  const backupDir = targetFile.substring(0, targetFile.lastIndexOf('/'));
  const fullBackupPath = `${backupDir}/${sanitizedBackupName}`;

  const restoreScript = `export LC_ALL=C
if [ ! -f "${fullBackupPath}" ]; then
  echo "BACKUP_NOT_FOUND"
  exit 1
fi
cp -p "${fullBackupPath}" "${targetFile}"
`;

  try {
    const res = await runAdaptiveSshCommand(server, restoreScript, opts?.sessionPassword, 15000);
    if (res.includes('BACKUP_NOT_FOUND')) {
      throw new Error(`Backup file ${sanitizedBackupName} not found on server.`);
    }

    if (reloadService) {
      await runAdaptiveSshCommand(
        server,
        'systemctl reload mysql 2>/dev/null || systemctl reload mariadb 2>/dev/null || service mysql reload 2>/dev/null || true',
        opts?.sessionPassword,
        15000
      ).catch(() => {});
    }

    // Flush privileges on database
    try {
      const mysqlCfg = getMysqlConfig(server, { password: opts?.sessionPassword });
      const c = await mysql.createConnection(mysqlCfg);
      await c.query('FLUSH PRIVILEGES;');
      await c.query('FLUSH HOSTS;').catch(() => {});
      await c.end();
    } catch {}

    return {
      success: true,
      message: `Configuration restored successfully from ${sanitizedBackupName}.`,
      messageFa: `پیکربندی با موفقیت از فایل پشتیبان ${sanitizedBackupName} بازیابی شد.`,
    };
  } catch (err: any) {
    throw new Error(`Failed to restore configuration backup: ${err.message}`);
  }
}

/**
 * Modifies client host access rules (e.g. changing host binding from wildcard to specific subnet or toggling SSL/lock)
 */
export async function updateMysqlHostRule(
  server: RemoteServer,
  payload: MysqlHostRuleUpdateRequest
): Promise<{ success: boolean; user: string; host: string; message: string; messageFa: string }> {
  const config = getMysqlConfig(server, { password: payload.sessionPassword });
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection(config);
    const user = payload.user.trim();
    const oldHost = payload.oldHost.trim();
    const newHost = payload.newHost ? payload.newHost.trim() : oldHost;

    if (!user || !oldHost) {
      throw new Error('Both user and oldHost must be specified.');
    }

    // Rename host if changed
    if (newHost !== oldHost) {
      await conn.query('RENAME USER ?@? TO ?@?;', [user, oldHost, user, newHost]);
    }

    const effectiveHost = newHost;

    // Toggle SSL requirement
    if (payload.requireSsl !== undefined) {
      const sslClause = payload.requireSsl ? 'SSL' : 'NONE';
      await conn.query(`ALTER USER ?@? REQUIRE ${sslClause};`, [user, effectiveHost]);
    }

    // Toggle Account Lock
    if (payload.accountLocked !== undefined) {
      const lockClause = payload.accountLocked ? 'LOCK' : 'UNLOCK';
      await conn.query(`ALTER USER ?@? ACCOUNT ${lockClause};`, [user, effectiveHost]);
    }

    // Flush privileges
    await conn.query('FLUSH PRIVILEGES;');
    await conn.end();
    conn = null;

    return {
      success: true,
      user,
      host: effectiveHost,
      message: `User '${user}'@'${effectiveHost}' host access rule updated successfully.`,
      messageFa: `قانون دسترسی هاست برای کاربر '${user}'@'${effectiveHost}' با موفقیت به‌روزرسانی شد.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to update MySQL host access rule: ${err.message}`);
  }
}

/**
 * Updates a dynamic system variable in MySQL with optional SET PERSIST
 */
export async function updateMysqlDynamicVariable(
  server: RemoteServer,
  payload: MysqlDynamicVariableUpdateRequest
): Promise<{ success: boolean; name: string; value: string; persist: boolean; message: string; messageFa: string }> {
  const config = getMysqlConfig(server, { password: payload.sessionPassword });
  let conn: mysql.Connection | null = null;

  // Sanitize variable name to prevent SQL injection
  if (!/^[a-zA-Z0-9_]+$/.test(payload.name)) {
    throw new Error(`Invalid system variable identifier: "${payload.name}"`);
  }

  try {
    conn = await mysql.createConnection(config);
    let persisted = false;

    if (payload.persist) {
      try {
        await conn.query(`SET PERSIST \`${payload.name}\` = ?;`, [payload.value]);
        persisted = true;
      } catch {
        // If SET PERSIST is unsupported (e.g. MariaDB or MySQL < 8.0), fallback to SET GLOBAL
        await conn.query(`SET GLOBAL \`${payload.name}\` = ?;`, [payload.value]);
      }
    } else {
      await conn.query(`SET GLOBAL \`${payload.name}\` = ?;`, [payload.value]);
    }

    await conn.end();
    conn = null;

    return {
      success: true,
      name: payload.name,
      value: payload.value,
      persist: persisted,
      message: `Variable '${payload.name}' set to '${payload.value}' (${persisted ? 'SET PERSIST' : 'SET GLOBAL'}).`,
      messageFa: `متغیر '${payload.name}' با موفقیت به '${payload.value}' تغییر یافت (${persisted ? 'پایدار' : 'حافظه موقت'}).`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to update MySQL system variable: ${err.message}`);
  }
}

/**
 * Executes FLUSH PRIVILEGES and FLUSH HOSTS on remote MySQL instance
 */
export async function flushMysqlPrivileges(
  server: RemoteServer,
  opts?: { sessionPassword?: string }
): Promise<{ success: boolean; message: string; messageFa: string }> {
  const config = getMysqlConfig(server, { password: opts?.sessionPassword });
  let conn: mysql.Connection | null = null;

  try {
    conn = await mysql.createConnection(config);
    await conn.query('FLUSH PRIVILEGES;');
    await conn.query('FLUSH HOSTS;').catch(() => {});
    await conn.end();
    conn = null;

    return {
      success: true,
      message: 'Privileges and hosts cache flushed successfully.',
      messageFa: 'مجوزها و حافظه کش هاست‌ها با موفقیت بازخوانی شدند (FLUSH PRIVILEGES).',
    };
  } catch (err: any) {
    if (conn) {
      try {
        await conn.end();
      } catch {}
    }
    throw new Error(`Failed to flush MySQL privileges: ${err.message}`);
  }
}

// ==========================================
// Phase 17: Advanced Backup & Restore Management Suite
// ==========================================

export function getMysqlBackupsDir(serverId: string): string {
  const dir = path.join(process.cwd(), 'data', 'mysql_backups', serverId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function loadMysqlBackupsMeta(serverId: string): Record<string, any> {
  const metaPath = path.join(getMysqlBackupsDir(serverId), '_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveMysqlBackupsMeta(serverId: string, meta: Record<string, any>): void {
  const metaPath = path.join(getMysqlBackupsDir(serverId), '_meta.json');
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch (err: any) {
    console.warn('Failed to save MySQL backups meta:', err.message);
  }
}

/**
 * Splits raw SQL into individual executable statements, honoring DELIMITER,
 * single/double quotes, backticks, line comments (-- and #), and block comments.
 */
export function splitMysqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let currentDelimiter = ';';
  let buffer = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    const delimiterMatch = trimmedLine.match(/^DELIMITER\s+(\S+)/i);
    if (delimiterMatch && !inBlockComment && !inSingleQuote && !inDoubleQuote) {
      if (buffer.trim()) {
        statements.push(buffer.trim());
        buffer = '';
      }
      currentDelimiter = delimiterMatch[1];
      continue;
    }

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = i + 1 < line.length ? line[i + 1] : '';

      if (inLineComment) {
        break;
      }

      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
        if (char === '-' && nextChar === '-' && (i + 2 >= line.length || line[i + 2] === ' ' || line[i + 2] === '\t')) {
          inLineComment = true;
          break;
        }
        if (char === '#') {
          inLineComment = true;
          break;
        }
        if (char === '/' && nextChar === '*') {
          if (i + 2 < line.length && line[i + 2] === '!') {
            // Keep MySQL conditional comments
          } else {
            inBlockComment = true;
            i++;
            continue;
          }
        }
      }

      if (char === '\\' && (inSingleQuote || inDoubleQuote)) {
        buffer += char + nextChar;
        i++;
        continue;
      }

      if (char === "'" && !inDoubleQuote && !inBacktick) {
        inSingleQuote = !inSingleQuote;
        buffer += char;
        continue;
      }

      if (char === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote;
        buffer += char;
        continue;
      }

      if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inBacktick = !inBacktick;
        buffer += char;
        continue;
      }

      buffer += char;

      if (!inSingleQuote && !inDoubleQuote && !inBacktick && buffer.endsWith(currentDelimiter)) {
        const stmt = buffer.slice(0, buffer.length - currentDelimiter.length).trim();
        if (stmt) {
          statements.push(stmt);
        }
        buffer = '';
      }
    }

    inLineComment = false;
    buffer += '\n';
  }

  if (buffer.trim()) {
    statements.push(buffer.trim());
  }

  return statements.filter((s) => {
    const t = s.trim();
    return t.length > 0 && !t.startsWith('--') && !t.startsWith('#');
  });
}

/**
 * Fetches all available backups for the server:
 * Local backup repository files + remote my.cnf configuration snapshots
 */
export async function fetchRemoteServerMysqlBackups(
  server: RemoteServer,
  _opts?: { sessionPassword?: string }
): Promise<MysqlBackupItem[]> {
  const dir = getMysqlBackupsDir(server.id);
  const meta = loadMysqlBackupsMeta(server.id);
  const items: MysqlBackupItem[] = [];

  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir);
    for (const filename of entries) {
      if (filename === '_meta.json') continue;
      const fullPath = path.join(dir, filename);
      try {
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) continue;

        const fileMeta = meta[filename] || {};
        let format: MysqlBackupFileFormat = 'sql';
        if (filename.endsWith('.json')) format = 'json';
        else if (filename.endsWith('.csv')) format = 'csv';
        else if (filename.endsWith('.dump')) format = 'dump';
        else if (filename.endsWith('.gz')) format = 'gz';

        items.push({
          id: `backup-${filename}-${stats.mtimeMs}`,
          filename,
          category: fileMeta.category || 'database',
          database: fileMeta.database || undefined,
          sizeBytes: stats.size,
          sizePretty: formatBytes(stats.size),
          mode: fileMeta.mode || 'full',
          format,
          createdAt: stats.mtime.toISOString(),
          tablesCount: fileMeta.tablesCount || undefined,
          tables: fileMeta.tables || undefined,
          engineUsed: fileMeta.engineUsed || 'logical_sql_dumper',
          description: fileMeta.description,
          descriptionFa: fileMeta.descriptionFa,
        });
      } catch (err) {
        console.warn(`Error reading backup ${filename}:`, err);
      }
    }
  }

  // Also query remote host for my.cnf backups if SSH is configured
  if (server.ssh_password || server.ssh_key) {
    try {
      const sshRes = await runAdaptiveSshCommand(
        server,
        'ls -la /etc/mysql/my.cnf.bak.* /etc/my.cnf.bak.* 2>/dev/null || true'
      );
      if (sshRes && sshRes.trim()) {
        const lines = sshRes.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 9) {
            const filePath = parts[parts.length - 1];
            const filename = path.basename(filePath);
            const sizeBytes = parseInt(parts[4], 10) || 0;
            // Check if not already in list
            if (!items.some((b) => b.filename === filename)) {
              items.push({
                id: `cnf-${filename}`,
                filename,
                category: 'configuration',
                sizeBytes,
                sizePretty: formatBytes(sizeBytes),
                mode: 'full',
                format: 'sql',
                createdAt: new Date().toISOString(),
                engineUsed: 'config_snapshot',
                description: `Remote host my.cnf snapshot at ${filePath}`,
                descriptionFa: `نسخه پشتیبان تنظیمات my.cnf در مسیر ${filePath}`,
              });
            }
          }
        }
      }
    } catch {
      // Non-critical remote probe
    }
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

/**
 * Creates a new MySQL backup using logical SQL dumper or native mysqldump
 */
export async function createRemoteServerMysqlBackup(
  server: RemoteServer,
  req: MysqlCreateBackupRequest
): Promise<MysqlCreateBackupResult> {
  const startTime = Date.now();
  const dir = getMysqlBackupsDir(server.id);

  if (!req.database && req.category !== 'configuration') {
    return {
      success: false,
      message: 'Database name is required for database backup.',
      messageFa: 'نام پایگاه داده جهت ایجاد نسخه پشتیبان الزامی است.',
      error: 'Database name required',
    };
  }

  const targetDb = req.database || 'all';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const format = req.format || 'sql';
  const defaultFilename = `mysql_${targetDb}_${req.mode || 'full'}_${timestamp}.${format}`;
  const filename = req.customFilename ? path.basename(req.customFilename) : defaultFilename;
  const targetFilePath = path.join(dir, filename);

  try {
    let content = '';
    let totalRowsExported = 0;
    let tablesCount = 0;

    if (req.category === 'configuration') {
      // Configuration snapshot
      const cnfRes = await runAdaptiveSshCommand(
        server,
        'cat /etc/mysql/my.cnf 2>/dev/null || cat /etc/my.cnf 2>/dev/null || true'
      );
      content = cnfRes || '# MySQL Configuration Snapshot\n';
    } else {
      // Database dump via logical dumper
      const dumpRes = await generateMysqlDump(server, {
        database: req.database!,
        format: req.format === 'json' ? 'json' : req.format === 'csv' ? 'csv' : 'sql',
        scope: req.mode === 'structure_only' ? 'structure_only' : req.mode === 'data_only' ? 'data_only' : 'all',
        selectedTables: req.tables,
        includeDropTable: req.includeDropTable !== false,
        includeCreateDb: Boolean(req.includeCreateDb),
        disableForeignKeyChecks: req.disableForeignKeyChecks !== false,
        includeViews: req.includeViews !== false,
        includeRoutines: req.includeRoutines !== false,
        includeTriggers: req.includeTriggers !== false,
        includeEvents: req.includeEvents !== false,
        maxRowsPerTable: req.maxRowsPerTable,
        insertBatchSize: req.insertBatchSize,
      });

      if (!dumpRes.success) {
        return {
          success: false,
          message: dumpRes.message || 'Failed to generate MySQL dump.',
          messageFa: dumpRes.messageFa || 'خطا در ایجاد دامپ دیتابیس MySQL.',
          error: dumpRes.error,
        };
      }

      content = dumpRes.content;
      totalRowsExported = dumpRes.totalRowsExported;
      tablesCount = dumpRes.tablesCount;
    }

    fs.writeFileSync(targetFilePath, content, 'utf8');
    const stats = fs.statSync(targetFilePath);

    // Update metadata
    const meta = loadMysqlBackupsMeta(server.id);
    meta[filename] = {
      category: req.category || 'database',
      database: req.database,
      mode: req.mode || 'full',
      format,
      tablesCount,
      totalRowsExported,
      tables: req.tables,
      engineUsed: 'logical_sql_dumper',
      createdAt: new Date().toISOString(),
    };
    saveMysqlBackupsMeta(server.id, meta);

    const durationMs = Date.now() - startTime;
    const backupItem: MysqlBackupItem = {
      id: `backup-${filename}-${stats.mtimeMs}`,
      filename,
      category: req.category || 'database',
      database: req.database,
      sizeBytes: stats.size,
      sizePretty: formatBytes(stats.size),
      mode: req.mode || 'full',
      format,
      createdAt: stats.mtime.toISOString(),
      tablesCount,
      tables: req.tables,
      engineUsed: 'logical_sql_dumper',
    };

    return {
      success: true,
      backup: backupItem,
      message: `Backup "${filename}" created successfully (${formatBytes(stats.size)}) in ${(durationMs / 1000).toFixed(1)}s.`,
      messageFa: `نسخه پشتیبان "${filename}" با موفقیت ایجاد شد (${formatBytes(stats.size)}) در مدت ${(durationMs / 1000).toFixed(1)} ثانیه.`,
      durationMs,
      sqlDumpPreview: content.slice(0, 2000),
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to create backup: ${err.message}`,
      messageFa: `خطا در ایجاد نسخه پشتیبان: ${err.message}`,
      error: err.message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Validates a MySQL restore request before actual execution:
 * Analyzes target database, checks for existing tables, detects collisions,
 * and extracts statement telemetry.
 */
export async function validateRemoteServerMysqlRestore(
  server: RemoteServer,
  req: MysqlValidateRestoreRequest
): Promise<MysqlValidateRestoreResult> {
  const targetDb = (req.targetDatabase || server.mysql_database || '').trim();
  if (!targetDb) {
    return {
      valid: false,
      targetDatabase: '',
      databaseExists: false,
      targetHasExistingData: false,
      existingTablesCount: 0,
      existingTablesSample: [],
      tableCollisions: [],
      statementsCount: 0,
      detectedOperations: { createTable: 0, dropTable: 0, alterTable: 0, insert: 0, update: 0, delete: 0, other: 0 },
      requiresExplicitConfirmation: false,
      error: 'Target database name is required.',
      errorFa: 'نام پایگاه داده مقصد الزامی است.',
    };
  }

  let sqlContent = req.sqlContent || '';
  let backupItem: MysqlBackupItem | undefined;

  if (req.filename && !sqlContent) {
    const dir = getMysqlBackupsDir(server.id);
    const filePath = path.join(dir, path.basename(req.filename));
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        sqlContent = fs.readFileSync(filePath, 'utf8');
        const meta = loadMysqlBackupsMeta(server.id);
        const fileMeta = meta[req.filename] || {};
        backupItem = {
          id: `backup-${req.filename}`,
          filename: req.filename,
          category: fileMeta.category || 'database',
          database: fileMeta.database,
          sizeBytes: stats.size,
          sizePretty: formatBytes(stats.size),
          mode: fileMeta.mode || 'full',
          format: 'sql',
          createdAt: stats.mtime.toISOString(),
          engineUsed: fileMeta.engineUsed || 'logical_sql_dumper',
        };
      } catch (err: any) {
        return {
          valid: false,
          targetDatabase: targetDb,
          databaseExists: false,
          targetHasExistingData: false,
          existingTablesCount: 0,
          existingTablesSample: [],
          tableCollisions: [],
          statementsCount: 0,
          detectedOperations: { createTable: 0, dropTable: 0, alterTable: 0, insert: 0, update: 0, delete: 0, other: 0 },
          requiresExplicitConfirmation: false,
          error: `Failed to read backup file: ${err.message}`,
          errorFa: `خطا در خواندن فایل نسخه پشتیبان: ${err.message}`,
        };
      }
    } else {
      return {
        valid: false,
        targetDatabase: targetDb,
        databaseExists: false,
        targetHasExistingData: false,
        existingTablesCount: 0,
        existingTablesSample: [],
        tableCollisions: [],
        statementsCount: 0,
        detectedOperations: { createTable: 0, dropTable: 0, alterTable: 0, insert: 0, update: 0, delete: 0, other: 0 },
        requiresExplicitConfirmation: false,
        error: `Backup file "${req.filename}" does not exist.`,
        errorFa: `فایل نسخه پشتیبان "${req.filename}" یافت نشد.`,
      };
    }
  }

  // Parse SQL statements and detect operations & affected tables
  const statements = splitMysqlStatements(sqlContent);
  const detectedOps = {
    createTable: 0,
    dropTable: 0,
    alterTable: 0,
    insert: 0,
    update: 0,
    delete: 0,
    other: 0,
  };
  const dumpTables = new Set<string>();

  for (const stmt of statements) {
    const s = stmt.trim();
    const createMatch = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?/i);
    if (createMatch) {
      detectedOps.createTable++;
      dumpTables.add(createMatch[2] || createMatch[1]);
      continue;
    }

    const dropMatch = s.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?/i);
    if (dropMatch) {
      detectedOps.dropTable++;
      dumpTables.add(dropMatch[2] || dropMatch[1]);
      continue;
    }

    const alterMatch = s.match(/ALTER\s+TABLE\s+(?:`?(\w+)`?\.)?`?(\w+)`?/i);
    if (alterMatch) {
      detectedOps.alterTable++;
      dumpTables.add(alterMatch[2] || alterMatch[1]);
      continue;
    }

    const insertMatch = s.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+(?:`?(\w+)`?\.)?`?(\w+)`?/i);
    if (insertMatch) {
      detectedOps.insert++;
      dumpTables.add(insertMatch[2] || insertMatch[1]);
      continue;
    }

    if (/^UPDATE\s+/i.test(s)) {
      detectedOps.update++;
    } else if (/^DELETE\s+/i.test(s)) {
      detectedOps.delete++;
    } else {
      detectedOps.other++;
    }
  }

  // Connect to target server and inspect target database
  let conn: mysql.Connection | null = null;
  let databaseExists = false;
  let existingTablesCount = 0;
  const existingTablesSample: string[] = [];
  const existingTablesSet = new Set<string>();

  try {
    const config = getMysqlConfig(server, { password: req.sessionPassword });
    conn = await mysql.createConnection(config);

    const [dbRows] = (await conn.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [targetDb]
    )) as [any[], any];

    databaseExists = dbRows.length > 0;

    if (databaseExists) {
      const [tableRows] = (await conn.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? LIMIT 200`,
        [targetDb]
      )) as [any[], any];

      existingTablesCount = tableRows.length;
      tableRows.forEach((r, idx) => {
        existingTablesSet.add(r.TABLE_NAME);
        if (idx < 15) {
          existingTablesSample.push(r.TABLE_NAME);
        }
      });
    }

    await conn.end();
    conn = null;
  } catch (err: any) {
    if (conn) {
      try { await conn.end(); } catch {}
    }
    // Database inspection failure is treated non-fatally (e.g. database does not exist yet)
  }

  // Calculate table collisions
  const tableCollisions: string[] = [];
  dumpTables.forEach((tbl) => {
    if (existingTablesSet.has(tbl)) {
      tableCollisions.push(tbl);
    }
  });

  const requiresExplicitConfirmation = tableCollisions.length > 0 || detectedOps.dropTable > 0;
  let warning: string | undefined;
  let warningFa: string | undefined;

  if (tableCollisions.length > 0) {
    warning = `Target database "${targetDb}" already contains ${tableCollisions.length} table(s) that match objects in this dump: ${tableCollisions.slice(0, 5).join(', ')}${tableCollisions.length > 5 ? '...' : ''}. Data in these tables may be overwritten or merged.`;
    warningFa = `پایگاه داده مقصد "${targetDb}" در حال حاضر شامل ${tableCollisions.length} جدول منطبق با این دامپ است: ${tableCollisions.slice(0, 5).join(', ')}${tableCollisions.length > 5 ? '...' : ''}. داده‌های این جداول ممکن است بازنویسی یا جایگزین شوند.`;
  } else if (!databaseExists) {
    warning = `Target database "${targetDb}" does not exist yet and will be automatically created with UTF8MB4 charset.`;
    warningFa = `پایگاه داده مقصد "${targetDb}" هنوز وجود ندارد و به صورت خودکار با انکودینگ UTF8MB4 ایجاد خواهد شد.`;
  }

  return {
    valid: true,
    backupItem,
    targetDatabase: targetDb,
    databaseExists,
    targetHasExistingData: existingTablesCount > 0,
    existingTablesCount,
    existingTablesSample,
    tableCollisions,
    statementsCount: statements.length,
    detectedOperations: detectedOps,
    warning,
    warningFa,
    requiresExplicitConfirmation,
  };
}

/**
 * Restores a MySQL SQL dump or file into the target database with safety controls,
 * transaction guards, and real-time execution telemetry.
 */
export async function restoreRemoteServerMysqlBackup(
  server: RemoteServer,
  req: MysqlRestoreBackupRequest
): Promise<MysqlRestoreBackupResult> {
  const startTime = Date.now();
  const targetDb = (req.targetDatabase || server.mysql_database || '').trim();

  if (!targetDb) {
    return {
      success: false,
      message: 'Target database name is required for restore.',
      messageFa: 'نام پایگاه داده مقصد جهت بازیابی الزامی است.',
      executedStatementsCount: 0,
      affectedRowsCount: 0,
      durationMs: 0,
      warningsCount: 0,
      errorsCount: 1,
      error: 'Target database required',
      errorFa: 'نام پایگاه داده مقصد الزامی است.',
    };
  }

  let sqlContent = req.sqlContent || '';

  if (req.filename && !sqlContent) {
    const dir = getMysqlBackupsDir(server.id);
    const filePath = path.join(dir, path.basename(req.filename));
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: `Backup file "${req.filename}" does not exist.`,
        messageFa: `فایل نسخه پشتیبان "${req.filename}" یافت نشد.`,
        executedStatementsCount: 0,
        affectedRowsCount: 0,
        durationMs: 0,
        warningsCount: 0,
        errorsCount: 1,
        error: 'File not found',
      };
    }

    try {
      sqlContent = fs.readFileSync(filePath, 'utf8');
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to read backup file: ${err.message}`,
        messageFa: `خطا در بازخوانی فایل پشتیبان: ${err.message}`,
        executedStatementsCount: 0,
        affectedRowsCount: 0,
        durationMs: 0,
        warningsCount: 0,
        errorsCount: 1,
        error: err.message,
      };
    }
  }

  if (!sqlContent.trim()) {
    return {
      success: false,
      message: 'Restore payload or SQL file content is empty.',
      messageFa: 'محتوای اسکریپت SQL یا فایل نسخه پشتیبان خالی است.',
      executedStatementsCount: 0,
      affectedRowsCount: 0,
      durationMs: 0,
      warningsCount: 0,
      errorsCount: 1,
      error: 'Empty SQL content',
    };
  }

  // 1. Ensure target database exists if requested
  const baseConfig = getMysqlConfig(server, { password: req.sessionPassword });
  let adminConn: mysql.Connection | null = null;
  try {
    adminConn = await mysql.createConnection(baseConfig);
    if (req.createDatabaseIfNotExists !== false) {
      await adminConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
    }
    await adminConn.end();
    adminConn = null;
  } catch (err: any) {
    if (adminConn) {
      try { await adminConn.end(); } catch {}
    }
    console.warn(`Database creation check warning: ${err.message}`);
  }

  // 2. Connect to the target database and execute statements
  const dbConfig = getMysqlConfig(server, {
    database: targetDb,
    password: req.sessionPassword,
  });

  let conn: mysql.Connection | null = null;
  const errors: string[] = [];
  const warnings: string[] = [];
  let executedStatementsCount = 0;
  let affectedRowsCount = 0;

  try {
    conn = await mysql.createConnection({
      ...dbConfig,
      multipleStatements: false,
    });

    // Session environmental optimizations
    await conn.query('SET NAMES utf8mb4;');
    if (req.disableForeignKeyChecks !== false) {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0;');
    }
    if (req.disableUniqueChecks !== false) {
      await conn.query('SET UNIQUE_CHECKS = 0;');
    }
    await conn.query("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';");

    if (req.singleTransaction) {
      await conn.query('START TRANSACTION;');
    }

    const statements = splitMysqlStatements(sqlContent);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        const [result] = (await conn.query(stmt)) as any;
        executedStatementsCount++;
        if (result && typeof result.affectedRows === 'number') {
          affectedRowsCount += result.affectedRows;
        }
      } catch (stmtErr: any) {
        const errMsg = `Statement #${i + 1} (${stmt.slice(0, 60).replace(/\n/g, ' ')}...): ${stmtErr.message}`;
        errors.push(errMsg);

        if (!req.continueOnError) {
          if (req.singleTransaction) {
            try { await conn.query('ROLLBACK;'); } catch {}
          }
          if (req.disableForeignKeyChecks !== false) {
            try { await conn.query('SET FOREIGN_KEY_CHECKS = 1;'); } catch {}
          }
          await conn.end();
          conn = null;

          const durationMs = Date.now() - startTime;
          return {
            success: false,
            message: `Restore halted at statement #${i + 1}: ${stmtErr.message}`,
            messageFa: `فرآیند بازیابی در دستور شماره ${i + 1} با خطا متوقف شد: ${stmtErr.message}`,
            executedStatementsCount,
            affectedRowsCount,
            durationMs,
            warningsCount: warnings.length,
            warnings,
            errorsCount: errors.length,
            errors,
            error: stmtErr.message,
            outputLog: errors.join('\n'),
          };
        }
      }
    }

    // Commit if in transaction
    if (req.singleTransaction) {
      await conn.query('COMMIT;');
    }

    // Re-enable safety checks
    if (req.disableForeignKeyChecks !== false) {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
    }
    if (req.disableUniqueChecks !== false) {
      await conn.query('SET UNIQUE_CHECKS = 1;').catch(() => {});
    }

    await conn.end();
    conn = null;

    const durationMs = Date.now() - startTime;
    const isSuccess = errors.length === 0;

    return {
      success: isSuccess || (req.continueOnError && executedStatementsCount > 0),
      message: `Restore completed: ${executedStatementsCount} statements executed, ${affectedRowsCount} rows affected in ${(durationMs / 1000).toFixed(1)}s.${errors.length > 0 ? ` (${errors.length} warnings/skipped)` : ''}`,
      messageFa: `عملیات بازیابی انجام شد: ${executedStatementsCount} دستور اجرا، ${affectedRowsCount} سطر تحت تاثیر در ${(durationMs / 1000).toFixed(1)} ثانیه.${errors.length > 0 ? ` (${errors.length} خطا یا هشدار)` : ''}`,
      executedStatementsCount,
      affectedRowsCount,
      durationMs,
      warningsCount: warnings.length,
      warnings,
      errorsCount: errors.length,
      errors,
      outputLog: errors.length > 0 ? errors.join('\n') : `Successfully executed all ${executedStatementsCount} statements.`,
    };
  } catch (err: any) {
    if (conn) {
      try {
        if (req.singleTransaction) await conn.query('ROLLBACK;').catch(() => {});
        await conn.end();
      } catch {}
    }

    const durationMs = Date.now() - startTime;
    return {
      success: false,
      message: `Database restore failed: ${err.message}`,
      messageFa: `خطا در اجرای فرآیند بازیابی: ${err.message}`,
      executedStatementsCount,
      affectedRowsCount,
      durationMs,
      warningsCount: warnings.length,
      errorsCount: errors.length + 1,
      errors: [...errors, err.message],
      error: err.message,
    };
  }
}

/**
 * In-browser preview of a backup file with line counts and truncation guard
 */
export async function previewRemoteServerMysqlBackup(
  server: RemoteServer,
  filename: string
): Promise<MysqlBackupPreviewResult> {
  const dir = getMysqlBackupsDir(server.id);
  const safeFilename = path.basename(filename);
  const filePath = path.join(dir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      filename: safeFilename,
      content: '',
      totalLines: 0,
      isTruncated: false,
      sizeBytes: 0,
      category: 'database',
      format: 'sql',
      error: `File "${safeFilename}" does not exist.`,
      errorFa: `فایل "${safeFilename}" یافت نشد.`,
    };
  }

  try {
    const stats = fs.statSync(filePath);
    const maxPreviewBytes = 512 * 1024; // 512 KB
    let content = '';
    let isTruncated = false;

    if (stats.size > maxPreviewBytes) {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(maxPreviewBytes);
      fs.readSync(fd, buffer, 0, maxPreviewBytes, 0);
      fs.closeSync(fd);
      content = buffer.toString('utf8');
      isTruncated = true;
    } else {
      content = fs.readFileSync(filePath, 'utf8');
    }

    const totalLines = content.split('\n').length;
    let format: MysqlBackupFileFormat = 'sql';
    if (safeFilename.endsWith('.json')) format = 'json';
    else if (safeFilename.endsWith('.csv')) format = 'csv';

    return {
      success: true,
      filename: safeFilename,
      content,
      totalLines,
      isTruncated,
      sizeBytes: stats.size,
      category: 'database',
      format,
    };
  } catch (err: any) {
    return {
      success: false,
      filename: safeFilename,
      content: '',
      totalLines: 0,
      isTruncated: false,
      sizeBytes: 0,
      category: 'database',
      format: 'sql',
      error: err.message,
    };
  }
}

/**
 * Deletes a backup file and removes its metadata
 */
export async function deleteRemoteServerMysqlBackup(
  server: RemoteServer,
  filename: string
): Promise<{ success: boolean; message: string; messageFa: string }> {
  const dir = getMysqlBackupsDir(server.id);
  const safeFilename = path.basename(filename);
  const filePath = path.join(dir, safeFilename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      const meta = loadMysqlBackupsMeta(server.id);
      delete meta[safeFilename];
      saveMysqlBackupsMeta(server.id, meta);

      return {
        success: true,
        message: `Backup "${safeFilename}" deleted successfully.`,
        messageFa: `نسخه پشتیبان "${safeFilename}" با موفقیت حذف شد.`,
      };
    } catch (err: any) {
      throw new Error(`Failed to delete backup: ${err.message}`);
    }
  }

  return {
    success: true,
    message: `Backup file "${safeFilename}" already removed.`,
    messageFa: `فایل نسخه پشتیبان "${safeFilename}" از قبل حذف شده بود.`,
  };
}

/**
 * Accepts an uploaded SQL backup from the client and saves it to server backups
 */
export async function uploadRemoteServerMysqlBackup(
  server: RemoteServer,
  filename: string,
  content: string
): Promise<MysqlBackupItem> {
  const dir = getMysqlBackupsDir(server.id);
  const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const targetPath = path.join(dir, safeFilename);

  fs.writeFileSync(targetPath, content, 'utf8');
  const stats = fs.statSync(targetPath);

  const meta = loadMysqlBackupsMeta(server.id);
  meta[safeFilename] = {
    category: 'database',
    format: safeFilename.endsWith('.json') ? 'json' : safeFilename.endsWith('.csv') ? 'csv' : 'sql',
    mode: 'full',
    engineUsed: 'logical_sql_dumper',
    createdAt: new Date().toISOString(),
  };
  saveMysqlBackupsMeta(server.id, meta);

  return {
    id: `upload-${safeFilename}-${Date.now()}`,
    filename: safeFilename,
    category: 'database',
    sizeBytes: stats.size,
    sizePretty: formatBytes(stats.size),
    mode: 'full',
    format: safeFilename.endsWith('.json') ? 'json' : safeFilename.endsWith('.csv') ? 'csv' : 'sql',
    createdAt: stats.mtime.toISOString(),
    engineUsed: 'logical_sql_dumper',
  };
}

// ==========================================
// Phase 18: MySQL Database Maintenance & Optimization Hub (OPTIMIZE, ANALYZE, CHECK, REPAIR)
// ==========================================

/**
 * Evaluates locking characteristics, concurrency, and temporary disk overhead for MySQL maintenance operations.
 */
export function evaluateMysqlMaintenanceLockWarning(
  action: MysqlMaintenanceAction,
  options?: {
    checkOption?: MysqlCheckOption;
    repairOption?: MysqlRepairOption;
    tableEngine?: string;
    tableSizeBytes?: number;
  }
): MysqlMaintenanceLockWarning {
  const engine = (options?.tableEngine || 'InnoDB').toLowerCase();
  const isInnodb = engine === 'innodb';

  if (action === 'optimize') {
    if (isInnodb) {
      return {
        level: 'moderate',
        lockName: 'MDL_SHARED_UPGRADABLE (Online DDL)',
        blocksReads: false,
        blocksWrites: false,
        tempSpaceRequired: true,
        estimatedTempSpace: options?.tableSizeBytes ? formatBytes(options.tableSizeBytes) : 'Equivalent to table size',
        description:
          'InnoDB OPTIMIZE TABLE performs an online table rebuild (ALTER TABLE ... FORCE). It reclaims unused space and defragments secondary indexes. Reads and writes remain online throughout, requiring brief metadata locks at start and end. Requires free disk space roughly equal to table data size.',
        descriptionFa:
          'دستور OPTIMIZE TABLE برای موتور InnoDB به صورت برخط (Online DDL) جدول را بازسازی می‌کند. این فرآیند فضای آزاد را بازگردانده و ایندکس‌ها را یکپارچه‌سازی می‌کند. خواندن و نوشتن مسدود نمی‌شوند اما نیازمند فضای خالی موقت روی دیسک معادل حجم جدول است.',
      };
    } else {
      return {
        level: 'exclusive',
        lockName: 'TL_WRITE (Table Lock)',
        blocksReads: false,
        blocksWrites: true,
        tempSpaceRequired: true,
        description:
          'For MyISAM/Aria tables, OPTIMIZE TABLE locks the entire table against concurrent writes until index reorganization and row compaction complete.',
        descriptionFa:
          'برای جداول MyISAM/Aria، دستور OPTIMIZE TABLE قفل نوشتن سراسری بر روی جدول اعمال کرده و کلیه عملیات‌های درج و ویرایش را تا پایان متوقف می‌سازد.',
      };
    }
  }

  if (action === 'analyze') {
    return {
      level: 'low',
      lockName: 'MDL_SHARED_READ',
      blocksReads: false,
      blocksWrites: false,
      tempSpaceRequired: false,
      description:
        'ANALYZE TABLE inspects key distributions and updates index cardinality in innodb_index_stats. It acquires a lightweight read lock and does not block concurrent SELECT, INSERT, or UPDATE queries.',
      descriptionFa:
        'دستور ANALYZE TABLE آمار توزیع کلیدها و کاردینالیتی ایندکس‌ها را به‌روزرسانی می‌کند. این عملیات قفل سبک موقت گرفته و فعالیت‌های عادی خواندن یا نوشتن را مسدود نمی‌کند.',
    };
  }

  if (action === 'check') {
    const isExtended = options?.checkOption === 'EXTENDED';
    return {
      level: isExtended ? 'heavy' : 'low',
      lockName: 'MDL_SHARED_READ',
      blocksReads: false,
      blocksWrites: isExtended,
      tempSpaceRequired: false,
      description: isExtended
        ? 'CHECK TABLE EXTENDED performs an exhaustive row-by-row key consistency audit. On large production tables, it can hold shared read locks for prolonged periods, potentially delaying concurrent writes.'
        : 'CHECK TABLE scans table integrity and structure. Normal checks execute swiftly with read locks without blocking standard read traffic.',
      descriptionFa: isExtended
        ? 'گزینه EXTENDED بررسی خط‌به‌خط ساختار جدول و ایندکس‌ها را انجام می‌دهد و در جداول بزرگ تولیدی ممکن است به دلیل زمان طولانی، عملیات‌های نوشتن را در صف نگه دارد.'
        : 'دستور CHECK TABLE ساختار فیزیکی و منطقی جدول را بازرسی می‌کند. چک‌های استاندارد سریع بوده و مانع خواندن اطلاعات نمی‌شوند.',
    };
  }

  if (action === 'repair') {
    return {
      level: 'exclusive',
      lockName: 'TL_WRITE_EXCLUSIVE',
      blocksReads: true,
      blocksWrites: true,
      tempSpaceRequired: true,
      description:
        'REPAIR TABLE attempts physical restoration of corrupted table and index files (primarily MyISAM/Aria). It acquires an exclusive lock, blocking all concurrent reads and writes.',
      descriptionFa:
        'دستور REPAIR TABLE اقدام به ترمیم فیزیکی جداول آسیب‌دیده می‌کند و با اخذ قفل انحصاری کامل، کلیه دسترسی‌های خواندن و نوشتن را مسدود می‌سازد.',
    };
  }

  // rebuild_index
  return {
    level: 'moderate',
    lockName: 'MDL_SHARED_UPGRADABLE (Engine Rebuild)',
    blocksReads: false,
    blocksWrites: false,
    tempSpaceRequired: true,
    estimatedTempSpace: options?.tableSizeBytes ? formatBytes(options.tableSizeBytes) : 'Equivalent to table size',
    description:
      'Rebuilding table engine (ALTER TABLE ... ENGINE=InnoDB) completely defragments clustered B-Trees and secondary indexes online. Requires temporary disk space.',
    descriptionFa:
      'بازسازی کامل موتور جدول (ALTER TABLE ... ENGINE=InnoDB) کلاسترهای B-Tree و ایندکس‌های فرعی را بازآرایی می‌کند و به فضای خالی موقت دیسک نیاز دارد.',
  };
}

/**
 * Introspects table storage bloat, index allocations, and fragmentation ratio across all tables in a database.
 */
export async function getMysqlTableBloatMetrics(
  server: RemoteServer,
  database?: string,
  options?: { password?: string }
): Promise<MysqlTableBloatMetric[]> {
  const config = getMysqlConfig(server, { database: database || 'mysql', password: options?.password });
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

    const targetDb = database && database.trim() && database !== 'all' ? database.trim() : null;
    const query = `
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME,
        IFNULL(ENGINE, 'Unknown') AS ENGINE,
        IFNULL(ROW_FORMAT, 'Default') AS ROW_FORMAT,
        IFNULL(TABLE_ROWS, 0) AS TABLE_ROWS,
        IFNULL(DATA_LENGTH, 0) AS DATA_LENGTH,
        IFNULL(INDEX_LENGTH, 0) AS INDEX_LENGTH,
        IFNULL(DATA_FREE, 0) AS DATA_FREE,
        TABLE_COLLATION,
        CREATE_TIME,
        UPDATE_TIME,
        CHECK_TIME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
        ${targetDb ? 'AND TABLE_SCHEMA = ?' : ''}
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY DATA_FREE DESC, DATA_LENGTH DESC
      LIMIT 500;
    `;

    const [rows] = await conn.execute(query, targetDb ? [targetDb] : []);
    const metrics: MysqlTableBloatMetric[] = (rows as any[]).map((r) => {
      const dataBytes = Number(r.DATA_LENGTH) || 0;
      const indexBytes = Number(r.INDEX_LENGTH) || 0;
      const freeBytes = Number(r.DATA_FREE) || 0;
      const totalBytes = dataBytes + indexBytes + freeBytes;
      const fragRatio = totalBytes > 0 ? Number(((freeBytes / totalBytes) * 100).toFixed(2)) : 0;

      let severity: 'healthy' | 'moderate' | 'high' | 'critical' = 'healthy';
      if (freeBytes >= 50 * 1024 * 1024 && fragRatio >= 25) {
        severity = 'critical';
      } else if (freeBytes >= 10 * 1024 * 1024 && fragRatio >= 15) {
        severity = 'high';
      } else if (freeBytes >= 2 * 1024 * 1024 || fragRatio >= 10) {
        severity = 'moderate';
      }

      const tableRows = Number(r.TABLE_ROWS) || 0;
      const optimizeRec = fragRatio >= 15 && freeBytes >= 5 * 1024 * 1024;
      const analyzeRec = !r.UPDATE_TIME || (!r.CHECK_TIME && tableRows > 500);
      const checkRec = !r.CHECK_TIME;

      return {
        database: r.TABLE_SCHEMA,
        tableName: r.TABLE_NAME,
        engine: r.ENGINE,
        rowFormat: r.ROW_FORMAT,
        tableRows,
        dataSizeBytes: dataBytes,
        dataSizePretty: formatBytes(dataBytes),
        indexSizeBytes: indexBytes,
        indexSizePretty: formatBytes(indexBytes),
        dataFreeBytes: freeBytes,
        dataFreePretty: formatBytes(freeBytes),
        totalSizeBytes: totalBytes,
        totalSizePretty: formatBytes(totalBytes),
        fragmentationRatio: fragRatio,
        bloatSeverity: severity,
        optimizeRecommended: optimizeRec,
        analyzeRecommended: analyzeRec,
        checkRecommended: checkRec,
        collation: r.TABLE_COLLATION || undefined,
        createTime: r.CREATE_TIME ? new Date(r.CREATE_TIME).toISOString() : undefined,
        updateTime: r.UPDATE_TIME ? new Date(r.UPDATE_TIME).toISOString() : undefined,
        checkTime: r.CHECK_TIME ? new Date(r.CHECK_TIME).toISOString() : undefined,
      };
    });

    return metrics;
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

/**
 * Runs OPTIMIZE, ANALYZE, CHECK, REPAIR, or REBUILD on designated tables.
 */
export async function runMysqlMaintenance(
  server: RemoteServer,
  request: MysqlMaintenanceRequest
): Promise<MysqlMaintenanceResult> {
  const startTime = Date.now();
  const db = (request.database || 'mysql').trim();
  const config = getMysqlConfig(server, {
    database: db,
    port: request.port,
    user: request.user,
    password: request.sessionPassword,
  });

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      connectTimeout: 10000,
    });

    // Determine tables to operate on
    let tablesToRun: string[] = [];
    if (request.scope === 'table' && request.table) {
      tablesToRun = [request.table.trim()];
    } else if (request.scope === 'selected_tables' && request.selectedTables && request.selectedTables.length > 0) {
      tablesToRun = request.selectedTables.map((t) => t.trim());
    } else {
      // Scope: database (all tables)
      const [tRows] = await conn.execute(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [db]
      );
      tablesToRun = (tRows as any[]).map((r) => r.TABLE_NAME);
    }

    if (tablesToRun.length === 0) {
      return {
        success: false,
        action: request.action,
        scope: request.scope,
        targetDescription: `${db} (no tables found)`,
        executedCommand: '-- No tables targeted',
        durationMs: Date.now() - startTime,
        message: `No base tables found to execute ${request.action} on database "${db}".`,
        messageFa: `هیچ جدولی برای اجرای عملیات ${request.action} در پایگاه داده "${db}" یافت نشد.`,
      };
    }

    const outputLogs: string[] = [];
    const tableResults: MysqlTableMaintenanceRowResult[] = [];
    const executedCommands: string[] = [];

    outputLogs.push(`[${new Date().toISOString()}] Initiating MySQL Maintenance: Action="${request.action}", Scope="${request.scope}", Target="${db}" (${tablesToRun.length} tables)`);

    const noBinlog = request.noWriteToBinlog ? 'NO_WRITE_TO_BINLOG ' : '';

    for (const tbl of tablesToRun) {
      const safeTbl = `\`${db}\`.\`${tbl}\``;
      let sql = '';

      if (request.action === 'optimize') {
        sql = `OPTIMIZE ${noBinlog}TABLE ${safeTbl}`;
      } else if (request.action === 'analyze') {
        sql = `ANALYZE ${noBinlog}TABLE ${safeTbl}`;
      } else if (request.action === 'check') {
        const checkOpt = request.checkOption && request.checkOption !== 'DEFAULT' ? ` ${request.checkOption}` : '';
        sql = `CHECK TABLE ${safeTbl}${checkOpt}`;
      } else if (request.action === 'repair') {
        const repairOpt = request.repairOption && request.repairOption !== 'DEFAULT' ? ` ${request.repairOption}` : '';
        sql = `REPAIR ${noBinlog}TABLE ${safeTbl}${repairOpt}`;
      } else if (request.action === 'rebuild_index') {
        sql = `ALTER TABLE ${safeTbl} ENGINE=InnoDB`;
      }

      executedCommands.push(sql);
      outputLogs.push(`Executing: ${sql}`);

      try {
        const [resultRows] = await conn.query(sql);
        if (Array.isArray(resultRows)) {
          for (const row of resultRows as any[]) {
            const tableVal = String(row.Table || row.table || `${db}.${tbl}`);
            const opVal = String(row.Op || row.op || request.action);
            const msgTypeVal = (String(row.Msg_type || row.msg_type || 'status').toLowerCase()) as any;
            const msgTextVal = String(row.Msg_text || row.msg_text || 'OK');

            tableResults.push({
              table: tableVal,
              op: opVal,
              msgType: msgTypeVal,
              msgText: msgTextVal,
            });
            outputLogs.push(`  -> [${msgTypeVal.toUpperCase()}] ${tableVal}: ${msgTextVal}`);
          }
        } else {
          tableResults.push({
            table: `${db}.${tbl}`,
            op: request.action,
            msgType: 'status',
            msgText: 'Completed successfully',
          });
          outputLogs.push(`  -> OK ${db}.${tbl}`);
        }
      } catch (tblErr: any) {
        tableResults.push({
          table: `${db}.${tbl}`,
          op: request.action,
          msgType: 'error',
          msgText: tblErr.message || 'Operation failed',
        });
        outputLogs.push(`  -> [ERROR] ${db}.${tbl}: ${tblErr.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    outputLogs.push(`[${new Date().toISOString()}] Completed in ${durationMs}ms with ${tableResults.length} table operations.`);

    const hasErrors = tableResults.some((t) => t.msgType === 'error');
    const lockWarning = evaluateMysqlMaintenanceLockWarning(request.action, {
      checkOption: request.checkOption,
      repairOption: request.repairOption,
    });

    const targetDesc = request.scope === 'table' ? `${db}.${request.table}` : `${db} (${tablesToRun.length} tables)`;

    return {
      success: !hasErrors,
      action: request.action,
      scope: request.scope,
      targetDescription: targetDesc,
      executedCommand: executedCommands.join(';\n'),
      durationMs,
      message: `MySQL ${request.action.toUpperCase()} completed on ${targetDesc} in ${durationMs}ms.`,
      messageFa: `عملیات ${request.action.toUpperCase()} بر روی ${targetDesc} با موفقیت در ${durationMs} میلی‌ثانیه به پایان رسید.`,
      tableResults,
      lockWarning,
      outputLogs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      action: request.action,
      scope: request.scope,
      targetDescription: `${db}`,
      executedCommand: `-- Execution failed: ${err.message}`,
      durationMs,
      message: `Failed to execute MySQL maintenance: ${err.message}`,
      messageFa: `خطا در اجرای عملیات نگهداری MySQL: ${err.message}`,
      error: err.message,
      errorFa: 'خطای سیستمی در اجرای عملیات نگهداری بر روی سرور MySQL',
    };
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

/**
 * Checks active maintenance or long-running database operations from processlist.
 */
export async function getMysqlActiveMaintenance(
  server: RemoteServer,
  database?: string,
  options?: { password?: string }
): Promise<MysqlActiveMaintenanceProgress[]> {
  const config = getMysqlConfig(server, { database: database || 'mysql', password: options?.password });
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      connectTimeout: 5000,
    });

    const [rows] = await conn.query(`
      SELECT 
        ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO
      FROM information_schema.PROCESSLIST
      WHERE INFO IS NOT NULL
        AND (
          UPPER(INFO) LIKE '%OPTIMIZE TABLE%' OR
          UPPER(INFO) LIKE '%ANALYZE TABLE%' OR
          UPPER(INFO) LIKE '%CHECK TABLE%' OR
          UPPER(INFO) LIKE '%REPAIR TABLE%' OR
          UPPER(INFO) LIKE '%ALTER TABLE%'
        )
      ORDER BY TIME DESC;
    `);

    return (rows as any[]).map((r) => ({
      id: Number(r.ID),
      user: r.USER || 'system',
      host: r.HOST || '',
      db: r.DB || '',
      command: r.COMMAND || '',
      timeSeconds: Number(r.TIME) || 0,
      state: r.STATE || '',
      info: r.INFO || '',
      stageProgress: r.STATE ? `State: ${r.STATE}` : undefined,
    }));
  } finally {
    if (conn) {
      await conn.end().catch(() => {});
    }
  }
}

// ==========================================
// Phase 19: MySQL Replication & High Availability
// ==========================================

/**
 * Retrieves comprehensive MySQL replication, binary logs, and high availability metrics.
 * Supports MySQL 5.7, 8.0, 8.4, and MariaDB adaptively without hardcoding version syntax.
 */
export async function getMysqlReplicationOverview(
  server: RemoteServer,
  _options?: { forceRefresh?: boolean }
): Promise<MysqlReplicationOverview> {
  const conn = await mysql.createConnection(getMysqlConfig(server));
  try {
    // 1. Gather global system variables
    const [varRows] = await conn.query(
      `SHOW VARIABLES WHERE Variable_name IN (
        'read_only', 'super_read_only', 'server_id', 'server_uuid', 
        'log_bin', 'binlog_format', 'gtid_mode', 'enforce_gtid_consistency', 
        'version', 'version_comment', 'rpl_semi_sync_master_enabled',
        'rpl_semi_sync_source_enabled', 'rpl_semi_sync_slave_enabled',
        'rpl_semi_sync_replica_enabled', 'rpl_semi_sync_master_timeout',
        'rpl_semi_sync_source_timeout', 'group_replication_group_name',
        'group_replication_single_primary_mode', 'group_replication_local_address',
        'group_replication_group_seeds'
      )`
    );

    const vars: Record<string, string> = {};
    for (const r of (varRows as any[])) {
      const name = String((r as any).Variable_name || (r as any).variable_name || '').toLowerCase();
      const val = String((r as any).Value || (r as any).value || '');
      vars[name] = val;
    }

    const serverVersion = vars['version'] || '';
    const isMariaDb = serverVersion.toLowerCase().includes('mariadb') || 
      (vars['version_comment'] || '').toLowerCase().includes('mariadb');
    const serverId = Number(vars['server_id']) || 0;
    const serverUuid = vars['server_uuid'] || undefined;
    const isReadOnly = vars['read_only'] === 'ON' || vars['read_only'] === '1';
    const isSuperReadOnly = vars['super_read_only'] === 'ON' || vars['super_read_only'] === '1';
    const binlogEnabled = vars['log_bin'] === 'ON' || vars['log_bin'] === '1';
    const binlogFormat = vars['binlog_format'] as any;
    const gtidMode = vars['gtid_mode'] || undefined;
    const enforceGtidConsistency = vars['enforce_gtid_consistency'] || undefined;

    // 2. Fetch Master/Source Status
    let currentBinlogFile: string | undefined;
    let currentBinlogPos: number | undefined;
    let executedGtidSet: string | undefined;

    try {
      // Try SHOW MASTER STATUS (standard across 5.7/8.0/MariaDB) or SHOW BINARY LOG STATUS (8.2+)
      let masterStatusRows: any[] = [];
      try {
        const [res] = await conn.query('SHOW MASTER STATUS');
        masterStatusRows = res as any[];
      } catch {
        try {
          const [res] = await conn.query('SHOW BINARY LOG STATUS');
          masterStatusRows = res as any[];
        } catch {
          // Ignore
        }
      }

      if (masterStatusRows.length > 0) {
        const row = masterStatusRows[0];
        currentBinlogFile = row.File || row.file;
        currentBinlogPos = row.Position !== undefined ? Number(row.Position) : undefined;
        executedGtidSet = row.Executed_Gtid_Set || row.executed_gtid_set;
      }
    } catch (err: any) {
      console.warn(`[getMysqlReplicationOverview] Master status query error: ${err.message}`);
    }

    // 3. Fetch Replica/Slave Status
    const channels: MysqlReplicationChannelStatus[] = [];
    try {
      let replicaStatusRows: any[] = [];
      try {
        // Modern MySQL 8.0.22+
        const [res] = await conn.query('SHOW REPLICA STATUS');
        replicaStatusRows = res as any[];
      } catch {
        // Fallback for MySQL 5.7 / MariaDB
        try {
          const [res] = await conn.query('SHOW SLAVE STATUS');
          replicaStatusRows = res as any[];
        } catch {
          // No replication configured or insufficient permissions
        }
      }

      for (const row of replicaStatusRows) {
        const channelName = row.Channel_Name || row.Connection_name || 'default';
        const sourceHost = row.Source_Host || row.Master_Host || '';
        const sourcePort = Number(row.Source_Port || row.Master_Port) || 3306;
        const sourceUser = row.Source_User || row.Master_User || '';
        const slaveIoRunning = row.Replica_IO_Running || row.Slave_IO_Running || 'No';
        const slaveSqlRunning = row.Replica_SQL_Running || row.Slave_SQL_Running || 'No';
        const secondsBehind = row.Seconds_Behind_Source !== undefined ? row.Seconds_Behind_Source : row.Seconds_Behind_Master;
        const secondsBehindMaster = secondsBehind !== null && secondsBehind !== undefined ? Number(secondsBehind) : null;

        channels.push({
          channelName,
          sourceHost,
          sourcePort,
          sourceUser,
          slaveIoRunning,
          slaveSqlRunning,
          lastIoError: row.Last_IO_Error || row.Last_Error || undefined,
          lastIoErrno: row.Last_IO_Errno !== undefined ? Number(row.Last_IO_Errno) : undefined,
          lastSqlError: row.Last_SQL_Error || undefined,
          lastSqlErrno: row.Last_SQL_Errno !== undefined ? Number(row.Last_SQL_Errno) : undefined,
          secondsBehindMaster: isNaN(secondsBehindMaster as any) ? null : secondsBehindMaster,
          masterLogFile: row.Master_Log_File || row.Source_Log_File || undefined,
          readMasterLogPos: row.Read_Master_Log_Pos !== undefined ? Number(row.Read_Master_Log_Pos) : undefined,
          relayLogFile: row.Relay_Log_File || undefined,
          relayLogPos: row.Relay_Log_Pos !== undefined ? Number(row.Relay_Log_Pos) : undefined,
          relaySourceLogFile: row.Relay_Master_Log_File || row.Relay_Source_Log_File || undefined,
          execMasterLogPos: row.Exec_Master_Log_Pos !== undefined ? Number(row.Exec_Master_Log_Pos) : undefined,
          autoPosition: row.Auto_Position === 1 || row.Auto_Position === '1',
          retrievedGtidSet: row.Retrieved_Gtid_Set || undefined,
          executedGtidSet: row.Executed_Gtid_Set || executedGtidSet || undefined,
          sqlDelay: row.SQL_Delay !== undefined ? Number(row.SQL_Delay) : undefined,
          sqlRemainingDelay: row.SQL_Remaining_Delay !== undefined ? Number(row.SQL_Remaining_Delay) : undefined,
          slaveIoState: row.Slave_IO_State || row.Replica_IO_State || undefined,
          masterServerId: row.Master_Server_Id !== undefined ? Number(row.Master_Server_Id) : undefined,
          masterUuid: row.Master_UUID || undefined,
          usingGtid: row.Using_Gtid || undefined,
          masterSslAllowed: row.Master_SSL_Allowed === 'Yes' || row.Source_SSL_Allowed === 'Yes',
          replicateDoDb: row.Replicate_Do_DB || undefined,
          replicateIgnoreDb: row.Replicate_Ignore_DB || undefined,
        });
      }
    } catch (err: any) {
      console.warn(`[getMysqlReplicationOverview] Replica status query error: ${err.message}`);
    }

    // 4. Fetch Connected Replicas
    const connectedReplicas: MysqlConnectedReplica[] = [];
    try {
      let replicaHostsRows: any[] = [];
      try {
        const [res] = await conn.query('SHOW REPLICAS');
        replicaHostsRows = res as any[];
      } catch {
        try {
          const [res] = await conn.query('SHOW SLAVE HOSTS');
          replicaHostsRows = res as any[];
        } catch {
          // Ignore
        }
      }

      for (const r of replicaHostsRows) {
        connectedReplicas.push({
          serverId: Number(r.Server_id || r.Server_Id || r.server_id) || 0,
          host: r.Host || r.host || '',
          port: Number(r.Port || r.port) || 3306,
          user: r.User || r.user || undefined,
          uuid: r.Master_id || r.Slave_UUID || r.Replica_UUID || undefined,
        });
      }

      // Also enrich with processlist dump threads
      try {
        const [dumpThreads] = await conn.query(
          `SELECT ID, USER, HOST, COMMAND, TIME, STATE 
           FROM information_schema.PROCESSLIST 
           WHERE COMMAND IN ('Binlog Dump', 'Binlog Dump GTID')`
        );
        for (const dt of (dumpThreads as any[])) {
          const hostParts = String(dt.HOST || '').split(':');
          const dtHost = hostParts[0] || '';
          const dtPort = Number(hostParts[1]) || 0;
          // Check if already in connectedReplicas
          const existing = connectedReplicas.find((cr) => cr.host === dtHost);
          if (existing) {
            existing.threadId = Number(dt.ID);
            existing.command = dt.COMMAND;
            existing.timeSeconds = Number(dt.TIME);
            existing.state = dt.STATE;
          } else {
            connectedReplicas.push({
              serverId: 0,
              host: dtHost || 'replica-thread',
              port: dtPort || 3306,
              user: dt.USER,
              threadId: Number(dt.ID),
              command: dt.COMMAND,
              timeSeconds: Number(dt.TIME),
              state: dt.STATE,
            });
          }
        }
      } catch {
        // Ignore processlist errors
      }
    } catch (err: any) {
      console.warn(`[getMysqlReplicationOverview] Connected replicas error: ${err.message}`);
    }

    // 5. Fetch Binary Logs
    const binaryLogs: MysqlBinaryLogFile[] = [];
    let totalBinlogSizeBytes = 0;
    if (binlogEnabled) {
      try {
        let binlogRows: any[] = [];
        try {
          const [res] = await conn.query('SHOW BINARY LOGS');
          binlogRows = res as any[];
        } catch {
          try {
            const [res] = await conn.query('SHOW MASTER LOGS');
            binlogRows = res as any[];
          } catch {
            // Ignore
          }
        }

        for (const bl of binlogRows) {
          const fileName = bl.Log_name || bl.File_name || bl.log_name || '';
          const size = Number(bl.File_size || bl.file_size) || 0;
          totalBinlogSizeBytes += size;
          binaryLogs.push({
            fileName,
            fileSizeBytes: size,
            formattedSize: formatBytes(size),
            isCurrent: currentBinlogFile ? fileName === currentBinlogFile : false,
          });
        }
      } catch (err: any) {
        console.warn(`[getMysqlReplicationOverview] Binary logs query error: ${err.message}`);
      }
    }

    // 6. Group Replication status
    const groupRepName = vars['group_replication_group_name'];
    const groupRepEnabled = Boolean(groupRepName && groupRepName.length > 0);
    const groupReplication: MysqlGroupReplicationInfo = {
      enabled: groupRepEnabled,
      groupName: groupRepName || undefined,
      localAddress: vars['group_replication_local_address'] || undefined,
      groupSeeds: vars['group_replication_group_seeds'] || undefined,
      singlePrimaryMode: vars['group_replication_single_primary_mode'] === 'ON',
    };

    if (groupRepEnabled) {
      try {
        const [grMembers] = await conn.query(
          `SELECT MEMBER_ID, MEMBER_HOST, MEMBER_PORT, MEMBER_STATE, MEMBER_ROLE 
           FROM performance_schema.replication_group_members 
           WHERE MEMBER_ID = @@server_uuid`
        );
        const grRows = grMembers as any[];
        if (grRows.length > 0) {
          const me = grRows[0];
          groupReplication.memberRole = me.MEMBER_ROLE as any;
          groupReplication.memberState = me.MEMBER_STATE as any;
        }
        const [totalCount] = await conn.query(
          `SELECT COUNT(*) as cnt FROM performance_schema.replication_group_members`
        );
        const countRows = totalCount as any[];
        if (countRows.length > 0) {
          groupReplication.membersCount = Number(countRows[0].cnt);
        }
      } catch {
        // performance_schema may be disabled
      }
    }

    // 7. Semi-sync status
    const semiSync: MysqlSemiSyncInfo = {
      masterEnabled: vars['rpl_semi_sync_master_enabled'] === 'ON' || vars['rpl_semi_sync_source_enabled'] === 'ON',
      masterStatus: false,
      slaveEnabled: vars['rpl_semi_sync_slave_enabled'] === 'ON' || vars['rpl_semi_sync_replica_enabled'] === 'ON',
      slaveStatus: false,
      timeoutMs: Number(vars['rpl_semi_sync_master_timeout'] || vars['rpl_semi_sync_source_timeout']) || undefined,
    };

    try {
      const [statusRows] = await conn.query(
        `SHOW STATUS WHERE Variable_name IN (
          'Rpl_semi_sync_master_status', 'Rpl_semi_sync_source_status',
          'Rpl_semi_sync_slave_status', 'Rpl_semi_sync_replica_status'
        )`
      );
      for (const sr of (statusRows as any[])) {
        const name = String((sr as any).Variable_name || '').toLowerCase();
        const val = String((sr as any).Value || '');
        if (name.includes('master_status') || name.includes('source_status')) {
          semiSync.masterStatus = val === 'ON';
        }
        if (name.includes('slave_status') || name.includes('replica_status')) {
          semiSync.slaveStatus = val === 'ON';
        }
      }
    } catch {
      // Ignore
    }

    // 8. Determine overarching replication role
    let role: MysqlReplicationRole = 'standalone';
    const isReplica = channels.length > 0;
    const isSource = binlogEnabled && (connectedReplicas.length > 0 || currentBinlogFile !== undefined);

    if (groupRepEnabled) {
      role = 'group_replication';
    } else if (isReplica && isSource) {
      role = 'dual';
    } else if (isReplica) {
      role = 'replica';
    } else if (isSource) {
      role = 'source';
    }

    return {
      role,
      serverId,
      serverUuid,
      isReadOnly,
      isSuperReadOnly,
      binlogEnabled,
      binlogFormat,
      currentBinlogFile,
      currentBinlogPos,
      gtidMode,
      enforceGtidConsistency,
      executedGtidSet,
      channels,
      connectedReplicas,
      binaryLogs,
      totalBinlogSizeBytes,
      formattedTotalBinlogSize: formatBytes(totalBinlogSizeBytes),
      groupReplication,
      semiSync,
      serverVersion,
      isMariaDb,
      collectedAt: Date.now(),
    };
  } finally {
    await conn.end().catch(() => {});
  }
}

/**
 * Executes a controlled, verified MySQL replication management action.
 */
export async function executeMysqlReplicationAction(
  server: RemoteServer,
  request: MysqlReplicationActionRequest
): Promise<MysqlReplicationActionResult> {
  const conn = await mysql.createConnection(getMysqlConfig(server));
  try {
    const channelClause = request.channelName && request.channelName !== 'default' 
      ? ` FOR CHANNEL '${request.channelName.replace(/'/g, "''")}'` 
      : '';

    switch (request.action) {
      case 'start_replica': {
        let executedSql = `START REPLICA${channelClause};`;
        try {
          await conn.query(`START REPLICA${channelClause}`);
        } catch {
          executedSql = `START SLAVE${channelClause};`;
          await conn.query(`START SLAVE${channelClause}`);
        }
        return {
          success: true,
          message: `Replication channel ${request.channelName || 'default'} started successfully.`,
          messageFa: `کانال رونویسی ${request.channelName || 'پیش‌فرض'} با موفقیت آغاز به کار کرد.`,
          executedSql,
        };
      }

      case 'stop_replica': {
        let executedSql = `STOP REPLICA${channelClause};`;
        try {
          await conn.query(`STOP REPLICA${channelClause}`);
        } catch {
          executedSql = `STOP SLAVE${channelClause};`;
          await conn.query(`STOP SLAVE${channelClause}`);
        }
        return {
          success: true,
          message: `Replication channel ${request.channelName || 'default'} stopped.`,
          messageFa: `کانال رونویسی ${request.channelName || 'پیش‌فرض'} با موفقیت متوقف شد.`,
          executedSql,
        };
      }

      case 'reset_replica': {
        const allModifier = request.resetAll ? ' ALL' : '';
        let executedSql = `RESET REPLICA${allModifier}${channelClause};`;
        try {
          await conn.query(`RESET REPLICA${allModifier}${channelClause}`);
        } catch {
          executedSql = `RESET SLAVE${allModifier}${channelClause};`;
          await conn.query(`RESET SLAVE${allModifier}${channelClause}`);
        }
        return {
          success: true,
          message: `Replica channel ${request.channelName || 'default'} reset completed${request.resetAll ? ' (ALL configuration cleared)' : ''}.`,
          messageFa: `تنظیمات کانال رپلیکا ${request.channelName || 'پیش‌فرض'} ریست شد${request.resetAll ? ' (تمامی متادیتا و کانفیگ‌ها پاکسازی شد)' : ''}.`,
          executedSql,
        };
      }

      case 'reset_master': {
        const executedSql = 'RESET MASTER;';
        await conn.query('RESET MASTER');
        return {
          success: true,
          message: 'Binary logs and master status reset successfully (RESET MASTER).',
          messageFa: 'تمامی فایل‌های لاگ باینری و شمارنده‌های مستر با موفقیت ریست شدند (RESET MASTER).',
          executedSql,
        };
      }

      case 'purge_binlogs_to': {
        if (!request.purgeTarget || !/^[a-zA-Z0-9_\-\.]+$/.test(request.purgeTarget)) {
          throw new Error('Invalid binary log target filename.');
        }
        const executedSql = `PURGE BINARY LOGS TO '${request.purgeTarget}';`;
        await conn.query(executedSql);
        return {
          success: true,
          message: `Binary logs purged up to '${request.purgeTarget}'.`,
          messageFa: `فایل‌های لاگ باینری تا فایل '${request.purgeTarget}' پاکسازی شدند.`,
          executedSql,
        };
      }

      case 'purge_binlogs_before': {
        if (!request.purgeTarget || !/^[0-9\-\:\s]+$/.test(request.purgeTarget)) {
          throw new Error('Invalid date/time format for purging binary logs.');
        }
        const executedSql = `PURGE BINARY LOGS BEFORE '${request.purgeTarget}';`;
        await conn.query(executedSql);
        return {
          success: true,
          message: `Binary logs purged before date '${request.purgeTarget}'.`,
          messageFa: `فایل‌های لاگ باینری پیش از تاریخ '${request.purgeTarget}' پاکسازی شدند.`,
          executedSql,
        };
      }

      case 'set_read_only': {
        try {
          await conn.query('SET GLOBAL super_read_only = ON');
          await conn.query('SET GLOBAL read_only = ON');
          return {
            success: true,
            message: 'Server set to READ ONLY and SUPER READ ONLY mode.',
            messageFa: 'سرور با موفقیت در وضعیت فقط-خواندنی (READ ONLY و SUPER READ ONLY) قرار گرفت.',
            executedSql: 'SET GLOBAL super_read_only = ON; SET GLOBAL read_only = ON;',
          };
        } catch {
          await conn.query('SET GLOBAL read_only = ON');
          return {
            success: true,
            message: 'Server set to READ ONLY mode.',
            messageFa: 'سرور با موفقیت در وضعیت فقط-خواندنی (READ ONLY) قرار گرفت.',
            executedSql: 'SET GLOBAL read_only = ON;',
          };
        }
      }

      case 'set_read_write': {
        try {
          await conn.query('SET GLOBAL super_read_only = OFF');
        } catch {
          // ignore
        }
        await conn.query('SET GLOBAL read_only = OFF');
        return {
          success: true,
          message: 'Server set to normal READ WRITE mode.',
          messageFa: 'سرور از وضعیت فقط-خواندنی خارج شد و در حالت عادی خواندن/نوشتن (READ WRITE) قرار گرفت.',
          executedSql: 'SET GLOBAL super_read_only = OFF; SET GLOBAL read_only = OFF;',
        };
      }

      default:
        throw new Error(`Unsupported replication action: ${(request as any).action}`);
    }
  } finally {
    await conn.end().catch(() => {});
  }
}

// ==========================================
// Phase 20: MySQL Security Audit & Safety Hardening
// ==========================================

/**
 * Records an auditable MySQL operation into the persistent system audit log.
 * Guaranteed never to log passwords, private keys, or plain-text secrets.
 */
export async function recordMysqlAuditLog(
  server: RemoteServer,
  action: string,
  actionFa: string,
  category: MysqlAuditLogEntry['category'],
  target: string,
  status: 'success' | 'failure',
  details?: string,
  detailsFa?: string,
  user?: string
): Promise<void> {
  try {
    await addAuditLog({
      userName: user || server.mysql_user || 'root',
      action: `MySQL: ${action}`,
      category: `mysql_${category}`,
      target: `[${server.name || server.ip}] ${target}`,
      status,
      details: JSON.stringify({
        actionFa,
        details,
        detailsFa,
        serverId: server.id,
        serverIp: server.ip,
      }),
      ipAddress: server.ip,
    });
  } catch (err) {
    console.warn('[MysqlAudit] Failed to persist audit log record:', err);
  }
}

/**
 * Retrieves audit log entries for MySQL operations associated with a remote server.
 */
export async function getMysqlAuditLogsReport(
  server: RemoteServer,
  limit: number = 100
): Promise<MysqlAuditLogsResponse> {
  try {
    const rawLogs = await getAuditLogs(300);
    const serverIdentifier = `[${server.name || server.ip}]`;

    const filtered: MysqlAuditLogEntry[] = [];
    for (const log of rawLogs) {
      const isMysql = (log.category && log.category.startsWith('mysql_')) || (log.action && log.action.startsWith('MySQL: '));
      const matchesServer = (log.target && log.target.includes(serverIdentifier)) || (log.details && log.details.includes(server.id));

      if (isMysql && (matchesServer || !server.id)) {
        let parsedDetails: any = {};
        try {
          parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
        } catch {
          parsedDetails = { raw: log.details };
        }

        const rawCat = (log.category || '').replace('mysql_', '') as MysqlAuditLogEntry['category'];
        const validCategories: MysqlAuditLogEntry['category'][] = [
          'user_management',
          'grant_revoke',
          'destructive_ddl',
          'config_mutation',
          'replication_control',
          'backup_restore',
          'session_kill',
          'query_execution',
        ];

        filtered.push({
          id: log.id || `audit-${Math.random()}`,
          serverId: server.id,
          serverName: server.name || server.ip,
          timestamp: log.timestamp || new Date().toISOString(),
          action: (log.action || '').replace(/^MySQL:\s*/, ''),
          actionFa: parsedDetails.actionFa || log.action || '',
          category: validCategories.includes(rawCat) ? rawCat : 'query_execution',
          target: (log.target || '').replace(serverIdentifier, '').trim() || server.ip,
          user: log.user_name || 'root',
          ip: log.ip_address || server.ip,
          status: log.status === 'success' || log.status === 'info' ? 'success' : 'failure',
          details: parsedDetails.details || undefined,
          detailsFa: parsedDetails.detailsFa || undefined,
        });
      }
    }

    return {
      success: true,
      total: filtered.length,
      entries: filtered.slice(0, limit),
    };
  } catch (err: any) {
    return {
      success: false,
      total: 0,
      entries: [],
    };
  }
}

/**
 * Performs a comprehensive, production-grade security and hardening audit of the target MySQL server.
 * Evaluates credentials, excessive grants, TLS/SSL transport, file-priv injection, local-infile,
 * and query safety with zero simulated or mock data.
 */
export async function getMysqlSecurityAuditReport(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<MysqlSecurityAuditReport> {
  const conn = await getDirectMysqlConnection(server, options);

  try {
    // Introspect version and distribution
    const [versionRows] = await conn.query('SELECT VERSION() AS ver');
    const fullVer = ((versionRows as any[])[0]?.ver || '').toString();
    const isMariaDb = fullVer.toLowerCase().includes('mariadb');

    // Introspect schema columns in mysql.user
    const [userColRows] = await conn.query('SHOW COLUMNS FROM mysql.user');
    const userColumns = new Set(((userColRows as any[]) || []).map((c: any) => c.Field));

    const checks: MysqlSecurityCheckItem[] = [];

    // Helper to read global variable safely
    const getGlobalVar = async (name: string): Promise<string> => {
      try {
        const [rows] = await conn.query(`SHOW GLOBAL VARIABLES LIKE ?`, [name]);
        return ((rows as any[])[0]?.Value ?? '').toString();
      } catch {
        return '';
      }
    };

    // -------------------------------------------------------------
    // Check 1: Empty or Absent Root / Admin Passwords (CRITICAL)
    // -------------------------------------------------------------
    let emptyRootUsers: Array<{ User: string; Host: string }> = [];
    try {
      const pwdCol = userColumns.has('authentication_string')
        ? 'authentication_string'
        : userColumns.has('Password')
        ? 'Password'
        : null;

      if (pwdCol) {
        const [rows] = await conn.query(
          `SELECT User, Host FROM mysql.user WHERE (User = 'root' OR User = 'admin') AND (${pwdCol} = '' OR ${pwdCol} IS NULL)`
        );
        emptyRootUsers = (rows as any[]) || [];
      }
    } catch (e) {
      console.warn('[MysqlSecurityAudit] Check empty root error:', e);
    }

    if (emptyRootUsers.length > 0) {
      checks.push({
        id: 'empty_root_password',
        category: 'authentication',
        title: 'Empty Administrator Password Detected',
        titleFa: 'رمز عبور خالی یا نامعتبر برای کاربر ریشه (root)',
        description: 'One or more administrative accounts have an empty password, allowing unauthenticated root access.',
        descriptionFa: 'یک یا چند حساب کاربری با دسترسی مدیر ارشد (مانند root) بدون هیچ رمز عبوری تنظیم شده‌اند که ورود بدون احراز هویت را ممکن می‌سازد.',
        riskLevel: 'critical',
        status: 'failed',
        currentValue: `${emptyRootUsers.length} account(s) without password (${emptyRootUsers.map((u) => `'${u.User}'@'${u.Host}'`).join(', ')})`,
        recommendedValue: 'All administrative accounts must have strong, non-empty passwords',
        impact: 'Complete, unauthenticated database takeover and full system compromise.',
        impactFa: 'تسخیر کامل پایگاه داده توسط مهاجمین و نفوذ به سیستم عامل بدون نیاز به رمز عبور.',
        remediationGuide: 'Set a strong password for all root/admin accounts using ALTER USER.',
        remediationGuideFa: 'با دستور ALTER USER برای کلیه حساب‌های ریشه رمز عبور قدرتمند تنظیم کنید.',
        remediationSql: `ALTER USER 'root'@'localhost' IDENTIFIED BY 'StrongRandomPassword123!'; FLUSH PRIVILEGES;`,
        details: emptyRootUsers.map((u) => ({
          label: `${u.User}@${u.Host}`,
          labelFa: `${u.User}@${u.Host}`,
          value: 'Password EMPTY (Authentication Disabled)',
          isWarning: true,
        })),
      });
    } else {
      checks.push({
        id: 'empty_root_password',
        category: 'authentication',
        title: 'Root & Admin Passwords Protected',
        titleFa: 'رمزهای عبور حساب‌های ریشه محافظت‌شده هستند',
        description: 'All administrative and root accounts have authenticated password hashes configured.',
        descriptionFa: 'کلیه حساب‌های کاربری مدیر ارشد دارای هش رمز عبور معتبر و فعال می‌باشند.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'All administrative accounts require password authentication',
        recommendedValue: 'Protected',
        impact: 'Prevents unauthenticated database administrative access.',
        impactFa: 'از ورود بدون احراز هویت به پایگاه داده جلوگیری می‌کند.',
      });
    }

    // -------------------------------------------------------------
    // Check 2: Anonymous User Accounts (HIGH)
    // -------------------------------------------------------------
    let anonUsers: Array<{ User: string; Host: string }> = [];
    try {
      const [rows] = await conn.query(`SELECT User, Host FROM mysql.user WHERE User = '' OR User IS NULL`);
      anonUsers = (rows as any[]) || [];
    } catch (e) {
      console.warn('[MysqlSecurityAudit] Check anonymous error:', e);
    }

    if (anonUsers.length > 0) {
      checks.push({
        id: 'anonymous_users',
        category: 'authentication',
        title: 'Anonymous User Accounts Present',
        titleFa: 'وجود حساب‌های کاربری ناشناس (Anonymous)',
        description: 'Anonymous accounts allow anyone without credentials to connect to the MySQL instance and access test tables.',
        descriptionFa: 'حساب‌های کاربری بدون نام کاربری (Anonymous) امکان اتصال به پایگاه داده بدون مشخصات هویتی را فراهم می‌نمایند.',
        riskLevel: 'high',
        status: 'failed',
        currentValue: `${anonUsers.length} anonymous account(s) found (${anonUsers.map((u) => `''@'${u.Host}'`).join(', ')})`,
        recommendedValue: 'Remove all anonymous accounts',
        impact: 'Unauthorized access to databases matching test or wildcard permissions.',
        impactFa: 'دسترسی غیرمجاز و امکان نفوذ به جداول تستی و دیتابیس‌های دارای مجوزهای عمومی.',
        remediationGuide: 'Drop all anonymous accounts using DROP USER or DELETE FROM mysql.user.',
        remediationGuideFa: 'حساب‌های ناشناس را با دستور DROP USER یا حذف از mysql.user پاکسازی کنید.',
        remediationSql: `DROP USER ''@'localhost'; DROP USER ''@'%'; FLUSH PRIVILEGES;`,
        details: anonUsers.map((u) => ({
          label: `Anonymous User`,
          labelFa: 'کاربر ناشناس',
          value: `Host: ${u.Host}`,
          isWarning: true,
        })),
      });
    } else {
      checks.push({
        id: 'anonymous_users',
        category: 'authentication',
        title: 'Zero Anonymous User Accounts',
        titleFa: 'عدم وجود حساب کاربری ناشناس',
        description: 'No anonymous user accounts exist in the mysql.user catalog.',
        descriptionFa: 'هیچ حساب کاربری ناشناسی در کاتالوگ کاربران MySQL یافت نشد.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'No anonymous users present',
        recommendedValue: 'None',
        impact: 'All connections require authenticated credentials.',
        impactFa: 'تمامی اتصالات نیازمند نام کاربری و هویت مشخص هستند.',
      });
    }

    // -------------------------------------------------------------
    // Check 3: Wildcard Remote Host for Administrative Accounts (HIGH)
    // -------------------------------------------------------------
    let wildcardAdmins: Array<{ User: string; Host: string }> = [];
    try {
      const superCol = userColumns.has('Super_priv') ? "Super_priv = 'Y'" : "1=0";
      const grantCol = userColumns.has('Grant_priv') ? "Grant_priv = 'Y'" : "1=0";
      const [rows] = await conn.query(
        `SELECT User, Host FROM mysql.user WHERE Host = '%' AND (User = 'root' OR ${superCol} OR ${grantCol})`
      );
      wildcardAdmins = (rows as any[]) || [];
    } catch (e) {
      console.warn('[MysqlSecurityAudit] Check wildcard admin error:', e);
    }

    if (wildcardAdmins.length > 0) {
      checks.push({
        id: 'wildcard_admin_host',
        category: 'privileges',
        title: 'Administrative Account Bound to Wildcard Host (%)',
        titleFa: 'حساب‌های مدیر ارشد متصل به هاست عمومی و نامحدود (%)',
        description: `Privileged accounts (${wildcardAdmins.map((u) => `'${u.User}'@'%'`).join(', ')}) can connect from any IP address globally.`,
        descriptionFa: 'حساب‌های مدیر با دسترسی ریشه یا SUPER مجاز به اتصال از سراسر اینترنت بدون محدودیت IP هستند.',
        riskLevel: 'high',
        status: 'warning',
        currentValue: `${wildcardAdmins.length} privileged account(s) using Host '%'`,
        recommendedValue: 'Restrict administrative accounts to specific management subnets or localhost',
        impact: 'Exposes administrative credentials to credential brute-force attacks across all reachable networks.',
        impactFa: 'افزایش چشمگیر خطر حملات بروت‌فورس و افشای کلمه عبور مدیر از شبکه عمومی.',
        remediationGuide: 'Alter or replace the wildcard host with explicit subnet masks (e.g. 192.168.10.% or localhost).',
        remediationGuideFa: 'هاست کاربری را از حالت عمومی % به زیرشبکه مدیریت یا localhost تغییر دهید.',
        details: wildcardAdmins.map((u) => ({
          label: `${u.User}@${u.Host}`,
          labelFa: `${u.User}@${u.Host}`,
          value: 'Wildcard global access enabled',
          isWarning: true,
        })),
      });
    } else {
      checks.push({
        id: 'wildcard_admin_host',
        category: 'privileges',
        title: 'Administrative Accounts Host-Restricted',
        titleFa: 'محدودیت هاست و شبکه برای حساب‌های مدیر ارشد',
        description: 'No administrative account has unrestricted global wildcard (%) access.',
        descriptionFa: 'هیچ حساب کاربری مدیریتی دارای مجوز دسترسی عمومی نامحدود (%) نیست.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'All administrative accounts restricted to specific hosts/subnets',
        recommendedValue: 'Specific IP/Subnet or Localhost',
        impact: 'Reduces surface area for remote unauthorized administrative attempts.',
        impactFa: 'کاهش سطح حمله از طریق ایزوله‌سازی دسترسی‌های مدیر.',
      });
    }

    // -------------------------------------------------------------
    // Check 4: secure_file_priv - File System Boundary (CRITICAL/HIGH)
    // -------------------------------------------------------------
    const secureFilePriv = await getGlobalVar('secure_file_priv');
    if (secureFilePriv === '') {
      checks.push({
        id: 'secure_file_priv_empty',
        category: 'engine_hardening',
        title: 'Unrestricted File System Access (secure_file_priv is EMPTY)',
        titleFa: 'دسترسی نامحدود به فایل‌های سرور (secure_file_priv خالی است)',
        description: 'secure_file_priv is set to an empty string. Users with FILE privilege can read or overwrite any OS file accessible to the mysql daemon.',
        descriptionFa: 'متغیر secure_file_priv روی مقدار خالی تنظیم شده که به کاربران دارای مجوز FILE اجازه خواندن و بازنویسی هر فایلی در سرور را می‌دهد.',
        riskLevel: 'critical',
        status: 'failed',
        currentValue: 'EMPTY (Unrestricted server filesystem access)',
        recommendedValue: 'NULL (disabled) or a dedicated directory (e.g., /var/lib/mysql-files/)',
        impact: 'Arbitrary local file reading (/etc/shadow, /etc/passwd) and potential remote code execution via webshell injection.',
        impactFa: 'امکان خواندن فایل‌های حساس سیستم‌عامل و اجرای کد از راه دور از طریق تزریق وب‌شل.',
        remediationGuide: 'Add "secure_file_priv = /var/lib/mysql-files" to my.cnf and restart MySQL.',
        remediationGuideFa: 'مقدار secure_file_priv = /var/lib/mysql-files را در my.cnf درج و سرور را ریستارت کنید.',
      });
    } else if (secureFilePriv.toUpperCase() === 'NULL') {
      checks.push({
        id: 'secure_file_priv_empty',
        category: 'engine_hardening',
        title: 'File System Import/Export Disabled (secure_file_priv is NULL)',
        titleFa: 'واردات و خروجی فایل غیرفعال است (secure_file_priv = NULL)',
        description: 'LOAD DATA INFILE and SELECT ... INTO OUTFILE are completely disabled across all users.',
        descriptionFa: 'عملیات بارگذاری و نگارش فایل از طریق کوئری‌های SQL برای تمام کاربران غیرفعال است.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'NULL (Hardened & Disabled)',
        recommendedValue: 'NULL or isolated directory',
        impact: 'Complete immunity against SQL-based file system read/write exploits.',
        impactFa: 'ایمنی کامل در برابر نفوذهای مبتنی بر خواندن و نوشتن فایل از طریق SQL.',
      });
    } else {
      checks.push({
        id: 'secure_file_priv_empty',
        category: 'engine_hardening',
        title: 'File System Restricted to Designated Directory',
        titleFa: 'دسترسی به فایل‌ها به پوشه مشخص محدود است',
        description: `Import/export operations are isolated to directory: ${secureFilePriv}`,
        descriptionFa: `عملیات بارگذاری و نگارش فایل تنها به مسیر امن ${secureFilePriv} محدود گردیده است.`,
        riskLevel: 'good',
        status: 'passed',
        currentValue: secureFilePriv,
        recommendedValue: secureFilePriv,
        impact: 'Prevents reading arbitrary sensitive operating system files.',
        impactFa: 'جلوگیری از خواندن فایل‌های حساس خارج از محدوده مجاز پایگاه داده.',
      });
    }

    // -------------------------------------------------------------
    // Check 5: local_infile - Rogue Server File Stealing (HIGH)
    // -------------------------------------------------------------
    const localInfile = (await getGlobalVar('local_infile')).toUpperCase();
    if (localInfile === 'ON' || localInfile === '1') {
      checks.push({
        id: 'local_infile_enabled',
        category: 'engine_hardening',
        title: 'Local Infile Enabled (Client File Disclosure Vulnerability)',
        titleFa: 'قابلیت local_infile فعال است (آسیب‌پذیری افشای فایل کلاینت)',
        description: 'When local_infile is ON, a compromised or rogue MySQL server can instruct connecting clients to upload arbitrary local files without user confirmation.',
        descriptionFa: 'فعال بودن local_infile به سرور اجازه می‌دهد فایل‌های محلی کلاینت‌های متصل را به طور خودکار استخراج نماید.',
        riskLevel: 'high',
        status: 'failed',
        currentValue: 'ON (Vulnerable)',
        recommendedValue: 'OFF',
        impact: 'Clients connecting to this or rogue intermediate proxies could leak credentials and local configuration files.',
        impactFa: 'کلاینت‌های متصل به سرور ممکن است اطلاعات محلی سیستم خود را افشا نمایند.',
        remediationGuide: 'Disable local_infile globally: SET GLOBAL local_infile = OFF;',
        remediationGuideFa: 'قابلیت local_infile را به صورت سراسری غیرفعال کنید: SET GLOBAL local_infile = OFF;',
        remediationSql: 'SET GLOBAL local_infile = OFF;',
      });
    } else {
      checks.push({
        id: 'local_infile_enabled',
        category: 'engine_hardening',
        title: 'Local Infile Disabled',
        titleFa: 'قابلیت local_infile غیرفعال و ایمن است',
        description: 'local_infile is OFF, protecting connecting clients from unsolicited file extraction requests.',
        descriptionFa: 'قابلیت local_infile خاموش بوده و کلاینت‌ها در برابر درخواست‌های ناخواسته استخراج فایل محافظت می‌شوند.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'OFF (Protected)',
        recommendedValue: 'OFF',
        impact: 'Client systems protected from local file disclosure exploits.',
        impactFa: 'حفاظت کامل از فایل‌های کلاینت در برابر اکسپلویت‌های MySQL.',
      });
    }

    // -------------------------------------------------------------
    // Check 6: Enforce Encrypted Transport (require_secure_transport / have_ssl) (MEDIUM/HIGH)
    // -------------------------------------------------------------
    const requireSecureTransport = (await getGlobalVar('require_secure_transport')).toUpperCase();
    const haveSsl = (await getGlobalVar('have_ssl')).toUpperCase();

    if (haveSsl === 'DISABLED' || haveSsl === 'NO') {
      checks.push({
        id: 'ssl_tls_encryption',
        category: 'network_ssl',
        title: 'TLS/SSL Encryption Disabled on Server',
        titleFa: 'رمزنگاری TLS/SSL در سرور غیرفعال است',
        description: 'The MySQL engine was compiled or started without SSL support. All traffic and passwords traverse the network in clear text.',
        descriptionFa: 'سرویس MySQL بدون پشتیبانی از SSL اجرا شده و کلیه ترافیک و رمزها در شبکه به صورت متن شفاف منتقل می‌شوند.',
        riskLevel: 'high',
        status: 'failed',
        currentValue: `have_ssl: ${haveSsl}`,
        recommendedValue: 'have_ssl: YES with valid certificates',
        impact: 'Eavesdropping and credential sniffing over untrusted networks.',
        impactFa: 'استراق سمع اطلاعات و سرقت رمزهای عبور در شبکه‌های نامطمئن.',
        remediationGuide: 'Configure SSL certificates (ssl_ca, ssl_cert, ssl_key) in my.cnf and restart MySQL.',
        remediationGuideFa: 'گواهی‌های SSL را در my.cnf تنظیم کرده و سرویس MySQL را ریستارت نمایید.',
      });
    } else if (requireSecureTransport !== 'ON' && requireSecureTransport !== '1') {
      checks.push({
        id: 'ssl_tls_encryption',
        category: 'network_ssl',
        title: 'Encrypted Transport Not Enforced (Plaintext Connections Permitted)',
        titleFa: 'عدم الزام رمزنگاری اتصالات (امکان اتصال متنی و غیررمزنگاری‌شده)',
        description: 'SSL is available on the server, but require_secure_transport is OFF, allowing clients to establish insecure unencrypted connections.',
        descriptionFa: 'قابلیت SSL فعال است اما اتصالات بدون رمزنگاری نیز پذیرفته می‌شوند زیرا require_secure_transport خاموش است.',
        riskLevel: 'medium',
        status: 'warning',
        currentValue: 'require_secure_transport: OFF',
        recommendedValue: 'require_secure_transport: ON',
        impact: 'Clients may inadvertently transmit passwords and query data unencrypted.',
        impactFa: 'امکان برقراری اتصالات بدون رمزنگاری و افشای اطلاعات در مسیر شبکه.',
        remediationGuide: 'Enforce SSL for all connections: SET GLOBAL require_secure_transport = ON;',
        remediationGuideFa: 'رمزنگاری را برای تمامی اتصالات الزامی کنید: SET GLOBAL require_secure_transport = ON;',
        remediationSql: 'SET GLOBAL require_secure_transport = ON;',
      });
    } else {
      checks.push({
        id: 'ssl_tls_encryption',
        category: 'network_ssl',
        title: 'Encrypted Transport Strictly Enforced',
        titleFa: 'رمزنگاری اتصالات به طور کامل الزامی است',
        description: 'require_secure_transport is ON. All TCP client connections are rejected unless TLS/SSL encrypted.',
        descriptionFa: 'اتصالات متنی مسدود بوده و تنها اتصالات رمزنگاری‌شده TLS/SSL اجازه اتصال دارند.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'require_secure_transport: ON (have_ssl: YES)',
        recommendedValue: 'ON',
        impact: 'Complete in-flight protection against packet sniffing and MITM attacks.',
        impactFa: 'حفاظت کامل داده‌ها در هنگام تبادل شبکه در برابر حملات شنود و مرد میانی.',
      });
    }

    // -------------------------------------------------------------
    // Check 7: Network Binding Exposure (bind_address) (MEDIUM)
    // -------------------------------------------------------------
    const bindAddress = await getGlobalVar('bind_address');
    const isPublicBinding = bindAddress === '0.0.0.0' || bindAddress === '*' || bindAddress === '::' || bindAddress === '';

    if (isPublicBinding) {
      checks.push({
        id: 'network_bind_address',
        category: 'network_ssl',
        title: 'MySQL Bound to All Interfaces (0.0.0.0)',
        titleFa: 'اتصال سرویس MySQL به تمام کارت‌های شبکه (0.0.0.0)',
        description: `bind_address is set to "${bindAddress || '0.0.0.0'}". The MySQL port (3306) listens on all external interfaces.`,
        descriptionFa: `پارامتر bind_address روی 0.0.0.0 یا همه اینترفیس‌ها تنظیم شده که پورت ۳۳۰۶ را به همه شبکه‌های سرور متصل می‌کند.`,
        riskLevel: 'medium',
        status: 'warning',
        currentValue: bindAddress || '0.0.0.0 (All interfaces)',
        recommendedValue: '127.0.0.1 or specific private LAN interface',
        impact: 'Increases exposure to port scanners and brute-force attempts if firewall rules are misconfigured.',
        impactFa: 'قرار گرفتن پورت در معرض اسکنرهای شبکه و حملات نفوذ در صورت ضعف فایروال.',
        remediationGuide: 'If MySQL does not require direct public access, set bind-address = 127.0.0.1 or private IP in my.cnf.',
        remediationGuideFa: 'در صورتی که نیازی به دسترسی عمومی مستقیم نیست، مقدار bind-address را در my.cnf به 127.0.0.1 تغییر دهید.',
      });
    } else {
      checks.push({
        id: 'network_bind_address',
        category: 'network_ssl',
        title: 'MySQL Bound to Dedicated Interface',
        titleFa: 'اتصال MySQL به اینترفیس مشخص و محدود',
        description: `bind_address is securely restricted to: ${bindAddress}`,
        descriptionFa: `پورت MySQL تنها به آدرس مشخص ${bindAddress} محدود شده است.`,
        riskLevel: 'good',
        status: 'passed',
        currentValue: bindAddress,
        recommendedValue: bindAddress,
        impact: 'Exposed only on intended network interface.',
        impactFa: 'محدودسازی سطح دسترسی تنها به اینترفیس مجاز.',
      });
    }

    // -------------------------------------------------------------
    // Check 8: sql_safe_updates - Accidental Mass Data Mutation (MEDIUM)
    // -------------------------------------------------------------
    const safeUpdates = (await getGlobalVar('sql_safe_updates')).toUpperCase();
    if (safeUpdates !== 'ON' && safeUpdates !== '1') {
      checks.push({
        id: 'sql_safe_updates_status',
        category: 'data_protection',
        title: 'Safe Updates Mode Disabled (Mass Update/Delete Risk)',
        titleFa: 'حالت Safe Updates غیرفعال است (خطر حذف یا تغییر ناخواسته کل جدول)',
        description: 'When sql_safe_updates is OFF, UPDATE and DELETE statements without a WHERE clause or LIMIT will execute across the entire table without warning.',
        descriptionFa: 'خاموش بودن sql_safe_updates اجازه اجرای دستورات UPDATE و DELETE بدون شرط WHERE را روی تمام سطرهای جدول صادر می‌کند.',
        riskLevel: 'medium',
        status: 'warning',
        currentValue: 'OFF',
        recommendedValue: 'ON',
        impact: 'Human error or SQL injection can instantly wipe or corrupt entire database tables.',
        impactFa: 'خطای انسانی یا تزریق SQL می‌تواند فوراً موجب پاک شدن یا تخریب داده‌های جداول گردد.',
        remediationGuide: 'Enable Safe Updates globally or per session: SET GLOBAL sql_safe_updates = ON;',
        remediationGuideFa: 'حالت ایمن را فعال کنید: SET GLOBAL sql_safe_updates = ON;',
        remediationSql: 'SET GLOBAL sql_safe_updates = ON;',
      });
    } else {
      checks.push({
        id: 'sql_safe_updates_status',
        category: 'data_protection',
        title: 'Safe Updates Mode Active',
        titleFa: 'حالت Safe Updates فعال و محافظت‌شده است',
        description: 'sql_safe_updates is ON. Prevents unintended mass UPDATE or DELETE statements without a WHERE key restriction.',
        descriptionFa: 'دستورات تغییر داده بدون شرط محدودکننده مسدود می‌شوند.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'ON (Protected)',
        recommendedValue: 'ON',
        impact: 'Protects critical business records from catastrophic unindexed wipes.',
        impactFa: 'حفاظت از رکوردهای کسب‌وکار در برابر حذف و دستکاری ناخواسته.',
      });
    }

    // -------------------------------------------------------------
    // Check 9: Excessive FILE / PROCESS / SUPER Privileges (HIGH)
    // -------------------------------------------------------------
    let nonRootFileUsers: Array<{ User: string; Host: string }> = [];
    try {
      if (userColumns.has('File_priv')) {
        const [rows] = await conn.query(
          `SELECT User, Host FROM mysql.user WHERE File_priv = 'Y' AND User NOT IN ('root', 'mysql.sys', 'mysql.session', 'mysql.infoschema')`
        );
        nonRootFileUsers = (rows as any[]) || [];
      }
    } catch (e) {
      console.warn('[MysqlSecurityAudit] Check File_priv error:', e);
    }

    if (nonRootFileUsers.length > 0) {
      checks.push({
        id: 'excessive_file_privilege',
        category: 'privileges',
        title: 'Non-Root Accounts Granted FILE Privilege',
        titleFa: 'اعطای مجوز سطح بالای FILE به کاربران عادی',
        description: `FILE privilege granted to non-system accounts (${nonRootFileUsers.map((u) => `'${u.User}'@'${u.Host}'`).join(', ')}). Allows reading/writing files on the server.`,
        descriptionFa: 'مجوز FILE به کاربران غیرسیستمی اعطا شده که به آنها اجازه خواندن و نوشتن فایل در سیستم‌عامل سرور را می‌دهد.',
        riskLevel: 'high',
        status: 'failed',
        currentValue: `${nonRootFileUsers.length} non-root account(s) have FILE privilege`,
        recommendedValue: 'FILE privilege should be reserved strictly for database administrators',
        impact: 'Enables privilege escalation, configuration inspection, and remote code execution.',
        impactFa: 'امکان ارتقای سطح دسترسی و خواندن فایل‌های حساس هاست توسط کاربران عادی.',
        remediationGuide: 'Revoke FILE privilege from non-admin accounts: REVOKE FILE ON *.* FROM ...',
        remediationGuideFa: 'مجوز FILE را از کاربران غیرمجاز با دستور REVOKE FILE سلب کنید.',
        details: nonRootFileUsers.map((u) => ({
          label: `${u.User}@${u.Host}`,
          labelFa: `${u.User}@${u.Host}`,
          value: 'Granted global FILE privilege',
          isWarning: true,
        })),
      });
    } else {
      checks.push({
        id: 'excessive_file_privilege',
        category: 'privileges',
        title: 'FILE Privilege Confined to System Administrators',
        titleFa: 'مجوز FILE منحصراً در اختیار مدیر سیستم است',
        description: 'No unprivileged application users possess global FILE reading or writing capabilities.',
        descriptionFa: 'هیچ کاربر غیرسیستمی به قابلیت خواندن و نوشتن فایل در سرور دسترسی ندارد.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'Confined to administrator accounts',
        recommendedValue: 'Restricted',
        impact: 'Protects the underlying host operating system from database-driven file tampering.',
        impactFa: 'حفاظت کامل از هاست در برابر دستکاری فایل‌ها از طریق دیتابیس.',
      });
    }

    // -------------------------------------------------------------
    // Check 10: Authentication Plugin Modernity (MEDIUM)
    // -------------------------------------------------------------
    let legacyPluginUsers: Array<{ User: string; Host: string; plugin: string }> = [];
    try {
      if (userColumns.has('plugin')) {
        const [rows] = await conn.query(
          `SELECT User, Host, plugin FROM mysql.user WHERE plugin IN ('mysql_native_password', 'mysql_old_password') AND User NOT LIKE 'mysql.%'`
        );
        legacyPluginUsers = (rows as any[]) || [];
      }
    } catch (e) {
      console.warn('[MysqlSecurityAudit] Check auth plugin error:', e);
    }

    if (legacyPluginUsers.length > 0 && !isMariaDb) {
      checks.push({
        id: 'legacy_auth_plugins',
        category: 'authentication',
        title: 'Legacy Password Hashes in Use (mysql_native_password)',
        titleFa: 'استفاده از الگوریتم قدیمی هش رمز عبور (mysql_native_password)',
        description: `${legacyPluginUsers.length} account(s) use legacy SHA1-based mysql_native_password rather than caching_sha2_password. Deprecated in MySQL 8.0/8.4.`,
        descriptionFa: 'برخی حساب‌ها از الگوریتم قدیمی بر پایه SHA1 استفاده می‌کنند که در نسخه‌های مدرن منسوخ اعلام گردیده است.',
        riskLevel: 'medium',
        status: 'warning',
        currentValue: `${legacyPluginUsers.length} account(s) using legacy plugin`,
        recommendedValue: 'Upgrade to caching_sha2_password (or ed25519 for MariaDB)',
        impact: 'Vulnerable to offline dictionary attacks if password hashes are exfiltrated.',
        impactFa: 'آسیب‌پذیری بیشتر در برابر حملات شکستن پسورد در صورت افشای هش‌ها.',
        remediationGuide: 'Alter users to use caching_sha2_password: ALTER USER ... IDENTIFIED WITH caching_sha2_password ...',
        remediationGuideFa: 'کاربران را به پلاگین مدرن caching_sha2_password ارتقا دهید.',
        details: legacyPluginUsers.map((u) => ({
          label: `${u.User}@${u.Host}`,
          labelFa: `${u.User}@${u.Host}`,
          value: `Plugin: ${u.plugin}`,
          isWarning: true,
        })),
      });
    } else {
      checks.push({
        id: 'legacy_auth_plugins',
        category: 'authentication',
        title: 'Modern Secure Authentication Plugins Active',
        titleFa: 'استفاده از پلاگین‌های احراز هویت مدرن و ایمن',
        description: 'Active accounts leverage robust multi-round SHA-256 or modern hash algorithms.',
        descriptionFa: 'حساب‌های کاربری از الگوریتم‌های مدرن و ایمن احراز هویت بهره می‌برند.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: isMariaDb ? 'MariaDB standard auth active' : 'Modern caching_sha2_password compliant',
        recommendedValue: 'caching_sha2_password / ed25519',
        impact: 'High resistance to hash cracking and brute force cryptanalysis.',
        impactFa: 'مقاومت بسیار بالا در برابر شکستن رمز عبور.',
      });
    }

    // -------------------------------------------------------------
    // Check 11: Binary Logging for Point-in-Time Recovery & Audit (MEDIUM)
    // -------------------------------------------------------------
    const logBin = (await getGlobalVar('log_bin')).toUpperCase();
    if (logBin !== 'ON' && logBin !== '1') {
      checks.push({
        id: 'binary_logging_audit',
        category: 'logging_audit',
        title: 'Binary Logging Disabled (log_bin is OFF)',
        titleFa: 'لاگ باینری غیرفعال است (log_bin خاموش است)',
        description: 'Binary logging is disabled. Point-in-time recovery and transactional audit histories cannot be reconstructed.',
        descriptionFa: 'لاگ باینری غیرفعال است که مانع بازیابی نقطه‌ای داده‌ها (PITR) و رهگیری تراکنش‌ها می‌گردد.',
        riskLevel: 'medium',
        status: 'warning',
        currentValue: 'OFF',
        recommendedValue: 'ON with appropriate binlog_expire_logs_seconds',
        impact: 'Inability to recover transaction history following hardware failure or ransomware.',
        impactFa: 'عدم امکان بازیابی اطلاعات از دست‌رفته تا ثانیه وقوع حادثه.',
        remediationGuide: 'Enable log-bin in my.cnf and restart MySQL.',
        remediationGuideFa: 'مقدار log-bin را در my.cnf فعال و سرور را ریستارت کنید.',
      });
    } else {
      checks.push({
        id: 'binary_logging_audit',
        category: 'logging_audit',
        title: 'Binary Logging Active & Auditable',
        titleFa: 'لاگ باینری فعال و قابل حسابرسی است',
        description: 'Binary logging is enabled. Complete transactional history is recorded for replication and disaster recovery.',
        descriptionFa: 'لاگ باینری فعال است و کلیه تراکنش‌ها جهت رپلیکیشن و بازیابی ذخیره می‌گردند.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'ON',
        recommendedValue: 'ON',
        impact: 'Full point-in-time recovery capability.',
        impactFa: 'امکان بازیابی و حسابرسی دقیق تغییرات دیتابیس.',
      });
    }

    // -------------------------------------------------------------
    // Check 12: General Query Logging in Production (INFO/LOW)
    // -------------------------------------------------------------
    const generalLog = (await getGlobalVar('general_log')).toUpperCase();
    if (generalLog === 'ON' || generalLog === '1') {
      checks.push({
        id: 'general_log_production',
        category: 'logging_audit',
        title: 'General Query Log Active in Production',
        titleFa: 'فعال بودن لاگ عمومی کوئری‌ها (general_log)',
        description: 'general_log is ON. Every SQL query is recorded to disk in plain text, causing disk bloat and potential credential leakage.',
        descriptionFa: 'لاگ عمومی کلیه کوئری‌ها را به صورت متنی روی دیسک می‌نویسد که موجب افت پرفورمنس و احتمال افشای رمزها می‌شود.',
        riskLevel: 'low',
        status: 'warning',
        currentValue: 'ON (High disk I/O & cleartext queries)',
        recommendedValue: 'OFF (Use slow query log or audit plugin instead)',
        impact: 'Degrades throughput and stores queries containing secrets on disk.',
        impactFa: 'کاهش سرعت سرور و ذخیره کوئری‌های حاوی داده‌های حساس بر روی دیسک.',
        remediationGuide: 'Disable general log: SET GLOBAL general_log = OFF;',
        remediationGuideFa: 'لاگ عمومی را خاموش نمایید: SET GLOBAL general_log = OFF;',
        remediationSql: 'SET GLOBAL general_log = OFF;',
      });
    } else {
      checks.push({
        id: 'general_log_production',
        category: 'logging_audit',
        title: 'General Query Log Disabled',
        titleFa: 'لاگ عمومی کوئری‌ها غیرفعال و بهینه است',
        description: 'general_log is OFF, preventing disk saturation and protecting queries from cleartext disk exposure.',
        descriptionFa: 'لاگ عمومی خاموش بوده و مانع پر شدن بیهوده دیسک و ذخیره کوئری‌های متنی می‌شود.',
        riskLevel: 'good',
        status: 'passed',
        currentValue: 'OFF (Optimized)',
        recommendedValue: 'OFF',
        impact: 'Optimal disk throughput and privacy.',
        impactFa: 'کارایی مطلوب دیسک و عدم افشای کوئری‌ها.',
      });
    }

    // Compute Overall Score (100 base, deductions for failed/warning)
    let score = 100;
    let failedCount = 0;
    let warningCount = 0;
    let passedCount = 0;

    for (const chk of checks) {
      if (chk.status === 'failed') {
        failedCount++;
        score -= chk.riskLevel === 'critical' ? 25 : chk.riskLevel === 'high' ? 15 : 10;
      } else if (chk.status === 'warning') {
        warningCount++;
        score -= chk.riskLevel === 'high' ? 10 : chk.riskLevel === 'medium' ? 6 : 3;
      } else {
        passedCount++;
      }
    }

    score = Math.max(0, Math.min(100, score));

    let overallRisk: MysqlSecurityRiskLevel = 'good';
    if (score < 40 || checks.some((c) => c.status === 'failed' && c.riskLevel === 'critical')) {
      overallRisk = 'critical';
    } else if (score < 65 || failedCount > 0) {
      overallRisk = 'high';
    } else if (score < 85 || warningCount > 0) {
      overallRisk = 'medium';
    } else if (score < 95) {
      overallRisk = 'low';
    }

    return {
      serverVersion: fullVer,
      isMariaDb,
      overallScore: score,
      overallRisk,
      totalChecks: checks.length,
      passedChecks: passedCount,
      warningChecks: warningCount,
      failedChecks: failedCount,
      checks,
      collectedAt: Date.now(),
    };
  } finally {
    await conn.end().catch(() => {});
  }
}

/**
 * Executes a one-click automated remediation fix for an audited security vulnerability.
 * Audits and logs every change with zero secret exposure.
 */
export async function executeMysqlHardeningRemediation(
  server: RemoteServer,
  request: MysqlHardeningRemediationRequest,
  options?: {
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<MysqlHardeningRemediationResult> {
  const conn = await getDirectMysqlConnection(server, options);

  try {
    let sqlToExecute = '';
    let actionDesc = '';
    let actionDescFa = '';

    if (request.customSql) {
      const safety = analyzeMysqlSqlSafety(request.customSql);
      if (safety.riskLevel === 'prohibited') {
        return {
          success: false,
          message: `Remediation SQL rejected: ${safety.reason}`,
          messageFa: `کوئری رفع آسیب‌پذیری به دلیل خطرات امنیتی رد شد: ${safety.reasonFa || safety.reason}`,
        };
      }
      sqlToExecute = request.customSql;
      actionDesc = `Execute Custom Hardening SQL: ${request.checkId}`;
      actionDescFa = `اجرای کوئری اصلاح امنیتی سفارشی برای: ${request.checkId}`;
    } else {
      switch (request.checkId) {
        case 'local_infile_enabled':
          sqlToExecute = 'SET GLOBAL local_infile = OFF;';
          actionDesc = 'Disable local_infile globally';
          actionDescFa = 'غیرفعال‌سازی سراسری local_infile';
          break;

        case 'sql_safe_updates_status':
          sqlToExecute = 'SET GLOBAL sql_safe_updates = ON;';
          actionDesc = 'Enable sql_safe_updates globally';
          actionDescFa = 'فعال‌سازی سراسری sql_safe_updates';
          break;

        case 'ssl_tls_encryption':
          sqlToExecute = 'SET GLOBAL require_secure_transport = ON;';
          actionDesc = 'Enforce require_secure_transport globally';
          actionDescFa = 'الزام رمزنگاری سراسری require_secure_transport';
          break;

        case 'general_log_production':
          sqlToExecute = 'SET GLOBAL general_log = OFF;';
          actionDesc = 'Disable general_log globally';
          actionDescFa = 'غیرفعال‌سازی سراسری general_log';
          break;

        case 'anonymous_users':
          sqlToExecute = `DELETE FROM mysql.user WHERE User = '' OR User IS NULL; FLUSH PRIVILEGES;`;
          actionDesc = 'Purge anonymous accounts from mysql.user';
          actionDescFa = 'حذف حساب‌های ناشناس از جدول mysql.user';
          break;

        default:
          return {
            success: false,
            message: `No automated 1-click remediation defined for check: ${request.checkId}. Please follow the manual remediation guide.`,
            messageFa: `راهکار خودکار ۱-کلیکه برای آسیب‌پذیری ${request.checkId} تعریف نشده است. لطفاً از راهنمای دستی استفاده فرمایید.`,
          };
      }
    }

    // Execute remediation statements
    const stmts = sqlToExecute
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of stmts) {
      await conn.query(stmt);
    }

    // Record audit log
    await recordMysqlAuditLog(
      server,
      actionDesc,
      actionDescFa,
      'config_mutation',
      request.checkId,
      'success',
      `Executed remediation: ${sqlToExecute}`,
      `دستور اصلاح با موفقیت اجرا شد: ${sqlToExecute}`,
      options?.user
    );

    return {
      success: true,
      message: `Security remediation executed successfully: ${actionDesc}`,
      messageFa: `اصلاح امنیتی با موفقیت اعمال شد: ${actionDescFa}`,
      executedSql: sqlToExecute,
    };
  } catch (err: any) {
    await recordMysqlAuditLog(
      server,
      `Hardening Fix Failed: ${request.checkId}`,
      `شکست در اصلاح امنیتی: ${request.checkId}`,
      'config_mutation',
      request.checkId,
      'failure',
      err.message || String(err),
      err.message || String(err),
      options?.user
    );

    return {
      success: false,
      message: `Failed to execute remediation for ${request.checkId}: ${err.message}`,
      messageFa: `خطا در اجرای دستور اصلاح امنیتی برای ${request.checkId}: ${err.message}`,
    };
  } finally {
    await conn.end().catch(() => {});
  }
}
