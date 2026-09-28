import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { RemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';
import { analyzePostgresSqlSafety, PostgresSqlQuerySafetyReport } from './postgresSqlSafety';
import { runAdaptiveSshCommand } from './linuxServerMonitor';
import {
  PostgresHbaRule,
  PostgresHbaType,
  PostgresHbaBackupItem,
  PostgresHbaFileMetadata,
  PostgresHbaConfigData,
  PostgresHbaSaveRequest,
  PostgresHbaSaveResult,
  PostgresHbaRestoreRequest,
  PostgresLockItem,
  PostgresBlockingNode,
  PostgresDeadlockSummary,
  PostgresLocksOverview,
  PostgresSessionTerminateRequest,
  PostgresSessionTerminateResult,
} from '../src/types';

export { analyzePostgresSqlSafety } from './postgresSqlSafety';
export type { PostgresSqlQuerySafetyReport } from './postgresSqlSafety';
export type PostgresConnectionStatus =
  | 'connected'
  | 'connection_failed'
  | 'authentication_failed'
  | 'connection_refused'
  | 'timeout'
  | 'permission_denied'
  | 'database_unavailable'
  | 'unknown_error';

export interface PostgresConnectionTestResult {
  success: boolean;
  status: PostgresConnectionStatus;
  message: string;
  messageFa?: string;
  serverAddress: string;
  port: number;
  username: string;
  database?: string;
  version?: string;
  inRecovery?: boolean;
  latencyMs?: number;
  testedAt: string;
  errorDetail?: string;
}

export interface PostgresEngineOverview {
  serverAddress: string;
  port: number;
  connectedUser: string;
  connectedDatabase: string;
  version: string;
  versionShort: string;
  uptimeSeconds: number;
  uptimePretty: string;
  startTime: string;
  dataDirectory: string;
  walLevel: string;
  inRecovery: boolean;
  clusterRole: 'primary' | 'standby';
  maxConnections: number;
  sharedBuffers: string;
  workMem: string;
  connections: {
    total: number;
    active: number;
    idle: number;
    idleInTransaction: number;
    waiting: number;
    usedPercentage: number;
  };
  telemetry: {
    totalDatabases: number;
    totalCommits: number;
    totalRollbacks: number;
    totalBlocksRead: number;
    totalBlocksHit: number;
    cacheHitRatio: number;
  };
  fetchedAt: string;
}

export interface PostgresDatabaseItem {
  oid: string;
  name: string;
  owner: string;
  encoding: string;
  collation: string;
  ctype: string;
  isTemplate: boolean;
  allowConnections: boolean;
  connectionLimit: number;
  tablespace: string;
  sizeBytes: number | null;
  sizePretty: string;
  activeConnections: number;
}

export interface PostgresRoleItem {
  rolname: string;
  isSuperuser: boolean;
  canLogin: boolean;
  createDb: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  connectionLimit: number;
  validUntil: string | null;
  memberOf?: string[];
  members?: string[];
  comment?: string | null;
}

export interface PostgresTableItem {
  name: string;
  schema: string;
  owner: string;
  estimatedRows: number;
  sizePretty: string;
  sizeBytes: number | null;
  tableSizePretty?: string;
  indexSizePretty?: string;
  toastSizePretty?: string;
  columnCount?: number;
  hasPrimaryKey?: boolean;
  isPartitioned?: boolean;
  hasIndexes: boolean;
  hasTriggers: boolean;
  persistence: 'permanent' | 'temporary' | 'unlogged';
}

export interface PostgresViewItem {
  name: string;
  schema: string;
  owner: string;
  isMaterialized: boolean;
  sizePretty?: string;
  definition?: string;
  columnCount?: number;
  checkOption?: string;
  isUpdatable?: boolean;
}

export interface PostgresRoutineItem {
  name: string;
  schema: string;
  owner: string;
  type: 'function' | 'procedure';
  language: string;
  returnType: string;
  argumentTypes: string;
  isAggregate: boolean;
  volatility?: 'IMMUTABLE' | 'STABLE' | 'VOLATILE';
  isSecurityDefiner?: boolean;
  sourceCode?: string;
}

export interface PostgresSequenceItem {
  name: string;
  schema: string;
  owner: string;
  dataType?: string;
  startValue?: string;
  minValue?: string;
  maxValue?: string;
  increment?: string;
  isCycled?: boolean;
  lastValue?: string;
  cacheSize?: string;
}

export interface PostgresTypeItem {
  name: string;
  schema: string;
  owner: string;
  kind: 'enum' | 'composite' | 'domain' | 'base' | 'range' | 'other';
  enumLabels?: string[];
  baseType?: string;
  description?: string;
}

export interface PostgresSchemaExtensionItem {
  name: string;
  version: string;
  schema: string;
  description: string;
  relocatable: boolean;
}

// ==========================================
// Phase 5: Table Structure & Metadata Types
// ==========================================

export interface PostgresColumnStructure {
  attnum: number;
  name: string;
  dataType: string;
  formattedType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isIdentity: boolean;
  identityGeneration?: string;
  isGenerated: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  hasCheckConstraint: boolean;
  comment?: string;
  collation?: string;
}

export interface PostgresPrimaryKeyConstraint {
  name: string;
  columns: string[];
  definition?: string;
}

export interface PostgresForeignKeyConstraint {
  name: string;
  columns: string[];
  foreignSchema: string;
  foreignTable: string;
  foreignColumns: string[];
  onUpdate: string;
  onDelete: string;
  matchType?: string;
  definition?: string;
}

export interface PostgresUniqueConstraint {
  name: string;
  columns: string[];
  definition?: string;
}

export interface PostgresCheckConstraint {
  name: string;
  columns?: string[];
  clause: string;
  noInherit?: boolean;
  isValidated?: boolean;
}

export interface PostgresIndexDetail {
  name: string;
  definition: string;
  isPrimary: boolean;
  isUnique: boolean;
  isValid: boolean;
  accessMethod: string;
  columns: string[];
  sizePretty: string;
  sizeBytes: number | null;
  scansCount: number;
  tuplesRead: number;
  tuplesFetched: number;
  comment?: string;
}

export interface PostgresTableMetadataStats {
  schemaName: string;
  tableName: string;
  owner: string;
  persistence: 'permanent' | 'temporary' | 'unlogged';
  isPartitioned: boolean;
  partitionKey?: string;
  tablespace?: string;
  estimatedRows: number;
  totalSizePretty: string;
  totalSizeBytes: number;
  tableSizePretty: string;
  tableSizeBytes: number;
  indexSizePretty: string;
  indexSizeBytes: number;
  toastSizePretty: string;
  toastSizeBytes: number;
  columnsCount: number;
  primaryKeyCount: number;
  foreignKeyCount: number;
  uniqueConstraintCount: number;
  checkConstraintCount: number;
  indexCount: number;
  seqScans: number;
  seqTuplesRead: number;
  idxScans: number;
  idxTuplesFetched: number;
  nTuplesIns: number;
  nTuplesUpd: number;
  nTuplesDel: number;
  nTuplesHotUpd: number;
  nLiveTuples: number;
  nDeadTuples: number;
  lastVacuum?: string;
  lastAutoVacuum?: string;
  lastAnalyze?: string;
  lastAutoAnalyze?: string;
  comment?: string;
}

export interface PostgresTableStructure {
  databaseName: string;
  schemaName: string;
  tableName: string;
  metadata: PostgresTableMetadataStats;
  columns: PostgresColumnStructure[];
  primaryKey: PostgresPrimaryKeyConstraint | null;
  foreignKeys: PostgresForeignKeyConstraint[];
  uniqueConstraints: PostgresUniqueConstraint[];
  checkConstraints: PostgresCheckConstraint[];
  indexes: PostgresIndexDetail[];
  fetchedAt: string;
}

// ==========================================
// Phase 6: Table Data Viewer Types
// ==========================================

export type PostgresFilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isNull'
  | 'isNotNull';

export interface PostgresTableDataFilter {
  column: string;
  operator: PostgresFilterOperator;
  value?: string;
}

export interface PostgresTableDataRequest {
  database: string;
  schema: string;
  table: string;
  page?: number;
  pageSize?: number;
  sortColumn?: string;
  sortDirection?: 'ASC' | 'DESC';
  search?: string;
  filters?: PostgresTableDataFilter[];
  countExact?: boolean;
}

export interface PostgresTableDataColumnInfo {
  name: string;
  dataType: string;
  formattedType: string;
  isPrimaryKey: boolean;
}

export interface PostgresTableDataResult {
  databaseName: string;
  schemaName: string;
  tableName: string;
  columns: PostgresTableDataColumnInfo[];
  rows: Record<string, any>[];
  totalRows: number;
  isExactCount: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  executionTimeMs: number;
  fetchedAt: string;
}

export interface PostgresSchemaObjects {
  name: string;
  owner: string;
  sizePretty?: string;
  description?: string;
  tables: PostgresTableItem[];
  views: PostgresViewItem[];
  materializedViews: PostgresViewItem[];
  functions: PostgresRoutineItem[];
  procedures: PostgresRoutineItem[];
  sequences: PostgresSequenceItem[];
  types: PostgresTypeItem[];
}

export interface PostgresDatabaseTree {
  databaseName: string;
  schemas: PostgresSchemaObjects[];
  extensions: PostgresSchemaExtensionItem[];
  totalTables: number;
  totalViews: number;
  totalMaterializedViews: number;
  totalFunctions: number;
  totalProcedures: number;
  totalSequences: number;
  totalTypes: number;
  totalExtensions: number;
  fetchedAt: string;
}

function formatUptimePretty(seconds: number): string {
  if (seconds <= 0) return '0m';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function createPostgresClient(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
) {
  const targetHost = (server.ip || server.hostname || '').trim();
  const targetPort = Number(options?.port || server.postgres_port) || 5432;
  const targetUser = (options?.user || server.postgres_user || 'postgres').trim();
  const targetDatabase = (options?.database || server.postgres_database || targetUser || 'postgres').trim();

  let plainPassword = '';
  if (options?.password !== undefined && options.password.trim() !== '') {
    plainPassword = options.password.trim();
  } else if (server.postgres_password) {
    plainPassword = decryptServerSecret(server.postgres_password);
  }

  const client = new Client({
    host: targetHost,
    port: targetPort,
    user: targetUser,
    password: plainPassword,
    database: targetDatabase,
    connectionTimeoutMillis: 5000,
    statement_timeout: 7000,
    ssl: false,
  });

  return { client, targetHost, targetPort, targetUser, targetDatabase };
}

/**
 * Safely tests direct TCP/PostgreSQL connection to a remote Linux server host.
 * Uses authentic pg.Client without executing arbitrary remote shell or psql commands.
 * Never leaks raw passwords or credentials in responses or error logs.
 */
export async function testPostgresConnection(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<PostgresConnectionTestResult> {
  const { client, targetHost, targetPort, targetUser, targetDatabase } = createPostgresClient(server, options);
  const testedAt = new Date().toISOString();

  if (!targetHost) {
    return {
      success: false,
      status: 'connection_failed',
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس IP یا هاست سرور مشخص نشده است.',
      serverAddress: '',
      port: targetPort,
      username: targetUser,
      database: targetDatabase,
      testedAt,
    };
  }

  const startTime = Date.now();

  try {
    await client.connect();

    // Query core server metadata
    const queryRes = await client.query(`
      SELECT 
        version() as version, 
        current_database() as database, 
        current_user as user,
        pg_is_in_recovery() as in_recovery
    `);

    const latencyMs = Date.now() - startTime;
    const row = queryRes.rows?.[0] || {};

    await client.end();

    return {
      success: true,
      status: 'connected',
      message: `Successfully connected to PostgreSQL on ${targetHost}:${targetPort}`,
      messageFa: `ارتباط با موفقیت با پایگاه داده PostgreSQL در ${targetHost}:${targetPort} برقرار شد`,
      serverAddress: targetHost,
      port: targetPort,
      username: targetUser,
      database: row.database || targetDatabase,
      version: row.version || 'PostgreSQL',
      inRecovery: Boolean(row.in_recovery),
      latencyMs,
      testedAt,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    const latencyMs = Date.now() - startTime;
    const code = err.code || '';
    const errMessage = (err.message || '').toLowerCase();

    // 1. Authentication failure
    if (code === '28P01' || errMessage.includes('password authentication failed')) {
      return {
        success: false,
        status: 'authentication_failed',
        message: `Authentication failed for user "${targetUser}". Verify PostgreSQL username and password.`,
        messageFa: `احراز هویت ناموفق بود: رمز عبور یا نام کاربری "${targetUser}" در PostgreSQL اشتباه است.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Invalid password or user credentials',
      };
    }

    // 2. Connection refused (service not listening or firewall drop)
    if (code === 'ECONNREFUSED' || errMessage.includes('connection refused')) {
      return {
        success: false,
        status: 'connection_refused',
        message: `Connection refused on ${targetHost}:${targetPort}. PostgreSQL service may be stopped or not listening on this interface.`,
        messageFa: `ارتباط رد شد (${targetHost}:${targetPort}). سرویس PostgreSQL ممکن است متوقف باشد یا پورت برای اتصالات ریموت باز نباشد.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Connection refused by remote host (ECONNREFUSED)',
      };
    }

    // 3. Timeout
    if (code === 'ETIMEDOUT' || errMessage.includes('timeout') || latencyMs >= 5000) {
      return {
        success: false,
        status: 'timeout',
        message: `Connection timed out connecting to ${targetHost}:${targetPort}. Verify host firewall and security groups.`,
        messageFa: `مهلت زمان ارتباط با ${targetHost}:${targetPort} پایان یافت (Timeout). فایروال سرور و دسترسی به پورت ۵۴۳۲ را بررسی کنید.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Connection timeout after 5000ms',
      };
    }

    // 4. Database does not exist
    if (code === '3D000' || (errMessage.includes('database') && errMessage.includes('does not exist'))) {
      return {
        success: false,
        status: 'database_unavailable',
        message: `Database "${targetDatabase}" does not exist on remote PostgreSQL server.`,
        messageFa: `پایگاه داده "${targetDatabase}" روی سرور PostgreSQL مقصد یافت نشد.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: `Database "${targetDatabase}" does not exist`,
      };
    }

    // 5. Permission denied
    if (code === '28000' || code === '42501' || errMessage.includes('permission denied')) {
      return {
        success: false,
        status: 'permission_denied',
        message: `Permission denied for user "${targetUser}" accessing database "${targetDatabase}".`,
        messageFa: `دسترسی مجاز نیست: کاربر "${targetUser}" اجازه دسترسی به دیتابیس "${targetDatabase}" را ندارد.`,
        serverAddress: targetHost,
        port: targetPort,
        username: targetUser,
        database: targetDatabase,
        latencyMs,
        testedAt,
        errorDetail: 'Permission denied (28000 / 42501)',
      };
    }

    // 6. Generic failure with sanitized message
    return {
      success: false,
      status: 'connection_failed',
      message: `Failed to connect to PostgreSQL: ${err.message || 'Network error'}`,
      messageFa: `خطا در اتصال به پایگاه داده: ${err.message || 'خطای شبکه'}`,
      serverAddress: targetHost,
      port: targetPort,
      username: targetUser,
      database: targetDatabase,
      latencyMs,
      testedAt,
      errorDetail: err.message,
    };
  }
}

/**
 * Phase 2: Discovers live PostgreSQL engine overview, uptime, settings,
 * connection pool load, and cache hit performance metrics.
 */
export async function getPostgresOverview(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<{ success: boolean; data?: PostgresEngineOverview; error?: string; errorFa?: string }> {
  const { client, targetHost, targetPort, targetUser, targetDatabase } = createPostgresClient(server, options);

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  try {
    await client.connect();

    // 1. Basic server information and role
    const basicRes = await client.query(`
      SELECT 
        version() as version, 
        current_setting('server_version') as server_version,
        pg_is_in_recovery() as in_recovery,
        current_database() as database,
        current_user as user
    `);
    const basicRow = basicRes.rows?.[0] || {};

    // 2. Critical cluster configurations & directories
    const settingsRes = await client.query(`
      SELECT 
        current_setting('data_directory') as data_directory,
        current_setting('wal_level') as wal_level,
        current_setting('max_connections')::integer as max_connections,
        current_setting('shared_buffers') as shared_buffers,
        current_setting('work_mem') as work_mem
    `);
    const settingsRow = settingsRes.rows?.[0] || {};

    // 3. Engine uptime and postmaster start time
    const uptimeRes = await client.query(`
      SELECT 
        pg_postmaster_start_time() as start_time,
        COALESCE(extract(epoch from (now() - pg_postmaster_start_time()))::integer, 0) as uptime_seconds
    `);
    const uptimeRow = uptimeRes.rows?.[0] || {};

    // 4. Connection pool state and activities
    const activityRes = await client.query(`
      SELECT 
        count(*)::integer as total,
        count(CASE WHEN state = 'active' THEN 1 END)::integer as active,
        count(CASE WHEN state = 'idle' THEN 1 END)::integer as idle,
        count(CASE WHEN state = 'idle in transaction' THEN 1 END)::integer as idle_in_transaction,
        count(CASE WHEN wait_event_type IS NOT NULL AND state = 'active' THEN 1 END)::integer as waiting
      FROM pg_stat_activity
    `);
    const activityRow = activityRes.rows?.[0] || {};

    // 5. Cluster telemetry (commits, rollbacks, cache hit ratio)
    const telemetryRes = await client.query(`
      SELECT 
        COALESCE(sum(xact_commit), 0)::bigint as total_commits,
        COALESCE(sum(xact_rollback), 0)::bigint as total_rollbacks,
        COALESCE(sum(blks_read), 0)::bigint as total_blocks_read,
        COALESCE(sum(blks_hit), 0)::bigint as total_blocks_hit,
        round(
          CASE 
            WHEN (COALESCE(sum(blks_hit), 0) + COALESCE(sum(blks_read), 0)) = 0 THEN 100.0
            ELSE (sum(blks_hit)::numeric / (sum(blks_hit) + sum(blks_read)) * 100.0)
          END, 2
        )::float as cache_hit_ratio
      FROM pg_stat_database
    `);
    const telemetryRow = telemetryRes.rows?.[0] || {};

    // 6. Non-template database count
    const dbCountRes = await client.query(`
      SELECT count(*)::integer as total_databases FROM pg_database WHERE datistemplate = false
    `);
    const totalDatabases = Number(dbCountRes.rows?.[0]?.total_databases) || 0;

    await client.end();

    const maxConn = Number(settingsRow.max_connections) || 100;
    const totalConn = Number(activityRow.total) || 0;
    const usedPercentage = maxConn > 0 ? Number(((totalConn / maxConn) * 100).toFixed(1)) : 0;
    const inRecovery = Boolean(basicRow.in_recovery);
    const uptimeSeconds = Number(uptimeRow.uptime_seconds) || 0;

    const overview: PostgresEngineOverview = {
      serverAddress: targetHost,
      port: targetPort,
      connectedUser: basicRow.user || targetUser,
      connectedDatabase: basicRow.database || targetDatabase,
      version: basicRow.version || 'PostgreSQL',
      versionShort: basicRow.server_version || 'PostgreSQL',
      uptimeSeconds,
      uptimePretty: formatUptimePretty(uptimeSeconds),
      startTime: uptimeRow.start_time ? new Date(uptimeRow.start_time).toISOString() : new Date().toISOString(),
      dataDirectory: settingsRow.data_directory || '/var/lib/postgresql',
      walLevel: settingsRow.wal_level || 'replica',
      inRecovery,
      clusterRole: inRecovery ? 'standby' : 'primary',
      maxConnections: maxConn,
      sharedBuffers: settingsRow.shared_buffers || '128MB',
      workMem: settingsRow.work_mem || '4MB',
      connections: {
        total: totalConn,
        active: Number(activityRow.active) || 0,
        idle: Number(activityRow.idle) || 0,
        idleInTransaction: Number(activityRow.idle_in_transaction) || 0,
        waiting: Number(activityRow.waiting) || 0,
        usedPercentage,
      },
      telemetry: {
        totalDatabases,
        totalCommits: Number(telemetryRow.total_commits) || 0,
        totalRollbacks: Number(telemetryRow.total_rollbacks) || 0,
        totalBlocksRead: Number(telemetryRow.total_blocks_read) || 0,
        totalBlocksHit: Number(telemetryRow.total_blocks_hit) || 0,
        cacheHitRatio: Number(telemetryRow.cache_hit_ratio) || 100,
      },
      fetchedAt: new Date().toISOString(),
    };

    return { success: true, data: overview };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || 'Failed to retrieve PostgreSQL engine telemetry',
      errorFa: `خطا در دریافت تله‌متری موتور PostgreSQL: ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * Phase 2: Enumerates the database catalog from pg_catalog.pg_database,
 * calculating accurate disk sizes, collations, and active connection distribution.
 */
export async function getPostgresDatabases(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
    includeTemplates?: boolean;
  }
): Promise<{ success: boolean; databases?: PostgresDatabaseItem[]; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, options);

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  const includeTemplates = Boolean(options?.includeTemplates);

  try {
    await client.connect();

    const query = `
      SELECT 
        d.oid::text as oid,
        d.datname as name,
        pg_catalog.pg_get_userbyid(d.datdba) as owner,
        pg_catalog.pg_encoding_to_char(d.encoding) as encoding,
        d.datcollate as collation,
        d.datctype as ctype,
        d.datistemplate as is_template,
        d.datallowconn as allow_connections,
        d.datconnlimit as connection_limit,
        COALESCE(t.spcname, 'pg_default') as tablespace,
        CASE 
          WHEN has_database_privilege(d.datname, 'CONNECT') THEN pg_catalog.pg_database_size(d.datname)
          ELSE NULL
        END::bigint as size_bytes,
        CASE 
          WHEN has_database_privilege(d.datname, 'CONNECT') THEN pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname))
          ELSE 'N/A'
        END as size_pretty,
        COALESCE(act.active_connections, 0)::integer as active_connections
      FROM pg_catalog.pg_database d
      LEFT JOIN pg_catalog.pg_tablespace t ON d.dattablespace = t.oid
      LEFT JOIN (
        SELECT datname, count(*)::integer as active_connections 
        FROM pg_stat_activity 
        GROUP BY datname
      ) act ON d.datname = act.datname
      WHERE ($1::boolean = true OR d.datistemplate = false)
      ORDER BY d.datname ASC;
    `;

    const res = await client.query(query, [includeTemplates]);
    await client.end();

    const databases: PostgresDatabaseItem[] = (res.rows || []).map((row: any) => ({
      oid: String(row.oid),
      name: String(row.name),
      owner: String(row.owner || 'postgres'),
      encoding: String(row.encoding || 'UTF8'),
      collation: String(row.collation || ''),
      ctype: String(row.ctype || ''),
      isTemplate: Boolean(row.is_template),
      allowConnections: Boolean(row.allow_connections),
      connectionLimit: Number(row.connection_limit),
      tablespace: String(row.tablespace || 'pg_default'),
      sizeBytes: row.size_bytes !== null && row.size_bytes !== undefined ? Number(row.size_bytes) : null,
      sizePretty: String(row.size_pretty || '0 bytes'),
      activeConnections: Number(row.active_connections) || 0,
    }));

    return { success: true, databases };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || 'Failed to enumerate database catalog',
      errorFa: `خطا در دریافت فهرست پایگاه‌های داده: ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * Phase 3: Enumerates server-level roles and users from pg_catalog.pg_roles.
 */
export async function getPostgresRoles(
  server: RemoteServer,
  options?: {
    port?: number;
    user?: string;
    database?: string;
    password?: string;
  }
): Promise<{ success: boolean; roles?: PostgresRoleItem[]; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, options);

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  try {
    await client.connect();

    let res;
    try {
      res = await client.query(`
        SELECT 
          r.rolname,
          r.rolsuper as is_superuser,
          r.rolcanlogin as can_login,
          r.rolcreatedb as create_db,
          r.rolcreaterole as create_role,
          r.rolreplication as replication,
          COALESCE(r.rolbypassrls, false) as bypass_rls,
          r.rolconnlimit as connection_limit,
          r.rolvaliduntil::text as valid_until,
          d.description as comment
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_shdescription d ON d.objoid = r.oid AND d.classoid = 'pg_authid'::regclass
        ORDER BY r.rolsuper DESC, r.rolcanlogin DESC, r.rolname ASC;
      `);
    } catch {
      // Fallback for legacy PostgreSQL without rolbypassrls
      res = await client.query(`
        SELECT 
          r.rolname,
          r.rolsuper as is_superuser,
          r.rolcanlogin as can_login,
          r.rolcreatedb as create_db,
          r.rolcreaterole as create_role,
          r.rolreplication as replication,
          false as bypass_rls,
          r.rolconnlimit as connection_limit,
          r.rolvaliduntil::text as valid_until,
          d.description as comment
        FROM pg_catalog.pg_roles r
        LEFT JOIN pg_catalog.pg_shdescription d ON d.objoid = r.oid AND d.classoid = 'pg_authid'::regclass
        ORDER BY r.rolsuper DESC, r.rolcanlogin DESC, r.rolname ASC;
      `);
    }

    // Retrieve role memberships
    let membershipMap: Record<string, { memberOf: string[]; members: string[] }> = {};
    try {
      const memRes = await client.query(`
        SELECT 
          r_group.rolname as group_role,
          r_member.rolname as member_role,
          m.admin_option
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles r_group ON m.roleid = r_group.oid
        JOIN pg_catalog.pg_roles r_member ON m.member = r_member.oid;
      `);

      for (const row of memRes.rows || []) {
        const groupRole = String(row.group_role);
        const memberRole = String(row.member_role);

        if (!membershipMap[memberRole]) {
          membershipMap[memberRole] = { memberOf: [], members: [] };
        }
        if (!membershipMap[groupRole]) {
          membershipMap[groupRole] = { memberOf: [], members: [] };
        }

        membershipMap[memberRole].memberOf.push(groupRole);
        membershipMap[groupRole].members.push(memberRole);
      }
    } catch {
      // Ignore if auth_members not accessible
    }

    await client.end();

    const roles: PostgresRoleItem[] = (res.rows || []).map((row: any) => {
      const name = String(row.rolname);
      const mem = membershipMap[name] || { memberOf: [], members: [] };
      return {
        rolname: name,
        isSuperuser: Boolean(row.is_superuser),
        canLogin: Boolean(row.can_login),
        createDb: Boolean(row.create_db),
        createRole: Boolean(row.create_role),
        replication: Boolean(row.replication),
        bypassRls: Boolean(row.bypass_rls),
        connectionLimit: Number(row.connection_limit),
        validUntil: row.valid_until ? String(row.valid_until) : null,
        comment: row.comment ? String(row.comment) : null,
        memberOf: mem.memberOf,
        members: mem.members,
      };
    });

    return { success: true, roles };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || 'Failed to enumerate PostgreSQL roles',
      errorFa: `خطا در دریافت فهرست نقش‌ها و کاربران PostgreSQL: ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * Phase 3: Lazy-loads structural objects for a specific PostgreSQL database:
 * Schemas, Tables, Views, Materialized Views, Functions, Procedures, Sequences, and Extensions.
 */
export async function getPostgresDatabaseTree(
  server: RemoteServer,
  databaseName: string,
  options?: {
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; tree?: PostgresDatabaseTree; error?: string; errorFa?: string }> {
  if (!databaseName || !databaseName.trim()) {
    return {
      success: false,
      error: 'Target database name is required for object exploration',
      errorFa: 'نام پایگاه داده هدف برای کاوش ساختار اجباری است',
    };
  }

  const { client, targetHost } = createPostgresClient(server, {
    ...options,
    database: databaseName.trim(),
  });

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  try {
    await client.connect();

    // 1. Schemas with storage size and comments
    const schemasRes = await client.query(`
      SELECT 
        n.nspname as schema_name,
        pg_catalog.pg_get_userbyid(n.nspowner) as schema_owner,
        COALESCE(pg_catalog.pg_size_pretty(SUM(pg_catalog.pg_total_relation_size(c.oid))), '0 bytes') as size_pretty,
        COALESCE(pg_catalog.obj_description(n.oid, 'pg_namespace'), '') as description
      FROM pg_catalog.pg_namespace n
      LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid
      WHERE n.nspname !~ '^pg_toast' 
        AND n.nspname !~ '^pg_temp'
      GROUP BY n.oid, n.nspname, n.nspowner
      ORDER BY 
        CASE WHEN n.nspname = 'public' THEN 0 
             WHEN n.nspname = 'information_schema' THEN 2 
             WHEN n.nspname LIKE 'pg_%' THEN 3 
             ELSE 1 END, 
        n.nspname;
    `);

    // 2. Tables with detailed columns, size breakdown, PK, partitions
    const tablesRes = await client.query(`
      SELECT 
        c.relname as table_name,
        n.nspname as schema_name,
        pg_catalog.pg_get_userbyid(c.relowner) as table_owner,
        GREATEST(c.reltuples::bigint, 0) as estimated_rows,
        pg_catalog.pg_total_relation_size(c.oid) as size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as size_pretty,
        pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(c.oid)) as table_size_pretty,
        pg_catalog.pg_size_pretty(pg_catalog.pg_indexes_size(c.oid)) as index_size_pretty,
        pg_catalog.pg_size_pretty(GREATEST(pg_catalog.pg_total_relation_size(c.oid) - pg_catalog.pg_relation_size(c.oid) - pg_catalog.pg_indexes_size(c.oid), 0)) as toast_size_pretty,
        (SELECT count(*)::int FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) as column_count,
        EXISTS(SELECT 1 FROM pg_catalog.pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'p') as has_primary_key,
        (c.relkind = 'p') as is_partitioned,
        c.relhasindex as has_indexes,
        c.relhastriggers as has_triggers,
        CASE c.relpersistence 
          WHEN 't' THEN 'temporary'
          WHEN 'u' THEN 'unlogged'
          ELSE 'permanent'
        END as persistence
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p')
        AND n.nspname !~ '^pg_toast' 
        AND n.nspname !~ '^pg_temp'
      ORDER BY n.nspname, c.relname;
    `);

    // 3. Views & Materialized Views with definition query & column counts
    const viewsRes = await client.query(`
      SELECT 
        c.relname as view_name,
        n.nspname as schema_name,
        pg_catalog.pg_get_userbyid(c.relowner) as view_owner,
        (c.relkind = 'm') as is_materialized,
        pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as size_pretty,
        pg_catalog.pg_get_viewdef(c.oid, true) as definition,
        (SELECT count(*)::int FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) as column_count
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('v', 'm')
        AND n.nspname !~ '^pg_toast' 
        AND n.nspname !~ '^pg_temp'
      ORDER BY n.nspname, c.relname;
    `);

    // 4. Routines (Functions & Procedures) with volatility, security & source code
    let routinesRes;
    try {
      routinesRes = await client.query(`
        SELECT 
          p.proname as routine_name,
          n.nspname as schema_name,
          pg_catalog.pg_get_userbyid(p.proowner) as routine_owner,
          CASE WHEN p.prokind = 'p' THEN 'procedure' ELSE 'function' END as routine_type,
          COALESCE(l.lanname, 'sql') as language,
          pg_catalog.format_type(p.prorettype, NULL) as return_type,
          COALESCE(pg_catalog.pg_get_function_arguments(p.oid), '') as argument_types,
          (p.prokind = 'a') as is_aggregate,
          CASE p.provolatile 
            WHEN 'i' THEN 'IMMUTABLE' 
            WHEN 's' THEN 'STABLE' 
            WHEN 'v' THEN 'VOLATILE' 
            ELSE 'VOLATILE' 
          END as volatility,
          p.prosecdef as is_security_definer,
          p.prosrc as source_code
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname !~ '^pg_toast' 
          AND n.nspname !~ '^pg_temp'
        ORDER BY n.nspname, p.proname;
      `);
    } catch {
      routinesRes = await client.query(`
        SELECT 
          p.proname as routine_name,
          n.nspname as schema_name,
          pg_catalog.pg_get_userbyid(p.proowner) as routine_owner,
          'function' as routine_type,
          COALESCE(l.lanname, 'sql') as language,
          pg_catalog.format_type(p.prorettype, NULL) as return_type,
          COALESCE(pg_catalog.pg_get_function_arguments(p.oid), '') as argument_types,
          p.proisagg as is_aggregate,
          CASE p.provolatile 
            WHEN 'i' THEN 'IMMUTABLE' 
            WHEN 's' THEN 'STABLE' 
            WHEN 'v' THEN 'VOLATILE' 
            ELSE 'VOLATILE' 
          END as volatility,
          p.prosecdef as is_security_definer,
          p.prosrc as source_code
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname !~ '^pg_toast' 
          AND n.nspname !~ '^pg_temp'
        ORDER BY n.nspname, p.proname;
      `);
    }

    // 5. Sequences with start/min/max/cache/cycle parameters
    let sequencesRes;
    try {
      sequencesRes = await client.query(`
        SELECT 
          s.sequencename as sequence_name,
          s.schemaname as schema_name,
          s.sequenceowner as sequence_owner,
          s.data_type::text as data_type,
          s.start_value::text as start_value,
          s.min_value::text as min_value,
          s.max_value::text as max_value,
          s.increment_by::text as increment,
          s.cycle as is_cycled,
          s.last_value::text as last_value,
          s.cache_size::text as cache_size
        FROM pg_catalog.pg_sequences s
        WHERE s.schemaname !~ '^pg_toast' 
          AND s.schemaname !~ '^pg_temp'
        ORDER BY s.schemaname, s.sequencename;
      `);
    } catch {
      sequencesRes = await client.query(`
        SELECT 
          c.relname as sequence_name,
          n.nspname as schema_name,
          pg_catalog.pg_get_userbyid(c.relowner) as sequence_owner,
          'bigint' as data_type,
          '1' as start_value,
          '1' as min_value,
          '9223372036854775807' as max_value,
          '1' as increment,
          false as is_cycled,
          null as last_value,
          '1' as cache_size
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S'
          AND n.nspname !~ '^pg_toast' 
          AND n.nspname !~ '^pg_temp'
        ORDER BY n.nspname, c.relname;
      `);
    }

    // 6. Extensions
    const extensionsRes = await client.query(`
      SELECT 
        e.extname as name,
        e.extversion as version,
        COALESCE(n.nspname, 'public') as schema,
        COALESCE(c.description, '') as description,
        e.extrelocatable as relocatable
      FROM pg_catalog.pg_extension e
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
      LEFT JOIN pg_catalog.pg_description c ON c.objoid = e.oid AND c.classoid = 'pg_extension'::regclass
      ORDER BY e.extname;
    `);

    // 7. Custom Types, Enums, Domains, and Composite Types
    let typesRes;
    try {
      typesRes = await client.query(`
        SELECT 
          t.typname as type_name,
          n.nspname as schema_name,
          pg_catalog.pg_get_userbyid(t.typowner) as type_owner,
          CASE t.typtype
            WHEN 'e' THEN 'enum'
            WHEN 'c' THEN 'composite'
            WHEN 'd' THEN 'domain'
            WHEN 'b' THEN 'base'
            WHEN 'r' THEN 'range'
            ELSE 'other'
          END as type_kind,
          COALESCE(
            (SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder) 
             FROM pg_catalog.pg_enum e WHERE e.enumtypid = t.oid),
            ''
          ) as enum_labels,
          pg_catalog.format_type(t.typbasetype, t.typtypmod) as base_type_name,
          COALESCE(d.description, '') as description
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        LEFT JOIN pg_catalog.pg_description d ON d.objoid = t.oid AND d.classoid = 'pg_type'::regclass
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname !~ '^pg_toast' 
          AND n.nspname !~ '^pg_temp'
          AND (t.typrelid = 0 OR (SELECT c.relkind = 'c' FROM pg_catalog.pg_class c WHERE c.oid = t.typrelid))
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_type el WHERE el.oid = t.typelem AND el.typarray = t.oid
          )
        ORDER BY n.nspname, t.typname;
      `);
    } catch {
      try {
        typesRes = await client.query(`
          SELECT 
            t.typname as type_name,
            n.nspname as schema_name,
            pg_catalog.pg_get_userbyid(t.typowner) as type_owner,
            CASE t.typtype
              WHEN 'e' THEN 'enum'
              WHEN 'c' THEN 'composite'
              WHEN 'd' THEN 'domain'
              ELSE 'other'
            END as type_kind,
            '' as enum_labels,
            '' as base_type_name,
            '' as description
          FROM pg_catalog.pg_type t
          JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast' 
            AND n.nspname !~ '^pg_temp'
            AND (t.typrelid = 0)
          ORDER BY n.nspname, t.typname;
        `);
      } catch {
        typesRes = { rows: [] };
      }
    }

    await client.end();

    // Group objects by schema
    const schemaMap = new Map<string, PostgresSchemaObjects>();
    for (const row of schemasRes.rows || []) {
      const sName = String(row.schema_name);
      schemaMap.set(sName, {
        name: sName,
        owner: String(row.schema_owner || 'postgres'),
        sizePretty: row.size_pretty ? String(row.size_pretty) : undefined,
        description: row.description ? String(row.description) : undefined,
        tables: [],
        views: [],
        materializedViews: [],
        functions: [],
        procedures: [],
        sequences: [],
        types: [],
      });
    }

    let totalTables = 0;
    for (const row of tablesRes.rows || []) {
      const sName = String(row.schema_name);
      if (!schemaMap.has(sName)) {
        schemaMap.set(sName, {
          name: sName,
          owner: String(row.table_owner || 'postgres'),
          tables: [],
          views: [],
          materializedViews: [],
          functions: [],
          procedures: [],
          sequences: [],
          types: [],
        });
      }
      schemaMap.get(sName)!.tables.push({
        name: String(row.table_name),
        schema: sName,
        owner: String(row.table_owner || 'postgres'),
        estimatedRows: Number(row.estimated_rows) || 0,
        sizePretty: String(row.size_pretty || '0 bytes'),
        sizeBytes: row.size_bytes !== null ? Number(row.size_bytes) : null,
        tableSizePretty: row.table_size_pretty ? String(row.table_size_pretty) : undefined,
        indexSizePretty: row.index_size_pretty ? String(row.index_size_pretty) : undefined,
        toastSizePretty: row.toast_size_pretty ? String(row.toast_size_pretty) : undefined,
        columnCount: row.column_count !== null && row.column_count !== undefined ? Number(row.column_count) : undefined,
        hasPrimaryKey: Boolean(row.has_primary_key),
        isPartitioned: Boolean(row.is_partitioned),
        hasIndexes: Boolean(row.has_indexes),
        hasTriggers: Boolean(row.has_triggers),
        persistence: (row.persistence as any) || 'permanent',
      });
      totalTables++;
    }

    let totalViews = 0;
    let totalMaterializedViews = 0;
    for (const row of viewsRes.rows || []) {
      const sName = String(row.schema_name);
      if (!schemaMap.has(sName)) {
        schemaMap.set(sName, {
          name: sName,
          owner: String(row.view_owner || 'postgres'),
          tables: [],
          views: [],
          materializedViews: [],
          functions: [],
          procedures: [],
          sequences: [],
          types: [],
        });
      }
      const isMat = Boolean(row.is_materialized);
      const vItem: PostgresViewItem = {
        name: String(row.view_name),
        schema: sName,
        owner: String(row.view_owner || 'postgres'),
        isMaterialized: isMat,
        sizePretty: row.size_pretty ? String(row.size_pretty) : undefined,
        definition: row.definition ? String(row.definition).trim() : undefined,
        columnCount: row.column_count !== null && row.column_count !== undefined ? Number(row.column_count) : undefined,
      };
      if (isMat) {
        schemaMap.get(sName)!.materializedViews.push(vItem);
        totalMaterializedViews++;
      } else {
        schemaMap.get(sName)!.views.push(vItem);
        totalViews++;
      }
    }

    let totalFunctions = 0;
    let totalProcedures = 0;
    for (const row of routinesRes.rows || []) {
      const sName = String(row.schema_name);
      if (!schemaMap.has(sName)) {
        schemaMap.set(sName, {
          name: sName,
          owner: String(row.routine_owner || 'postgres'),
          tables: [],
          views: [],
          materializedViews: [],
          functions: [],
          procedures: [],
          sequences: [],
          types: [],
        });
      }
      const isProc = row.routine_type === 'procedure';
      const rItem: PostgresRoutineItem = {
        name: String(row.routine_name),
        schema: sName,
        owner: String(row.routine_owner || 'postgres'),
        type: isProc ? 'procedure' : 'function',
        language: String(row.language || 'sql'),
        returnType: String(row.return_type || 'void'),
        argumentTypes: String(row.argument_types || ''),
        isAggregate: Boolean(row.is_aggregate),
        volatility: (row.volatility as any) || 'VOLATILE',
        isSecurityDefiner: Boolean(row.is_security_definer),
        sourceCode: row.source_code ? String(row.source_code) : undefined,
      };
      if (isProc) {
        schemaMap.get(sName)!.procedures.push(rItem);
        totalProcedures++;
      } else {
        schemaMap.get(sName)!.functions.push(rItem);
        totalFunctions++;
      }
    }

    let totalSequences = 0;
    for (const row of sequencesRes.rows || []) {
      const sName = String(row.schema_name);
      if (!schemaMap.has(sName)) {
        schemaMap.set(sName, {
          name: sName,
          owner: String(row.sequence_owner || 'postgres'),
          tables: [],
          views: [],
          materializedViews: [],
          functions: [],
          procedures: [],
          sequences: [],
          types: [],
        });
      }
      schemaMap.get(sName)!.sequences.push({
        name: String(row.sequence_name),
        schema: sName,
        owner: String(row.sequence_owner || 'postgres'),
        dataType: row.data_type ? String(row.data_type) : undefined,
        startValue: row.start_value !== null && row.start_value !== undefined ? String(row.start_value) : undefined,
        minValue: row.min_value !== null && row.min_value !== undefined ? String(row.min_value) : undefined,
        maxValue: row.max_value !== null && row.max_value !== undefined ? String(row.max_value) : undefined,
        increment: row.increment !== null && row.increment !== undefined ? String(row.increment) : undefined,
        isCycled: Boolean(row.is_cycled),
        lastValue: row.last_value !== null && row.last_value !== undefined ? String(row.last_value) : undefined,
        cacheSize: row.cache_size !== null && row.cache_size !== undefined ? String(row.cache_size) : undefined,
      });
      totalSequences++;
    }

    let totalTypes = 0;
    for (const row of typesRes?.rows || []) {
      const sName = String(row.schema_name);
      if (!schemaMap.has(sName)) {
        schemaMap.set(sName, {
          name: sName,
          owner: String(row.type_owner || 'postgres'),
          tables: [],
          views: [],
          materializedViews: [],
          functions: [],
          procedures: [],
          sequences: [],
          types: [],
        });
      }
      const rawLabels = String(row.enum_labels || '').trim();
      const labels = rawLabels ? rawLabels.split(',').map((l: string) => l.trim().replace(/^'|'$/g, '')) : undefined;

      schemaMap.get(sName)!.types.push({
        name: String(row.type_name),
        schema: sName,
        owner: String(row.type_owner || 'postgres'),
        kind: (row.type_kind as any) || 'other',
        enumLabels: labels,
        baseType: row.base_type_name && row.base_type_name !== '-' ? String(row.base_type_name) : undefined,
        description: row.description ? String(row.description) : undefined,
      });
      totalTypes++;
    }

    const extensions: PostgresSchemaExtensionItem[] = (extensionsRes.rows || []).map((row: any) => ({
      name: String(row.name),
      version: String(row.version || ''),
      schema: String(row.schema || 'public'),
      description: String(row.description || ''),
      relocatable: Boolean(row.relocatable),
    }));

    const tree: PostgresDatabaseTree = {
      databaseName: databaseName.trim(),
      schemas: Array.from(schemaMap.values()),
      extensions,
      totalTables,
      totalViews,
      totalMaterializedViews,
      totalFunctions,
      totalProcedures,
      totalSequences,
      totalTypes,
      totalExtensions: extensions.length,
      fetchedAt: new Date().toISOString(),
    };

    return { success: true, tree };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || `Failed to explore objects for database "${databaseName}"`,
      errorFa: `خطا در کاوش اجزای پایگاه داده "${databaseName}": ${err.message || 'خطای شبکه'}`,
    };
  }
}

function parsePgIntArray(val: any): number[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => Number(x)).filter((n) => !isNaN(n));
  if (typeof val === 'string') {
    const cleaned = val.replace(/^\{|\}$/g, '').trim();
    if (!cleaned) return [];
    return cleaned.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
  }
  return [];
}

function parseInt2VectorArray(val: any): number[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => Number(x)).filter((n) => !isNaN(n));
  if (typeof val === 'string') {
    return val.trim().split(/\s+/).map((s) => Number(s)).filter((n) => !isNaN(n));
  }
  return [];
}

function mapFkActionCode(code: string): string {
  switch (code) {
    case 'a': return 'NO ACTION';
    case 'r': return 'RESTRICT';
    case 'c': return 'CASCADE';
    case 'n': return 'SET NULL';
    case 'd': return 'SET DEFAULT';
    default: return 'NO ACTION';
  }
}

/**
 * Phase 5: Retrieves detailed table structure, column definitions, constraints (PK, FK, Unique, Check),
 * indexes, and physical storage metadata without querying full table rows.
 */
export async function getPostgresTableStructure(
  server: RemoteServer,
  databaseName: string,
  schemaName: string,
  tableName: string,
  options?: {
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; structure?: PostgresTableStructure; error?: string; errorFa?: string }> {
  if (!databaseName || !databaseName.trim()) {
    return {
      success: false,
      error: 'Target database name is required',
      errorFa: 'نام پایگاه داده هدف اجباری است',
    };
  }
  if (!schemaName || !schemaName.trim()) {
    return {
      success: false,
      error: 'Target schema name is required',
      errorFa: 'نام اسکیما اجباری است',
    };
  }
  if (!tableName || !tableName.trim()) {
    return {
      success: false,
      error: 'Target table name is required',
      errorFa: 'نام جدول اجباری است',
    };
  }

  const { client, targetHost } = createPostgresClient(server, {
    ...options,
    database: databaseName.trim(),
  });

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  try {
    await client.connect();

    // 1. Detect server version for conditional feature support
    let serverVersionNum = 120000;
    try {
      const verRes = await client.query(`SELECT current_setting('server_version_num')::integer as ver_num`);
      if (verRes.rows?.[0]?.ver_num) {
        serverVersionNum = Number(verRes.rows[0].ver_num);
      }
    } catch {}

    const hasIdentity = serverVersionNum >= 100000;
    const hasGenerated = serverVersionNum >= 120000;

    // 2. Fetch table OID, physical size, storage options, and basic attributes
    const tableRes = await client.query(
      `
      SELECT 
        c.oid,
        c.relname as table_name,
        n.nspname as schema_name,
        pg_catalog.pg_get_userbyid(c.relowner) as table_owner,
        CASE c.relpersistence 
          WHEN 't' THEN 'temporary'
          WHEN 'u' THEN 'unlogged'
          ELSE 'permanent'
        END as persistence,
        (c.relkind = 'p') as is_partitioned,
        COALESCE(t.spcname, 'pg_default') as tablespace,
        GREATEST(c.reltuples::bigint, 0) as estimated_rows,
        pg_catalog.pg_total_relation_size(c.oid) as total_size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as total_size_pretty,
        pg_catalog.pg_relation_size(c.oid) as table_size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(c.oid)) as table_size_pretty,
        pg_catalog.pg_indexes_size(c.oid) as index_size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_indexes_size(c.oid)) as index_size_pretty,
        GREATEST(pg_catalog.pg_total_relation_size(c.oid) - pg_catalog.pg_relation_size(c.oid) - pg_catalog.pg_indexes_size(c.oid), 0) as toast_size_bytes,
        pg_catalog.pg_size_pretty(GREATEST(pg_catalog.pg_total_relation_size(c.oid) - pg_catalog.pg_relation_size(c.oid) - pg_catalog.pg_indexes_size(c.oid), 0)) as toast_size_pretty,
        COALESCE(pg_catalog.obj_description(c.oid, 'pg_class'), '') as comment
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_tablespace t ON c.reltablespace = t.oid
      WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'p');
      `,
      [schemaName.trim(), tableName.trim()]
    );

    if (!tableRes.rows || tableRes.rows.length === 0) {
      await client.end();
      return {
        success: false,
        error: `Table "${schemaName}"."${tableName}" was not found in database "${databaseName}".`,
        errorFa: `جدول "${schemaName}"."${tableName}" در پایگاه داده "${databaseName}" یافت نشد.`,
      };
    }

    const tRow = tableRes.rows[0];
    const tableOid = tRow.oid;
    const isPartitioned = Boolean(tRow.is_partitioned);

    // 3. Partition key definition if partitioned
    let partitionKey: string | undefined;
    if (isPartitioned) {
      try {
        const partRes = await client.query(
          `SELECT COALESCE(pg_catalog.pg_get_partkeydef($1::oid), '') as part_key`,
          [tableOid]
        );
        partitionKey = partRes.rows?.[0]?.part_key || undefined;
      } catch {}
    }

    // 4. Activity and scan statistics from pg_stat_all_tables
    let statsRow: any = {};
    try {
      const statsRes = await client.query(
        `
        SELECT 
          COALESCE(stat.seq_scan, 0)::bigint as seq_scans,
          COALESCE(stat.seq_tup_read, 0)::bigint as seq_tuples_read,
          COALESCE(stat.idx_scan, 0)::bigint as idx_scans,
          COALESCE(stat.idx_tup_fetch, 0)::bigint as idx_tuples_fetched,
          COALESCE(stat.n_tup_ins, 0)::bigint as n_tuples_ins,
          COALESCE(stat.n_tup_upd, 0)::bigint as n_tuples_upd,
          COALESCE(stat.n_tup_del, 0)::bigint as n_tuples_del,
          COALESCE(stat.n_tup_hot_upd, 0)::bigint as n_tuples_hot_upd,
          COALESCE(stat.n_live_tup, 0)::bigint as n_live_tuples,
          COALESCE(stat.n_dead_tup, 0)::bigint as n_dead_tuples,
          stat.last_vacuum::text,
          stat.last_autovacuum::text,
          stat.last_analyze::text,
          stat.last_autoanalyze::text
        FROM pg_catalog.pg_stat_all_tables stat
        WHERE stat.relid = $1::oid;
        `,
        [tableOid]
      );
      statsRow = statsRes.rows?.[0] || {};
    } catch {}

    // 5. Columns inspection
    const columnsQuery = `
      SELECT 
        a.attnum,
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        a.atttypid::regtype::text as base_data_type,
        NOT (a.attnotnull OR (t.typtype = 'd' AND t.typnotnull)) as is_nullable,
        pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) as default_value,
        COALESCE(col_desc.description, '') as comment,
        COLL.collname as collation_name,
        ${hasIdentity ? "COALESCE(a.attidentity != '', false)" : "false"} as is_identity,
        ${hasIdentity ? "COALESCE(a.attidentity, '')" : "''"} as identity_generation,
        ${hasGenerated ? "COALESCE(a.attgenerated != '', false)" : "false"} as is_generated,
        EXISTS(
          SELECT 1 FROM pg_catalog.pg_constraint con 
          WHERE con.conrelid = $1::oid AND con.contype = 'p' AND a.attnum = ANY(con.conkey)
        ) as is_primary_key,
        EXISTS(
          SELECT 1 FROM pg_catalog.pg_constraint con 
          WHERE con.conrelid = $1::oid AND con.contype = 'f' AND a.attnum = ANY(con.conkey)
        ) as is_foreign_key,
        EXISTS(
          SELECT 1 FROM pg_catalog.pg_constraint con 
          WHERE con.conrelid = $1::oid AND con.contype = 'u' AND a.attnum = ANY(con.conkey)
        ) as is_unique,
        EXISTS(
          SELECT 1 FROM pg_catalog.pg_constraint con 
          WHERE con.conrelid = $1::oid AND con.contype = 'c' AND a.attnum = ANY(con.conkey)
        ) as has_check_constraint
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      LEFT JOIN pg_catalog.pg_description col_desc ON col_desc.objoid = a.attrelid AND col_desc.objsubid = a.attnum
      LEFT JOIN pg_catalog.pg_collation COLL ON COLL.oid = a.attcollation AND a.attcollation <> t.typcollation
      WHERE a.attrelid = $1::oid
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum ASC;
    `;

    const colsRes = await client.query(columnsQuery, [tableOid]);

    const attnumToName = new Map<number, string>();
    const columns: PostgresColumnStructure[] = (colsRes.rows || []).map((row: any) => {
      const attnum = Number(row.attnum);
      const colName = String(row.column_name);
      attnumToName.set(attnum, colName);

      return {
        attnum,
        name: colName,
        dataType: String(row.data_type || row.base_data_type || 'text'),
        formattedType: String(row.data_type || row.base_data_type || 'text'),
        isNullable: Boolean(row.is_nullable),
        defaultValue: row.default_value ? String(row.default_value) : null,
        isIdentity: Boolean(row.is_identity),
        identityGeneration: row.identity_generation ? String(row.identity_generation) : undefined,
        isGenerated: Boolean(row.is_generated),
        isPrimaryKey: Boolean(row.is_primary_key),
        isForeignKey: Boolean(row.is_foreign_key),
        isUnique: Boolean(row.is_unique),
        hasCheckConstraint: Boolean(row.has_check_constraint),
        comment: row.comment ? String(row.comment) : undefined,
        collation: row.collation_name ? String(row.collation_name) : undefined,
      };
    });

    // 6. Constraints inspection (PK, FK, Unique, Check)
    const constraintsRes = await client.query(
      `
      SELECT 
        con.oid,
        con.conname as constraint_name,
        con.contype as constraint_type,
        pg_catalog.pg_get_constraintdef(con.oid, true) as definition,
        con.conkey,
        con.confkey,
        con.confrelid,
        confrel.relname as foreign_table,
        confn.nspname as foreign_schema,
        con.confupdtype as conf_upd_type,
        con.confdeltype as conf_del_type,
        con.connoinherit as no_inherit,
        con.convalidated as is_validated
      FROM pg_catalog.pg_constraint con
      LEFT JOIN pg_catalog.pg_class confrel ON confrel.oid = con.confrelid
      LEFT JOIN pg_catalog.pg_namespace confn ON confn.oid = confrel.relnamespace
      WHERE con.conrelid = $1::oid
      ORDER BY 
        CASE con.contype 
          WHEN 'p' THEN 1 
          WHEN 'f' THEN 2 
          WHEN 'u' THEN 3 
          WHEN 'c' THEN 4 
          ELSE 5 
        END, 
        con.conname ASC;
      `,
      [tableOid]
    );

    // Resolve foreign column names for foreign keys if any
    const foreignRelOids = new Set<string>();
    for (const cRow of constraintsRes.rows || []) {
      if (cRow.confrelid && cRow.confrelid !== '0') {
        foreignRelOids.add(String(cRow.confrelid));
      }
    }

    const foreignAttnumMap = new Map<string, string>(); // "relid:attnum" -> colName
    if (foreignRelOids.size > 0) {
      try {
        const foreignColsRes = await client.query(
          `SELECT attrelid::text as relid, attnum, attname FROM pg_catalog.pg_attribute WHERE attrelid = ANY($1::oid[]) AND attnum > 0`,
          [Array.from(foreignRelOids)]
        );
        for (const fc of foreignColsRes.rows || []) {
          foreignAttnumMap.set(`${fc.relid}:${fc.attnum}`, String(fc.attname));
        }
      } catch {}
    }

    let primaryKey: PostgresPrimaryKeyConstraint | null = null;
    const foreignKeys: PostgresForeignKeyConstraint[] = [];
    const uniqueConstraints: PostgresUniqueConstraint[] = [];
    const checkConstraints: PostgresCheckConstraint[] = [];

    for (const cRow of constraintsRes.rows || []) {
      const cType = cRow.constraint_type;
      const cName = String(cRow.constraint_name);
      const def = String(cRow.definition || '');
      const conkeyNums = parsePgIntArray(cRow.conkey);
      const localCols = conkeyNums.map((num) => attnumToName.get(num) || `col_${num}`);

      if (cType === 'p') {
        primaryKey = {
          name: cName,
          columns: localCols,
          definition: def,
        };
      } else if (cType === 'f') {
        const confkeyNums = parsePgIntArray(cRow.confkey);
        const fRelId = String(cRow.confrelid || '');
        const foreignCols = confkeyNums.map((num) => foreignAttnumMap.get(`${fRelId}:${num}`) || `fcol_${num}`);

        foreignKeys.push({
          name: cName,
          columns: localCols,
          foreignSchema: String(cRow.foreign_schema || 'public'),
          foreignTable: String(cRow.foreign_table || ''),
          foreignColumns: foreignCols,
          onUpdate: mapFkActionCode(String(cRow.conf_upd_type || 'a')),
          onDelete: mapFkActionCode(String(cRow.conf_del_type || 'a')),
          definition: def,
        });
      } else if (cType === 'u') {
        uniqueConstraints.push({
          name: cName,
          columns: localCols,
          definition: def,
        });
      } else if (cType === 'c') {
        checkConstraints.push({
          name: cName,
          columns: localCols.length > 0 ? localCols : undefined,
          clause: def.replace(/^CHECK\s*\(/i, '').replace(/\)$/, ''),
          noInherit: Boolean(cRow.no_inherit),
          isValidated: Boolean(cRow.is_validated),
        });
      }
    }

    // 7. Indexes inspection (pg_index + pg_class + pg_am + pg_stat_all_indexes)
    const indexesRes = await client.query(
      `
      SELECT 
        ic.relname as index_name,
        pg_catalog.pg_get_indexdef(i.indexrelid, 0, true) as index_definition,
        i.indisprimary as is_primary,
        i.indisunique as is_unique,
        i.indisvalid as is_valid,
        i.indkey as indkey_raw,
        am.amname as access_method,
        pg_catalog.pg_relation_size(i.indexrelid) as size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(i.indexrelid)) as size_pretty,
        COALESCE(stat.idx_scan, 0)::bigint as scans_count,
        COALESCE(stat.idx_tup_read, 0)::bigint as tuples_read,
        COALESCE(stat.idx_tup_fetch, 0)::bigint as tuples_fetched,
        COALESCE(pg_catalog.obj_description(i.indexrelid, 'pg_class'), '') as comment
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid = ic.relam
      LEFT JOIN pg_catalog.pg_stat_all_indexes stat ON stat.indexrelid = i.indexrelid
      WHERE i.indrelid = $1::oid
      ORDER BY i.indisprimary DESC, i.indisunique DESC, ic.relname ASC;
      `,
      [tableOid]
    );

    const indexes: PostgresIndexDetail[] = (indexesRes.rows || []).map((iRow: any) => {
      const indkeyNums = parseInt2VectorArray(iRow.indkey_raw);
      const cols = indkeyNums
        .map((num) => {
          if (num === 0) return '(expression)';
          return attnumToName.get(num) || `col_${num}`;
        })
        .filter(Boolean);

      return {
        name: String(iRow.index_name),
        definition: String(iRow.index_definition || ''),
        isPrimary: Boolean(iRow.is_primary),
        isUnique: Boolean(iRow.is_unique),
        isValid: Boolean(iRow.is_valid),
        accessMethod: String(iRow.access_method || 'btree'),
        columns: cols,
        sizePretty: String(iRow.size_pretty || '0 bytes'),
        sizeBytes: iRow.size_bytes !== null ? Number(iRow.size_bytes) : null,
        scansCount: Number(iRow.scans_count) || 0,
        tuplesRead: Number(iRow.tuples_read) || 0,
        tuplesFetched: Number(iRow.tuples_fetched) || 0,
        comment: iRow.comment ? String(iRow.comment) : undefined,
      };
    });

    await client.end();

    const metadata: PostgresTableMetadataStats = {
      schemaName: String(tRow.schema_name),
      tableName: String(tRow.table_name),
      owner: String(tRow.table_owner || 'postgres'),
      persistence: (tRow.persistence as any) || 'permanent',
      isPartitioned,
      partitionKey,
      tablespace: String(tRow.tablespace || 'pg_default'),
      estimatedRows: Number(tRow.estimated_rows) || 0,
      totalSizePretty: String(tRow.total_size_pretty || '0 bytes'),
      totalSizeBytes: Number(tRow.total_size_bytes) || 0,
      tableSizePretty: String(tRow.table_size_pretty || '0 bytes'),
      tableSizeBytes: Number(tRow.table_size_bytes) || 0,
      indexSizePretty: String(tRow.index_size_pretty || '0 bytes'),
      indexSizeBytes: Number(tRow.index_size_bytes) || 0,
      toastSizePretty: String(tRow.toast_size_pretty || '0 bytes'),
      toastSizeBytes: Number(tRow.toast_size_bytes) || 0,
      columnsCount: columns.length,
      primaryKeyCount: primaryKey ? 1 : 0,
      foreignKeyCount: foreignKeys.length,
      uniqueConstraintCount: uniqueConstraints.length,
      checkConstraintCount: checkConstraints.length,
      indexCount: indexes.length,
      seqScans: Number(statsRow.seq_scans) || 0,
      seqTuplesRead: Number(statsRow.seq_tuples_read) || 0,
      idxScans: Number(statsRow.idx_scans) || 0,
      idxTuplesFetched: Number(statsRow.idx_tuples_fetched) || 0,
      nTuplesIns: Number(statsRow.n_tuples_ins) || 0,
      nTuplesUpd: Number(statsRow.n_tuples_upd) || 0,
      nTuplesDel: Number(statsRow.n_tuples_del) || 0,
      nTuplesHotUpd: Number(statsRow.n_tuples_hot_upd) || 0,
      nLiveTuples: Number(statsRow.n_live_tuples) || 0,
      nDeadTuples: Number(statsRow.n_dead_tuples) || 0,
      lastVacuum: statsRow.last_vacuum ? String(statsRow.last_vacuum) : undefined,
      lastAutoVacuum: statsRow.last_autovacuum ? String(statsRow.last_autovacuum) : undefined,
      lastAnalyze: statsRow.last_analyze ? String(statsRow.last_analyze) : undefined,
      lastAutoAnalyze: statsRow.last_autoanalyze ? String(statsRow.last_autoanalyze) : undefined,
      comment: tRow.comment ? String(tRow.comment) : undefined,
    };

    const structure: PostgresTableStructure = {
      databaseName: databaseName.trim(),
      schemaName: schemaName.trim(),
      tableName: tableName.trim(),
      metadata,
      columns,
      primaryKey,
      foreignKeys,
      uniqueConstraints,
      checkConstraints,
      indexes,
      fetchedAt: new Date().toISOString(),
    };

    return { success: true, structure };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || `Failed to fetch structure for table "${schemaName}"."${tableName}"`,
      errorFa: `خطا در دریافت ساختار و متادیتای جدول "${schemaName}"."${tableName}": ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * Phase 6: Production-safe server-side table data browser.
 * Executes paginated, filtered, and sorted SELECT queries with parameterization and identifier validation.
 * Never performs full table scans unless exact count is requested on filtered datasets.
 */
export async function getPostgresTableData(
  server: RemoteServer,
  request: PostgresTableDataRequest,
  options?: {
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; data?: PostgresTableDataResult; error?: string; errorFa?: string }> {
  const {
    database,
    schema,
    table,
    page = 1,
    pageSize = 50,
    sortColumn,
    sortDirection = 'ASC',
    search,
    filters = [],
    countExact = false,
  } = request;

  if (!database || !database.trim()) {
    return {
      success: false,
      error: 'Target database name is required',
      errorFa: 'نام پایگاه داده اجباری است',
    };
  }
  if (!schema || !schema.trim()) {
    return {
      success: false,
      error: 'Target schema name is required',
      errorFa: 'نام اسکیما اجباری است',
    };
  }
  if (!table || !table.trim()) {
    return {
      success: false,
      error: 'Target table name is required',
      errorFa: 'نام جدول اجباری است',
    };
  }

  const { client, targetHost } = createPostgresClient(server, {
    ...options,
    database: database.trim(),
  });

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  try {
    await client.connect();

    // 1. Verify table exists and retrieve authorized columns + primary key info
    const colsRes = await client.query(
      `
      SELECT 
        a.attnum,
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        a.atttypid::regtype::text as base_type,
        EXISTS(
          SELECT 1 FROM pg_catalog.pg_constraint con 
          WHERE con.conrelid = c.oid AND con.contype = 'p' AND a.attnum = ANY(con.conkey)
        ) as is_primary_key,
        GREATEST(c.reltuples::bigint, 0) as estimated_rows
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = $1 AND c.relname = $2
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum ASC;
      `,
      [schema.trim(), table.trim()]
    );

    if (!colsRes.rows || colsRes.rows.length === 0) {
      await client.end();
      return {
        success: false,
        error: `Table "${schema}"."${table}" does not exist in database "${database}".`,
        errorFa: `جدول "${schema}"."${table}" در دیتابیس "${database}" وجود ندارد.`,
      };
    }

    const estimatedRowsFromCatalog = Number(colsRes.rows[0].estimated_rows) || 0;
    const columns: PostgresTableDataColumnInfo[] = colsRes.rows.map((r: any) => ({
      name: String(r.column_name),
      dataType: String(r.base_type || r.data_type || 'text'),
      formattedType: String(r.data_type || r.base_type || 'text'),
      isPrimaryKey: Boolean(r.is_primary_key),
    }));

    const columnMap = new Map<string, PostgresTableDataColumnInfo>();
    const textSearchableCols: string[] = [];
    let primaryKeyColName: string | undefined;

    for (const col of columns) {
      columnMap.set(col.name, col);
      if (col.isPrimaryKey && !primaryKeyColName) {
        primaryKeyColName = col.name;
      }
      textSearchableCols.push(col.name);
    }

    const safeSchemaIdent = `"${schema.trim().replace(/"/g, '""')}"`;
    const safeTableIdent = `"${table.trim().replace(/"/g, '""')}"`;
    const fullRelationIdent = `${safeSchemaIdent}.${safeTableIdent}`;

    // 2. Build WHERE clauses with parameterized values
    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // A. Global text search
    if (search && search.trim() && textSearchableCols.length > 0) {
      const searchTerms = textSearchableCols.map(
        (colName) => `"${colName.replace(/"/g, '""')}"::text ILIKE $${paramIndex}`
      );
      whereClauses.push(`(${searchTerms.join(' OR ')})`);
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // B. Column-specific filters
    if (Array.isArray(filters)) {
      for (const filter of filters) {
        if (!filter.column || !columnMap.has(filter.column)) continue;
        const colIdent = `"${filter.column.replace(/"/g, '""')}"`;
        const val = filter.value !== undefined ? String(filter.value).trim() : '';

        switch (filter.operator) {
          case 'eq':
            whereClauses.push(`${colIdent}::text = $${paramIndex}`);
            queryParams.push(val);
            paramIndex++;
            break;
          case 'neq':
            whereClauses.push(`${colIdent}::text <> $${paramIndex}`);
            queryParams.push(val);
            paramIndex++;
            break;
          case 'contains':
            whereClauses.push(`${colIdent}::text ILIKE $${paramIndex}`);
            queryParams.push(`%${val}%`);
            paramIndex++;
            break;
          case 'notContains':
            whereClauses.push(`(${colIdent} IS NULL OR ${colIdent}::text NOT ILIKE $${paramIndex})`);
            queryParams.push(`%${val}%`);
            paramIndex++;
            break;
          case 'startsWith':
            whereClauses.push(`${colIdent}::text ILIKE $${paramIndex}`);
            queryParams.push(`${val}%`);
            paramIndex++;
            break;
          case 'endsWith':
            whereClauses.push(`${colIdent}::text ILIKE $${paramIndex}`);
            queryParams.push(`%${val}`);
            paramIndex++;
            break;
          case 'gt':
            whereClauses.push(`${colIdent} > $${paramIndex}`);
            queryParams.push(val);
            paramIndex++;
            break;
          case 'gte':
            whereClauses.push(`${colIdent} >= $${paramIndex}`);
            queryParams.push(val);
            paramIndex++;
            break;
          case 'lt':
            whereClauses.push(`${colIdent} < $${paramIndex}`);
            queryParams.push(val);
            paramIndex++;
            break;
          case 'lte':
            whereClauses.push(`${colIdent} <= $${paramIndex}`);
            queryParams.push(val);
            paramIndex++;
            break;
          case 'isNull':
            whereClauses.push(`${colIdent} IS NULL`);
            break;
          case 'isNotNull':
            whereClauses.push(`${colIdent} IS NOT NULL`);
            break;
        }
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // 3. Sorting clause
    let orderSql = '';
    if (sortColumn && columnMap.has(sortColumn)) {
      const dir = sortDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderSql = `ORDER BY "${sortColumn.replace(/"/g, '""')}" ${dir} NULLS LAST`;
    } else if (primaryKeyColName) {
      orderSql = `ORDER BY "${primaryKeyColName.replace(/"/g, '""')}" ASC`;
    } else if (columns.length > 0) {
      orderSql = `ORDER BY "${columns[0].name.replace(/"/g, '""')}" ASC`;
    }

    // 4. Calculate total row count
    let totalRows = 0;
    let isExactCount = false;

    const hasFiltersOrSearch = whereClauses.length > 0;
    if (hasFiltersOrSearch || countExact || estimatedRowsFromCatalog < 2000) {
      try {
        const countRes = await client.query(
          `SELECT count(*)::bigint as total FROM ${fullRelationIdent} ${whereSql};`,
          queryParams
        );
        totalRows = Number(countRes.rows?.[0]?.total) || 0;
        isExactCount = true;
      } catch (err: any) {
        totalRows = estimatedRowsFromCatalog;
        isExactCount = false;
      }
    } else {
      totalRows = estimatedRowsFromCatalog;
      isExactCount = false;
    }

    // 5. Pagination calculation
    const validatedPageSize = Math.min(Math.max(1, Number(pageSize) || 50), 500);
    const totalPages = Math.max(1, Math.ceil(totalRows / validatedPageSize));
    const validatedPage = Math.min(Math.max(1, Number(page) || 1), Math.max(1, totalPages));
    const offset = (validatedPage - 1) * validatedPageSize;

    // 6. Query actual rows with LIMIT and OFFSET
    const rowsParams = [...queryParams];
    rowsParams.push(validatedPageSize);
    const limitParam = `$${paramIndex++}`;
    rowsParams.push(offset);
    const offsetParam = `$${paramIndex++}`;

    const dataQuery = `
      SELECT ctid::text AS _pg_ctid, * 
      FROM ${fullRelationIdent} 
      ${whereSql} 
      ${orderSql} 
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `;

    const startTimer = Date.now();
    const rowsRes = await client.query(dataQuery, rowsParams);
    const executionTimeMs = Date.now() - startTimer;

    await client.end();

    // 7. Sanitize output rows for JSON serialization
    const sanitizedRows = (rowsRes.rows || []).map((row: any) => {
      const cleanRow: Record<string, any> = {};
      for (const [key, val] of Object.entries(row)) {
        if (key === '_pg_ctid') {
          cleanRow._pg_ctid = val ? String(val) : undefined;
          continue;
        }
        if (val === null || val === undefined) {
          cleanRow[key] = null;
        } else if (typeof val === 'bigint') {
          cleanRow[key] = val.toString();
        } else if (Buffer.isBuffer(val)) {
          cleanRow[key] = `\\x${val.toString('hex')}`;
        } else if (val instanceof Date) {
          cleanRow[key] = val.toISOString();
        } else {
          cleanRow[key] = val;
        }
      }
      return cleanRow;
    });

    const result: PostgresTableDataResult = {
      databaseName: database.trim(),
      schemaName: schema.trim(),
      tableName: table.trim(),
      columns,
      rows: sanitizedRows,
      totalRows,
      isExactCount,
      page: validatedPage,
      pageSize: validatedPageSize,
      totalPages,
      executionTimeMs,
      fetchedAt: new Date().toISOString(),
    };

    return { success: true, data: result };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || `Failed to fetch data for table "${schema}"."${table}"`,
      errorFa: `خطا در دریافت داده‌های جدول "${schema}"."${table}": ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * ============================================================================
 * PHASE 7: TABLE DATA EDITING (INSERT, UPDATE, DELETE)
 * Controlled, transaction-safe row manipulation with parameterization,
 * row identification, and strict single-row impact validation.
 * ============================================================================
 */

export interface PostgresRowColumnValue {
  value: any;
  isNull?: boolean;
  isDefault?: boolean;
}

export interface PostgresRowInsertRequest {
  database: string;
  schema: string;
  table: string;
  values: Record<string, PostgresRowColumnValue>;
  port?: number;
  user?: string;
  password?: string;
}

export interface PostgresRowUpdateRequest {
  database: string;
  schema: string;
  table: string;
  primaryKeyValues?: Record<string, any>;
  ctid?: string;
  originalRow?: Record<string, any>;
  updatedValues: Record<string, PostgresRowColumnValue>;
  port?: number;
  user?: string;
  password?: string;
}

export interface PostgresRowDeleteRequest {
  database: string;
  schema: string;
  table: string;
  primaryKeyValues?: Record<string, any>;
  ctid?: string;
  originalRow?: Record<string, any>;
  port?: number;
  user?: string;
  password?: string;
}

export interface PostgresRowMutationResult {
  success: boolean;
  operation: 'insert' | 'update' | 'delete';
  affectedRows: number;
  data?: Record<string, any>;
  executionTimeMs?: number;
  message?: string;
  messageFa?: string;
  error?: string;
  errorFa?: string;
}

// Helper to query valid columns from PostgreSQL catalog to prevent SQL injection
async function getTableCatalogColumns(
  client: Client,
  schema: string,
  table: string
): Promise<Map<string, { dataType: string; isNotNull: boolean }>> {
  const colRes = await client.query(
    `
    SELECT 
      a.attname as col_name, 
      pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type, 
      a.attnotnull as is_not_null
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped;
    `,
    [schema.trim(), table.trim()]
  );

  const colMap = new Map<string, { dataType: string; isNotNull: boolean }>();
  for (const r of colRes.rows || []) {
    colMap.set(String(r.col_name), {
      dataType: String(r.data_type),
      isNotNull: Boolean(r.is_not_null),
    });
  }
  return colMap;
}

/**
 * Inserts a single new row into a table within a safe transaction.
 */
export async function insertPostgresTableRow(
  server: RemoteServer,
  params: PostgresRowInsertRequest
): Promise<PostgresRowMutationResult> {
  const startTime = Date.now();
  const { database, schema, table, values } = params;

  if (!database || !schema || !table) {
    return {
      success: false,
      operation: 'insert',
      affectedRows: 0,
      error: 'Missing required parameters: database, schema, table.',
      errorFa: 'پارامترهای الزامی نام دیتابیس، اسکیما یا جدول ارسال نشده است.',
    };
  }

  const { client, targetHost, targetPort } = createPostgresClient(server, {
    database,
    port: params.port,
    user: params.user,
    password: params.password,
  });

  try {
    await client.connect();

    const colMap = await getTableCatalogColumns(client, schema, table);
    if (colMap.size === 0) {
      await client.end();
      return {
        success: false,
        operation: 'insert',
        affectedRows: 0,
        error: `Table "${schema}"."${table}" does not exist or has no accessible columns.`,
        errorFa: `جدول "${schema}"."${table}" وجود ندارد یا ستونی برای آن یافت نشد.`,
      };
    }

    const safeSchemaIdent = `"${schema.trim().replace(/"/g, '""')}"`;
    const safeTableIdent = `"${table.trim().replace(/"/g, '""')}"`;
    const fullRelationIdent = `${safeSchemaIdent}.${safeTableIdent}`;

    const insertCols: string[] = [];
    const valPlaceholders: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    for (const [colName, colVal] of Object.entries(values || {})) {
      if (!colMap.has(colName)) continue;
      // If DEFAULT requested, omit column so PostgreSQL assigns DEFAULT
      if (colVal.isDefault) continue;

      insertCols.push(`"${colName.replace(/"/g, '""')}"`);
      if (colVal.isNull || colVal.value === null || colVal.value === undefined) {
        valPlaceholders.push('NULL');
      } else {
        valPlaceholders.push(`$${paramIndex++}`);
        queryParams.push(colVal.value);
      }
    }

    let insertSql = '';
    if (insertCols.length === 0) {
      insertSql = `INSERT INTO ${fullRelationIdent} DEFAULT VALUES RETURNING ctid::text as _pg_ctid, *;`;
    } else {
      insertSql = `INSERT INTO ${fullRelationIdent} (${insertCols.join(', ')}) VALUES (${valPlaceholders.join(', ')}) RETURNING ctid::text as _pg_ctid, *;`;
    }

    await client.query('BEGIN;');
    const res = await client.query(insertSql, queryParams);
    await client.query('COMMIT;');
    await client.end();

    const affectedRows = res.rowCount || 0;
    const insertedRow = res.rows?.[0] || undefined;

    return {
      success: true,
      operation: 'insert',
      affectedRows,
      data: insertedRow,
      executionTimeMs: Date.now() - startTime,
      message: `Successfully inserted 1 row into "${schema}"."${table}".`,
      messageFa: `۱ سطر با موفقیت در جدول "${schema}"."${table}" درج شد.`,
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      operation: 'insert',
      affectedRows: 0,
      executionTimeMs: Date.now() - startTime,
      error: err.message || `Failed to insert row into "${schema}"."${table}".`,
      errorFa: `خطا در درج سطر در جدول "${schema}"."${table}": ${err.message || 'خطای تراکنش دیتابیس'}`,
    };
  }
}

/**
 * Updates an identified target row within a safe transaction with strict row count verification.
 */
export async function updatePostgresTableRow(
  server: RemoteServer,
  params: PostgresRowUpdateRequest
): Promise<PostgresRowMutationResult> {
  const startTime = Date.now();
  const { database, schema, table, primaryKeyValues, ctid, originalRow, updatedValues } = params;

  if (!database || !schema || !table) {
    return {
      success: false,
      operation: 'update',
      affectedRows: 0,
      error: 'Missing required parameters: database, schema, table.',
      errorFa: 'پارامترهای الزامی نام دیتابیس، اسکیما یا جدول ارسال نشده است.',
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

  const { client } = createPostgresClient(server, {
    database,
    port: params.port,
    user: params.user,
    password: params.password,
  });

  try {
    await client.connect();

    const colMap = await getTableCatalogColumns(client, schema, table);
    if (colMap.size === 0) {
      await client.end();
      return {
        success: false,
        operation: 'update',
        affectedRows: 0,
        error: `Table "${schema}"."${table}" does not exist.`,
        errorFa: `جدول "${schema}"."${table}" یافت نشد.`,
      };
    }

    const safeSchemaIdent = `"${schema.trim().replace(/"/g, '""')}"`;
    const safeTableIdent = `"${table.trim().replace(/"/g, '""')}"`;
    const fullRelationIdent = `${safeSchemaIdent}.${safeTableIdent}`;

    const setClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    for (const [colName, colVal] of Object.entries(updatedValues)) {
      if (!colMap.has(colName)) continue;

      const safeColIdent = `"${colName.replace(/"/g, '""')}"`;
      if (colVal.isDefault) {
        setClauses.push(`${safeColIdent} = DEFAULT`);
      } else if (colVal.isNull || colVal.value === null || colVal.value === undefined) {
        setClauses.push(`${safeColIdent} = NULL`);
      } else {
        setClauses.push(`${safeColIdent} = $${paramIndex++}`);
        queryParams.push(colVal.value);
      }
    }

    if (setClauses.length === 0) {
      await client.end();
      return {
        success: false,
        operation: 'update',
        affectedRows: 0,
        error: 'No valid table columns to update.',
        errorFa: 'هیچ ستون معتبری برای به‌روزرسانی یافت نشد.',
      };
    }

    // Build WHERE clause with priority: Primary Key -> ctid -> original row values
    const whereClauses: string[] = [];

    if (primaryKeyValues && Object.keys(primaryKeyValues).length > 0) {
      for (const [pkCol, pkVal] of Object.entries(primaryKeyValues)) {
        if (!colMap.has(pkCol)) continue;
        const safePkIdent = `"${pkCol.replace(/"/g, '""')}"`;
        if (pkVal === null || pkVal === undefined) {
          whereClauses.push(`${safePkIdent} IS NULL`);
        } else {
          whereClauses.push(`${safePkIdent} = $${paramIndex++}`);
          queryParams.push(pkVal);
        }
      }
    }

    if (whereClauses.length === 0 && ctid && typeof ctid === 'string' && /^\(\d+,\d+\)$/.test(ctid.trim())) {
      whereClauses.push(`ctid = $${paramIndex++}::tid`);
      queryParams.push(ctid.trim());
    }

    if (whereClauses.length === 0 && originalRow && Object.keys(originalRow).length > 0) {
      for (const [colName, origVal] of Object.entries(originalRow)) {
        if (!colMap.has(colName)) continue;
        const safeColIdent = `"${colName.replace(/"/g, '""')}"`;
        if (origVal === null || origVal === undefined) {
          whereClauses.push(`${safeColIdent} IS NULL`);
        } else {
          whereClauses.push(`${safeColIdent}::text = $${paramIndex++}::text`);
          queryParams.push(String(origVal));
        }
      }
    }

    if (whereClauses.length === 0) {
      await client.end();
      return {
        success: false,
        operation: 'update',
        affectedRows: 0,
        error: 'Unable to identify unique target row. Update requires primary key, ctid, or complete row values.',
        errorFa: 'شناسایی دقیق سطر هدف ممکن نشد. به‌روزرسانی نیازمند کلید اصلی، شناسه ctid یا مقادیر کامل سطر است.',
      };
    }

    const updateSql = `
      UPDATE ${fullRelationIdent}
      SET ${setClauses.join(', ')}
      WHERE ${whereClauses.join(' AND ')}
      RETURNING ctid::text as _pg_ctid, *;
    `;

    await client.query('BEGIN;');
    const res = await client.query(updateSql, queryParams);

    if (res.rowCount === 1) {
      await client.query('COMMIT;');
      await client.end();
      return {
        success: true,
        operation: 'update',
        affectedRows: 1,
        data: res.rows?.[0],
        executionTimeMs: Date.now() - startTime,
        message: `Successfully updated 1 row in "${schema}"."${table}".`,
        messageFa: `۱ سطر با موفقیت در جدول "${schema}"."${table}" به‌روزرسانی شد.`,
      };
    } else if (res.rowCount === 0) {
      await client.query('ROLLBACK;');
      await client.end();
      return {
        success: false,
        operation: 'update',
        affectedRows: 0,
        executionTimeMs: Date.now() - startTime,
        error: 'Target row was not found or was modified/deleted by another session. Transaction rolled back.',
        errorFa: 'سطر هدف یافت نشد یا همزمان توسط کاربر دیگری تغییر کرده یا حذف شده است. تراکنش لغو شد.',
      };
    } else {
      await client.query('ROLLBACK;');
      await client.end();
      return {
        success: false,
        operation: 'update',
        affectedRows: res.rowCount || 0,
        executionTimeMs: Date.now() - startTime,
        error: `Safety abort: Update condition matched ${res.rowCount} rows instead of exactly 1. Transaction rolled back.`,
        errorFa: `توقف ایمنی: شرط به‌روزرسانی به جای دقیقاً ۱ سطر، ${res.rowCount} سطر را هدف قرار داد. تراکنش لغو شد.`,
      };
    }
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      operation: 'update',
      affectedRows: 0,
      executionTimeMs: Date.now() - startTime,
      error: err.message || `Failed to update row in "${schema}"."${table}".`,
      errorFa: `خطا در به‌روزرسانی سطر جدول "${schema}"."${table}": ${err.message || 'خطای تراکنش دیتابیس'}`,
    };
  }
}

/**
 * Deletes an identified target row within a safe transaction with strict row count verification.
 */
export async function deletePostgresTableRow(
  server: RemoteServer,
  params: PostgresRowDeleteRequest
): Promise<PostgresRowMutationResult> {
  const startTime = Date.now();
  const { database, schema, table, primaryKeyValues, ctid, originalRow } = params;

  if (!database || !schema || !table) {
    return {
      success: false,
      operation: 'delete',
      affectedRows: 0,
      error: 'Missing required parameters: database, schema, table.',
      errorFa: 'پارامترهای الزامی نام دیتابیس، اسکیما یا جدول ارسال نشده است.',
    };
  }

  const { client } = createPostgresClient(server, {
    database,
    port: params.port,
    user: params.user,
    password: params.password,
  });

  try {
    await client.connect();

    const colMap = await getTableCatalogColumns(client, schema, table);
    if (colMap.size === 0) {
      await client.end();
      return {
        success: false,
        operation: 'delete',
        affectedRows: 0,
        error: `Table "${schema}"."${table}" does not exist.`,
        errorFa: `جدول "${schema}"."${table}" یافت نشد.`,
      };
    }

    const safeSchemaIdent = `"${schema.trim().replace(/"/g, '""')}"`;
    const safeTableIdent = `"${table.trim().replace(/"/g, '""')}"`;
    const fullRelationIdent = `${safeSchemaIdent}.${safeTableIdent}`;

    const whereClauses: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (primaryKeyValues && Object.keys(primaryKeyValues).length > 0) {
      for (const [pkCol, pkVal] of Object.entries(primaryKeyValues)) {
        if (!colMap.has(pkCol)) continue;
        const safePkIdent = `"${pkCol.replace(/"/g, '""')}"`;
        if (pkVal === null || pkVal === undefined) {
          whereClauses.push(`${safePkIdent} IS NULL`);
        } else {
          whereClauses.push(`${safePkIdent} = $${paramIndex++}`);
          queryParams.push(pkVal);
        }
      }
    }

    if (whereClauses.length === 0 && ctid && typeof ctid === 'string' && /^\(\d+,\d+\)$/.test(ctid.trim())) {
      whereClauses.push(`ctid = $${paramIndex++}::tid`);
      queryParams.push(ctid.trim());
    }

    if (whereClauses.length === 0 && originalRow && Object.keys(originalRow).length > 0) {
      for (const [colName, origVal] of Object.entries(originalRow)) {
        if (!colMap.has(colName)) continue;
        const safeColIdent = `"${colName.replace(/"/g, '""')}"`;
        if (origVal === null || origVal === undefined) {
          whereClauses.push(`${safeColIdent} IS NULL`);
        } else {
          whereClauses.push(`${safeColIdent}::text = $${paramIndex++}::text`);
          queryParams.push(String(origVal));
        }
      }
    }

    if (whereClauses.length === 0) {
      await client.end();
      return {
        success: false,
        operation: 'delete',
        affectedRows: 0,
        error: 'Unable to identify unique target row. Delete requires primary key, ctid, or complete row values.',
        errorFa: 'شناسایی دقیق سطر هدف برای حذف ممکن نشد. عملیات نیازمند کلید اصلی، شناسه ctid یا مقادیر کامل سطر است.',
      };
    }

    const deleteSql = `
      DELETE FROM ${fullRelationIdent}
      WHERE ${whereClauses.join(' AND ')};
    `;

    await client.query('BEGIN;');
    const res = await client.query(deleteSql, queryParams);

    if (res.rowCount === 1) {
      await client.query('COMMIT;');
      await client.end();
      return {
        success: true,
        operation: 'delete',
        affectedRows: 1,
        executionTimeMs: Date.now() - startTime,
        message: `Successfully deleted 1 row from "${schema}"."${table}".`,
        messageFa: `۱ سطر با موفقیت از جدول "${schema}"."${table}" حذف شد.`,
      };
    } else if (res.rowCount === 0) {
      await client.query('ROLLBACK;');
      await client.end();
      return {
        success: false,
        operation: 'delete',
        affectedRows: 0,
        executionTimeMs: Date.now() - startTime,
        error: 'Target row was not found or was already deleted by another session. Transaction rolled back.',
        errorFa: 'سطر هدف یافت نشد یا قبلاً توسط نشست دیگری حذف شده است. تراکنش لغو شد.',
      };
    } else {
      await client.query('ROLLBACK;');
      await client.end();
      return {
        success: false,
        operation: 'delete',
        affectedRows: res.rowCount || 0,
        executionTimeMs: Date.now() - startTime,
        error: `Safety abort: Delete condition matched ${res.rowCount} rows instead of exactly 1. Transaction rolled back.`,
        errorFa: `توقف ایمنی: شرط حذف به جای دقیقاً ۱ سطر، ${res.rowCount} سطر را هدف قرار داد. تراکنش لغو شد.`,
      };
    }
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      operation: 'delete',
      affectedRows: 0,
      executionTimeMs: Date.now() - startTime,
      error: err.message || `Failed to delete row from "${schema}"."${table}".`,
      errorFa: `خطا در حذف سطر از جدول "${schema}"."${table}": ${err.message || 'خطای تراکنش دیتابیس'}`,
    };
  }
}

/**
 * ============================================================================
 * PHASE 8: SQL QUERY EDITOR & WORKSPACE
 * Safe, flexible SQL query execution engine supporting single/multiple statements,
 * runtime telemetry (duration, row count), error position diagnosis, and
 * safe result-set serialization.
 * ============================================================================
 */

export interface PostgresQueryExecutionParams {
  database: string;
  schema?: string;
  query: string;
  maxRows?: number;
  explain?: boolean;
  confirmedDestructive?: boolean;
  auditNotes?: string;
  port?: number;
  user?: string;
  password?: string;
}

export async function executePostgresQuery(
  server: RemoteServer,
  params: PostgresQueryExecutionParams
): Promise<{
  success: boolean;
  results?: Array<{
    command: string;
    rowCount: number;
    fields: Array<{ name: string; dataTypeId?: number }>;
    rows: Record<string, any>[];
    durationMs: number;
    isTruncated?: boolean;
    totalRowsReturned?: number;
  }>;
  totalDurationMs?: number;
  executedAt?: string;
  safetyReport?: PostgresSqlQuerySafetyReport;
  requiresConfirmation?: boolean;
  error?: {
    message: string;
    code?: string;
    position?: number;
    line?: number;
    column?: number;
    detail?: string;
    hint?: string;
    where?: string;
    schema?: string;
    table?: string;
  };
  errorFa?: string;
}> {
  const { database, schema, query, maxRows = 1000, explain = false, confirmedDestructive = false } = params;

  if (!database || !database.trim()) {
    return {
      success: false,
      error: { message: 'Database name is required for executing queries.' },
      errorFa: 'انتخاب پایگاه داده برای اجرای کوئری الزامی است.',
    };
  }

  if (!query || !query.trim()) {
    return {
      success: false,
      error: { message: 'Query string cannot be empty.' },
      errorFa: 'متن کوئری نمی‌تواند خالی باشد.',
    };
  }

  // Phase 9: SQL Safety & Risk Classification
  const safetyReport = analyzePostgresSqlSafety(query);

  // If query contains destructive operations and user hasn't explicitly confirmed it, block execution
  if (safetyReport.isDestructive && !confirmedDestructive) {
    return {
      success: false,
      requiresConfirmation: true,
      safetyReport,
      totalDurationMs: 0,
      executedAt: new Date().toISOString(),
      error: {
        message: `Destructive operation blocked by SQL Safety Guard: ${safetyReport.destructiveReasons.join('; ')}. Explicit operator confirmation is required.`,
      },
      errorFa: `عملیات مخرب توسط سامانه ایمنی SQL متوقف شد: ${safetyReport.destructiveReasonsFa.join('؛ ')}. نیاز به تأیید صریح اپراتور دارد.`,
    };
  }

  const { client, targetHost, targetPort } = createPostgresClient(server, {
    database: database.trim(),
    port: params.port,
    user: params.user,
    password: params.password,
  });

  const overallStartTime = Date.now();

  try {
    await client.connect();

    // Optionally set search_path if schema is provided
    if (schema && schema.trim()) {
      const safeSchemaIdent = `"${schema.trim().replace(/"/g, '""')}"`;
      await client.query(`SET search_path TO ${safeSchemaIdent}, public;`);
    }

    const trimmedQuery = query.trim();
    const queryToExecute = explain
      ? `EXPLAIN (ANALYZE, BUFFERS, COSTS, VERBOSE, FORMAT TEXT) ${trimmedQuery}`
      : trimmedQuery;

    const queryStartTime = Date.now();
    // node-postgres client.query can return a single QueryResult or QueryResult[] for multi-statement
    const rawRes = await client.query(queryToExecute);
    const queryDuration = Date.now() - queryStartTime;

    const rawResults = Array.isArray(rawRes) ? rawRes : [rawRes];
    const results = rawResults.map((r) => {
      const allRows = r.rows || [];
      const totalRowsReturned = allRows.length;
      const isTruncated = totalRowsReturned > maxRows;
      const cappedRows = isTruncated ? allRows.slice(0, maxRows) : allRows;

      // Sanitize rows for JSON transport (Dates, Buffers, BigInts, etc.)
      const sanitizedRows = cappedRows.map((row) => {
        const cleanRow: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
          if (val === null || val === undefined) {
            cleanRow[key] = null;
          } else if (typeof val === 'bigint') {
            cleanRow[key] = val.toString();
          } else if (Buffer.isBuffer(val)) {
            cleanRow[key] = `\\x${val.toString('hex')}`;
          } else if (val instanceof Date) {
            cleanRow[key] = val.toISOString();
          } else {
            cleanRow[key] = val;
          }
        }
        return cleanRow;
      });

      const fields = (r.fields || []).map((f) => ({
        name: f.name,
        dataTypeId: f.dataTypeID,
      }));

      return {
        command: r.command || 'SELECT',
        rowCount: r.rowCount !== null && r.rowCount !== undefined ? r.rowCount : totalRowsReturned,
        fields,
        rows: sanitizedRows,
        durationMs: queryDuration,
        isTruncated,
        totalRowsReturned,
      };
    });

    const totalDurationMs = Date.now() - overallStartTime;

    return {
      success: true,
      results,
      safetyReport,
      totalDurationMs,
      executedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    const totalDurationMs = Date.now() - overallStartTime;

    // Calculate error line and column if position is present
    let line: number | undefined;
    let column: number | undefined;
    if (err.position && !isNaN(Number(err.position))) {
      const pos = Number(err.position);
      const upToPos = query.slice(0, Math.max(0, pos - 1));
      const lines = upToPos.split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    }

    return {
      success: false,
      safetyReport,
      totalDurationMs,
      executedAt: new Date().toISOString(),
      error: {
        message: err.message || 'PostgreSQL query execution failed.',
        code: err.code ? String(err.code) : undefined,
        position: err.position ? Number(err.position) : undefined,
        line,
        column,
        detail: err.detail,
        hint: err.hint,
        where: err.where,
        schema: err.schema,
        table: err.table,
      },
      errorFa: `خطا در اجرای کوئری SQL: ${err.message || 'خطای سرور دیتابیس'}`,
    };
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

// ==========================================
// Phase 10: Role & User Management Functions
// ==========================================

function sanitizeIdentifier(ident: string): string {
  const clean = ident.trim();
  if (!clean || !/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(clean)) {
    throw new Error(`Invalid PostgreSQL identifier: "${ident}"`);
  }
  return `"${clean.replace(/"/g, '""')}"`;
}

/**
 * Creates a new PostgreSQL user or role with specified privileges.
 */
export async function createPostgresRole(
  server: RemoteServer,
  req: {
    rolname: string;
    canLogin: boolean;
    isSuperuser?: boolean;
    createDb?: boolean;
    createRole?: boolean;
    replication?: boolean;
    bypassRls?: boolean;
    connectionLimit?: number;
    validUntil?: string | null;
    password?: string;
    memberOf?: string[];
    comment?: string;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const roleName = req.rolname?.trim();
  if (!roleName) {
    return {
      success: false,
      message: 'Role/User name is required.',
      messageFa: 'نام نقش یا کاربر الزامی است.',
      error: 'Missing role name',
    };
  }

  try {
    const quotedRole = sanitizeIdentifier(roleName);
    const clauses: string[] = [];

    clauses.push(req.canLogin ? 'LOGIN' : 'NOLOGIN');
    clauses.push(req.isSuperuser ? 'SUPERUSER' : 'NOSUPERUSER');
    clauses.push(req.createDb ? 'CREATEDB' : 'NOCREATEDB');
    clauses.push(req.createRole ? 'CREATEROLE' : 'NOCREATEROLE');
    clauses.push(req.replication ? 'REPLICATION' : 'NOREPLICATION');
    clauses.push(req.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS');

    if (req.connectionLimit !== undefined && !isNaN(Number(req.connectionLimit))) {
      clauses.push(`CONNECTION LIMIT ${Number(req.connectionLimit)}`);
    }

    if (req.validUntil && req.validUntil.trim()) {
      const escapedUntil = req.validUntil.trim().replace(/'/g, "''");
      clauses.push(`VALID UNTIL '${escapedUntil}'`);
    } else if (req.validUntil === null) {
      clauses.push(`VALID UNTIL 'infinity'`);
    }

    if (req.password) {
      const escapedPass = req.password.replace(/'/g, "''");
      clauses.push(`PASSWORD '${escapedPass}'`);
    }

    if (req.memberOf && Array.isArray(req.memberOf) && req.memberOf.length > 0) {
      const validGroups = req.memberOf.map((g) => sanitizeIdentifier(g)).join(', ');
      clauses.push(`IN ROLE ${validGroups}`);
    }

    const sql = `CREATE ROLE ${quotedRole} ${clauses.join(' ')};`;

    await client.connect();
    await client.query('BEGIN;');
    await client.query(sql);

    if (req.comment !== undefined) {
      const escapedComment = req.comment.replace(/'/g, "''");
      await client.query(`COMMENT ON ROLE ${quotedRole} IS '${escapedComment}';`);
    }

    await client.query('COMMIT;');
    await client.end();

    return {
      success: true,
      message: `Role "${roleName}" created successfully.`,
      messageFa: `نقش یا کاربر "${roleName}" با موفقیت ایجاد گردید.`,
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to create role "${roleName}".`,
      messageFa: `خطا در ایجاد نقش یا کاربر "${roleName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Updates privileges, limits, and settings of an existing role.
 */
export async function updatePostgresRole(
  server: RemoteServer,
  req: {
    rolname: string;
    canLogin?: boolean;
    isSuperuser?: boolean;
    createDb?: boolean;
    createRole?: boolean;
    replication?: boolean;
    bypassRls?: boolean;
    connectionLimit?: number;
    validUntil?: string | null;
    comment?: string;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const roleName = req.rolname?.trim();
  if (!roleName) {
    return {
      success: false,
      message: 'Role name is required.',
      messageFa: 'نام نقش الزامی است.',
      error: 'Missing role name',
    };
  }

  try {
    const quotedRole = sanitizeIdentifier(roleName);
    const clauses: string[] = [];

    if (req.canLogin !== undefined) clauses.push(req.canLogin ? 'LOGIN' : 'NOLOGIN');
    if (req.isSuperuser !== undefined) clauses.push(req.isSuperuser ? 'SUPERUSER' : 'NOSUPERUSER');
    if (req.createDb !== undefined) clauses.push(req.createDb ? 'CREATEDB' : 'NOCREATEDB');
    if (req.createRole !== undefined) clauses.push(req.createRole ? 'CREATEROLE' : 'NOCREATEROLE');
    if (req.replication !== undefined) clauses.push(req.replication ? 'REPLICATION' : 'NOREPLICATION');
    if (req.bypassRls !== undefined) clauses.push(req.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS');

    if (req.connectionLimit !== undefined && !isNaN(Number(req.connectionLimit))) {
      clauses.push(`CONNECTION LIMIT ${Number(req.connectionLimit)}`);
    }

    if (req.validUntil !== undefined) {
      if (req.validUntil && req.validUntil.trim()) {
        const escapedUntil = req.validUntil.trim().replace(/'/g, "''");
        clauses.push(`VALID UNTIL '${escapedUntil}'`);
      } else {
        clauses.push(`VALID UNTIL 'infinity'`);
      }
    }

    await client.connect();
    await client.query('BEGIN;');

    if (clauses.length > 0) {
      const sql = `ALTER ROLE ${quotedRole} ${clauses.join(' ')};`;
      await client.query(sql);
    }

    if (req.comment !== undefined) {
      const escapedComment = req.comment.replace(/'/g, "''");
      await client.query(`COMMENT ON ROLE ${quotedRole} IS '${escapedComment}';`);
    }

    await client.query('COMMIT;');
    await client.end();

    return {
      success: true,
      message: `Role "${roleName}" updated successfully.`,
      messageFa: `مشخصات نقش "${roleName}" با موفقیت به‌روزرسانی شد.`,
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to update role "${roleName}".`,
      messageFa: `خطا در به‌روزرسانی نقش "${roleName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Changes a role's password securely on the database backend without logging or client leaks.
 */
export async function changePostgresRolePassword(
  server: RemoteServer,
  req: {
    rolname: string;
    newPassword: string;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const roleName = req.rolname?.trim();
  if (!roleName) {
    return {
      success: false,
      message: 'Role name is required.',
      messageFa: 'نام نقش الزامی است.',
      error: 'Missing role name',
    };
  }

  if (typeof req.newPassword !== 'string' || req.newPassword.length === 0) {
    return {
      success: false,
      message: 'New password cannot be empty.',
      messageFa: 'کلمه عبور جدید نمی‌تواند خالی باشد.',
      error: 'Empty password',
    };
  }

  try {
    const quotedRole = sanitizeIdentifier(roleName);
    const escapedPass = req.newPassword.replace(/'/g, "''");
    const sql = `ALTER ROLE ${quotedRole} WITH PASSWORD '${escapedPass}';`;

    await client.connect();
    await client.query(sql);
    await client.end();

    return {
      success: true,
      message: `Password for "${roleName}" changed successfully.`,
      messageFa: `کلمه عبور نقش "${roleName}" با موفقیت تغییر یافت.`,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to change password for "${roleName}".`,
      messageFa: `خطا در تغییر کلمه عبور نقش "${roleName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Grants or revokes role membership (e.g. GRANT group_role TO user_role).
 */
export async function managePostgresRoleMembership(
  server: RemoteServer,
  req: {
    roleName: string;
    memberRole: string;
    action: 'grant' | 'revoke';
    adminOption?: boolean;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const roleName = req.roleName?.trim();
  const memberRole = req.memberRole?.trim();

  if (!roleName || !memberRole) {
    return {
      success: false,
      message: 'Both parent role and member role are required.',
      messageFa: 'هم نام نقش والد و هم نقش عضو الزامی هستند.',
      error: 'Missing role names',
    };
  }

  try {
    const quotedParent = sanitizeIdentifier(roleName);
    const quotedMember = sanitizeIdentifier(memberRole);

    let sql = '';
    if (req.action === 'grant') {
      const adminOpt = req.adminOption ? ' WITH ADMIN OPTION' : '';
      sql = `GRANT ${quotedParent} TO ${quotedMember}${adminOpt};`;
    } else {
      sql = `REVOKE ${quotedParent} FROM ${quotedMember};`;
    }

    await client.connect();
    await client.query(sql);
    await client.end();

    const actionText = req.action === 'grant' ? 'granted to' : 'revoked from';
    const actionTextFa = req.action === 'grant' ? 'اختصاص یافت به' : 'سلب گردید از';

    return {
      success: true,
      message: `Role "${roleName}" successfully ${actionText} "${memberRole}".`,
      messageFa: `عضویت در نقش "${roleName}" با موفقیت ${actionTextFa} "${memberRole}".`,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to ${req.action} role membership.`,
      messageFa: `خطا در ویرایش عضویت نقش.`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Safely drops a role with pre-drop owned object handling (REASSIGN OWNED or DROP OWNED).
 */
export async function dropPostgresRole(
  server: RemoteServer,
  req: {
    rolname: string;
    reassignOwnedTo?: string;
    dropOwned?: boolean;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const roleName = req.rolname?.trim();
  if (!roleName) {
    return {
      success: false,
      message: 'Role name is required.',
      messageFa: 'نام نقش الزامی است.',
      error: 'Missing role name',
    };
  }

  try {
    const quotedRole = sanitizeIdentifier(roleName);

    await client.connect();
    await client.query('BEGIN;');

    if (req.reassignOwnedTo && req.reassignOwnedTo.trim()) {
      const quotedTarget = sanitizeIdentifier(req.reassignOwnedTo.trim());
      await client.query(`REASSIGN OWNED BY ${quotedRole} TO ${quotedTarget};`);
    }

    if (req.dropOwned) {
      await client.query(`DROP OWNED BY ${quotedRole};`);
    }

    await client.query(`DROP ROLE ${quotedRole};`);
    await client.query('COMMIT;');
    await client.end();

    return {
      success: true,
      message: `Role "${roleName}" has been dropped successfully.`,
      messageFa: `نقش یا کاربر "${roleName}" با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to drop role "${roleName}".`,
      messageFa: `خطا در حذف نقش "${roleName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

// ==========================================
// Phase 11: Permissions & Access Management
// ==========================================

export const SCOPE_PRIVILEGES: Record<string, string[]> = {
  database: ['CONNECT', 'CREATE', 'TEMPORARY'],
  schema: ['USAGE', 'CREATE'],
  table: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
  sequence: ['USAGE', 'SELECT', 'UPDATE'],
  function: ['EXECUTE'],
};

/**
 * Retrieves the ownership and granted privileges matrix for a given PostgreSQL object.
 */
export async function getPostgresObjectPermissions(
  server: RemoteServer,
  options: {
    scope: 'database' | 'schema' | 'table' | 'sequence' | 'function';
    database: string;
    schema?: string;
    objectName: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; data?: any; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: options.database,
    port: options.port,
    user: options.user,
    password: options.password,
  });

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  const { scope, database, schema = 'public', objectName } = options;

  try {
    await client.connect();

    // 1. Fetch all available roles in the cluster
    const rolesRes = await client.query(`
      SELECT rolname, rolsuper as is_superuser
      FROM pg_catalog.pg_roles
      ORDER BY rolsuper DESC, rolname ASC;
    `);

    const allRoles: string[] = (rolesRes.rows || []).map((r: any) => String(r.rolname));
    const superusers = new Set((rolesRes.rows || []).filter((r: any) => Boolean(r.is_superuser)).map((r: any) => String(r.rolname)));

    let owner = 'postgres';
    const roleGrantsMap: Record<string, { privilege: string; isGrantable: boolean }[]> = {};

    // Helper to add grant
    const addGrant = (grantee: string, privilege: string, isGrantable: boolean) => {
      const g = grantee === 'PUBLIC' ? 'public' : grantee;
      if (!roleGrantsMap[g]) roleGrantsMap[g] = [];
      if (!roleGrantsMap[g].some((item) => item.privilege === privilege)) {
        roleGrantsMap[g].push({ privilege, isGrantable });
      }
    };

    if (scope === 'database') {
      // Database owner and privileges
      const dbRes = await client.query(
        `SELECT pg_catalog.pg_get_userbyid(d.datdba) as owner, d.datacl
         FROM pg_catalog.pg_database d
         WHERE d.datname = $1`,
        [objectName || database]
      );
      if (dbRes.rows?.length) {
        owner = String(dbRes.rows[0].owner || 'postgres');
      }

      // Check has_database_privilege for roles
      const privilegesToCheck = SCOPE_PRIVILEGES.database;
      for (const r of allRoles) {
        for (const priv of privilegesToCheck) {
          try {
            const checkRes = await client.query(
              `SELECT has_database_privilege($1, $2, $3) as has_priv`,
              [r, objectName || database, priv]
            );
            if (checkRes.rows?.[0]?.has_priv) {
              addGrant(r, priv, false);
            }
          } catch {}
        }
      }
    } else if (scope === 'schema') {
      // Schema owner
      const schemaRes = await client.query(
        `SELECT pg_catalog.pg_get_userbyid(n.nspowner) as owner
         FROM pg_catalog.pg_namespace n
         WHERE n.nspname = $1`,
        [objectName]
      );
      if (schemaRes.rows?.length) {
        owner = String(schemaRes.rows[0].owner || 'postgres');
      }

      const privilegesToCheck = SCOPE_PRIVILEGES.schema;
      for (const r of allRoles) {
        for (const priv of privilegesToCheck) {
          try {
            const checkRes = await client.query(
              `SELECT has_schema_privilege($1, $2, $3) as has_priv`,
              [r, objectName, priv]
            );
            if (checkRes.rows?.[0]?.has_priv) {
              addGrant(r, priv, false);
            }
          } catch {}
        }
      }
    } else if (scope === 'table') {
      // Table owner
      const tableRes = await client.query(
        `SELECT pg_catalog.pg_get_userbyid(c.relowner) as owner
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2`,
        [schema, objectName]
      );
      if (tableRes.rows?.length) {
        owner = String(tableRes.rows[0].owner || 'postgres');
      }

      // Query information_schema.table_privileges
      const privRes = await client.query(
        `SELECT grantee, privilege_type, is_grantable
         FROM information_schema.table_privileges
         WHERE table_schema = $1 AND table_name = $2`,
        [schema, objectName]
      );

      for (const row of privRes.rows || []) {
        addGrant(String(row.grantee), String(row.privilege_type).toUpperCase(), row.is_grantable === 'YES');
      }
    } else if (scope === 'sequence') {
      // Sequence owner
      const seqRes = await client.query(
        `SELECT pg_catalog.pg_get_userbyid(c.relowner) as owner
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2`,
        [schema, objectName]
      );
      if (seqRes.rows?.length) {
        owner = String(seqRes.rows[0].owner || 'postgres');
      }

      const privilegesToCheck = SCOPE_PRIVILEGES.sequence;
      for (const r of allRoles) {
        for (const priv of privilegesToCheck) {
          try {
            const checkRes = await client.query(
              `SELECT has_sequence_privilege($1, quote_ident($2) || '.' || quote_ident($3), $4) as has_priv`,
              [r, schema, objectName, priv]
            );
            if (checkRes.rows?.[0]?.has_priv) {
              addGrant(r, priv, false);
            }
          } catch {}
        }
      }
    } else if (scope === 'function') {
      // Routine privileges
      const funcRes = await client.query(
        `SELECT pg_catalog.pg_get_userbyid(p.proowner) as owner
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = $1 AND p.proname = $2
         LIMIT 1`,
        [schema, objectName]
      );
      if (funcRes.rows?.length) {
        owner = String(funcRes.rows[0].owner || 'postgres');
      }

      const privRes = await client.query(
        `SELECT grantee, privilege_type, is_grantable
         FROM information_schema.routine_privileges
         WHERE routine_schema = $1 AND routine_name = $2`,
        [schema, objectName]
      );

      for (const row of privRes.rows || []) {
        addGrant(String(row.grantee), String(row.privilege_type).toUpperCase(), row.is_grantable === 'YES');
      }
    }

    await client.end();

    // Build complete roleGrants array
    const roleGrants = allRoles.map((r) => ({
      roleName: r,
      isSuperuser: superusers.has(r),
      isOwner: r === owner,
      privileges: roleGrantsMap[r] || [],
    }));

    // Add public pseudo-role
    if (roleGrantsMap['public'] && roleGrantsMap['public'].length > 0) {
      roleGrants.unshift({
        roleName: 'PUBLIC',
        isSuperuser: false,
        isOwner: false,
        privileges: roleGrantsMap['public'],
      });
    }

    const applicablePrivileges = SCOPE_PRIVILEGES[scope] || [];

    return {
      success: true,
      data: {
        scope,
        database,
        schema,
        objectName,
        owner,
        allRoles,
        roleGrants,
        applicablePrivileges,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || 'Failed to inspect object permissions',
      errorFa: `خطا در بازیابی سطوح دسترسی شیء: ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * Applies a batch of GRANT / REVOKE permission deltas inside a transaction.
 */
export async function applyPostgresPermissions(
  server: RemoteServer,
  req: {
    scope: 'database' | 'schema' | 'table' | 'sequence' | 'function';
    database: string;
    schema?: string;
    objectName: string;
    deltas: {
      roleName: string;
      privilege: string;
      action: 'grant' | 'revoke';
      withGrantOption?: boolean;
    }[];
    cascade?: boolean;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{
  success: boolean;
  executedQueries: string[];
  message: string;
  messageFa: string;
  error?: string;
  errorFa?: string;
}> {
  const { client, targetHost } = createPostgresClient(server, {
    database: req.database,
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      executedQueries: [],
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const { scope, schema = 'public', objectName, deltas = [] } = req;

  if (deltas.length === 0) {
    return {
      success: true,
      executedQueries: [],
      message: 'No permission changes to apply.',
      messageFa: 'هیچ تغییری در سطوح دسترسی جهت اعمال وجود ندارد.',
    };
  }

  // Construct target object SQL identifier
  let targetSql = '';
  if (scope === 'database') {
    targetSql = `DATABASE ${sanitizeIdentifier(objectName || req.database)}`;
  } else if (scope === 'schema') {
    targetSql = `SCHEMA ${sanitizeIdentifier(objectName)}`;
  } else if (scope === 'table') {
    targetSql = `TABLE ${sanitizeIdentifier(schema)}.${sanitizeIdentifier(objectName)}`;
  } else if (scope === 'sequence') {
    targetSql = `SEQUENCE ${sanitizeIdentifier(schema)}.${sanitizeIdentifier(objectName)}`;
  } else if (scope === 'function') {
    targetSql = `ROUTINE ${sanitizeIdentifier(schema)}.${sanitizeIdentifier(objectName)}`;
  }

  const generatedQueries: string[] = [];

  for (const delta of deltas) {
    const roleTarget = delta.roleName.toUpperCase() === 'PUBLIC' ? 'PUBLIC' : sanitizeIdentifier(delta.roleName);
    const validPrivs = SCOPE_PRIVILEGES[scope] || [];
    const privUpper = delta.privilege.toUpperCase();

    if (!validPrivs.includes(privUpper) && privUpper !== 'ALL') {
      continue;
    }

    if (delta.action === 'grant') {
      const grantOptionSql = delta.withGrantOption ? ' WITH GRANT OPTION' : '';
      generatedQueries.push(`GRANT ${privUpper} ON ${targetSql} TO ${roleTarget}${grantOptionSql};`);
    } else {
      const cascadeSql = req.cascade ? ' CASCADE' : ' RESTRICT';
      generatedQueries.push(`REVOKE ${privUpper} ON ${targetSql} FROM ${roleTarget}${cascadeSql};`);
    }
  }

  if (generatedQueries.length === 0) {
    return {
      success: true,
      executedQueries: [],
      message: 'No valid permission SQL statements generated.',
      messageFa: 'دستور معتبری برای تغییر دسترسی‌ها تولید نشد.',
    };
  }

  try {
    await client.connect();
    await client.query('BEGIN;');

    for (const sql of generatedQueries) {
      await client.query(sql);
    }

    await client.query('COMMIT;');
    await client.end();

    return {
      success: true,
      executedQueries: generatedQueries,
      message: `Successfully updated permissions on ${scope} "${objectName}".`,
      messageFa: `سطوح دسترسی ${scope} "${objectName}" با موفقیت به‌روزرسانی شد.`,
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      executedQueries: generatedQueries,
      message: `Failed to update permissions: ${err.message || 'Unknown error'}`,
      messageFa: `خطا در اعمال تغییرات دسترسی: ${err.message || 'خطای ناشناخته'}`,
      error: err.message,
      errorFa: `خطای پایگاه داده: ${err.message}`,
    };
  }
}

// ==========================================
// Phase 12: Database & Schema Lifecycle Operations
// ==========================================

/**
 * Creates a new PostgreSQL Database with customized encoding, collation, owner, template, and tablespace.
 * NOTE: CREATE DATABASE cannot run inside a transaction block in PostgreSQL.
 */
export async function createPostgresDatabase(
  server: RemoteServer,
  req: {
    name: string;
    owner?: string;
    template?: string;
    encoding?: string;
    lcCollate?: string;
    lcCtype?: string;
    tablespace?: string;
    connectionLimit?: number;
    isTemplate?: boolean;
    allowConnections?: boolean;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: 'postgres',
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const dbName = req.name?.trim();
  if (!dbName) {
    return {
      success: false,
      message: 'Database name is required.',
      messageFa: 'نام پایگاه داده الزامی است.',
      error: 'Missing database name',
    };
  }

  try {
    const quotedDb = sanitizeIdentifier(dbName);
    const clauses: string[] = [];

    if (req.owner && req.owner.trim()) {
      clauses.push(`OWNER = ${sanitizeIdentifier(req.owner.trim())}`);
    }
    if (req.template && req.template.trim()) {
      clauses.push(`TEMPLATE = ${sanitizeIdentifier(req.template.trim())}`);
    }
    if (req.encoding && req.encoding.trim()) {
      const enc = req.encoding.trim().replace(/'/g, "''");
      clauses.push(`ENCODING = '${enc}'`);
    }
    if (req.lcCollate && req.lcCollate.trim()) {
      const col = req.lcCollate.trim().replace(/'/g, "''");
      clauses.push(`LC_COLLATE = '${col}'`);
    }
    if (req.lcCtype && req.lcCtype.trim()) {
      const ctype = req.lcCtype.trim().replace(/'/g, "''");
      clauses.push(`LC_CTYPE = '${ctype}'`);
    }
    if (req.tablespace && req.tablespace.trim()) {
      clauses.push(`TABLESPACE = ${sanitizeIdentifier(req.tablespace.trim())}`);
    }
    if (req.connectionLimit !== undefined && !isNaN(Number(req.connectionLimit))) {
      clauses.push(`CONNECTION LIMIT = ${Number(req.connectionLimit)}`);
    }
    if (req.isTemplate !== undefined) {
      clauses.push(`IS_TEMPLATE = ${req.isTemplate ? 'TRUE' : 'FALSE'}`);
    }
    if (req.allowConnections !== undefined) {
      clauses.push(`ALLOW_CONNECTIONS = ${req.allowConnections ? 'TRUE' : 'FALSE'}`);
    }

    const sqlWith = clauses.length > 0 ? ` WITH ${clauses.join(' ')}` : '';
    const sql = `CREATE DATABASE ${quotedDb}${sqlWith};`;

    await client.connect();
    await client.query(sql);
    await client.end();

    return {
      success: true,
      message: `Database "${dbName}" created successfully.`,
      messageFa: `پایگاه داده "${dbName}" با موفقیت ایجاد گردید.`,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to create database "${dbName}".`,
      messageFa: `خطا در ایجاد پایگاه داده "${dbName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Updates properties of an existing PostgreSQL Database (Rename, Owner, Connection Limit, Template status, Comment).
 */
export async function updatePostgresDatabase(
  server: RemoteServer,
  req: {
    name: string;
    newName?: string;
    owner?: string;
    connectionLimit?: number;
    allowConnections?: boolean;
    isTemplate?: boolean;
    tablespace?: string;
    comment?: string;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: 'postgres',
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const dbName = req.name?.trim();
  if (!dbName) {
    return {
      success: false,
      message: 'Database name is required.',
      messageFa: 'نام پایگاه داده الزامی است.',
      error: 'Missing database name',
    };
  }

  try {
    let currentQuoted = sanitizeIdentifier(dbName);
    await client.connect();

    // 1. Rename if requested
    if (req.newName && req.newName.trim() && req.newName.trim() !== dbName) {
      const newQuoted = sanitizeIdentifier(req.newName.trim());
      await client.query(`ALTER DATABASE ${currentQuoted} RENAME TO ${newQuoted};`);
      currentQuoted = newQuoted;
    }

    // 2. Change Owner
    if (req.owner && req.owner.trim()) {
      const ownerQuoted = sanitizeIdentifier(req.owner.trim());
      await client.query(`ALTER DATABASE ${currentQuoted} OWNER TO ${ownerQuoted};`);
    }

    // 3. Connection Limit
    if (req.connectionLimit !== undefined && !isNaN(Number(req.connectionLimit))) {
      await client.query(`ALTER DATABASE ${currentQuoted} CONNECTION LIMIT ${Number(req.connectionLimit)};`);
    }

    // 4. Allow Connections
    if (req.allowConnections !== undefined) {
      await client.query(`ALTER DATABASE ${currentQuoted} ALLOW_CONNECTIONS ${req.allowConnections ? 'TRUE' : 'FALSE'};`);
    }

    // 5. Is Template
    if (req.isTemplate !== undefined) {
      await client.query(`ALTER DATABASE ${currentQuoted} IS_TEMPLATE ${req.isTemplate ? 'TRUE' : 'FALSE'};`);
    }

    // 6. Tablespace
    if (req.tablespace && req.tablespace.trim()) {
      const tsQuoted = sanitizeIdentifier(req.tablespace.trim());
      await client.query(`ALTER DATABASE ${currentQuoted} SET TABLESPACE ${tsQuoted};`);
    }

    // 7. Comment
    if (req.comment !== undefined) {
      const escapedComment = req.comment.replace(/'/g, "''");
      await client.query(`COMMENT ON DATABASE ${currentQuoted} IS '${escapedComment}';`);
    }

    await client.end();

    const finalName = req.newName?.trim() || dbName;
    return {
      success: true,
      message: `Database "${finalName}" configuration updated successfully.`,
      messageFa: `پیکربندی پایگاه داده "${finalName}" با موفقیت به‌روزرسانی شد.`,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to update database "${dbName}".`,
      messageFa: `خطا در ویرایش پایگاه داده "${dbName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Drops an existing database, optionally terminating all active client connections first.
 */
export async function dropPostgresDatabase(
  server: RemoteServer,
  req: {
    name: string;
    forceWithDisconnect?: boolean;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: 'postgres',
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const dbName = req.name?.trim();
  if (!dbName) {
    return {
      success: false,
      message: 'Database name is required.',
      messageFa: 'نام پایگاه داده الزامی است.',
      error: 'Missing database name',
    };
  }

  if (['postgres', 'template0', 'template1'].includes(dbName.toLowerCase())) {
    return {
      success: false,
      message: `System database "${dbName}" cannot be dropped.`,
      messageFa: `حذف پایگاه داده سیستمی "${dbName}" مجاز نمی‌باشد.`,
      error: 'Cannot drop system database',
    };
  }

  try {
    const quotedDb = sanitizeIdentifier(dbName);
    await client.connect();

    if (req.forceWithDisconnect) {
      await client.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid();`,
        [dbName]
      );
    }

    try {
      await client.query(`DROP DATABASE ${quotedDb} WITH (FORCE);`);
    } catch {
      await client.query(`DROP DATABASE ${quotedDb};`);
    }

    await client.end();

    return {
      success: true,
      message: `Database "${dbName}" has been dropped successfully.`,
      messageFa: `پایگاه داده "${dbName}" با موفقیت حذف گردید.`,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to drop database "${dbName}".`,
      messageFa: `خطا در حذف پایگاه داده "${dbName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Retrieves detailed schemas list inside a specific database with table/view/routine counts and comments.
 */
export async function getPostgresSchemas(
  server: RemoteServer,
  options: {
    database: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<{ success: boolean; schemas?: any[]; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: options.database,
    port: options.port,
    user: options.user,
    password: options.password,
  });

  if (!targetHost) {
    return {
      success: false,
      error: 'Server host or IP address is missing.',
      errorFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
    };
  }

  try {
    await client.connect();

    const sql = `
      SELECT 
        n.nspname as name,
        pg_catalog.pg_get_userbyid(n.nspowner) as owner,
        COALESCE(tc.table_count, 0) as table_count,
        COALESCE(vc.view_count, 0) as view_count,
        COALESCE(rc.routine_count, 0) as routine_count,
        d.description as comment
      FROM pg_catalog.pg_namespace n
      LEFT JOIN (
        SELECT schemaname, count(*)::int as table_count 
        FROM pg_catalog.pg_tables 
        GROUP BY schemaname
      ) tc ON tc.schemaname = n.nspname
      LEFT JOIN (
        SELECT schemaname, count(*)::int as view_count 
        FROM pg_catalog.pg_views 
        GROUP BY schemaname
      ) vc ON vc.schemaname = n.nspname
      LEFT JOIN (
        SELECT routine_schema, count(*)::int as routine_count
        FROM information_schema.routines
        GROUP BY routine_schema
      ) rc ON rc.routine_schema = n.nspname
      LEFT JOIN pg_catalog.pg_description d ON d.objoid = n.oid AND d.classoid = 'pg_namespace'::regclass
      WHERE n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'
      ORDER BY 
        CASE 
          WHEN n.nspname = 'public' THEN 0 
          WHEN n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' THEN 1 
          ELSE 2 
        END,
        n.nspname ASC;
    `;

    const res = await client.query(sql);
    await client.end();

    const schemas = (res.rows || []).map((row: any) => ({
      name: String(row.name),
      owner: String(row.owner || 'postgres'),
      tableCount: Number(row.table_count) || 0,
      viewCount: Number(row.view_count) || 0,
      routineCount: Number(row.routine_count) || 0,
      comment: row.comment ? String(row.comment) : null,
    }));

    return { success: true, schemas };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      error: err.message || 'Failed to list schemas',
      errorFa: `خطا در دریافت لیست اسکیمای پایگاه داده: ${err.message || 'خطای شبکه'}`,
    };
  }
}

/**
 * Creates a new Schema within a specific database.
 */
export async function createPostgresSchema(
  server: RemoteServer,
  req: {
    database: string;
    name: string;
    owner?: string;
    comment?: string;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: req.database,
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const schemaName = req.name?.trim();
  if (!schemaName) {
    return {
      success: false,
      message: 'Schema name is required.',
      messageFa: 'نام اسکیما الزامی است.',
      error: 'Missing schema name',
    };
  }

  try {
    const quotedSchema = sanitizeIdentifier(schemaName);
    let authClause = '';
    if (req.owner && req.owner.trim()) {
      authClause = ` AUTHORIZATION ${sanitizeIdentifier(req.owner.trim())}`;
    }

    const sql = `CREATE SCHEMA ${quotedSchema}${authClause};`;

    await client.connect();
    await client.query('BEGIN;');
    await client.query(sql);

    if (req.comment !== undefined) {
      const escapedComment = req.comment.replace(/'/g, "''");
      await client.query(`COMMENT ON SCHEMA ${quotedSchema} IS '${escapedComment}';`);
    }

    await client.query('COMMIT;');
    await client.end();

    return {
      success: true,
      message: `Schema "${schemaName}" created successfully in database "${req.database}".`,
      messageFa: `اسکیمای "${schemaName}" با موفقیت در دیتابیس "${req.database}" ایجاد شد.`,
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to create schema "${schemaName}".`,
      messageFa: `خطا در ایجاد اسکیمای "${schemaName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Updates schema properties (Rename, Owner, Comment).
 */
export async function updatePostgresSchema(
  server: RemoteServer,
  req: {
    database: string;
    name: string;
    newName?: string;
    owner?: string;
    comment?: string;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: req.database,
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const schemaName = req.name?.trim();
  if (!schemaName) {
    return {
      success: false,
      message: 'Schema name is required.',
      messageFa: 'نام اسکیما الزامی است.',
      error: 'Missing schema name',
    };
  }

  try {
    let currentQuoted = sanitizeIdentifier(schemaName);

    await client.connect();
    await client.query('BEGIN;');

    if (req.newName && req.newName.trim() && req.newName.trim() !== schemaName) {
      const newQuoted = sanitizeIdentifier(req.newName.trim());
      await client.query(`ALTER SCHEMA ${currentQuoted} RENAME TO ${newQuoted};`);
      currentQuoted = newQuoted;
    }

    if (req.owner && req.owner.trim()) {
      const ownerQuoted = sanitizeIdentifier(req.owner.trim());
      await client.query(`ALTER SCHEMA ${currentQuoted} OWNER TO ${ownerQuoted};`);
    }

    if (req.comment !== undefined) {
      const escapedComment = req.comment.replace(/'/g, "''");
      await client.query(`COMMENT ON SCHEMA ${currentQuoted} IS '${escapedComment}';`);
    }

    await client.query('COMMIT;');
    await client.end();

    const finalName = req.newName?.trim() || schemaName;
    return {
      success: true,
      message: `Schema "${finalName}" updated successfully.`,
      messageFa: `مشخصات اسکیمای "${finalName}" با موفقیت به‌روزرسانی شد.`,
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK;');
    } catch {}
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to update schema "${schemaName}".`,
      messageFa: `خطا در ویرایش اسکیمای "${schemaName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

/**
 * Drops an existing Schema inside a database.
 */
export async function dropPostgresSchema(
  server: RemoteServer,
  req: {
    database: string;
    name: string;
    cascade?: boolean;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{ success: boolean; message: string; messageFa: string; error?: string; errorFa?: string }> {
  const { client, targetHost } = createPostgresClient(server, {
    database: req.database,
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  if (!targetHost) {
    return {
      success: false,
      message: 'Server host or IP address is missing.',
      messageFa: 'آدرس هاست یا IP سرور مشخص نشده است.',
      error: 'Missing host',
    };
  }

  const schemaName = req.name?.trim();
  if (!schemaName) {
    return {
      success: false,
      message: 'Schema name is required.',
      messageFa: 'نام اسکیما الزامی است.',
      error: 'Missing schema name',
    };
  }

  if (['pg_catalog', 'information_schema', 'pg_toast'].includes(schemaName.toLowerCase())) {
    return {
      success: false,
      message: `System schema "${schemaName}" cannot be dropped.`,
      messageFa: `حذف اسکیمای سیستمی "${schemaName}" مجاز نمی‌باشد.`,
      error: 'Cannot drop system schema',
    };
  }

  try {
    const quotedSchema = sanitizeIdentifier(schemaName);
    const cascadeClause = req.cascade ? ' CASCADE' : ' RESTRICT';
    const sql = `DROP SCHEMA ${quotedSchema}${cascadeClause};`;

    await client.connect();
    await client.query(sql);
    await client.end();

    return {
      success: true,
      message: `Schema "${schemaName}" dropped successfully from database "${req.database}".`,
      messageFa: `اسکیمای "${schemaName}" با موفقیت از دیتابیس "${req.database}" حذف گردید.`,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to drop schema "${schemaName}".`,
      messageFa: `خطا در حذف اسکیمای "${schemaName}".`,
      error: err.message || 'Unknown error',
      errorFa: `خطای پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
    };
  }
}

// ==========================================
// Phase 13: PostgreSQL Backup & Restore
// ==========================================

export type PostgresBackupCategory = 'database' | 'configuration';
export type PostgresBackupMode = 'full' | 'schema_only' | 'data_only';
export type PostgresConfigBackupType = 'postgresql_conf' | 'pg_hba' | 'cluster_roles';
export type PostgresBackupFormat = 'plain' | 'custom' | 'tar';

export interface PostgresBackupItem {
  id: string;
  filename: string;
  category: PostgresBackupCategory;
  database?: string;
  configType?: PostgresConfigBackupType;
  sizeBytes: number;
  sizePretty: string;
  mode?: PostgresBackupMode;
  format: PostgresBackupFormat;
  createdAt: string;
  tablesCount?: number;
  schemasCount?: number;
  schemas?: string[];
  tables?: string[];
  compressionLevel?: number;
  downloadUrl?: string;
  engineUsed: 'native_pg_dump' | 'logical_sql_dumper' | 'config_snapshot';
  description?: string;
  descriptionFa?: string;
}

export interface PostgresCreateBackupRequest {
  category?: PostgresBackupCategory;
  database?: string;
  mode?: PostgresBackupMode;
  configType?: PostgresConfigBackupType;
  format?: PostgresBackupFormat;
  schemas?: string[];
  tables?: string[];
  includeDrop?: boolean;
  useInserts?: boolean;
  compressionLevel?: number;
  customFilename?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresCreateBackupResult {
  success: boolean;
  backup?: PostgresBackupItem;
  message: string;
  messageFa: string;
  error?: string;
  errorFa?: string;
  durationMs?: number;
  sqlDumpPreview?: string;
}

export interface PostgresRestoreBackupRequest {
  database: string;
  filename: string;
  category?: PostgresBackupCategory;
  cleanFirst?: boolean;
  singleTransaction?: boolean;
  exitOnError?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresRestoreBackupResult {
  success: boolean;
  message: string;
  messageFa: string;
  executedStatementsCount?: number;
  durationMs?: number;
  error?: string;
  errorFa?: string;
  outputLog?: string;
}

export interface PostgresValidateRestoreRequest {
  filename: string;
  targetDatabase?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresValidateRestoreResult {
  valid: boolean;
  backupItem?: PostgresBackupItem;
  targetDatabase: string;
  databaseExists: boolean;
  targetHasExistingData: boolean;
  existingTablesCount: number;
  existingTablesSample: string[];
  warning?: string;
  warningFa?: string;
  requiresExplicitConfirmation: boolean;
  error?: string;
  errorFa?: string;
}

export interface PostgresBackupPreviewResult {
  success: boolean;
  filename: string;
  content: string;
  totalLines: number;
  isTruncated: boolean;
  sizeBytes: number;
  category: PostgresBackupCategory;
  format: PostgresBackupFormat;
  error?: string;
  errorFa?: string;
}

function formatBytesPretty(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export function getPostgresBackupsDir(serverId: string): string {
  const dir = path.join(process.cwd(), 'data', 'postgres_backups', serverId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getPostgresBackupsMetaPath(serverId: string): string {
  return path.join(getPostgresBackupsDir(serverId), 'backups_meta.json');
}

function loadPostgresBackupsMeta(serverId: string): Record<string, PostgresBackupItem> {
  const metaPath = getPostgresBackupsMetaPath(serverId);
  try {
    if (fs.existsSync(metaPath)) {
      const content = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(content);
    }
  } catch {}
  return {};
}

function savePostgresBackupsMeta(serverId: string, meta: Record<string, PostgresBackupItem>): void {
  const metaPath = getPostgresBackupsMetaPath(serverId);
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch (err: any) {
    console.error('Failed to save postgres backup metadata:', err.message);
  }
}

/**
 * Returns the list of all backups stored for the given server
 */
export async function listPostgresBackups(server: RemoteServer): Promise<PostgresBackupItem[]> {
  const backupDir = getPostgresBackupsDir(server.id);
  const meta = loadPostgresBackupsMeta(server.id);

  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs.readdirSync(backupDir).filter((f) => f !== 'backups_meta.json');
  const items: PostgresBackupItem[] = [];

  for (const filename of files) {
    const filePath = path.join(backupDir, filename);
    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) continue;

      if (meta[filename]) {
        meta[filename].sizeBytes = stats.size;
        meta[filename].sizePretty = formatBytesPretty(stats.size);
        if (!meta[filename].category) {
          const isConf = filename.endsWith('.conf') || filename.includes('_conf_') || filename.startsWith('config_') || filename.includes('roles');
          meta[filename].category = isConf ? 'configuration' : 'database';
          if (filename.includes('hba')) meta[filename].configType = 'pg_hba';
          else if (filename.includes('roles')) meta[filename].configType = 'cluster_roles';
          else if (isConf) meta[filename].configType = 'postgresql_conf';
        }
        items.push(meta[filename]);
      } else {
        const isGz = filename.endsWith('.gz');
        const isDump = filename.endsWith('.dump');
        const isTar = filename.endsWith('.tar');
        const isConf = filename.endsWith('.conf') || filename.includes('_conf_') || filename.startsWith('config_') || filename.includes('roles');
        const baseName = filename.replace(/\.(sql(\.gz)?|dump|tar|conf)$/, '');
        const parts = baseName.split('_');
        const dbName = parts[0] || server.postgres_database || 'postgres';

        let category: PostgresBackupCategory = isConf ? 'configuration' : 'database';
        let configType: PostgresConfigBackupType | undefined;
        if (isConf) {
          if (filename.includes('hba')) configType = 'pg_hba';
          else if (filename.includes('roles')) configType = 'cluster_roles';
          else configType = 'postgresql_conf';
        }

        const item: PostgresBackupItem = {
          id: filename,
          filename,
          category,
          configType,
          database: category === 'database' ? dbName : (server.postgres_database || 'postgres'),
          sizeBytes: stats.size,
          sizePretty: formatBytesPretty(stats.size),
          mode: category === 'database' ? 'full' : undefined,
          format: isDump ? 'custom' : isTar ? 'tar' : 'plain',
          createdAt: stats.mtime.toISOString(),
          downloadUrl: `/api/remote-servers/${server.id}/postgres/backups/${encodeURIComponent(filename)}/download`,
          engineUsed: isConf ? 'config_snapshot' : 'logical_sql_dumper',
        };
        meta[filename] = item;
        items.push(item);
      }
    } catch {}
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  savePostgresBackupsMeta(server.id, meta);
  return items;
}

function escapeSqlValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 'NULL';
    return val.toString();
  }
  if (val instanceof Date) {
    return `'${val.toISOString()}'`;
  }
  if (typeof val === 'object') {
    const str = JSON.stringify(val).replace(/'/g, "''");
    return `'${str}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

async function performLogicalSqlDump(
  server: RemoteServer,
  req: PostgresCreateBackupRequest
): Promise<{ sqlContent: string; tablesCount: number; schemasCount: number; schemas: string[]; tables: string[] }> {
  const targetDb = req.database.trim();
  const { client } = createPostgresClient(server, {
    database: targetDb,
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  await client.connect();

  const lines: string[] = [];
  const timestamp = new Date().toISOString();

  lines.push(`-- ==============================================================`);
  lines.push(`-- NetTopology PostgreSQL Database Dump`);
  lines.push(`-- Server: ${server.ip || server.hostname || 'localhost'}:${server.postgres_port || 5432}`);
  lines.push(`-- Database: "${targetDb}"`);
  lines.push(`-- Generated At: ${timestamp}`);
  lines.push(`-- Mode: ${req.mode.toUpperCase()}`);
  lines.push(`-- ==============================================================`);
  lines.push(``);
  lines.push(`SET statement_timeout = 0;`);
  lines.push(`SET lock_timeout = 0;`);
  lines.push(`SET client_encoding = 'UTF8';`);
  lines.push(`SET standard_conforming_strings = on;`);
  lines.push(`SET check_function_bodies = false;`);
  lines.push(`SET client_min_messages = warning;`);
  lines.push(`SET row_security = off;`);
  lines.push(``);

  let schemaFilterSql = `nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND nspname NOT LIKE 'pg_temp%' AND nspname NOT LIKE 'pg_toast_temp%'`;
  if (req.schemas && req.schemas.length > 0) {
    const escapedSchemas = req.schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
    schemaFilterSql += ` AND nspname IN (${escapedSchemas})`;
  }

  const schemasRes = await client.query<{ schema_name: string; owner: string }>(`
    SELECT nspname AS schema_name, pg_get_userbyid(nspowner) AS owner
    FROM pg_namespace
    WHERE ${schemaFilterSql}
    ORDER BY nspname;
  `);

  const schemas = schemasRes.rows.map((r) => r.schema_name);

  if (req.mode !== 'data_only') {
    lines.push(`-- --------------------------------------------------------------`);
    lines.push(`-- Schemas`);
    lines.push(`-- --------------------------------------------------------------`);
    for (const row of schemasRes.rows) {
      if (req.includeDrop) {
        lines.push(`DROP SCHEMA IF EXISTS "${row.schema_name}" CASCADE;`);
      }
      lines.push(`CREATE SCHEMA IF NOT EXISTS "${row.schema_name}";`);
      lines.push(`ALTER SCHEMA "${row.schema_name}" OWNER TO "${row.owner}";`);
    }
    lines.push(``);

    const typesRes = await client.query<{
      schema_name: string;
      type_name: string;
      type_kind: string;
      enum_labels?: string;
    }>(`
      SELECT 
        n.nspname AS schema_name,
        t.typname AS type_name,
        t.typtype AS type_kind,
        CASE 
          WHEN t.typtype = 'e' THEN (
            SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
            FROM pg_enum
            WHERE enumtypid = t.oid
          )
          ELSE NULL
        END AS enum_labels
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE ${schemaFilterSql.replace(/nspname/g, 'n.nspname')}
        AND t.typtype = 'e'
      ORDER BY n.nspname, t.typname;
    `);

    if (typesRes.rows.length > 0) {
      lines.push(`-- --------------------------------------------------------------`);
      lines.push(`-- Custom Types`);
      lines.push(`-- --------------------------------------------------------------`);
      for (const t of typesRes.rows) {
        if (req.includeDrop) {
          lines.push(`DROP TYPE IF EXISTS "${t.schema_name}"."${t.type_name}" CASCADE;`);
        }
        if (t.type_kind === 'e' && t.enum_labels) {
          lines.push(`CREATE TYPE "${t.schema_name}"."${t.type_name}" AS ENUM (${t.enum_labels});`);
        }
      }
      lines.push(``);
    }
  }

  const seqRes = await client.query<{
    sequence_schema: string;
    sequence_name: string;
    data_type: string;
  }>(`
    SELECT 
      sequence_schema,
      sequence_name,
      data_type
    FROM information_schema.sequences
    WHERE sequence_schema IN (${schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ') || "''"})
    ORDER BY sequence_schema, sequence_name;
  `);

  if (req.mode !== 'data_only' && seqRes.rows.length > 0) {
    lines.push(`-- --------------------------------------------------------------`);
    lines.push(`-- Sequences`);
    lines.push(`-- --------------------------------------------------------------`);
    for (const seq of seqRes.rows) {
      if (req.includeDrop) {
        lines.push(`DROP SEQUENCE IF EXISTS "${seq.sequence_schema}"."${seq.sequence_name}" CASCADE;`);
      }
      lines.push(`CREATE SEQUENCE IF NOT EXISTS "${seq.sequence_schema}"."${seq.sequence_name}" AS ${seq.data_type};`);
    }
    lines.push(``);
  }

  let tableFilterSql = `c.relkind = 'r' AND n.nspname IN (${schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ') || "''"})`;
  if (req.tables && req.tables.length > 0) {
    const escapedTables = req.tables.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
    tableFilterSql += ` AND (c.relname IN (${escapedTables}) OR (n.nspname || '.' || c.relname) IN (${escapedTables}))`;
  }

  const tablesRes = await client.query<{
    schema_name: string;
    table_name: string;
    owner: string;
  }>(`
    SELECT 
      n.nspname AS schema_name,
      c.relname AS table_name,
      pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${tableFilterSql}
    ORDER BY n.nspname, c.relname;
  `);

  const tables: string[] = [];

  for (const table of tablesRes.rows) {
    const fullTableName = `"${table.schema_name}"."${table.table_name}"`;
    tables.push(`${table.schema_name}.${table.table_name}`);

    if (req.mode !== 'data_only') {
      lines.push(`-- --------------------------------------------------------------`);
      lines.push(`-- Table: ${fullTableName}`);
      lines.push(`-- --------------------------------------------------------------`);
      if (req.includeDrop) {
        lines.push(`DROP TABLE IF EXISTS ${fullTableName} CASCADE;`);
      }

      const colsRes = await client.query<{
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
        character_maximum_length: number | null;
      }>(`
        SELECT 
          column_name,
          data_type,
          udt_name,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position;
      `, [table.schema_name, table.table_name]);

      const colDefs: string[] = [];
      for (const col of colsRes.rows) {
        let typeStr = col.data_type.toUpperCase();
        if (typeStr === 'USER-DEFINED') {
          typeStr = `"${col.udt_name}"`;
        } else if (col.character_maximum_length) {
          typeStr += `(${col.character_maximum_length})`;
        } else if (typeStr === 'ARRAY') {
          typeStr = `${col.udt_name.replace(/^_/, '')}[]`;
        }

        let def = `  "${col.column_name}" ${typeStr}`;
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        if (col.is_nullable === 'NO') {
          def += ` NOT NULL`;
        }
        colDefs.push(def);
      }

      const pkRes = await client.query<{ constraint_name: string; columns: string }>(`
        SELECT 
          tc.constraint_name,
          string_agg(quote_ident(kcu.column_name), ', ' ORDER BY kcu.ordinal_position) AS columns
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
        GROUP BY tc.constraint_name;
      `, [table.schema_name, table.table_name]);

      for (const pk of pkRes.rows) {
        colDefs.push(`  CONSTRAINT "${pk.constraint_name}" PRIMARY KEY (${pk.columns})`);
      }

      lines.push(`CREATE TABLE IF NOT EXISTS ${fullTableName} (`);
      lines.push(colDefs.join(',\n'));
      lines.push(`);`);
      lines.push(`ALTER TABLE ${fullTableName} OWNER TO "${table.owner}";`);
      lines.push(``);

      const idxRes = await client.query<{ index_def: string }>(`
        SELECT indexdef AS index_def
        FROM pg_indexes
        WHERE schemaname = $1 AND tablename = $2 AND indexname NOT IN (
          SELECT constraint_name FROM information_schema.table_constraints 
          WHERE table_schema = $1 AND table_name = $2 AND constraint_type = 'PRIMARY KEY'
        );
      `, [table.schema_name, table.table_name]);

      for (const idx of idxRes.rows) {
        lines.push(`${idx.index_def};`);
      }
      lines.push(``);
    }

    if (req.mode !== 'schema_only') {
      lines.push(`-- --------------------------------------------------------------`);
      lines.push(`-- Data for Table: ${fullTableName}`);
      lines.push(`-- --------------------------------------------------------------`);

      try {
        const dataRes = await client.query(`SELECT * FROM ${fullTableName};`);
        if (dataRes.rows.length > 0) {
          const cols = Object.keys(dataRes.rows[0]);
          const quotedCols = cols.map((c) => `"${c}"`).join(', ');

          lines.push(`-- Dumping ${dataRes.rows.length} records`);
          for (const row of dataRes.rows) {
            const vals = cols.map((c) => escapeSqlValue(row[c])).join(', ');
            lines.push(`INSERT INTO ${fullTableName} (${quotedCols}) VALUES (${vals});`);
          }
        } else {
          lines.push(`-- (No data)`);
        }
      } catch (err: any) {
        lines.push(`-- Error dumping table data: ${err.message || 'Unknown error'}`);
      }
      lines.push(``);
    }
  }

  if (req.mode !== 'schema_only' && seqRes.rows.length > 0) {
    lines.push(`-- --------------------------------------------------------------`);
    lines.push(`-- Synchronize Sequences`);
    lines.push(`-- --------------------------------------------------------------`);
    for (const seq of seqRes.rows) {
      const fullSeqName = `"${seq.sequence_schema}"."${seq.sequence_name}"`;
      try {
        const valRes = await client.query<{ last_value: string; is_called: boolean }>(`
          SELECT last_value, is_called FROM ${fullSeqName};
        `);
        if (valRes.rows.length > 0) {
          const { last_value, is_called } = valRes.rows[0];
          lines.push(`SELECT pg_catalog.setval('${fullSeqName}', ${last_value}, ${is_called ? 'true' : 'false'});`);
        }
      } catch {}
    }
    lines.push(``);
  }

  if (req.mode !== 'data_only') {
    const viewsRes = await client.query<{
      schema_name: string;
      view_name: string;
      view_definition: string;
      owner: string;
    }>(`
      SELECT 
        n.nspname AS schema_name,
        c.relname AS view_name,
        pg_get_viewdef(c.oid, true) AS view_definition,
        pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'v' AND n.nspname IN (${schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ') || "''"})
      ORDER BY n.nspname, c.relname;
    `);

    if (viewsRes.rows.length > 0) {
      lines.push(`-- --------------------------------------------------------------`);
      lines.push(`-- Views`);
      lines.push(`-- --------------------------------------------------------------`);
      for (const view of viewsRes.rows) {
        const fullViewName = `"${view.schema_name}"."${view.view_name}"`;
        if (req.includeDrop) {
          lines.push(`DROP VIEW IF EXISTS ${fullViewName} CASCADE;`);
        }
        lines.push(`CREATE OR REPLACE VIEW ${fullViewName} AS`);
        lines.push(`${view.view_definition.trim().replace(/;$/, '')};`);
        lines.push(`ALTER VIEW ${fullViewName} OWNER TO "${view.owner}";`);
        lines.push(``);
      }
    }
  }

  lines.push(`-- ==============================================================`);
  lines.push(`-- End of NetTopology PostgreSQL Dump`);
  lines.push(`-- ==============================================================`);

  await client.end();

  return {
    sqlContent: lines.join('\n'),
    tablesCount: tables.length,
    schemasCount: schemas.length,
    schemas,
    tables,
  };
}

/**
 * Creates a configuration backup (postgresql.conf, pg_hba.conf, or cluster roles dump)
 */
export async function createPostgresConfigBackup(
  server: RemoteServer,
  req: PostgresCreateBackupRequest
): Promise<PostgresCreateBackupResult> {
  const startTime = Date.now();
  const configType = req.configType || 'postgresql_conf';
  const backupDir = getPostgresBackupsDir(server.id);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  let finalFilename = '';
  let content = '';
  let descEn = '';
  let descFa = '';

  const { client, targetHost, targetPort } = createPostgresClient(server, {
    database: req.database || server.postgres_database || 'postgres',
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  try {
    await client.connect();

    if (configType === 'postgresql_conf') {
      finalFilename = req.customFilename?.trim()
        ? req.customFilename.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_')
        : `postgresql_conf_backup_${timestampStr}.conf`;
      if (!finalFilename.endsWith('.conf')) finalFilename += '.conf';

      const settingsRes = await client.query<{
        name: string;
        setting: string;
        unit: string | null;
        category: string;
        short_desc: string | null;
        context: string;
        boot_val: string;
        reset_val: string;
        source: string;
      }>(`
        SELECT name, setting, unit, category, short_desc, context, boot_val, reset_val, source
        FROM pg_settings
        ORDER BY category, name;
      `);

      const confLines: string[] = [
        `# ====================================================================`,
        `# PostgreSQL Configuration Snapshot (postgresql.conf)`,
        `# Host: ${targetHost}:${targetPort} | Exported: ${now.toISOString()}`,
        `# Generated by NetTopology PostgreSQL Manager (Phase 17)`,
        `# ====================================================================`,
        ``,
      ];

      let currentCategory = '';
      for (const row of settingsRes.rows || []) {
        if (row.category !== currentCategory) {
          currentCategory = row.category;
          confLines.push(`\n# --------------------------------------------------------------------`);
          confLines.push(`# Category: ${currentCategory}`);
          confLines.push(`# --------------------------------------------------------------------`);
        }
        if (row.short_desc) {
          confLines.push(`# ${row.short_desc}`);
        }
        const unitSuffix = row.unit ? ` # unit: ${row.unit}` : '';
        const sourceComment = row.source && row.source !== 'default' ? ` (source: ${row.source})` : '';
        confLines.push(`${row.name} = '${String(row.setting).replace(/'/g, "''")}'${unitSuffix}${sourceComment}`);
      }

      content = confLines.join('\n');
      descEn = `Full snapshot of all active PostgreSQL configuration parameters (${settingsRes.rows?.length || 0} parameters).`;
      descFa = `نسخه پشتیبان کامل از کلیه پارامترهای فعال پیکربندی سرور PostgreSQL (تعداد ${settingsRes.rows?.length || 0} پارامتر).`;

    } else if (configType === 'pg_hba') {
      finalFilename = req.customFilename?.trim()
        ? req.customFilename.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_')
        : `pg_hba_backup_${timestampStr}.conf`;
      if (!finalFilename.endsWith('.conf')) finalFilename += '.conf';

      const hbaRes = await client.query("SHOW hba_file;");
      const hbaFilePath = hbaRes.rows?.[0]?.hba_file || '';

      let rawHba = '';
      if (hbaFilePath && (server.ssh_password || server.ssh_key)) {
        try {
          rawHba = await runAdaptiveSshCommand(server, `cat "${hbaFilePath}" 2>/dev/null || true`);
        } catch {}
      }

      if (!rawHba) {
        try {
          const rulesRes = await client.query(`
            SELECT line_number, type, database, user_name, address, auth_method, options
            FROM pg_hba_file_rules
            ORDER BY line_number ASC;
          `);
          const lines: string[] = [
            `# ====================================================================`,
            `# PostgreSQL Client Authentication Configuration (pg_hba.conf)`,
            `# Host: ${targetHost}:${targetPort} | Exported: ${now.toISOString()}`,
            `# Source View: pg_hba_file_rules`,
            `# ====================================================================`,
            ``,
          ];
          for (const r of rulesRes.rows || []) {
            const dbStr = Array.isArray(r.database) ? r.database.join(',') : (r.database || 'all');
            const userStr = Array.isArray(r.user_name) ? r.user_name.join(',') : (r.user_name || 'all');
            const addrStr = r.address || '';
            const optsStr = Array.isArray(r.options) ? r.options.join(' ') : (r.options || '');
            lines.push(`${(r.type || 'host').padEnd(8)} ${dbStr.padEnd(16)} ${userStr.padEnd(16)} ${addrStr.padEnd(18)} ${(r.auth_method || 'scram-sha-256').padEnd(12)} ${optsStr}`);
          }
          rawHba = lines.join('\n');
        } catch {}
      }

      content = rawHba || `# pg_hba.conf snapshot generated on ${now.toISOString()}`;
      descEn = `Snapshot of pg_hba.conf client authentication rules.`;
      descFa = `نسخه پشتیبان از قوانین احراز هویت کلاینت‌ها (pg_hba.conf).`;

    } else if (configType === 'cluster_roles') {
      finalFilename = req.customFilename?.trim()
        ? req.customFilename.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_')
        : `cluster_roles_backup_${timestampStr}.sql`;
      if (!finalFilename.endsWith('.sql')) finalFilename += '.sql';

      const rolesRes = await client.query<{
        rolname: string;
        rolsuper: boolean;
        rolinherit: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
        rolcanlogin: boolean;
        rolreplication: boolean;
        rolconnlimit: number;
        rolpassword: string | null;
        rolvaliduntil: string | null;
        rolbypassrls: boolean;
      }>(`
        SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
               rolcanlogin, rolreplication, rolconnlimit, rolpassword,
               rolvaliduntil, rolbypassrls
        FROM pg_roles
        ORDER BY rolname;
      `);

      const membersRes = await client.query<{
        role_name: string;
        member_name: string;
        admin_option: boolean;
      }>(`
        SELECT r.rolname AS role_name, m.rolname AS member_name, a.admin_option
        FROM pg_auth_members a
        JOIN pg_roles r ON r.oid = a.roleid
        JOIN pg_roles m ON m.oid = a.member
        ORDER BY r.rolname, m.rolname;
      `);

      const sqlLines: string[] = [
        `-- ====================================================================`,
        `-- PostgreSQL Cluster Roles & Global Privileges Dump`,
        `-- Host: ${targetHost}:${targetPort} | Exported: ${now.toISOString()}`,
        `-- Generated by NetTopology PostgreSQL Manager (Phase 17)`,
        `-- ====================================================================`,
        ``,
        `BEGIN;`,
        ``,
      ];

      for (const r of rolesRes.rows || []) {
        if (r.rolname.startsWith('pg_')) continue;
        const opts: string[] = [];
        if (r.rolsuper) opts.push('SUPERUSER'); else opts.push('NOSUPERUSER');
        if (r.rolcreatedb) opts.push('CREATEDB'); else opts.push('NOCREATEDB');
        if (r.rolcreaterole) opts.push('CREATEROLE'); else opts.push('NOCREATEROLE');
        if (r.rolinherit) opts.push('INHERIT'); else opts.push('NOINHERIT');
        if (r.rolcanlogin) opts.push('LOGIN'); else opts.push('NOLOGIN');
        if (r.rolreplication) opts.push('REPLICATION'); else opts.push('NOREPLICATION');
        if (r.rolbypassrls) opts.push('BYPASSRLS'); else opts.push('NOBYPASSRLS');
        if (r.rolconnlimit !== undefined && r.rolconnlimit >= 0) opts.push(`CONNECTION LIMIT ${r.rolconnlimit}`);
        if (r.rolvaliduntil) opts.push(`VALID UNTIL '${r.rolvaliduntil}'`);
        if (r.rolpassword) opts.push(`PASSWORD '${r.rolpassword.replace(/'/g, "''")}'`);

        sqlLines.push(`DO $$`);
        sqlLines.push(`BEGIN`);
        sqlLines.push(`  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${r.rolname.replace(/'/g, "''")}') THEN`);
        sqlLines.push(`    CREATE ROLE "${r.rolname}" ${opts.join(' ')};`);
        sqlLines.push(`  ELSE`);
        sqlLines.push(`    ALTER ROLE "${r.rolname}" ${opts.join(' ')};`);
        sqlLines.push(`  END IF;`);
        sqlLines.push(`END $$;`);
        sqlLines.push(``);
      }

      for (const m of membersRes.rows || []) {
        if (m.role_name.startsWith('pg_') && m.member_name.startsWith('pg_')) continue;
        sqlLines.push(`GRANT "${m.role_name}" TO "${m.member_name}"${m.admin_option ? ' WITH ADMIN OPTION' : ''};`);
      }

      sqlLines.push(``);
      sqlLines.push(`COMMIT;`);
      content = sqlLines.join('\n');
      descEn = `Export of ${rolesRes.rows?.length || 0} cluster roles, privilege flags, and group memberships.`;
      descFa = `خروجی ساختاریافته از ${rolesRes.rows?.length || 0} رول و کاربر سرور همراه با سطوح دسترسی و عضویت‌های گروهی.`;
    }

    await client.end();
  } catch (err: any) {
    try { await client.end(); } catch {}
    return {
      success: false,
      message: `Failed to create configuration backup: ${err.message}`,
      messageFa: `خطا در ایجاد نسخه پشتیبان از پیکربندی: ${err.message}`,
      error: err.message,
    };
  }

  const targetFilePath = path.join(backupDir, finalFilename);
  fs.writeFileSync(targetFilePath, content, 'utf8');

  const stats = fs.statSync(targetFilePath);
  const backupItem: PostgresBackupItem = {
    id: finalFilename,
    filename: finalFilename,
    category: 'configuration',
    configType,
    database: req.database || server.postgres_database || 'postgres',
    sizeBytes: stats.size,
    sizePretty: formatBytesPretty(stats.size),
    format: 'plain',
    createdAt: now.toISOString(),
    downloadUrl: `/api/remote-servers/${server.id}/postgres/backups/${encodeURIComponent(finalFilename)}/download`,
    engineUsed: 'config_snapshot',
    description: descEn,
    descriptionFa: descFa,
  };

  const meta = loadPostgresBackupsMeta(server.id);
  meta[finalFilename] = backupItem;
  savePostgresBackupsMeta(server.id, meta);

  const durationMs = Date.now() - startTime;
  return {
    success: true,
    backup: backupItem,
    message: `Configuration backup "${finalFilename}" created successfully in ${(durationMs / 1000).toFixed(1)}s.`,
    messageFa: `نسخه پشتیبان پیکربندی "${finalFilename}" با موفقیت در ${(durationMs / 1000).toFixed(1)} ثانیه ایجاد گردید.`,
    durationMs,
    sqlDumpPreview: content.slice(0, 1500),
  };
}

export async function createPostgresBackup(
  server: RemoteServer,
  req: PostgresCreateBackupRequest
): Promise<PostgresCreateBackupResult> {
  if (req.category === 'configuration') {
    return createPostgresConfigBackup(server, req);
  }

  const targetDb = (req.database || server.postgres_database || 'postgres').trim();
  const startTime = Date.now();

  if (!targetDb) {
    return {
      success: false,
      message: 'Database name is required for backup.',
      messageFa: 'نام پایگاه داده جهت ایجاد نسخه پشتیبان الزامی است.',
      error: 'Missing database name',
    };
  }

  const backupDir = getPostgresBackupsDir(server.id);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  let ext = 'sql';
  if (req.format === 'custom') {
    ext = 'dump';
  } else if (req.format === 'tar') {
    ext = 'tar';
  } else if (req.compressionLevel && req.compressionLevel > 0) {
    ext = 'sql.gz';
  }

  let finalFilename = req.customFilename?.trim()
    ? req.customFilename.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    : `${targetDb}_backup_${timestampStr}.${ext}`;

  if (!finalFilename.endsWith(`.${ext}`)) {
    finalFilename += `.${ext}`;
  }

  const targetFilePath = path.join(backupDir, finalFilename);

  const hasSsh = Boolean(server.ssh_password || server.ssh_key);
  let engineUsed: 'native_pg_dump' | 'logical_sql_dumper' = 'logical_sql_dumper';
  let sqlPreview = '';
  let tablesCount = 0;
  let schemasCount = 0;
  let schemasList: string[] = [];
  let tablesList: string[] = [];

  if (hasSsh && req.format !== 'plain') {
    try {
      const checkPgDump = await runAdaptiveSshCommand(server, 'which pg_dump 2>/dev/null || echo "NOT_FOUND"', undefined, 8000);
      if (checkPgDump && !checkPgDump.includes('NOT_FOUND') && checkPgDump.trim().length > 0) {
        const dumpPort = req.port || server.postgres_port || 5432;
        const dumpUser = req.user || server.postgres_user || 'postgres';
        let plainPass = '';
        if (req.sessionPassword) {
          plainPass = req.sessionPassword;
        } else if (server.postgres_password) {
          plainPass = decryptServerSecret(server.postgres_password);
        }

        const formatFlag = req.format === 'custom' ? '-Fc' : req.format === 'tar' ? '-Ft' : '-Fp';
        const modeFlag = req.mode === 'schema_only' ? '-s' : req.mode === 'data_only' ? '-a' : '';
        const cleanFlag = req.includeDrop ? '--clean --if-exists' : '';
        const insertFlag = req.useInserts ? '--inserts' : '';
        const compFlag = req.compressionLevel && req.compressionLevel > 0 ? `-Z ${req.compressionLevel}` : '';

        const remoteTempFile = `/tmp/pgdump_${timestampStr}_${Math.floor(Math.random() * 10000)}.${ext}`;

        const dumpCmd = `export PGPASSWORD='${plainPass.replace(/'/g, "'\\''")}'
pg_dump -h localhost -p ${dumpPort} -U "${dumpUser}" -d "${targetDb}" ${formatFlag} ${modeFlag} ${cleanFlag} ${insertFlag} ${compFlag} -f "${remoteTempFile}"
cat "${remoteTempFile}" | base64
rm -f "${remoteTempFile}"`;

        const b64Output = await runAdaptiveSshCommand(server, dumpCmd, undefined, 45000);
        const cleanB64 = b64Output.replace(/[\r\n\s]/g, '');
        if (cleanB64.length > 50) {
          const buffer = Buffer.from(cleanB64, 'base64');
          fs.writeFileSync(targetFilePath, buffer);
          engineUsed = 'native_pg_dump';
        }
      }
    } catch (sshErr: any) {
      console.warn('Native pg_dump over SSH failed, falling back to logical SQL dumper:', sshErr.message);
    }
  }

  if (engineUsed !== 'native_pg_dump') {
    try {
      const dumpRes = await performLogicalSqlDump(server, req);
      tablesCount = dumpRes.tablesCount;
      schemasCount = dumpRes.schemasCount;
      schemasList = dumpRes.schemas;
      tablesList = dumpRes.tables;

      let fileBuffer: Buffer;
      if (req.compressionLevel && req.compressionLevel > 0) {
        fileBuffer = zlib.gzipSync(Buffer.from(dumpRes.sqlContent, 'utf8'), {
          level: Math.min(9, Math.max(1, req.compressionLevel)),
        });
      } else {
        fileBuffer = Buffer.from(dumpRes.sqlContent, 'utf8');
      }

      fs.writeFileSync(targetFilePath, fileBuffer);
      sqlPreview = dumpRes.sqlContent.split('\n').slice(0, 40).join('\n');
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to create PostgreSQL backup: ${err.message || 'Unknown error'}`,
        messageFa: `خطا در ایجاد نسخه پشتیبان از پایگاه داده: ${err.message || 'خطای ناشناخته'}`,
        error: err.message,
        errorFa: `خطای فرآیند دانپ: ${err.message || 'خطای ناشناخته'}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  const stats = fs.statSync(targetFilePath);
  const backupItem: PostgresBackupItem = {
    id: finalFilename,
    filename: finalFilename,
    category: 'database',
    database: targetDb,
    sizeBytes: stats.size,
    sizePretty: formatBytesPretty(stats.size),
    mode: req.mode,
    format: req.format,
    createdAt: new Date().toISOString(),
    tablesCount,
    schemasCount,
    schemas: schemasList,
    tables: tablesList,
    compressionLevel: req.compressionLevel,
    downloadUrl: `/api/remote-servers/${server.id}/postgres/backups/${encodeURIComponent(finalFilename)}/download`,
    engineUsed,
    description: `${req.mode === 'full' ? 'Full Database Dump' : req.mode === 'schema_only' ? 'Schema DDL Only' : 'Data Tables Only'} (${tablesCount} tables, ${schemasCount} schemas)`,
    descriptionFa: `${req.mode === 'full' ? 'پشتیبان کامل پایگاه داده' : req.mode === 'schema_only' ? 'صرفاً اسکیما و ساختار DDL' : 'صرفاً رکوردهای جداول'} (شامل ${tablesCount} جدول و ${schemasCount} اسکیما)`,
  };

  const meta = loadPostgresBackupsMeta(server.id);
  meta[finalFilename] = backupItem;
  savePostgresBackupsMeta(server.id, meta);

  const durationMs = Date.now() - startTime;
  return {
    success: true,
    backup: backupItem,
    message: `Backup "${finalFilename}" created successfully (${formatBytesPretty(stats.size)}) in ${(durationMs / 1000).toFixed(1)}s using ${engineUsed}.`,
    messageFa: `نسخه پشتیبان "${finalFilename}" با موفقیت ایجاد شد (${formatBytesPretty(stats.size)}) در زمان ${(durationMs / 1000).toFixed(1)} ثانیه با موتور ${engineUsed === 'native_pg_dump' ? 'Native pg_dump' : 'Logical SQL Dumper'}.`,
    durationMs,
    sqlDumpPreview: sqlPreview,
  };
}

export async function restorePostgresBackup(
  server: RemoteServer,
  req: PostgresRestoreBackupRequest
): Promise<PostgresRestoreBackupResult> {
  const startTime = Date.now();
  const backupDir = getPostgresBackupsDir(server.id);
  const targetFilePath = path.join(backupDir, path.basename(req.filename));

  if (!fs.existsSync(targetFilePath)) {
    return {
      success: false,
      message: `Backup file "${req.filename}" does not exist.`,
      messageFa: `فایل نسخه پشتیبان "${req.filename}" یافت نشد.`,
      error: 'File not found',
    };
  }

  const meta = loadPostgresBackupsMeta(server.id);
  const backupMeta = meta[req.filename];
  const isConfigFile = req.filename.endsWith('.conf') || backupMeta?.category === 'configuration' || req.category === 'configuration';

  if (isConfigFile) {
    if (backupMeta?.configType === 'pg_hba' || req.filename.includes('pg_hba')) {
      const rawText = fs.readFileSync(targetFilePath, 'utf8');
      const lines = rawText.split('\n');
      const rules: any[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const tokens = trimmed.split(/\s+/);
        if (tokens.length >= 4) {
          rules.push({
            id: `rule-${Math.random().toString(36).slice(2, 8)}`,
            enabled: true,
            type: tokens[0],
            database: tokens[1],
            user: tokens[2],
            address: tokens.length >= 5 ? tokens[3] : '',
            method: tokens.length >= 5 ? tokens[4] : tokens[3],
            options: tokens.slice(5).join(' ') || undefined,
          });
        }
      }

      if (rules.length > 0) {
        const hbaRes = await savePostgresHbaConfig(server, {
          database: req.database || server.postgres_database || 'postgres',
          rules,
          port: req.port,
          user: req.user,
          sessionPassword: req.sessionPassword,
        });

        const durationMs = Date.now() - startTime;
        return {
          success: hbaRes.success,
          message: hbaRes.message,
          messageFa: hbaRes.messageFa || hbaRes.message,
          executedStatementsCount: rules.length,
          durationMs,
          error: hbaRes.errors?.[0],
          outputLog: hbaRes.diffText || (hbaRes.errors || []).join('\n'),
        };
      }
    } else if (backupMeta?.configType === 'postgresql_conf' || req.filename.includes('postgresql_conf')) {
      const { client } = createPostgresClient(server, {
        database: req.database || server.postgres_database || 'postgres',
        port: req.port,
        user: req.user,
        password: req.sessionPassword,
      });

      try {
        await client.connect();
        const rawText = fs.readFileSync(targetFilePath, 'utf8');
        const lines = rawText.split('\n');
        let appliedParams = 0;
        const errors: string[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const match = trimmed.match(/^([a-zA-Z0-9_\.]+)\s*=\s*'?(.*?)'?\s*(?:#.*)?$/);
          if (match) {
            const paramName = match[1];
            const paramVal = match[2].replace(/'/g, "''");
            try {
              await client.query(`ALTER SYSTEM SET ${paramName} = '${paramVal}';`);
              appliedParams++;
            } catch (paramErr: any) {
              errors.push(`${paramName}: ${paramErr.message}`);
            }
          }
        }

        await client.query('SELECT pg_reload_conf();');
        await client.end();

        const durationMs = Date.now() - startTime;
        return {
          success: true,
          message: `Restored and reloaded ${appliedParams} PostgreSQL configuration parameters in ${(durationMs / 1000).toFixed(1)}s.${errors.length > 0 ? ` (${errors.length} parameters skipped or require restart)` : ''}`,
          messageFa: `تعداد ${appliedParams} پارامتر تنظیمات سرور با موفقیت بر روی PostgreSQL اعمال و بارگذاری مجدد شد.${errors.length > 0 ? ` (${errors.length} خطا یا نیازمند ریستارت)` : ''}`,
          executedStatementsCount: appliedParams,
          durationMs,
          outputLog: errors.length > 0 ? errors.join('\n') : `All ${appliedParams} parameters reloaded via pg_reload_conf().`,
        };
      } catch (err: any) {
        try { await client.end(); } catch {}
        return {
          success: false,
          message: `Failed to restore configuration: ${err.message}`,
          messageFa: `خطا در اعمال تنظیمات: ${err.message}`,
          durationMs: Date.now() - startTime,
          error: err.message,
        };
      }
    }
  }

  const targetDb = (req.database || server.postgres_database || 'postgres').trim();
  const isGz = req.filename.endsWith('.gz');
  const isDump = req.filename.endsWith('.dump');
  const isTar = req.filename.endsWith('.tar');

  const hasSsh = Boolean(server.ssh_password || server.ssh_key);
  if ((isDump || isTar) && hasSsh) {
    try {
      const dumpPort = req.port || server.postgres_port || 5432;
      const dumpUser = req.user || server.postgres_user || 'postgres';
      let plainPass = '';
      if (req.sessionPassword) {
        plainPass = req.sessionPassword;
      } else if (server.postgres_password) {
        plainPass = decryptServerSecret(server.postgres_password);
      }

      const fileBuffer = fs.readFileSync(targetFilePath);
      const b64Data = fileBuffer.toString('base64');
      const remoteTemp = `/tmp/pgrestore_${Date.now()}_${Math.floor(Math.random() * 10000)}.${isDump ? 'dump' : 'tar'}`;

      const restoreCmd = `echo '${b64Data}' | base64 -d > "${remoteTemp}"
export PGPASSWORD='${plainPass.replace(/'/g, "'\\''")}'
${req.cleanFirst ? 'CLEAN_FLAG="--clean --if-exists"' : 'CLEAN_FLAG=""'}
${req.singleTransaction ? 'TX_FLAG="--single-transaction"' : 'TX_FLAG=""'}
${req.exitOnError ? 'ERR_FLAG="--exit-on-error"' : 'ERR_FLAG=""'}
pg_restore -h localhost -p ${dumpPort} -U "${dumpUser}" -d "${targetDb}" $CLEAN_FLAG $TX_FLAG $ERR_FLAG "${remoteTemp}" 2>&1 || true
rm -f "${remoteTemp}"`;

      const output = await runAdaptiveSshCommand(server, restoreCmd, undefined, 60000);
      const durationMs = Date.now() - startTime;

      return {
        success: true,
        message: `Backup "${req.filename}" restored into database "${targetDb}" via pg_restore in ${(durationMs / 1000).toFixed(1)}s.`,
        messageFa: `نسخه پشتیبان "${req.filename}" با موفقیت بر روی دیتابیس "${targetDb}" با pg_restore در مدت زمان ${(durationMs / 1000).toFixed(1)} ثانیه بازیابی گردید.`,
        durationMs,
        outputLog: output,
      };
    } catch (err: any) {
      console.warn('pg_restore over SSH failed:', err.message);
    }
  }

  const { client } = createPostgresClient(server, {
    database: targetDb,
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  try {
    let sqlContent: string;
    const rawBuffer = fs.readFileSync(targetFilePath);
    if (isGz) {
      sqlContent = zlib.gunzipSync(rawBuffer).toString('utf8');
    } else {
      sqlContent = rawBuffer.toString('utf8');
    }

    await client.connect();

    if (req.singleTransaction) {
      await client.query('BEGIN;');
    }

    const statements = sqlContent
      .split(/;\s*[\r\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    let executedCount = 0;
    const errors: string[] = [];

    for (const stmt of statements) {
      try {
        await client.query(stmt + ';');
        executedCount++;
      } catch (stmtErr: any) {
        errors.push(`Error executing statement (${stmt.slice(0, 60)}...): ${stmtErr.message}`);
        if (req.exitOnError) {
          if (req.singleTransaction) {
            await client.query('ROLLBACK;');
          }
          await client.end();
          return {
            success: false,
            message: `Restore failed on statement: ${stmtErr.message}`,
            messageFa: `بازیابی با خطا متوقف گردید: ${stmtErr.message}`,
            executedStatementsCount: executedCount,
            durationMs: Date.now() - startTime,
            error: stmtErr.message,
            outputLog: errors.join('\n'),
          };
        }
      }
    }

    if (req.singleTransaction) {
      await client.query('COMMIT;');
    }

    await client.end();
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      message: `Restored ${executedCount} statements into database "${targetDb}" in ${(durationMs / 1000).toFixed(1)}s.${errors.length > 0 ? ` (${errors.length} non-fatal warnings)` : ''}`,
      messageFa: `تعداد ${executedCount} دستور با موفقیت بر روی پایگاه داده "${targetDb}" در زمان ${(durationMs / 1000).toFixed(1)} ثانیه اعمال شد.${errors.length > 0 ? ` (${errors.length} هشدار)` : ''}`,
      executedStatementsCount: executedCount,
      durationMs,
      outputLog: errors.length > 0 ? errors.slice(0, 20).join('\n') : 'All statements executed successfully.',
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to restore database: ${err.message || 'Unknown error'}`,
      messageFa: `خطا در بازیابی نسخه پشتیبان: ${err.message || 'خطای ناشناخته'}`,
      durationMs: Date.now() - startTime,
      error: err.message,
    };
  }
}

export async function deletePostgresBackup(
  server: RemoteServer,
  filename: string
): Promise<{ success: boolean; message: string; messageFa: string }> {
  const safeFilename = path.basename(filename);
  const backupDir = getPostgresBackupsDir(server.id);
  const filePath = path.join(backupDir, safeFilename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to delete file: ${err.message}`,
        messageFa: `خطا در حذف فایل: ${err.message}`,
      };
    }
  }

  const meta = loadPostgresBackupsMeta(server.id);
  if (meta[safeFilename]) {
    delete meta[safeFilename];
    savePostgresBackupsMeta(server.id, meta);
  }

  return {
    success: true,
    message: `Backup "${safeFilename}" deleted successfully.`,
    messageFa: `نسخه پشتیبان "${safeFilename}" با موفقیت حذف گردید.`,
  };
}

export function getPostgresBackupFilePath(server: RemoteServer, filename: string): string | null {
  const safeFilename = path.basename(filename);
  const backupDir = getPostgresBackupsDir(server.id);
  const filePath = path.join(backupDir, safeFilename);

  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * Validates a backup file before executing restore, checking target DB existence and collision risks.
 */
export async function validatePostgresRestore(
  server: RemoteServer,
  req: PostgresValidateRestoreRequest
): Promise<PostgresValidateRestoreResult> {
  const backupDir = getPostgresBackupsDir(server.id);
  const targetFilePath = path.join(backupDir, path.basename(req.filename));

  if (!fs.existsSync(targetFilePath)) {
    return {
      valid: false,
      targetDatabase: req.targetDatabase || server.postgres_database || 'postgres',
      databaseExists: false,
      targetHasExistingData: false,
      existingTablesCount: 0,
      existingTablesSample: [],
      requiresExplicitConfirmation: false,
      error: `Backup file "${req.filename}" does not exist on disk.`,
      errorFa: `فایل نسخه پشتیبان "${req.filename}" یافت نشد.`,
    };
  }

  const meta = loadPostgresBackupsMeta(server.id);
  const backupItem = meta[req.filename];
  const targetDb = (req.targetDatabase || backupItem?.database || server.postgres_database || 'postgres').trim();

  const { client } = createPostgresClient(server, {
    database: targetDb,
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  let databaseExists = true;
  let existingTablesCount = 0;
  let existingTablesSample: string[] = [];

  try {
    await client.connect();

    const tablesRes = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_name ASC
      LIMIT 20;
    `);

    const countRes = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema');
    `);

    existingTablesCount = parseInt(countRes.rows?.[0]?.count || '0', 10);
    existingTablesSample = (tablesRes.rows || []).map((r) => r.table_name);

    await client.end();
  } catch (err: any) {
    try { await client.end(); } catch {}
    if (err.message && err.message.includes('does not exist')) {
      databaseExists = false;
    }
  }

  const targetHasExistingData = existingTablesCount > 0;
  const requiresExplicitConfirmation = targetHasExistingData;

  let warning: string | undefined;
  let warningFa: string | undefined;

  if (targetHasExistingData) {
    warning = `Target database "${targetDb}" already contains ${existingTablesCount} tables (${existingTablesSample.slice(0, 5).join(', ')}${existingTablesCount > 5 ? '...' : ''}). Restoring will modify or overwrite existing schemas and records!`;
    warningFa = `پایگاه داده مقصد "${targetDb}" در حال حاضر شامل ${existingTablesCount} جدول می‌باشد (${existingTablesSample.slice(0, 5).join('، ')}${existingTablesCount > 5 ? '...' : ''}). اجرای بازیابی ممکن است داده‌ها یا اسکیماهای موجود را بازنویسی کند!`;
  }

  return {
    valid: true,
    backupItem,
    targetDatabase: targetDb,
    databaseExists,
    targetHasExistingData,
    existingTablesCount,
    existingTablesSample,
    warning,
    warningFa,
    requiresExplicitConfirmation,
  };
}

/**
 * Preview / Inspect the content of a Plain SQL or Configuration backup
 */
export async function previewPostgresBackup(
  server: RemoteServer,
  filename: string
): Promise<PostgresBackupPreviewResult> {
  const backupDir = getPostgresBackupsDir(server.id);
  const targetFilePath = path.join(backupDir, path.basename(filename));

  if (!fs.existsSync(targetFilePath)) {
    return {
      success: false,
      filename,
      content: '',
      totalLines: 0,
      isTruncated: false,
      sizeBytes: 0,
      category: 'database',
      format: 'plain',
      error: 'File not found',
      errorFa: 'فایل یافت نشد',
    };
  }

  const stats = fs.statSync(targetFilePath);
  const meta = loadPostgresBackupsMeta(server.id);
  const item = meta[filename];
  const isGz = filename.endsWith('.gz');
  const isDump = filename.endsWith('.dump');
  const isTar = filename.endsWith('.tar');

  if (isDump || isTar) {
    return {
      success: true,
      filename,
      content: `-- Binary/Tar archive backup (${formatBytesPretty(stats.size)}).\n-- Content inspection is available for Plain SQL and Configuration snapshots.\n-- Use "Restore" or "Download" to inspect binary archives.`,
      totalLines: 3,
      isTruncated: false,
      sizeBytes: stats.size,
      category: item?.category || 'database',
      format: isDump ? 'custom' : 'tar',
    };
  }

  try {
    const rawBuffer = fs.readFileSync(targetFilePath);
    let fullText = '';
    if (isGz) {
      fullText = zlib.gunzipSync(rawBuffer).toString('utf8');
    } else {
      fullText = rawBuffer.toString('utf8');
    }

    const lines = fullText.split('\n');
    const totalLines = lines.length;
    const maxPreviewLines = 300;
    const previewLines = lines.slice(0, maxPreviewLines);
    const isTruncated = totalLines > maxPreviewLines;

    return {
      success: true,
      filename,
      content: previewLines.join('\n') + (isTruncated ? `\n\n-- ... [Truncated: showing first ${maxPreviewLines} of ${totalLines} lines. Download file to view complete content] ...` : ''),
      totalLines,
      isTruncated,
      sizeBytes: stats.size,
      category: item?.category || (filename.endsWith('.conf') ? 'configuration' : 'database'),
      format: 'plain',
    };
  } catch (err: any) {
    return {
      success: false,
      filename,
      content: '',
      totalLines: 0,
      isTruncated: false,
      sizeBytes: stats.size,
      category: item?.category || 'database',
      format: 'plain',
      error: err.message,
      errorFa: `خطا در باز کردن فایل: ${err.message}`,
    };
  }
}

// ==========================================
// Phase 19: PostgreSQL Comprehensive Health Check & Security Audit Hub
// ==========================================

export type PostgresAuditSeverity = 'critical' | 'warning' | 'good' | 'info';
export type PostgresAuditCategory = 'security' | 'performance' | 'maintenance' | 'configuration' | 'storage';

export interface PostgresHealthCheckItem {
  id: string;
  title: string;
  titleFa: string;
  category: PostgresAuditCategory;
  severity: PostgresAuditSeverity;
  description: string;
  descriptionFa: string;
  metricValue: string;
  recommendation: string;
  recommendationFa: string;
  remediationSql?: string;
}

export interface PostgresHealthAuditSummary {
  cacheHitRatio: number;
  indexHitRatio: number;
  activeConnections: number;
  maxConnections: number;
  connectionUsagePercent: number;
  superusersCount: number;
  sslEnabled: boolean;
  bloatedTablesCount: number;
  unusedIndexesCount: number;
  idleInTxCount: number;
  // Phase 19 extensions:
  securityScore: number;
  performanceScore: number;
  maintenanceScore: number;
  storageScore: number;
  passwordlessRolesCount: number;
  openTrustRulesCount: number;
  wraparoundMaxAge: number;
  wraparoundPercent: number;
  totalDatabaseSizeBytes: number;
  totalDatabaseSizePretty: string;
  walArchiverFailing: boolean;
  vulnerableSettingsCount: number;
  superuserNames?: string[];
  passwordlessNames?: string[];
}

export interface PostgresHealthAuditReport {
  overallScore: number;
  securityScore: number;
  performanceScore: number;
  maintenanceScore: number;
  storageScore: number;
  generatedAt: string;
  database: string;
  serverVersion: string;
  uptime: string;
  totalChecks: number;
  passedCount: number;
  warningCount: number;
  criticalCount: number;
  summary: PostgresHealthAuditSummary;
  items: PostgresHealthCheckItem[];
}

export async function runPostgresHealthAudit(
  server: RemoteServer,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<PostgresHealthAuditReport> {
  const targetDb = options?.database || server.postgres_database || 'postgres';
  const { client } = createPostgresClient(server, {
    database: targetDb,
    port: options?.port,
    user: options?.user,
    password: options?.password,
  });

  await client.connect();

  try {
    const items: PostgresHealthCheckItem[] = [];

    // Helper format size
    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    // 1. Version & Uptime
    const verRes = await client.query<{ version: string }>(`SELECT version();`);
    const serverVersion = verRes.rows[0]?.version || 'Unknown';

    let uptime = 'Unknown';
    try {
      const upRes = await client.query<{ uptime_str: string }>(`
        SELECT (now() - pg_postmaster_start_time())::text as uptime_str;
      `);
      uptime = upRes.rows[0]?.uptime_str || 'Unknown';
    } catch {}

    // Check version currency
    const verMatch = serverVersion.match(/PostgreSQL (\d+)/i);
    const majorVer = verMatch ? parseInt(verMatch[1], 10) : null;
    if (majorVer !== null) {
      if (majorVer < 13) {
        items.push({
          id: 'engine_eol',
          title: 'PostgreSQL Version End-of-Life',
          titleFa: 'پایان چرخه پشتیبانی نسخه PostgreSQL',
          category: 'security',
          severity: 'critical',
          description: `PostgreSQL ${majorVer} has reached official End-of-Life (EOL) and no longer receives security patches.`,
          descriptionFa: `نسخه PostgreSQL ${majorVer} به پایان چرخه پشتیبانی رسمی رسیده و دیگر بسته‌های امنیتی دریافت نمی‌کند.`,
          metricValue: `v${majorVer}`,
          recommendation: 'Upgrade PostgreSQL engine to an actively supported release (v14, v15, v16, or v17).',
          recommendationFa: 'موتور PostgreSQL را به نسخه‌های تحت پشتیبانی رسمی (نگارش ۱۴، ۱۵، ۱۶ یا ۱۷) ارتقا دهید.',
        });
      } else {
        items.push({
          id: 'engine_version',
          title: 'Engine Version Supported',
          titleFa: 'پشتیبانی فعال نسخه PostgreSQL',
          category: 'security',
          severity: 'good',
          description: `PostgreSQL ${majorVer} is an actively maintained release with security updates.`,
          descriptionFa: `نسخه PostgreSQL ${majorVer} فعال بوده و بسته‌های امنیتی را دریافت می‌نماید.`,
          metricValue: `v${majorVer}`,
          recommendation: 'Keep engine updated with minor point releases.',
          recommendationFa: 'سرور را همواره به آخرین نسخه‌های جزئی ارتقا دهید.',
        });
      }
    }

    // 2. Settings check (Deep Configuration & Vulnerabilities)
    const settingsRes = await client.query<{ name: string; setting: string }>(`
      SELECT name, setting FROM pg_settings 
      WHERE name IN (
        'ssl', 'ssl_min_protocol_version', 'password_encryption', 'fsync', 'full_page_writes',
        'standard_conforming_strings', 'listen_addresses', 'port', 'max_connections',
        'autovacuum', 'shared_buffers', 'work_mem', 'checkpoint_completion_target',
        'log_connections', 'log_disconnections', 'log_min_duration_statement',
        'statement_timeout', 'shared_preload_libraries', 'autovacuum_freeze_max_age'
      );
    `);
    const settingsMap = new Map<string, string>();
    for (const r of settingsRes.rows) {
      settingsMap.set(r.name, r.setting);
    }

    let vulnerableSettingsCount = 0;

    // 2.1 SSL / TLS Check
    const sslOn = settingsMap.get('ssl') === 'on';
    if (!sslOn) {
      vulnerableSettingsCount++;
      items.push({
        id: 'ssl_enforcement',
        title: 'SSL/TLS Encryption Disabled',
        titleFa: 'غیرفعال بودن رمزنگاری امن SSL/TLS',
        category: 'security',
        severity: 'warning',
        description: 'PostgreSQL server is configured without mandatory SSL encryption. Network traffic and queries can be snooped in transit.',
        descriptionFa: 'سرور PostgreSQL بدون الزام رمزنگاری SSL پیکربندی شده است. امکان شنود ترافیک و کوئری‌ها در شبکه وجود دارد.',
        metricValue: 'ssl = off',
        recommendation: 'Enable SSL encryption in postgresql.conf and deploy verified TLS certificates.',
        recommendationFa: 'مقدار ssl = on را در فایل postgresql.conf فعال کرده و سرتیفیکیت معتبر بارگذاری کنید.',
        remediationSql: `ALTER SYSTEM SET ssl = 'on';`,
      });
    } else {
      const minTls = settingsMap.get('ssl_min_protocol_version') || 'TLSv1.2';
      items.push({
        id: 'ssl_enforcement',
        title: 'SSL/TLS Encryption Active',
        titleFa: 'رمزنگاری ارتباطات با SSL/TLS فعال است',
        category: 'security',
        severity: 'good',
        description: `PostgreSQL enforces SSL encryption for client connections (Min Protocol: ${minTls}).`,
        descriptionFa: `ارتباطات کلاینت با پایگاه داده از طریق لایه امن SSL رمزنگاری می‌شوند (حداقل پروتکل: ${minTls}).`,
        metricValue: `ssl = on (${minTls})`,
        recommendation: 'Ensure client applications verify server certificates properly.',
        recommendationFa: 'اطمینان حاصل کنید کلاینت‌ها صحت سرتیفیکیت سرور را اعتبارسنجی کنند.',
      });
    }

    // 2.2 Password Encryption Algorithm (SCRAM vs MD5)
    const passEnc = settingsMap.get('password_encryption') || 'md5';
    if (passEnc.toLowerCase().includes('md5')) {
      vulnerableSettingsCount++;
      items.push({
        id: 'password_encryption_md5',
        title: 'Weak Password Encryption Algorithm (MD5)',
        titleFa: 'الگوریتم رمزنگاری ضعیف کلمات عبور (MD5)',
        category: 'security',
        severity: 'warning',
        description: 'PostgreSQL uses legacy MD5 password hashing which is susceptible to dictionary and offline rainbow-table cracking.',
        descriptionFa: 'سرور از هشینگ قدیمی MD5 برای رمزهای عبور استفاده می‌کند که در برابر حملات آفلاین دیکشنری و رینبو تیبل آسیب‌پذیر است.',
        metricValue: `password_encryption = ${passEnc}`,
        recommendation: 'Switch password_encryption to scram-sha-256 for military-grade PBKDF2/HMAC-SHA256 password security.',
        recommendationFa: 'تنظیم password_encryption را به scram-sha-256 تغییر داده و رمزهای کاربران را مجدداً ذخیره کنید.',
        remediationSql: `ALTER SYSTEM SET password_encryption = 'scram-sha-256';\nSELECT pg_reload_conf();`,
      });
    } else {
      items.push({
        id: 'password_encryption_scram',
        title: 'Modern SCRAM-SHA-256 Password Security',
        titleFa: 'رمزنگاری مدرن و امن کلمات عبور (SCRAM-SHA-256)',
        category: 'security',
        severity: 'good',
        description: 'PostgreSQL enforces robust SCRAM-SHA-256 password authentication hashing.',
        descriptionFa: 'رمزهای عبور با استفاده از الگوریتم ایمن و استاندارد SCRAM-SHA-256 محافظت می‌شوند.',
        metricValue: 'scram-sha-256',
        recommendation: 'Maintain scram-sha-256 across all user roles and client connection pools.',
        recommendationFa: 'الگوریتم scram-sha-256 را در سراسر پایگاه داده حفظ نمایید.',
      });
    }

    // 2.3 fsync Safety Evaluation
    const fsyncSetting = settingsMap.get('fsync') ?? 'on';
    if (fsyncSetting === 'off') {
      vulnerableSettingsCount++;
      items.push({
        id: 'fsync_disabled',
        title: 'CRITICAL: fsync is Turned OFF',
        titleFa: 'بحرانی: همگام‌سازی fsync خاموش است',
        category: 'storage',
        severity: 'critical',
        description: 'fsync is disabled. While writes may appear faster, ANY power outage or operating system crash WILL corrupt database pages beyond repair.',
        descriptionFa: 'تنظیم fsync خاموش است. در صورت بروز هرگونه قطعی برق یا کرش سیستم‌عامل، صفحات پایگاه داده دچار فساد جبران‌ناپذیر خواهند شد.',
        metricValue: 'fsync = off',
        recommendation: 'Enable fsync immediately to ensure ACID compliance and transaction durability.',
        recommendationFa: 'سریعاً fsync را فعال کنید تا پایداری و سلامت داده‌ها بر روی دیسک تضمین شود.',
        remediationSql: `ALTER SYSTEM SET fsync = 'on';\nSELECT pg_reload_conf();`,
      });
    } else {
      items.push({
        id: 'fsync_enabled',
        title: 'Disk Flush Synchronization (fsync) Active',
        titleFa: 'همگام‌سازی دیسک fsync فعال و ایمن است',
        category: 'storage',
        severity: 'good',
        description: 'fsync is enabled, guaranteeing that WAL records and modified data pages are safely committed to physical storage.',
        descriptionFa: 'قابلیت fsync فعال است و ثبت امن رکوردهای تراکنش بر روی دیسک فیزیکی را تضمین می‌کند.',
        metricValue: 'fsync = on',
        recommendation: 'Never disable fsync in production environments.',
        recommendationFa: 'هرگز در محیط‌های عملیاتی fsync را خاموش نکنید.',
      });
    }

    // 2.4 full_page_writes Evaluation
    const fpw = settingsMap.get('full_page_writes') ?? 'on';
    if (fpw === 'off') {
      vulnerableSettingsCount++;
      items.push({
        id: 'full_page_writes_disabled',
        title: 'Torn-Page Risk: full_page_writes is OFF',
        titleFa: 'خطر پارگی صفحات داده: full_page_writes خاموش است',
        category: 'storage',
        severity: 'critical',
        description: 'full_page_writes is turned off. A crash during partial disk page write causes unrecoverable page corruption.',
        descriptionFa: 'تنظیم full_page_writes خاموش است. بروز کرش حین نوشتن نیمه‌کاره صفحات دیسک موجب خرابی کلاستر می‌شود.',
        metricValue: 'full_page_writes = off',
        recommendation: 'Enable full_page_writes immediately to protect against torn pages.',
        recommendationFa: 'بلافاصله full_page_writes را روی on تنظیم کنید.',
        remediationSql: `ALTER SYSTEM SET full_page_writes = 'on';\nSELECT pg_reload_conf();`,
      });
    }

    // 2.5 standard_conforming_strings (SQL Injection vector)
    const scs = settingsMap.get('standard_conforming_strings') ?? 'on';
    if (scs === 'off') {
      vulnerableSettingsCount++;
      items.push({
        id: 'standard_conforming_strings_off',
        title: 'Escape String Vulnerability (standard_conforming_strings)',
        titleFa: 'آسیب‌پذیری اسکیپ کاراکترها در رشته‌ها',
        category: 'security',
        severity: 'warning',
        description: 'standard_conforming_strings is off. Backslashes are treated as escape characters, which may allow SQL injection attacks.',
        descriptionFa: 'تنظیم standard_conforming_strings خاموش است و کاراکتر بک‌اسلش اسکیپ می‌شود که راه نفوذ SQL Injection ایجاد می‌کند.',
        metricValue: 'standard_conforming_strings = off',
        recommendation: 'Enable standard_conforming_strings to adhere to modern SQL standards.',
        recommendationFa: 'مقدار standard_conforming_strings را روی on بگذارید.',
        remediationSql: `ALTER SYSTEM SET standard_conforming_strings = 'on';`,
      });
    }

    // 2.6 Port & Network Exposure
    const currentPort = settingsMap.get('port') || '5432';
    const listenAddr = settingsMap.get('listen_addresses') || 'localhost';
    const isPublicListen = listenAddr === '*' || listenAddr.includes('0.0.0.0');

    if (currentPort === '5432' && isPublicListen) {
      items.push({
        id: 'default_port_public',
        title: 'Public Listening on Default Port 5432',
        titleFa: 'گوش فرا دادن عمومی روی پورت پیش‌فرض ۵۴۳۲',
        category: 'security',
        severity: 'warning',
        description: `Server listens on "${listenAddr}" on standard port 5432. It is publicly exposed to automated brute-force port scanners.`,
        descriptionFa: `سرور روی تمام آدرس‌ها (${listenAddr}) و پورت پیش‌فرض ۵۴۳۲ شنود می‌کند و در معرض اسکن‌های خودکار ربات‌هاست.`,
        metricValue: `${listenAddr}:${currentPort}`,
        recommendation: 'Restrict listen_addresses to private network/localhost or enforce strict firewall/VPN filtering.',
        recommendationFa: 'آدرس‌های شنود را به شبکه خصوصی/لوکال محدود کرده یا پورت را از طریق فایروال مسدود نمایید.',
        remediationSql: `ALTER SYSTEM SET listen_addresses = 'localhost, 10.0.0.1';`,
      });
    } else if (currentPort === '5432') {
      items.push({
        id: 'default_port',
        title: 'Default Port 5432 In Use',
        titleFa: 'استفاده از شماره پورت پیش‌فرض ۵۴۳۲',
        category: 'configuration',
        severity: 'info',
        description: 'Server operates on default port 5432 with restricted listen interface.',
        descriptionFa: 'سرور روی پورت استاندارد ۵۴۳۲ ولی با آدرس‌های شنود مشخص کار می‌کند.',
        metricValue: `Port ${currentPort}`,
        recommendation: 'Consider changing PostgreSQL to a non-standard port for defense-in-depth.',
        recommendationFa: 'جهت امنیت لایه‌ای می‌توانید پورت را به شماره‌ای غیر از ۵۴۳۲ تغییر دهید.',
      });
    } else {
      items.push({
        id: 'custom_port',
        title: 'Non-Standard Port Configured',
        titleFa: 'پیکربندی پورت غیراستاندارد',
        category: 'security',
        severity: 'good',
        description: `PostgreSQL is configured on custom port ${currentPort}, avoiding default port scanning bots.`,
        descriptionFa: `پایگاه داده روی پورت غیراستاندارد ${currentPort} تنظیم شده و از اسکن‌های کور در امان است.`,
        metricValue: `Port ${currentPort}`,
        recommendation: 'Ensure client application connection strings reflect the custom port.',
        recommendationFa: 'از تنظیم صحیح پورت در کانکشن استرینگ برنامه‌ها اطمینان حاصل کنید.',
      });
    }

    // 2.7 Logging Configuration (Connection audit & slow query telemetry)
    const logConn = settingsMap.get('log_connections') === 'on';
    const logDisconn = settingsMap.get('log_disconnections') === 'on';
    const logMinDur = parseInt(settingsMap.get('log_min_duration_statement') ?? '-1', 10);

    if (!logConn || !logDisconn) {
      items.push({
        id: 'audit_logging_incomplete',
        title: 'Connection Audit Logging Inactive',
        titleFa: 'ثبت لاگ‌های ورود و خروج کاربران غیرفعال است',
        category: 'configuration',
        severity: 'info',
        description: 'log_connections or log_disconnections is disabled. Failed login attempts and unauthorized session bursts will not be logged.',
        descriptionFa: 'لاگ ورود و خروج نشست‌ها غیرفعال است. امکان ردیابی تلاش‌های نفوذ و حملات بروت‌فورس وجود ندارد.',
        metricValue: `log_connections=${logConn ? 'on' : 'off'}, log_disconnections=${logDisconn ? 'on' : 'off'}`,
        recommendation: 'Enable log_connections and log_disconnections to capture security audit trails.',
        recommendationFa: 'گزینه‌های log_connections و log_disconnections را در postgresql.conf فعال کنید.',
        remediationSql: `ALTER SYSTEM SET log_connections = 'on';\nALTER SYSTEM SET log_disconnections = 'on';\nSELECT pg_reload_conf();`,
      });
    } else {
      items.push({
        id: 'audit_logging_active',
        title: 'Session Audit Logging Enabled',
        titleFa: 'ثبت لاگ‌های ورود و خروج نشست‌ها فعال است',
        category: 'configuration',
        severity: 'good',
        description: 'PostgreSQL logs connection authentications and disconnections for forensic security auditing.',
        descriptionFa: 'تمام اتصالات و نشست‌های ورودی و خروجی در لاگ‌های امنیتی سرور ثبت می‌شوند.',
        metricValue: 'Auditing Active',
        recommendation: 'Maintain connection logging with automated log rotation.',
        recommendationFa: 'چرخش دوره‌ای فایل‌های لاگ سرور را بررسی کنید.',
      });
    }

    if (logMinDur === -1) {
      items.push({
        id: 'slow_query_logging_disabled',
        title: 'Slow Query Logging Disabled',
        titleFa: 'ثبت لاگ کوئری‌های کند غیرفعال است',
        category: 'performance',
        severity: 'info',
        description: 'log_min_duration_statement is disabled (-1). Slow execution queries will not be captured for optimization.',
        descriptionFa: 'پارامتر log_min_duration_statement غیرفعال است و کوئری‌های کند در لاگ سرور ذخیره نمی‌شوند.',
        metricValue: 'Disabled (-1)',
        recommendation: 'Set log_min_duration_statement to 1000 (1 second) or 2000 to identify slow queries in production.',
        recommendationFa: 'مقدار log_min_duration_statement را روی ۱۰۰۰ (یک ثانیه) بگذارید تا کوئری‌های کند ثبت شوند.',
        remediationSql: `ALTER SYSTEM SET log_min_duration_statement = 1000;\nSELECT pg_reload_conf();`,
      });
    }

    // 2.8 Statement Timeout
    const stmtTimeout = parseInt(settingsMap.get('statement_timeout') || '0', 10);
    if (stmtTimeout === 0) {
      items.push({
        id: 'no_statement_timeout',
        title: 'No Global Statement Timeout Configured',
        titleFa: 'عدم تنظیم سقف زمانی اجرای کوئری‌ها (Statement Timeout)',
        category: 'performance',
        severity: 'info',
        description: 'statement_timeout is 0 (unlimited). Runaway or poorly indexed queries can lock tables and run indefinitely.',
        descriptionFa: 'سقف زمانی کوئری‌ها نامحدود است. کوئری‌های معیوب می‌توانند تا بی‌نهایت منابع سرور را درگیر نمایند.',
        metricValue: 'statement_timeout = 0 (Unlimited)',
        recommendation: 'Configure a reasonable statement_timeout (e.g. 30000ms = 30 seconds) to terminate accidental long queries.',
        recommendationFa: 'یک سقف زمانی منطقی (مانند ۳۰ ثانیه) برای جلوگیری از قفل شدن سرور تنظیم کنید.',
        remediationSql: `ALTER SYSTEM SET statement_timeout = '30000';\nSELECT pg_reload_conf();`,
      });
    }

    // 3. Autovacuum Daemon Status
    const autovacuumOn = settingsMap.get('autovacuum') === 'on';
    if (!autovacuumOn) {
      items.push({
        id: 'autovacuum_disabled',
        title: 'Autovacuum Daemon Disabled',
        titleFa: 'غیرفعال بودن دیمون پاکسازی خودکار (Autovacuum)',
        category: 'maintenance',
        severity: 'critical',
        description: 'Autovacuum is turned off. Tables will suffer severe dead tuple bloat, disk exhaustion, and catastrophic transaction ID wraparound.',
        descriptionFa: 'سرویس Autovacuum خاموش است. جداول دچار انباشتگی شدید رکوردهای مرده، اتمام فضای دیسک و کرش Wraparound می‌شوند.',
        metricValue: 'autovacuum = off',
        recommendation: 'Enable autovacuum immediately in postgresql.conf.',
        recommendationFa: 'بلافاصله سرویس autovacuum را فعال نمایید.',
        remediationSql: `ALTER SYSTEM SET autovacuum = 'on';\nSELECT pg_reload_conf();`,
      });
    } else {
      items.push({
        id: 'autovacuum_status',
        title: 'Autovacuum Daemon Enabled',
        titleFa: 'دیمون پاکسازی خودکار (Autovacuum) فعال است',
        category: 'maintenance',
        severity: 'good',
        description: 'Background autovacuum worker is actively reclaiming dead tuples and refreshing optimizer stats.',
        descriptionFa: 'سرویس پس‌زمینه پاکسازی خودکار در حال بازیافت رکوردهای مرده و به‌روزرسانی آمار است.',
        metricValue: 'autovacuum = on',
        recommendation: 'Keep autovacuum enabled with recommended scale-factor thresholds.',
        recommendationFa: 'تنظیمات آستانه مقیاس‌پذیری autovacuum را بهینه نگه دارید.',
      });
    }

    // 4. pg_hba.conf Client Authentication Audit
    let openTrustRulesCount = 0;
    try {
      const hbaRulesRes = await client.query<{
        line_number: number;
        type: string;
        database: string[];
        user_name: string[];
        address: string | null;
        netmask: string | null;
        auth_method: string;
        options: string[];
        error: string | null;
      }>(`
        SELECT line_number, type, database, user_name, address, auth_method, error
        FROM pg_hba_file_rules
        ORDER BY line_number ASC;
      `);

      const trustRules = hbaRulesRes.rows.filter(
        (r) => r.auth_method === 'trust' && !r.error
      );
      openTrustRulesCount = trustRules.length;

      if (openTrustRulesCount > 0) {
        const lineNums = trustRules.map((r) => `#${r.line_number}`).join(', ');
        items.push({
          id: 'hba_trust_rules_found',
          title: 'CRITICAL: Insecure "trust" Authentication Rules in pg_hba.conf',
          titleFa: 'بحرانی: وجود قواعد احراز هویت ناامن "trust" در فایل pg_hba.conf',
          category: 'security',
          severity: 'critical',
          description: `Found ${openTrustRulesCount} rule(s) in pg_hba.conf (lines: ${lineNums}) using "trust" method. Anyone matching these rules can connect WITHOUT ANY PASSWORD!`,
          descriptionFa: `تعداد ${openTrustRulesCount} قانون با متد "trust" در pg_hba.conf (سطرهای ${lineNums}) یافت شد. هر کلاینتی مطابق این قوانین می‌تواند بدون هیچ کلمه عبوری وارد پایگاه داده شود!`,
          metricValue: `${openTrustRulesCount} trust rules`,
          recommendation: 'Replace "trust" authentication with "scram-sha-256" in pg_hba.conf and reload PostgreSQL.',
          recommendationFa: 'در فایل pg_hba.conf متد trust را با scram-sha-256 جایگزین کرده و سرور را ریلود کنید.',
        });
      } else {
        items.push({
          id: 'hba_trust_rules_clean',
          title: 'pg_hba.conf Passwordless Trust Rules Audited',
          titleFa: 'قوانین احراز هویت pg_hba.conf فاقد دسترسی بدون رمز (trust) هستند',
          category: 'security',
          severity: 'good',
          description: 'No unauthenticated "trust" rules found in active pg_hba.conf. All connections require credentials.',
          descriptionFa: 'هیچ قانون احراز هویت با متد trust یافت نشد و تمام اتصالات نیازمند احراز هویت معتبر هستند.',
          metricValue: 'Secured (0 trust rules)',
          recommendation: 'Regularly audit client authentication rules via Client Auth manager.',
          recommendationFa: 'تنظیمات pg_hba.conf را به صورت دوره‌ای در تب Client Auth بررسی کنید.',
        });
      }
    } catch {}

    // 5. User Roles, Superusers & Passwordless Accounts Audit
    const rolesRes = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolcanlogin: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
      has_expiry: boolean;
      is_expired: boolean;
    }>(`
      SELECT 
        rolname,
        rolsuper,
        rolcanlogin,
        rolcreaterole,
        rolcreatedb,
        rolbypassrls,
        (rolvaliduntil IS NOT NULL) as has_expiry,
        (rolvaliduntil IS NOT NULL AND rolvaliduntil < now()) as is_expired
      FROM pg_roles 
      ORDER BY rolname;
    `);

    const superusers = rolesRes.rows.filter((r) => r.rolsuper).map((r) => r.rolname);
    const loginSuperusers = rolesRes.rows.filter((r) => r.rolsuper && r.rolcanlogin).map((r) => r.rolname);

    if (superusers.length > 3) {
      items.push({
        id: 'excessive_superusers',
        title: 'High Number of Superuser Roles',
        titleFa: 'تعداد زیاد کاربران با سطح دسترسی Superuser',
        category: 'security',
        severity: 'warning',
        description: `Found ${superusers.length} superuser accounts (${superusers.join(', ')}). Principle of least privilege is violated.`,
        descriptionFa: `تعداد ${superusers.length} کاربر با دسترسی سوپریوزر یافت شد (${superusers.join(', ')}). اصل حداقل دسترسی نقض شده است.`,
        metricValue: `${superusers.length} Superusers`,
        recommendation: 'Demote non-administrative users to standard application roles with explicit grants.',
        recommendationFa: 'کاربران غیرضروری را به نقش‌های استاندارد با دسترسی‌های تفکیک‌شده تبدیل نمایید.',
      });
    } else {
      items.push({
        id: 'superusers_count',
        title: 'Superuser Role Count Restricted',
        titleFa: 'محدود بودن تعداد کاربران Superuser',
        category: 'security',
        severity: 'good',
        description: `Superuser privileges are strictly limited to ${superusers.length} account(s) (${superusers.join(', ')}).`,
        descriptionFa: `دسترسی‌های سوپریوزر تنها به ${superusers.length} حساب کاربری محدود است (${superusers.join(', ')}).`,
        metricValue: `${superusers.length} Superuser(s)`,
        recommendation: 'Continue enforcing role-based access control (RBAC).',
        recommendationFa: 'به تفکیک نقش‌ها و استفاده از دسترسی‌های محدود ادامه دهید.',
      });
    }

    // 5.2 Passwordless Accounts Check (via pg_authid / pg_shadow)
    let passwordlessRoles: string[] = [];
    try {
      const authidRes = await client.query<{ rolname: string }>(`
        SELECT rolname 
        FROM pg_authid 
        WHERE rolcanlogin = true AND (rolpassword IS NULL OR rolpassword = '');
      `);
      passwordlessRoles = authidRes.rows.map((r) => r.rolname);
    } catch {
      // Non-superuser connecting; cannot inspect pg_authid
    }

    if (passwordlessRoles.length > 0) {
      items.push({
        id: 'passwordless_login_roles',
        title: 'CRITICAL: Login Accounts Without Passwords Detected',
        titleFa: 'بحرانی: حساب‌های کاربری بدون رمز عبور با قابلیت لاگین',
        category: 'security',
        severity: 'critical',
        description: `Identified ${passwordlessRoles.length} account(s) (${passwordlessRoles.join(', ')}) with login rights but NO PASSWORD configured. Attackers can login freely!`,
        descriptionFa: `تعداد ${passwordlessRoles.length} حساب کاربری (${passwordlessRoles.join(', ')}) بدون رمز عبور و با قابلیت ورود شناسایی شدند. مهاجمان می‌توانند بدون رمز وارد شوند!`,
        metricValue: `${passwordlessRoles.length} Passwordless Roles`,
        recommendation: 'Assign strong passwords or revoke LOGIN privilege from passwordless accounts immediately.',
        recommendationFa: 'فوراً برای این کاربران رمزهای قوی تعیین کنید یا حق ورود (LOGIN) آنها را لغو نمایید.',
        remediationSql: passwordlessRoles
          .map((u) => `ALTER ROLE "${u}" WITH PASSWORD 'SET_STRONG_PASSWORD_HERE';`)
          .join('\n'),
      });
    } else {
      items.push({
        id: 'passwordless_login_roles',
        title: 'All Login Roles Protected With Passwords',
        titleFa: 'تمام حساب‌های کاربری ورود دارای کلمه عبور هستند',
        category: 'security',
        severity: 'good',
        description: 'Every user account with LOGIN privileges has a password assigned.',
        descriptionFa: 'تمام نقش‌های کاربری با قابلیت لاگین، دارای کلمه عبور محافظت‌شده هستند.',
        metricValue: 'Protected',
        recommendation: 'Enforce strong password rotation policies.',
        recommendationFa: 'سیاست‌های تغییر دوره‌ای رمز عبور را حفظ کنید.',
      });
    }

    // 5.3 Row-Level Security (RLS) Bypass Roles
    const rlsBypassRoles = rolesRes.rows.filter((r) => r.rolbypassrls && !r.rolsuper).map((r) => r.rolname);
    if (rlsBypassRoles.length > 0) {
      items.push({
        id: 'rls_bypass_roles',
        title: 'Non-Superuser Roles Bypassing Row-Level Security',
        titleFa: 'نقش‌های غیر سوپریوزر با امکان دور زدن Row-Level Security',
        category: 'security',
        severity: 'warning',
        description: `Roles (${rlsBypassRoles.join(', ')}) have BYPASSRLS privilege enabled, circumventing tenant isolation rules.`,
        descriptionFa: `نقش‌های (${rlsBypassRoles.join(', ')}) دسترسی دور زدن فیلترهای سطری RLS را دارند که انزوای داده‌ها را به خطر می‌اندازد.`,
        metricValue: `${rlsBypassRoles.length} Roles with BYPASSRLS`,
        recommendation: 'Revoke BYPASSRLS from application users unless explicitly required for reporting backups.',
        recommendationFa: 'دسترسی BYPASSRLS را از کاربران عادی لغو کنید.',
        remediationSql: rlsBypassRoles.map((r) => `ALTER ROLE "${r}" NOBYPASSRLS;`).join('\n'),
      });
    }

    // 5.4 Public schema permission check
    try {
      const pubPrivRes = await client.query<{ has_create: boolean }>(`
        SELECT has_schema_privilege('public', 'public', 'CREATE') as has_create;
      `);
      if (pubPrivRes.rows[0]?.has_create) {
        items.push({
          id: 'public_schema_create',
          title: 'Public Schema Grants CREATE to Everyone',
          titleFa: 'دسترسی همگانی ایجاد شیء در اسکیمای Public',
          category: 'security',
          severity: 'warning',
          description: 'Any authenticated database user can create tables, types, or functions in schema "public".',
          descriptionFa: 'تمام کاربران احراز هویت شده می‌توانند در اسکیمای public جدول، تابع یا شیء جدید بسازند.',
          metricValue: 'CREATE ON SCHEMA public = PUBLIC',
          recommendation: 'Revoke CREATE privilege on schema public from PUBLIC to prevent unauthorized object injections.',
          recommendationFa: 'دسترسی CREATE در اسکیمای public را از نقش همگانی PUBLIC لغو کنید.',
          remediationSql: `REVOKE CREATE ON SCHEMA public FROM PUBLIC;`,
        });
      } else {
        items.push({
          id: 'public_schema_create',
          title: 'Public Schema Hardened',
          titleFa: 'امن‌سازی اسکیمای Public اعمال شده است',
          category: 'security',
          severity: 'good',
          description: 'Unprivileged users cannot create objects inside schema public.',
          descriptionFa: 'کاربران عادی مجاز به ایجاد اشیاء در اسکیمای public نیستند.',
          metricValue: 'Secured',
          recommendation: 'Grant schema creation rights only to dedicated database migration users.',
          recommendationFa: 'حق ساخت شیء را صرفاً به کاربران مایگریشن اختصاص دهید.',
        });
      }
    } catch {}

    // 6. Disk Space, Storage Capacity, Database Sizes & Transaction ID Wraparound Risk
    let totalClusterBytes = 0;
    let maxFrozenAge = 0;
    let maxFrozenDb = '';

    try {
      const dbSizesRes = await client.query<{
        datname: string;
        size_bytes: string;
        xid_age: string;
      }>(`
        SELECT 
          datname, 
          pg_database_size(datname) as size_bytes,
          age(datfrozenxid) as xid_age
        FROM pg_database 
        WHERE datistemplate = false 
        ORDER BY pg_database_size(datname) DESC;
      `);

      for (const d of dbSizesRes.rows) {
        const b = parseInt(d.size_bytes || '0', 10);
        totalClusterBytes += b;
        const xAge = parseInt(d.xid_age || '0', 10);
        if (xAge > maxFrozenAge) {
          maxFrozenAge = xAge;
          maxFrozenDb = d.datname;
        }
      }

      // Check Database Cluster Total Size
      const totalPretty = formatBytes(totalClusterBytes);
      const topDbs = dbSizesRes.rows.slice(0, 3).map((d) => `${d.datname} (${formatBytes(parseInt(d.size_bytes, 10))})`).join(', ');

      items.push({
        id: 'cluster_storage_volume',
        title: 'Cluster Database Storage Capacity',
        titleFa: 'ظرفیت و حجم کلی پایگاه‌های داده کلاستر',
        category: 'storage',
        severity: 'good',
        description: `Total cluster database storage footprint is ${totalPretty}. Largest databases: ${topDbs}.`,
        descriptionFa: `مجموع حجم پایگاه‌های داده در این کلاستر ${totalPretty} است. بزرگترین دیتابیس‌ها: ${topDbs}.`,
        metricValue: totalPretty,
        recommendation: 'Ensure disk storage has at least 30% free space to accommodate VACUUM FULL and temp sorts.',
        recommendationFa: 'اطمینان حاصل کنید حداقل ۳۰٪ فضای خالی در دیسک برای عملیات VACUUM و فایل‌های موقت موجود باشد.',
      });

      // Transaction ID Wraparound (2 Billion limit safety)
      const freezeMaxAge = parseInt(settingsMap.get('autovacuum_freeze_max_age') || '200000000', 10);
      const wraparoundPct = Math.round((maxFrozenAge / 2000000000) * 100);

      if (maxFrozenAge > 1000000000) {
        items.push({
          id: 'xid_wraparound_danger',
          title: 'CRITICAL: Severe Transaction ID (XID) Wraparound Risk',
          titleFa: 'بحرانی: خطر جدی خطای توقف پایگاه داده در اثر انباشت شناسه تراکنش (Wraparound)',
          category: 'storage',
          severity: 'critical',
          description: `Database "${maxFrozenDb}" transaction ID age is ${maxFrozenAge.toLocaleString()} (${wraparoundPct}% of 2B limit). If age reaches 2 billion, PostgreSQL halts ALL writes to prevent data loss!`,
          descriptionFa: `عمر شناسه تراکنش در پایگاه "${maxFrozenDb}" به ${maxFrozenAge.toLocaleString()} رسیده است (${wraparoundPct}٪ سقف نهایی). در صورت رسیدن به ۲ میلیارد، کلیه عملیات نوشتن متوقف می‌شود!`,
          metricValue: `${maxFrozenAge.toLocaleString()} XIDs (${wraparoundPct}%)`,
          recommendation: 'Execute emergency VACUUM FREEZE ANALYZE immediately on all tables to advance datfrozenxid.',
          recommendationFa: 'فوراً دستور VACUUM FREEZE ANALYZE را روی تمامی جداول اجرا نمایید.',
          remediationSql: `VACUUM FREEZE VERBOSE ANALYZE;`,
        });
      } else if (maxFrozenAge > freezeMaxAge) {
        items.push({
          id: 'xid_wraparound_warning',
          title: 'Transaction ID Age Exceeds Autovacuum Freeze Max Age',
          titleFa: 'سن شناسه تراکنش‌ها از آستانه فریز خودکار عبور کرده است',
          category: 'storage',
          severity: 'warning',
          description: `Transaction ID age in "${maxFrozenDb}" is ${maxFrozenAge.toLocaleString()}, exceeding autovacuum_freeze_max_age (${freezeMaxAge.toLocaleString()}). Anti-wraparound autovacuum is triggered.`,
          descriptionFa: `سن شناسه تراکنش در دیتابیس "${maxFrozenDb}" (${maxFrozenAge.toLocaleString()}) از سقف autovacuum_freeze_max_age عبور کرده و نیازمند پاکسازی است.`,
          metricValue: `${maxFrozenAge.toLocaleString()} XIDs`,
          recommendation: 'Allow autovacuum to complete aggressive freeze passes or manually run VACUUM FREEZE.',
          recommendationFa: 'اجازه دهید فرایند پاکسازی فریز با اولویت بالا پایان یابد یا به صورت دستی VACUUM FREEZE را اجرا کنید.',
          remediationSql: `VACUUM FREEZE ANALYZE;`,
        });
      } else {
        items.push({
          id: 'xid_wraparound_healthy',
          title: 'Transaction ID (XID) Age Healthy',
          titleFa: 'سن شناسه‌های تراکنش (XID) در وضعیت ایمن',
          category: 'storage',
          severity: 'good',
          description: `Max transaction ID age is ${maxFrozenAge.toLocaleString()} in "${maxFrozenDb}", well below wraparound safety thresholds.`,
          descriptionFa: `حداکثر سن تراکنش‌ها ${maxFrozenAge.toLocaleString()} بوده و کاملاً در محدوده ایمن قرار دارد.`,
          metricValue: `${maxFrozenAge.toLocaleString()} XIDs`,
          recommendation: 'Maintain continuous autovacuum to keep transaction ID aging bounded.',
          recommendationFa: 'با روشن نگه داشتن autovacuum از مدیریت خودکار تراکنش‌ها اطمینان حاصل کنید.',
        });
      }
    } catch {}

    // 6.2 WAL Archiving Status (pg_stat_archiver)
    let walArchiverFailing = false;
    try {
      const archRes = await client.query<{
        archived_count: string;
        last_archived_time: string | null;
        failed_count: string;
        last_failed_time: string | null;
      }>(`
        SELECT archived_count, last_archived_time::text, failed_count, last_failed_time::text
        FROM pg_stat_archiver;
      `);
      if (archRes.rows.length > 0) {
        const arch = archRes.rows[0];
        const failedCount = parseInt(arch.failed_count || '0', 10);
        const lastFailed = arch.last_failed_time ? new Date(arch.last_failed_time).getTime() : 0;
        const lastArchived = arch.last_archived_time ? new Date(arch.last_archived_time).getTime() : 0;

        if (failedCount > 0 && lastFailed >= lastArchived) {
          walArchiverFailing = true;
          items.push({
            id: 'wal_archiver_failing',
            title: 'CRITICAL: WAL Archiver Process Failing',
            titleFa: 'بحرانی: بروز خطا در فرآیند آرشیو لاگ‌های WAL',
            category: 'storage',
            severity: 'critical',
            description: `WAL archiver has ${failedCount} failure(s). Latest failure occurred at ${arch.last_failed_time}. If WAL files cannot be archived, disk space will fill up and crash PostgreSQL!`,
            descriptionFa: `سرویس آرشیو WAL دارای ${failedCount} خطاست. آخرین خطا در ${arch.last_failed_time} رخ داده است. عدم ذخیره لاگ‌های WAL باعث پر شدن دیسک و کرش سرور می‌شود!`,
            metricValue: `${failedCount} Failed Archives`,
            recommendation: 'Check archive_command in postgresql.conf and inspect target backup disk permissions and capacity.',
            recommendationFa: 'دستور archive_command را در postgresql.conf چک کرده و دسترسی و فضای دیسک مقصد را بررسی کنید.',
          });
        }
      }
    } catch {}

    // 6.3 Temporary Files Spilling to Disk
    try {
      const tempRes = await client.query<{
        total_temp_bytes: string;
        total_temp_files: string;
      }>(`
        SELECT 
          sum(temp_bytes) as total_temp_bytes, 
          sum(temp_files) as total_temp_files 
        FROM pg_stat_database;
      `);
      const tempBytes = parseInt(tempRes.rows[0]?.total_temp_bytes || '0', 10);
      const tempFiles = parseInt(tempRes.rows[0]?.total_temp_files || '0', 10);

      if (tempBytes > 1024 * 1024 * 1024) { // > 1 GB
        const prettyTemp = formatBytes(tempBytes);
        items.push({
          id: 'excessive_temp_files',
          title: 'High Temporary File Spilling to Disk',
          titleFa: 'تولید بیش از حد فایل‌های موقت روی دیسک (Spilling)',
          category: 'performance',
          severity: 'warning',
          description: `Queries have written ${prettyTemp} across ${tempFiles.toLocaleString()} temporary disk files because work_mem was insufficient for in-memory sorting/hashing.`,
          descriptionFa: `به دلیل کمبود work_mem، مقدار ${prettyTemp} داده در قالب ${tempFiles.toLocaleString()} فایل موقت روی دیسک نوشته شده که کارایی را کاهش می‌دهد.`,
          metricValue: `${prettyTemp} temp files`,
          recommendation: 'Increase work_mem in postgresql.conf to allow complex sort and hash operations to complete in RAM.',
          recommendationFa: 'مقدار work_mem را افزایش دهید تا عملیات مرتب‌سازی و هش در حافظه رم انجام شود.',
          remediationSql: `ALTER SYSTEM SET work_mem = '64MB';\nSELECT pg_reload_conf();`,
        });
      }
    } catch {}

    // 7. Cache Hit Ratio (Buffer Cache)
    let cacheHitRatio = 100;
    try {
      const cacheRes = await client.query<{ ratio: string }>(`
        SELECT 
          CASE WHEN sum(heap_blks_hit) + sum(heap_blks_read) = 0 THEN 100 
          ELSE round(sum(heap_blks_hit)::numeric / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100, 2) 
          END as ratio 
        FROM pg_statio_user_tables;
      `);
      cacheHitRatio = parseFloat(cacheRes.rows[0]?.ratio || '100');
      if (cacheHitRatio < 95) {
        items.push({
          id: 'low_cache_hit_ratio',
          title: 'Low Buffer Cache Hit Ratio',
          titleFa: 'نرخ پایین کش بافر حافظه (Cache Hit Ratio)',
          category: 'performance',
          severity: cacheHitRatio < 85 ? 'critical' : 'warning',
          description: `Buffer cache hit ratio is currently ${cacheHitRatio}%. Queries are frequently reading directly from slow disk storage.`,
          descriptionFa: `نرخ کش بافر ${cacheHitRatio}٪ است. کوئری‌ها مکرراً داده‌ها را از روی دیسک با سرعت پایین می‌خوانند.`,
          metricValue: `${cacheHitRatio}% (Target: >99%)`,
          recommendation: 'Increase shared_buffers in postgresql.conf to allow PostgreSQL to cache more data pages in RAM.',
          recommendationFa: 'پارامتر shared_buffers را افزایش دهید تا صفحات داده بیشتری در حافظه رم نگهداری شوند.',
        });
      } else {
        items.push({
          id: 'cache_hit_ratio',
          title: 'Optimal Buffer Cache Hit Ratio',
          titleFa: 'نرخ کش بافر حافظه مطلوب است',
          category: 'performance',
          severity: 'good',
          description: `Buffer cache hit ratio is ${cacheHitRatio}%. Nearly all read operations are served directly from RAM.`,
          descriptionFa: `نرخ بهره‌وری کش بافر ${cacheHitRatio}٪ است و اکثر خواندن‌ها مستقیماً از حافظه رم تامین می‌شود.`,
          metricValue: `${cacheHitRatio}%`,
          recommendation: 'Maintain current shared_buffers allocation.',
          recommendationFa: 'تخصیص فعلی shared_buffers را حفظ نمایید.',
        });
      }
    } catch {}

    // 8. Index Hit Ratio
    let indexHitRatio = 100;
    try {
      const idxHitRes = await client.query<{ ratio: string }>(`
        SELECT 
          CASE WHEN sum(idx_blks_hit) + sum(idx_blks_read) = 0 THEN 100 
          ELSE round(sum(idx_blks_hit)::numeric / (sum(idx_blks_hit) + sum(idx_blks_read)) * 100, 2) 
          END as ratio 
        FROM pg_statio_user_indexes;
      `);
      indexHitRatio = parseFloat(idxHitRes.rows[0]?.ratio || '100');
      if (indexHitRatio < 90) {
        items.push({
          id: 'low_index_hit_ratio',
          title: 'Low Index Cache Hit Ratio',
          titleFa: 'نرخ پایین کش ایندکس‌ها',
          category: 'performance',
          severity: 'warning',
          description: `Index cache hit ratio is ${indexHitRatio}%. Index pages are not fitting into shared memory.`,
          descriptionFa: `نرخ کش صفحات ایندکس ${indexHitRatio}٪ است. ایندکس‌ها به اندازه کافی در حافظه رم قرار نمی‌گیرند.`,
          metricValue: `${indexHitRatio}%`,
          recommendation: 'Check working set size and evaluate whether RAM or shared_buffers should be increased.',
          recommendationFa: 'میزان رم و shared_buffers را جهت کش بهتر صفحات ایندکس افزایش دهید.',
        });
      } else {
        items.push({
          id: 'index_hit_ratio',
          title: 'Excellent Index Cache Hit Ratio',
          titleFa: 'نرخ کش صفحات ایندکس عالی است',
          category: 'performance',
          severity: 'good',
          description: `Index cache hit ratio is ${indexHitRatio}%. Index lookups execute with sub-millisecond RAM response.`,
          descriptionFa: `نرخ کش ایندکس‌ها ${indexHitRatio}٪ است و ایندکس‌ها از رم بدون وقفه خوانده می‌شوند.`,
          metricValue: `${indexHitRatio}%`,
          recommendation: 'Regularly monitor index usage on growing tables.',
          recommendationFa: 'کارایی ایندکس‌ها را در جداول در حال رشد مانیتور کنید.',
        });
      }
    } catch {}

    // 9. Connection Saturation & Long Queries
    let activeConn = 0;
    let idleInTx = 0;
    const maxConn = parseInt(settingsMap.get('max_connections') || '100', 10);
    try {
      const connRes = await client.query<{
        total: string;
        active: string;
        idle_in_tx: string;
        long_running: string;
      }>(`
        SELECT 
          count(*) as total,
          count(*) FILTER (WHERE state = 'active') as active,
          count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx,
          count(*) FILTER (WHERE state = 'active' AND (now() - query_start) > interval '5 minutes') as long_running
        FROM pg_stat_activity;
      `);
      const totalConn = parseInt(connRes.rows[0]?.total || '0', 10);
      activeConn = parseInt(connRes.rows[0]?.active || '0', 10);
      idleInTx = parseInt(connRes.rows[0]?.idle_in_tx || '0', 10);
      const longRunning = parseInt(connRes.rows[0]?.long_running || '0', 10);

      const usagePct = Math.round((totalConn / Math.max(maxConn, 1)) * 100);
      if (usagePct >= 80) {
        items.push({
          id: 'connection_saturation',
          title: 'Connection Pool Saturation Near Limit',
          titleFa: 'اشباع ظرفیت اتصالات نزدیک به سقف مجاز',
          category: 'performance',
          severity: usagePct >= 90 ? 'critical' : 'warning',
          description: `${totalConn} of ${maxConn} allowable connections (${usagePct}%) are currently consumed. Risk of connection rejection.`,
          descriptionFa: `تعداد ${totalConn} از ${maxConn} اتصال مجاز (${usagePct}٪) اشغال شده است. خطر پس زدن اتصالات جدید کلاینت‌ها بالاست.`,
          metricValue: `${totalConn} / ${maxConn} (${usagePct}%)`,
          recommendation: 'Deploy a connection pooler like PgBouncer or raise max_connections if memory permits.',
          recommendationFa: 'از سیستم اتصال اشتراکی (مانند PgBouncer) استفاده کرده یا سقف اتصالات را افزایش دهید.',
          remediationSql: `ALTER SYSTEM SET max_connections = ${maxConn + 50};`,
        });
      } else {
        items.push({
          id: 'connection_saturation',
          title: 'Connection Capacity Healthy',
          titleFa: 'ظرفیت اتصالات در وضعیت پایدار',
          category: 'performance',
          severity: 'good',
          description: `${totalConn} of ${maxConn} connection slots used (${usagePct}%). Ample headroom available.`,
          descriptionFa: `تعداد ${totalConn} از ${maxConn} اتصال مجاز استفاده شده (${usagePct}٪). ظرفیت کافی موجود است.`,
          metricValue: `${totalConn} / ${maxConn} (${usagePct}%)`,
          recommendation: 'Maintain connection pooling on application clients.',
          recommendationFa: 'الگوی استفاده بهینه از کانکشن‌ها در کلاینت‌ها را حفظ کنید.',
        });
      }

      if (idleInTx > 0) {
        items.push({
          id: 'idle_in_transaction',
          title: 'Idle in Transaction Sessions Detected',
          titleFa: 'نشست‌های رهاشده در وضعیت Idle in Transaction',
          category: 'performance',
          severity: idleInTx > 3 ? 'critical' : 'warning',
          description: `Found ${idleInTx} connection(s) stuck in "idle in transaction". They hold locks and prevent VACUUM from cleaning dead rows.`,
          descriptionFa: `تعداد ${idleInTx} کانکشن در وضعیت idle in transaction قفل مانده‌اند که مانع پاکسازی رکوردهای مرده توسط VACUUM می‌شوند.`,
          metricValue: `${idleInTx} idle in tx`,
          recommendation: 'Configure idle_in_transaction_session_timeout to automatically terminate orphaned transactions.',
          recommendationFa: 'پارامتر idle_in_transaction_session_timeout را تنظیم کنید تا تراکنش‌های رهاشده به صورت خودکار بسته شوند.',
          remediationSql: `ALTER SYSTEM SET idle_in_transaction_session_timeout = '60000';`,
        });
      }

      if (longRunning > 0) {
        items.push({
          id: 'long_running_queries',
          title: 'Long-Running Active Queries Detected',
          titleFa: 'کوئری‌های با مدت زمان اجرای طولانی (بیش از ۵ دقیقه)',
          category: 'performance',
          severity: 'warning',
          description: `Found ${longRunning} active query session(s) executing for more than 5 minutes. They may be consuming excessive CPU or holding table locks.`,
          descriptionFa: `تعداد ${longRunning} کوئری در حال اجرا با زمان بیش از ۵ دقیقه شناسایی شدند که ممکن است پردازنده یا قفل‌های جداول را درگیر کرده باشند.`,
          metricValue: `${longRunning} queries > 5m`,
          recommendation: 'Inspect active queries in pg_stat_activity and terminate stalled statements.',
          recommendationFa: 'کوئری‌های فعال را در pg_stat_activity بررسی کرده و تراکنش‌های معلق را خاتمه دهید.',
        });
      }
    } catch {}

    // 10. Bloated Tables Check
    let bloatedCount = 0;
    try {
      const bloatRes = await client.query<{
        schemaname: string;
        relname: string;
        n_dead_tup: string;
        dead_pct: string;
      }>(`
        SELECT 
          schemaname,
          relname,
          n_dead_tup,
          round(n_dead_tup::numeric / GREATEST(n_live_tup + n_dead_tup, 1) * 100, 1) as dead_pct
        FROM pg_stat_user_tables
        WHERE n_dead_tup > 1000 AND (n_dead_tup::numeric / GREATEST(n_live_tup + n_dead_tup, 1)) > 0.20
        ORDER BY n_dead_tup DESC
        LIMIT 5;
      `);
      bloatedCount = bloatRes.rows.length;
      if (bloatedCount > 0) {
        const topTable = bloatRes.rows[0];
        items.push({
          id: 'table_bloat',
          title: 'High Table Dead Tuples (Bloat) Detected',
          titleFa: 'انباشتگی شدید رکوردهای مرده (Table Bloat)',
          category: 'maintenance',
          severity: 'warning',
          description: `Found ${bloatedCount} table(s) with over 20% dead tuples. Table "${topTable.schemaname}.${topTable.relname}" has ${topTable.dead_pct}% dead rows (${topTable.n_dead_tup} dead tuples).`,
          descriptionFa: `تعداد ${bloatedCount} جدول با بیش از ۲۰٪ رکورد مرده شناسایی شد. جدول "${topTable.schemaname}.${topTable.relname}" دارای ${topTable.dead_pct}٪ رکورد مرده است.`,
          metricValue: `${bloatedCount} bloated tables`,
          recommendation: 'Run VACUUM ANALYZE on affected tables or tune autovacuum_vacuum_scale_factor.',
          recommendationFa: 'دستور VACUUM ANALYZE را اجرا کنید یا ضریب autovacuum_vacuum_scale_factor را کاهش دهید.',
          remediationSql: `VACUUM (VERBOSE, ANALYZE) "${topTable.schemaname}"."${topTable.relname}";`,
        });
      } else {
        items.push({
          id: 'table_bloat_clean',
          title: 'Table Tuples & Bloat Under Control',
          titleFa: 'وضعیت رکوردهای مرده و انباشتگی جداول مطلوب است',
          category: 'maintenance',
          severity: 'good',
          description: 'No tables have excessive dead tuples (>20%). Autovacuum is keeping pace with modifications.',
          descriptionFa: 'هیچ جدولی دارای انباشتگی رکوردهای مرده نیست و دیمون پاکسازی همگام با تغییرات پیش می‌رود.',
          metricValue: 'Clean',
          recommendation: 'Keep autovacuum running continuously.',
          recommendationFa: 'اجازه دهید فرایند autovacuum به صورت پیوسته اجرا شود.',
        });
      }
    } catch {}

    // 11. Unused Indexes
    let unusedIdxCount = 0;
    try {
      const unusedIdxRes = await client.query<{
        schemaname: string;
        relname: string;
        indexrelname: string;
        idx_size: string;
      }>(`
        SELECT 
          schemaname,
          relname,
          indexrelname,
          pg_size_pretty(pg_relation_size(indexrelid)) as idx_size
        FROM pg_stat_user_indexes
        JOIN pg_index USING (indexrelid)
        WHERE idx_scan = 0 AND indisunique = false AND indisprimary = false
        LIMIT 5;
      `);
      unusedIdxCount = unusedIdxRes.rows.length;
      if (unusedIdxCount > 0) {
        const topIdx = unusedIdxRes.rows[0];
        items.push({
          id: 'unused_indexes',
          title: 'Redundant / Unused Indexes Detected',
          titleFa: 'ایندکس‌های بلااستفاده و زائد در جداول',
          category: 'performance',
          severity: 'info',
          description: `Found ${unusedIdxCount} index(es) with 0 scans. Index "${topIdx.schemaname}.${topIdx.indexrelname}" on "${topIdx.relname}" (${topIdx.idx_size}) is never used by planner.`,
          descriptionFa: `تعداد ${unusedIdxCount} ایندکس با صفر اسکن یافت شد. ایندکس "${topIdx.schemaname}.${topIdx.indexrelname}" (${topIdx.idx_size}) استفاده نمی‌شود و بار نوشتن اضافه تحمیل می‌کند.`,
          metricValue: `${unusedIdxCount} unused indexes`,
          recommendation: 'Drop unused indexes to speed up write operations (INSERT/UPDATE/DELETE) and save disk space.',
          recommendationFa: 'ایندکس‌های غیرضروری را حذف کنید تا سرعت تراکنش‌های درج و به‌روزرسانی افزایش یابد.',
          remediationSql: `DROP INDEX CONCURRENTLY IF EXISTS "${topIdx.schemaname}"."${topIdx.indexrelname}";`,
        });
      }
    } catch {}

    // Granular Category Scoring
    let secScore = 100;
    let perfScore = 100;
    let maintScore = 100;
    let storScore = 100;

    let criticalCount = 0;
    let warningCount = 0;
    let passedCount = 0;

    for (const item of items) {
      if (item.severity === 'critical') {
        criticalCount++;
        if (item.category === 'security') secScore -= 28;
        else if (item.category === 'performance') perfScore -= 25;
        else if (item.category === 'maintenance') maintScore -= 25;
        else if (item.category === 'storage') storScore -= 30;
        else secScore -= 20;
      } else if (item.severity === 'warning') {
        warningCount++;
        if (item.category === 'security') secScore -= 12;
        else if (item.category === 'performance') perfScore -= 10;
        else if (item.category === 'maintenance') maintScore -= 10;
        else if (item.category === 'storage') storScore -= 12;
        else secScore -= 8;
      } else if (item.severity === 'good') {
        passedCount++;
      }
    }

    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
    const securityScore = clamp(secScore);
    const performanceScore = clamp(perfScore);
    const maintenanceScore = clamp(maintScore);
    const storageScore = clamp(storScore);

    const overallScore = clamp(
      securityScore * 0.35 +
      performanceScore * 0.25 +
      maintenanceScore * 0.20 +
      storageScore * 0.20
    );

    const summary: PostgresHealthAuditSummary = {
      cacheHitRatio,
      indexHitRatio,
      activeConnections: activeConn,
      maxConnections: maxConn,
      connectionUsagePercent: Math.round((activeConn / Math.max(maxConn, 1)) * 100),
      superusersCount: superusers.length,
      sslEnabled: sslOn,
      bloatedTablesCount: bloatedCount,
      unusedIndexesCount: unusedIdxCount,
      idleInTxCount: idleInTx,
      // Phase 19 extensions:
      securityScore,
      performanceScore,
      maintenanceScore,
      storageScore,
      passwordlessRolesCount: passwordlessRoles.length,
      openTrustRulesCount,
      wraparoundMaxAge: maxFrozenAge,
      wraparoundPercent: Math.round((maxFrozenAge / 2000000000) * 100),
      totalDatabaseSizeBytes: totalClusterBytes,
      totalDatabaseSizePretty: formatBytes(totalClusterBytes),
      walArchiverFailing,
      vulnerableSettingsCount,
      superuserNames: superusers,
      passwordlessNames: passwordlessRoles,
    };

    return {
      overallScore,
      securityScore,
      performanceScore,
      maintenanceScore,
      storageScore,
      generatedAt: new Date().toISOString(),
      database: targetDb,
      serverVersion,
      uptime,
      totalChecks: items.length,
      passedCount,
      warningCount,
      criticalCount,
      summary,
      items,
    };
  } finally {
    await client.end();
  }
}

// ==========================================
// Phase 14: PostgreSQL Extensions Management
// ==========================================

export interface PostgresExtensionItem {
  name: string;
  defaultVersion: string;
  installedVersion: string | null;
  comment: string;
  schemaName: string | null;
  isInstalled: boolean;
  isUpdatable: boolean;
  relocatable: boolean;
}

export interface PostgresInstallExtensionRequest {
  database: string;
  extensionName: string;
  schemaName?: string;
  version?: string;
  cascade?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresUpdateExtensionRequest {
  database: string;
  extensionName: string;
  targetVersion?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresDropExtensionRequest {
  database: string;
  extensionName: string;
  cascade?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresExtensionOperationResult {
  success: boolean;
  message: string;
  messageFa: string;
  error?: string;
  errorFa?: string;
  executedSql?: string;
}

/**
 * List all available and installed extensions for a target database
 */
export async function listPostgresExtensions(
  server: RemoteServer,
  options?: { database?: string; port?: number; user?: string; password?: string }
): Promise<PostgresExtensionItem[]> {
  const { client } = createPostgresClient(server, {
    database: options?.database || server.postgres_database || 'postgres',
    port: options?.port,
    user: options?.user,
    password: options?.password,
  });

  await client.connect();

  try {
    const res = await client.query<{
      name: string;
      default_version: string;
      installed_version: string | null;
      comment: string | null;
      relocatable: boolean | null;
      schema_name: string | null;
    }>(`
      SELECT 
        a.name,
        COALESCE(a.default_version, '') AS default_version,
        a.installed_version,
        COALESCE(a.comment, '') AS comment,
        COALESCE(e.extrelocatable, false) AS relocatable,
        n.nspname AS schema_name
      FROM pg_available_extensions a
      LEFT JOIN pg_extension e ON e.extname = a.name
      LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY 
        CASE WHEN a.installed_version IS NOT NULL THEN 0 ELSE 1 END,
        a.name;
    `);

    return res.rows.map((r) => ({
      name: r.name,
      defaultVersion: r.default_version,
      installedVersion: r.installed_version || null,
      comment: r.comment || '',
      schemaName: r.schema_name || null,
      isInstalled: Boolean(r.installed_version),
      isUpdatable: Boolean(
        r.installed_version &&
        r.default_version &&
        r.installed_version !== r.default_version
      ),
      relocatable: Boolean(r.relocatable),
    }));
  } finally {
    await client.end();
  }
}

/**
 * Install an extension into the database
 */
export async function installPostgresExtension(
  server: RemoteServer,
  req: PostgresInstallExtensionRequest
): Promise<PostgresExtensionOperationResult> {
  const cleanExtName = req.extensionName.trim();
  if (!cleanExtName || !/^[a-zA-Z0-9_\-]+$/.test(cleanExtName)) {
    return {
      success: false,
      message: 'Invalid extension identifier.',
      messageFa: 'نام شناسه افزونه نامعتبر است.',
      error: 'Invalid extension name',
    };
  }

  let sql = `CREATE EXTENSION IF NOT EXISTS "${cleanExtName}"`;

  const clauses: string[] = [];
  if (req.schemaName && req.schemaName.trim()) {
    const cleanSchema = req.schemaName.trim();
    if (!/^[a-zA-Z0-9_\-]+$/.test(cleanSchema)) {
      return {
        success: false,
        message: 'Invalid schema identifier.',
        messageFa: 'نام شناسه اسکیما نامعتبر است.',
        error: 'Invalid schema name',
      };
    }
    clauses.push(`SCHEMA "${cleanSchema}"`);
  }

  if (req.version && req.version.trim()) {
    const cleanVer = req.version.trim().replace(/'/g, "''");
    clauses.push(`VERSION '${cleanVer}'`);
  }

  if (req.cascade) {
    clauses.push(`CASCADE`);
  }

  if (clauses.length > 0) {
    sql += ` WITH ${clauses.join(' ')}`;
  }

  sql += ';';

  const { client } = createPostgresClient(server, {
    database: req.database || server.postgres_database || 'postgres',
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    return {
      success: true,
      message: `Extension "${cleanExtName}" installed successfully in database "${req.database}".`,
      messageFa: `افزونه "${cleanExtName}" با موفقیت در پایگاه داده "${req.database}" نصب و فعال گردید.`,
      executedSql: sql,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to install extension "${cleanExtName}": ${err.message || 'Unknown error'}`,
      messageFa: `خطا در نصب افزونه "${cleanExtName}": ${err.message || 'خطای ناشناخته'}`,
      error: err.message,
      executedSql: sql,
    };
  }
}

/**
 * Update an extension to the latest or specified version
 */
export async function updatePostgresExtension(
  server: RemoteServer,
  req: PostgresUpdateExtensionRequest
): Promise<PostgresExtensionOperationResult> {
  const cleanExtName = req.extensionName.trim();
  if (!cleanExtName || !/^[a-zA-Z0-9_\-]+$/.test(cleanExtName)) {
    return {
      success: false,
      message: 'Invalid extension identifier.',
      messageFa: 'نام شناسه افزونه نامعتبر است.',
      error: 'Invalid extension name',
    };
  }

  let sql = `ALTER EXTENSION "${cleanExtName}" UPDATE`;
  if (req.targetVersion && req.targetVersion.trim()) {
    const cleanVer = req.targetVersion.trim().replace(/'/g, "''");
    sql += ` TO '${cleanVer}'`;
  }
  sql += ';';

  const { client } = createPostgresClient(server, {
    database: req.database || server.postgres_database || 'postgres',
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    return {
      success: true,
      message: `Extension "${cleanExtName}" updated successfully in database "${req.database}".`,
      messageFa: `افزونه "${cleanExtName}" با موفقیت در پایگاه داده "${req.database}" به نگارش جدید ارتقا یافت.`,
      executedSql: sql,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to update extension "${cleanExtName}": ${err.message || 'Unknown error'}`,
      messageFa: `خطا در ارتقای افزونه "${cleanExtName}": ${err.message || 'خطای ناشناخته'}`,
      error: err.message,
      executedSql: sql,
    };
  }
}

/**
 * Drop an extension from the database
 */
export async function dropPostgresExtension(
  server: RemoteServer,
  req: PostgresDropExtensionRequest
): Promise<PostgresExtensionOperationResult> {
  const cleanExtName = req.extensionName.trim();
  if (!cleanExtName || !/^[a-zA-Z0-9_\-]+$/.test(cleanExtName)) {
    return {
      success: false,
      message: 'Invalid extension identifier.',
      messageFa: 'نام شناسه افزونه نامعتبر است.',
      error: 'Invalid extension name',
    };
  }

  let sql = `DROP EXTENSION IF EXISTS "${cleanExtName}"`;
  if (req.cascade) {
    sql += ` CASCADE`;
  }
  sql += ';';

  const { client } = createPostgresClient(server, {
    database: req.database || server.postgres_database || 'postgres',
    port: req.port,
    user: req.user,
    password: req.sessionPassword,
  });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    return {
      success: true,
      message: `Extension "${cleanExtName}" dropped successfully from database "${req.database}".`,
      messageFa: `افزونه "${cleanExtName}" با موفقیت از پایگاه داده "${req.database}" حذف گردید.`,
      executedSql: sql,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Failed to drop extension "${cleanExtName}": ${err.message || 'Unknown error'}`,
      messageFa: `خطا در حذف افزونه "${cleanExtName}": ${err.message || 'خطای ناشناخته'}`,
      error: err.message,
      executedSql: sql,
    };
  }
}

// ============================================================================
// PHASE 16: pg_hba.conf / Client Authentication Management Implementation
// ============================================================================

/**
 * Parse a single line from pg_hba.conf into a structured rule object
 */
export function parseHbaLine(
  line: string,
  lineNumber: number,
  liveRuleErrors?: Map<number, string>
): PostgresHbaRule | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let isCommented = false;
  let workLine = trimmed;

  if (workLine.startsWith('#')) {
    isCommented = true;
    workLine = workLine.replace(/^#+\s*/, '').trim();
  }

  // Parse tokens while preserving quotes
  const tokens: string[] = [];
  let currentToken = '';
  let inQuote = false;
  let commentPart = '';

  for (let i = 0; i < workLine.length; i++) {
    const ch = workLine[i];
    if (ch === '"') {
      inQuote = !inQuote;
      currentToken += ch;
    } else if (ch === '#' && !inQuote) {
      commentPart = workLine.slice(i + 1).trim();
      break;
    } else if (/\s/.test(ch) && !inQuote) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    } else {
      currentToken += ch;
    }
  }
  if (currentToken) {
    tokens.push(currentToken);
  }

  if (tokens.length < 3) {
    return null; // Not an HBA rule (plain comment or header)
  }

  const rawType = tokens[0].toLowerCase();
  const validTypes = ['local', 'host', 'hostssl', 'hostnossl', 'hostgssenc', 'hostnogssenc'];
  if (!validTypes.includes(rawType)) {
    return null; // Not an HBA rule
  }

  const type = rawType as PostgresHbaType;
  const database = tokens[1];
  const user = tokens[2];
  let address: string | undefined = undefined;
  let netmask: string | undefined = undefined;
  let method = '';
  let options: string | undefined = undefined;

  let currentIdx = 3;

  if (type !== 'local') {
    if (tokens.length < 4) return null;
    address = tokens[currentIdx++];

    // If next token is an IPv4 netmask (e.g. 255.255.255.0) and there is a subsequent method token
    if (
      tokens.length > currentIdx + 1 &&
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(tokens[currentIdx]) &&
      !tokens[currentIdx].includes('/')
    ) {
      netmask = tokens[currentIdx++];
    }
  }

  if (currentIdx < tokens.length) {
    method = tokens[currentIdx++];
  }

  if (currentIdx < tokens.length) {
    options = tokens.slice(currentIdx).join(' ');
  }

  const error = liveRuleErrors?.get(lineNumber);

  return {
    id: `hba-rule-${lineNumber}-${Math.random().toString(36).substring(2, 7)}`,
    lineNumber,
    rawLine: line,
    type,
    database,
    databaseList: database.split(',').map((s) => s.trim().replace(/^"|"$/g, '')),
    user,
    userList: user.split(',').map((s) => s.trim().replace(/^"|"$/g, '')),
    address,
    netmask,
    method: method || 'scram-sha-256',
    options,
    comment: commentPart || undefined,
    enabled: !isCommented,
    error,
  };
}

/**
 * Format a structured PostgresHbaRule into a clean, aligned configuration line
 */
export function formatHbaRuleToLine(rule: PostgresHbaRule): string {
  const parts: string[] = [];
  parts.push(rule.type.padEnd(10, ' '));
  parts.push(rule.database.padEnd(18, ' '));
  parts.push(rule.user.padEnd(18, ' '));

  if (rule.type !== 'local') {
    const addr = rule.address || '127.0.0.1/32';
    if (rule.netmask) {
      parts.push(`${addr} ${rule.netmask}`.padEnd(24, ' '));
    } else {
      parts.push(addr.padEnd(24, ' '));
    }
  } else {
    parts.push(''.padEnd(24, ' '));
  }

  parts.push(rule.method.padEnd(14, ' '));

  if (rule.options) {
    parts.push(rule.options.trim());
  }

  let line = parts.join(' ').trimEnd();

  if (!rule.enabled) {
    line = `# ${line}`;
  }

  if (rule.comment) {
    line += ` # ${rule.comment}`;
  }

  return line;
}

/**
 * Generate a standard unified diff between two text files
 */
export function generateUnifiedDiff(
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
 * Query PostgreSQL for actual active hba_file path and read/parse its rules and backups
 */
export async function getPostgresHbaConfig(
  server: RemoteServer,
  opts?: { sessionPassword?: string; database?: string; port?: number; user?: string }
): Promise<PostgresHbaConfigData> {
  const { client } = createPostgresClient(server, {
    database: opts?.database || server.postgres_database || 'postgres',
    port: opts?.port,
    user: opts?.user,
    password: opts?.sessionPassword,
  });

  let hbaFilePath = '';
  const liveErrors = new Map<number, string>();

  try {
    await client.connect();
    const hbaRes = await client.query("SHOW hba_file;");
    hbaFilePath = hbaRes.rows?.[0]?.hba_file || '';

    // Check pg_hba_file_rules if available (PostgreSQL 10+)
    try {
      const rulesRes = await client.query(
        "SELECT line_number, error FROM pg_hba_file_rules WHERE error IS NOT NULL ORDER BY line_number ASC;"
      );
      for (const r of rulesRes.rows || []) {
        if (r.line_number && r.error) {
          liveErrors.set(Number(r.line_number), String(r.error));
        }
      }
    } catch {}

    await client.end();
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    throw new Error(`Failed to query PostgreSQL for hba_file location: ${err.message}`);
  }

  if (!hbaFilePath) {
    throw new Error('PostgreSQL did not return a valid hba_file path.');
  }

  // Use SSH to read file, permissions, and backups
  const sshCmd = `export LC_ALL=C
if [ -f "${hbaFilePath}" ]; then
  echo "===FILE_EXISTS==="
  stat -c "%s|%Y" "${hbaFilePath}" 2>/dev/null || stat -f "%z|%m" "${hbaFilePath}" 2>/dev/null || echo "0|0"
  [ -r "${hbaFilePath}" ] && echo "READABLE=1" || echo "READABLE=0"
  [ -w "${hbaFilePath}" ] && echo "WRITABLE=1" || echo "WRITABLE=0"
  echo "===BACKUPS==="
  ls -1t "${hbaFilePath}.bak."* 2>/dev/null | head -n 15 || true
  echo "===CONTENT==="
  cat "${hbaFilePath}"
else
  echo "===FILE_NOT_FOUND==="
fi
`;

  let sshOut = '';
  try {
    sshOut = await runAdaptiveSshCommand(server, sshCmd, opts?.sessionPassword, 15000);
  } catch (sshErr: any) {
    throw new Error(`Failed to read pg_hba.conf via SSH on ${server.ip || server.name}: ${sshErr.message}`);
  }

  if (sshOut.includes('===FILE_NOT_FOUND===')) {
    throw new Error(`pg_hba.conf file not found on remote server at: ${hbaFilePath}`);
  }

  const statPart = sshOut.split('===FILE_EXISTS===')[1]?.split('===BACKUPS===')[0] || '';
  const statLines = statPart.trim().split('\n');
  const sizeAndMtime = (statLines[0] || '0|0').split('|');
  const fileSize = parseInt(sizeAndMtime[0], 10) || 0;
  const mtimeSec = parseInt(sizeAndMtime[1], 10) || 0;
  const lastModified = mtimeSec > 0 ? new Date(mtimeSec * 1000).toISOString() : new Date().toISOString();
  const readable = statPart.includes('READABLE=1');
  const writable = statPart.includes('WRITABLE=1');

  // Backups parsing
  const backupsPart = sshOut.split('===BACKUPS===')[1]?.split('===CONTENT===')[0] || '';
  const backupPaths = backupsPart
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.startsWith(hbaFilePath));

  const backups: PostgresHbaBackupItem[] = backupPaths.map((p) => {
    const fileName = p.split('/').pop() || p;
    return {
      name: fileName,
      path: p,
      sizeBytes: 0,
      sizeHuman: 'Backup',
      createdAt: fileName.split('.bak.').pop()?.replace(/_/g, ' ') || 'Unknown',
    };
  });

  const rawContent = sshOut.split('===CONTENT===')[1] || '';
  const rawLines = rawContent.split('\n');

  const rules: PostgresHbaRule[] = [];
  rawLines.forEach((line, index) => {
    const lineNum = index + 1;
    const rule = parseHbaLine(line, lineNum, liveErrors);
    if (rule) {
      rules.push(rule);
    }
  });

  const totalRules = rules.length;
  const enabledRules = rules.filter((r) => r.enabled).length;
  const syntaxErrors = liveErrors.size;

  return {
    metadata: {
      hbaFilePath,
      fileSize,
      fileSizeHuman: formatBytesPretty(fileSize),
      lastModified,
      readable,
      writable,
      totalRules,
      enabledRules,
      syntaxErrors,
      backups,
    },
    rules,
    rawContent,
  };
}

/**
 * Save pg_hba.conf rules following the mandatory safety workflow:
 * Backup -> Validate -> Show Diff -> Apply -> Reload -> Verify (Rollback on syntax error)
 */
export async function savePostgresHbaConfig(
  server: RemoteServer,
  req: PostgresHbaSaveRequest,
  opts?: { sessionPassword?: string; database?: string; port?: number; user?: string }
): Promise<PostgresHbaSaveResult> {
  const { client } = createPostgresClient(server, {
    database: req.database || opts?.database || server.postgres_database || 'postgres',
    port: req.port || opts?.port,
    user: req.user || opts?.user,
    password: req.sessionPassword || opts?.sessionPassword,
  });

  let hbaFilePath = '';
  try {
    await client.connect();
    const hbaRes = await client.query("SHOW hba_file;");
    hbaFilePath = hbaRes.rows?.[0]?.hba_file || '';
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: `Failed to connect to PostgreSQL to verify hba_file: ${err.message}`,
      messageFa: `خطا در ارتباط با PostgreSQL جهت بررسی مسیر فایل hba: ${err.message}`,
      errors: [err.message],
    };
  }

  if (!hbaFilePath) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: 'PostgreSQL did not return hba_file path.',
      messageFa: 'سرور PostgreSQL مسیر فایل hba را بازنگرداند.',
      errors: ['hba_file is empty'],
    };
  }

  // 1. Validate rules
  const validationErrors: string[] = [];
  if (!req.rules || req.rules.length === 0) {
    validationErrors.push('At least one authentication rule must be specified.');
  }

  req.rules.forEach((r, idx) => {
    if (!['local', 'host', 'hostssl', 'hostnossl', 'hostgssenc', 'hostnogssenc'].includes(r.type)) {
      validationErrors.push(`Rule #${idx + 1}: Invalid connection type "${r.type}".`);
    }
    if (!r.database || !r.database.trim()) {
      validationErrors.push(`Rule #${idx + 1}: Database cannot be empty.`);
    }
    if (!r.user || !r.user.trim()) {
      validationErrors.push(`Rule #${idx + 1}: User cannot be empty.`);
    }
    if (r.type !== 'local' && (!r.address || !r.address.trim())) {
      validationErrors.push(`Rule #${idx + 1}: Address is required for TCP/IP connection type "${r.type}".`);
    }
    if (!r.method || !r.method.trim()) {
      validationErrors.push(`Rule #${idx + 1}: Authentication method cannot be empty.`);
    }
  });

  if (validationErrors.length > 0) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: 'Validation failed for one or more rules.',
      messageFa: 'اعتبارسنجی قوانین احراز هویت با خطا مواجه شد.',
      errors: validationErrors,
    };
  }

  // 2. Read existing content for diff and backup
  const readCmd = `cat "${hbaFilePath}" 2>/dev/null || true`;
  let existingContent = '';
  try {
    existingContent = await runAdaptiveSshCommand(server, readCmd, req.sessionPassword || opts?.sessionPassword, 10000);
  } catch (err: any) {
    console.warn('[HBA read warning]:', err);
  }

  // 3. Generate new content
  const generatedLines: string[] = [
    '# ============================================================================',
    '# PostgreSQL Client Authentication Configuration File (pg_hba.conf)',
    '# Managed via NetTopology Remote Fleet Panel',
    `# Updated at: ${new Date().toISOString()}`,
    '# ============================================================================',
    '# TYPE      DATABASE          USER              ADDRESS                 METHOD        OPTIONS',
    '',
  ];

  req.rules.forEach((r) => {
    generatedLines.push(formatHbaRuleToLine(r));
  });
  generatedLines.push(''); // trailing newline

  const newContent = generatedLines.join('\n');
  const diffText = generateUnifiedDiff(existingContent, newContent, 'current-pg_hba.conf', 'updated-pg_hba.conf');

  // 4. Create Backup on remote server
  const timestampStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const backupPath = `${hbaFilePath}.bak.${timestampStr}`;
  const base64New = Buffer.from(newContent, 'utf-8').toString('base64');
  const tempPath = `/tmp/pg_hba_new_${Date.now()}.conf`;

  const applyScript = `export LC_ALL=C
set -e
# Step 1: Backup current file
if [ -f "${hbaFilePath}" ]; then
  cp -a "${hbaFilePath}" "${backupPath}"
fi

# Step 2: Write temp file
echo "${base64New}" | base64 -d > "${tempPath}"

# Step 3: Match permissions and ownership
chmod --reference="${hbaFilePath}" "${tempPath}" 2>/dev/null || chmod 600 "${tempPath}"
chown --reference="${hbaFilePath}" "${tempPath}" 2>/dev/null || true

# Step 4: Atomic replacement
mv -f "${tempPath}" "${hbaFilePath}"
echo "APPLY_OK"
`;

  try {
    const applyOut = await runAdaptiveSshCommand(server, applyScript, req.sessionPassword || opts?.sessionPassword, 15000);
    if (!applyOut.includes('APPLY_OK')) {
      throw new Error(`SSH script did not confirm replacement: ${applyOut}`);
    }
  } catch (sshErr: any) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: `Failed to write pg_hba.conf via SSH: ${sshErr.message}`,
      messageFa: `خطا در نوشتن فایل pg_hba.conf از طریق SSH: ${sshErr.message}`,
      errors: [sshErr.message],
    };
  }

  // 5. Reload PostgreSQL and Verify syntax
  let reloadOk = false;
  const syntaxErrorsDetected: string[] = [];

  try {
    await client.query("SELECT pg_reload_conf();");
    reloadOk = true;

    // Check pg_hba_file_rules for errors
    const checkRes = await client.query(
      "SELECT line_number, error FROM pg_hba_file_rules WHERE error IS NOT NULL ORDER BY line_number ASC;"
    );
    for (const row of checkRes.rows || []) {
      syntaxErrorsDetected.push(`Line ${row.line_number}: ${row.error}`);
    }
  } catch (relErr: any) {
    syntaxErrorsDetected.push(`Reload execution failed: ${relErr.message}`);
  }

  // 6. Automatic Rollback if syntax error is detected!
  if (syntaxErrorsDetected.length > 0) {
    console.error('[HBA Syntax Error! Executing Automatic Rollback]:', syntaxErrorsDetected);
    const rollbackScript = `export LC_ALL=C
if [ -f "${backupPath}" ]; then
  cp -f "${backupPath}" "${hbaFilePath}"
  echo "ROLLBACK_RESTORED"
fi
`;
    try {
      await runAdaptiveSshCommand(server, rollbackScript, req.sessionPassword || opts?.sessionPassword, 10000);
      try {
        await client.query("SELECT pg_reload_conf();");
      } catch {}
    } catch (rbErr: any) {
      console.error('[HBA Rollback Script Failed]:', rbErr);
    }

    try {
      await client.end();
    } catch {}

    return {
      success: false,
      message: `Syntax validation failed after reload. Configuration was automatically rolled back to prevent lockout. Errors: ${syntaxErrorsDetected.join('; ')}`,
      messageFa: `اعتبارسنجی ساختار پس از بارگذاری ناموفق بود. جهت جلوگیری از قطع دسترسی، فایل به نسخه پشتیبان بازگردانده شد. خطاها: ${syntaxErrorsDetected.join('; ')}`,
      backupPath,
      diffText,
      reloaded: false,
      syntaxValid: false,
      errors: syntaxErrorsDetected,
    };
  }

  try {
    await client.end();
  } catch {}

  return {
    success: true,
    message: `pg_hba.conf successfully updated and reloaded with zero errors. Backup created at ${backupPath}.`,
    messageFa: `فایل pg_hba.conf با موفقیت بدون هیچ خطایی به‌روزرسانی و بارگذاری مجدد شد. نسخه پشتیبان در مسیر ${backupPath} ذخیره گردید.`,
    backupPath,
    diffText,
    reloaded: true,
    syntaxValid: true,
    rules: req.rules,
  };
}

/**
 * Restore pg_hba.conf from a previous timestamped backup file
 */
export async function restorePostgresHbaBackup(
  server: RemoteServer,
  req: PostgresHbaRestoreRequest,
  opts?: { sessionPassword?: string; database?: string; port?: number; user?: string }
): Promise<PostgresHbaSaveResult> {
  const { client } = createPostgresClient(server, {
    database: req.database || opts?.database || server.postgres_database || 'postgres',
    port: req.port || opts?.port,
    user: req.user || opts?.user,
    password: req.sessionPassword || opts?.sessionPassword,
  });

  let hbaFilePath = '';
  try {
    await client.connect();
    const hbaRes = await client.query("SHOW hba_file;");
    hbaFilePath = hbaRes.rows?.[0]?.hba_file || '';
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: `Failed to query PostgreSQL for hba_file: ${err.message}`,
      messageFa: `خطا در دریافت مسیر hba_file: ${err.message}`,
      errors: [err.message],
    };
  }

  const cleanBackupName = req.backupFileName.trim().replace(/[^a-zA-Z0-9_\-\.]/g, '');
  if (!cleanBackupName || !cleanBackupName.includes('.bak.')) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: 'Invalid backup file name.',
      messageFa: 'نام فایل پشتیبان نامعتبر است.',
      errors: ['Invalid backup file name'],
    };
  }

  const backupDir = path.dirname(hbaFilePath);
  const targetBackupFile = path.join(backupDir, cleanBackupName);

  const restoreScript = `export LC_ALL=C
set -e
if [ ! -f "${targetBackupFile}" ]; then
  echo "BACKUP_NOT_FOUND"
  exit 1
fi

# Safeguard backup before restore
cp -a "${hbaFilePath}" "${hbaFilePath}.bak.pre_restore_$(date +%Y%m%d_%H%M%S)"
# Restore
cp -f "${targetBackupFile}" "${hbaFilePath}"
chmod --reference="${targetBackupFile}" "${hbaFilePath}" 2>/dev/null || chmod 600 "${hbaFilePath}"
echo "RESTORE_OK"
`;

  try {
    const resOut = await runAdaptiveSshCommand(server, restoreScript, req.sessionPassword || opts?.sessionPassword, 15000);
    if (!resOut.includes('RESTORE_OK')) {
      throw new Error(`Restore failed: ${resOut}`);
    }
  } catch (sshErr: any) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: `Failed to restore backup via SSH: ${sshErr.message}`,
      messageFa: `خطا در بازیابی نسخه پشتیبان از طریق SSH: ${sshErr.message}`,
      errors: [sshErr.message],
    };
  }

  // Reload config
  try {
    await client.query("SELECT pg_reload_conf();");
    await client.end();
  } catch (relErr: any) {
    try {
      await client.end();
    } catch {}
    return {
      success: true,
      message: `Backup restored, but pg_reload_conf returned: ${relErr.message}`,
      messageFa: `نسخه پشتیبان بازیابی شد اما بارگذاری مجدد با پیام زیر خاتمه یافت: ${relErr.message}`,
      reloaded: false,
    };
  }

  return {
    success: true,
    message: `Successfully restored pg_hba.conf from backup "${cleanBackupName}" and reloaded configuration.`,
    messageFa: `فایل pg_hba.conf با موفقیت از نسخه پشتیبان "${cleanBackupName}" بازیابی و بارگذاری مجدد شد.`,
    reloaded: true,
    syntaxValid: true,
  };
}

/**
 * Reload PostgreSQL configuration via pg_reload_conf() and return syntax status
 */
export async function reloadPostgresHba(
  server: RemoteServer,
  opts?: { sessionPassword?: string; database?: string; port?: number; user?: string }
): Promise<{ success: boolean; message: string; messageFa?: string; errors?: string[] }> {
  const { client } = createPostgresClient(server, {
    database: opts?.database || server.postgres_database || 'postgres',
    port: opts?.port,
    user: opts?.user,
    password: opts?.sessionPassword,
  });

  try {
    await client.connect();
    await client.query("SELECT pg_reload_conf();");

    const errRes = await client.query(
      "SELECT line_number, error FROM pg_hba_file_rules WHERE error IS NOT NULL ORDER BY line_number ASC;"
    );
    const syntaxErrors = (errRes.rows || []).map((r) => `Line ${r.line_number}: ${r.error}`);

    await client.end();

    if (syntaxErrors.length > 0) {
      return {
        success: false,
        message: `PostgreSQL configuration reloaded, but syntax errors were detected in pg_hba.conf: ${syntaxErrors.join('; ')}`,
        messageFa: `تنظیمات PostgreSQL بارگذاری شد، اما خطاهای ساختاری در pg_hba.conf مشاهده گردید: ${syntaxErrors.join('; ')}`,
        errors: syntaxErrors,
      };
    }

    return {
      success: true,
      message: 'PostgreSQL configuration reloaded successfully. All pg_hba.conf rules are valid.',
      messageFa: 'پیکربندی PostgreSQL با موفقیت بارگذاری شد. تمام قوانین pg_hba.conf معتبر هستند.',
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      message: `Failed to reload PostgreSQL configuration: ${err.message}`,
      messageFa: `خطا در بارگذاری مجدد پیکربندی PostgreSQL: ${err.message}`,
      errors: [err.message],
    };
  }
}

/**
 * ============================================================================
 * PHASE 18: Database Maintenance & Optimization (VACUUM, ANALYZE, REINDEX)
 * ============================================================================
 */

export function evaluateMaintenanceLockWarning(
  action: 'vacuum' | 'analyze' | 'reindex',
  options: { full?: boolean; concurrently?: boolean }
): {
  level: 'none' | 'low' | 'moderate' | 'heavy' | 'exclusive';
  lockName: string;
  blocksReads: boolean;
  blocksWrites: boolean;
  description: string;
  descriptionFa: string;
} {
  if (action === 'vacuum') {
    if (options.full) {
      return {
        level: 'exclusive',
        lockName: 'AccessExclusiveLock',
        blocksReads: true,
        blocksWrites: true,
        description:
          'VACUUM FULL rewrites the entire table to reclaim disk space to OS. It acquires an AccessExclusiveLock, blocking all concurrent SELECT, INSERT, UPDATE, and DELETE operations until finished.',
        descriptionFa:
          'دستور VACUUM FULL کل جدول را از نو بازنویسی می‌کند تا فضای دیسک را به سیستم‌عامل بازگرداند. این عملیات قفل انحصاری کامل (AccessExclusiveLock) می‌گیرد و کلیه خواندن‌ها و نوشتن‌ها تا پایان مسدود می‌شوند.',
      };
    }
    return {
      level: 'low',
      lockName: 'ShareUpdateExclusiveLock',
      blocksReads: false,
      blocksWrites: false,
      description:
        'Standard VACUUM runs completely online without blocking normal SELECT, INSERT, UPDATE, or DELETE operations. It reclaims dead space for future table inserts.',
      descriptionFa:
        'دستور VACUUM استاندارد به صورت آنلاین و بدون مسدودسازی تراکنش‌های خواندن یا نوشتن اجرا شده و فضاهای خالی را برای رکوردهای بعدی آماده می‌کند.',
    };
  }

  if (action === 'analyze') {
    return {
      level: 'low',
      lockName: 'ShareUpdateExclusiveLock',
      blocksReads: false,
      blocksWrites: false,
      description:
        'ANALYZE collects distribution statistics about the contents of tables to optimize query planner execution plans. Normal queries continue unaffected.',
      descriptionFa:
        'دستور ANALYZE آمار توزیع داده‌ها را جهت بهینه‌سازی نقشه اجرای کوئری‌ها جمع‌آوری می‌کند و تاثیری در اجرای کوئری‌های عادی ندارد.',
    };
  }

  // action === 'reindex'
  if (options.concurrently) {
    return {
      level: 'moderate',
      lockName: 'ShareUpdateExclusiveLock (CONCURRENTLY)',
      blocksReads: false,
      blocksWrites: false,
      description:
        'REINDEX CONCURRENTLY rebuilds indexes in the background without locking out concurrent SELECT, INSERT, UPDATE, or DELETE operations.',
      descriptionFa:
        'دستور REINDEX CONCURRENTLY ایندکس‌ها را در پس‌زمینه بدون مسدود کردن خواندن یا نوشتن بازسازی می‌کند.',
    };
  }

  return {
    level: 'heavy',
    lockName: 'ShareLock',
    blocksReads: false,
    blocksWrites: true,
    description:
      'Standard REINDEX locks out all write operations (INSERT, UPDATE, DELETE) on the target table until the index rebuild is finished. Reads remain operational.',
    descriptionFa:
      'دستور REINDEX استاندارد کلیه عملیات‌های نوشتن (درج، ویرایش و حذف) را تا اتمام بازسازی ایندکس مسدود می‌کند، ولی خواندن فعال می‌ماند.',
  };
}

export async function runPostgresMaintenance(
  server: RemoteServer,
  params: {
    action: 'vacuum' | 'analyze' | 'reindex';
    scope: 'table' | 'database' | 'schema' | 'index';
    database: string;
    schema?: string;
    table?: string;
    indexName?: string;
    full?: boolean;
    freeze?: boolean;
    analyzeWithVacuum?: boolean;
    verbose?: boolean;
    concurrently?: boolean;
    port?: number;
    user?: string;
    sessionPassword?: string;
  }
): Promise<{
  success: boolean;
  action: 'vacuum' | 'analyze' | 'reindex';
  scope: 'table' | 'database' | 'schema' | 'index';
  targetDescription: string;
  executedCommand: string;
  durationMs: number;
  message: string;
  messageFa: string;
  lockWarning?: {
    level: 'none' | 'low' | 'moderate' | 'heavy' | 'exclusive';
    lockName: string;
    blocksReads: boolean;
    blocksWrites: boolean;
    description: string;
    descriptionFa: string;
  };
  outputLogs?: string[];
  error?: string;
  errorFa?: string;
}> {
  const { client } = createPostgresClient(server, {
    database: params.database,
    port: params.port,
    user: params.user,
    password: params.sessionPassword,
  });

  const outputLogs: string[] = [];
  const lockWarning = evaluateMaintenanceLockWarning(params.action, {
    full: params.full,
    concurrently: params.concurrently,
  });

  let executedCommand = '';
  let targetDescription = '';

  // Construct target description and valid SQL statement
  if (params.action === 'vacuum') {
    const opts: string[] = [];
    if (params.full) opts.push('FULL');
    if (params.freeze) opts.push('FREEZE');
    if (params.verbose) opts.push('VERBOSE');
    if (params.analyzeWithVacuum) opts.push('ANALYZE');

    const optString = opts.length > 0 ? `(${opts.join(', ')})` : '';

    if (params.scope === 'table' && params.table) {
      const targetIdent = params.schema
        ? `"${params.schema.replace(/"/g, '""')}"."${params.table.replace(/"/g, '""')}"`
        : `"${params.table.replace(/"/g, '""')}"`;
      executedCommand = `VACUUM ${optString} ${targetIdent};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Table ${targetIdent}`;
    } else {
      executedCommand = `VACUUM ${optString};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Entire Database "${params.database}"`;
    }
  } else if (params.action === 'analyze') {
    const optString = params.verbose ? 'VERBOSE' : '';
    if (params.scope === 'table' && params.table) {
      const targetIdent = params.schema
        ? `"${params.schema.replace(/"/g, '""')}"."${params.table.replace(/"/g, '""')}"`
        : `"${params.table.replace(/"/g, '""')}"`;
      executedCommand = `ANALYZE ${optString} ${targetIdent};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Table ${targetIdent}`;
    } else {
      executedCommand = `ANALYZE ${optString};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Entire Database "${params.database}"`;
    }
  } else if (params.action === 'reindex') {
    const concurrentStr = params.concurrently ? 'CONCURRENTLY' : '';

    if (params.scope === 'table' && params.table) {
      const targetIdent = params.schema
        ? `"${params.schema.replace(/"/g, '""')}"."${params.table.replace(/"/g, '""')}"`
        : `"${params.table.replace(/"/g, '""')}"`;
      executedCommand = `REINDEX TABLE ${concurrentStr} ${targetIdent};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Table ${targetIdent}`;
    } else if (params.scope === 'index' && params.indexName) {
      const targetIdent = params.schema
        ? `"${params.schema.replace(/"/g, '""')}"."${params.indexName.replace(/"/g, '""')}"`
        : `"${params.indexName.replace(/"/g, '""')}"`;
      executedCommand = `REINDEX INDEX ${concurrentStr} ${targetIdent};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Index ${targetIdent}`;
    } else if (params.scope === 'schema' && params.schema) {
      const schemaIdent = `"${params.schema.replace(/"/g, '""')}"`;
      executedCommand = `REINDEX SCHEMA ${concurrentStr} ${schemaIdent};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Schema ${schemaIdent}`;
    } else {
      // Reindex Database
      const dbIdent = `"${params.database.replace(/"/g, '""')}"`;
      executedCommand = `REINDEX DATABASE ${concurrentStr} ${dbIdent};`.trim().replace(/\s+/g, ' ');
      targetDescription = `Entire Database "${params.database}"`;
    }
  }

  const startTime = Date.now();

  try {
    // Listen for PostgreSQL server notices (e.g. VACUUM VERBOSE logs)
    client.on('notice', (msg) => {
      if (msg && msg.message) {
        outputLogs.push(msg.message);
      }
    });

    await client.connect();
    await client.query(executedCommand);
    const durationMs = Date.now() - startTime;
    await client.end();

    const actionUpper = params.action.toUpperCase();

    return {
      success: true,
      action: params.action,
      scope: params.scope,
      targetDescription,
      executedCommand,
      durationMs,
      message: `${actionUpper} executed successfully on ${targetDescription} in ${durationMs} ms.`,
      messageFa: `عملیات ${actionUpper} با موفقیت روی ${targetDescription} ظرف مدت ${durationMs} میلی‌ثانیه اجرا شد.`,
      lockWarning,
      outputLogs: outputLogs.length > 0 ? outputLogs : undefined,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    const durationMs = Date.now() - startTime;

    return {
      success: false,
      action: params.action,
      scope: params.scope,
      targetDescription,
      executedCommand,
      durationMs,
      message: `Failed to execute ${params.action.toUpperCase()} on ${targetDescription}: ${err.message}`,
      messageFa: `خطا در اجرای ${params.action.toUpperCase()} روی ${targetDescription}: ${err.message}`,
      lockWarning,
      outputLogs: outputLogs.length > 0 ? outputLogs : undefined,
      error: err.message,
      errorFa: `خطا در اجرای دستور پایگاه داده: ${err.message}`,
    };
  }
}

/**
 * Retrieve dead tuples, bloat estimates and maintenance recommendations
 */
export async function getPostgresBloatMetrics(
  server: RemoteServer,
  database: string,
  schema?: string,
  table?: string,
  opts?: { port?: number; user?: string; sessionPassword?: string }
): Promise<Array<{
  schema: string;
  tableName: string;
  liveTuples: number;
  deadTuples: number;
  deadTupleRatio: number;
  totalSizeBytes: number;
  totalSizePretty: string;
  tableSizeBytes: number;
  tableSizePretty: string;
  indexSizeBytes: number;
  indexSizePretty: string;
  lastVacuum?: string | null;
  lastAutovacuum?: string | null;
  lastAnalyze?: string | null;
  lastAutoanalyze?: string | null;
  vacuumRecommended: boolean;
  analyzeRecommended: boolean;
  reindexRecommended: boolean;
}>> {
  const { client } = createPostgresClient(server, {
    database,
    port: opts?.port,
    user: opts?.user,
    password: opts?.sessionPassword,
  });

  try {
    await client.connect();

    const sql = `
      SELECT
        schemaname AS "schema",
        relname AS "tableName",
        COALESCE(n_live_tup, 0)::bigint AS "liveTuples",
        COALESCE(n_dead_tup, 0)::bigint AS "deadTuples",
        ROUND(
          CASE WHEN (COALESCE(n_live_tup, 0) + COALESCE(n_dead_tup, 0)) > 0
            THEN (COALESCE(n_dead_tup, 0)::numeric / (COALESCE(n_live_tup, 0) + COALESCE(n_dead_tup, 0))::numeric) * 100
            ELSE 0
          END, 2
        )::float AS "deadTupleRatio",
        pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))::bigint AS "totalSizeBytes",
        pg_size_pretty(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS "totalSizePretty",
        pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))::bigint AS "tableSizeBytes",
        pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS "tableSizePretty",
        pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(relname))::bigint AS "indexSizeBytes",
        pg_size_pretty(pg_indexes_size(quote_ident(schemaname) || '.' || quote_ident(relname))) AS "indexSizePretty",
        last_vacuum AS "lastVacuum",
        last_autovacuum AS "lastAutovacuum",
        last_analyze AS "lastAnalyze",
        last_autoanalyze AS "lastAutoanalyze"
      FROM pg_stat_user_tables
      WHERE ($1::text IS NULL OR schemaname = $1)
        AND ($2::text IS NULL OR relname = $2)
      ORDER BY n_dead_tup DESC, n_live_tup DESC
      LIMIT 100;
    `;

    const res = await client.query(sql, [schema || null, table || null]);
    await client.end();

    return (res.rows || []).map((r) => {
      const deadTuples = Number(r.deadTuples) || 0;
      const deadRatio = Number(r.deadTupleRatio) || 0;
      const indexSizeBytes = Number(r.indexSizeBytes) || 0;

      // Smart recommendations based on dead tuples, bloat ratio, and statistics freshness
      const vacuumRecommended = deadTuples > 500 && deadRatio > 10;
      const analyzeRecommended = (!r.lastAnalyze && !r.lastAutoanalyze) || deadRatio > 20;
      const reindexRecommended = indexSizeBytes > 10000000 && deadRatio > 25;

      return {
        schema: r.schema,
        tableName: r.tableName,
        liveTuples: Number(r.liveTuples) || 0,
        deadTuples,
        deadTupleRatio: deadRatio,
        totalSizeBytes: Number(r.totalSizeBytes) || 0,
        totalSizePretty: r.totalSizePretty || '0 bytes',
        tableSizeBytes: Number(r.tableSizeBytes) || 0,
        tableSizePretty: r.tableSizePretty || '0 bytes',
        indexSizeBytes,
        indexSizePretty: r.indexSizePretty || '0 bytes',
        lastVacuum: r.lastVacuum ? new Date(r.lastVacuum).toISOString() : null,
        lastAutovacuum: r.lastAutovacuum ? new Date(r.lastAutovacuum).toISOString() : null,
        lastAnalyze: r.lastAnalyze ? new Date(r.lastAnalyze).toISOString() : null,
        lastAutoanalyze: r.lastAutoanalyze ? new Date(r.lastAutoanalyze).toISOString() : null,
        vacuumRecommended,
        analyzeRecommended,
        reindexRecommended,
      };
    });
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    console.error('[Postgres Bloat Metrics Error]', err);
    return [];
  }
}

/**
 * Check active VACUUM operations currently running on the server
 */
export async function getPostgresActiveMaintenance(
  server: RemoteServer,
  database: string,
  opts?: { port?: number; user?: string; sessionPassword?: string }
): Promise<Array<{
  pid: number;
  datname: string;
  relname?: string;
  phase: string;
  heapBlksTotal?: number;
  heapBlksScanned?: number;
  heapBlksVacuumed?: number;
  indexVacuumCount?: number;
  maxDeadTuples?: number;
  numDeadTuples?: number;
}>> {
  const { client } = createPostgresClient(server, {
    database,
    port: opts?.port,
    user: opts?.user,
    password: opts?.sessionPassword,
  });

  try {
    await client.connect();

    // Check if pg_stat_progress_vacuum exists in catalog
    const checkView = await client.query(`
      SELECT 1 FROM pg_views WHERE viewname = 'pg_stat_progress_vacuum';
    `);

    if (!checkView.rows || checkView.rows.length === 0) {
      await client.end();
      return [];
    }

    const sql = `
      SELECT
        p.pid,
        d.datname,
        c.relname,
        p.phase,
        p.heap_blks_total AS "heapBlksTotal",
        p.heap_blks_scanned AS "heapBlksScanned",
        p.heap_blks_vacuumed AS "heapBlksVacuumed",
        p.index_vacuum_count AS "indexVacuumCount",
        p.max_dead_tuples AS "maxDeadTuples",
        p.num_dead_tuples AS "numDeadTuples"
      FROM pg_stat_progress_vacuum p
      LEFT JOIN pg_database d ON d.oid = p.datid
      LEFT JOIN pg_class c ON c.oid = p.relid;
    `;

    const res = await client.query(sql);
    await client.end();

    return (res.rows || []).map((r) => ({
      pid: Number(r.pid),
      datname: r.datname || database,
      relname: r.relname || undefined,
      phase: r.phase || 'running',
      heapBlksTotal: Number(r.heapBlksTotal) || 0,
      heapBlksScanned: Number(r.heapBlksScanned) || 0,
      heapBlksVacuumed: Number(r.heapBlksVacuumed) || 0,
      indexVacuumCount: Number(r.indexVacuumCount) || 0,
      maxDeadTuples: Number(r.maxDeadTuples) || 0,
      numDeadTuples: Number(r.numDeadTuples) || 0,
    }));
  } catch (err) {
    try {
      await client.end();
    } catch {}
    return [];
  }
}

// ============================================================================
// PHASE 20: Lock & Deadlock Inspector (پایش زنده و ردیابی قفل‌ها و بن‌بست‌ها)
// ============================================================================

/**
 * Retrieves authentic live lock telemetry from pg_locks, pg_stat_activity,
 * pg_database, and pg_stat_database.
 * Analyzes blocker hierarchies using pg_blocking_pids() and computes tree structures.
 */
export async function getPostgresLocksOverview(
  server: RemoteServer,
  options?: {
    database?: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<PostgresLocksOverview> {
  const { client, targetDatabase } = createPostgresClient(server, options);
  await client.connect();

  try {
    // 1. Fetch all locks joined with relation, database, and activity
    const locksQuery = `
      SELECT
        l.locktype,
        COALESCE(d.datname, '') AS database_name,
        COALESCE(n.nspname, '') AS schema_name,
        COALESCE(c.relname, '') AS relation_name,
        l.mode,
        l.granted,
        l.pid,
        COALESCE(a.usename, '') AS usename,
        COALESCE(a.client_addr::text, 'local') AS client_addr,
        COALESCE(a.application_name, '') AS application_name,
        COALESCE(a.state, '') AS state,
        COALESCE(a.query, '') AS query,
        a.query_start,
        a.xact_start,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(a.query_start, a.xact_start, NOW())))::numeric, 1)::float AS wait_duration_seconds,
        COALESCE(pg_blocking_pids(l.pid), ARRAY[]::integer[]) AS blocking_pids
      FROM pg_locks l
      LEFT JOIN pg_database d ON d.oid = l.database
      LEFT JOIN pg_class c ON c.oid = l.relation
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.pid != pg_backend_pid()
      ORDER BY l.granted ASC, wait_duration_seconds DESC, l.pid ASC;
    `;

    const locksRes = await client.query(locksQuery);
    const rawLocks = locksRes.rows || [];

    // Also get all active/idle sessions from pg_stat_activity to ensure root blockers
    const activityQuery = `
      SELECT
        a.pid,
        COALESCE(a.usename, '') AS usename,
        COALESCE(a.client_addr::text, 'local') AS client_addr,
        COALESCE(a.application_name, '') AS application_name,
        COALESCE(a.state, '') AS state,
        COALESCE(a.query, '') AS query,
        a.query_start,
        a.xact_start,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(a.query_start, a.xact_start, NOW())))::numeric, 1)::float AS wait_duration_seconds,
        COALESCE(pg_blocking_pids(a.pid), ARRAY[]::integer[]) AS blocking_pids
      FROM pg_stat_activity a
      WHERE a.pid != pg_backend_pid();
    `;
    const activityRes = await client.query(activityQuery);
    const rawActivities = activityRes.rows || [];

    // 2. Deadlock statistics and settings
    let deadlockStats: any[] = [];
    try {
      const dlRes = await client.query(`
        SELECT
          d.datname,
          COALESCE(d.deadlocks, 0)::bigint AS deadlocks,
          COALESCE(d.conflicts, 0)::bigint AS conflicts,
          COALESCE(d.xact_rollback, 0)::bigint AS xact_rollback
        FROM pg_stat_database d
        WHERE d.datistemplate = false
        ORDER BY deadlocks DESC, conflicts DESC;
      `);
      deadlockStats = dlRes.rows || [];
    } catch {}

    let deadlockTimeout = '1s';
    let maxLocksPerTx = 64;
    let logLockWaits = false;
    try {
      const s1 = await client.query(`SHOW deadlock_timeout;`);
      deadlockTimeout = s1.rows[0]?.deadlock_timeout || '1s';
    } catch {}
    try {
      const s2 = await client.query(`SHOW max_locks_per_transaction;`);
      maxLocksPerTx = Number(s2.rows[0]?.max_locks_per_transaction) || 64;
    } catch {}
    try {
      const s3 = await client.query(`SHOW log_lock_waits;`);
      logLockWaits = s3.rows[0]?.log_lock_waits === 'on';
    } catch {}

    await client.end();

    // Map of PID -> array of PIDs that this PID is blocking
    const blockedByMap = new Map<number, number[]>(); // pid -> blockedPids[]
    const sessionMap = new Map<number, any>();

    for (const act of rawActivities) {
      const pid = Number(act.pid);
      sessionMap.set(pid, act);
      const blockers: number[] = Array.isArray(act.blocking_pids)
        ? act.blocking_pids.map(Number)
        : [];

      for (const blk of blockers) {
        if (!blockedByMap.has(blk)) {
          blockedByMap.set(blk, []);
        }
        if (!blockedByMap.get(blk)!.includes(pid)) {
          blockedByMap.get(blk)!.push(pid);
        }
      }
    }

    // Build lock items
    let waitingLocksCount = 0;
    let heavyLocksCount = 0;
    let longestWait = 0;
    const blockedSessionsSet = new Set<number>();
    const rootBlockersSet = new Set<number>();

    const locks: PostgresLockItem[] = rawLocks.map((r: any) => {
      const pid = Number(r.pid);
      const isGranted = Boolean(r.granted);
      const blockingPids: number[] = Array.isArray(r.blocking_pids)
        ? r.blocking_pids.map(Number)
        : [];
      const blockedPids = blockedByMap.get(pid) || [];
      const isBlocking = blockedPids.length > 0;
      const waitSec = Math.max(0, Number(r.wait_duration_seconds) || 0);

      if (!isGranted) {
        waitingLocksCount++;
        blockedSessionsSet.add(pid);
      }
      if (blockingPids.length > 0) {
        blockedSessionsSet.add(pid);
      }
      if (isBlocking && blockingPids.length === 0) {
        rootBlockersSet.add(pid);
      }
      if (
        r.mode === 'ExclusiveLock' ||
        r.mode === 'AccessExclusiveLock' ||
        r.mode === 'ShareRowExclusiveLock'
      ) {
        heavyLocksCount++;
      }
      if (waitSec > longestWait) {
        longestWait = waitSec;
      }

      return {
        locktype: String(r.locktype || ''),
        database: String(r.database_name || targetDatabase),
        relation: r.relation_name || undefined,
        schema: r.schema_name || undefined,
        mode: String(r.mode || ''),
        granted: isGranted,
        pid,
        usename: String(r.usename || ''),
        clientAddr: String(r.client_addr || 'local'),
        applicationName: String(r.application_name || ''),
        state: String(r.state || ''),
        query: String(r.query || ''),
        queryStart: r.query_start ? new Date(r.query_start).toISOString() : undefined,
        xactStart: r.xact_start ? new Date(r.xact_start).toISOString() : undefined,
        waitDurationSeconds: waitSec,
        isBlocking,
        blockedPids,
        blockingPids,
      };
    });

    // Also check if any activity is a root blocker even if not directly matching a specific rawLock
    for (const [blkPid, waiters] of blockedByMap.entries()) {
      const blkAct = sessionMap.get(blkPid);
      const blkBlockers = blkAct?.blocking_pids || [];
      if (waiters.length > 0 && blkBlockers.length === 0) {
        rootBlockersSet.add(blkPid);
      }
    }

    // Build the hierarchical blocking tree:
    const visitedTreePids = new Set<number>();
    function buildNode(pid: number, depth = 0): PostgresBlockingNode | null {
      if (visitedTreePids.has(pid) || depth > 20) return null; // Avoid infinite loops on cycles
      visitedTreePids.add(pid);

      const act = sessionMap.get(pid);
      const matchingLock = locks.find((l) => l.pid === pid);
      const childPids = blockedByMap.get(pid) || [];

      const childNodes: PostgresBlockingNode[] = [];
      for (const cp of childPids) {
        const childNode = buildNode(cp, depth + 1);
        if (childNode) {
          childNodes.push(childNode);
        }
      }

      let totalDescendants = childNodes.length;
      for (const c of childNodes) {
        totalDescendants += c.blockedCount;
      }

      const blockers = act?.blocking_pids || [];

      return {
        pid,
        usename: act?.usename || matchingLock?.usename || 'unknown',
        clientAddr: act?.client_addr || matchingLock?.clientAddr || 'local',
        applicationName: act?.application_name || matchingLock?.applicationName || '',
        state: act?.state || matchingLock?.state || '',
        query: act?.query || matchingLock?.query || '',
        queryStart: act?.query_start ? new Date(act.query_start).toISOString() : matchingLock?.queryStart,
        xactStart: act?.xact_start ? new Date(act.xact_start).toISOString() : matchingLock?.xactStart,
        waitDurationSeconds: Number(act?.wait_duration_seconds) || matchingLock?.waitDurationSeconds || 0,
        isRootBlocker: blockers.length === 0,
        lockMode: matchingLock?.mode,
        lockType: matchingLock?.locktype,
        relation: matchingLock?.relation,
        schema: matchingLock?.schema,
        blockedCount: totalDescendants,
        blockedSessions: childNodes,
      };
    }

    const blockingTree: PostgresBlockingNode[] = [];
    for (const rootPid of Array.from(rootBlockersSet)) {
      const node = buildNode(rootPid);
      if (node) {
        blockingTree.push(node);
      }
    }

    // Sort blockingTree so the nodes with most blocked sessions or longest wait come first
    blockingTree.sort((a, b) => b.blockedCount - a.blockedCount || b.waitDurationSeconds - a.waitDurationSeconds);

    const totalDeadlocksRecorded = deadlockStats.reduce((sum, d) => sum + (Number(d.deadlocks) || 0), 0);

    return {
      totalLocksCount: locks.length,
      waitingLocksCount,
      blockedSessionsCount: blockedSessionsSet.size,
      rootBlockersCount: rootBlockersSet.size,
      heavyLocksCount,
      longestWaitSeconds: longestWait,
      locks,
      blockingTree,
      deadlockSummary: {
        totalDeadlocksRecorded,
        databaseDeadlocks: deadlockStats.map((d) => ({
          datname: String(d.datname),
          deadlocks: Number(d.deadlocks) || 0,
          conflicts: Number(d.conflicts) || 0,
          xactRollback: Number(d.xact_rollback) || 0,
        })),
        deadlockTimeoutSetting: deadlockTimeout,
        maxLocksPerTx,
        logLockWaitsSetting: logLockWaits,
      },
      retrievedAt: new Date().toISOString(),
      database: targetDatabase,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    throw err;
  }
}

/**
 * Gracefully cancels the running query (pg_cancel_backend) or forcefully terminates
 * the backend connection (pg_terminate_backend) for a specified PID.
 */
export async function terminatePostgresSession(
  server: RemoteServer,
  options: {
    pid: number;
    action: 'cancel' | 'terminate';
    database?: string;
    port?: number;
    user?: string;
    password?: string;
  }
): Promise<PostgresSessionTerminateResult> {
  const { client } = createPostgresClient(server, options);
  await client.connect();

  try {
    const isCancel = options.action === 'cancel';
    const query = isCancel
      ? 'SELECT pg_cancel_backend($1) AS signal_sent;'
      : 'SELECT pg_terminate_backend($1) AS signal_sent;';

    const res = await client.query(query, [options.pid]);
    const signalSent = Boolean(res.rows?.[0]?.signal_sent);
    await client.end();

    if (!signalSent) {
      return {
        success: false,
        pid: options.pid,
        action: options.action,
        message: `Failed to ${isCancel ? 'cancel query on' : 'terminate'} session PID ${options.pid}. The process may have already exited or requires superuser privileges.`,
        messageFa: `عملیات ${isCancel ? 'لغو کوئری' : 'خاتمه نشست'} برای پردازش PID ${options.pid} انجام نشد. ممکن است پردازش پیش‌تر بسته شده باشد یا نیاز به دسترسی Superuser داشته باشد.`,
      };
    }

    return {
      success: true,
      pid: options.pid,
      action: options.action,
      message: `Successfully ${isCancel ? 'canceled running query on' : 'terminated connection for'} session PID ${options.pid}.`,
      messageFa: `پردازش PID ${options.pid} با موفقیت ${isCancel ? 'لغو (Cancel)' : 'خاتمه داده (Terminate)'} شد.`,
    };
  } catch (err: any) {
    try {
      await client.end();
    } catch {}
    return {
      success: false,
      pid: options.pid,
      action: options.action,
      message: err.message || `Error executing ${options.action} on PID ${options.pid}`,
      messageFa: `خطا در اجرای عملیات ${options.action === 'cancel' ? 'لغو' : 'خاتمه'} روی PID ${options.pid}`,
      error: err.message,
    };
  }
}






