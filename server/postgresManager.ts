import { Client } from 'pg';
import { RemoteServer } from './db';
import { decryptServerSecret } from './vaultCrypto';

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
          r.rolvaliduntil::text as valid_until
        FROM pg_catalog.pg_roles r
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
          r.rolvaliduntil::text as valid_until
        FROM pg_catalog.pg_roles r
        ORDER BY r.rolsuper DESC, r.rolcanlogin DESC, r.rolname ASC;
      `);
    }

    await client.end();

    const roles: PostgresRoleItem[] = (res.rows || []).map((row: any) => ({
      rolname: String(row.rolname),
      isSuperuser: Boolean(row.is_superuser),
      canLogin: Boolean(row.can_login),
      createDb: Boolean(row.create_db),
      createRole: Boolean(row.create_role),
      replication: Boolean(row.replication),
      bypassRls: Boolean(row.bypass_rls),
      connectionLimit: Number(row.connection_limit),
      validUntil: row.valid_until ? String(row.valid_until) : null,
    }));

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
      SELECT * 
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


