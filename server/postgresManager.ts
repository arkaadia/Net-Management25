import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { RemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';
import { analyzePostgresSqlSafety, PostgresSqlQuerySafetyReport } from './postgresSqlSafety';
import { runAdaptiveSshCommand } from './linuxServerMonitor';

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

export interface PostgresExtensionItem {
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
  extensions: PostgresExtensionItem[];
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

    const extensions: PostgresExtensionItem[] = (extensionsRes.rows || []).map((row: any) => ({
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

export type PostgresBackupMode = 'full' | 'schema_only' | 'data_only';
export type PostgresBackupFormat = 'plain' | 'custom' | 'tar';

export interface PostgresBackupItem {
  id: string;
  filename: string;
  database: string;
  sizeBytes: number;
  sizePretty: string;
  mode: PostgresBackupMode;
  format: PostgresBackupFormat;
  createdAt: string;
  tablesCount?: number;
  schemasCount?: number;
  schemas?: string[];
  tables?: string[];
  compressionLevel?: number;
  downloadUrl?: string;
  engineUsed: 'native_pg_dump' | 'logical_sql_dumper';
}

export interface PostgresCreateBackupRequest {
  database: string;
  mode: PostgresBackupMode;
  format: PostgresBackupFormat;
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
        items.push(meta[filename]);
      } else {
        const isGz = filename.endsWith('.gz');
        const isDump = filename.endsWith('.dump');
        const isTar = filename.endsWith('.tar');
        const baseName = filename.replace(/\.(sql(\.gz)?|dump|tar)$/, '');
        const parts = baseName.split('_');
        const dbName = parts[0] || server.postgres_database || 'postgres';

        const item: PostgresBackupItem = {
          id: filename,
          filename,
          database: dbName,
          sizeBytes: stats.size,
          sizePretty: formatBytesPretty(stats.size),
          mode: 'full',
          format: isDump ? 'custom' : isTar ? 'tar' : 'plain',
          createdAt: stats.mtime.toISOString(),
          downloadUrl: `/api/remote-servers/${server.id}/postgres/backups/${encodeURIComponent(filename)}/download`,
          engineUsed: 'logical_sql_dumper',
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
  const client = createPostgresClient(server, {
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

export async function createPostgresBackup(
  server: RemoteServer,
  req: PostgresCreateBackupRequest
): Promise<PostgresCreateBackupResult> {
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

  const client = createPostgresClient(server, {
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
  const client = createPostgresClient(server, {
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

  const client = createPostgresClient(server, {
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

  const client = createPostgresClient(server, {
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

  const client = createPostgresClient(server, {
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




