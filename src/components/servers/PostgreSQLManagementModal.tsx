import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Server,
  Key,
  ShieldCheck,
  Terminal,
  Activity,
  Layers,
  Settings,
  Lock,
  Search,
  HardDrive,
  BarChart3,
  Cpu,
  Table,
  Check,
  Radio,
  Sliders,
  ChevronRight,
  Users,
  Archive,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresConnectionTestResult,
  PostgresConnectionStatus,
  PostgresEngineOverview,
  PostgresDatabaseItem,
} from '../../types';
import {
  testRemoteServerPostgresConnection,
  fetchRemoteServerPostgresOverview,
  fetchRemoteServerPostgresDatabases,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { PostgresDatabaseBrowserTab } from './PostgresDatabaseBrowserTab';
import { PostgresSqlEditorTab } from './PostgresSqlEditorTab';
import { PostgresRolesManagerTab } from './PostgresRolesManagerTab';
import { PostgresPermissionsManagerTab } from './PostgresPermissionsManagerTab';
import { PostgresDatabaseLifecycleTab } from './PostgresDatabaseLifecycleTab';
import { PostgresBackupManagerTab } from './PostgresBackupManagerTab';

export interface PostgreSQLManagementModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  onClose: () => void;
  onMinimize?: () => void;
  onOpenTerminal?: (server: RemoteServer) => void;
  onEditServer?: (server: RemoteServer) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

type PostgresTab = 'browser' | 'sql' | 'roles' | 'permissions' | 'databases' | 'backups' | 'overview' | 'connection';

export const PostgreSQLManagementModal: React.FC<PostgreSQLManagementModalProps> = ({
  isOpen,
  server,
  onClose,
  onMinimize,
  onOpenTerminal,
  onEditServer,
  isLightMode = false,
  isEn = true,
}) => {
  const [activeTab, setActiveTab] = useState<PostgresTab>('browser');
  const [isMaximized, setIsMaximized] = useState(false);

  // Phase 8: SQL Query Editor Initial States
  const [sqlEditorInitialQuery, setSqlEditorInitialQuery] = useState<string | undefined>(undefined);
  const [sqlEditorTargetDb, setSqlEditorTargetDb] = useState<string | undefined>(undefined);
  const [sqlEditorTargetSchema, setSqlEditorTargetSchema] = useState<string | undefined>(undefined);

  // Connection Test State
  const [testing, setTesting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<PostgresConnectionTestResult | null>(null);
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);

  // Overview Telemetry State
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewData, setOverviewData] = useState<PostgresEngineOverview | null>(null);
  const [overviewError, setOverviewError] = useState<{ en: string; fa?: string } | null>(null);

  // Database Catalog State
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [databases, setDatabases] = useState<PostgresDatabaseItem[]>([]);
  const [databasesError, setDatabasesError] = useState<{ en: string; fa?: string } | null>(null);
  const [includeTemplates, setIncludeTemplates] = useState(false);
  const [dbSearchQuery, setDbSearchQuery] = useState('');

  // Run connection test
  const handleTestConnection = useCallback(async () => {
    if (!server?.id) return;
    setTesting(true);
    try {
      const res = await testRemoteServerPostgresConnection(server.id);
      setConnectionResult(res);
      setLastTestedAt(new Date().toLocaleTimeString());
      return res;
    } catch (err: any) {
      const failedRes: PostgresConnectionTestResult = {
        success: false,
        status: 'unknown_error',
        message: err.message || 'Failed to execute PostgreSQL connection test',
        messageFa: 'خطا در اجرای آزمایش ارتباط با PostgreSQL',
        serverAddress: server.ip,
        port: server.postgres_port || 5432,
        username: server.postgres_user || 'postgres',
        testedAt: new Date().toISOString(),
        errorDetail: err.message,
      };
      setConnectionResult(failedRes);
      setLastTestedAt(new Date().toLocaleTimeString());
      return failedRes;
    } finally {
      setTesting(false);
    }
  }, [server]);

  // Fetch overview telemetry
  const handleFetchOverview = useCallback(async () => {
    if (!server?.id) return;
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await fetchRemoteServerPostgresOverview(server.id);
      if (res.success && res.data) {
        setOverviewData(res.data);
      } else {
        setOverviewError({
          en: res.error || 'Failed to load PostgreSQL telemetry overview',
          fa: res.errorFa || 'خطا در دریافت تله‌متری موتور PostgreSQL',
        });
      }
    } catch (err: any) {
      setOverviewError({
        en: err.message || 'Network error while fetching overview telemetry',
        fa: 'خطای شبکه هنگام دریافت اطلاعات کلی پایگاه داده',
      });
    } finally {
      setLoadingOverview(false);
    }
  }, [server]);

  // Fetch database catalog
  const handleFetchDatabases = useCallback(async (withTemplates = includeTemplates) => {
    if (!server?.id) return;
    setLoadingDatabases(true);
    setDatabasesError(null);
    try {
      const res = await fetchRemoteServerPostgresDatabases(server.id, {
        includeTemplates: withTemplates,
      });
      if (res.success && res.databases) {
        setDatabases(res.databases);
      } else {
        setDatabasesError({
          en: res.error || 'Failed to enumerate database catalog',
          fa: res.errorFa || 'خطا در بارگذاری فهرست پایگاه‌های داده',
        });
      }
    } catch (err: any) {
      setDatabasesError({
        en: err.message || 'Network error listing databases',
        fa: 'خطای شبکه در بارگذاری پایگاه‌های داده',
      });
    } finally {
      setLoadingDatabases(false);
    }
  }, [server, includeTemplates]);

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen && server) {
      setConnectionResult(null);
      setOverviewData(null);
      setDatabases([]);
      handleTestConnection().then((testRes) => {
        if (testRes?.success) {
          handleFetchOverview();
          handleFetchDatabases();
        }
      });
    }
  }, [isOpen, server?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When templates toggle changes, refresh databases
  const handleToggleTemplates = (checked: boolean) => {
    setIncludeTemplates(checked);
    handleFetchDatabases(checked);
  };

  // Filtered databases list
  const filteredDatabases = useMemo(() => {
    if (!dbSearchQuery.trim()) return databases;
    const q = dbSearchQuery.trim().toLowerCase();
    return databases.filter(
      (db) =>
        db.name.toLowerCase().includes(q) ||
        db.owner.toLowerCase().includes(q) ||
        db.tablespace.toLowerCase().includes(q)
    );
  }, [databases, dbSearchQuery]);

  // Calculate total database size
  const totalDatabasesSize = useMemo(() => {
    const bytes = databases.reduce((acc, db) => acc + (db.sizeBytes || 0), 0);
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }, [databases]);

  if (!isOpen || !server) return null;

  const getStatusBadge = () => {
    if (testing) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
          <span>{isEn ? 'Connecting...' : 'در حال اتصال...'}</span>
        </span>
      );
    }

    if (!connectionResult) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-slate-500/15 text-slate-400 border border-slate-500/30">
          <Clock className="w-3.5 h-3.5" />
          <span>{isEn ? 'Untested' : 'آزمایش‌نشده'}</span>
        </span>
      );
    }

    switch (connectionResult.status) {
      case 'connected':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="font-bold">{isEn ? 'Connected' : 'متصل'}</span>
          </span>
        );
      case 'authentication_failed':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold">{isEn ? 'Auth Failed' : 'خطای احراز هویت'}</span>
          </span>
        );
      case 'connection_refused':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-bold">{isEn ? 'Refused' : 'ارتباط رد شد'}</span>
          </span>
        );
      case 'timeout':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span className="font-bold">{isEn ? 'Timeout' : 'پایان مهلت زمان'}</span>
          </span>
        );
      case 'permission_denied':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-bold">{isEn ? 'Permission Denied' : 'دسترسی مجاز نیست'}</span>
          </span>
        );
      case 'database_unavailable':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            <span className="font-bold">{isEn ? 'DB Unavailable' : 'دیتابیس ناموجود'}</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-bold">{isEn ? 'Connection Failed' : 'خطای اتصال'}</span>
          </span>
        );
    }
  };

  const modalContent = (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 ${
        isMaximized ? 'p-0!' : ''
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col rounded-2xl shadow-2xl overflow-hidden border transition-all duration-200 ${
          isMaximized ? 'w-full h-full rounded-none border-0' : 'w-full max-w-5xl h-[88vh] max-h-[92vh]'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* 1. HEADER (Universal 3-Button Standard + Navigation Tabs) */}
        {/* ======================================================== */}
        <div
          className={`px-4 sm:px-6 py-3 border-b select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-sm sm:text-base truncate">
                    {server.name} — {isEn ? 'PostgreSQL Management' : 'مدیریت پایگاه داده PostgreSQL'}
                  </h2>
                  {getStatusBadge()}
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                  {server.ip}:{server.postgres_port || 5432} • {server.postgres_user || 'postgres'} • {server.os_distro || 'Linux'}
                </p>
              </div>
            </div>

            {/* Controls: Minimize, Fullscreen, Close */}
            <div className="flex items-center gap-1.5 shrink-0">
              {onMinimize && (
                <button
                  type="button"
                  onClick={onMinimize}
                  title={isEn ? 'Minimize to Dock' : 'کوچک‌سازی به داک'}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    isLightMode
                      ? 'hover:bg-slate-100 text-slate-600'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Minus className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-slate-100 text-slate-600'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onClose}
                title={isEn ? 'Close' : 'بستن'}
                className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-700/20 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('browser')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'browser'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isEn ? 'Database Browser' : 'کاوشگر پایگاه داده'}</span>
            </button>

            {/* TAB: SQL QUERY EDITOR & WORKSPACE (Phase 8) */}
            <button
              type="button"
              onClick={() => setActiveTab('sql')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'sql'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>{isEn ? 'SQL Editor' : 'ادیتور SQL'}</span>
            </button>

            {/* TAB: USERS & ROLES MANAGEMENT (Phase 10) */}
            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'roles'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isEn ? 'Users & Roles' : 'کاربران و نقش‌ها'}</span>
            </button>

            {/* TAB: PERMISSIONS & ACCESS MANAGEMENT (Phase 11) */}
            <button
              type="button"
              onClick={() => setActiveTab('permissions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'permissions'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'Permissions (GRANT/REVOKE)' : 'سطوح دسترسی و مجوزها'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isEn ? 'Overview & Health' : 'نمای کلی و سلامت موتور'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('databases')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'databases'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isEn ? 'Databases & Schemas' : 'دیتابیس‌ها و اسکیماها'}</span>
              {databases.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white/90">
                  {databases.length}
                </span>
              )}
            </button>

            {/* TAB: BACKUP & RESTORE MANAGEMENT (Phase 13) */}
            <button
              type="button"
              onClick={() => setActiveTab('backups')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'backups'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5 text-amber-400" />
              <span>{isEn ? 'Backup & Restore' : 'بکاپ و بازیابی'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('connection')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'connection'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isEn ? 'Connection & Security' : 'اتصال و امنیت'}</span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. BODY CONTENT (Per Active Tab)                          */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TAB 0: DATABASE BROWSER (Tree & Object Inspector) */}
          {activeTab === 'browser' && (
            <PostgresDatabaseBrowserTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              databases={databases}
              overviewData={overviewData}
              onRefreshDatabases={() => handleFetchDatabases(includeTemplates)}
              onRefreshOverview={handleFetchOverview}
              onOpenSqlEditor={(query, db, schema) => {
                setSqlEditorInitialQuery(query);
                if (db) setSqlEditorTargetDb(db);
                if (schema) setSqlEditorTargetSchema(schema);
                setActiveTab('sql');
              }}
            />
          )}

          {/* TAB 1: SQL QUERY EDITOR & WORKSPACE (Phase 8) */}
          {activeTab === 'sql' && (
            <PostgresSqlEditorTab
              server={server}
              databases={databases}
              defaultDatabase={
                sqlEditorTargetDb ||
                databases.find((d) => d.name === 'postgres')?.name ||
                databases[0]?.name ||
                'postgres'
              }
              defaultSchema={sqlEditorTargetSchema || 'public'}
              initialQuery={sqlEditorInitialQuery}
              isLightMode={isLightMode}
              isEn={isEn}
            />
          )}

          {/* TAB 1.5: USERS & ROLES MANAGEMENT (Phase 10) */}
          {activeTab === 'roles' && (
            <PostgresRolesManagerTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              onRefreshOverview={handleFetchOverview}
            />
          )}

          {/* TAB 1.6: PERMISSIONS & ACCESS MANAGEMENT (Phase 11) */}
          {activeTab === 'permissions' && (
            <PostgresPermissionsManagerTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              initialDatabase={server.postgres_database || 'postgres'}
            />
          )}

          {/* TAB 2: OVERVIEW & HEALTH */}
          {activeTab === 'overview' && (

            <div className="space-y-5">
              {/* Top Quick Actions Bar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <span>{isEn ? 'PostgreSQL Engine Telemetry' : 'تله‌متری زنده موتور PostgreSQL'}</span>
                  </h3>
                  {overviewData?.clusterRole && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono ${
                        overviewData.clusterRole === 'primary'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                      }`}
                    >
                      {overviewData.clusterRole === 'primary'
                        ? isEn ? 'PRIMARY (RW)' : 'پرایمری (نوشتن و خواندن)'
                        : isEn ? 'STANDBY (RO)' : 'استندبای (فقط‌خواندنی)'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loadingOverview}
                    onClick={() => {
                      handleTestConnection();
                      handleFetchOverview();
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
                    <span>{loadingOverview ? (isEn ? 'Refreshing...' : 'در حال بارگذاری...') : (isEn ? 'Refresh Metrics' : 'تازه‌سازی داده‌ها')}</span>
                  </button>
                </div>
              </div>

              {/* Notice if not connected */}
              {connectionResult && !connectionResult.success && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 ${
                    isLightMode ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs leading-relaxed">
                    <h4 className="font-bold">
                      {isEn ? 'PostgreSQL Connection Offline' : 'عدم برقراری ارتباط با پایگاه داده'}
                    </h4>
                    <p className="text-[11px] opacity-90">
                      {isEn ? connectionResult.message : (connectionResult.messageFa || connectionResult.message)}
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('connection')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Go to Connection & Credentials Setup' : 'ورود به بخش تنظیمات اتصال و اعتبار'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Overview Error Banner if overview failed */}
              {overviewError && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                    isLightMode ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{isEn ? overviewError.en : (overviewError.fa || overviewError.en)}</span>
                </div>
              )}

              {/* Engine Metrics Grid */}
              {overviewData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Engine Version */}
                  <div
                    className={`p-4 rounded-xl border space-y-2 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs border-b pb-2">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-blue-400" />
                        <span>{isEn ? 'Engine Version' : 'نسخه موتور'}</span>
                      </span>
                      <FieldInfoTooltip
                        title={isEn ? 'PostgreSQL Engine Version' : 'نسخه موتور PostgreSQL'}
                        whatIsIt={
                          isEn
                            ? 'The exact major and minor release version reported by server_version parameter.'
                            : 'نسخه دقیق کامپایل و ماژول‌های فعال PostgreSQL روی سرور.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Essential for verifying SQL syntax compatibility, feature support, and security patch levels.'
                            : 'اطمینان از سازگاری سینتکس، قابلیت‌ها و آخرین به‌روزرسانی‌های امنیتی.'
                        }
                        example={overviewData.versionShort}
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="font-mono font-bold text-base text-blue-400 truncate">
                      {overviewData.versionShort}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate font-mono">
                      {overviewData.inRecovery ? (isEn ? 'Standby (Read-Only)' : 'استندبای (فقط خواندنی)') : (isEn ? 'Primary (Read-Write)' : 'پرایمری (خواندن و نوشتن)')}
                    </p>
                  </div>

                  {/* Card 2: Engine Uptime */}
                  <div
                    className={`p-4 rounded-xl border space-y-2 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs border-b pb-2">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{isEn ? 'Engine Uptime' : 'مدت زمان پایداری'}</span>
                      </span>
                      <FieldInfoTooltip
                        title={isEn ? 'Postmaster Process Uptime' : 'مدت زمان فعالیت پروسه اصلی'}
                        whatIsIt={
                          isEn
                            ? 'Elapsed time since the PostgreSQL postmaster daemon was initiated.'
                            : 'مدت زمان سپری شده از زمان استارت پروسه اصلی PostgreSQL (pg_postmaster_start_time).'
                        }
                        whyNeeded={
                          isEn
                            ? 'Indicates engine stability, unplanned restarts, or recent crash recovery.'
                            : 'سنجش پایداری سرویس و بررسی عدم بروز کرش یا ریستارت‌های ناخواسته.'
                        }
                        example="4d 12h 30m"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="font-mono font-bold text-base text-emerald-400 tabular-nums">
                      {overviewData.uptimePretty}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate font-mono">
                      {isEn ? 'Started: ' : 'شروع: '}
                      {new Date(overviewData.startTime).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Card 3: Storage & Data Directory */}
                  <div
                    className={`p-4 rounded-xl border space-y-2 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs border-b pb-2">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isEn ? 'Data Directory' : 'دایرکتوری داده‌ها'}</span>
                      </span>
                      <FieldInfoTooltip
                        title={isEn ? 'Cluster Data Directory' : 'مسیر ذخیره‌سازی فایل‌های پایگاه داده'}
                        whatIsIt={
                          isEn
                            ? 'Filesystem location of database cluster catalogs, tablespaces, and WAL files.'
                            : 'مسیر فیزیکی قرارگیری کاتالوگ دیتابیس، تیبل‌اسپیس‌ها و لاگ‌های تراکنش روی سرور لینوکس.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Required for storage capacity monitoring and snapshot backups.'
                            : 'ضروری جهت پایش فضای دیسک و سناریوهای بک‌آپ و اسنپ‌شات.'
                        }
                        example="/var/lib/postgresql/16/main"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="font-mono font-bold text-xs text-cyan-400 truncate" title={overviewData.dataDirectory}>
                      {overviewData.dataDirectory}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate font-mono">
                      wal_level: <span className="text-slate-300 font-bold">{overviewData.walLevel}</span>
                    </p>
                  </div>

                  {/* Card 4: Memory Buffers */}
                  <div
                    className={`p-4 rounded-xl border space-y-2 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs border-b pb-2">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
                        <span>{isEn ? 'Memory Buffers' : 'تخصیص حافظه (RAM)'}</span>
                      </span>
                      <FieldInfoTooltip
                        title={isEn ? 'PostgreSQL Shared Buffers & Work Mem' : 'بافر اشتراکی و حافظه کوئری‌ها'}
                        whatIsIt={
                          isEn
                            ? 'Amount of dedicated RAM allocated to PostgreSQL caching (shared_buffers) and query sorting (work_mem).'
                            : 'میزان حافظه RAM اختصاص‌یافته به کش حافظه سرور و اجرای سورت و جوین‌های سنگین.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Critical sizing parameter to ensure in-memory execution and optimal database latency.'
                            : 'پارامتر حیاتی تنظیم عملکرد پایگاه داده و جلوگیری از افت سرعت.'
                        }
                        example="shared_buffers: 128MB, work_mem: 4MB"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>
                    <div className="font-mono font-bold text-base text-purple-400 tabular-nums">
                      {overviewData.sharedBuffers}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate font-mono">
                      work_mem: <span className="text-slate-300 font-bold">{overviewData.workMem}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Connection Pool Health & Breakdown */}
              {overviewData && (
                <div
                  className={`p-4 sm:p-5 rounded-2xl border space-y-4 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="font-bold text-sm flex items-center gap-2">
                        <Radio className="w-4 h-4 text-emerald-400" />
                        <span>{isEn ? 'Connection Pool Utilization & Activity' : 'وضعیت اتصالات و استخر ارتباطی'}</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isEn
                          ? `Currently utilizing ${overviewData.connections.total} of ${overviewData.maxConnections} configured maximum client connections.`
                          : `در حال حاضر ${overviewData.connections.total} از حداکثر ${overviewData.maxConnections} اتصال مجاز مصرف شده است.`}
                      </p>
                    </div>

                    <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-black/20 text-slate-300 tabular-nums">
                      {overviewData.connections.usedPercentage}% {isEn ? 'Pool Capacity' : 'ظرفیت مصرفی'}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800/40 rounded-full h-3 overflow-hidden border border-slate-700/30 flex">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        overviewData.connections.usedPercentage > 85
                          ? 'bg-rose-500'
                          : overviewData.connections.usedPercentage > 60
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, overviewData.connections.usedPercentage))}%` }}
                    />
                  </div>

                  {/* 4 Connection States Tiles */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Active */}
                    <div className="p-3 rounded-xl bg-black/10 border border-slate-700/20 space-y-1">
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>{isEn ? 'ACTIVE' : 'فعال'}</span>
                      </span>
                      <div className="font-mono font-bold text-lg text-emerald-400 tabular-nums">
                        {overviewData.connections.active}
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {isEn ? 'Executing SQL' : 'در حال اجرای کوئری'}
                      </span>
                    </div>

                    {/* Idle */}
                    <div className="p-3 rounded-xl bg-black/10 border border-slate-700/20 space-y-1">
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>{isEn ? 'IDLE' : 'آماده‌به‌کار (Idle)'}</span>
                      </span>
                      <div className="font-mono font-bold text-lg text-cyan-400 tabular-nums">
                        {overviewData.connections.idle}
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {isEn ? 'Open socket' : 'سوکت باز منتظر دستور'}
                      </span>
                    </div>

                    {/* Idle in transaction */}
                    <div className="p-3 rounded-xl bg-black/10 border border-slate-700/20 space-y-1">
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>{isEn ? 'IDLE IN TX' : 'معلق در تراکنش'}</span>
                      </span>
                      <div className="font-mono font-bold text-lg text-amber-400 tabular-nums">
                        {overviewData.connections.idleInTransaction}
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {isEn ? 'Uncommitted Tx' : 'تراکنش باز بلاتکلیف'}
                      </span>
                    </div>

                    {/* Waiting */}
                    <div className="p-3 rounded-xl bg-black/10 border border-slate-700/20 space-y-1">
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        <span>{isEn ? 'WAITING' : 'در انتظار قفل'}</span>
                      </span>
                      <div className="font-mono font-bold text-lg text-purple-400 tabular-nums">
                        {overviewData.connections.waiting}
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {isEn ? 'Lock contention' : 'مسدود در صف قفل'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Performance Telemetry: Cache Hit Ratio & Transactions */}
              {overviewData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cache Hit Ratio */}
                  <div
                    className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span>{isEn ? 'Buffer Cache Hit Ratio' : 'نرخ دسترسی به کش حافظه (Cache Hit Ratio)'}</span>
                      </div>
                      <FieldInfoTooltip
                        title={isEn ? 'PostgreSQL Buffer Cache Hit Ratio' : 'نرخ دسترسی به کش حافظه (Buffer Cache Hit)'}
                        whatIsIt={
                          isEn
                            ? 'Percentage of read queries served directly from RAM rather than physical disk reads.'
                            : 'درصد خواندن اطلاعات که مستقیماً از رم (Shared Buffers) بدون نیاز به دیسک خوانده شده است.'
                        }
                        whyNeeded={
                          isEn
                            ? 'A healthy production database should typically maintain > 99% hit ratio to avoid disk I/O bottlenecks.'
                            : 'در دیتابیس‌های سالم نرخ کش باید بالای ۹۹٪ باشد تا جلوی گلوگاه دیسک گرفته شود.'
                        }
                        example="99.85%"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">
                        {overviewData.telemetry.cacheHitRatio}%
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          overviewData.telemetry.cacheHitRatio >= 99
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : overviewData.telemetry.cacheHitRatio >= 90
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {overviewData.telemetry.cacheHitRatio >= 99
                          ? isEn ? 'Optimal' : 'بسیار مطلوب'
                          : overviewData.telemetry.cacheHitRatio >= 90
                          ? isEn ? 'Acceptable' : 'قابل قبول'
                          : isEn ? 'Degraded (High Disk I/O)' : 'نیاز به بهینه‌سازی'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-400 pt-2 border-t border-slate-700/20">
                      <div className="flex items-center justify-between">
                        <span>{isEn ? 'Blocks Hit in RAM:' : 'بلوک‌های خوانده شده از رم:'}</span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {overviewData.telemetry.totalBlocksHit.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{isEn ? 'Blocks Read from Disk:' : 'بلوک‌های خوانده شده از دیسک:'}</span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {overviewData.telemetry.totalBlocksRead.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Stats */}
                  <div
                    className={`p-4 sm:p-5 rounded-2xl border space-y-3 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <BarChart3 className="w-4 h-4 text-cyan-400" />
                        <span>{isEn ? 'Cumulative Transaction Telemetry' : 'آمار تجمیعی تراکنش‌ها'}</span>
                      </div>
                      <FieldInfoTooltip
                        title={isEn ? 'Commit vs Rollback Counters' : 'شمارنده‌های کامیت و رول‌بک'}
                        whatIsIt={
                          isEn
                            ? 'Total count of committed transactions versus aborted or rolled-back transactions across all databases.'
                            : 'مجموع تراکنش‌های موفق ثبت‌شده در برابر تراکنش‌های لغوشده در کل دیتابیس‌ها.'
                        }
                        whyNeeded={
                          isEn
                            ? 'An abnormally high rollback rate signals application bugs, deadlocks, or constraint violations.'
                            : 'افزایش ناگهانی رول‌بک‌ها نشانه باگ در برنامه، ددلاک یا تداخل کلیدهاست.'
                        }
                        example="Commits: 1,420,100 / Rollbacks: 450"
                        isEn={isEn}
                        isLightMode={isLightMode}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="p-3 rounded-xl bg-black/10 border border-slate-700/20 space-y-1">
                        <span className="text-[10px] text-slate-400 font-mono">{isEn ? 'COMMITS' : 'کامیت‌ها'}</span>
                        <div className="font-mono font-bold text-base text-cyan-400 tabular-nums truncate">
                          {overviewData.telemetry.totalCommits.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-black/10 border border-slate-700/20 space-y-1">
                        <span className="text-[10px] text-slate-400 font-mono">{isEn ? 'ROLLBACKS' : 'رول‌بک‌ها'}</span>
                        <div className="font-mono font-bold text-base text-rose-400 tabular-nums truncate">
                          {overviewData.telemetry.totalRollbacks.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-700/20 flex items-center justify-between text-xs text-slate-400">
                      <span>{isEn ? 'Databases in Catalog:' : 'تعداد دیتابیس‌های فعال کاتالوگ:'}</span>
                      <span className="font-mono font-bold text-slate-200 tabular-nums">
                        {overviewData.telemetry.totalDatabases} {isEn ? 'databases' : 'پایگاه داده'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: DATABASES & SCHEMAS MANAGEMENT (Phase 12) */}
          {activeTab === 'databases' && (
            <PostgresDatabaseLifecycleTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              onRefreshOverview={handleFetchOverview}
              onOpenBrowserWithContext={(db, schema) => {
                setActiveTab('browser');
              }}
            />
          )}

          {/* TAB: BACKUP & RESTORE MANAGEMENT (Phase 13) */}
          {activeTab === 'backups' && (
            <PostgresBackupManagerTab
              server={server}
              isLightMode={isLightMode}
              isEn={isEn}
              initialDatabase={server.postgres_database || 'postgres'}
            />
          )}

          {/* TAB 3: CONNECTION & SECURITY */}
          {activeTab === 'connection' && (
            <div className="space-y-5">
              {/* Connection Test / Status Summary Card */}
              <div
                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  connectionResult?.success
                    ? isLightMode
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-emerald-950/20 border-emerald-500/30'
                    : connectionResult
                    ? isLightMode
                      ? 'bg-rose-50/70 border-rose-200'
                      : 'bg-rose-950/20 border-rose-500/30'
                    : isLightMode
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                        connectionResult?.success
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : connectionResult
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                          : 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                      }`}
                    >
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base">
                          {connectionResult?.success
                            ? isEn
                              ? 'PostgreSQL Engine Connected'
                              : 'موتور PostgreSQL متصل و آماده است'
                            : connectionResult
                            ? isEn
                              ? 'Connection Validation Issue'
                              : 'عدم برقراری ارتباط با PostgreSQL'
                            : isEn
                            ? 'PostgreSQL Connection State'
                            : 'وضعیت اتصال پایگاه داده PostgreSQL'}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 max-w-xl">
                        {connectionResult
                          ? isEn
                            ? connectionResult.message
                            : connectionResult.messageFa || connectionResult.message
                          : isEn
                          ? 'Initiate a connection test to verify direct backend-to-database reachability and credentials.'
                          : 'جهت اعتبارسنجی اتصال مستقیم، نام کاربری و پورت دیتابیس، آزمون اتصال را اجرا کنید.'}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={testing}
                      onClick={handleTestConnection}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                      <span>{testing ? (isEn ? 'Testing...' : 'در حال آزمون...') : (isEn ? 'Test Connection' : 'آزمایش مجدد اتصال')}</span>
                    </button>

                    {onEditServer && (
                      <button
                        type="button"
                        onClick={() => onEditServer(server)}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                          isLightMode
                            ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                            : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Edit Credentials' : 'ویرایش مشخصات'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Error Diagnosis Banner if failed */}
                {connectionResult && !connectionResult.success && (
                  <div
                    className={`mt-4 p-3 rounded-xl border text-xs space-y-1.5 ${
                      isLightMode
                        ? 'bg-rose-100/60 border-rose-300 text-rose-900'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{isEn ? 'Diagnostic Recommendations:' : 'راهنمای رفع مشکل:'}</span>
                    </div>
                    <div className="text-[11px] leading-relaxed opacity-90 pl-5">
                      {connectionResult.status === 'authentication_failed' && (
                        <p>
                          {isEn
                            ? 'The database rejected the credentials. Verify that the username exists and password matches. Check pg_hba.conf for md5/scram-sha-256 authentication rules.'
                            : 'رمز عبور یا نام کاربری توسط PostgreSQL رد شد. مطمئن شوید نام کاربری وجود دارد و رمز صحیح است. همچنین متد احراز هویت (md5 یا scram-sha-256) در فایل pg_hba.conf را بررسی نمایید.'}
                        </p>
                      )}
                      {connectionResult.status === 'connection_refused' && (
                        <p>
                          {isEn
                            ? `Port ${server.postgres_port || 5432} is not accepting connections. Ensure PostgreSQL service is running ("systemctl status postgresql") and listen_addresses is set to '*' in postgresql.conf.`
                            : `پورت ${server.postgres_port || 5432} درخواست را رد کرد. بررسی کنید سرویس فعال باشد ("systemctl status postgresql") و در فایل postgresql.conf عبارت listen_addresses برابر '*' تنظیم شده باشد.`}
                        </p>
                      )}
                      {connectionResult.status === 'timeout' && (
                        <p>
                          {isEn
                            ? `Connection timed out after 5000ms. Check host firewall (UFW/iptables: "ufw allow ${server.postgres_port || 5432}/tcp") and network security groups.`
                            : `مهلت ارتباط به پایان رسید (Timeout). فایروال سرور (دستور ufw allow ${server.postgres_port || 5432}/tcp) و گروه‌های امنیتی شبکه را بررسی فرمایید.`}
                        </p>
                      )}
                      {connectionResult.status === 'permission_denied' && (
                        <p>
                          {isEn
                            ? 'User has insufficient privileges to connect to the initial database. Grant CONNECT permissions to this role.'
                            : 'کاربر مجوز دسترسی لازم جهت اتصال به این پایگاه داده را ندارد. مجوز CONNECT را به این نقش اعطا نمایید.'}
                        </p>
                      )}
                      {connectionResult.status === 'database_unavailable' && (
                        <p>
                          {isEn
                            ? `The targeted database does not exist. Ensure the default database "postgres" exists or configure a valid database.`
                            : 'پایگاه داده مورد نظر روی سرور وجود ندارد. از وجود دیتابیس پیش‌فرض "postgres" مطمئن شوید.'}
                        </p>
                      )}
                      {connectionResult.status === 'connection_failed' && (
                        <p>
                          {isEn
                            ? `Generic network error: ${connectionResult.errorDetail || connectionResult.message}`
                            : `خطای شبکه: ${connectionResult.errorDetail || connectionResult.message}`}
                        </p>
                      )}
                    </div>

                    {onOpenTerminal && (
                      <div className="pt-2 pl-5">
                        <button
                          type="button"
                          onClick={() => onOpenTerminal(server)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 text-slate-200 hover:bg-black transition cursor-pointer"
                        >
                          <Terminal className="w-3 h-3 text-emerald-400" />
                          <span>{isEn ? 'Open SSH Terminal to Troubleshoot' : 'بازگشایی ترمینال SSH جهت عیب‌یابی'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Connection Parameters & Specifications Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: Network & Endpoint */}
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Server className="w-4 h-4 text-cyan-400" />
                      <span>{isEn ? 'Endpoint & Network Context' : 'مشخصات آدرس و شبکه'}</span>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Server Address Source of Truth' : 'مرجع آدرس سرور'}
                      whatIsIt={
                        isEn
                          ? 'The remote server IP address is sourced directly from the existing server registration, eliminating duplicate data entry.'
                          : 'آدرس IP سرور مستقیماً از رکورد اصلی سرور در فلیت خوانده شده و نیازی به ورود مجدد آن نیست.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Ensures single source of truth across all modules and device inventory.'
                          : 'یکپارچگی و جلوگیری از تکرار داده‌ها در تمامی بخش‌های نرم‌افزار.'
                      }
                      example={server.ip}
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                      <span className="text-slate-400">{isEn ? 'Target Host / IP' : 'هاست / آدرس IP'}</span>
                      <span className="font-mono font-bold text-cyan-400">{server.ip}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                      <span className="text-slate-400">{isEn ? 'PostgreSQL Port' : 'پورت PostgreSQL'}</span>
                      <span className="font-mono font-bold text-blue-400">{server.postgres_port || 5432}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                      <span className="text-slate-400">{isEn ? 'Operating System' : 'سیستم‌عامل'}</span>
                      <span className="font-medium">{server.os_distro || 'Linux'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-slate-400">{isEn ? 'Environment' : 'محیط'}</span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-500/10 font-bold">
                        {server.environment || 'Production'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Authentication & Security Credentials */}
                <div
                  className={`p-4 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>{isEn ? 'Authentication & Cryptography' : 'احراز هویت و امنیت'}</span>
                    </div>
                    <FieldInfoTooltip
                      title={isEn ? 'Zero-Leak Credential Confidentiality' : 'امنیت اطلاعات هویتی و رمزنگاری'}
                      whatIsIt={
                        isEn
                          ? 'PostgreSQL passwords are encrypted at rest using AES-256-GCM and never exposed to the frontend browser.'
                          : 'کلمه عبور دیتابیس با الگوریتم AES-256-GCM رمزنگاری شده و هرگز به سمت مرورگر ارسال نمی‌گردد.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Adheres strictly to the Zero-Leak Security Directive (Rule 14).'
                          : 'رعایت استاندارد الزامی عدم نشت اطلاعات حساس و امنیت سرور.'
                      }
                      example="AES-256-GCM In-Flight Decryption"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                      <span className="text-slate-400">{isEn ? 'Database Username' : 'نام کاربری پایگاه داده'}</span>
                      <span className="font-mono font-bold text-emerald-400">{server.postgres_user || 'postgres'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                      <span className="text-slate-400">{isEn ? 'Password Storage' : 'وضعیت ذخیره‌سازی رمز'}</span>
                      <span className="flex items-center gap-1 font-mono text-[11px] text-emerald-400 font-medium">
                        <Lock className="w-3 h-3 text-emerald-400" />
                        <span>
                          {server.postgres_password_set
                            ? isEn ? 'AES-256-GCM Encrypted' : 'رمزنگاری‌شده با AES-256'
                            : isEn ? 'Not Set' : 'تنظیم‌نشده'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-700/20">
                      <span className="text-slate-400">{isEn ? 'Default Context DB' : 'دیتابیس پیش‌فرض اتصال'}</span>
                      <span className="font-mono font-bold">{server.postgres_database || 'postgres'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-slate-400">{isEn ? 'Client Encryption' : 'رمزنگاری در کلاینت'}</span>
                      <span className="text-[11px] font-mono text-cyan-400">{isEn ? 'Zero-Leak Protected' : 'محافظت‌شده بدون نشت'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* 3. FOOTER (Status & Timestamps)                           */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-2.5 border-t text-xs select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>{isEn ? 'Host:' : 'میزبان:'}</span>
            <span className="font-bold text-cyan-400">{server.ip}</span>
            <span>•</span>
            <span>{isEn ? 'Port:' : 'پورت:'}</span>
            <span className="font-bold text-blue-400">{server.postgres_port || 5432}</span>
            {overviewData?.uptimeSeconds !== undefined && (
              <>
                <span>•</span>
                <span>{isEn ? 'Uptime:' : 'آپ‌تایم:'}</span>
                <span className="font-bold text-emerald-400 tabular-nums">{overviewData.uptimePretty}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {lastTestedAt && (
              <span className="text-[10px] font-mono text-slate-500">
                {isEn ? `Last check: ${lastTestedAt}` : `آخرین بررسی: ${lastTestedAt}`}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
