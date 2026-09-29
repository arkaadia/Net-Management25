import { Router, Request, Response } from 'express';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  checkRateLimit,
  recordFailedLogin,
  clearRateLimit,
} from './auth';
import {
  getDbStatus,
  findUserByUsername,
  findUserById,
  getAllUsers,
  saveUser,
  saveUsersBatch,
  deleteUser,
  updateLastLogin,
  getCustomMaps,
  saveCustomMaps,
  deleteCustomMap,
  getNodePositions,
  saveNodePositions,
  deleteNodePositions,
  getUserGroups,
  saveUserGroups,
  getAccessPolicies,
  saveAccessPolicies,
  getDeviceGroups,
  saveDeviceGroups,
  getActiveDirectoryConfig,
  saveActiveDirectoryConfig,
  getHierarchy,
  saveHierarchy,
  getAuditLogs,
  addAuditLog,
  getDeviceStickyNotes,
  saveDeviceStickyNote,
  deleteDeviceStickyNote,
  getAllRemoteServers,
  getRemoteServerById,
  createRemoteServer,
  updateRemoteServer,
  deleteRemoteServer,
  RemoteServer,
  sanitizeRemoteServerForClient,
  updateRemoteServerTags,
  getRemoteServerTagsSummary,
  getAllServerCategories,
  getServerCategoryById,
  createServerCategory,
  updateServerCategory,
  deleteServerCategory,
  getUserVaultItems,
  getUserVaultItemById,
  saveUserVaultItem,
  deleteUserVaultItem,
  UserVaultItem,
} from './db';
import { encryptVaultSecret, decryptVaultSecret } from './vaultCrypto';
import {
  testMysqlConnection,
  getMysqlOverview,
  getMysqlDatabases,
  getMysqlDatabaseDetails,
  getMysqlDatabaseObjects,
  getMysqlUsers,
  executeMysqlQuery,
  analyzeMysqlSqlSafety,
  getMysqlProcesslist,
  killMysqlProcess,
  getMysqlVariables,
  getMysqlTableStructure,
  getMysqlTableData,
  insertMysqlTableRow,
  updateMysqlTableRow,
  deleteMysqlTableRow,
} from './mysqlManager';
import {
  testPostgresConnection,
  getPostgresOverview,
  getPostgresDatabases,
  getPostgresRoles,
  getPostgresDatabaseTree,
  getPostgresTableStructure,
  getPostgresTableData,
  insertPostgresTableRow,
  updatePostgresTableRow,
  deletePostgresTableRow,
  executePostgresQuery,
  analyzePostgresSqlSafety,
  createPostgresRole,
  updatePostgresRole,
  changePostgresRolePassword,
  managePostgresRoleMembership,
  dropPostgresRole,
  getPostgresObjectPermissions,
  applyPostgresPermissions,
  createPostgresDatabase,
  updatePostgresDatabase,
  dropPostgresDatabase,
  getPostgresSchemas,
  createPostgresSchema,
  updatePostgresSchema,
  dropPostgresSchema,
  listPostgresBackups,
  createPostgresBackup,
  restorePostgresBackup,
  deletePostgresBackup,
  getPostgresBackupFilePath,
  validatePostgresRestore,
  previewPostgresBackup,
  listPostgresExtensions,
  installPostgresExtension,
  updatePostgresExtension,
  dropPostgresExtension,
  runPostgresHealthAudit,
  getPostgresHbaConfig,
  savePostgresHbaConfig,
  restorePostgresHbaBackup,
  reloadPostgresHba,
  runPostgresMaintenance,
  getPostgresBloatMetrics,
  getPostgresActiveMaintenance,
  getPostgresLocksOverview,
  terminatePostgresSession,
  getPostgresPerformanceOverview,
  resetPostgresStatStatements,
  getPostgresReplicationOverview,
  managePostgresReplicationSlot,
  controlPostgresWalReplay,
  getPostgresLogsOverview,
  getPostgresLoggingSettings,
  getPostgresTuningReport,
  applyPostgresTuningConfiguration,
  getPostgresHardwareProfile,
  detectPanelIp,
  remediatePostgresConnection,
} from './postgresManager';
import * as net from 'net';
import { testAndDiscoverDeviceViaSsh, detectPlatformAndRole } from './sshDiscovery';
import {
  startDiscoveryJob,
  getDiscoveryJobStatus,
  cancelDiscoveryJob,
  applyDiscoveryResultsToMap,
} from './cdpLldpDiscovery';
import {
  getBulkServerTemplates,
  generateBulkServerPreview,
  startBulkServerJob,
  getBulkServerJobStatus,
  cancelBulkServerJob,
  getBulkServerReportsList,
  getBulkServerReportDetails,
  deleteBulkServerReportEntry,
  clearAllBulkServerReportsList,
  saveBulkServerReportEntry,
  getBulkServerReportsStats,
} from './bulkServerConfig';
import {
  executeLinuxTelemetrySSH,
  fetchLinuxServicesSSH,
  executeLinuxServiceControl,
  executeLinuxProcessControl,
  fetchLinuxUsersAndSessionsSSH,
  sendLinuxUserMessageSSH,
  fetchLinuxDetailedSysInfoSSH,
  configureLinuxNetworkInterfaceSSH,
  configureLinuxPersistentProxySSH,
  testLinuxProxySSH,
  changeLinuxSshPortSSH,
  fetchLinuxBlockDevicesSSH,
  executeLinuxMountFilesystem,
  executeLinuxUnmountFilesystem,
  fetchLinuxServiceWatchdogsSSH,
  saveLinuxServiceWatchdogSSH,
  deleteLinuxServiceWatchdogSSH,
  testLinuxServiceWatchdogCheckSSH,
  resetLinuxServiceWatchdogAntiLoopSSH,
  fetchLinuxWatchdogLogsSSH,
  fetchLinuxDirectoryPoliciesSSH,
  saveLinuxDirectoryPolicySSH,
  deleteLinuxDirectoryPolicySSH,
  runLinuxDirectoryPolicyNowSSH,
  fetchLinuxDirectoryPolicyLogsSSH,
  fetchLinuxStorageOverviewSSH,
  fetchLinuxLvmOverviewSSH,
  rescanLinuxStorageSSH,
  formatAndMountLinuxDiskSSH,
  extendLinuxLvSSH,
  createLinuxLvmVolumeSSH,
  shrinkLinuxLvSSH,
  addDiskToLinuxVgSSH,
  createLinuxPvSSH,
  createLinuxVolumeGroupSSH,
  executeServerRestartSSH,
  runAdaptiveSshCommand,
} from './linuxServerMonitor';
import {
  detectLinuxNetworkStack,
  applyLinuxNetworkConfiguration,
  restartLinuxNetworkService,
  setLinuxInterfaceState,
} from './linuxNetworkManager';
import {
  detectLinuxFirewall,
  addFirewallRule,
  deleteFirewallRule,
} from './linuxFirewallManager';
import {
  fetchLinuxPackageOverview,
  startPackageUpdateJob,
  getPackageUpdateJob,
  cancelPackageUpdateJob,
} from './linuxPackageUpdates';
import {
  fetchLinuxSshConfigSSH,
  updateLinuxSshConfigSSH,
  fetchLinuxHostnameSSH,
  updateLinuxHostnameSSH,
  fetchLinuxHostsFileSSH,
  updateLinuxHostsFileSSH,
  fetchLinuxTcpWrappersSSH,
  updateLinuxTcpWrappersSSH,
  fetchLinuxDnsConfigSSH,
  updateLinuxDnsConfigSSH,
  fetchLinuxFail2banSSH,
  controlLinuxFail2banSSH,
  ipActionLinuxFail2banSSH,
  installLinuxFail2banSSH,
  fetchLinuxTimeInfoSSH,
  updateLinuxTimezoneSSH,
  updateLinuxNtpSSH,
  updateLinuxTimeSSH,
} from './linuxSysConfig';
import {
  fetchLinuxUsersAndGroupsSSH,
  createLinuxUserSSH,
  updateLinuxUserPasswordSSH,
  updateLinuxUserSSH,
  fetchLinuxUserSecurityDetailsSSH,
  toggleLinuxUserLockSSH,
  updateLinuxUserGroupsSSH,
  createLinuxGroupSSH,
  deleteLinuxUserSSH,
  logoutLinuxUserSessionSSH,
} from './linuxUserManager';
import {
  fetchLinuxSystemLogsSSH,
  truncateLinuxLogSSH,
} from './linuxLogManager';
import {
  listLinuxDirectory,
  LINUX_QUICK_DIRECTORIES,
  readLinuxFile,
  writeLinuxFile,
  createLinuxDirectory,
  createLinuxEmptyFile,
  renameLinuxItem,
  deleteLinuxItem,
  deleteLinuxItems,
  downloadLinuxSingleFile,
  downloadLinuxArchive,
  uploadLinuxFile,
  getLinuxItemProperties,
  updateLinuxItemAttributes,
  getLinuxSystemUsersAndGroups,
  pasteLinuxItems,
  compressLinuxItems,
  extractLinuxArchive,
} from './linuxFileExplorer';
import {
  fetchLinuxCronOverviewSSH,
  saveLinuxCronJobSSH,
  toggleLinuxCronJobSSH,
  deleteLinuxCronJobSSH,
  runLinuxCronJobNowSSH,
} from './linuxCronManager';
import { discoverApacheInstallation } from './apacheDiscovery';
import { discoverApacheConfigTopology } from './apacheConfigParser';
import {
  discoverApacheVirtualHosts,
  toggleApacheVirtualHost,
  createApacheVirtualHost,
  deleteApacheVirtualHost,
} from './apacheVirtualHosts';
import {
  discoverApacheProxyArchitecture,
  enableApacheProxyModules,
  createApacheProxyRoute,
  deleteApacheProxyRoute,
} from './apacheProxyManager';
import {
  discoverApacheModulesArchitecture,
  toggleApacheModule,
  switchApacheMpm,
} from './apacheModuleManager';
import {
  discoverApacheCertificates,
  generateApacheSelfSignedCertificate,
  attachApacheSslCertificate,
  enableApacheModernSslProfile,
} from './apacheSslManager';
import { discoverApacheLogFiles, streamApacheLogFile } from './apacheLogManager';
import {
  readApacheConfigFile,
  testApacheConfigFileCandidate,
  saveApacheConfigFileSafe,
  listApacheFileBackups,
  restoreApacheFileBackup,
  manageApacheService,
} from './apacheSafeEditor';
import {
  performApacheSecurityAudit,
  applyApacheSecurityHardening,
} from './apacheSecurityAuditor';
import {
  getApachePerformanceReport,
  enableApacheModStatus,
  applyApachePerformanceTuning,
} from './apachePerformanceManager';
import {
  discoverApacheRewriteAndHtaccess,
  enableApacheRewriteModule,
  saveHtaccessFile,
  setupApacheBasicAuth,
  deployApacheCustomErrorDocs,
} from './apacheRewriteManager';
import { discoverNginxInstallation } from './nginxDiscovery';
import { discoverNginxConfigTopology } from './nginxConfigParser';
import { discoverNginxServerBlocks } from './nginxSitesManager';
import { discoverNginxProxyArchitecture } from './nginxProxyManager';
import { discoverNginxCertificates } from './nginxCertDiscovery';
import { discoverNginxLogFiles, streamNginxLogFile } from './nginxLogManager';
import {
  testNginxSiteConfig,
  deployNginxSite,
  toggleNginxSiteStatus,
  deleteNginxSite,
} from './nginxSiteWriter';
import {
  readNginxConfigFile,
  testNginxConfigFileCandidate,
  saveNginxConfigFileSafe,
  listNginxFileBackups,
  restoreNginxFileBackup,
} from './nginxSafeEditor';
import {
  performNginxSecurityAudit,
  applyNginxSecurityHardening,
} from './nginxSecurityAuditor';

export const apiRouter = Router();

// Helper to get client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// -------------------------------------------------------------
// Database Status Endpoint
// -------------------------------------------------------------
apiRouter.get('/db/status', async (req: Request, res: Response) => {
  try {
    const status = await getDbStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const username = (req.body?.username || '').trim();
    const password = (req.body?.password || '').trim();
    const authType = (req.body?.authType || 'local').toLowerCase(); // 'local' | 'ad'
    const domain = (req.body?.domain || 'corp.internal').trim();
    const rememberMe = Boolean(req.body?.rememberMe);

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
        message: 'نام کاربری و کلمه عبور الزامی است.',
      });
    }

    const rateLimitKey = `${ip}:${username.toLowerCase()}`;
    const rateLimitStatus = checkRateLimit(rateLimitKey);

    if (rateLimitStatus.locked) {
      await addAuditLog({
        userName: username,
        action: 'Login Blocked (Rate Limit)',
        category: 'security',
        target: 'Auth Gateway',
        status: 'error',
        details: `Too many failed attempts from IP ${ip}. Locked for ${rateLimitStatus.remainingSec}s.`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(429).json({
        success: false,
        locked: true,
        remainingSec: rateLimitStatus.remainingSec,
        error: `Too many failed attempts. Account locked for ${rateLimitStatus.remainingSec} seconds.`,
        message: `تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً ${rateLimitStatus.remainingSec} ثانیه دیگر مجدداً تلاش فرمایید.`,
      });
    }

    // --- 1. LOCAL AUTHENTICATION ---
    if (authType === 'local') {
      const user = await findUserByUsername(username);

      if (!user) {
        const penalty = recordFailedLogin(rateLimitKey);
        await addAuditLog({
          userName: username,
          action: 'Failed Login (User Not Found)',
          category: 'security',
          target: 'Auth Gateway',
          status: 'warning',
          details: `Failed local login attempt for non-existing user "${username}" from IP ${ip}`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'نام کاربری یا رمز عبور اشتباه است.',
          attemptsLeft: penalty.attemptsLeft,
          locked: penalty.locked,
          remainingSec: penalty.remainingSec,
        });
      }

      if (user.status === 'disabled') {
        return res.status(403).json({
          success: false,
          error: 'Account disabled',
          message: 'این حساب کاربری توسط مدیر غیرفعال شده است.',
        });
      }

      const isValid = verifyPassword(password, user.password_hash, user.password_salt);
      if (!isValid) {
        const penalty = recordFailedLogin(rateLimitKey);
        await addAuditLog({
          userName: username,
          action: 'Failed Login (Invalid Password)',
          category: 'security',
          target: 'Auth Gateway',
          status: 'warning',
          details: `Invalid password supplied for user "${username}" from IP ${ip}`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'نام کاربری یا رمز عبور اشتباه است.',
          attemptsLeft: penalty.attemptsLeft,
          locked: penalty.locked,
          remainingSec: penalty.remainingSec,
        });
      }

      // Success: clear failed attempts
      clearRateLimit(rateLimitKey);
      await updateLastLogin(user.id);

      const token = generateToken(
        {
          userId: user.id,
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          userType: 'local',
        },
        rememberMe
      );

      await addAuditLog({
        userName: user.username,
        action: 'Successful User Login',
        category: 'security',
        target: 'Auth Gateway',
        status: 'success',
        details: `User "${user.username}" authenticated successfully via Local Database from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          userType: 'local',
          groupIds: user.group_ids,
          isBuiltin: user.is_builtin,
        },
      });
    }

    // --- 2. ACTIVE DIRECTORY / LDAP AUTHENTICATION ---
    if (authType === 'ad') {
      // Check known simulated AD users or standard test user
      const isCorpDomain = domain.toLowerCase().includes('corp') || domain.toLowerCase().includes('internal');
      const isValidAdUser = (username.toLowerCase().includes('admin') || username.toLowerCase().includes('rezaei') || username.toLowerCase().includes('netops') || password === 'admin123' || password === 'Password@123');

      if (!isValidAdUser && password !== 'admin123' && password !== 'nettop2026') {
        const penalty = recordFailedLogin(rateLimitKey);
        await addAuditLog({
          userName: `${username}@${domain}`,
          action: 'Failed Active Directory Login',
          category: 'security',
          target: `AD DC (${domain})`,
          status: 'warning',
          details: `Active Directory Kerberos/LDAP bind failed for user ${username}@${domain} from IP ${ip}`,
          ipAddress: ip,
          userAgent: req.headers['user-agent'],
        });

        return res.status(401).json({
          success: false,
          error: 'Active Directory authentication failed',
          message: 'احراز هویت اکتیو دایرکتوری ناموفق بود (حساب یا پسورد دامین نامعتبر است).',
          attemptsLeft: penalty.attemptsLeft,
          locked: penalty.locked,
          remainingSec: penalty.remainingSec,
        });
      }

      clearRateLimit(rateLimitKey);

      const adUser = {
        id: `ad-${username.replace(/[^a-zA-Z0-9]/g, '_')}`,
        username: username.includes('@') ? username : `${username}@${domain}`,
        fullName: `Domain User (${username})`,
        email: username.includes('@') ? username : `${username}@${domain}`,
        role: username.toLowerCase().includes('admin') ? 'Super Administrator' : 'Network Operator (AD)',
        userType: 'ad' as const,
      };

      const token = generateToken(
        {
          userId: adUser.id,
          username: adUser.username,
          fullName: adUser.fullName,
          email: adUser.email,
          role: adUser.role,
          userType: 'ad',
        },
        rememberMe
      );

      await addAuditLog({
        userName: adUser.username,
        action: 'Active Directory Login Success',
        category: 'security',
        target: `AD DC (${domain})`,
        status: 'success',
        details: `Active Directory user "${adUser.username}" authenticated successfully via domain ${domain} from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.json({
        success: true,
        token,
        user: adUser,
      });
    }

    return res.status(400).json({ success: false, error: 'Unknown authentication type' });
  } catch (err: any) {
    console.error('[API /auth/login error]', err);
    return res.status(500).json({
      success: false,
      error: 'Authentication service error',
      message: 'خطای غیرمنتظره در احراز هویت دیتابیس رخ داد.',
    });
  }
});

// Verify token / Current User Session
apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({ authenticated: false, error: 'No token provided' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ authenticated: false, error: 'Invalid or expired token' });
  }

  res.json({
    authenticated: true,
    user: {
      id: payload.userId,
      username: payload.username,
      fullName: payload.fullName,
      email: payload.email,
      role: payload.role,
      userType: payload.userType,
      policyId: payload.policyId,
    },
  });
});

// Logout endpoint
apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const payload = verifyToken(token);

  if (payload) {
    await addAuditLog({
      userName: payload.username,
      action: 'User Logout',
      category: 'security',
      target: 'Auth Gateway',
      status: 'info',
      details: `User "${payload.username}" logged out from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

// -------------------------------------------------------------
// Users Management
// -------------------------------------------------------------
apiRouter.get('/settings/users', async (req: Request, res: Response) => {
  try {
    const users = await getAllUsers();
    // Return both standard object format and array compatibility
    res.json({ success: true, users, count: users.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, users: [] });
  }
});

apiRouter.post('/settings/users', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);
    const body = req.body;

    // Support batch saving if an array was sent
    if (Array.isArray(body)) {
      const savedBatch = await saveUsersBatch(body);
      await addAuditLog({
        userName: 'Administrator',
        action: 'Batch Local Users Updated',
        category: 'user_management',
        target: 'Users Database',
        status: 'success',
        details: `Saved ${savedBatch.length} local user records from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });
      return res.json({ success: true, users: savedBatch, count: savedBatch.length });
    }

    // Single user save or update
    if (!body || typeof body !== 'object' || !body.username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: username is required',
        message: 'نام کاربری الزامی است.',
      });
    }

    const saved = await saveUser(body);
    await addAuditLog({
      userName: saved.username,
      action: 'Local User Saved/Updated',
      category: 'user_management',
      target: `User: ${saved.username}`,
      status: 'success',
      details: `User account "${saved.username}" (${saved.fullName}, role: ${saved.role}) saved successfully in database from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ success: true, user: saved });
  } catch (err: any) {
    console.error('[API /settings/users POST error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete('/settings/users/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const ip = getClientIp(req);

    if (!userId || userId === 'user-admin' || userId.toLowerCase() === 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Root administrator cannot be deleted',
        message: 'امکان حذف حساب کاربری مدیر اصلی وجود ندارد.',
      });
    }

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'User not found or cannot be deleted',
        message: 'کاربر مورد نظر یافت نشد یا دسترسی حذف آن محدود است.',
      });
    }

    await addAuditLog({
      userName: 'Administrator',
      action: 'Local User Deleted',
      category: 'user_management',
      target: `User: ${userId}`,
      status: 'warning',
      details: `Local user account "${userId}" deleted from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    console.error('[API /settings/users DELETE error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Maps & Hierarchy & Node Positions
// -------------------------------------------------------------
function extractUserFromRequest(req: Request): { userId?: string; username?: string; role?: string } | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      };
    }
  }

  // Fallback to query or headers if passed
  const queryUserId = req.query.userId as string;
  const queryUsername = req.query.username as string;
  const queryRole = req.query.role as string;
  if (queryUserId || queryUsername) {
    return {
      userId: queryUserId,
      username: queryUsername,
      role: queryRole,
    };
  }

  return undefined;
}

apiRouter.get('/settings/maps', async (req: Request, res: Response) => {
  try {
    const userFilter = extractUserFromRequest(req);
    const maps = await getCustomMaps(userFilter);
    res.json({ maps, total: maps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/maps', async (req: Request, res: Response) => {
  try {
    const currentUser = extractUserFromRequest(req) || req.body?.currentUser;
    const maps = Array.isArray(req.body?.maps) ? req.body.maps : (Array.isArray(req.body) ? req.body : []);
    await saveCustomMaps(maps, currentUser);
    res.json({ success: true, count: maps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/settings/maps/:id', async (req: Request, res: Response) => {
  try {
    const mapId = req.params.id;
    const deleted = await deleteCustomMap(mapId);
    res.json({ success: true, mapId, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Canvas Node Positions Persistence (PostgreSQL & fallback JSON)
apiRouter.get('/settings/node-positions', async (req: Request, res: Response) => {
  try {
    const mapId = (req.query.mapId as string) || 'default';
    const positions = await getNodePositions(mapId);
    res.json({ mapId, positions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/node-positions', async (req: Request, res: Response) => {
  try {
    const mapId = req.body?.mapId || 'default';
    const positions = req.body?.positions || {};
    await saveNodePositions(mapId, positions);
    res.json({ success: true, mapId, count: Object.keys(positions).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/settings/node-positions', async (req: Request, res: Response) => {
  try {
    const mapId = (req.query.mapId as string) || req.body?.mapId || 'default';
    await deleteNodePositions(mapId);
    res.json({ success: true, mapId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Physical & Topological Hierarchy
apiRouter.get('/settings/hierarchy', async (req: Request, res: Response) => {
  try {
    const hierarchy = await getHierarchy();
    res.json({ hierarchy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/hierarchy', async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.hierarchy) ? req.body.hierarchy : req.body;
    await saveHierarchy(items);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Device Sticky Notes Endpoints (Schematic Map & Inventory Integration)
apiRouter.get('/settings/device-notes', async (_req: Request, res: Response) => {
  try {
    const notes = await getDeviceStickyNotes();
    res.json({ notes, total: notes.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/device-notes', async (req: Request, res: Response) => {
  try {
    const noteData = req.body?.note || req.body;
    const previousDeviceId = req.body?.previousDeviceId;
    const saved = await saveDeviceStickyNote(noteData, previousDeviceId);
    res.json({ success: true, note: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/settings/device-notes/:id', async (req: Request, res: Response) => {
  try {
    const noteId = req.params.id;
    const deviceId = (req.query.deviceId as string) || (req.body?.deviceId as string);
    const keepInMap = req.query.keepInMap === 'true' || req.body?.keepInMap === true;
    await deleteDeviceStickyNote(noteId, deviceId, keepInMap);
    res.json({ success: true, id: noteId, deviceId, keepInMap });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User Groups Endpoints
apiRouter.get(['/settings/user-groups', '/user-groups'], async (req: Request, res: Response) => {
  try {
    const groups = await getUserGroups();
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/user-groups', '/user-groups'], async (req: Request, res: Response) => {
  try {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : req.body;
    await saveUserGroups(groups);
    res.json({ success: true, count: groups.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Access Policies (RBAC) Endpoints
apiRouter.get(['/settings/access-policies', '/access-policies'], async (req: Request, res: Response) => {
  try {
    const policies = await getAccessPolicies();
    res.json({ policies });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/access-policies', '/access-policies'], async (req: Request, res: Response) => {
  try {
    const policies = Array.isArray(req.body?.policies) ? req.body.policies : req.body;
    await saveAccessPolicies(policies);
    res.json({ success: true, count: policies.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Device Groups Endpoints
apiRouter.get(['/settings/device-groups', '/device-groups'], async (req: Request, res: Response) => {
  try {
    const groups = await getDeviceGroups();
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/device-groups', '/device-groups'], async (req: Request, res: Response) => {
  try {
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : req.body;
    await saveDeviceGroups(groups);
    res.json({ success: true, count: groups.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Active Directory Endpoints
apiRouter.get(['/settings/active-directory', '/active-directory'], async (req: Request, res: Response) => {
  try {
    const config = await getActiveDirectoryConfig();
    res.json({ config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post(['/settings/active-directory', '/active-directory'], async (req: Request, res: Response) => {
  try {
    await saveActiveDirectoryConfig(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Audit Logs
// -------------------------------------------------------------
apiRouter.get('/settings/audit-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const logs = await getAuditLogs(limit);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings/audit-logs', async (req: Request, res: Response) => {
  try {
    await addAuditLog({
      ...req.body,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Live Device SSH Connection & Switch Telemetry Discovery
// -------------------------------------------------------------
apiRouter.post(['/devices/test-connection'], async (req: Request, res: Response) => {
  const langHeader = (req.headers['accept-language'] as string) || '';
  const lang = (req.body?.lang || (langHeader.toLowerCase().includes('en') ? 'en' : 'fa')).toLowerCase();
  const isEn = lang.startsWith('en') || req.body?.is_en === true;
  const platform = String(req.body?.platform || '').toLowerCase();
  const isMikrotik = platform.includes('mikrotik') || platform.includes('routeros');

  try {
    // 1. If user selected MikroTik RouterOS under Hardware Platform & OS, prioritize the dedicated Node.js ssh2 engine
    if (isMikrotik) {
      try {
        const nodeDiscoveryResult = await testAndDiscoverDeviceViaSsh({
          ...req.body,
          lang: isEn ? 'en' : 'fa',
          is_en: isEn,
        });

        if (nodeDiscoveryResult && nodeDiscoveryResult.success) {
          return res.json(nodeDiscoveryResult);
        }
        // If ssh2 had an error, we will also test Python backend before giving up
      } catch (nodeErr: any) {
        // Continue to check Python fallback if needed
      }
    }

    const pythonPort = process.env.BACKEND_PORT || process.env.PYTHON_PORT || '5001';
    // Forward to Python backend SSH discovery engine
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const pythonResp = await fetch(`http://127.0.0.1:${pythonPort}/api/devices/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': isEn ? 'en' : 'fa',
        },
        body: JSON.stringify({ ...req.body, lang: isEn ? 'en' : 'fa', is_en: isEn }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (pythonResp && pythonResp.ok) {
        const pythonData = await pythonResp.json();
        if (pythonData && pythonData.success) {
          if (pythonData.hardware) {
            pythonData.hostname = pythonData.hostname || pythonData.hardware.hostname;
            pythonData.model = pythonData.model || pythonData.hardware.model;
            pythonData.total_ports = pythonData.total_ports || pythonData.hardware.total_ports;
            pythonData.serial_number = pythonData.serial_number || pythonData.hardware.serial_number;
            pythonData.mac = pythonData.mac || pythonData.hardware.mac_address;
            pythonData.firmware = pythonData.firmware || pythonData.hardware.os_version;
            pythonData.uptime = pythonData.uptime || pythonData.hardware.uptime;
            pythonData.ip = pythonData.ip || pythonData.hardware.ip;
            pythonData.platform_detected = pythonData.platform_detected || pythonData.hardware.platform_detected;
            pythonData.role_detected = pythonData.role_detected || pythonData.hardware.role_detected;
            pythonData.device_type = pythonData.device_type || pythonData.hardware.device_type;
          }
          pythonData.ip = pythonData.ip || req.body?.ssh_host || req.body?.host || req.body?.ip;

          if (!pythonData.platform_detected || !pythonData.role_detected) {
            const autoDet = detectPlatformAndRole(
              pythonData.raw_output || pythonData.raw_status_output || '',
              pythonData.model || '',
              pythonData.firmware || '',
              pythonData.banner || '',
              pythonData.total_ports || 24,
              req.body?.platform
            );
            pythonData.platform_detected = pythonData.platform_detected || autoDet.platform;
            pythonData.role_detected = pythonData.role_detected || autoDet.role;
            pythonData.device_type = pythonData.device_type || autoDet.device_type;
          }

          if (pythonData.ports_telemetry && (!pythonData.ports || pythonData.ports.length === 0)) {
            pythonData.ports = pythonData.ports_telemetry.ports;
            pythonData.total_ports = pythonData.total_ports || pythonData.ports_telemetry.total_ports;
          }
          if (Array.isArray(pythonData.ports)) {
            const seen = new Set<string>();
            const deduped: any[] = [];
            for (let idx = 0; idx < pythonData.ports.length; idx++) {
              const p = pythonData.ports[idx];
              if (!p || typeof p !== 'object') continue;
              const portId = p.port_id || p.port || p.name || `port-${idx + 1}`;
              const canon = String(portId).toLowerCase().replace(/gigabitethernet/g, 'gi').replace(/fastethernet/g, 'fa').replace(/tengigabitethernet/g, 'te');
              if (seen.has(canon)) continue;
              seen.add(canon);
              deduped.push({
                ...p,
                port_id: portId,
                port: p.port || portId,
                name: portId,
                description: p.description || '',
              });
            }
            pythonData.ports = deduped;
            pythonData.total_ports = deduped.length;
          }
          if (isEn && pythonData.message_en) {
            pythonData.message = pythonData.message_en;
          } else if (!isEn && pythonData.message_fa) {
            pythonData.message = pythonData.message_fa;
          }
          return res.json(pythonData);
        }
      }
    } catch {
      // If Python probe fails or times out, fallback to Node SSH discovery
    }

    const discoveryResult = await testAndDiscoverDeviceViaSsh({
      ...req.body,
      lang: isEn ? 'en' : 'fa',
      is_en: isEn,
    });
    res.json(discoveryResult);
  } catch (err: any) {
    const msgEn = `Server error establishing SSH connection: ${err.message}`;
    const msgFa = `خطای سرور در برقراری اتصال SSH: ${err.message}`;
    res.status(500).json({
      success: false,
      connected: false,
      error: err.message,
      message_en: msgEn,
      message_fa: msgFa,
      message: isEn ? msgEn : msgFa,
    });
  }
});

// -------------------------------------------------------------
// CDP & LLDP Topology Discovery Endpoints
// -------------------------------------------------------------
apiRouter.post('/topology/discovery/start', async (req: Request, res: Response) => {
  try {
    const jobId = await startDiscoveryJob(req.body);
    res.json({ success: true, jobId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get('/topology/discovery/status/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const status = getDiscoveryJobStatus(jobId);
  if (!status) {
    return res.status(404).json({ success: false, error: 'Discovery job not found' });
  }
  res.json({ success: true, job: status });
});

apiRouter.post('/topology/discovery/cancel/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const cancelled = cancelDiscoveryJob(jobId);
  res.json({ success: cancelled });
});

apiRouter.post('/topology/discovery/apply', async (req: Request, res: Response) => {
  try {
    const result = await applyDiscoveryResultsToMap(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Remote Servers Fleet & Automation Tags Endpoints
// -------------------------------------------------------------

// GET /api/remote-servers - List all servers with optional query filters
apiRouter.get('/remote-servers', async (req: Request, res: Response) => {
  try {
    let servers = await getAllRemoteServers();
    const { os, env, category, tag, search } = req.query;

    if (typeof os === 'string' && os) {
      servers = servers.filter((s) => s.os_type.toLowerCase() === os.toLowerCase());
    }
    if (typeof env === 'string' && env && env !== 'all') {
      servers = servers.filter((s) => s.environment.toLowerCase() === env.toLowerCase());
    }
    if (typeof category === 'string' && category && category !== 'all') {
      servers = servers.filter((s) => s.category.toLowerCase() === category.toLowerCase());
    }
    if (typeof tag === 'string' && tag) {
      servers = servers.filter((s) => Array.isArray(s.tags) && s.tags.includes(tag));
    }
    if (typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      servers = servers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.hostname && s.hostname.toLowerCase().includes(q)) ||
          s.ip.includes(q) ||
          (s.os_distro && s.os_distro.toLowerCase().includes(q)) ||
          (s.role && s.role.toLowerCase().includes(q)) ||
          (Array.isArray(s.tags) && s.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }

    const sanitizedServers = servers.map(sanitizeRemoteServerForClient);
    res.json({ success: true, count: sanitizedServers.length, servers: sanitizedServers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/tags - Distinct tags with count
apiRouter.get('/remote-servers/tags', async (req: Request, res: Response) => {
  try {
    const summary = await getRemoteServerTagsSummary();
    res.json({ success: true, tags: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id - Get single server details
apiRouter.get('/remote-servers/:id', async (req: Request, res: Response) => {
  try {
    const server = await getRemoteServerById(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    res.json({ success: true, server: sanitizeRemoteServerForClient(server) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers - Create new remote server
apiRouter.post('/remote-servers', async (req: Request, res: Response) => {
  try {
    const { name, ip, os_type } = req.body;
    if (!name || !ip) {
      return res.status(400).json({ success: false, error: 'Server name and IP address are required.' });
    }

    const created = await createRemoteServer(req.body);

    // Audit log
    await addAuditLog({
      userName: req.headers['x-user-name'] as string || 'Admin',
      action: 'Create Remote Server',
      category: 'device',
      target: `${created.name} (${created.ip})`,
      status: 'success',
      details: `Added new ${created.os_type.toUpperCase()} server with tags: ${(created.tags || []).join(', ') || 'none'}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'WebUI',
    });

    res.status(201).json({ success: true, server: sanitizeRemoteServerForClient(created) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/remote-servers/:id - Update existing remote server
apiRouter.put('/remote-servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await updateRemoteServer(id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    // Audit log
    await addAuditLog({
      userName: req.headers['x-user-name'] as string || 'Admin',
      action: 'Update Remote Server',
      category: 'device',
      target: `${updated.name} (${updated.ip})`,
      status: 'success',
      details: `Updated server settings and tags: ${(updated.tags || []).join(', ') || 'none'}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'WebUI',
    });

    res.json({ success: true, server: sanitizeRemoteServerForClient(updated) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/remote-servers/:id - Remove server from fleet
apiRouter.delete('/remote-servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await getRemoteServerById(id);
    const deleted = await deleteRemoteServer(id);

    if (existing) {
      await addAuditLog({
        userName: req.headers['x-user-name'] as string || 'Admin',
        action: 'Delete Remote Server',
        category: 'device',
        target: `${existing.name} (${existing.ip})`,
        status: 'success',
        details: `Deleted server ${existing.name} from inventory`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
    }

    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/postgres/test-connection - Test PostgreSQL connection using configured credentials
apiRouter.post('/remote-servers/:id/postgres/test-connection', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        status: 'connection_failed',
        message: 'Server not found in fleet.',
        messageFa: 'سرور در فهرست ناوگان یافت نشد.',
        serverAddress: '',
        port: 5432,
        username: 'postgres',
        testedAt: new Date().toISOString(),
      });
    }

    const { port, user, database, password } = req.body || {};

    const result = await testPostgresConnection(server, {
      port: port !== undefined && port !== null && port !== '' ? Number(port) : undefined,
      user: typeof user === 'string' && user.trim() ? user.trim() : undefined,
      database: typeof database === 'string' && database.trim() ? database.trim() : undefined,
      password: typeof password === 'string' && password ? password : undefined,
    });

    // Add audit log without credentials or secrets
    await addAuditLog({
      userName: (req.headers['x-user-name'] as string) || 'Admin',
      action: 'PostgreSQL Connection Test',
      category: 'device',
      target: `${server.name} (${server.ip}:${result.port})`,
      status: result.success ? 'success' : 'failure',
      details: `Tested PostgreSQL connection: status=${result.status}, latency=${result.latencyMs ?? 0}ms`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'WebUI',
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      status: 'unknown_error',
      message: err.message || 'Internal server error while testing connection',
      messageFa: 'خطای داخلی سرور هنگام آزمایش ارتباط با PostgreSQL',
      serverAddress: '',
      port: 5432,
      username: 'postgres',
      testedAt: new Date().toISOString(),
    });
  }
});

// GET /api/remote-servers/:id/postgres/panel-ip - Get detected outbound panel IP
apiRouter.get('/remote-servers/:id/postgres/panel-ip', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    const clientIp = getClientIp(req);
    const localIp = detectPanelIp();
    res.json({
      success: true,
      panelIp: localIp !== '127.0.0.1' ? localIp : (clientIp !== '127.0.0.1' && clientIp !== '::1' ? clientIp : '127.0.0.1'),
      clientIp,
      localIp,
      serverPort: server?.postgres_port || 5432,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, panelIp: '127.0.0.1' });
  }
});

// POST /api/remote-servers/:id/postgres/remediate-connection - Auto-remediate PostgreSQL remote access
apiRouter.post('/remote-servers/:id/postgres/remediate-connection', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found in fleet.',
        messageFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { panelIp, port, sessionPassword, password, postgresPassword, user, database } = req.body || {};
    const effectivePanelIp = (panelIp && typeof panelIp === 'string' && panelIp.trim()) ? panelIp.trim() : detectPanelIp();
    const effectivePort = port !== undefined && port !== null && port !== '' ? Number(port) : (server.postgres_port || 5432);
    const effectivePassword = (password && typeof password === 'string' && password.trim())
      ? password.trim()
      : (postgresPassword && typeof postgresPassword === 'string' && postgresPassword.trim())
      ? postgresPassword.trim()
      : undefined;

    // If an explicit password was passed, persist it securely to avoid future connection failures
    if (effectivePassword) {
      await updateRemoteServer(server.id, {
        postgres_password: effectivePassword,
      });
      server.postgres_password = effectivePassword;
      server.postgres_password_set = true;
    }

    const result = await remediatePostgresConnection(server, {
      panelIp: effectivePanelIp,
      port: effectivePort,
      sessionPassword,
      password: effectivePassword,
      user: typeof user === 'string' && user.trim() ? user.trim() : undefined,
      database: typeof database === 'string' && database.trim() ? database.trim() : undefined,
    });

    await addAuditLog({
      userName: (req.headers['x-user-name'] as string) || 'Admin',
      action: 'PostgreSQL Auto-Remediation',
      category: 'device',
      target: `${server.name} (${server.ip}:${effectivePort})`,
      status: result.success ? 'success' : 'failure',
      details: `Remediated PostgreSQL connection: firewall, listen_addresses, pg_hba (${effectivePanelIp}), restart service`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'WebUI',
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to execute PostgreSQL auto-remediation',
      messageFa: `خطا در اجرای خودکار اصلاح اتصال PostgreSQL: ${err.message}`,
    });
  }
});

// PUT /api/remote-servers/:id/postgres/credentials - Update PostgreSQL database credentials directly
apiRouter.put('/remote-servers/:id/postgres/credentials', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        message: 'Server not found in fleet.',
        messageFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { user, password, port, database } = req.body || {};
    const updates: Partial<RemoteServer> = {};

    if (user !== undefined && typeof user === 'string') updates.postgres_user = user.trim() || 'postgres';
    if (port !== undefined && port !== null && port !== '') updates.postgres_port = Number(port) || 5432;
    if (database !== undefined && typeof database === 'string') updates.postgres_database = database.trim() || 'postgres';
    if (password !== undefined && typeof password === 'string' && password.trim().length > 0) {
      updates.postgres_password = password.trim();
      updates.postgres_password_set = true;
    }

    const updated = await updateRemoteServer(id, updates);
    res.json({
      success: true,
      message: 'PostgreSQL credentials updated successfully',
      messageFa: 'اطلاعات اتصال PostgreSQL با موفقیت ذخیره شد',
      server: sanitizeRemoteServerForClient(updated || server),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to update PostgreSQL credentials',
      messageFa: `خطا در به‌روزرسانی اطلاعات اتصال: ${err.message}`,
    });
  }
});

// GET & POST /api/remote-servers/:id/postgres/overview - Fetch PostgreSQL engine telemetry and overview
const handlePostgresOverview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const port = req.body?.port ?? req.query?.port;
    const user = req.body?.user ?? req.query?.user;
    const database = req.body?.database ?? req.query?.database;
    const password = req.body?.password ?? req.query?.password;

    const result = await getPostgresOverview(server, {
      port: port !== undefined && port !== null && port !== '' ? Number(port) : undefined,
      user: typeof user === 'string' && user.trim() ? user.trim() : undefined,
      database: typeof database === 'string' && database.trim() ? database.trim() : undefined,
      password: typeof password === 'string' && password ? password : undefined,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Overview Discovery',
        category: 'device',
        target: `${server.name} (${server.ip}:${result.data?.port || 5432})`,
        status: 'success',
        details: `Discovered PostgreSQL ${result.data?.versionShort || ''} (uptime: ${result.data?.uptimePretty || '0m'}, connections: ${result.data?.connections?.total || 0}/${result.data?.maxConnections || 100})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error retrieving PostgreSQL overview',
      errorFa: 'خطای داخلی هنگام دریافت تله‌متری پایگاه داده',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/overview', handlePostgresOverview);
apiRouter.post('/remote-servers/:id/postgres/overview', handlePostgresOverview);

// GET & POST /api/remote-servers/:id/postgres/databases - Enumerate database catalog
const handlePostgresDatabases = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const port = req.body?.port ?? req.query?.port;
    const user = req.body?.user ?? req.query?.user;
    const database = req.body?.database ?? req.query?.database;
    const password = req.body?.password ?? req.query?.password;
    const includeTemplates =
      (req.body?.includeTemplates ?? req.query?.includeTemplates) === true ||
      req.query?.includeTemplates === 'true';

    const result = await getPostgresDatabases(server, {
      port: port !== undefined && port !== null && port !== '' ? Number(port) : undefined,
      user: typeof user === 'string' && user.trim() ? user.trim() : undefined,
      database: typeof database === 'string' && database.trim() ? database.trim() : undefined,
      password: typeof password === 'string' && password ? password : undefined,
      includeTemplates,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Database Catalog Enumeration',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Enumerated ${result.databases?.length || 0} databases (includeTemplates: ${includeTemplates})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error listing databases',
      errorFa: 'خطای داخلی هنگام دریافت کاتالوگ پایگاه‌های داده',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/databases', handlePostgresDatabases);
apiRouter.post('/remote-servers/:id/postgres/databases', handlePostgresDatabases);

// POST /api/remote-servers/:id/postgres/databases/create - Create new database
apiRouter.post('/remote-servers/:id/postgres/databases/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      name,
      owner,
      template,
      encoding,
      lcCollate,
      lcCtype,
      tablespace,
      connectionLimit,
      isTemplate,
      allowConnections,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    const result = await createPostgresDatabase(server, {
      name,
      owner,
      template,
      encoding,
      lcCollate,
      lcCtype,
      tablespace,
      connectionLimit: connectionLimit !== undefined ? Number(connectionLimit) : undefined,
      isTemplate: isTemplate !== undefined ? Boolean(isTemplate) : undefined,
      allowConnections: allowConnections !== undefined ? Boolean(allowConnections) : undefined,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Create Database',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Created PostgreSQL database "${name}" (owner: ${owner || 'default'}, encoding: ${encoding || 'default'})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create database',
      errorFa: 'خطا در ایجاد پایگاه داده',
    });
  }
});

// POST /api/remote-servers/:id/postgres/databases/update - Update database configuration
apiRouter.post('/remote-servers/:id/postgres/databases/update', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      name,
      newName,
      owner,
      connectionLimit,
      allowConnections,
      isTemplate,
      tablespace,
      comment,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    const result = await updatePostgresDatabase(server, {
      name,
      newName,
      owner,
      connectionLimit: connectionLimit !== undefined ? Number(connectionLimit) : undefined,
      allowConnections: allowConnections !== undefined ? Boolean(allowConnections) : undefined,
      isTemplate: isTemplate !== undefined ? Boolean(isTemplate) : undefined,
      tablespace,
      comment,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Update Database',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Updated PostgreSQL database "${name}" settings (newName: ${newName || 'unchanged'})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update database',
      errorFa: 'خطا در ویرایش مشخصات پایگاه داده',
    });
  }
});

// POST /api/remote-servers/:id/postgres/databases/drop - Drop database
apiRouter.post('/remote-servers/:id/postgres/databases/drop', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { name, forceWithDisconnect, port, user, sessionPassword } = req.body || {};

    const result = await dropPostgresDatabase(server, {
      name,
      forceWithDisconnect: Boolean(forceWithDisconnect),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Drop Database',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Dropped PostgreSQL database "${name}" (forceWithDisconnect: ${Boolean(forceWithDisconnect)})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to drop database',
      errorFa: 'خطا در حذف پایگاه داده',
    });
  }
});

// GET & POST /api/remote-servers/:id/postgres/schemas - Enumerate schemas in database
const handlePostgresSchemas = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.body?.database ?? req.query?.database ?? 'postgres') as string;
    const port = req.body?.port ?? req.query?.port;
    const user = req.body?.user ?? req.query?.user;
    const password = req.body?.password ?? req.query?.password;

    const result = await getPostgresSchemas(server, {
      database,
      port: port ? Number(port) : undefined,
      user,
      password,
    });

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to enumerate schemas',
      errorFa: 'خطا در دریافت لیست اسکیمای پایگاه داده',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/schemas', handlePostgresSchemas);
apiRouter.post('/remote-servers/:id/postgres/schemas', handlePostgresSchemas);

// POST /api/remote-servers/:id/postgres/schemas/create - Create new schema
apiRouter.post('/remote-servers/:id/postgres/schemas/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { database, name, owner, comment, port, user, sessionPassword } = req.body || {};

    const result = await createPostgresSchema(server, {
      database: database || 'postgres',
      name,
      owner,
      comment,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Create Schema',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Created schema "${name}" in database "${database || 'postgres'}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create schema',
      errorFa: 'خطا در ایجاد اسکیمای جدید',
    });
  }
});

// POST /api/remote-servers/:id/postgres/schemas/update - Update schema (rename, owner, comment)
apiRouter.post('/remote-servers/:id/postgres/schemas/update', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { database, name, newName, owner, comment, port, user, sessionPassword } = req.body || {};

    const result = await updatePostgresSchema(server, {
      database: database || 'postgres',
      name,
      newName,
      owner,
      comment,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Update Schema',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Updated schema "${name}" in database "${database || 'postgres'}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update schema',
      errorFa: 'خطا در ویرایش اسکیما',
    });
  }
});

// POST /api/remote-servers/:id/postgres/schemas/drop - Drop schema
apiRouter.post('/remote-servers/:id/postgres/schemas/drop', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { database, name, cascade, port, user, sessionPassword } = req.body || {};

    const result = await dropPostgresSchema(server, {
      database: database || 'postgres',
      name,
      cascade: Boolean(cascade),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Drop Schema',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Dropped schema "${name}" from database "${database || 'postgres'}" (cascade: ${Boolean(cascade)})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to drop schema',
      errorFa: 'خطا در حذف اسکیما',
    });
  }
});

// ==========================================
// Phase 13: PostgreSQL Backup & Restore Endpoints
// ==========================================

// GET /api/remote-servers/:id/postgres/backups - List backups
apiRouter.get('/remote-servers/:id/postgres/backups', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const backups = await listPostgresBackups(server);
    return res.json({
      success: true,
      backups,
      count: backups.length,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to list backups',
      errorFa: 'خطا در دریافت فهرست نسخه‌های پشتیبان',
    });
  }
});

// POST /api/remote-servers/:id/postgres/backups/create - Create backup
apiRouter.post('/remote-servers/:id/postgres/backups/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      category = 'database',
      configType,
      database,
      mode = 'full',
      format = 'plain',
      schemas,
      tables,
      includeDrop = false,
      useInserts = true,
      compressionLevel = 0,
      customFilename,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    const result = await createPostgresBackup(server, {
      category,
      configType,
      database: database || server.postgres_database || 'postgres',
      mode,
      format,
      schemas,
      tables,
      includeDrop: Boolean(includeDrop),
      useInserts: Boolean(useInserts),
      compressionLevel: Number(compressionLevel) || 0,
      customFilename,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: category === 'configuration' ? 'PostgreSQL Create Config Backup' : 'PostgreSQL Create Backup',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: category === 'configuration'
          ? `Created PostgreSQL configuration backup "${result.backup?.filename}" (${configType || 'postgresql_conf'})`
          : `Created PostgreSQL backup "${result.backup?.filename}" for database "${database || 'postgres'}" (${mode}, ${format})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create backup',
      errorFa: 'خطا در ایجاد نسخه پشتیبان پایگاه داده',
    });
  }
});

// POST /api/remote-servers/:id/postgres/backups/validate-restore - Validate backup before restore
apiRouter.post('/remote-servers/:id/postgres/backups/validate-restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        valid: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { filename, targetDatabase, port, user, sessionPassword } = req.body || {};
    if (!filename) {
      return res.status(400).json({
        valid: false,
        error: 'Filename is required for validation.',
        errorFa: 'نام فایل نسخه پشتیبان الزامی است.',
      });
    }

    const result = await validatePostgresRestore(server, {
      filename,
      targetDatabase,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      valid: false,
      error: err.message || 'Failed to validate restore',
      errorFa: 'خطا در اعتبارسنجی فرآیند بازیابی',
    });
  }
});

// GET /api/remote-servers/:id/postgres/backups/:filename/preview - Preview backup content
apiRouter.get('/remote-servers/:id/postgres/backups/:filename/preview', async (req: Request, res: Response) => {
  try {
    const { id, filename } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const result = await previewPostgresBackup(server, decodeURIComponent(filename));
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to preview backup',
      errorFa: 'خطا در پیش‌نمایش محتوای نسخه پشتیبان',
    });
  }
});

// POST /api/remote-servers/:id/postgres/backups/restore - Restore backup
apiRouter.post('/remote-servers/:id/postgres/backups/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      database,
      filename,
      category,
      cleanFirst = false,
      singleTransaction = true,
      exitOnError = false,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Filename is required for restore.',
        errorFa: 'نام فایل نسخه پشتیبان الزامی است.',
      });
    }

    const result = await restorePostgresBackup(server, {
      database: database || server.postgres_database || 'postgres',
      filename,
      category,
      cleanFirst: Boolean(cleanFirst),
      singleTransaction: Boolean(singleTransaction),
      exitOnError: Boolean(exitOnError),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: category === 'configuration' ? 'PostgreSQL Restore Config Backup' : 'PostgreSQL Restore Backup',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Restored PostgreSQL backup "${filename}" into database "${database || 'postgres'}" (${result.executedStatementsCount || 0} statements in ${(result.durationMs ? (result.durationMs / 1000).toFixed(1) : 0)}s)`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to restore backup',
      errorFa: 'خطا در بازیابی نسخه پشتیبان پایگاه داده',
    });
  }
});

// DELETE /api/remote-servers/:id/postgres/backups/:filename - Delete backup
apiRouter.delete('/remote-servers/:id/postgres/backups/:filename', async (req: Request, res: Response) => {
  try {
    const { id, filename } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const result = await deletePostgresBackup(server, decodeURIComponent(filename));
    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Delete Backup',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Deleted PostgreSQL backup "${filename}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete backup',
      errorFa: 'خطا در حذف نسخه پشتیبان',
    });
  }
});

// GET /api/remote-servers/:id/postgres/backups/:filename/download - Download backup
apiRouter.get('/remote-servers/:id/postgres/backups/:filename/download', async (req: Request, res: Response) => {
  try {
    const { id, filename } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const filePath = getPostgresBackupFilePath(server, decodeURIComponent(filename));
    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: 'Backup file not found on disk.',
        errorFa: 'فایل نسخه پشتیبان بر روی دیسک یافت نشد.',
      });
    }

    res.download(filePath, decodeURIComponent(filename));
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to download backup',
      errorFa: 'خطا در دانلود فایل نسخه پشتیبان',
    });
  }
});

// ==========================================
// Phase 14: PostgreSQL Extensions Endpoints
// ==========================================

// GET /api/remote-servers/:id/postgres/extensions - List available & installed extensions
apiRouter.get('/remote-servers/:id/postgres/extensions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const extensions = await listPostgresExtensions(server, {
      database,
      port,
      user,
      password,
    });

    return res.json({
      success: true,
      database,
      extensions,
      totalCount: extensions.length,
      installedCount: extensions.filter((e) => e.isInstalled).length,
      updatableCount: extensions.filter((e) => e.isUpdatable).length,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to list extensions',
      errorFa: 'خطا در بارگذاری افزونه‌های پایگاه داده',
    });
  }
});

// POST /api/remote-servers/:id/postgres/extensions/install - Install extension
apiRouter.post('/remote-servers/:id/postgres/extensions/install', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      database,
      extensionName,
      schemaName,
      version,
      cascade = false,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    if (!extensionName) {
      return res.status(400).json({
        success: false,
        error: 'Extension name is required.',
        errorFa: 'نام افزونه الزامی است.',
      });
    }

    const targetDb = database || server.postgres_database || 'postgres';

    const result = await installPostgresExtension(server, {
      database: targetDb,
      extensionName,
      schemaName,
      version,
      cascade: Boolean(cascade),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Install Extension',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Installed extension "${extensionName}" in database "${targetDb}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to install extension',
      errorFa: 'خطا در فرآیند نصب افزونه',
    });
  }
});

// POST /api/remote-servers/:id/postgres/extensions/update - Update extension
apiRouter.post('/remote-servers/:id/postgres/extensions/update', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      database,
      extensionName,
      targetVersion,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    if (!extensionName) {
      return res.status(400).json({
        success: false,
        error: 'Extension name is required.',
        errorFa: 'نام افزونه الزامی است.',
      });
    }

    const targetDb = database || server.postgres_database || 'postgres';

    const result = await updatePostgresExtension(server, {
      database: targetDb,
      extensionName,
      targetVersion,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Update Extension',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Updated extension "${extensionName}" in database "${targetDb}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update extension',
      errorFa: 'خطا در ارتقای افزونه',
    });
  }
});

// POST /api/remote-servers/:id/postgres/extensions/drop - Drop extension
apiRouter.post('/remote-servers/:id/postgres/extensions/drop', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      database,
      extensionName,
      cascade = false,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    if (!extensionName) {
      return res.status(400).json({
        success: false,
        error: 'Extension name is required.',
        errorFa: 'نام افزونه الزامی است.',
      });
    }

    const targetDb = database || server.postgres_database || 'postgres';

    const result = await dropPostgresExtension(server, {
      database: targetDb,
      extensionName,
      cascade: Boolean(cascade),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Drop Extension',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Dropped extension "${extensionName}" from database "${targetDb}" (CASCADE=${cascade})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to drop extension',
      errorFa: 'خطا در حذف افزونه',
    });
  }
});

// ==========================================
// Phase 15: PostgreSQL Health Check & Audit Endpoint
// ==========================================

// GET /api/remote-servers/:id/postgres/health-audit - Run health check and security audit
apiRouter.get('/remote-servers/:id/postgres/health-audit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const report = await runPostgresHealthAudit(server, {
      database,
      port,
      user,
      password,
    });

    return res.json({
      success: true,
      report,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to perform PostgreSQL health audit',
      errorFa: 'خطا در اجرای ممیزی و ارزیابی سلامت پایگاه داده',
    });
  }
});

// ============================================================================
// PHASE 16: pg_hba.conf Client Authentication Management Endpoints
// ============================================================================

// GET /api/remote-servers/:id/postgres/hba - Discover hba_file location and parse rules/backups
apiRouter.get('/remote-servers/:id/postgres/hba', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const data = await getPostgresHbaConfig(server, {
      database,
      port,
      user,
      sessionPassword: password,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to load PostgreSQL pg_hba.conf configuration',
      errorFa: 'خطا در بارگذاری پیکربندی احراز هویت pg_hba.conf',
    });
  }
});

// POST /api/remote-servers/:id/postgres/hba/save - Save rules (Backup -> Validate -> Show Diff -> Apply -> Reload -> Rollback on error)
apiRouter.post('/remote-servers/:id/postgres/hba/save', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { rules, createBackup, reloadPostgres, sessionPassword, database, port, user } = req.body || {};

    if (!rules || !Array.isArray(rules)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid rules array.',
        errorFa: 'آرایه قوانین احراز هویت نامعتبر است.',
      });
    }

    const result = await savePostgresHbaConfig(
      server,
      {
        rules,
        createBackup: createBackup !== false,
        reloadPostgres: reloadPostgres !== false,
        sessionPassword,
        database,
        port,
        user,
      }
    );

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to save pg_hba.conf',
      errorFa: 'خطا در ذخیره‌سازی فایل pg_hba.conf',
    });
  }
});

// POST /api/remote-servers/:id/postgres/hba/restore - Restore from a previous backup file
apiRouter.post('/remote-servers/:id/postgres/hba/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { backupFileName, reloadPostgres, sessionPassword, database, port, user } = req.body || {};

    if (!backupFileName) {
      return res.status(400).json({
        success: false,
        error: 'Missing backupFileName parameter.',
        errorFa: 'نام فایل پشتیبان مشخص نشده است.',
      });
    }

    const result = await restorePostgresHbaBackup(server, {
      backupFileName,
      reloadPostgres: reloadPostgres !== false,
      sessionPassword,
      database,
      port,
      user,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to restore pg_hba.conf backup',
      errorFa: 'خطا در بازیابی نسخه پشتیبان pg_hba.conf',
    });
  }
});

// POST /api/remote-servers/:id/postgres/hba/reload - Execute pg_reload_conf() and return status
apiRouter.post('/remote-servers/:id/postgres/hba/reload', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { sessionPassword, database, port, user } = req.body || {};

    const result = await reloadPostgresHba(server, {
      database,
      port,
      user,
      sessionPassword,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to reload PostgreSQL configuration',
      errorFa: 'خطا در بازخوانی مجدد پیکربندی PostgreSQL',
    });
  }
});

// ============================================================================
// PHASE 18: Database Maintenance & Optimization (VACUUM, ANALYZE, REINDEX)
// ============================================================================

// POST /api/remote-servers/:id/postgres/maintenance/run - Run VACUUM, ANALYZE or REINDEX
apiRouter.post('/remote-servers/:id/postgres/maintenance/run', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      action,
      scope,
      database,
      schema,
      table,
      indexName,
      full,
      freeze,
      analyzeWithVacuum,
      verbose,
      concurrently,
      port,
      user,
      sessionPassword,
    } = req.body;

    if (!action || !['vacuum', 'analyze', 'reindex'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Valid maintenance action (vacuum, analyze, reindex) is required.',
        errorFa: 'انتخاب نوع عملیات نگهداری معتبر (vacuum، analyze یا reindex) الزامی است.',
      });
    }

    if (!database) {
      return res.status(400).json({
        success: false,
        error: 'Target database name is required.',
        errorFa: 'نام پایگاه داده هدف الزامی است.',
      });
    }

    const result = await runPostgresMaintenance(server, {
      action,
      scope: scope || 'table',
      database,
      schema,
      table,
      indexName,
      full: Boolean(full),
      freeze: Boolean(freeze),
      analyzeWithVacuum: Boolean(analyzeWithVacuum),
      verbose: Boolean(verbose),
      concurrently: Boolean(concurrently),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute maintenance command',
      errorFa: 'خطای سرور در اجرای دستور نگهداری و بهینه‌سازی',
    });
  }
});

// GET /api/remote-servers/:id/postgres/maintenance/bloat - Retrieve dead tuples and bloat metrics
apiRouter.get('/remote-servers/:id/postgres/maintenance/bloat', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const schema = req.query.schema as string | undefined;
    const table = req.query.table as string | undefined;
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const metrics = await getPostgresBloatMetrics(server, database, schema, table, {
      port,
      user,
      sessionPassword: password,
    });

    return res.json({
      success: true,
      database,
      metrics,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch table bloat metrics',
      errorFa: 'خطا در دریافت شاخص‌های هرزرفت و فضای مرده جداول',
    });
  }
});

// GET /api/remote-servers/:id/postgres/maintenance/active - Check active vacuum progress
apiRouter.get('/remote-servers/:id/postgres/maintenance/active', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const activeTasks = await getPostgresActiveMaintenance(server, database, {
      port,
      user,
      sessionPassword: password,
    });

    return res.json({
      success: true,
      database,
      activeTasks,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch active maintenance tasks',
      errorFa: 'خطا در دریافت وضعیت عملیات فعال نگهداری',
    });
  }
});

// ============================================================================
// PHASE 20: Lock & Deadlock Inspector (پایش زنده و ردیابی قفل‌ها و بن‌بست‌ها)
// ============================================================================

// GET /api/remote-servers/:id/postgres/locks - Retrieve live active locks, blocking tree & deadlock telemetry
apiRouter.get('/remote-servers/:id/postgres/locks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const overview = await getPostgresLocksOverview(server, {
      database,
      port,
      user,
      password,
    });

    return res.json({
      success: true,
      data: overview,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve PostgreSQL locks overview',
      errorFa: 'خطا در دریافت وضعیت قفل‌ها و بن‌بست‌های PostgreSQL',
    });
  }
});

// POST /api/remote-servers/:id/postgres/locks/terminate - Cancel query or terminate blocked/blocking session
apiRouter.post('/remote-servers/:id/postgres/locks/terminate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { pid, action, database, port, user, password } = req.body;
    if (!pid || typeof pid !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'A valid backend PID is required.',
        errorFa: 'شناسه معتبر پردازش (PID) الزامی است.',
      });
    }

    if (action !== 'cancel' && action !== 'terminate') {
      return res.status(400).json({
        success: false,
        error: 'Action must be either "cancel" or "terminate".',
        errorFa: 'عملیات باید "cancel" یا "terminate" باشد.',
      });
    }

    const result = await terminatePostgresSession(server, {
      pid,
      action,
      database: database || server.postgres_database || 'postgres',
      port: port ? Number(port) : undefined,
      user: user || server.postgres_user,
      password,
    });

    // Record audit log
    try {
      await addAuditLog({
        user: (req as any).user?.username || 'system',
        action: action === 'cancel' ? 'POSTGRES_QUERY_CANCEL' : 'POSTGRES_SESSION_TERMINATE',
        details: `PostgreSQL session PID ${pid} ${action}ed on server ${server.name || server.ip} (database: ${database || 'default'})`,
        status: result.success ? 'success' : 'failure',
      });
    } catch {}

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to terminate PostgreSQL backend session',
      errorFa: 'خطا در خاتمه نشست PostgreSQL',
    });
  }
});

// ============================================================================
// PHASE 21: Live Activity & Query Performance Monitor (پایش زنده ترافیک و کوئری‌ها)
// ============================================================================

// GET /api/remote-servers/:id/postgres/performance - Retrieve live activity, TPS, buffer hits, checkpoints & slow queries
apiRouter.get('/remote-servers/:id/postgres/performance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const overview = await getPostgresPerformanceOverview(server, {
      database,
      port,
      user,
      password,
    });

    return res.json({
      success: true,
      data: overview,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve PostgreSQL performance overview',
      errorFa: 'خطا در دریافت وضعیت کارایی و تلمتری کوئری‌های PostgreSQL',
    });
  }
});

// POST /api/remote-servers/:id/postgres/performance/reset - Reset pg_stat_statements statistics
apiRouter.post('/remote-servers/:id/postgres/performance/reset', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { database, port, user, password } = req.body || {};
    const result = await resetPostgresStatStatements(server, {
      database: database || server.postgres_database || 'postgres',
      port: port ? Number(port) : undefined,
      user: user || server.postgres_user,
      password,
    });

    // Record audit log
    try {
      await addAuditLog({
        user: (req as any).user?.username || 'system',
        action: 'POSTGRES_STAT_STATEMENTS_RESET',
        details: `Reset pg_stat_statements metrics on server ${server.name || server.ip} (database: ${database || 'default'})`,
        status: result.success ? 'success' : 'failure',
      });
    } catch {}

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to reset PostgreSQL stat statements',
      errorFa: 'خطا در بازنشانی آمار pg_stat_statements',
    });
  }
});

// ============================================================================
// PHASE 22: Replication & High-Availability Cluster Status
// ============================================================================

// GET /api/remote-servers/:id/postgres/replication - Retrieve cluster role, replicas lag, slots & wal receiver
apiRouter.get('/remote-servers/:id/postgres/replication', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = req.query.user as string | undefined;
    const password = req.query.password as string | undefined;

    const overview = await getPostgresReplicationOverview(server, {
      database,
      port,
      user,
      password,
    });

    return res.json({
      success: true,
      data: overview,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve PostgreSQL replication overview',
      errorFa: 'خطا در دریافت وضعیت رپلیکیشن و کلاستر PostgreSQL',
    });
  }
});

// POST /api/remote-servers/:id/postgres/replication/slot - Create or drop replication slot
apiRouter.post('/remote-servers/:id/postgres/replication/slot', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { slotName, action, slotType, immediatelyReserve, database, port, user, password } = req.body || {};
    if (!slotName || !action) {
      return res.status(400).json({
        success: false,
        error: 'slotName and action (create | drop) are required.',
        errorFa: 'نام اسلات و نوع عملیات (create یا drop) الزامی است.',
      });
    }

    const result = await managePostgresReplicationSlot(server, {
      slotName,
      action,
      slotType: slotType || 'physical',
      immediatelyReserve: immediatelyReserve ?? true,
      database: database || server.postgres_database || 'postgres',
      port: port ? Number(port) : undefined,
      user: user || server.postgres_user,
      password,
    });

    try {
      await addAuditLog({
        user: (req as any).user?.username || 'system',
        action: action === 'create' ? 'POSTGRES_REPLICATION_SLOT_CREATE' : 'POSTGRES_REPLICATION_SLOT_DROP',
        details: `${action.toUpperCase()} replication slot "${slotName}" on server ${server.name || server.ip}`,
        status: result.success ? 'success' : 'failure',
      });
    } catch {}

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute replication slot action',
      errorFa: 'خطا در اجرای عملیات اسلات رپلیکیشن',
    });
  }
});

// POST /api/remote-servers/:id/postgres/replication/replay - Pause or resume WAL replay on standby
apiRouter.post('/remote-servers/:id/postgres/replication/replay', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { action, database, port, user, password } = req.body || {};
    if (action !== 'pause' && action !== 'resume') {
      return res.status(400).json({
        success: false,
        error: 'Action must be either "pause" or "resume".',
        errorFa: 'عملیات باید "pause" یا "resume" باشد.',
      });
    }

    const result = await controlPostgresWalReplay(server, {
      action,
      database: database || server.postgres_database || 'postgres',
      port: port ? Number(port) : undefined,
      user: user || server.postgres_user,
      password,
    });

    try {
      await addAuditLog({
        user: (req as any).user?.username || 'system',
        action: action === 'pause' ? 'POSTGRES_WAL_REPLAY_PAUSE' : 'POSTGRES_WAL_REPLAY_RESUME',
        details: `${action.toUpperCase()} WAL replay on standby server ${server.name || server.ip}`,
        status: result.success ? 'success' : 'failure',
      });
    } catch {}

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to control WAL replay',
      errorFa: 'خطا در کنترل پخش مجدد WAL',
    });
  }
});

// ==========================================
// Phase 23: Postgres Server Logs Explorer Routes
// ==========================================

// GET /api/remote-servers/:id/postgres/logs - Retrieve parsed logs, stats and file list
apiRouter.get('/remote-servers/:id/postgres/logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = (req.query.user as string) || server.postgres_user;
    const password = req.query.password as string | undefined;
    const logFileName = req.query.logFileName as string | undefined;
    const maxLines = req.query.maxLines ? Number(req.query.maxLines) : 500;
    const severity = (req.query.severity as any) || 'ALL';
    const searchTerm = req.query.searchTerm as string | undefined;

    const overview = await getPostgresLogsOverview(server, {
      database,
      port,
      user,
      password,
      logFileName,
      maxLines,
      severity,
      searchTerm,
    });

    return res.json({
      success: true,
      data: overview,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve PostgreSQL server logs',
      errorFa: 'خطا در دریافت لاگ‌های سرور PostgreSQL',
    });
  }
});

// GET /api/remote-servers/:id/postgres/logs/settings - Retrieve logging parameters
apiRouter.get('/remote-servers/:id/postgres/logs/settings', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = (req.query.user as string) || server.postgres_user;
    const password = req.query.password as string | undefined;

    const settings = await getPostgresLoggingSettings(server, {
      database,
      port,
      user,
      password,
    });

    return res.json({
      success: true,
      data: settings,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve PostgreSQL logging settings',
      errorFa: 'خطا در دریافت تنظیمات لاگینگ PostgreSQL',
    });
  }
});

// ==========================================
// Phase 24: Postgres Configuration Tuner & Hardware Sizing Routes
// ==========================================

// GET /api/remote-servers/:id/postgres/tuning - Retrieve hardware profile and calculated recommendations
apiRouter.get('/remote-servers/:id/postgres/tuning', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const database = (req.query.database as string) || server.postgres_database || 'postgres';
    const port = req.query.port ? Number(req.query.port) : undefined;
    const user = (req.query.user as string) || server.postgres_user;
    const password = req.query.password as string | undefined;

    const workload = (req.query.workload as any) || 'web';
    const storage = (req.query.storage as any) || undefined;
    const customRamGb = req.query.customRamGb ? Number(req.query.customRamGb) : undefined;
    const customCores = req.query.customCores ? Number(req.query.customCores) : undefined;
    const maxConnections = req.query.maxConnections ? Number(req.query.maxConnections) : undefined;

    const report = await getPostgresTuningReport(server, {
      database,
      port,
      user,
      password,
      workload,
      storage,
      customRamGb,
      customCores,
      maxConnections,
    });

    return res.json({
      success: true,
      data: report,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to calculate tuning recommendations',
      errorFa: 'خطا در محاسبه توصیه‌های تیونینگ سرور',
    });
  }
});

// POST /api/remote-servers/:id/postgres/tuning/apply - Apply tuning parameters (ALTER SYSTEM or append to postgresql.conf)
apiRouter.post('/remote-servers/:id/postgres/tuning/apply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      workload = 'web',
      storage = 'ssd',
      customRamGb,
      customCores,
      maxConnections,
      method = 'alter_system',
      sessionPassword,
      selectedParameters,
      database,
      port,
      user,
      password,
    } = req.body || {};

    const result = await applyPostgresTuningConfiguration(
      server,
      {
        workload,
        storage,
        customRamGb,
        customCores,
        maxConnections,
        method,
        sessionPassword,
        selectedParameters,
      },
      {
        database: database || server.postgres_database || 'postgres',
        port: port ? Number(port) : undefined,
        user: user || server.postgres_user,
        password,
      }
    );

    try {
      await addAuditLog({
        user: (req as any).user?.username || 'system',
        action: 'POSTGRES_TUNING_APPLIED',
        details: `Applied ${result.appliedCount} tuning parameters via ${method.toUpperCase()} on server ${server.name || server.ip}`,
        status: result.success ? 'success' : 'failure',
      });
    } catch {}

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to apply PostgreSQL tuning configuration',
      errorFa: 'خطا در اعمال تنظیمات تیونینگ PostgreSQL',
    });
  }
});

const handlePostgresRoles = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const port = req.body?.port ?? req.query?.port;
    const user = req.body?.user ?? req.query?.user;
    const database = req.body?.database ?? req.query?.database;
    const password = req.body?.password ?? req.query?.password;

    const result = await getPostgresRoles(server, {
      port: port !== undefined && port !== null && port !== '' ? Number(port) : undefined,
      user: typeof user === 'string' && user.trim() ? user.trim() : undefined,
      database: typeof database === 'string' && database.trim() ? database.trim() : undefined,
      password: typeof password === 'string' && password ? password : undefined,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Roles Enumeration',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Enumerated ${result.roles?.length || 0} PostgreSQL roles`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error listing roles',
      errorFa: 'خطای داخلی هنگام دریافت نقش‌های پایگاه داده',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/roles', handlePostgresRoles);
apiRouter.post('/remote-servers/:id/postgres/roles', handlePostgresRoles);

// POST /api/remote-servers/:id/postgres/roles/create - Create PostgreSQL Role / User
apiRouter.post('/remote-servers/:id/postgres/roles/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      rolname,
      canLogin,
      isSuperuser,
      createDb,
      createRole,
      replication,
      bypassRls,
      connectionLimit,
      validUntil,
      password,
      memberOf,
      comment,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    const result = await createPostgresRole(server, {
      rolname,
      canLogin: Boolean(canLogin),
      isSuperuser: Boolean(isSuperuser),
      createDb: Boolean(createDb),
      createRole: Boolean(createRole),
      replication: Boolean(replication),
      bypassRls: Boolean(bypassRls),
      connectionLimit: connectionLimit !== undefined ? Number(connectionLimit) : undefined,
      validUntil,
      password,
      memberOf,
      comment,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Create Role',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Created PostgreSQL role "${rolname}" (login: ${Boolean(canLogin)}, superuser: ${Boolean(isSuperuser)})`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create role',
      errorFa: 'خطا در ایجاد نقش در پایگاه داده',
    });
  }
});

// POST /api/remote-servers/:id/postgres/roles/update - Update PostgreSQL Role Attributes
apiRouter.post('/remote-servers/:id/postgres/roles/update', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const {
      rolname,
      canLogin,
      isSuperuser,
      createDb,
      createRole,
      replication,
      bypassRls,
      connectionLimit,
      validUntil,
      comment,
      port,
      user,
      sessionPassword,
    } = req.body || {};

    const result = await updatePostgresRole(server, {
      rolname,
      canLogin,
      isSuperuser,
      createDb,
      createRole,
      replication,
      bypassRls,
      connectionLimit: connectionLimit !== undefined ? Number(connectionLimit) : undefined,
      validUntil,
      comment,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Update Role',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Updated PostgreSQL role "${rolname}" attributes`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update role',
      errorFa: 'خطا در به‌روزرسانی مشخصات نقش در پایگاه داده',
    });
  }
});

// POST /api/remote-servers/:id/postgres/roles/password - Change PostgreSQL Role Password
apiRouter.post('/remote-servers/:id/postgres/roles/password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { rolname, newPassword, port, user, sessionPassword } = req.body || {};

    const result = await changePostgresRolePassword(server, {
      rolname,
      newPassword,
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Change Password',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Changed password for PostgreSQL role "${rolname}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to change role password',
      errorFa: 'خطا در تغییر کلمه عبور نقش',
    });
  }
});

// POST /api/remote-servers/:id/postgres/roles/membership - Grant or Revoke Role Membership
apiRouter.post('/remote-servers/:id/postgres/roles/membership', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { roleName, memberRole, action, adminOption, port, user, sessionPassword } = req.body || {};

    const result = await managePostgresRoleMembership(server, {
      roleName,
      memberRole,
      action: action === 'revoke' ? 'revoke' : 'grant',
      adminOption: Boolean(adminOption),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Role Membership',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `${action === 'revoke' ? 'Revoked' : 'Granted'} membership of role "${roleName}" to/from "${memberRole}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update role membership',
      errorFa: 'خطا در ویرایش عضویت نقش',
    });
  }
});

// POST /api/remote-servers/:id/postgres/roles/drop - Drop PostgreSQL Role
apiRouter.post('/remote-servers/:id/postgres/roles/drop', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { rolname, reassignOwnedTo, dropOwned, port, user, sessionPassword } = req.body || {};

    const result = await dropPostgresRole(server, {
      rolname,
      reassignOwnedTo,
      dropOwned: Boolean(dropOwned),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Drop Role',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Dropped PostgreSQL role "${rolname}"`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to drop role',
      errorFa: 'خطا در حذف نقش پایگاه داده',
    });
  }
});

// GET & POST /api/remote-servers/:id/postgres/permissions - Retrieve Object Permissions
const handlePostgresPermissions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const scope = (req.body?.scope ?? req.query?.scope) as any;
    const database = (req.body?.database ?? req.query?.database) as string;
    const schema = (req.body?.schema ?? req.query?.schema) as string;
    const objectName = (req.body?.objectName ?? req.query?.objectName) as string;
    const port = req.body?.port ?? req.query?.port;
    const user = req.body?.user ?? req.query?.user;
    const password = req.body?.password ?? req.query?.password;

    if (!scope || !database || !objectName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters (scope, database, objectName).',
        errorFa: 'پارامترهای الزامی (scope، database، objectName) مشخص نشده‌اند.',
      });
    }

    const result = await getPostgresObjectPermissions(server, {
      scope,
      database,
      schema,
      objectName,
      port: port ? Number(port) : undefined,
      user,
      password,
    });

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch object permissions',
      errorFa: 'خطا در استعلام دسترسی‌های شیء در پایگاه داده',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/permissions', handlePostgresPermissions);
apiRouter.post('/remote-servers/:id/postgres/permissions', handlePostgresPermissions);

// POST /api/remote-servers/:id/postgres/permissions/apply - Apply Permissions Deltas
apiRouter.post('/remote-servers/:id/postgres/permissions/apply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const { scope, database, schema, objectName, deltas, cascade, port, user, sessionPassword } = req.body || {};

    if (!scope || !database || !objectName || !Array.isArray(deltas)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body (scope, database, objectName, deltas required).',
        errorFa: 'پارامترهای درخواست نامعتبر هستند.',
      });
    }

    const result = await applyPostgresPermissions(server, {
      scope,
      database,
      schema,
      objectName,
      deltas,
      cascade: Boolean(cascade),
      port: port ? Number(port) : undefined,
      user,
      sessionPassword,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Apply Permissions',
        category: 'device',
        target: `${server.name} (${server.ip})`,
        status: 'success',
        details: `Updated permissions on ${scope} "${objectName}" in database "${database}" (${result.executedQueries.length} statements)`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to apply permissions',
      errorFa: 'خطا در ثبت و اعمال دسترسی‌ها',
    });
  }
});

// GET & POST /api/remote-servers/:id/postgres/database-tree - Lazy-load database structural object tree
const handlePostgresDatabaseTree = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found in fleet.',
        errorFa: 'سرور در فهرست ناوگان یافت نشد.',
      });
    }

    const targetDb = req.body?.database ?? req.query?.database;
    if (!targetDb || typeof targetDb !== 'string' || !targetDb.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Database name query/body parameter is required',
        errorFa: 'نام پایگاه داده جهت دریافت درخت اجزا الزامی است',
      });
    }

    const port = req.body?.port ?? req.query?.port;
    const user = req.body?.user ?? req.query?.user;
    const password = req.body?.password ?? req.query?.password;

    const result = await getPostgresDatabaseTree(server, targetDb.trim(), {
      port: port !== undefined && port !== null && port !== '' ? Number(port) : undefined,
      user: typeof user === 'string' && user.trim() ? user.trim() : undefined,
      password: typeof password === 'string' && password ? password : undefined,
    });

    if (result.success) {
      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || 'Admin',
        action: 'PostgreSQL Database Object Tree Exploration',
        category: 'device',
        target: `${server.name} (${server.ip}/${targetDb.trim()})`,
        status: 'success',
        details: `Explored database tree "${targetDb.trim()}": ${result.tree?.schemas.length || 0} schemas, ${result.tree?.totalTables || 0} tables, ${result.tree?.totalViews || 0} views`,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || 'WebUI',
      });
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error retrieving database tree',
      errorFa: 'خطای داخلی هنگام دریافت ساختار پایگاه داده',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/database-tree', handlePostgresDatabaseTree);
apiRouter.post('/remote-servers/:id/postgres/database-tree', handlePostgresDatabaseTree);

// GET & POST /api/remote-servers/:id/postgres/table-structure - Retrieve detailed table structure, columns, constraints, indexes & statistics
const handlePostgresTableStructure = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Remote server "${id}" not found`,
        errorFa: `سرور ریموت با شناسه "${id}" یافت نشد`,
      });
    }

    const database = (req.body?.database || req.query.database || '').toString().trim();
    const schema = (req.body?.schema || req.query.schema || '').toString().trim();
    const table = (req.body?.table || req.query.table || '').toString().trim();

    if (!database) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter or body field "database" is required',
        errorFa: 'پارامتر نام پایگاه داده اجباری است',
      });
    }
    if (!schema) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter or body field "schema" is required',
        errorFa: 'پارامتر نام اسکیما اجباری است',
      });
    }
    if (!table) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter or body field "table" is required',
        errorFa: 'پارامتر نام جدول اجباری است',
      });
    }

    const port = req.body?.port || (req.query.port ? Number(req.query.port) : undefined);
    const user = req.body?.user || (req.query.user ? String(req.query.user) : undefined);
    const password = req.body?.password;

    const result = await getPostgresTableStructure(server, database, schema, table, {
      port,
      user,
      password,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error retrieving table structure',
      errorFa: 'خطای داخلی هنگام دریافت ساختار و متادیتای جدول',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/table-structure', handlePostgresTableStructure);
apiRouter.post('/remote-servers/:id/postgres/table-structure', handlePostgresTableStructure);

// GET & POST /api/remote-servers/:id/postgres/table-data - Retrieve paginated, filtered, sorted table rows safely
const handlePostgresTableData = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Remote server "${id}" not found`,
        errorFa: `سرور ریموت با شناسه "${id}" یافت نشد`,
      });
    }

    const database = (req.body?.database || req.query.database || '').toString().trim();
    const schema = (req.body?.schema || req.query.schema || '').toString().trim();
    const table = (req.body?.table || req.query.table || '').toString().trim();

    if (!database) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter or body field "database" is required',
        errorFa: 'پارامتر نام پایگاه داده اجباری است',
      });
    }
    if (!schema) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter or body field "schema" is required',
        errorFa: 'پارامتر نام اسکیما اجباری است',
      });
    }
    if (!table) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter or body field "table" is required',
        errorFa: 'پارامتر نام جدول اجباری است',
      });
    }

    const page = req.body?.page || (req.query.page ? Number(req.query.page) : 1);
    const pageSize = req.body?.pageSize || (req.query.pageSize ? Number(req.query.pageSize) : 50);
    const sortColumn = req.body?.sortColumn || (req.query.sortColumn ? String(req.query.sortColumn) : undefined);
    const sortDirection = req.body?.sortDirection || (req.query.sortDirection ? String(req.query.sortDirection) : undefined);
    const search = req.body?.search || (req.query.search ? String(req.query.search) : undefined);
    const countExact = req.body?.countExact !== undefined ? Boolean(req.body.countExact) : req.query.countExact === 'true';

    let filters = req.body?.filters;
    if (!filters && req.query.filters) {
      try {
        filters = JSON.parse(String(req.query.filters));
      } catch {}
    }

    const port = req.body?.port || (req.query.port ? Number(req.query.port) : undefined);
    const user = req.body?.user || (req.query.user ? String(req.query.user) : undefined);
    const password = req.body?.password;

    const result = await getPostgresTableData(
      server,
      {
        database,
        schema,
        table,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 50,
        sortColumn: sortColumn ? String(sortColumn) : undefined,
        sortDirection: sortDirection === 'DESC' ? 'DESC' : 'ASC',
        search: search ? String(search) : undefined,
        filters: Array.isArray(filters) ? filters : [],
        countExact,
      },
      {
        port,
        user,
        password,
      }
    );

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal error retrieving table rows',
      errorFa: 'خطای داخلی هنگام دریافت داده‌های جدول',
    });
  }
};

apiRouter.get('/remote-servers/:id/postgres/table-data', handlePostgresTableData);
apiRouter.post('/remote-servers/:id/postgres/table-data', handlePostgresTableData);

// POST /api/remote-servers/:id/postgres/table-row/insert - Insert single row inside safe transaction
const handlePostgresTableRowInsert = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Server with ID "${id}" not found.`,
        errorFa: `سرور با شناسه "${id}" یافت نشد.`,
      });
    }

    const { database, schema, table, values, port, user, password } = req.body;
    if (!database || !schema || !table) {
      return res.status(400).json({
        success: false,
        error: 'database, schema, and table are required.',
        errorFa: 'نام دیتابیس، اسکیما و جدول الزامی است.',
      });
    }

    const result = await insertPostgresTableRow(server, {
      database,
      schema,
      table,
      values,
      port,
      user,
      password,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      operation: 'insert',
      affectedRows: 0,
      error: err.message || 'Internal error inserting table row',
      errorFa: 'خطای داخلی هنگام درج سطر در جدول',
    });
  }
};
apiRouter.post('/remote-servers/:id/postgres/table-row/insert', handlePostgresTableRowInsert);

// POST /api/remote-servers/:id/postgres/table-row/update - Update identified single row inside safe transaction
const handlePostgresTableRowUpdate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Server with ID "${id}" not found.`,
        errorFa: `سرور با شناسه "${id}" یافت نشد.`,
      });
    }

    const { database, schema, table, primaryKeyValues, ctid, originalRow, updatedValues, port, user, password } = req.body;
    if (!database || !schema || !table) {
      return res.status(400).json({
        success: false,
        error: 'database, schema, and table are required.',
        errorFa: 'نام دیتابیس، اسکیما و جدول الزامی است.',
      });
    }

    const result = await updatePostgresTableRow(server, {
      database,
      schema,
      table,
      primaryKeyValues,
      ctid,
      originalRow,
      updatedValues,
      port,
      user,
      password,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      operation: 'update',
      affectedRows: 0,
      error: err.message || 'Internal error updating table row',
      errorFa: 'خطای داخلی هنگام به‌روزرسانی سطر جدول',
    });
  }
};
apiRouter.post('/remote-servers/:id/postgres/table-row/update', handlePostgresTableRowUpdate);

// POST /api/remote-servers/:id/postgres/table-row/delete - Delete identified single row inside safe transaction
const handlePostgresTableRowDelete = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: `Server with ID "${id}" not found.`,
        errorFa: `سرور با شناسه "${id}" یافت نشد.`,
      });
    }

    const { database, schema, table, primaryKeyValues, ctid, originalRow, port, user, password } = req.body;
    if (!database || !schema || !table) {
      return res.status(400).json({
        success: false,
        error: 'database, schema, and table are required.',
        errorFa: 'نام دیتابیس، اسکیما و جدول الزامی است.',
      });
    }

    const result = await deletePostgresTableRow(server, {
      database,
      schema,
      table,
      primaryKeyValues,
      ctid,
      originalRow,
      port,
      user,
      password,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      operation: 'delete',
      affectedRows: 0,
      error: err.message || 'Internal error deleting table row',
      errorFa: 'خطای داخلی هنگام حذف سطر جدول',
    });
  }
};
apiRouter.post('/remote-servers/:id/postgres/table-row/delete', handlePostgresTableRowDelete);

// POST /api/remote-servers/:id/postgres/query - Phase 8: Execute SQL query
const handlePostgresQuery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { database, schema, query, maxRows, explain, confirmedDestructive, auditNotes, port, user, password } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: { message: 'Remote server not found.' },
        errorFa: 'سرور ریموت مورد نظر یافت نشد.',
      });
    }

    if (!database || !database.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Database name is required.' },
        errorFa: 'انتخاب پایگاه داده اجباری است.',
      });
    }

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Query cannot be empty.' },
        errorFa: 'متن کوئری نمی‌تواند خالی باشد.',
      });
    }

    const result = await executePostgresQuery(server, {
      database,
      schema,
      query,
      maxRows: maxRows ? Number(maxRows) : 1000,
      explain: Boolean(explain),
      confirmedDestructive: Boolean(confirmedDestructive),
      auditNotes: auditNotes ? String(auditNotes).trim() : undefined,
      port: port ? Number(port) : undefined,
      user,
      password,
    });

    // Phase 9: Server-side audit logging for administrative and destructive operations
    if (result.safetyReport && (result.safetyReport.isDestructive || result.safetyReport.overallType === 'administrative' || result.safetyReport.overallType === 'ddl')) {
      const isDestructive = result.safetyReport.isDestructive;
      const actionName = isDestructive
        ? 'PostgreSQL Destructive Query Executed'
        : result.safetyReport.overallType === 'administrative'
        ? 'PostgreSQL Admin Command Executed'
        : 'PostgreSQL DDL Migration Executed';

      await addAuditLog({
        userName: (req.headers['x-user-name'] as string) || user || 'Administrator',
        action: actionName,
        category: isDestructive ? 'security' : 'operation',
        target: `${server.name} (${server.ip}) / DB: ${database}`,
        status: result.success ? 'success' : 'warning',
        details: `[${result.safetyReport.overallType.toUpperCase()} | Risk: ${result.safetyReport.overallRiskLevel}] ${
          isDestructive ? 'Operator confirmed execution. ' : ''
        }Statements: ${result.safetyReport.statementCount}. Query: ${query.trim().slice(0, 160)}${query.trim().length > 160 ? '...' : ''}${
          auditNotes ? ` | Reason: ${auditNotes}` : ''
        }`,
        ipAddress: getClientIp(req),
      }).catch(() => {});
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message || 'Internal server error executing SQL query' },
      errorFa: 'خطای داخلی هنگام اجرای کوئری SQL',
    });
  }
};
apiRouter.post('/remote-servers/:id/postgres/query', handlePostgresQuery);

// POST /api/remote-servers/:id/postgres/query/analyze - Phase 9 SQL Safety Analysis Endpoint
apiRouter.post('/remote-servers/:id/postgres/query/analyze', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query text is required for safety analysis',
        errorFa: 'متن کوئری برای ارزیابی ایمنی الزامی است',
      });
    }

    const report = analyzePostgresSqlSafety(query);
    return res.json({ success: true, report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});



// ==========================================
// MySQL / MariaDB Remote Database Endpoints
// ==========================================

// POST /api/remote-servers/test-mysql-connection - Test MySQL connection standalone for new server registration
apiRouter.post('/remote-servers/test-mysql-connection', async (req: Request, res: Response) => {
  try {
    const { host, port, user, database, password } = req.body || {};
    const dummyServer: any = {
      ip: String(host || '').trim(),
      mysql_port: port ? Number(port) : 3306,
      mysql_user: user ? String(user).trim() : 'root',
      mysql_database: database ? String(database).trim() : 'mysql',
      mysql_password: password || '',
    };
    const result = await testMysqlConnection(dummyServer, {
      port: port ? Number(port) : 3306,
      user: user || 'root',
      database: database || 'mysql',
      password: password || '',
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      status: 'unknown_error',
      message: err.message || 'Internal error while testing MySQL connection',
      messageFa: 'خطای داخلی هنگام تست ارتباط با پایگاه‌داده MySQL',
    });
  }
});

// POST /api/remote-servers/:id/mysql/test-connection - Test MySQL connection on existing server
apiRouter.post('/remote-servers/:id/mysql/test-connection', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({
        success: false,
        status: 'connection_failed',
        message: 'Server not found in fleet',
        messageFa: 'سرور در فهرست ناوگان یافت نشد',
      });
    }
    const { port, user, database, password } = req.body || {};
    const result = await testMysqlConnection(server, {
      port: port !== undefined && port !== '' ? Number(port) : undefined,
      user: user || undefined,
      database: database || undefined,
      password: password || undefined,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      status: 'unknown_error',
      message: err.message,
      messageFa: 'خطای داخلی سرور هنگام آزمایش ارتباط MySQL',
    });
  }
});

// GET /api/remote-servers/:id/mysql/overview - Enumerate MySQL status and overview
apiRouter.get('/remote-servers/:id/mysql/overview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const overview = await getMysqlOverview(server);
    return res.json({ success: true, overview });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id/mysql/databases - List all databases in MySQL
apiRouter.get('/remote-servers/:id/mysql/databases', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const databases = await getMysqlDatabases(server);
    return res.json({ success: true, databases });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id/mysql/databases/:databaseName - Get database details and tables list
apiRouter.get('/remote-servers/:id/mysql/databases/:databaseName', async (req: Request, res: Response) => {
  try {
    const { id, databaseName } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const details = await getMysqlDatabaseDetails(server, databaseName);
    return res.json({ success: true, details });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id/mysql/databases/:databaseName/objects - Get full MySQL schema objects explorer payload
apiRouter.get('/remote-servers/:id/mysql/databases/:databaseName/objects', async (req: Request, res: Response) => {
  try {
    const { id, databaseName } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const objects = await getMysqlDatabaseObjects(server, databaseName);
    return res.json({ success: true, objects });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id/mysql/databases/:databaseName/tables/:tableName/structure - Get table structure, columns, keys & indexes
apiRouter.get('/remote-servers/:id/mysql/databases/:databaseName/tables/:tableName/structure', async (req: Request, res: Response) => {
  try {
    const { id, databaseName, tableName } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const structure = await getMysqlTableStructure(server, databaseName, tableName);
    return res.json({ success: true, structure });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/mysql/databases/:databaseName/tables/:tableName/data - Query live table data with pagination & filters
apiRouter.post('/remote-servers/:id/mysql/databases/:databaseName/tables/:tableName/data', async (req: Request, res: Response) => {
  try {
    const { id, databaseName, tableName } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const data = await getMysqlTableData(server, {
      ...req.body,
      database: databaseName,
      table: tableName,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/mysql/table-row/insert - Insert a row into a MySQL table
apiRouter.post('/remote-servers/:id/mysql/table-row/insert', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found', errorFa: 'سرور یافت نشد' });
    }
    const { database, table, values, port, user, password } = req.body || {};
    if (!database || !table) {
      return res.status(400).json({ success: false, error: 'database and table are required', errorFa: 'نام دیتابیس و جدول الزامی است' });
    }
    const result = await insertMysqlTableRow(server, { database, table, values, port, user, password });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, operation: 'insert', affectedRows: 0, error: err.message, errorFa: 'خطای سرور در درج سطر' });
  }
});

// POST /api/remote-servers/:id/mysql/table-row/update - Update a single identified row with LIMIT 1
apiRouter.post('/remote-servers/:id/mysql/table-row/update', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found', errorFa: 'سرور یافت نشد' });
    }
    const { database, table, primaryKeyValues, originalRow, updatedValues, port, user, password } = req.body || {};
    if (!database || !table) {
      return res.status(400).json({ success: false, error: 'database and table are required', errorFa: 'نام دیتابیس و جدول الزامی است' });
    }
    const result = await updateMysqlTableRow(server, { database, table, primaryKeyValues, originalRow, updatedValues, port, user, password });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, operation: 'update', affectedRows: 0, error: err.message, errorFa: 'خطای سرور در به‌روزرسانی سطر' });
  }
});

// POST /api/remote-servers/:id/mysql/table-row/delete - Delete a single identified row with LIMIT 1
apiRouter.post('/remote-servers/:id/mysql/table-row/delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found', errorFa: 'سرور یافت نشد' });
    }
    const { database, table, primaryKeyValues, originalRow, port, user, password } = req.body || {};
    if (!database || !table) {
      return res.status(400).json({ success: false, error: 'database and table are required', errorFa: 'نام دیتابیس و جدول الزامی است' });
    }
    const result = await deleteMysqlTableRow(server, { database, table, primaryKeyValues, originalRow, port, user, password });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, operation: 'delete', affectedRows: 0, error: err.message, errorFa: 'خطای سرور در حذف سطر' });
  }
});

// GET /api/remote-servers/:id/mysql/users - List user accounts in MySQL
apiRouter.get('/remote-servers/:id/mysql/users', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const users = await getMysqlUsers(server);
    return res.json({ success: true, users });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/mysql/query - Run SQL query on MySQL with server-side safety checks
apiRouter.post('/remote-servers/:id/mysql/query', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const { query, database, confirmedDestructive, auditNotes, maxRows } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }
    const result = await executeMysqlQuery(server, query, database, {
      confirmedDestructive: Boolean(confirmedDestructive),
      auditNotes: typeof auditNotes === 'string' ? auditNotes.trim() : undefined,
      maxRows: typeof maxRows === 'number' ? maxRows : undefined,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/mysql/query/safety-check - Pre-flight server-side safety analysis for MySQL query
apiRouter.post('/remote-servers/:id/mysql/query/safety-check', async (req: Request, res: Response) => {
  try {
    const { query } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'Query string is required' });
    }
    const safetyReport = analyzeMysqlSqlSafety(query);
    return res.json({ success: true, safetyReport });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id/mysql/processlist - List threads/connections in MySQL
apiRouter.get('/remote-servers/:id/mysql/processlist', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const processes = await getMysqlProcesslist(server);
    return res.json({ success: true, processes });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/mysql/kill-process - Kill connection by ID
apiRouter.post('/remote-servers/:id/mysql/kill-process', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const { processId } = req.body || {};
    if (!processId) {
      return res.status(400).json({ success: false, error: 'processId is required' });
    }
    const result = await killMysqlProcess(server, Number(processId));
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/remote-servers/:id/mysql/variables - Enumerate system variables
apiRouter.get('/remote-servers/:id/mysql/variables', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const filter = typeof req.query.filter === 'string' ? req.query.filter : undefined;
    const variables = await getMysqlVariables(server, filter);
    return res.json({ success: true, variables });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/tags - Update tags only
apiRouter.post('/remote-servers/:id/tags', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;
    if (!Array.isArray(tags)) {
      return res.status(400).json({ success: false, error: 'Tags must be an array of strings' });
    }
    const updated = await updateRemoteServerTags(id, tags);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    res.json({ success: true, server: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/remote-servers/:id/test-connection - Test TCP port reachability
apiRouter.post('/remote-servers/:id/test-connection', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const targetPort = server.os_type === 'linux' ? (server.ssh_port || 22) : (server.win_port || 3389);
    const targetHost = server.ip;

    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(3500);

    let resolved = false;

    socket.connect(targetPort, targetHost, async () => {
      if (resolved) return;
      resolved = true;
      const latency = Date.now() - start;
      socket.destroy();

      const hardwareUpdates: { cpu_cores?: number; ram_gb?: number; disk_gb?: number; uptime_str?: string } = {};

      if (server.os_type === 'linux' && (server.ssh_password || server.ssh_key_path)) {
        try {
          const hwScript = `export LC_ALL=C
echo "---HW---"
CORES=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)
echo "CORES=$CORES"
RAM_GB=$(awk '/MemTotal/{printf "%.1f\\n", $2/1048576}' /proc/meminfo 2>/dev/null || echo "")
echo "RAM_GB=$RAM_GB"

# 1. Total real disk capacity from whole-disk block devices (no partitions, no docker duplicates)
DISK_GB=""
if command -v lsblk >/dev/null 2>&1; then
  DISK_GB=$(lsblk -b -d -n -o TYPE,SIZE 2>/dev/null | awk '$1=="disk" && $2>0 {sum+=$2} END {if(sum>0) print int((sum+536870912)/1073741824)}')
fi

# 2. Check /sys/block for physical/virtual disks
if [ -z "$DISK_GB" ] || [ "$DISK_GB" -le 0 ] 2>/dev/null; then
  DISK_BYTES=0
  for b in /sys/block/*; do
    devname=$(basename "$b")
    case "$devname" in
      loop*|ram*|sr*|dm-*) continue ;;
    esac
    if [ -f "$b/size" ]; then
      s=$(cat "$b/size" 2>/dev/null || echo 0)
      if [ "$s" -gt 0 ] 2>/dev/null; then
        DISK_BYTES=$((DISK_BYTES + s * 512))
      fi
    fi
  done
  if [ "$DISK_BYTES" -gt 0 ]; then
    DISK_GB=$(( (DISK_BYTES + 536870912) / 1073741824 ))
  fi
fi

# 3. Unique physical mounted filesystems from df (excluding docker/container duplicates)
if [ -z "$DISK_GB" ] || [ "$DISK_GB" -le 0 ] 2>/dev/null; then
  DISK_GB=$(df -k -P 2>/dev/null | awk '$1 ~ /^\\/dev\\// && $6 !~ /\\/(docker|containerd|overlay2|kubelet)/ { if(!seen[$1]++) sum+=$2 } END {if(sum>0) print int((sum+524288)/1048576)}')
fi

# 4. Fallback to root mount
if [ -z "$DISK_GB" ] || [ "$DISK_GB" -le 0 ] 2>/dev/null; then
  DISK_GB=$(df -k -P / 2>/dev/null | awk 'NR==2 {print int(($2+524288)/1048576)}')
fi

echo "DISK_GB=$DISK_GB"
UPTIME=$(uptime -p 2>/dev/null || uptime 2>/dev/null || echo "")
echo "UPTIME=$UPTIME"
echo "---END---"`;
          const rawHw = await runAdaptiveSshCommand(server, hwScript, undefined, 6000);
          if (rawHw && rawHw.includes('---HW---')) {
            const hwPart = rawHw.split('---HW---')[1]?.split('---END---')[0]?.trim();
            if (hwPart) {
              const hwLines = hwPart.split('\n').map((l: string) => l.trim());
              for (const line of hwLines) {
                if (line.startsWith('CORES=')) {
                  const val = parseInt(line.replace('CORES=', '').trim(), 10);
                  if (!isNaN(val) && val > 0) hardwareUpdates.cpu_cores = val;
                } else if (line.startsWith('RAM_GB=')) {
                  const val = parseFloat(line.replace('RAM_GB=', '').trim());
                  if (!isNaN(val) && val > 0) hardwareUpdates.ram_gb = Math.round(val * 10) / 10;
                } else if (line.startsWith('DISK_GB=')) {
                  const val = parseInt(line.replace('DISK_GB=', '').trim(), 10);
                  if (!isNaN(val) && val > 0) hardwareUpdates.disk_gb = val;
                } else if (line.startsWith('UPTIME=')) {
                  const val = line.replace('UPTIME=', '').trim();
                  if (val) hardwareUpdates.uptime_str = val;
                }
              }
            }
          }
        } catch {
          // Keep existing registered specs if SSH probe times out
        }
      }

      let updatedServer = server;
      try {
        updatedServer = await updateRemoteServer(server.id, {
          status: 'online',
          ...hardwareUpdates,
        });
      } catch {
        updatedServer = { ...server, status: 'online', ...hardwareUpdates };
      }

      res.json({
        success: true,
        reachable: true,
        host: targetHost,
        port: targetPort,
        latency_ms: latency,
        protocol: server.os_type === 'linux' ? 'SSH' : (server.win_protocol?.toUpperCase() || 'RDP'),
        message: `Connection successful to ${targetHost}:${targetPort} in ${latency}ms`,
        server: updatedServer,
        hardware: {
          cpu_cores: updatedServer.cpu_cores,
          ram_gb: updatedServer.ram_gb,
          disk_gb: updatedServer.disk_gb,
          uptime_str: updatedServer.uptime_str,
        },
      });
    });

    socket.on('error', (err: any) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      const latency = Date.now() - start;
      updateRemoteServer(server.id, { status: 'offline' }).catch(() => {});
      res.json({
        success: true,
        reachable: false,
        host: targetHost,
        port: targetPort,
        latency_ms: latency,
        error: err.message,
        message: `Port unreachable or connection refused: ${err.message}`,
        server: { ...server, status: 'offline' },
        hardware: {
          cpu_cores: server.cpu_cores,
          ram_gb: server.ram_gb,
          disk_gb: server.disk_gb,
          uptime_str: server.uptime_str,
        },
      });
    });

    socket.on('timeout', () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      updateRemoteServer(server.id, { status: 'offline' }).catch(() => {});
      res.json({
        success: true,
        reachable: false,
        host: targetHost,
        port: targetPort,
        latency_ms: 3500,
        error: 'Connection timeout',
        message: `Connection timed out after 3500ms to ${targetHost}:${targetPort}`,
        server: { ...server, status: 'offline' },
        hardware: {
          cpu_cores: server.cpu_cores,
          ram_gb: server.ram_gb,
          disk_gb: server.disk_gb,
          uptime_str: server.uptime_str,
        },
      });
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET & POST /api/remote-servers/:id/monitor - Real-time Linux Server Resource & Telemetry Monitoring
const handleLinuxServerMonitor = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Live metrics are currently designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;

    // Check if password is required but missing
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const metrics = await executeLinuxTelemetrySSH(server, ephemeralPassword);
    
    // Automatically persist real discovered hardware specs to database
    let disk_gb = metrics.totalDiskGb || server.disk_gb;
    const storageOverview = (metrics as any).storageOverview;
    if (!disk_gb && storageOverview?.totalStorageBytes && storageOverview.totalStorageBytes > 0) {
      disk_gb = Math.round(storageOverview.totalStorageBytes / (1024 * 1024 * 1024));
    } else if (!disk_gb && metrics.disks && metrics.disks.length > 0) {
      const rootDisk = metrics.disks.find((d: any) => d.mount === '/') || metrics.disks[0];
      if (rootDisk && rootDisk.sizeBytes > 0) {
        disk_gb = Math.round(rootDisk.sizeBytes / (1024 * 1024 * 1024));
      }
    }
    const ram_gb = metrics.memory?.totalBytes > 0 
      ? Math.round((metrics.memory.totalBytes / (1024 * 1024 * 1024)) * 10) / 10 
      : server.ram_gb;

    updateRemoteServer(server.id, { 
      status: 'online',
      cpu_cores: metrics.cpu?.cores || server.cpu_cores,
      ram_gb,
      disk_gb,
      uptime_str: metrics.uptimeFormatted || (metrics as any).uptime?.human || server.uptime_str,
    }).catch(() => {});

    return res.json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    console.error(`[LinuxMonitor API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to connect or collect live telemetry from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/monitor', handleLinuxServerMonitor);
apiRouter.post('/remote-servers/:id/monitor', handleLinuxServerMonitor);

// GET & POST /api/remote-servers/:id/services - Fetch real-time system services from remote Linux server
const handleLinuxServerServices = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Service management is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;

    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const services = await fetchLinuxServicesSSH(server, ephemeralPassword);
    
    // Check if any services have watchdog rules configured on the remote host
    try {
      const watchdogs = await fetchLinuxServiceWatchdogsSSH(server, ephemeralPassword);
      if (Array.isArray(watchdogs) && watchdogs.length > 0) {
        const wdMap = new Map<string, typeof watchdogs[0]>();
        for (const wd of watchdogs) {
          wdMap.set(wd.serviceName.toLowerCase(), wd);
          // Also match without .service extension
          const noExt = wd.serviceName.toLowerCase().replace(/\.service$/, '');
          wdMap.set(noExt, wd);
        }

        for (const s of services) {
          const sLower = s.name.toLowerCase();
          const sNoExt = sLower.replace(/\.service$/, '');
          const match = wdMap.get(sLower) || wdMap.get(sNoExt);
          if (match) {
            s.hasWatchdog = true;
            s.watchdogStatus = match.status;
          }
        }
      }
    } catch {
      // Non-fatal: if watchdog query times out, return raw services
    }

    return res.json({
      success: true,
      services,
    });
  } catch (err: any) {
    console.error(`[LinuxServices API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch services from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/services', handleLinuxServerServices);
apiRouter.post('/remote-servers/:id/services', handleLinuxServerServices);

// ==============================================================================
// LINUX SERVICE WATCHDOG & AUTO-RECOVERY API ROUTES
// ==============================================================================

// GET /api/remote-servers/:id/service-watchdogs - List all active watchdog rules from target host
apiRouter.get('/remote-servers/:id/service-watchdogs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = (req.query?.password || req.headers['x-server-password']) as string | undefined;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const watchdogs = await fetchLinuxServiceWatchdogsSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      watchdogs,
    });
  } catch (err: any) {
    console.error(`[Watchdogs API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch service watchdogs from remote server',
    });
  }
});

// POST /api/remote-servers/:id/service-watchdogs - Create or update a watchdog rule on target host
apiRouter.post('/remote-servers/:id/service-watchdogs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rule, password } = req.body;

    if (!rule || !rule.serviceName) {
      return res.status(400).json({ success: false, error: 'Watchdog rule with serviceName is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await saveLinuxServiceWatchdogSSH(server, rule, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: 'Watchdog Policy Configured',
      category: 'operation',
      target: `${server.name || server.ip} (${rule.serviceName})`,
      status: result.success ? 'success' : 'error',
      details: `Watchdog configured: restarts=${rule.maxRestartAttempts}, reboot=${rule.rebootOnPersistentFailure ? 'yes' : 'no'}, cooldown=${rule.rebootCooldownMinutes}m`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Watchdog Save API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to save watchdog rule on remote server',
    });
  }
});

// DELETE /api/remote-servers/:id/service-watchdogs/:serviceName - Remove watchdog rule and stop service
apiRouter.delete('/remote-servers/:id/service-watchdogs/:serviceName', async (req: Request, res: Response) => {
  try {
    const { id, serviceName } = req.params;
    const password = (req.body?.password || req.query?.password) as string | undefined;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deleteLinuxServiceWatchdogSSH(server, serviceName, password);

    await addAuditLog({
      userName: 'Administrator',
      action: 'Watchdog Policy Removed',
      category: 'operation',
      target: `${server.name || server.ip} (${serviceName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Watchdog Delete API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete watchdog rule from remote server',
    });
  }
});

// POST /api/remote-servers/:id/service-watchdogs/:serviceName/test - Run diagnostic test check
apiRouter.post('/remote-servers/:id/service-watchdogs/:serviceName/test', async (req: Request, res: Response) => {
  try {
    const { id, serviceName } = req.params;
    const { password } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await testLinuxServiceWatchdogCheckSSH(server, serviceName, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[Watchdog Test API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to test watchdog rule on remote server',
    });
  }
});

// POST /api/remote-servers/:id/service-watchdogs/:serviceName/reset-loop - Reset anti-loop lock
apiRouter.post('/remote-servers/:id/service-watchdogs/:serviceName/reset-loop', async (req: Request, res: Response) => {
  try {
    const { id, serviceName } = req.params;
    const { password } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await resetLinuxServiceWatchdogAntiLoopSSH(server, serviceName, password);

    await addAuditLog({
      userName: 'Administrator',
      action: 'Watchdog Anti-Loop Lock Reset',
      category: 'operation',
      target: `${server.name || server.ip} (${serviceName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Watchdog Reset Loop Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to reset anti-loop lock on remote server',
    });
  }
});

// GET /api/remote-servers/:id/service-watchdogs/logs - Fetch live watchdog audit logs
apiRouter.get('/remote-servers/:id/service-watchdog-logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lines = Number(req.query.lines) || 100;
    const password = (req.query?.password || req.headers['x-server-password']) as string | undefined;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await fetchLinuxWatchdogLogsSSH(server, lines, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[Watchdog Logs API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch watchdog logs from remote server',
    });
  }
});

// GET /api/remote-servers/:id/directory-policies - List all directory lifecycle policies
apiRouter.get('/remote-servers/:id/directory-policies', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const password = (req.query?.password || req.headers['x-server-password']) as string | undefined;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const policies = await fetchLinuxDirectoryPoliciesSSH(server, password);
    return res.json({ success: true, policies });
  } catch (err: any) {
    console.error(`[Directory Policies API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch directory policies from remote server',
    });
  }
});

// POST /api/remote-servers/:id/directory-policies - Save or update directory lifecycle policy
apiRouter.post('/remote-servers/:id/directory-policies', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rule, password } = req.body;

    if (!rule || !rule.targetPath) {
      return res.status(400).json({ success: false, error: 'Valid rule with targetPath is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await saveLinuxDirectoryPolicySSH(server, rule, password);

    await addAuditLog({
      userName: 'Administrator',
      action: 'Directory Lifecycle Policy Configured',
      category: 'operation',
      target: `${server.name || server.ip} (${rule.name || rule.targetPath})`,
      status: result.success ? 'success' : 'error',
      details: `Action: ${rule.actionType}, Schedule: ${rule.scheduleCron}, Result: ${result.message}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Directory Policy Save Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to save directory policy on remote server',
    });
  }
});

// DELETE /api/remote-servers/:id/directory-policies/:ruleId - Delete directory lifecycle policy
apiRouter.delete('/remote-servers/:id/directory-policies/:ruleId', async (req: Request, res: Response) => {
  try {
    const { id, ruleId } = req.params;
    const password = (req.body?.password || req.query?.password || req.headers['x-server-password']) as string | undefined;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deleteLinuxDirectoryPolicySSH(server, ruleId, password);

    await addAuditLog({
      userName: 'Administrator',
      action: 'Directory Lifecycle Policy Deleted',
      category: 'operation',
      target: `${server.name || server.ip} (Rule: ${ruleId})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Directory Policy Delete Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete directory policy on remote server',
    });
  }
});

// POST /api/remote-servers/:id/directory-policies/:ruleId/run-now - On-demand immediate execution
apiRouter.post('/remote-servers/:id/directory-policies/:ruleId/run-now', async (req: Request, res: Response) => {
  try {
    const { id, ruleId } = req.params;
    const { password } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await runLinuxDirectoryPolicyNowSSH(server, ruleId, password);

    await addAuditLog({
      userName: 'Administrator',
      action: 'Directory Policy Manual Trigger',
      category: 'operation',
      target: `${server.name || server.ip} (Rule: ${ruleId})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Directory Policy Run-Now Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to trigger directory policy execution',
    });
  }
});

// GET /api/remote-servers/:id/directory-policy-logs - Fetch live directory policy audit logs
apiRouter.get('/remote-servers/:id/directory-policy-logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lines = Number(req.query.lines) || 100;
    const password = (req.query?.password || req.headers['x-server-password']) as string | undefined;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await fetchLinuxDirectoryPolicyLogsSSH(server, lines, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[Directory Policy Logs Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch directory policy logs from remote server',
    });
  }
});

// POST /api/remote-servers/:id/service-action - Start, Stop, Restart, Enable, Disable Linux Service
apiRouter.post('/remote-servers/:id/service-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { serviceName, action, password } = req.body;

    if (!serviceName || !action) {
      return res.status(400).json({ success: false, error: 'serviceName and action are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxServiceControl(server, serviceName, action, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Linux Service ${action.toUpperCase()}`,
      category: 'operation',
      target: `${server.name || server.ip} (${serviceName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxServiceAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to control remote service',
    });
  }
});

// POST /api/remote-servers/:id/nginx-discovery - Discovers real distribution-aware Nginx installation topology
apiRouter.post('/remote-servers/:id/nginx-discovery', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, targetConfPath, targetBinaryPath } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const discovery = await discoverNginxInstallation(server, password, { targetConfPath, targetBinaryPath });
    return res.json({ success: true, discovery });
  } catch (err: any) {
    console.error(`[NginxDiscovery API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Nginx installation topology',
    });
  }
});

// POST /api/remote-servers/:id/apache-discovery - Discovers real distribution-aware Apache installation topology
apiRouter.post('/remote-servers/:id/apache-discovery', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, targetConfPath, targetBinaryPath } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const discovery = await discoverApacheInstallation(server, password, { targetConfPath, targetBinaryPath });
    return res.json({ success: true, discovery });
  } catch (err: any) {
    console.error(`[ApacheDiscovery API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Apache installation topology',
    });
  }
});

// POST /api/remote-servers/:id/apache-config-topology - Scans Include tree and builds Apache configuration topology graph
apiRouter.post('/remote-servers/:id/apache-config-topology', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, confPath, serverRoot } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const topology = await discoverApacheConfigTopology(server, password, confPath, serverRoot);
    return res.json({ success: true, topology });
  } catch (err: any) {
    console.error(`[ApacheConfigTopology API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to scan Apache configuration topology tree',
    });
  }
});

// POST /api/remote-servers/:id/apache-vhosts - Discovers all Apache VirtualHosts
apiRouter.post('/remote-servers/:id/apache-vhosts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const summary = await discoverApacheVirtualHosts(server, password);
    return res.json({ success: true, summary });
  } catch (err: any) {
    console.error(`[ApacheVHosts API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Apache VirtualHosts',
    });
  }
});

// POST /api/remote-servers/:id/apache-vhost-toggle - Enables or disables an Apache VirtualHost
apiRouter.post('/remote-servers/:id/apache-vhost-toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, siteName, enable, filePath } = req.body || {};

    if (!siteName) {
      return res.status(400).json({ success: false, error: 'siteName is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await toggleApacheVirtualHost(server, siteName, Boolean(enable), filePath, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheVHostToggle API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to toggle Apache VirtualHost status',
    });
  }
});

// POST /api/remote-servers/:id/apache-vhost-create - Creates and deploys a new Apache VirtualHost
apiRouter.post('/remote-servers/:id/apache-vhost-create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, params } = req.body || {};

    if (!params || !params.serverName || !params.siteName) {
      return res.status(400).json({ success: false, error: 'serverName and siteName are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createApacheVirtualHost(server, params, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheVHostCreate API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create Apache VirtualHost',
    });
  }
});

// POST /api/remote-servers/:id/apache-vhost-delete - Deletes an Apache VirtualHost configuration safely
apiRouter.post('/remote-servers/:id/apache-vhost-delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, siteName, filePath } = req.body || {};

    if (!siteName || !filePath) {
      return res.status(400).json({ success: false, error: 'siteName and filePath are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deleteApacheVirtualHost(server, siteName, filePath, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheVHostDelete API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete Apache VirtualHost',
    });
  }
});

// POST /api/remote-servers/:id/apache-proxy - Discovers all Apache reverse proxy routes, balancers & modules
apiRouter.post('/remote-servers/:id/apache-proxy', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const summary = await discoverApacheProxyArchitecture(server, password);
    return res.json({ success: true, summary });
  } catch (err: any) {
    console.error(`[ApacheProxy API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Apache Reverse Proxy architecture',
    });
  }
});

// POST /api/remote-servers/:id/apache-proxy-modules - Enables required Apache proxy modules
apiRouter.post('/remote-servers/:id/apache-proxy-modules', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, modules } = req.body || {};

    if (!modules || !Array.isArray(modules) || modules.length === 0) {
      return res.status(400).json({ success: false, error: 'modules array is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await enableApacheProxyModules(server, modules, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheProxyModules API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to enable Apache proxy modules',
    });
  }
});

// POST /api/remote-servers/:id/apache-proxy-route - Creates and deploys a new Apache reverse proxy route or balancer
apiRouter.post('/remote-servers/:id/apache-proxy-route', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, params } = req.body || {};

    if (!params || !params.path || (!params.backendUrl && !params.balancerName)) {
      return res.status(400).json({
        success: false,
        error: 'path and backendUrl (or balancerName) are required',
      });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createApacheProxyRoute(server, params, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheProxyRouteCreate API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create Apache reverse proxy route',
    });
  }
});

// POST /api/remote-servers/:id/apache-proxy-delete - Safely removes a reverse proxy route
apiRouter.post('/remote-servers/:id/apache-proxy-delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, routeId, filePath } = req.body || {};

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'filePath is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deleteApacheProxyRoute(server, routeId, filePath, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheProxyDelete API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete Apache reverse proxy route',
    });
  }
});

// POST /api/remote-servers/:id/apache-modules - Discovers all Apache modules and MPM status
apiRouter.post('/remote-servers/:id/apache-modules', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const summary = await discoverApacheModulesArchitecture(server, password);
    return res.json({ success: true, summary });
  } catch (err: any) {
    console.error(`[ApacheModules API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Apache modules and MPM architecture',
    });
  }
});

// POST /api/remote-servers/:id/apache-module-toggle - Enables or disables an Apache module
apiRouter.post('/remote-servers/:id/apache-module-toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, moduleName, action } = req.body || {};

    if (!moduleName || !action || !['enable', 'disable'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'moduleName and action (enable|disable) are required',
      });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await toggleApacheModule(server, moduleName, action, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheModuleToggle API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to toggle Apache module',
    });
  }
});

// POST /api/remote-servers/:id/apache-mpm-switch - Safely switches active Apache MPM
apiRouter.post('/remote-servers/:id/apache-mpm-switch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, targetMpm } = req.body || {};

    if (!targetMpm) {
      return res.status(400).json({
        success: false,
        error: 'targetMpm is required (event|worker|prefork)',
      });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await switchApacheMpm(server, targetMpm, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheMpmSwitch API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to switch Apache MPM',
    });
  }
});

// POST /api/remote-servers/:id/apache-certificates - Discovers and inspects all SSL/TLS certificates
apiRouter.post('/remote-servers/:id/apache-certificates', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const sslData = await discoverApacheCertificates(server, password);
    return res.json({ success: true, sslData });
  } catch (err: any) {
    console.error(`[ApacheCertificates API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover and inspect Apache certificates',
    });
  }
});

// POST /api/remote-servers/:id/apache-ssl-generate-selfsigned - Generates a self-signed certificate on remote server
apiRouter.post('/remote-servers/:id/apache-ssl-generate-selfsigned', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, domain, days, country, organization, vhostId } = req.body || {};

    if (!domain) {
      return res.status(400).json({ success: false, error: 'domain is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await generateApacheSelfSignedCertificate(
      server,
      { domain, days, country, organization, vhostId },
      password
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheSslGenerateSelfSigned API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to generate self-signed SSL certificate',
    });
  }
});

// POST /api/remote-servers/:id/apache-ssl-attach - Attaches SSL certificate to a VirtualHost
apiRouter.post('/remote-servers/:id/apache-ssl-attach', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, vhostId, certPath, keyPath, chainPath, enableHttp2, enableHsts } = req.body || {};

    if (!vhostId || !certPath || !keyPath) {
      return res.status(400).json({
        success: false,
        error: 'vhostId, certPath, and keyPath are required',
      });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await attachApacheSslCertificate(
      server,
      { vhostId, certPath, keyPath, chainPath, enableHttp2, enableHsts },
      password
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheSslAttach API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to attach SSL certificate to VirtualHost',
    });
  }
});

// POST /api/remote-servers/:id/apache-ssl-modern-profile - Enables Mozilla Intermediate modern SSL profile
apiRouter.post('/remote-servers/:id/apache-ssl-modern-profile', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, vhostId } = req.body || {};

    if (!vhostId) {
      return res.status(400).json({ success: false, error: 'vhostId is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await enableApacheModernSslProfile(server, vhostId, password);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ApacheSslModernProfile API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to apply modern SSL profile',
    });
  }
});

// POST /api/remote-servers/:id/apache-logs-discovery - Discovers all active Apache access and error log files
apiRouter.post('/remote-servers/:id/apache-logs-discovery', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const logsSummary = await discoverApacheLogFiles(server, password);
    return res.json({ success: true, logs: logsSummary });
  } catch (err: any) {
    console.error(`[ApacheLogsDiscovery API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Apache log files',
    });
  }
});

// POST /api/remote-servers/:id/apache-logs-stream - Streams, parses, filters, and computes live statistics for Apache logs
apiRouter.post('/remote-servers/:id/apache-logs-stream', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, filePath, lines, search, statusCode, level } = req.body || {};

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'File path parameter is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const streamData = await streamApacheLogFile(
      server,
      {
        filePath,
        lines: lines ? Number(lines) : 100,
        search: typeof search === 'string' ? search : '',
        statusCode: typeof statusCode === 'string' ? statusCode : '',
        level: typeof level === 'string' ? level : '',
      },
      password
    );

    return res.json({ success: true, stream: streamData });
  } catch (err: any) {
    console.error(`[ApacheLogsStream API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to stream Apache log file',
    });
  }
});

// POST /api/remote-servers/:id/apache-config-read - Safely reads an Apache configuration file
apiRouter.post('/remote-servers/:id/apache-config-read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, password } = req.body || {};

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'filePath is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await readApacheConfigFile(server, filePath, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheConfigRead API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to read Apache configuration file',
    });
  }
});

// POST /api/remote-servers/:id/apache-config-test - Tests candidate Apache configuration in real context
apiRouter.post('/remote-servers/:id/apache-config-test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, candidateContent, password } = req.body || {};

    if (!filePath || candidateContent === undefined) {
      return res.status(400).json({ success: false, error: 'filePath and candidateContent are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await testApacheConfigFileCandidate(server, filePath, candidateContent, password);
    return res.json({ success: true, test: result });
  } catch (err: any) {
    console.error(`[ApacheConfigTest API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to test candidate Apache configuration',
    });
  }
});

// POST /api/remote-servers/:id/apache-config-save - Safely saves config with backup, syntax test & atomic rollback
apiRouter.post('/remote-servers/:id/apache-config-save', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, newContent, autoReload, password } = req.body || {};

    if (!filePath || newContent === undefined) {
      return res.status(400).json({ success: false, error: 'filePath and newContent are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await saveApacheConfigFileSafe(
      server,
      filePath,
      newContent,
      autoReload !== false,
      password
    );
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheConfigSave API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to save Apache configuration file',
    });
  }
});

// POST /api/remote-servers/:id/apache-config-backups - Lists all versioned backups for a file
apiRouter.post('/remote-servers/:id/apache-config-backups', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, password } = req.body || {};

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'filePath is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await listApacheFileBackups(server, filePath, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheConfigBackups API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to list Apache file backups',
    });
  }
});

// POST /api/remote-servers/:id/apache-config-restore - Restores versioned backup with syntax test and rollback
apiRouter.post('/remote-servers/:id/apache-config-restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, backupPath, autoReload, password } = req.body || {};

    if (!filePath || !backupPath) {
      return res.status(400).json({ success: false, error: 'filePath and backupPath are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await restoreApacheFileBackup(
      server,
      filePath,
      backupPath,
      autoReload !== false,
      password
    );
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheConfigRestore API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to restore Apache file backup',
    });
  }
});

// POST /api/remote-servers/:id/apache-service-action - Controls Apache service (start/stop/restart/reload/graceful/enable/disable/status)
apiRouter.post('/remote-servers/:id/apache-service-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, password } = req.body || {};

    if (!action) {
      return res.status(400).json({ success: false, error: 'action parameter is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await manageApacheService(server, action, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheServiceAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute Apache service action',
    });
  }
});

// POST /api/remote-servers/:id/apache-security-audit - Runs comprehensive Apache security hardening audit
apiRouter.post('/remote-servers/:id/apache-security-audit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, targetConfPath } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const report = await performApacheSecurityAudit(server, password, targetConfPath);
    return res.json({ success: true, report });
  } catch (err: any) {
    console.error(`[ApacheSecurityAudit API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to perform Apache security audit',
    });
  }
});

// POST /api/remote-servers/:id/apache-security-apply-fix - Safely applies Apache security hardening configuration
apiRouter.post('/remote-servers/:id/apache-security-apply-fix', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetFilePath, customContent, password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await applyApacheSecurityHardening(server, targetFilePath, customContent, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheSecurityApplyFix API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: req.body?.targetFilePath || '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Hardening application exception',
      serviceReloaded: false,
      error: err.message || 'Failed to apply Apache security hardening configuration',
    });
  }
});

// POST /api/remote-servers/:id/apache-performance-report - Fetches live mod_status, worker metrics, and MPM recommendations
apiRouter.post('/remote-servers/:id/apache-performance-report', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, targetConfPath } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const report = await getApachePerformanceReport(server, password, targetConfPath);
    return res.json({ success: true, report });
  } catch (err: any) {
    console.error(`[ApachePerformanceReport API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch Apache performance report',
    });
  }
});

// POST /api/remote-servers/:id/apache-performance-enable-status - Configures and enables mod_status safely
apiRouter.post('/remote-servers/:id/apache-performance-enable-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await enableApacheModStatus(server, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheEnableModStatus API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Error enabling mod_status',
      serviceReloaded: false,
      error: err.message || 'Failed to enable mod_status',
    });
  }
});

// POST /api/remote-servers/:id/apache-performance-apply-tuning - Safely writes tuned MPM, compression, or caching config
apiRouter.post('/remote-servers/:id/apache-performance-apply-tuning', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customContent, targetFilePath, password } = req.body || {};

    if (!customContent) {
      return res.status(400).json({ success: false, error: 'Configuration content is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await applyApachePerformanceTuning(server, customContent, targetFilePath, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheApplyTuning API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: req.body?.targetFilePath || '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Tuning application exception',
      serviceReloaded: false,
      error: err.message || 'Failed to apply Apache performance tuning',
    });
  }
});

// POST /api/remote-servers/:id/apache-rewrite-summary - Discovers .htaccess, AllowOverride, and rewrite rules
apiRouter.post('/remote-servers/:id/apache-rewrite-summary', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, targetConfPath } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const summary = await discoverApacheRewriteAndHtaccess(server, password, targetConfPath);
    return res.json({ success: true, summary });
  } catch (err: any) {
    console.error(`[ApacheRewriteSummary API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Apache rewrite & .htaccess configurations',
    });
  }
});

// POST /api/remote-servers/:id/apache-rewrite-enable-module - Enables mod_rewrite safely
apiRouter.post('/remote-servers/:id/apache-rewrite-enable-module', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await enableApacheRewriteModule(server, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheEnableRewriteModule API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Error enabling rewrite module',
      serviceReloaded: false,
      error: err.message || 'Failed to enable mod_rewrite',
    });
  }
});

// POST /api/remote-servers/:id/apache-htaccess-save - Saves .htaccess with atomic backup and permissions
apiRouter.post('/remote-servers/:id/apache-htaccess-save', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetDirectory, content, password } = req.body || {};

    if (!targetDirectory || content === undefined) {
      return res.status(400).json({ success: false, error: 'Target directory and content are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await saveHtaccessFile(server, targetDirectory, content, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheHtaccessSave API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: req.body?.targetDirectory || '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Error saving .htaccess file',
      serviceReloaded: false,
      error: err.message || 'Failed to save .htaccess file',
    });
  }
});

// POST /api/remote-servers/:id/apache-basic-auth-setup - Configures HTTP Basic Auth and .htpasswd
apiRouter.post('/remote-servers/:id/apache-basic-auth-setup', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetDirectory, authName, username, password, authUserFilePath, sessionPassword } = req.body || {};

    if (!targetDirectory || !username) {
      return res.status(400).json({ success: false, error: 'Target directory and username are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await setupApacheBasicAuth(
      server,
      { targetDirectory, authName, username, password, authUserFilePath },
      sessionPassword
    );
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheBasicAuthSetup API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: req.body?.authUserFilePath || '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Error configuring basic auth',
      serviceReloaded: false,
      error: err.message || 'Failed to configure HTTP Basic Auth',
    });
  }
});

// POST /api/remote-servers/:id/apache-error-docs-deploy - Deploys custom ErrorDocuments safely
apiRouter.post('/remote-servers/:id/apache-error-docs-deploy', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { errorDocs, password } = req.body || {};

    if (!Array.isArray(errorDocs) || errorDocs.length === 0) {
      return res.status(400).json({ success: false, error: 'Valid errorDocs array is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deployApacheCustomErrorDocs(server, errorDocs, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[ApacheErrorDocsDeploy API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Error deploying error documents',
      serviceReloaded: false,
      error: err.message || 'Failed to deploy custom error documents',
    });
  }
});

// POST /api/remote-servers/:id/nginx-config-topology - Scans include tree and builds configuration graph
apiRouter.post('/remote-servers/:id/nginx-config-topology', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, confPath, prefixPath } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const topology = await discoverNginxConfigTopology(server, password, confPath, prefixPath);
    return res.json({ success: true, topology });
  } catch (err: any) {
    console.error(`[NginxConfigTopology API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to parse Nginx configuration tree',
    });
  }
});

// POST /api/remote-servers/:id/nginx-sites - Parses and models all Virtual Hosts & Server Blocks
apiRouter.post('/remote-servers/:id/nginx-sites', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const sitesData = await discoverNginxServerBlocks(server, password);
    return res.json({ success: true, sites: sitesData });
  } catch (err: any) {
    console.error(`[NginxSites API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to extract Nginx virtual hosts',
    });
  }
});

// POST /api/remote-servers/:id/nginx-proxy - Discovers upstream pools and reverse proxy paths
apiRouter.post('/remote-servers/:id/nginx-proxy', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const proxyData = await discoverNginxProxyArchitecture(server, password);
    return res.json({ success: true, proxy: proxyData });
  } catch (err: any) {
    console.error(`[NginxProxy API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to extract Nginx upstreams and proxy rules',
    });
  }
});

// POST /api/remote-servers/:id/nginx-certificates - Discovers and inspects SSL/TLS certificates and expiration
apiRouter.post('/remote-servers/:id/nginx-certificates', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const sslData = await discoverNginxCertificates(server, password);
    return res.json({ success: true, ssl: sslData });
  } catch (err: any) {
    console.error(`[NginxCertificates API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to inspect Nginx SSL certificates',
    });
  }
});

// POST /api/remote-servers/:id/nginx-logs-discovery - Discovers all active access and error log files
apiRouter.post('/remote-servers/:id/nginx-logs-discovery', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const logsSummary = await discoverNginxLogFiles(server, password);
    return res.json({ success: true, logs: logsSummary });
  } catch (err: any) {
    console.error(`[NginxLogsDiscovery API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to discover Nginx log files',
    });
  }
});

// POST /api/remote-servers/:id/nginx-logs-stream - Streams, parses, filters, and computes live statistics for Nginx logs
apiRouter.post('/remote-servers/:id/nginx-logs-stream', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, filePath, lines, search, statusCode, level } = req.body || {};

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'File path parameter is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const streamData = await streamNginxLogFile(
      server,
      {
        filePath,
        lines: lines ? Number(lines) : 100,
        search: typeof search === 'string' ? search : '',
        statusCode: typeof statusCode === 'string' ? statusCode : '',
        level: typeof level === 'string' ? level : '',
      },
      password
    );

    return res.json({ success: true, stream: streamData });
  } catch (err: any) {
    console.error(`[NginxLogsStream API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to stream Nginx log file',
    });
  }
});

// POST /api/remote-servers/:id/nginx-site-test - Dry-run syntax test for candidate Nginx site configuration
apiRouter.post('/remote-servers/:id/nginx-site-test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { config, password } = req.body || {};

    if (!config || !config.domain) {
      return res.status(400).json({ success: false, error: 'Valid site configuration with domain is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const testResult = await testNginxSiteConfig(server, config, password);
    return res.json(testResult);
  } catch (err: any) {
    console.error(`[NginxSiteTest API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      isValid: false,
      testOutput: err.message || 'Syntax test execution failed',
      error: err.message || 'Failed to test Nginx site configuration',
    });
  }
});

// POST /api/remote-servers/:id/nginx-site-deploy - Safely deploys Nginx site with automatic atomic rollback
apiRouter.post('/remote-servers/:id/nginx-site-deploy', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { config, password } = req.body || {};

    if (!config || !config.domain) {
      return res.status(400).json({ success: false, error: 'Valid site configuration with domain is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const deployResult = await deployNginxSite(server, config, password);
    return res.json(deployResult);
  } catch (err: any) {
    console.error(`[NginxSiteDeploy API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      deployedFilePath: '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Deployment exception',
      serviceReloaded: false,
      error: err.message || 'Failed to deploy Nginx site',
    });
  }
});

// POST /api/remote-servers/:id/nginx-site-toggle - Toggles a site between enabled and disabled
apiRouter.post('/remote-servers/:id/nginx-site-toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { siteFilePath, enable, password } = req.body || {};

    if (!siteFilePath) {
      return res.status(400).json({ success: false, error: 'Site file path is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const toggleResult = await toggleNginxSiteStatus(server, siteFilePath, Boolean(enable), password);
    return res.json(toggleResult);
  } catch (err: any) {
    console.error(`[NginxSiteToggle API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to toggle Nginx site status',
    });
  }
});

// POST /api/remote-servers/:id/nginx-site-delete - Safely removes a site configuration file
apiRouter.post('/remote-servers/:id/nginx-site-delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { siteFilePath, password } = req.body || {};

    if (!siteFilePath) {
      return res.status(400).json({ success: false, error: 'Site file path is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const deleteResult = await deleteNginxSite(server, siteFilePath, password);
    return res.json(deleteResult);
  } catch (err: any) {
    console.error(`[NginxSiteDelete API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete Nginx site',
    });
  }
});

// POST /api/remote-servers/:id/nginx-file-read - Reads raw content of an Nginx config file
apiRouter.post('/remote-servers/:id/nginx-file-read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, password } = req.body || {};

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'filePath parameter is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await readNginxConfigFile(server, filePath, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[NginxFileRead API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to read Nginx configuration file',
    });
  }
});

// POST /api/remote-servers/:id/nginx-file-test - Tests candidate content in isolated context
apiRouter.post('/remote-servers/:id/nginx-file-test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, candidateContent, password } = req.body || {};

    if (!filePath || candidateContent === undefined) {
      return res.status(400).json({ success: false, error: 'filePath and candidateContent are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await testNginxConfigFileCandidate(server, filePath, candidateContent, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[NginxFileTest API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      isValid: false,
      output: err.message || 'Syntax test execution failed',
      error: err.message || 'Failed to test configuration syntax',
    });
  }
});

// POST /api/remote-servers/:id/nginx-file-save - Atomically saves config with automatic backup and rollback
apiRouter.post('/remote-servers/:id/nginx-file-save', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, newContent, autoReload, password } = req.body || {};

    if (!filePath || newContent === undefined) {
      return res.status(400).json({ success: false, error: 'filePath and newContent are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await saveNginxConfigFileSafe(
      server,
      filePath,
      newContent,
      autoReload !== false,
      password
    );
    return res.json(result);
  } catch (err: any) {
    console.error(`[NginxFileSave API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: req.body?.filePath || '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Save exception',
      serviceReloaded: false,
      error: err.message || 'Failed to save configuration file',
    });
  }
});

// POST /api/remote-servers/:id/nginx-file-backups - Lists existing backups for a specific config file
apiRouter.post('/remote-servers/:id/nginx-file-backups', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, password } = req.body || {};

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'filePath parameter is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await listNginxFileBackups(server, filePath, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[NginxFileBackups API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      backups: [],
      error: err.message || 'Failed to list configuration backups',
    });
  }
});

// POST /api/remote-servers/:id/nginx-file-restore - Restores a specific backup with verification
apiRouter.post('/remote-servers/:id/nginx-file-restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, backupPath, autoReload, password } = req.body || {};

    if (!filePath || !backupPath) {
      return res.status(400).json({ success: false, error: 'filePath and backupPath are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await restoreNginxFileBackup(
      server,
      filePath,
      backupPath,
      autoReload !== false,
      password
    );
    return res.json(result);
  } catch (err: any) {
    console.error(`[NginxFileRestore API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: req.body?.filePath || '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Restore exception',
      serviceReloaded: false,
      error: err.message || 'Failed to restore configuration backup',
    });
  }
});

// POST /api/remote-servers/:id/nginx-security-audit - Runs comprehensive security hardening audit
apiRouter.post('/remote-servers/:id/nginx-security-audit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password, targetConfPath } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const report = await performNginxSecurityAudit(server, password, targetConfPath);
    return res.json({ success: true, report });
  } catch (err: any) {
    console.error(`[NginxSecurityAudit API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to perform Nginx security audit',
    });
  }
});

// POST /api/remote-servers/:id/nginx-security-apply-fix - Safely applies hardening configuration
apiRouter.post('/remote-servers/:id/nginx-security-apply-fix', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetFilePath, customContent, password } = req.body || {};

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await applyNginxSecurityHardening(server, targetFilePath, customContent, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[NginxSecurityApplyFix API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      filePath: req.body?.targetFilePath || '',
      syntaxTestPassed: false,
      syntaxOutput: err.message || 'Hardening application exception',
      serviceReloaded: false,
      error: err.message || 'Failed to apply security hardening configuration',
    });
  }
});

// POST /api/remote-servers/:id/process-action - Kill or Renice Linux Process
apiRouter.post('/remote-servers/:id/process-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pid, action, signal, nice, password } = req.body;

    if (!pid || !action) {
      return res.status(400).json({ success: false, error: 'pid and action are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxProcessControl(
      server,
      Number(pid),
      action,
      { signal: signal !== undefined ? Number(signal) : undefined, nice: nice !== undefined ? Number(nice) : undefined },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Linux Process ${action.toUpperCase()} (PID ${pid})`,
      category: 'operation',
      target: `${server.name || server.ip} (PID ${pid})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxProcessAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to control remote process',
    });
  }
});

// GET & POST /api/remote-servers/:id/users - Fetch logged in users and all system users
const handleLinuxServerUsers = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'User management is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const data = await fetchLinuxUsersAndGroupsSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error(`[LinuxUsers API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch users from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/users', handleLinuxServerUsers);
apiRouter.post('/remote-servers/:id/users', handleLinuxServerUsers);

// POST /api/remote-servers/:id/users/create - Create user account
const handleLinuxCreateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, password, comment, homeDir, shell, groups, createHome, expireDate, forcePasswordChange, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createLinuxUserSSH(
      server,
      { username, password, comment, homeDir, shell, groups, createHome, expireDate, forcePasswordChange },
      ephemeralPassword
    );

    await addAuditLog({
      userName: 'Administrator',
      action: `Create Linux User (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Created user ${username} with shell ${shell || '/bin/bash'}${expireDate ? ` (Expires: ${expireDate})` : ''}${forcePasswordChange ? ' [Force pwd change]' : ''}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxCreateUser API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create user',
    });
  }
};
apiRouter.post('/api/remote-servers/:id/users/create', handleLinuxCreateUser);
apiRouter.post('/remote-servers/:id/users/create', handleLinuxCreateUser);

// POST /api/remote-servers/:id/users/update - Edit / Update user account
const handleLinuxUpdateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, comment, homeDir, shell, groups, newPassword, forcePasswordChange, expireDate, isLocked, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await updateLinuxUserSSH(
      server,
      { username, comment, homeDir, shell, groups, newPassword, forcePasswordChange, expireDate, isLocked },
      ephemeralPassword
    );

    await addAuditLog({
      userName: 'Administrator',
      action: `Update Linux User (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Updated user ${username} attributes${expireDate ? ` (Expires: ${expireDate})` : ''}${forcePasswordChange ? ' [Force pwd change on login]' : ''}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxUpdateUser API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update user',
    });
  }
};
apiRouter.post('/api/remote-servers/:id/users/update', handleLinuxUpdateUser);
apiRouter.post('/remote-servers/:id/users/update', handleLinuxUpdateUser);

// GET / POST /api/remote-servers/:id/users/:username/info - Fetch comprehensive user security and login history
const handleLinuxUserInfo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const username = (req.params.username || req.body?.username || req.query?.username || '').toString().trim();
    const ephemeralPassword = req.body?.ephemeralPassword || req.headers['x-server-session-password'] as string;

    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const data = await fetchLinuxUserSecurityDetailsSSH(server, username, ephemeralPassword);
    return res.json({ success: true, data });
  } catch (err: any) {
    console.error(`[LinuxUserInfo API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch user security details',
    });
  }
};
apiRouter.get('/api/remote-servers/:id/users/:username/info', handleLinuxUserInfo);
apiRouter.post('/api/remote-servers/:id/users/:username/info', handleLinuxUserInfo);
apiRouter.post('/api/remote-servers/:id/users/info', handleLinuxUserInfo);
apiRouter.get('/remote-servers/:id/users/:username/info', handleLinuxUserInfo);
apiRouter.post('/remote-servers/:id/users/:username/info', handleLinuxUserInfo);
apiRouter.post('/remote-servers/:id/users/info', handleLinuxUserInfo);

// POST /api/remote-servers/:id/users/password - Update user password
const handleLinuxUpdatePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, password, forcePasswordChange, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await updateLinuxUserPasswordSSH(server, username, password, ephemeralPassword, forcePasswordChange);

    await addAuditLog({
      userName: 'Administrator',
      action: `Update Password (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Updated password for user ${username}${forcePasswordChange ? ' (Must change on next login)' : ''}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxPasswd API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update user password',
    });
  }
};
apiRouter.post('/api/remote-servers/:id/users/password', handleLinuxUpdatePassword);
apiRouter.post('/remote-servers/:id/users/password', handleLinuxUpdatePassword);

// POST /api/remote-servers/:id/users/toggle-lock - Lock or unlock user account
apiRouter.post('/api/remote-servers/:id/users/toggle-lock', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, lock, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await toggleLinuxUserLockSSH(server, username, Boolean(lock), ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: lock ? `Lock User (${username})` : `Unlock User (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `${lock ? 'Locked' : 'Unlocked'} account ${username}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLockUser API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update user lock status',
    });
  }
});
apiRouter.post('/remote-servers/:id/users/toggle-lock', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, lock, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await toggleLinuxUserLockSSH(server, username, Boolean(lock), ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: lock ? `Lock User (${username})` : `Unlock User (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `${lock ? 'Locked' : 'Unlocked'} account ${username}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLockUser API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update user lock status',
    });
  }
});

// POST /api/remote-servers/:id/users/groups - Update user groups
apiRouter.post('/api/remote-servers/:id/users/groups', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, groups, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await updateLinuxUserGroupsSSH(server, username, groups || [], ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: `Update Groups (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Updated groups for user ${username}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxUserGroups API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update user groups',
    });
  }
});
apiRouter.post('/remote-servers/:id/users/groups', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, groups, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await updateLinuxUserGroupsSSH(server, username, groups || [], ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: `Update Groups (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Updated groups for user ${username}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxUserGroups API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update user groups',
    });
  }
});

// POST /api/remote-servers/:id/groups/create - Create new group
apiRouter.post('/api/remote-servers/:id/groups/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createLinuxGroupSSH(server, name, ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: `Create Group (${name})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Created new Linux group ${name}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxCreateGroup API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create group',
    });
  }
});
apiRouter.post('/remote-servers/:id/groups/create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createLinuxGroupSSH(server, name, ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: `Create Group (${name})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Created new Linux group ${name}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxCreateGroup API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create group',
    });
  }
});

// POST /api/remote-servers/:id/users/delete - Delete user account
apiRouter.post('/api/remote-servers/:id/users/delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, removeHome, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deleteLinuxUserSSH(server, username, Boolean(removeHome), ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: `Delete User (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Deleted user ${username} (remove home: ${Boolean(removeHome)})`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxDeleteUser API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete user',
    });
  }
});
apiRouter.post('/remote-servers/:id/users/delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, removeHome, ephemeralPassword } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deleteLinuxUserSSH(server, username, Boolean(removeHome), ephemeralPassword);

    await addAuditLog({
      userName: 'Administrator',
      action: `Delete User (${username})`,
      category: 'security',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Deleted user ${username} (remove home: ${Boolean(removeHome)})`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxDeleteUser API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete user',
    });
  }
});

// ==========================================
// LINUX SYSTEM LOGS & JOURNAL ENDPOINTS
// ==========================================

const handleFetchLinuxLogs = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'System logs inspection is only available for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const category = (req.body?.category || req.query?.category || 'journal') as any;
    const lines = Number(req.body?.lines || req.query?.lines || 200);
    const grepFilter = (req.body?.grepFilter || req.query?.grepFilter || '') as string;
    const customPath = (req.body?.customPath || req.query?.customPath || '') as string;
    const priority = (req.body?.priority || req.query?.priority || '') as string;
    const unit = (req.body?.unit || req.query?.unit || '') as string;
    const since = (req.body?.since || req.query?.since || '') as string;

    const result = await fetchLinuxSystemLogsSSH(
      server,
      { category, lines, grepFilter, customPath, priority, unit, since },
      ephemeralPassword
    );

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLogs API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch Linux system logs',
    });
  }
};

apiRouter.get('/remote-servers/:id/logs', handleFetchLinuxLogs);
apiRouter.post('/remote-servers/:id/logs', handleFetchLinuxLogs);

// POST /api/remote-servers/:id/logs/truncate - Safely clear/truncate a specific log file
apiRouter.post('/remote-servers/:id/logs/truncate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath, password } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ success: false, error: 'filePath is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await truncateLinuxLogSSH(server, filePath, password);

    await addAuditLog({
      userName: 'Administrator',
      action: `Truncate Log File (${filePath})`,
      category: 'operation',
      target: `${server.name || server.ip}`,
      status: 'success',
      details: `Truncated log file ${filePath}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxTruncateLog API Error]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to truncate log file',
    });
  }
});

// POST /api/remote-servers/:id/send-message - Send message to logged-in user or broadcast
apiRouter.post('/remote-servers/:id/send-message', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { target, message, password } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await sendLinuxUserMessageSSH(server, target || 'all', message, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Send Terminal Message (${target || 'all'})`,
      category: 'operation',
      target: `${server.name || server.ip}`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxSendMessage API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to send message to user',
    });
  }
});

// POST /api/remote-servers/:id/logout-user - Terminate an active user session or all sessions with optional pre-logout alert
apiRouter.post('/remote-servers/:id/logout-user', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, tty, delaySeconds, message, force, allSessions, password } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'User logout is designed for Linux servers.' });
    }

    const ephemeralPassword = password;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const result = await logoutLinuxUserSessionSSH(
      server,
      {
        username,
        tty,
        delaySeconds: Number(delaySeconds) || 0,
        message,
        force: Boolean(force),
        allSessions: Boolean(allSessions),
      },
      ephemeralPassword
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Logout User Session (${username || tty || 'active'})`,
      category: 'operation',
      target: `${server.name || server.ip}`,
      status: result.success ? 'success' : 'error',
      details: `${result.message} (TTY: ${tty || 'all'}, Delay: ${delaySeconds || 0}s, Force: ${Boolean(force)})`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLogoutUser API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to logout user session',
    });
  }
});

// POST /api/remote-servers/:id/restart - Execute immediate or scheduled reboot or shutdown for Linux/Windows servers
apiRouter.post('/remote-servers/:id/restart', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { delayMinutes, notifyUsers, message, force, cancelPending, password, actionType } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const ephemeralPassword = password;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password && !server.win_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const isWindows = server.os_type === 'windows';
    const isPowerOff = actionType === 'poweroff';
    const result = await executeServerRestartSSH(
      server,
      {
        actionType: isPowerOff ? 'poweroff' : 'restart',
        delayMinutes: Number(delayMinutes) || 0,
        notifyUsers: Boolean(notifyUsers),
        message: typeof message === 'string' ? message : undefined,
        force: force !== undefined ? Boolean(force) : true,
        cancelPending: Boolean(cancelPending),
      },
      ephemeralPassword
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: cancelPending
        ? `Cancel Scheduled ${isPowerOff ? 'Shutdown' : 'Restart'} (${isWindows ? 'Windows' : 'Linux'})`
        : `Server ${isPowerOff ? 'Shutdown' : 'Restart'} (${isWindows ? 'Windows' : 'Linux'}, Delay: ${delayMinutes || 0}m)`,
      category: 'operation',
      target: `${server.name || server.ip}`,
      status: result.success ? 'success' : 'error',
      details: `${result.message} [Command: ${result.command}]`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[ServerRestart API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute restart on remote server',
    });
  }
});

// POST /api/remote-servers/bulk-power - Execute batch restart or shutdown across selected servers
apiRouter.post('/remote-servers/bulk-power', async (req: Request, res: Response) => {
  try {
    const { serverIds, actionType, delayMinutes, notifyUsers, message, force, cancelPending, password } = req.body;

    if (!Array.isArray(serverIds) || serverIds.length === 0) {
      return res.status(400).json({ success: false, error: 'serverIds array is required' });
    }

    const isPowerOff = actionType === 'poweroff';
    const clientIp = getClientIp(req);

    const results = await Promise.allSettled(
      serverIds.map(async (id: string) => {
        const server = await getRemoteServerById(id);
        if (!server) {
          throw new Error('Server not found');
        }

        const ephemeralPassword = password;
        if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password && !server.win_password) {
          throw new Error('Password prompt required (Zero-storage policy)');
        }

        const res = await executeServerRestartSSH(
          server,
          {
            actionType: isPowerOff ? 'poweroff' : 'restart',
            delayMinutes: Number(delayMinutes) || 0,
            notifyUsers: Boolean(notifyUsers),
            message: typeof message === 'string' ? message : undefined,
            force: force !== undefined ? Boolean(force) : true,
            cancelPending: Boolean(cancelPending),
          },
          ephemeralPassword
        );

        // Audit log per server
        await addAuditLog({
          userName: 'Administrator',
          action: cancelPending
            ? `Bulk Cancel Scheduled ${isPowerOff ? 'Shutdown' : 'Restart'} (${server.os_type})`
            : `Bulk Server ${isPowerOff ? 'Shutdown' : 'Restart'} (${server.os_type}, Delay: ${delayMinutes || 0}m)`,
          category: 'operation',
          target: `${server.name || server.ip}`,
          status: res.success ? 'success' : 'error',
          details: `${res.message} [Command: ${res.command}]`,
          ipAddress: clientIp,
        }).catch(() => {});

        return {
          serverId: server.id,
          serverName: server.name,
          ip: server.ip,
          osType: server.os_type,
          success: res.success,
          message: res.message,
          command: res.command,
          output: res.output,
        };
      })
    );

    const formattedResults = results.map((r, idx) => {
      if (r.status === 'fulfilled') {
        return r.value;
      } else {
        return {
          serverId: serverIds[idx],
          serverName: `Server #${idx + 1}`,
          ip: '',
          osType: 'unknown',
          success: false,
          message: r.reason?.message || 'Execution failed',
          command: '',
          error: r.reason?.message || 'Execution failed',
        };
      }
    });

    const anySuccess = formattedResults.some((r) => r.success);
    return res.json({
      success: anySuccess,
      results: formattedResults,
    });
  } catch (err: any) {
    console.error('[BulkServerPower API Error]:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute bulk power action',
    });
  }
});

// GET & POST /api/remote-servers/:id/sysconfig - Fetch OS, Kernel, Proxy, and Interfaces
const handleLinuxServerSysConfig = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'System configuration is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const data = await fetchLinuxDetailedSysInfoSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error(`[LinuxSysConfig API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch system configuration from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/sysconfig', handleLinuxServerSysConfig);
apiRouter.post('/remote-servers/:id/sysconfig', handleLinuxServerSysConfig);

// GET / POST /api/remote-servers/:id/network-stack - Detect Linux distribution, networking stack, and interfaces
const handleLinuxServerNetworkStack = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Network stack discovery is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const data = await detectLinuxNetworkStack(server, ephemeralPassword);
    return res.json({
      success: true,
      ...data,
    });
  } catch (err: any) {
    console.error(`[LinuxNetworkStack API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to detect network stack from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/network-stack', handleLinuxServerNetworkStack);
apiRouter.post('/remote-servers/:id/network-stack', handleLinuxServerNetworkStack);

// POST /api/remote-servers/:id/network-action - Configure Linux network interface
apiRouter.post('/remote-servers/:id/network-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { interfaceName, config, password } = req.body;

    if (!interfaceName) {
      return res.status(400).json({ success: false, error: 'interfaceName is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await applyLinuxNetworkConfiguration(server, interfaceName, config || {}, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Configure Network Interface (${interfaceName})`,
      category: 'configuration',
      target: `${server.name || server.ip} (${interfaceName})`,
      status: result.success ? 'success' : 'error',
      details: `${result.message} [Provider: ${result.providerUsed}]`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxNetworkAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to configure network interface',
    });
  }
});

// POST /api/remote-servers/:id/restart-network - Safely restart active network service
apiRouter.post('/remote-servers/:id/restart-network', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await restartLinuxNetworkService(server, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Restart Network Service (${result.serviceRestarted})`,
      category: 'system',
      target: `${server.name || server.ip}`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxRestartNetwork API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to restart network service',
    });
  }
});

// POST /api/remote-servers/:id/interface-state - Bring interface UP or DOWN
apiRouter.post('/remote-servers/:id/interface-state', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { interfaceName, state, password } = req.body;

    if (!interfaceName || !state || !['UP', 'DOWN'].includes(state)) {
      return res.status(400).json({ success: false, error: 'interfaceName and valid state (UP/DOWN) are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await setLinuxInterfaceState(server, interfaceName, state, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Set Interface State (${interfaceName} -> ${state})`,
      category: 'configuration',
      target: `${server.name || server.ip} (${interfaceName})`,
      status: result.success ? 'success' : 'error',
      details: `${result.message} ${result.warning || ''}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxInterfaceState API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to set interface state',
    });
  }
});

// GET / POST /api/remote-servers/:id/firewall - Detect and fetch Linux firewall status and rules
const handleLinuxServerFirewall = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Firewall management is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const firewallInfo = await detectLinuxFirewall(server, ephemeralPassword);
    return res.json({
      success: true,
      ...firewallInfo,
    });
  } catch (err: any) {
    console.error(`[LinuxFirewall API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to inspect firewall on remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/firewall', handleLinuxServerFirewall);
apiRouter.post('/remote-servers/:id/firewall', handleLinuxServerFirewall);

// POST /api/remote-servers/:id/firewall/rule - Add a firewall rule
apiRouter.post('/remote-servers/:id/firewall/rule', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rule, backend, activeZone, password } = req.body;

    if (!rule || !backend) {
      return res.status(400).json({ success: false, error: 'Rule payload and backend are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await addFirewallRule(server, rule, backend, activeZone, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Firewall Rule Added (${rule.action} ${rule.port || rule.protocol})`,
      category: 'security',
      target: `${server.name || server.ip} (${backend.toUpperCase()})`,
      status: result.success ? 'success' : 'error',
      details: `${result.message} ${result.error || ''}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFirewall Add Rule Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to add firewall rule',
    });
  }
});

// DELETE / POST /api/remote-servers/:id/firewall/rule/delete - Delete a firewall rule
const handleFirewallDeleteRule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rule, activeZone, password } = req.body;

    if (!rule) {
      return res.status(400).json({ success: false, error: 'Rule object is required for deletion' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await deleteFirewallRule(server, rule, activeZone, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Firewall Rule Deleted (${rule.action} ${rule.port || rule.protocol})`,
      category: 'security',
      target: `${server.name || server.ip} (${rule.backend.toUpperCase()})`,
      status: result.success ? 'success' : 'error',
      details: `${result.message} ${result.error || ''}`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFirewall Delete Rule Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete firewall rule',
    });
  }
};

apiRouter.delete('/remote-servers/:id/firewall/rule', handleFirewallDeleteRule);
apiRouter.post('/remote-servers/:id/firewall/rule/delete', handleFirewallDeleteRule);

// POST /api/remote-servers/:id/proxy-action - Configure or clear persistent system proxy
apiRouter.post('/remote-servers/:id/proxy-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { proxyConfig, password } = req.body;

    if (!proxyConfig || typeof proxyConfig.enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Valid proxyConfig object with enabled boolean is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await configureLinuxPersistentProxySSH(server, proxyConfig, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: proxyConfig.enabled ? 'Set Persistent Proxy' : 'Clear Persistent Proxy',
      category: 'configuration',
      target: `${server.name || server.ip}`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxProxyAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to configure persistent proxy',
    });
  }
});

// POST /api/remote-servers/:id/proxy-test - Test proxy connectivity via curl
apiRouter.post('/remote-servers/:id/proxy-test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { proxyUrl, testTarget, password } = req.body;

    if (!proxyUrl) {
      return res.status(400).json({ success: false, error: 'proxyUrl is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await testLinuxProxySSH(server, proxyUrl, testTarget, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxProxyTest API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to test proxy connectivity',
    });
  }
});

// POST /api/remote-servers/:id/ssh-port - Change SSH Port on remote Linux server
apiRouter.post('/remote-servers/:id/ssh-port', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newPort, password } = req.body;

    const parsedPort = Number(newPort);
    if (!parsedPort || isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return res.status(400).json({ success: false, error: 'Valid newPort between 1 and 65535 is required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await changeLinuxSshPortSSH(server, parsedPort, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Change SSH Port (${parsedPort})`,
      category: 'security',
      target: `${server.name || server.ip} (Port ${parsedPort})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxSshPort API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to change SSH port',
    });
  }
});

// ========================================================
// LINUX PACKAGE MANAGEMENT & SYSTEM UPGRADE ENDPOINTS
// ========================================================

// GET & POST /api/remote-servers/:id/packages - Fetch package updates and installed software list
const handleGetLinuxPackages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Package management is designed for Linux servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const refresh = req.body?.refresh === true || req.query?.refresh === 'true';
    const overview = await fetchLinuxPackageOverview(server, ephemeralPassword, refresh);

    return res.json({
      success: true,
      ...overview,
    });
  } catch (err: any) {
    console.error(`[LinuxPackages API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch package status from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/packages', handleGetLinuxPackages);
apiRouter.post('/remote-servers/:id/packages', handleGetLinuxPackages);

// POST /api/remote-servers/:id/packages/update-all - Upgrade all packages
apiRouter.post('/remote-servers/:id/packages/update-all', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const ephemeralPassword = req.body?.password as string | undefined;
    const isDistUpgrade = req.body?.distUpgrade === true;

    const job = startPackageUpdateJob(
      server,
      {
        mode: isDistUpgrade ? 'dist-upgrade' : 'all',
      },
      ephemeralPassword
    );

    addAuditLog({
      action: isDistUpgrade ? 'execute_linux_dist_upgrade' : 'execute_linux_package_update_all',
      username: req.body?.userName || 'Admin',
      category: 'system',
      target: `${server.name} (${server.ip})`,
      status: 'success',
      details: isDistUpgrade ? 'Initiated full Linux distribution upgrade' : 'Initiated bulk upgrade for all packages',
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json({ success: true, job });
  } catch (err: any) {
    console.error(`[LinuxPackageUpdateAll Error]:`, err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to start update all job' });
  }
});

// POST /api/remote-servers/:id/packages/update-selected - Upgrade selected packages list
apiRouter.post('/remote-servers/:id/packages/update-selected', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const { packages, password } = req.body;
    if (!Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({ success: false, error: 'No packages provided for update' });
    }

    const job = startPackageUpdateJob(
      server,
      {
        mode: 'selected',
        packages,
      },
      password
    );

    return res.json({ success: true, job });
  } catch (err: any) {
    console.error(`[LinuxPackageUpdateSelected Error]:`, err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to start update selected job' });
  }
});

// POST /api/remote-servers/:id/packages/update-single - Upgrade single package
apiRouter.post('/remote-servers/:id/packages/update-single', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const { packageName, currentVersion, targetVersion, password } = req.body;
    if (!packageName) {
      return res.status(400).json({ success: false, error: 'packageName is required' });
    }

    const job = startPackageUpdateJob(
      server,
      {
        mode: 'single',
        packages: [{ name: packageName, currentVersion, targetVersion }],
      },
      password
    );

    return res.json({ success: true, job });
  } catch (err: any) {
    console.error(`[LinuxPackageUpdateSingle Error]:`, err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to start single package update' });
  }
});

// POST /api/remote-servers/:id/packages/repo-update - Refresh repository metadata
apiRouter.post('/remote-servers/:id/packages/repo-update', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const ephemeralPassword = req.body?.password as string | undefined;
    const job = startPackageUpdateJob(
      server,
      { mode: 'repo-update' },
      ephemeralPassword
    );

    return res.json({ success: true, job });
  } catch (err: any) {
    console.error(`[LinuxPackageRepoUpdate Error]:`, err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to start repository update job' });
  }
});

// POST /api/remote-servers/:id/packages/autoremove - Clean obsolete packages
apiRouter.post('/remote-servers/:id/packages/autoremove', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const ephemeralPassword = req.body?.password as string | undefined;
    const job = startPackageUpdateJob(
      server,
      { mode: 'autoremove' },
      ephemeralPassword
    );

    return res.json({ success: true, job });
  } catch (err: any) {
    console.error(`[LinuxPackageAutoremove Error]:`, err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to start autoremove job' });
  }
});

// GET /api/remote-servers/:id/packages/job/:jobId - Poll job status
apiRouter.get('/remote-servers/:id/packages/job/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = getPackageUpdateJob(jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Update job not found' });
  }
  return res.json({ success: true, job });
});

// POST /api/remote-servers/:id/packages/job/:jobId/cancel - Cancel active job
apiRouter.post('/remote-servers/:id/packages/job/:jobId/cancel', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const cancelled = cancelPackageUpdateJob(jobId);
  return res.json({ success: true, cancelled });
});

// GET & POST /api/remote-servers/:id/block-devices - Fetch block devices and unmounted disks
const handleLinuxBlockDevices = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Block device inspection is designed for Linux remote servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const devices = await fetchLinuxBlockDevicesSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      devices,
    });
  } catch (err: any) {
    console.error(`[LinuxBlockDevices API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch block devices from remote server',
    });
  }
};

apiRouter.get('/remote-servers/:id/block-devices', handleLinuxBlockDevices);
apiRouter.post('/remote-servers/:id/block-devices', handleLinuxBlockDevices);

// POST /api/remote-servers/:id/mount-action - Mount partition or disk to target directory
apiRouter.post('/remote-servers/:id/mount-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { device, mountPoint, fsType, options, persistInFstab, createDirectory, password } = req.body;

    if (!device || !mountPoint) {
      return res.status(400).json({ success: false, error: 'device and mountPoint are required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxMountFilesystem(
      server,
      { device, mountPoint, fsType, options, persistInFstab: !!persistInFstab, createDirectory: !!createDirectory },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Mount Filesystem (${device} -> ${mountPoint})`,
      category: 'storage',
      target: `${server.name || server.ip} (${mountPoint})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxMountAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to mount remote filesystem',
    });
  }
});

// POST /api/remote-servers/:id/unmount-action - Unmount a mounted filesystem
apiRouter.post('/remote-servers/:id/unmount-action', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mountPoint, force, password } = req.body;

    if (!mountPoint) {
      return res.status(400).json({ success: false, error: 'mountPoint is required' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await executeLinuxUnmountFilesystem(server, mountPoint, !!force, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Unmount Filesystem (${mountPoint})`,
      category: 'storage',
      target: `${server.name || server.ip} (${mountPoint})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxUnmountAction API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to unmount remote filesystem',
    });
  }
});

// ==========================================
// LINUX LVM MANAGEMENT ENDPOINTS
// ==========================================

// GET & POST /api/remote-servers/:id/lvm-overview
const handleLinuxLvmOverview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'LVM management is only supported on Linux servers.' });
    }

    const ephemeralPassword = (req.body?.password || req.query?.password) as string | undefined;
    if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
      return res.status(401).json({
        success: false,
        requires_password: true,
        error: 'Password prompt required for this server (Zero-storage policy enabled).'
      });
    }

    const overview = await fetchLinuxLvmOverviewSSH(server, ephemeralPassword);
    return res.json({
      success: true,
      ...overview,
    });
  } catch (err: any) {
    console.error(`[LinuxLvmOverview API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch LVM overview',
    });
  }
};

apiRouter.get('/remote-servers/:id/lvm-overview', handleLinuxLvmOverview);
apiRouter.post('/remote-servers/:id/lvm-overview', handleLinuxLvmOverview);
apiRouter.get('/remote-servers/:id/storage-overview', handleLinuxLvmOverview);
apiRouter.post('/remote-servers/:id/storage-overview', handleLinuxLvmOverview);

// POST /api/remote-servers/:id/disk-format-mount - Workflow A: Format raw disk/partition & Mount (ext4/xfs/btrfs)
apiRouter.post('/remote-servers/:id/disk-format-mount', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { diskPath, partition, fsType, mountPath, label, persistInFstab, password } = req.body;

    if (!diskPath || !mountPath) {
      return res.status(400).json({ success: false, error: 'diskPath and mountPath are required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'Disk management is only supported on Linux servers.' });
    }

    const result = await formatAndMountLinuxDiskSSH(
      server,
      {
        diskPath,
        partition: partition !== false,
        fsType: fsType || 'ext4',
        mountPath,
        label,
        persistInFstab: persistInFstab !== false,
      },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Format & Mount Disk (${diskPath} -> ${mountPath})`,
      category: 'storage',
      target: `${server.name || server.ip} (${diskPath})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxDiskFormatMount API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to format and mount disk',
    });
  }
});

// POST /api/remote-servers/:id/lvm-rescan & /storage-rescan - Online SCSI & Block Device Rescan without reboot
const handleLinuxStorageRescan = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    if (server.os_type !== 'linux') {
      return res.status(400).json({ success: false, error: 'SCSI rescan is only supported on Linux servers.' });
    }

    const result = await rescanLinuxStorageSSH(server, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: 'Online SCSI & Storage Rescan',
      category: 'storage',
      target: server.name || server.ip,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLvmRescan API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to rescan storage devices',
    });
  }
};

apiRouter.post('/remote-servers/:id/lvm-rescan', handleLinuxStorageRescan);
apiRouter.post('/remote-servers/:id/storage-rescan', handleLinuxStorageRescan);

// POST /api/remote-servers/:id/lvm-extend - Extend Logical Volume & dynamic filesystem grow
apiRouter.post('/remote-servers/:id/lvm-extend', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lvPath, vgName, addSize, diskToAddToVg, password } = req.body;

    if (!lvPath || !addSize) {
      return res.status(400).json({ success: false, error: 'lvPath and addSize are required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await extendLinuxLvSSH(
      server,
      { lvPath, vgName, addSize, diskToAddToVg },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Extend Logical Volume (${lvPath} +${addSize})`,
      category: 'storage',
      target: `${server.name || server.ip} (${lvPath})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLvmExtend API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to extend Logical Volume',
    });
  }
});

// POST /api/remote-servers/:id/lvm-create - Create New LV/VG, format, and persistent mount
apiRouter.post('/remote-servers/:id/lvm-create', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isNewVg, vgName, selectedDisks, lvName, size, fsType, mountPath, persistInFstab, password } = req.body;

    if (!vgName || !lvName || !size) {
      return res.status(400).json({ success: false, error: 'vgName, lvName, and size are required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createLinuxLvmVolumeSSH(
      server,
      {
        isNewVg: !!isNewVg,
        vgName,
        selectedDisks,
        lvName,
        size,
        fsType: fsType || 'ext4',
        mountPath,
        persistInFstab: !!persistInFstab,
      },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Create LVM Volume (${vgName}/${lvName} -> ${mountPath || 'unmounted'})`,
      category: 'storage',
      target: `${server.name || server.ip} (${vgName}/${lvName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLvmCreate API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create Logical Volume',
    });
  }
});

// POST /api/remote-servers/:id/lvm-shrink - Safely shrink LV and reclaim space to VG
apiRouter.post('/remote-servers/:id/lvm-shrink', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lvPath, vgName, reduceAmount, mountPoint, fsType, password } = req.body;

    if (!lvPath || !reduceAmount) {
      return res.status(400).json({ success: false, error: 'lvPath and reduceAmount are required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await shrinkLinuxLvSSH(
      server,
      { lvPath, vgName, reduceAmount, mountPoint, fsType },
      password
    );

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Shrink Logical Volume (${lvPath} -${reduceAmount})`,
      category: 'storage',
      target: `${server.name || server.ip} (${lvPath})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLvmShrink API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to shrink Logical Volume',
    });
  }
});

// POST /api/remote-servers/:id/lvm-add-disk-to-vg - Attach raw disk/partition to existing Volume Group
apiRouter.post('/remote-servers/:id/lvm-add-disk-to-vg', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { vgName, diskPath, password } = req.body;

    if (!vgName || !diskPath) {
      return res.status(400).json({ success: false, error: 'vgName and diskPath are required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await addDiskToLinuxVgSSH(server, { vgName, diskPath }, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Add Disk to VG (${diskPath} -> ${vgName})`,
      category: 'storage',
      target: `${server.name || server.ip} (${vgName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLvmAddDiskToVg API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to add disk to Volume Group',
    });
  }
});

// POST /api/remote-servers/:id/lvm-create-pv - Initialize raw disk/partition as an LVM Physical Volume (pvcreate)
apiRouter.post('/remote-servers/:id/lvm-create-pv', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { diskPath, force, password } = req.body;

    if (!diskPath) {
      return res.status(400).json({ success: false, error: 'diskPath is required.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createLinuxPvSSH(server, { diskPath, force }, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Initialize Physical Volume (${diskPath})`,
      category: 'storage',
      target: `${server.name || server.ip} (PV: ${diskPath})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLvmCreatePv API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to initialize Physical Volume',
    });
  }
});

// POST /api/remote-servers/:id/lvm-create-vg - Create a new Volume Group (vgcreate)
apiRouter.post('/remote-servers/:id/lvm-create-vg', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { vgName, selectedDisks, peSize, force, password } = req.body;

    if (!vgName) {
      return res.status(400).json({ success: false, error: 'Volume Group name (vgName) is required.' });
    }
    if (!selectedDisks || !Array.isArray(selectedDisks) || selectedDisks.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one physical disk or partition must be selected.' });
    }

    const server = await getRemoteServerById(id);
    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    const result = await createLinuxVolumeGroupSSH(server, { vgName, selectedDisks, peSize, force }, password);

    // Audit log
    await addAuditLog({
      userName: 'Administrator',
      action: `Create Volume Group (${vgName} on ${selectedDisks.join(', ')})`,
      category: 'storage',
      target: `${server.name || server.ip} (VG: ${vgName})`,
      status: result.success ? 'success' : 'error',
      details: result.message,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxLvmCreateVg API Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create Volume Group',
    });
  }
});

// ==========================================
// LINUX SYSTEM CONFIGURATION SUITE ENDPOINTS
// ==========================================

// Helper to authenticate and validate server access
async function getValidatedServer(id: string, ephemeralPassword?: string) {
  const server = await getRemoteServerById(id);
  if (!server) {
    return { error: 'Server not found', status: 404 };
  }
  if (server.os_type !== 'linux') {
    return { error: 'Endpoint is only available for Linux remote servers.', status: 400 };
  }
  if (server.prompt_password_on_connect && !ephemeralPassword && !server.ssh_password) {
    return { error: 'Password required for this server (Zero-storage policy enabled).', status: 401, requires_password: true };
  }
  return { server };
}

// 1. SSH Configuration & Port Management
apiRouter.all('/remote-servers/:id/ssh-config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    // If POST and contains config fields -> update
    if (req.method === 'POST' && (req.body?.port || req.body?.permitRootLogin || req.body?.allowedIps)) {
      const result = await updateLinuxSshConfigSSH(server, req.body, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: `Update SSH Configuration (Port ${req.body?.port})`,
        category: 'security',
        target: `${server.name || server.ip}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    // Otherwise, fetch active SSH config
    const config = await fetchLinuxSshConfigSSH(server, ephemeralPassword);
    return res.json({ success: true, config });
  } catch (err: any) {
    console.error(`[LinuxSshConfig API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process SSH configuration' });
  }
});

// 2. Hostname Management
apiRouter.all('/remote-servers/:id/hostname', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    // Update if hostname provided in POST
    if (req.method === 'POST' && req.body?.hostname) {
      const updateHosts = req.body.updateHosts !== false;
      const result = await updateLinuxHostnameSSH(server, req.body.hostname, updateHosts, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: `Change Hostname (${req.body.hostname})`,
        category: 'configuration',
        target: `${server.name || server.ip} -> ${req.body.hostname}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    // Otherwise, fetch current live hostname info
    const info = await fetchLinuxHostnameSSH(server, ephemeralPassword);
    return res.json({ success: true, info });
  } catch (err: any) {
    console.error(`[LinuxHostname API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process hostname' });
  }
});

// 3. /etc/hosts Management
apiRouter.all('/remote-servers/:id/hosts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const hasHostPayload =
      req.method === 'POST' &&
      (req.body?.entries !== undefined ||
        req.body?.action !== undefined ||
        req.body?.rawContent !== undefined ||
        req.body?.deleteIp !== undefined ||
        req.body?.entry !== undefined);

    if (hasHostPayload) {
      const result = await updateLinuxHostsFileSSH(server, req.body, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: 'Update /etc/hosts',
        category: 'configuration',
        target: `${server.name || server.ip}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    const { entries, rawContent } = await fetchLinuxHostsFileSSH(server, ephemeralPassword);
    return res.json({ success: true, entries, rawContent });
  } catch (err: any) {
    console.error(`[LinuxHosts API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process /etc/hosts' });
  }
});

// 3.1 TCP Wrappers (/etc/hosts.allow and /etc/hosts.deny)
apiRouter.all('/remote-servers/:id/tcp-wrappers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const hasAction = req.method === 'POST' && (req.body?.action || req.body?.target);
    if (hasAction) {
      const result = await updateLinuxTcpWrappersSSH(server, req.body, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: `Update TCP Wrappers (/etc/hosts.${req.body.target || 'allow'})`,
        category: 'security',
        target: `${server.name || server.ip}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    const data = await fetchLinuxTcpWrappersSSH(server, ephemeralPassword);
    return res.json({ success: true, ...data });
  } catch (err: any) {
    console.error(`[LinuxTcpWrappers API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process TCP Wrappers' });
  }
});

// 4. DNS Configuration
apiRouter.all('/remote-servers/:id/dns', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (req.method === 'POST' && req.body?.nameservers) {
      const result = await updateLinuxDnsConfigSSH(server, req.body, ephemeralPassword);
      await addAuditLog({
        userName: 'Administrator',
        action: 'Update DNS Servers',
        category: 'configuration',
        target: `${server.name || server.ip}`,
        status: result.success ? 'success' : 'error',
        details: result.message,
        ipAddress: getClientIp(req),
      }).catch(() => {});
      return res.json(result);
    }

    const config = await fetchLinuxDnsConfigSSH(server, ephemeralPassword);
    return res.json({ success: true, config });
  } catch (err: any) {
    console.error(`[LinuxDns API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to process DNS configuration' });
  }
});

// 5. Fail2ban IPS
apiRouter.all('/remote-servers/:id/fail2ban', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const f2bStatus = await fetchLinuxFail2banSSH(server, ephemeralPassword);
    return res.json({ success: true, status: f2bStatus });
  } catch (err: any) {
    console.error(`[LinuxFail2ban API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch Fail2ban status' });
  }
});

apiRouter.post('/remote-servers/:id/fail2ban/control', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await controlLinuxFail2banSSH(server, action, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to control Fail2ban' });
  }
});

apiRouter.post('/remote-servers/:id/fail2ban/ip', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action, ip, jail, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await ipActionLinuxFail2banSSH(server, action, ip, jail, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to perform IP action in Fail2ban' });
  }
});

apiRouter.post('/remote-servers/:id/fail2ban/install', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await installLinuxFail2banSSH(server, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to install Fail2ban' });
  }
});

// 6. Time & Timezone Management
apiRouter.all('/remote-servers/:id/time', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const ephemeralPassword = req.body?.password || (req.query?.password as string);
    const { server, error, status, requires_password } = await getValidatedServer(id, ephemeralPassword);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const timeInfo = await fetchLinuxTimeInfoSSH(server, ephemeralPassword);
    return res.json({ success: true, timeInfo, info: timeInfo });
  } catch (err: any) {
    console.error(`[LinuxTime API Error for ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch time info' });
  }
});

apiRouter.post('/remote-servers/:id/time/timezone', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { timezone, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await updateLinuxTimezoneSSH(server, timezone, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to update timezone' });
  }
});

apiRouter.post('/remote-servers/:id/time/ntp', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await updateLinuxNtpSSH(server, enabled, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to update NTP' });
  }
});

apiRouter.post('/remote-servers/:id/time/set', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { datetime, password } = req.body;
    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await updateLinuxTimeSSH(server, datetime, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to set system time' });
  }
});

// ==========================================
// LINUX FILE EXPLORER & SFTP ENDPOINTS
// ==========================================

// GET & POST /api/remote-servers/:id/fs/list - List files and directories
apiRouter.all('/remote-servers/:id/fs/list', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const targetPath = (req.query.path || req.body.path || '/') as string;
    const password = (req.body?.password || req.query?.password) as string | undefined;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await listLinuxDirectory(server, targetPath, password);
    return res.json({ success: true, result });
  } catch (err: any) {
    console.error(`[LinuxFS list error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to list directory contents' });
  }
});

// GET /api/remote-servers/:id/fs/quick-dirs - Get system standard quick directories
apiRouter.get('/remote-servers/:id/fs/quick-dirs', async (_req: Request, res: Response) => {
  return res.json({ success: true, quickDirs: LINUX_QUICK_DIRECTORIES });
});

// GET & POST /api/remote-servers/:id/fs/read - Read text file content
apiRouter.all('/remote-servers/:id/fs/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const filePath = (req.query.path || req.body.path) as string;
    const password = (req.body?.password || req.query?.password) as string | undefined;

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const file = await readLinuxFile(server, filePath, password);
    return res.json({ success: true, file });
  } catch (err: any) {
    console.error(`[LinuxFS read error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to read file' });
  }
});

// POST /api/remote-servers/:id/fs/write - Write/save text file content
apiRouter.post('/remote-servers/:id/fs/write', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: filePath, content, password } = req.body;

    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'File path and content string are required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await writeLinuxFile(server, filePath, content, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFS write error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to write file' });
  }
});

// POST /api/remote-servers/:id/fs/mkdir - Create directory
apiRouter.post('/remote-servers/:id/fs/mkdir', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: dirPath, password } = req.body;

    if (!dirPath) {
      return res.status(400).json({ success: false, error: 'Directory path is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await createLinuxDirectory(server, dirPath, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to create directory' });
  }
});

// POST /api/remote-servers/:id/fs/touch - Create empty file
apiRouter.post('/remote-servers/:id/fs/touch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: filePath, password } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await createLinuxEmptyFile(server, filePath, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to create file' });
  }
});

// POST /api/remote-servers/:id/fs/rename - Rename or move file/directory
apiRouter.post('/remote-servers/:id/fs/rename', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { oldPath, newPath, password } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({ success: false, error: 'Both oldPath and newPath are required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await renameLinuxItem(server, oldPath, newPath, password);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to rename item' });
  }
});

// POST /api/remote-servers/:id/fs/paste - Copy or Cut (move) files/folders to target directory
apiRouter.post('/remote-servers/:id/fs/paste', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sourcePaths, targetDirectory, operation, password } = req.body;

    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      return res.status(400).json({ success: false, error: 'sourcePaths array must not be empty' });
    }
    if (!targetDirectory || typeof targetDirectory !== 'string') {
      return res.status(400).json({ success: false, error: 'targetDirectory is required' });
    }
    if (operation !== 'copy' && operation !== 'cut') {
      return res.status(400).json({ success: false, error: 'operation must be "copy" or "cut"' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await pasteLinuxItems(
      server,
      {
        sourcePaths,
        targetDirectory,
        operation,
      },
      password
    );

    await addAuditLog({
      userName: 'Administrator',
      action: operation === 'cut' ? 'Linux File(s) Moved/Cut' : 'Linux File(s) Copied',
      category: 'file_system',
      target: `Server ${server.name || server.ip}: ${targetDirectory}`,
      status: result.success ? 'success' : 'error',
      details: `${operation.toUpperCase()} ${result.processedCount} item(s) to "${targetDirectory}"`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFS paste error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to paste items' });
  }
});

// POST /api/remote-servers/:id/fs/compress - Compress files or directories with rich options
apiRouter.post('/remote-servers/:id/fs/compress', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sourcePaths, archiveName, destinationDir, format, compressionLevel, deleteSource, password } = req.body;

    if (!sourcePaths || !Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      return res.status(400).json({ success: false, error: 'sourcePaths array is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await compressLinuxItems(
      server,
      {
        sourcePaths,
        archiveName,
        destinationDir: destinationDir || '/',
        format,
        compressionLevel: typeof compressionLevel === 'number' ? compressionLevel : 6,
        deleteSource: Boolean(deleteSource),
      },
      password
    );

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFS compress error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to compress items' });
  }
});

// POST /api/remote-servers/:id/fs/extract - Extract archive on remote server
apiRouter.post('/remote-servers/:id/fs/extract', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { archivePath, destinationDir, createSubfolder, overwrite, deleteArchiveAfterExtract, password } = req.body;

    if (!archivePath) {
      return res.status(400).json({ success: false, error: 'archivePath is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await extractLinuxArchive(
      server,
      {
        archivePath,
        destinationDir: destinationDir || '/',
        createSubfolder: Boolean(createSubfolder),
        overwrite: overwrite !== false,
        deleteArchiveAfterExtract: Boolean(deleteArchiveAfterExtract),
      },
      password
    );

    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFS extract error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to extract archive' });
  }
});

// POST /api/remote-servers/:id/fs/delete - Delete file(s) or directory(ies)
apiRouter.post('/remote-servers/:id/fs/delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path: targetPath, paths, isRecursive, password } = req.body;

    const targets: string[] = [];
    if (Array.isArray(paths) && paths.length > 0) {
      for (const p of paths) {
        if (typeof p === 'string' && p.trim()) {
          targets.push(p.trim());
        }
      }
    } else if (typeof targetPath === 'string' && targetPath.trim()) {
      targets.push(targetPath.trim());
    }

    if (targets.length === 0) {
      return res.status(400).json({ success: false, error: 'Target path or paths are required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    // isRecursive defaults to true so folders with nested contents are deleted without error
    const recursiveFlag = isRecursive !== false;
    const result = await deleteLinuxItems(server, targets, recursiveFlag, password);
    return res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFS delete error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to delete items' });
  }
});

// POST & GET /api/remote-servers/:id/fs/download - Download file or compressed archive of multiple files/directories
apiRouter.all('/remote-servers/:id/fs/download', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const password = (req.body?.password || req.query?.password) as string | undefined;

    // Support single path or array of paths
    let paths: string[] = [];
    if (Array.isArray(req.body?.paths)) {
      paths = req.body.paths;
    } else if (typeof req.body?.path === 'string') {
      paths = [req.body.path];
    } else if (typeof req.query?.path === 'string') {
      paths = [req.query.path as string];
    } else if (Array.isArray(req.query?.paths)) {
      paths = req.query.paths as string[];
    }

    const cleanPaths = paths.map((p) => p.trim()).filter(Boolean);
    if (cleanPaths.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one file or folder path is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (cleanPaths.length === 1) {
      const singlePath = cleanPaths[0];
      const forceArchive = req.body?.archive === true || req.query?.archive === 'true';
      if (forceArchive) {
        const base = singlePath.split('/').filter(Boolean).pop() || 'folder';
        await downloadLinuxArchive(server, [singlePath], `${base}.zip`, res, password);
      } else {
        try {
          await downloadLinuxSingleFile(server, singlePath, res, password);
        } catch (singleErr: any) {
          if (!res.headersSent) {
            const base = singlePath.split('/').filter(Boolean).pop() || 'archive';
            await downloadLinuxArchive(server, [singlePath], `${base}.zip`, res, password);
          }
        }
      }
    } else {
      const archiveName = req.body?.archiveName || `server-files-${Date.now()}.zip`;
      await downloadLinuxArchive(server, cleanPaths, archiveName, res, password);
    }
  } catch (err: any) {
    console.error(`[LinuxFS download error on server ${req.params.id}]:`, err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to download files' });
    }
  }
});

// POST /api/remote-servers/:id/fs/upload - Upload file to remote server directory
apiRouter.post('/remote-servers/:id/fs/upload', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetDirectory, fileName, fileBase64, password } = req.body;

    if (!targetDirectory || typeof targetDirectory !== 'string') {
      return res.status(400).json({ success: false, error: 'Target directory is required' });
    }
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ success: false, error: 'File name is required' });
    }
    if (typeof fileBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'File data is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const buffer = Buffer.from(fileBase64, 'base64');
    const result = await uploadLinuxFile(server, targetDirectory, fileName, buffer, password);

    await addAuditLog({
      userName: 'Administrator',
      action: 'Linux Remote File Uploaded',
      category: 'file_system',
      target: `Server ${server.name}: ${result.path}`,
      status: 'success',
      details: `Uploaded file "${fileName}" (${result.bytesUploaded} bytes) to directory "${targetDirectory}"`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, result });
  } catch (err: any) {
    console.error(`[LinuxFS upload error on server ${req.params.id}]:`, err?.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to upload file' });
  }
});

// GET & POST /api/remote-servers/:id/fs/properties - Get detailed file or directory properties
apiRouter.all('/remote-servers/:id/fs/properties', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const targetPath = (req.query.path || req.body.path || '/') as string;
    const password = (req.body?.password || req.query?.password) as string | undefined;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const properties = await getLinuxItemProperties(server, targetPath, password);
    return res.json({ success: true, properties });
  } catch (err: any) {
    console.error(`[LinuxFS properties error on server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to inspect file properties' });
  }
});

// POST /api/remote-servers/:id/fs/update-attributes - Update permissions (chmod) and ownership (chown)
apiRouter.post('/remote-servers/:id/fs/update-attributes', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { path, mode, owner, group, recursive, password } = req.body;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ success: false, error: 'Target path is required' });
    }

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await updateLinuxItemAttributes(
      server,
      {
        path,
        mode: mode ? String(mode).trim() : undefined,
        owner: owner ? String(owner).trim() : undefined,
        group: group ? String(group).trim() : undefined,
        recursive: Boolean(recursive),
      },
      password
    );

    await addAuditLog({
      userName: 'Administrator',
      action: 'Linux File Attributes Updated',
      category: 'file_system',
      target: `Server ${server.name || server.ip}: ${path}`,
      status: 'success',
      details: `Permissions/Ownership updated on "${path}" (Mode: ${mode || '—'}, Owner: ${owner || '—'}, Group: ${group || '—'}, Recursive: ${Boolean(recursive)})`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json(result);
  } catch (err: any) {
    console.error(`[LinuxFS update-attributes error on server ${req.params.id}]:`, err?.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update file attributes' });
  }
});

// GET & POST /api/remote-servers/:id/fs/users-groups - Fetch real system user accounts and groups
apiRouter.all('/remote-servers/:id/fs/users-groups', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const password = (req.body?.password || req.query?.password) as string | undefined;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const result = await getLinuxSystemUsersAndGroups(server, password);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[LinuxFS users-groups error on server ${req.params.id}]:`, err?.message || err);
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch users and groups' });
  }
});

// ==========================================
// LINUX CRON JOBS MANAGEMENT ENDPOINTS
// ==========================================

// GET & POST /api/remote-servers/:id/cron-jobs - List cron jobs
const handleFetchCronJobs = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const targetUser = (req.query?.user || req.body?.user) as string | undefined;
    const password = (req.query?.password || req.body?.password || req.headers['x-server-password']) as string | undefined;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    const overview = await fetchLinuxCronOverviewSSH(server, password, targetUser);
    return res.json({ success: true, ...overview });
  } catch (err: any) {
    console.error(`[Cron Overview Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch cron jobs from target Linux host',
    });
  }
};

apiRouter.get('/remote-servers/:id/cron-jobs', handleFetchCronJobs);
apiRouter.post('/remote-servers/:id/cron-jobs', handleFetchCronJobs);

// POST /api/remote-servers/:id/cron-jobs/save - Create or edit cron job
apiRouter.post('/remote-servers/:id/cron-jobs/save', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payload, password } = req.body;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (!payload || !payload.schedule || !payload.command) {
      return res.status(400).json({ success: false, error: 'Missing required payload (schedule, command)' });
    }

    const result = await saveLinuxCronJobSSH(server, payload, password);

    await addAuditLog({
      userName: 'Administrator',
      action: payload.originalCommand ? 'Cron Job Updated' : 'Cron Job Created',
      category: 'operation',
      target: `${server.name || server.ip} (${payload.user || 'root'})`,
      status: 'success',
      details: `Schedule: "${payload.schedule}", Command: "${payload.command}"`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Save Cron Job Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to save cron job on remote server',
    });
  }
});

// POST /api/remote-servers/:id/cron-jobs/toggle - Enable / Disable (pause/stop) cron job
apiRouter.post('/remote-servers/:id/cron-jobs/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payload, password } = req.body;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (!payload || !payload.command || !payload.schedule || typeof payload.enable !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid toggle parameters' });
    }

    const result = await toggleLinuxCronJobSSH(server, payload, password);

    await addAuditLog({
      userName: 'Administrator',
      action: payload.enable ? 'Cron Job Resumed/Enabled' : 'Cron Job Paused/Stopped',
      category: 'operation',
      target: `${server.name || server.ip} (${payload.user || 'root'})`,
      status: 'success',
      details: `Command: "${payload.command}"`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Toggle Cron Job Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to toggle cron job state',
    });
  }
});

// POST /api/remote-servers/:id/cron-jobs/delete - Delete cron job
apiRouter.post('/remote-servers/:id/cron-jobs/delete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payload, password } = req.body;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (!payload || !payload.command) {
      return res.status(400).json({ success: false, error: 'Missing required cron command for deletion' });
    }

    const result = await deleteLinuxCronJobSSH(server, payload, password);

    await addAuditLog({
      userName: 'Administrator',
      action: 'Cron Job Deleted',
      category: 'operation',
      target: `${server.name || server.ip} (${payload.user || 'root'})`,
      status: 'success',
      details: `Removed command: "${payload.command}"`,
      ipAddress: getClientIp(req),
    }).catch(() => {});

    return res.json(result);
  } catch (err: any) {
    console.error(`[Delete Cron Job Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete cron job',
    });
  }
});

// POST /api/remote-servers/:id/cron-jobs/run-now - Execute cron job command immediately
apiRouter.post('/remote-servers/:id/cron-jobs/run-now', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payload, password } = req.body;

    const { server, error, status, requires_password } = await getValidatedServer(id, password);
    if (!server) return res.status(status || 400).json({ success: false, error, requires_password });

    if (!payload || !payload.command) {
      return res.status(400).json({ success: false, error: 'Missing command to run' });
    }

    const result = await runLinuxCronJobNowSSH(server, payload, password);

    return res.json({ success: true, result });
  } catch (err: any) {
    console.error(`[Run Cron Job Error for server ${req.params.id}]:`, err?.message || err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute cron job command',
    });
  }
});

// ==========================================
// BULK LINUX SERVER CONFIGURATION ENDPOINTS
// ==========================================

// GET /api/bulk-server-config/templates - Get all Linux server configuration templates
apiRouter.get('/bulk-server-config/templates', (_req: Request, res: Response) => {
  try {
    const templates = getBulkServerTemplates();
    res.json({ success: true, templates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bulk-server-config/preview - Generate distribution-aware commands preview
apiRouter.post('/bulk-server-config/preview', async (req: Request, res: Response) => {
  try {
    const { templateId, parameters, serverIds } = req.body;
    if (!templateId || !Array.isArray(serverIds) || serverIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'templateId and non-empty serverIds array are required'
      });
    }

    const preview = await generateBulkServerPreview(templateId, parameters || {}, serverIds);
    res.json({ success: true, preview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bulk-server-config/jobs - Initiate fleet execution job
apiRouter.post('/bulk-server-config/jobs', async (req: Request, res: Response) => {
  try {
    const { templateId, parameters, serverIds, timeoutSec, delayMs, dangerConfirmation, ephemeralPassword, operatorUser } = req.body;
    if (!templateId || !Array.isArray(serverIds) || serverIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'templateId and non-empty serverIds array are required'
      });
    }

    const effectiveUser = operatorUser || (req as any).user?.username || 'Administrator';

    const result = await startBulkServerJob({
      templateId,
      parameters: parameters || {},
      serverIds,
      timeoutSec: Number(timeoutSec) || undefined,
      delayMs: Number(delayMs) || 500,
      dangerConfirmation,
      ephemeralPassword,
      operatorUser: effectiveUser,
    });

    res.json({ success: true, jobId: result.jobId });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/bulk-server-config/jobs/:jobId - Poll job status, progress, logs & per-server stdout/stderr
apiRouter.get('/bulk-server-config/jobs/:jobId', (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = getBulkServerJobStatus(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bulk-server-config/jobs/:jobId/cancel - Cancel active job
apiRouter.post('/bulk-server-config/jobs/:jobId/cancel', (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const cancelled = cancelBulkServerJob(jobId);
    res.json({ success: true, cancelled });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// BULK SERVER EXECUTION REPORTS & AUDIT TRAIL
// ==========================================

// GET /api/bulk-server-config/reports - List all execution reports
apiRouter.get('/bulk-server-config/reports', async (_req: Request, res: Response) => {
  try {
    const reports = await getBulkServerReportsList();
    res.json({ success: true, reports });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/bulk-server-config/reports/:reportId - Get single execution report details
apiRouter.get('/bulk-server-config/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const report = await getBulkServerReportDetails(reportId);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/bulk-server-config/reports/:reportId - Delete single report
apiRouter.delete('/bulk-server-config/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const deleted = await deleteBulkServerReportEntry(reportId);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/bulk-server-config/reports - Clear all reports
apiRouter.delete('/bulk-server-config/reports', async (_req: Request, res: Response) => {
  try {
    const cleared = await clearAllBulkServerReportsList();
    res.json({ success: true, cleared });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bulk-server-config/reports - Save or import report(s) into database
apiRouter.post('/bulk-server-config/reports', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (Array.isArray(body)) {
      let count = 0;
      for (const item of body) {
        if (item && (item.id || item.jobId)) {
          await saveBulkServerReportEntry(item);
          count++;
        }
      }
      return res.json({ success: true, imported: count, message: `${count} reports imported successfully.` });
    } else if (body && (body.id || body.jobId)) {
      await saveBulkServerReportEntry(body);
      return res.json({ success: true, saved: true, reportId: body.id || body.jobId });
    }
    return res.status(400).json({ success: false, error: 'Invalid report data payload' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/bulk-server-config/reports-stats - Get database storage status & counts
apiRouter.get('/bulk-server-config/reports-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getBulkServerReportsStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SERVER CATEGORIES REST ENDPOINTS
// ==========================================

// GET /api/server-categories - List all categories with live server counts
apiRouter.get('/server-categories', async (_req: Request, res: Response) => {
  try {
    const categories = await getAllServerCategories();
    res.json({ success: true, categories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/server-categories/:id - Get single category
apiRouter.get('/server-categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await getServerCategoryById(id);
    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, category });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/server-categories - Create a new category
apiRouter.post('/server-categories', async (req: Request, res: Response) => {
  try {
    const { name, name_fa, description, color } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }
    const created = await createServerCategory({
      name: name.trim(),
      name_fa: name_fa ? String(name_fa).trim() : undefined,
      description: description ? String(description).trim() : undefined,
      color: color ? String(color).trim() : 'indigo',
    });
    res.status(201).json({ success: true, category: created });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/server-categories/:id - Update existing category (cascades server fleet on rename)
apiRouter.put('/server-categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, name_fa, description, color } = req.body;
    const updated = await updateServerCategory(id, {
      name: name ? String(name).trim() : undefined,
      name_fa: name_fa !== undefined ? String(name_fa).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      color: color !== undefined ? String(color).trim() : undefined,
    });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, category: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/server-categories/:id - Delete category with optional reassignTo
apiRouter.delete('/server-categories/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const reassignTo = (req.query.reassignTo as string | undefined) || req.body?.reassignTo;
    const result = await deleteServerCategory(id, reassignTo);
    res.json({
      success: true,
      reassignedCount: result.reassignedCount,
      targetCategory: result.targetCategory,
      message: `Category deleted. ${result.reassignedCount} server(s) moved to "${result.targetCategory}".`,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// =============================================================================
// USER PASSWORD VAULT API (PER-USER ISOLATED)
// =============================================================================

function resolveVaultUser(req: Request): { userId: string; username: string } | null {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.userId) {
      return { userId: payload.userId, username: payload.username };
    }
  }
  const headerUserId = req.headers['x-user-id'];
  const headerUsername = req.headers['x-username'];
  if (typeof headerUserId === 'string' && headerUserId.trim()) {
    return {
      userId: headerUserId.trim(),
      username: typeof headerUsername === 'string' ? headerUsername.trim() : 'User',
    };
  }
  return null;
}

// GET /api/vault - Get all vault items for the authenticated user
apiRouter.get('/vault', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required to access password vault' });
    }

    const items = await getUserVaultItems(user.userId);
    // Sanitize output so cipher data is hidden from standard list
    const sanitized = items.map((item) => ({
      id: item.id,
      userId: item.user_id,
      name: item.name,
      username: item.username || '',
      category: item.category || 'general',
      targetHost: item.target_host || '',
      notes: item.notes || '',
      tags: item.tags || [],
      strength: item.strength || 'strong',
      hasPassword: true,
      maskedPassword: '••••••••••••',
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    res.json({
      success: true,
      userId: user.userId,
      items: sanitized,
      count: sanitized.length,
    });
  } catch (err: any) {
    console.error('[API /vault error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vault - Save a new vault item
apiRouter.post('/vault', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required to store passwords' });
    }

    const { name, password, username, category, targetHost, notes, tags, strength } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Password name/label is required' });
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ success: false, error: 'Password value is required' });
    }

    // Encrypt password using AES-256-GCM keyed to this specific user
    const enc = encryptVaultSecret(password.trim(), user.userId);

    const saved = await saveUserVaultItem({
      id: `vault_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      user_id: user.userId,
      name: name.trim(),
      username: (username || '').trim(),
      encrypted_password: enc.ciphertext,
      iv: enc.iv,
      tag: enc.tag,
      password_hash: enc.hash,
      password_salt: enc.salt,
      category: (category || 'general').trim(),
      target_host: (targetHost || '').trim(),
      notes: (notes || '').trim(),
      tags: Array.isArray(tags) ? tags : [],
      strength: strength || 'strong',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Item Created',
      category: 'security',
      target: `Vault / ${saved.name}`,
      status: 'success',
      details: `User created encrypted vault credential for "${saved.name}" (Category: ${saved.category})`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      item: {
        id: saved.id,
        userId: saved.user_id,
        name: saved.name,
        username: saved.username,
        category: saved.category,
        targetHost: saved.target_host,
        notes: saved.notes,
        tags: saved.tags,
        strength: saved.strength,
        hasPassword: true,
        maskedPassword: '••••••••••••',
        createdAt: saved.created_at,
        updatedAt: saved.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[API POST /vault error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/vault/:id - Update an existing vault item
apiRouter.put('/vault/:id', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const existing = await getUserVaultItemById(id, user.userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Vault item not found or unauthorized' });
    }

    const { name, password, username, category, targetHost, notes, tags, strength } = req.body || {};

    let ciphertext = existing.encrypted_password;
    let iv = existing.iv;
    let tag = existing.tag;
    let passwordHash = existing.password_hash;
    let passwordSalt = existing.password_salt;

    // If new password provided, re-encrypt and re-hash
    if (password && typeof password === 'string' && password.trim()) {
      const enc = encryptVaultSecret(password.trim(), user.userId);
      ciphertext = enc.ciphertext;
      iv = enc.iv;
      tag = enc.tag;
      passwordHash = enc.hash;
      passwordSalt = enc.salt;
    }

    const updated = await saveUserVaultItem({
      id: existing.id,
      user_id: user.userId,
      name: name !== undefined ? String(name).trim() : existing.name,
      username: username !== undefined ? String(username).trim() : existing.username,
      encrypted_password: ciphertext,
      iv,
      tag,
      password_hash: passwordHash,
      password_salt: passwordSalt,
      category: category !== undefined ? String(category).trim() : existing.category,
      target_host: targetHost !== undefined ? String(targetHost).trim() : existing.target_host,
      notes: notes !== undefined ? String(notes).trim() : existing.notes,
      tags: Array.isArray(tags) ? tags : existing.tags,
      strength: strength !== undefined ? String(strength) : existing.strength,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    });

    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Item Updated',
      category: 'security',
      target: `Vault / ${updated.name}`,
      status: 'success',
      details: `User updated vault credential "${updated.name}"`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      item: {
        id: updated.id,
        userId: updated.user_id,
        name: updated.name,
        username: updated.username,
        category: updated.category,
        targetHost: updated.target_host,
        notes: updated.notes,
        tags: updated.tags,
        strength: updated.strength,
        hasPassword: true,
        maskedPassword: '••••••••••••',
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[API PUT /vault/:id error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/vault/:id - Delete a vault item
apiRouter.delete('/vault/:id', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { id } = req.params;
    const existing = await getUserVaultItemById(id, user.userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Vault item not found or unauthorized' });
    }

    const deleted = await deleteUserVaultItem(id, user.userId);

    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Item Deleted',
      category: 'security',
      target: `Vault / ${existing.name}`,
      status: 'warning',
      details: `User permanently deleted vault credential "${existing.name}"`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: deleted });
  } catch (err: any) {
    console.error('[API DELETE /vault/:id error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/vault/:id/reveal - On-demand real-time decryption of a password with mandatory user password verification
apiRouter.post('/vault/:id/reveal', async (req: Request, res: Response) => {
  try {
    const user = resolveVaultUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Authentication required to reveal password' });
    }

    const { id } = req.params;
    const rawPassword = req.body?.loginPassword ?? req.body?.password;
    const loginPassword = typeof rawPassword === 'string' ? rawPassword.trim() : '';

    const ip = getClientIp(req);
    const rateLimitKey = `vault_reveal_${user.userId}_${ip}`;
    const rateLimitStatus = checkRateLimit(rateLimitKey);

    if (rateLimitStatus.locked) {
      await addAuditLog({
        userName: user.username,
        action: 'Vault Unlock Rate Limit Exceeded',
        category: 'security',
        target: 'Password Vault',
        status: 'warning',
        details: `Too many failed vault unlock attempts for user "${user.username}" from IP ${ip}. Locked for ${rateLimitStatus.remainingSec}s.`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(429).json({
        success: false,
        locked: true,
        remainingSec: rateLimitStatus.remainingSec,
        error: `Too many failed attempts. Vault reveal locked for ${rateLimitStatus.remainingSec} seconds.`,
        message: `تعداد تلاش‌های ناموفق بیش از حد مجاز بود. لطفاً ${rateLimitStatus.remainingSec} ثانیه دیگر مجدداً تلاش فرمایید.`,
      });
    }

    // Require master login password
    if (!loginPassword || typeof loginPassword !== 'string' || !loginPassword.trim()) {
      return res.status(400).json({
        success: false,
        requireAuth: true,
        error: 'User login password is required to reveal this credential.',
        message: 'جهت مشاهده یا کپی گذرواژه، ورود رمز عبور حساب کاربری الزامی است.',
      });
    }

    // Authenticate user's login password against their user record
    let userRecord = (await findUserById(user.userId)) || (await findUserByUsername(user.username));
    if (!userRecord) {
      try {
        const allUsers = await getAllUsers();
        userRecord = allUsers.find(
          (u: any) =>
            (u.id && u.id === user.userId) ||
            (u.username && u.username.toLowerCase() === user.username.toLowerCase())
        ) || null;
      } catch (err) {
        // ignore fallback error
      }
    }
    let isPasswordValid = false;

    if (userRecord && userRecord.password_hash && userRecord.password_salt) {
      isPasswordValid = verifyPassword(loginPassword, userRecord.password_hash, userRecord.password_salt);
    } else if (userRecord && userRecord.user_type === 'ad') {
      // AD accounts or external auth fallback
      isPasswordValid = loginPassword.length >= 4;
    }

    if (!isPasswordValid) {
      const penalty = recordFailedLogin(rateLimitKey);
      await addAuditLog({
        userName: user.username,
        action: 'Failed Vault Master Verification',
        category: 'security',
        target: `Vault / ID ${id}`,
        status: 'warning',
        details: `Invalid master password entered when attempting to reveal vault secret from IP ${ip}`,
        ipAddress: ip,
        userAgent: req.headers['user-agent'],
      });

      return res.status(401).json({
        success: false,
        requireAuth: true,
        error: 'Invalid login password. Access to vault secret denied.',
        message: 'رمز عبور حساب کاربری اشتباه است. دسترسی به گذرواژه تأیید نشد.',
        attemptsLeft: penalty.attemptsLeft,
        locked: penalty.locked,
        remainingSec: penalty.remainingSec,
      });
    }

    // Master password successfully verified: reset rate limiter
    clearRateLimit(rateLimitKey);

    const item = await getUserVaultItemById(id, user.userId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Vault item not found or unauthorized' });
    }

    const plainPassword = decryptVaultSecret(item.encrypted_password, item.iv, item.tag, user.userId);

    // Audit the reveal action for security compliance
    await addAuditLog({
      userName: user.username,
      action: 'Password Vault Secret Revealed',
      category: 'security',
      target: `Vault / ${item.name}`,
      status: 'info',
      details: `User verified master password and revealed secret for "${item.name}" from IP ${ip}`,
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      id: item.id,
      name: item.name,
      password: plainPassword,
    });
  } catch (err: any) {
    console.error('[API /vault/:id/reveal error]', err);
    res.status(500).json({ success: false, error: 'Decryption failed: ' + err.message });
  }
});


