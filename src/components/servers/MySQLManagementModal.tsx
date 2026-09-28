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
  Key,
  Terminal,
  Activity,
  Layers,
  Settings,
  Search,
  HardDrive,
  BarChart3,
  Cpu,
  Table,
  Sliders,
  Play,
  Trash2,
  Zap,
  Server,
  Users,
  User,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  ExternalLink,
  Code,
  Eye,
  Hash,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlConnectionTestResult,
  MysqlOverview,
  MysqlDatabaseItem,
  MysqlDatabaseDetails,
  MysqlDatabaseTableSummary,
  MysqlUserItem,
  MysqlProcessItem,
  MysqlVariableItem,
  MysqlQueryResult,
} from '../../types';
import {
  testRemoteServerMysqlConnection,
  fetchRemoteServerMysqlOverview,
  fetchRemoteServerMysqlDatabases,
  fetchRemoteServerMysqlDatabaseDetails,
  fetchRemoteServerMysqlUsers,
  executeRemoteServerMysqlQuery,
  fetchRemoteServerMysqlProcesslist,
  killRemoteServerMysqlProcess,
  fetchRemoteServerMysqlVariables,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MySQLManagementModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  onClose: () => void;
  onMinimize?: () => void;
  onOpenTerminal?: (server: RemoteServer) => void;
  onEditServer?: (server: RemoteServer) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

type MysqlTab = 'overview' | 'databases' | 'sql' | 'processlist' | 'variables' | 'connection';

export const MySQLManagementModal: React.FC<MySQLManagementModalProps> = ({
  isOpen,
  server,
  onClose,
  onMinimize,
  onOpenTerminal,
  onEditServer,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<MysqlTab>('overview');

  // Connection testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<MysqlConnectionTestResult | null>(null);

  // Overview state
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [overview, setOverview] = useState<MysqlOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Databases state
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [databases, setDatabases] = useState<MysqlDatabaseItem[]>([]);
  const [dbSearch, setDbSearch] = useState('');

  // Processlist state
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);
  const [processes, setProcesses] = useState<MysqlProcessItem[]>([]);
  const [killingId, setKillingId] = useState<number | null>(null);

  // Variables state
  const [isLoadingVariables, setIsLoadingVariables] = useState(false);
  const [variables, setVariables] = useState<MysqlVariableItem[]>([]);
  const [varSearch, setVarSearch] = useState('');

  // SQL console state
  const [sqlQuery, setSqlQuery] = useState('SHOW DATABASES;');
  const [isExecutingSql, setIsExecutingSql] = useState(false);
  const [queryResult, setQueryResult] = useState<MysqlQueryResult | null>(null);

  // Database browser tree navigation state (Phase 3)
  const [selectedTreeNode, setSelectedTreeNode] = useState<{
    type: 'root' | 'databases_folder' | 'database' | 'table' | 'users_folder' | 'user' | 'server_folder';
    id: string;
    name: string;
    dbName?: string;
    tableName?: string;
    userName?: string;
  }>({
    type: 'root',
    id: 'root',
    name: 'MySQL',
  });
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Set<string>>(
    () => new Set(['root', 'databases_folder', 'users_folder'])
  );
  const [treeSearch, setTreeSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Database details cache: dbName -> MysqlDatabaseDetails
  const [dbDetailsCache, setDbDetailsCache] = useState<Record<string, MysqlDatabaseDetails>>({});
  const [loadingDbDetails, setLoadingDbDetails] = useState<Set<string>>(new Set());
  const [dbDetailsError, setDbDetailsError] = useState<Record<string, string>>({});

  // Users state
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [users, setUsers] = useState<MysqlUserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Run initial test and overview on open
  const runTestConnection = useCallback(async () => {
    if (!server) return;
    setIsTesting(true);
    try {
      const res = await testRemoteServerMysqlConnection(server.id);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 'unknown_error',
        message: err.message,
        serverAddress: server.ip,
        port: server.mysql_port || 3306,
        username: server.mysql_user || 'root',
        testedAt: new Date().toISOString(),
      });
    } finally {
      setIsTesting(false);
    }
  }, [server]);

  const loadOverview = useCallback(async () => {
    if (!server) return;
    setIsLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await fetchRemoteServerMysqlOverview(server.id);
      if (res.success && res.overview) {
        setOverview(res.overview);
      } else {
        setOverviewError(res.error || 'Failed to fetch overview');
      }
    } catch (err: any) {
      setOverviewError(err.message);
    } finally {
      setIsLoadingOverview(false);
    }
  }, [server]);

  const loadDatabases = useCallback(async () => {
    if (!server) return;
    setIsLoadingDatabases(true);
    try {
      const res = await fetchRemoteServerMysqlDatabases(server.id);
      if (res.success && res.databases) {
        setDatabases(res.databases);
      }
    } catch {} finally {
      setIsLoadingDatabases(false);
    }
  }, [server]);

  const loadUsers = useCallback(async () => {
    if (!server) return;
    setIsLoadingUsers(true);
    try {
      const res = await fetchRemoteServerMysqlUsers(server.id);
      if (res.success && res.users) {
        setUsers(res.users);
      }
    } catch {} finally {
      setIsLoadingUsers(false);
    }
  }, [server]);

  const loadDatabaseDetails = useCallback(
    async (dbName: string, force = false) => {
      if (!server || !dbName) return;
      if (!force && dbDetailsCache[dbName]) return;

      setLoadingDbDetails((prev) => new Set(prev).add(dbName));
      setDbDetailsError((prev) => {
        const next = { ...prev };
        delete next[dbName];
        return next;
      });

      try {
        const res = await fetchRemoteServerMysqlDatabaseDetails(server.id, dbName);
        if (res.success && res.details) {
          setDbDetailsCache((prev) => ({ ...prev, [dbName]: res.details! }));
        } else {
          setDbDetailsError((prev) => ({ ...prev, [dbName]: res.error || 'Failed to fetch details' }));
        }
      } catch (err: any) {
        setDbDetailsError((prev) => ({ ...prev, [dbName]: err.message || 'Error fetching details' }));
      } finally {
        setLoadingDbDetails((prev) => {
          const next = new Set(prev);
          next.delete(dbName);
          return next;
        });
      }
    },
    [server, dbDetailsCache]
  );

  const toggleTreeNode = (nodeId: string, onExpand?: () => void) => {
    setExpandedTreeNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
        if (onExpand) onExpand();
      }
      return next;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const handleOpenSqlForDatabase = (dbName: string, table?: string) => {
    const query = table
      ? `USE \`${dbName}\`;\nSELECT * FROM \`${table}\` LIMIT 50;`
      : `USE \`${dbName}\`;\nSHOW TABLES;`;
    setSqlQuery(query);
    setActiveTab('sql');
  };

  const loadProcesslist = useCallback(async () => {
    if (!server) return;
    setIsLoadingProcesses(true);
    try {
      const res = await fetchRemoteServerMysqlProcesslist(server.id);
      if (res.success && res.processes) {
        setProcesses(res.processes);
      }
    } catch {} finally {
      setIsLoadingProcesses(false);
    }
  }, [server]);

  const loadVariables = useCallback(async () => {
    if (!server) return;
    setIsLoadingVariables(true);
    try {
      const res = await fetchRemoteServerMysqlVariables(server.id, varSearch);
      if (res.success && res.variables) {
        setVariables(res.variables);
      }
    } catch {} finally {
      setIsLoadingVariables(false);
    }
  }, [server, varSearch]);

  const handleExecuteSql = async () => {
    if (!server || !sqlQuery.trim()) return;
    setIsExecutingSql(true);
    setQueryResult(null);
    try {
      const res = await executeRemoteServerMysqlQuery(server.id, sqlQuery.trim());
      setQueryResult(res);
    } catch (err: any) {
      setQueryResult({
        success: false,
        error: err.message,
        errorFa: `خطا در اجرای کوئری: ${err.message}`,
      });
    } finally {
      setIsExecutingSql(false);
    }
  };

  const handleKillProcess = async (processId: number) => {
    if (!server) return;
    setKillingId(processId);
    try {
      await killRemoteServerMysqlProcess(server.id, processId);
      await loadProcesslist();
    } catch {} finally {
      setKillingId(null);
    }
  };

  useEffect(() => {
    if (isOpen && server) {
      runTestConnection();
      loadOverview();
    }
  }, [isOpen, server, runTestConnection, loadOverview]);

  useEffect(() => {
    if (!isOpen || !server) return;
    if (activeTab === 'databases') {
      loadDatabases();
      loadUsers();
    }
    if (activeTab === 'processlist') loadProcesslist();
    if (activeTab === 'variables') loadVariables();
  }, [isOpen, server, activeTab, loadDatabases, loadUsers, loadProcesslist, loadVariables]);

  const filteredDatabases = useMemo(() => {
    if (!dbSearch.trim()) return databases;
    return databases.filter((db) => db.name.toLowerCase().includes(dbSearch.toLowerCase()));
  }, [databases, dbSearch]);

  const filteredVariables = useMemo(() => {
    if (!varSearch.trim()) return variables;
    return variables.filter((v) => v.name.toLowerCase().includes(varSearch.toLowerCase()));
  }, [variables, varSearch]);

  if (!isOpen || !server) return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full h-full rounded-2xl flex flex-col overflow-hidden border shadow-2xl transition-all ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-slate-900/20'
            : 'bg-slate-950 border-white/15 text-slate-100 shadow-black/80'
        } ${isMaximized ? 'm-0 rounded-none' : 'max-w-6xl mx-auto'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">
                  {isEn ? 'MySQL Management' : 'مدیریت MySQL'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  Port {server.mysql_port || 3306}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                <span>{server.name}</span>
                <span>•</span>
                <span>{server.ip}</span>
                {overview?.version && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-400">{overview.version}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 3 Header Control Buttons (Close, Minimize, Maximize) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={runTestConnection}
              disabled={isTesting}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  : 'border-white/10 hover:bg-white/10 text-slate-300'
              }`}
              title={isEn ? 'Test Connection' : 'تست مجدد اتصال'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-orange-400' : ''}`} />
              <span className="hidden sm:inline">{isEn ? 'Ping' : 'تست'}</span>
            </button>
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                title={isEn ? 'Minimize' : 'کوچک‌نمایی (کمینه‌سازی)'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              title={isEn ? (isMaximized ? 'Restore' : 'Maximize') : isMaximized ? 'حالت پنجره' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className={`flex items-center gap-1 px-4 border-b shrink-0 overflow-x-auto ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/50 border-white/10'
          }`}
        >
          {[
            { id: 'overview', label: isEn ? 'Overview & Metrics' : 'داشبورد و وضعیت', icon: Activity },
            { id: 'databases', label: isEn ? 'Database Browser' : 'کاوشگر پایگاه داده', icon: Layers },
            { id: 'sql', label: isEn ? 'SQL Console' : 'کنسول SQL', icon: Terminal },
            { id: 'processlist', label: isEn ? 'Active Threads' : 'پروسس‌ها و اتصالات', icon: Cpu },
            { id: 'variables', label: isEn ? 'System Variables' : 'تنظیمات و متغیرها', icon: Sliders },
            { id: 'connection', label: isEn ? 'Connection' : 'تنظیمات اتصال', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as MysqlTab)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-orange-500 text-orange-400 font-bold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {/* 1. OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Connection Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  testResult?.success
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : testResult
                    ? isLightMode
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {testResult?.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : testResult ? (
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  ) : (
                    <RefreshCw className="w-5 h-5 text-slate-400 animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-xs">
                      {testResult?.success
                        ? isEn
                          ? 'MySQL Instance Reachable & Online'
                          : 'موتور پایگاه‌داده MySQL فعال و برخط است'
                        : testResult
                        ? isEn
                          ? 'Connection Notice'
                          : 'خطا در ارتباط با دیتابیس'
                        : isEn
                        ? 'Testing MySQL Connection...'
                        : 'در حال بررسی اتصال به MySQL...'}
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5 font-mono">
                      {isEn ? testResult?.message : testResult?.messageFa || testResult?.message}
                    </div>
                  </div>
                </div>
                {testResult?.latencyMs !== undefined && (
                  <span className="px-2 py-1 rounded text-xs font-mono font-bold bg-black/20 shrink-0">
                    {testResult.latencyMs} ms
                  </span>
                )}
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Connected Threads' : 'تعداد اتصالات فعال'}
                  </div>
                  <div className="text-2xl font-bold font-mono text-cyan-400 mt-2">
                    {overview?.threadsConnected ?? '—'}
                    <span className="text-xs text-slate-400 font-normal"> / {overview?.maxConnections ?? '151'}</span>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Engine Uptime' : 'مدت زمان کارکرد'}
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-2">
                    {overview?.uptimePretty || '—'}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'Total Queries' : 'کل کوئری‌های اجراشده'}
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
                    {overview ? overview.totalQueries.toLocaleString() : '—'}
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    {isEn ? 'InnoDB Buffer Pool' : 'حافظه بافر InnoDB'}
                  </div>
                  <div className="text-lg font-bold font-mono text-purple-400 mt-2">
                    {overview?.bufferPoolSize || '—'}
                  </div>
                </div>
              </div>

              {/* Detailed Specs Panel */}
              <div
                className={`p-4 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold">{isEn ? 'Server Specs & Telemetry' : 'مشخصات سرور و تلمتری'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={loadOverview}
                    disabled={isLoadingOverview}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingOverview ? 'animate-spin text-orange-400' : ''}`} />
                    <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-xs font-mono">
                  {/* 1. MySQL Version */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'MySQL Version' : 'نسخه MySQL'}</span>
                    <span className="font-bold text-amber-300">{overview?.version || 'MySQL'}</span>
                  </div>

                  {/* 2. Server Version & Flavor */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Server Version & Comment' : 'نسخه کامل و توزیع سرور'}</span>
                    <span className="font-bold text-slate-200 truncate block" title={overview?.serverVersion || overview?.versionComment}>
                      {overview?.serverVersion || overview?.versionComment || 'Community Server'}
                    </span>
                  </div>

                  {/* 3. Host */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Host / IP' : 'هاست / آدرس IP'}</span>
                    <span className="font-bold text-slate-200">{overview?.serverAddress || server.ip}</span>
                  </div>

                  {/* 4. Port */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'MySQL Port' : 'پورت MySQL'}</span>
                    <span className="font-bold text-orange-400">{overview?.port || server.mysql_port || 3306}</span>
                  </div>

                  {/* 5. Current User */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Current User' : 'کاربر متصل'}</span>
                    <span className="font-bold text-emerald-400">{overview?.connectedUser || server.mysql_user || 'root'}</span>
                  </div>

                  {/* 6. Current Database */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Current Database' : 'پایگاه داده متصل'}</span>
                    <span className="font-bold text-cyan-400">{overview?.connectedDatabase || server.mysql_database || 'mysql'}</span>
                  </div>

                  {/* 7. Timezone */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Server Timezone' : 'منطقه زمانی سرور'}</span>
                    <span className="font-bold text-slate-200">{overview?.timezone || 'SYSTEM'}</span>
                  </div>

                  {/* 8. Character Set & Collation */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Charset / Collation' : 'کدگذاری و ترتیه‌بندی'}</span>
                    <span className="font-bold text-purple-300 truncate block" title={`${overview?.characterSet || 'utf8mb4'} / ${overview?.collation || 'utf8mb4_general_ci'}`}>
                      {overview?.characterSet || 'utf8mb4'} / {overview?.collation || 'utf8mb4_general_ci'}
                    </span>
                  </div>

                  {/* 9. Server Uptime */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Server Uptime' : 'مدت زمان فعالیت (Uptime)'}</span>
                    <span className="font-bold text-emerald-400">{overview?.uptimePretty || '—'}</span>
                  </div>

                  {/* 10. Connections (Current / Max) */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5 sm:col-span-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span>{isEn ? 'Connections (Current / Max)' : 'اتصالات (فعال / حداکثر)'}</span>
                      <span className="font-mono text-cyan-400">
                        {overview?.threadsConnected ?? 0} / {overview?.maxConnections ?? 151}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.round(((overview?.threadsConnected ?? 0) / (overview?.maxConnections || 151)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* 11. Slow Queries */}
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Slow Queries' : 'کوئری‌های کند'}</span>
                    <span className={`font-bold ${(overview?.slowQueries ?? 0) > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {overview?.slowQueries ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. DATABASE BROWSER TAB (Phase 3) */}
          {activeTab === 'databases' && (
            <div className="flex flex-col h-full space-y-3">
              {/* Top Quick Status & Actions Bar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    <Layers className="w-4 h-4 text-orange-400" />
                    <span>{isEn ? 'MySQL Database Browser' : 'مرورگر و درخت ساختار پایگاه‌های داده MySQL'}</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                      isLightMode ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {databases.length} {isEn ? 'Databases' : 'دیتابیس'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                      isLightMode ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {users.length} {isEn ? 'Users' : 'کاربر'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      loadDatabases();
                      loadUsers();
                      if (selectedTreeNode.type === 'database' && selectedTreeNode.dbName) {
                        loadDatabaseDetails(selectedTreeNode.dbName, true);
                      }
                    }}
                    disabled={isLoadingDatabases || isLoadingUsers}
                    className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 transition cursor-pointer ${
                      isLightMode
                        ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                        : 'border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDatabases || isLoadingUsers ? 'animate-spin text-orange-400' : ''}`} />
                    <span>{isEn ? 'Refresh Catalog' : 'بروزرسانی کاتالوگ'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const dbName = selectedTreeNode.dbName || server.mysql_database || 'mysql';
                      handleOpenSqlForDatabase(dbName);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>{isEn ? 'SQL Console' : 'کنسول SQL'}</span>
                  </button>
                </div>
              </div>

              {/* Main Split-Pane Explorer Layout */}
              <div
                className={`flex-1 flex flex-col md:flex-row rounded-xl border overflow-hidden min-h-[520px] ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                {/* ======================================================== */}
                {/* LEFT PANE: Hierarchical Database Object Tree              */}
                {/* ======================================================== */}
                <div
                  className={`w-full md:w-72 lg:w-80 shrink-0 border-b md:border-b-0 md:border-r flex flex-col ${
                    isLightMode ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/80 border-slate-800'
                  }`}
                >
                  {/* Tree Search Box */}
                  <div className="p-2.5 border-b border-inherit">
                    <div
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                        isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={treeSearch}
                        onChange={(e) => setTreeSearch(e.target.value)}
                        placeholder={isEn ? 'Filter tree nodes...' : 'فیلتر درخت اجزا...'}
                        className="w-full bg-transparent focus:outline-hidden text-xs"
                      />
                      {treeSearch && (
                        <button
                          type="button"
                          onClick={() => setTreeSearch('')}
                          className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tree Node Hierarchy */}
                  <div className="flex-1 overflow-y-auto p-2 text-xs select-none space-y-0.5 font-mono custom-scrollbar">
                    {/* 1. ROOT NODE: MySQL Server */}
                    <div>
                      <div
                        onClick={() =>
                          setSelectedTreeNode({
                            type: 'root',
                            id: 'root',
                            name: 'MySQL',
                          })
                        }
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition ${
                          selectedTreeNode.type === 'root'
                            ? isLightMode
                              ? 'bg-orange-100 text-orange-900 font-bold'
                              : 'bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30'
                            : isLightMode
                            ? 'hover:bg-slate-200/70 text-slate-800'
                            : 'hover:bg-slate-800/60 text-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTreeNode('root');
                          }}
                          className="p-0.5 hover:text-white"
                        >
                          {expandedTreeNodes.has('root') ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <Server className="w-4 h-4 text-orange-400 shrink-0" />
                        <span className="truncate font-sans font-semibold text-xs">MySQL</span>
                        <span className="text-[10px] text-slate-400 ml-auto font-mono">
                          {server.mysql_port || 3306}
                        </span>
                      </div>

                      {/* Children of Root */}
                      {expandedTreeNodes.has('root') && (
                        <div className="pl-4 pr-1 mt-1 space-y-0.5 border-l border-slate-700/30 ml-2.5">
                          {/* ======================================================== */}
                          {/* BRANCH A: Databases                                      */}
                          {/* ======================================================== */}
                          <div>
                            <div
                              onClick={() => {
                                setSelectedTreeNode({
                                  type: 'databases_folder',
                                  id: 'databases_folder',
                                  name: isEn ? 'Databases' : 'پایگاه‌های داده',
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                                selectedTreeNode.type === 'databases_folder'
                                  ? isLightMode
                                    ? 'bg-orange-100 text-orange-900 font-bold'
                                    : 'bg-orange-500/20 text-orange-400 font-bold'
                                  : isLightMode
                                  ? 'hover:bg-slate-200/70 text-slate-700'
                                  : 'hover:bg-slate-800/60 text-slate-300'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTreeNode('databases_folder');
                                }}
                                className="p-0.5 hover:text-white"
                              >
                                {expandedTreeNodes.has('databases_folder') ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {expandedTreeNodes.has('databases_folder') ? (
                                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                              <span className="truncate font-sans font-medium text-xs">
                                {isEn ? 'Databases' : 'پایگاه‌های داده'}
                              </span>
                              <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                                {databases.length}
                              </span>
                            </div>

                            {/* Database List */}
                            {expandedTreeNodes.has('databases_folder') && (
                              <div className="pl-3 mt-0.5 space-y-0.5 border-l border-slate-700/20 ml-2">
                                {databases
                                  .filter((db) => !treeSearch || db.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                  .map((db) => {
                                    const isSelected = selectedTreeNode.type === 'database' && selectedTreeNode.dbName === db.name;
                                    const isExpanded = expandedTreeNodes.has(`db:${db.name}`);
                                    const details = dbDetailsCache[db.name];
                                    const isLoadingDetails = loadingDbDetails.has(db.name);

                                    return (
                                      <div key={db.name}>
                                        <div
                                          onClick={() => {
                                            setSelectedTreeNode({
                                              type: 'database',
                                              id: `db:${db.name}`,
                                              name: db.name,
                                              dbName: db.name,
                                            });
                                            loadDatabaseDetails(db.name);
                                          }}
                                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition text-xs ${
                                            isSelected
                                              ? isLightMode
                                                ? 'bg-orange-100 text-orange-900 font-bold'
                                                : 'bg-orange-500/25 text-orange-300 font-bold border border-orange-500/30'
                                              : isLightMode
                                              ? 'hover:bg-slate-200 text-slate-700'
                                              : 'hover:bg-slate-800/60 text-slate-300'
                                          }`}
                                        >
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTreeNode(`db:${db.name}`, () => loadDatabaseDetails(db.name));
                                            }}
                                            className="p-0.5 hover:text-white"
                                          >
                                            {isExpanded ? (
                                              <ChevronDown className="w-3 h-3" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3" />
                                            )}
                                          </button>
                                          <Database
                                            className={`w-3.5 h-3.5 shrink-0 ${
                                              db.isSystem ? 'text-slate-500' : 'text-orange-400'
                                            }`}
                                          />
                                          <span className="truncate flex-1 font-mono text-[11px]" title={db.name}>
                                            {db.name}
                                          </span>
                                          {db.isSystem ? (
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-500 font-sans">
                                              SYS
                                            </span>
                                          ) : (
                                            <span className="text-[10px] text-slate-400 font-mono">
                                              {db.tableCount}
                                            </span>
                                          )}
                                        </div>

                                        {/* Tables sub-branch under database */}
                                        {isExpanded && (
                                          <div className="pl-4 mt-0.5 space-y-0.5 border-l border-slate-700/20 ml-2">
                                            {isLoadingDetails ? (
                                              <div className="py-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                                                <RefreshCw className="w-3 h-3 animate-spin text-orange-400" />
                                                <span>{isEn ? 'Loading tables...' : 'در حال خواندن جداول...'}</span>
                                              </div>
                                            ) : details?.tables && details.tables.length > 0 ? (
                                              details.tables
                                                .filter((t) => !treeSearch || t.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                .slice(0, 100)
                                                .map((table) => {
                                                  const isTableSelected =
                                                    selectedTreeNode.type === 'table' &&
                                                    selectedTreeNode.dbName === db.name &&
                                                    selectedTreeNode.tableName === table.name;
                                                  return (
                                                    <div
                                                      key={table.name}
                                                      onClick={() => {
                                                        setSelectedTreeNode({
                                                          type: 'table',
                                                          id: `table:${db.name}:${table.name}`,
                                                          name: table.name,
                                                          dbName: db.name,
                                                          tableName: table.name,
                                                        });
                                                      }}
                                                      className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                        isTableSelected
                                                          ? 'bg-orange-500/20 text-orange-300 font-bold'
                                                          : isLightMode
                                                          ? 'hover:bg-slate-200 text-slate-600'
                                                          : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                      }`}
                                                    >
                                                      <Table className="w-3 h-3 text-cyan-400 shrink-0" />
                                                      <span className="truncate flex-1" title={table.name}>
                                                        {table.name}
                                                      </span>
                                                      <span className="text-[10px] text-slate-500 font-mono">
                                                        {table.approxRows > 0 ? table.approxRows.toLocaleString() : '0'}
                                                      </span>
                                                    </div>
                                                  );
                                                })
                                            ) : (
                                              <div className="py-0.5 text-[10px] text-slate-500 italic">
                                                {isEn ? 'No tables' : 'بدون جدول'}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>

                          {/* ======================================================== */}
                          {/* BRANCH B: Users & Accounts                               */}
                          {/* ======================================================== */}
                          <div>
                            <div
                              onClick={() => {
                                setSelectedTreeNode({
                                  type: 'users_folder',
                                  id: 'users_folder',
                                  name: isEn ? 'Users & Accounts' : 'کاربران و دسترسی‌ها',
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                                selectedTreeNode.type === 'users_folder'
                                  ? isLightMode
                                    ? 'bg-orange-100 text-orange-900 font-bold'
                                    : 'bg-orange-500/20 text-orange-400 font-bold'
                                  : isLightMode
                                  ? 'hover:bg-slate-200/70 text-slate-700'
                                  : 'hover:bg-slate-800/60 text-slate-300'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTreeNode('users_folder');
                                }}
                                className="p-0.5 hover:text-white"
                              >
                                {expandedTreeNodes.has('users_folder') ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="truncate font-sans font-medium text-xs">
                                {isEn ? 'Users' : 'کاربران'}
                              </span>
                              <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono">
                                {users.length}
                              </span>
                            </div>

                            {/* Users list */}
                            {expandedTreeNodes.has('users_folder') && (
                              <div className="pl-3 mt-0.5 space-y-0.5 border-l border-slate-700/20 ml-2">
                                {users
                                  .filter(
                                    (u) =>
                                      !treeSearch ||
                                      u.user.toLowerCase().includes(treeSearch.toLowerCase()) ||
                                      u.host.toLowerCase().includes(treeSearch.toLowerCase())
                                  )
                                  .map((u) => {
                                    const userKey = `${u.user}@${u.host}`;
                                    const isSelected = selectedTreeNode.type === 'user' && selectedTreeNode.userName === userKey;
                                    return (
                                      <div
                                        key={userKey}
                                        onClick={() => {
                                          setSelectedTreeNode({
                                            type: 'user',
                                            id: `user:${userKey}`,
                                            name: userKey,
                                            userName: userKey,
                                          });
                                        }}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] transition font-mono ${
                                          isSelected
                                            ? 'bg-orange-500/25 text-orange-300 font-bold border border-orange-500/30'
                                            : isLightMode
                                            ? 'hover:bg-slate-200 text-slate-700'
                                            : 'hover:bg-slate-800/60 text-slate-300'
                                        }`}
                                      >
                                        <User className="w-3 h-3 text-cyan-400 shrink-0" />
                                        <span className="truncate flex-1" title={userKey}>
                                          {userKey}
                                        </span>
                                        {u.accountLocked && (
                                          <span className="text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-sans">
                                            {isEn ? 'Locked' : 'قفل'}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>

                          {/* ======================================================== */}
                          {/* BRANCH C: Server                                         */}
                          {/* ======================================================== */}
                          <div>
                            <div
                              onClick={() => {
                                setSelectedTreeNode({
                                  type: 'server_folder',
                                  id: 'server_folder',
                                  name: isEn ? 'Server' : 'سرور و متغیرها',
                                });
                              }}
                              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition ${
                                selectedTreeNode.type === 'server_folder'
                                  ? isLightMode
                                    ? 'bg-orange-100 text-orange-900 font-bold'
                                    : 'bg-orange-500/20 text-orange-400 font-bold'
                                  : isLightMode
                                  ? 'hover:bg-slate-200/70 text-slate-700'
                                  : 'hover:bg-slate-800/60 text-slate-300'
                              }`}
                            >
                              <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0 ml-4" />
                              <span className="truncate font-sans font-medium text-xs">
                                {isEn ? 'Server & Engine' : 'سرور و متغیرها'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* RIGHT PANE: Object Details & Tables Browser View         */}
                {/* ======================================================== */}
                <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
                  {/* Breadcrumb Header */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10 flex-wrap gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400 font-mono">
                      <span>MySQL</span>
                      <span>/</span>
                      {selectedTreeNode.type === 'databases_folder' && (
                        <span className="text-orange-400 font-bold">{isEn ? 'Databases' : 'پایگاه‌های داده'}</span>
                      )}
                      {selectedTreeNode.type === 'database' && (
                        <>
                          <span className="hover:underline cursor-pointer" onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}>
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span className="text-orange-400 font-bold">{selectedTreeNode.dbName}</span>
                        </>
                      )}
                      {selectedTreeNode.type === 'table' && (
                        <>
                          <span className="hover:underline cursor-pointer" onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}>
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span className="hover:underline cursor-pointer" onClick={() => setSelectedTreeNode({ type: 'database', id: `db:${selectedTreeNode.dbName}`, name: selectedTreeNode.dbName!, dbName: selectedTreeNode.dbName })}>
                            {selectedTreeNode.dbName}
                          </span>
                          <span>/</span>
                          <span className="text-cyan-400 font-bold">{selectedTreeNode.tableName}</span>
                        </>
                      )}
                      {selectedTreeNode.type === 'users_folder' && (
                        <span className="text-blue-400 font-bold">{isEn ? 'Users & Accounts' : 'کاربران و دسترسی‌ها'}</span>
                      )}
                      {selectedTreeNode.type === 'user' && (
                        <>
                          <span className="hover:underline cursor-pointer" onClick={() => setSelectedTreeNode({ type: 'users_folder', id: 'users_folder', name: 'Users' })}>
                            {isEn ? 'Users' : 'کاربران'}
                          </span>
                          <span>/</span>
                          <span className="text-cyan-400 font-bold">{selectedTreeNode.userName}</span>
                        </>
                      )}
                      {selectedTreeNode.type === 'server_folder' && (
                        <span className="text-purple-400 font-bold">{isEn ? 'Server Overview' : 'مشخصات سرور'}</span>
                      )}
                      {selectedTreeNode.type === 'root' && (
                        <span className="text-slate-200 font-bold">{isEn ? 'Root' : 'ریشه'}</span>
                      )}
                    </div>

                    {selectedTreeNode.dbName && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedTreeNode.dbName!, 'db-name')}
                          className="px-2 py-1 rounded bg-black/20 hover:bg-black/40 text-[11px] font-mono flex items-center gap-1 text-slate-300 cursor-pointer"
                        >
                          {copiedSnippet === 'db-name' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedSnippet === 'db-name' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Name' : 'کپی نام')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSqlForDatabase(selectedTreeNode.dbName!, selectedTreeNode.tableName)}
                          className="px-2.5 py-1 rounded bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Terminal className="w-3 h-3" />
                          <span>{isEn ? 'Query in Console' : 'کوئری در کنسول'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* VIEW A: ROOT OR SERVER FOLDER                        */}
                  {/* ---------------------------------------------------- */}
                  {(selectedTreeNode.type === 'root' || selectedTreeNode.type === 'server_folder') && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl border border-white/10 bg-black/10">
                        <h4 className="font-bold text-sm text-slate-200 mb-1 flex items-center gap-2">
                          <Server className="w-4 h-4 text-orange-400" />
                          <span>{server.name} — MySQL Engine</span>
                        </h4>
                        <p className="text-xs text-slate-400">
                          {overview?.serverVersion || `${overview?.version || 'MySQL'} Community Server`} • Port {server.mysql_port || 3306}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Databases' : 'تعداد دیتابیس‌ها'}</div>
                          <div className="text-xl font-bold text-orange-400 mt-1">{databases.length}</div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Total Tables' : 'مجموع جداول'}</div>
                          <div className="text-xl font-bold text-cyan-400 mt-1">
                            {databases.reduce((sum, d) => sum + d.tableCount, 0)}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Users' : 'کاربران سرور'}</div>
                          <div className="text-xl font-bold text-blue-400 mt-1">{users.length}</div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">{isEn ? 'Uptime' : 'مدت فعالیت'}</div>
                          <div className="text-sm font-bold text-emerald-400 mt-1 truncate">{overview?.uptimePretty || '—'}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-slate-300"
                        >
                          <Folder className="w-3.5 h-3.5 text-amber-400" />
                          <span>{isEn ? 'Explore Databases' : 'مشاهده دیتابیس‌ها'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTreeNode({ type: 'users_folder', id: 'users_folder', name: 'Users' })}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-slate-300"
                        >
                          <Users className="w-3.5 h-3.5 text-blue-400" />
                          <span>{isEn ? 'Manage Accounts' : 'مشاهده کاربران'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('variables')}
                          className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-slate-300"
                        >
                          <Sliders className="w-3.5 h-3.5 text-purple-400" />
                          <span>{isEn ? 'System Variables' : 'متغیرهای سیستمی'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ---------------------------------------------------- */}
                  {/* VIEW B: ALL DATABASES GRID VIEW                      */}
                  {/* ---------------------------------------------------- */}
                  {selectedTreeNode.type === 'databases_folder' && (
                    <div className="space-y-4">
                      {/* Stat summary cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'All Databases' : 'کل دیتابیس‌ها'}</div>
                          <div className="text-xl font-bold font-mono text-orange-400 mt-1">{databases.length}</div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'User Databases' : 'دیتابیس‌های کاربری'}</div>
                          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                            {databases.filter((d) => !d.isSystem).length}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'System Schemas' : 'طرح‌واره‌های سیستمی'}</div>
                          <div className="text-xl font-bold font-mono text-slate-400 mt-1">
                            {databases.filter((d) => d.isSystem).length}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl border border-white/10 bg-black/10">
                          <div className="text-[10px] text-slate-400 uppercase font-bold">{isEn ? 'Total Storage' : 'حجم کل داده‌ها'}</div>
                          <div className="text-base font-bold font-mono text-purple-400 mt-1">
                            {(() => {
                              const totalBytes = databases.reduce((sum, d) => sum + d.sizeBytes, 0);
                              if (totalBytes >= 1024 * 1024 * 1024) return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                              if (totalBytes >= 1024 * 1024) return `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
                              return `${(totalBytes / 1024).toFixed(1)} KB`;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Databases Table */}
                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                            <tr className="border-b border-white/10 text-slate-400 font-semibold">
                              <th className="p-3">{isEn ? 'Database Name' : 'نام پایگاه داده'}</th>
                              <th className="p-3">{isEn ? 'Charset / Collation' : 'کدگذاری و ترتیه‌بندی'}</th>
                              <th className="p-3 text-center">{isEn ? 'Tables' : 'تعداد جداول'}</th>
                              <th className="p-3 text-right">{isEn ? 'Size' : 'حجم دیتابیس'}</th>
                              <th className="p-3 text-center">{isEn ? 'Action' : 'عملیات'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {databases.map((db) => (
                              <tr
                                key={db.name}
                                onClick={() => {
                                  setSelectedTreeNode({
                                    type: 'database',
                                    id: `db:${db.name}`,
                                    name: db.name,
                                    dbName: db.name,
                                  });
                                  loadDatabaseDetails(db.name);
                                }}
                                className={`transition cursor-pointer ${
                                  isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                }`}
                              >
                                <td className="p-3 flex items-center gap-2 font-bold text-slate-200">
                                  <Database className={`w-3.5 h-3.5 ${db.isSystem ? 'text-slate-500' : 'text-orange-400'}`} />
                                  <span>{db.name}</span>
                                  {db.isSystem && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-sans">
                                      SYSTEM
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-slate-400 text-[11px]">
                                  {db.defaultCharacterSet || 'utf8mb4'} • {db.defaultCollation}
                                </td>
                                <td className="p-3 text-center text-cyan-400 font-bold">{db.tableCount}</td>
                                <td className="p-3 text-right text-emerald-400 font-bold">{db.sizePretty}</td>
                                <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSqlForDatabase(db.name)}
                                    className="p-1 rounded hover:bg-orange-500/20 text-slate-400 hover:text-orange-300"
                                    title={isEn ? 'Query Database' : 'کوئری روی دیتابیس'}
                                  >
                                    <Terminal className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ---------------------------------------------------- */}
                  {/* VIEW C: INDIVIDUAL DATABASE DETAILS & TABLES LIST     */}
                  {/* ---------------------------------------------------- */}
                  {(selectedTreeNode.type === 'database' || selectedTreeNode.type === 'table') && selectedTreeNode.dbName && (
                    <div className="space-y-4">
                      {/* Database Header Card */}
                      {(() => {
                        const dbName = selectedTreeNode.dbName!;
                        const details = dbDetailsCache[dbName];
                        const dbMeta = databases.find((d) => d.name === dbName);
                        const isLoading = loadingDbDetails.has(dbName);

                        return (
                          <>
                            <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                  <Database className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-base text-slate-100 font-mono">{dbName}</h3>
                                    {dbMeta?.isSystem && (
                                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-sans font-bold">
                                        SYSTEM CATALOG
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
                                    <span>{details?.defaultCharacterSet || dbMeta?.defaultCharacterSet || 'utf8mb4'}</span>
                                    <span>•</span>
                                    <span>{details?.defaultCollation || dbMeta?.defaultCollation}</span>
                                    <span>•</span>
                                    <span className="text-emerald-400 font-bold">{details?.sizePretty || dbMeta?.sizePretty || '0 B'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => loadDatabaseDetails(dbName, true)}
                                  disabled={isLoading}
                                  className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                                  title={isEn ? 'Refresh Tables' : 'بروزرسانی جداول'}
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
                                  <span className="hidden sm:inline">{isEn ? 'Reload' : 'تازه‌سازی'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenSqlForDatabase(dbName)}
                                  className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Terminal className="w-3.5 h-3.5" />
                                  <span>{isEn ? 'Open in Console' : 'کنسول SQL'}</span>
                                </button>
                              </div>
                            </div>

                            {/* Tables Explorer Section */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <Table className="w-4 h-4 text-cyan-400" />
                                  <span className="font-bold text-xs">
                                    {isEn ? 'Tables & Views' : 'جداول و نماها'} ({details?.tables?.length ?? dbMeta?.tableCount ?? 0})
                                  </span>
                                </div>

                                <div className="relative w-48 sm:w-64">
                                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input
                                    type="text"
                                    value={tableSearch}
                                    onChange={(e) => setTableSearch(e.target.value)}
                                    placeholder={isEn ? 'Filter tables...' : 'فیلتر جداول...'}
                                    className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-white/10 bg-black/20 text-xs focus:outline-hidden"
                                  />
                                </div>
                              </div>

                              {/* Tables Table Grid */}
                              <div className="rounded-xl border border-white/10 overflow-hidden">
                                <table className="w-full text-xs text-left">
                                  <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                    <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                      <th className="p-2.5">{isEn ? 'Table' : 'نام جدول'}</th>
                                      <th className="p-2.5">{isEn ? 'Type' : 'نوع'}</th>
                                      <th className="p-2.5">{isEn ? 'Engine' : 'موتور'}</th>
                                      <th className="p-2.5 text-right">{isEn ? 'Rows' : 'تعداد سطرها'}</th>
                                      <th className="p-2.5 text-right">{isEn ? 'Data Size' : 'حجم داده'}</th>
                                      <th className="p-2.5 text-right">{isEn ? 'Index Size' : 'حجم ایندکس'}</th>
                                      <th className="p-2.5 text-right">{isEn ? 'Total Size' : 'حجم کل'}</th>
                                      <th className="p-2.5 text-center">{isEn ? 'Query' : 'کوئری'}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5 font-mono">
                                    {isLoading ? (
                                      <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-400">
                                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                                          <span>{isEn ? 'Fetching table metadata from information_schema...' : 'در حال خواندن متادیتا از information_schema...'}</span>
                                        </td>
                                      </tr>
                                    ) : details?.tables && details.tables.length > 0 ? (
                                      details.tables
                                        .filter((t) => !tableSearch || t.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                        .map((t) => {
                                          const isSelected = selectedTreeNode.type === 'table' && selectedTreeNode.tableName === t.name;
                                          return (
                                            <tr
                                              key={t.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'table',
                                                  id: `table:${dbName}:${t.name}`,
                                                  name: t.name,
                                                  dbName,
                                                  tableName: t.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isSelected
                                                  ? 'bg-orange-500/15 text-orange-200'
                                                  : isLightMode
                                                  ? 'hover:bg-slate-100'
                                                  : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Table className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                <span className="truncate max-w-xs">{t.name}</span>
                                              </td>
                                              <td className="p-2.5 text-slate-400 text-[11px] font-sans">
                                                {t.type === 'VIEW' ? (
                                                  <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">VIEW</span>
                                                ) : (
                                                  'TABLE'
                                                )}
                                              </td>
                                              <td className="p-2.5 text-slate-300 font-sans text-[11px]">{t.engine || '—'}</td>
                                              <td className="p-2.5 text-right text-cyan-400 font-bold">
                                                {t.approxRows.toLocaleString()}
                                              </td>
                                              <td className="p-2.5 text-right text-slate-400">{t.dataLengthPretty}</td>
                                              <td className="p-2.5 text-right text-slate-400">{t.indexLengthPretty}</td>
                                              <td className="p-2.5 text-right text-emerald-400 font-bold">{t.totalSizePretty}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenSqlForDatabase(dbName, t.name)}
                                                  className="p-1 rounded hover:bg-orange-500/20 text-slate-400 hover:text-orange-300"
                                                  title={`SELECT * FROM \`${dbName}\`.\`${t.name}\` LIMIT 50`}
                                                >
                                                  <Play className="w-3 h-3" />
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })
                                    ) : (
                                      <tr>
                                        <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                                          {isEn ? 'No tables found in this database.' : 'هیچ جدولی در این پایگاه داده یافت نشد.'}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* ---------------------------------------------------- */}
                  {/* VIEW D: USERS & ACCOUNTS LIST                        */}
                  {/* ---------------------------------------------------- */}
                  {(selectedTreeNode.type === 'users_folder' || selectedTreeNode.type === 'user') && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-400" />
                          <span className="font-bold text-xs">{isEn ? 'MySQL User Accounts' : 'حساب‌های کاربری MySQL'} ({users.length})</span>
                        </div>
                        <div className="relative w-48 sm:w-64">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder={isEn ? 'Filter users...' : 'فیلتر حساب‌ها...'}
                            className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-white/10 bg-black/20 text-xs focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                            <tr className="border-b border-white/10 text-slate-400 font-semibold">
                              <th className="p-3">{isEn ? 'User Account' : 'نام کاربر'}</th>
                              <th className="p-3">{isEn ? 'Host Scope' : 'محدوده هاست'}</th>
                              <th className="p-3">{isEn ? 'Auth Plugin' : 'پلاگین احراز هویت'}</th>
                              <th className="p-3 text-center">{isEn ? 'Status' : 'وضعیت حساب'}</th>
                              <th className="p-3 text-center">{isEn ? 'Password Expired' : 'انقضای رمز'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 font-mono">
                            {users
                              .filter((u) => !userSearch || u.user.toLowerCase().includes(userSearch.toLowerCase()) || u.host.toLowerCase().includes(userSearch.toLowerCase()))
                              .map((u) => (
                                <tr key={`${u.user}@${u.host}`} className={isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'}>
                                  <td className="p-3 flex items-center gap-2 font-bold text-slate-200">
                                    <User className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>{u.user}</span>
                                  </td>
                                  <td className="p-3 text-slate-400">{u.host}</td>
                                  <td className="p-3 text-slate-300 font-sans text-[11px]">{u.plugin || 'default'}</td>
                                  <td className="p-3 text-center">
                                    {u.accountLocked ? (
                                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-sans font-bold">
                                        {isEn ? 'Locked' : 'قفل‌شده'}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-sans font-bold">
                                        {isEn ? 'Active' : 'فعال'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-center text-slate-400 text-[10px] font-sans">
                                    {u.passwordExpired ? (
                                      <span className="text-amber-400 font-bold">{isEn ? 'Expired' : 'منقضی'}</span>
                                    ) : (
                                      <span className="text-slate-500">{isEn ? 'Valid' : 'معتبر'}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. SQL CONSOLE TAB */}
          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div
                className={`p-3 rounded-xl border flex flex-col gap-2 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-orange-400" />
                    <span>{isEn ? 'Interactive MySQL Query' : 'ویرایشگر و اجرای کوئری MySQL'}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {['SHOW DATABASES;', 'SHOW PROCESSLIST;', 'SHOW STATUS LIKE "Uptime";', 'SHOW VARIABLES LIKE "%version%";'].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => setSqlQuery(sample)}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-black/20 hover:bg-black/40 border border-white/10 text-slate-300 transition cursor-pointer"
                      >
                        {sample.split(' ')[1] || sample}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="SELECT * FROM table LIMIT 50;"
                  className={`w-full p-2.5 rounded-lg border font-mono text-xs ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-black/40 border-white/10 text-slate-100'
                  }`}
                />

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    {queryResult?.durationMs !== undefined && `${queryResult.durationMs}ms`}
                    {queryResult?.rowCount !== undefined && ` • ${queryResult.rowCount} rows`}
                  </span>
                  <button
                    type="button"
                    onClick={handleExecuteSql}
                    disabled={isExecutingSql || !sqlQuery.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isExecutingSql ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isEn ? 'Execute Query' : 'اجرای کوئری'}</span>
                  </button>
                </div>
              </div>

              {/* Query Result Table */}
              {queryResult && (
                <div
                  className={`rounded-xl border overflow-hidden ${
                    queryResult.success
                      ? isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                      : isLightMode ? 'bg-rose-50 border-rose-300' : 'bg-rose-950/40 border-rose-500/30'
                  }`}
                >
                  {!queryResult.success ? (
                    <div className="p-4 text-xs text-rose-300 font-mono">
                      {isEn ? queryResult.error : queryResult.errorFa || queryResult.error}
                    </div>
                  ) : Array.isArray(queryResult.rows) && queryResult.rows.length > 0 ? (
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-xs text-left">
                        <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/40'}>
                          <tr className="border-b border-white/10">
                            {(queryResult.columns || []).map((col) => (
                              <th key={col} className="p-2.5 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                          {queryResult.rows.map((row, idx) => (
                            <tr key={idx} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}>
                              {(queryResult.columns || []).map((col) => (
                                <td key={col} className="p-2.5 text-slate-300 whitespace-nowrap max-w-xs truncate">
                                  {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? 'NULL')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 text-xs text-slate-400 font-mono text-center">
                      {isEn
                        ? `Query executed successfully. (Affected rows: ${queryResult.affectedRows ?? 0})`
                        : `کوئری با موفقیت اجرا شد. (سطرهای تغییر یافته: ${queryResult.affectedRows ?? 0})`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. PROCESSLIST TAB */}
          {activeTab === 'processlist' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">
                  {isEn ? 'Active Connections & Threads' : 'پروسس‌ها و اتصالات فعال'}
                </span>
                <button
                  type="button"
                  onClick={loadProcesslist}
                  disabled={isLoadingProcesses}
                  className="px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 hover:bg-white/10 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProcesses ? 'animate-spin text-orange-400' : ''}`} />
                  <span>{isEn ? 'Refresh Threads' : 'تازه‌سازی'}</span>
                </button>
              </div>

              <div
                className={`rounded-xl border overflow-hidden ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <table className="w-full text-xs text-left">
                  <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/20'}>
                    <tr className="border-b border-white/10">
                      <th className="p-2.5">ID</th>
                      <th className="p-2.5">{isEn ? 'User' : 'کاربر'}</th>
                      <th className="p-2.5">{isEn ? 'Host' : 'مبدا'}</th>
                      <th className="p-2.5">{isEn ? 'Database' : 'دیتابیس'}</th>
                      <th className="p-2.5">{isEn ? 'Command' : 'دستور'}</th>
                      <th className="p-2.5">{isEn ? 'Time (s)' : 'زمان (ثانیه)'}</th>
                      <th className="p-2.5">{isEn ? 'Query Info' : 'کوئری / وضعیت'}</th>
                      <th className="p-2.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                    {isLoadingProcesses ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                          <span>{isEn ? 'Loading processlist...' : 'در حال بارگذاری پروسس‌ها...'}</span>
                        </td>
                      </tr>
                    ) : processes.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400 font-sans">
                          {isEn ? 'No running processes.' : 'پروسس فعالی یافت نشد.'}
                        </td>
                      </tr>
                    ) : (
                      processes.map((p) => (
                        <tr key={p.id} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}>
                          <td className="p-2.5 text-slate-400 font-bold">{p.id}</td>
                          <td className="p-2.5 text-cyan-400">{p.user}</td>
                          <td className="p-2.5 text-slate-400">{p.host}</td>
                          <td className="p-2.5 text-amber-400">{p.db || '—'}</td>
                          <td className="p-2.5">{p.command}</td>
                          <td className="p-2.5 text-slate-300 font-bold">{p.time}s</td>
                          <td className="p-2.5 max-w-xs truncate text-slate-300" title={p.info || ''}>
                            {p.info || p.state || 'Sleep'}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleKillProcess(p.id)}
                              disabled={killingId === p.id}
                              className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition text-[10px] cursor-pointer"
                              title={isEn ? `Kill Thread ${p.id}` : `بستن اتصال ${p.id}`}
                            >
                              {killingId === p.id ? '...' : isEn ? 'Kill' : 'پایان'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. VARIABLES TAB */}
          {activeTab === 'variables' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={varSearch}
                    onChange={(e) => setVarSearch(e.target.value)}
                    placeholder={isEn ? 'Search variables (e.g. buffer, timeout)...' : 'جستجوی متغیرها...'}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={loadVariables}
                  disabled={isLoadingVariables}
                  className="px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 hover:bg-white/10 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVariables ? 'animate-spin text-orange-400' : ''}`} />
                  <span>{isEn ? 'Filter' : 'اعمال'}</span>
                </button>
              </div>

              <div
                className={`rounded-xl border overflow-hidden ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <table className="w-full text-xs text-left">
                  <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/20'}>
                    <tr className="border-b border-white/10">
                      <th className="p-2.5">{isEn ? 'Variable Name' : 'نام متغیر'}</th>
                      <th className="p-2.5">{isEn ? 'Current Value' : 'مقدار'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                    {isLoadingVariables ? (
                      <tr>
                        <td colSpan={2} className="p-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                          <span>{isEn ? 'Loading variables...' : 'در حال بارگذاری متغیرها...'}</span>
                        </td>
                      </tr>
                    ) : filteredVariables.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="p-8 text-center text-slate-400 font-sans">
                          {isEn ? 'No matching variables.' : 'هیچ متغیری با این نام یافت نشد.'}
                        </td>
                      </tr>
                    ) : (
                      filteredVariables.map((v) => (
                        <tr key={v.name} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}>
                          <td className="p-2.5 text-cyan-300 font-bold">{v.name}</td>
                          <td className="p-2.5 text-slate-300 max-w-md truncate" title={v.value}>
                            {v.value}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. CONNECTION & SECURITY TAB */}
          {activeTab === 'connection' && (
            <div className="space-y-4 max-w-xl">
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
                }`}
              >
                <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                  <Key className="w-4 h-4 text-orange-400" />
                  <span className="text-xs font-bold">
                    {isEn ? 'Connection Parameters' : 'پارامترهای اتصال پایگاه‌داده'}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Target Host / IP' : 'آدرس هاست / IP'}:</span>
                    <span className="font-bold">{server.ip}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'MySQL Port' : 'پورت اتصال'}:</span>
                    <span className="font-bold">{server.mysql_port || 3306}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Username' : 'نام کاربری'}:</span>
                    <span className="font-bold text-cyan-400">{server.mysql_user || 'root'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Database' : 'نام پایگاه داده'}:</span>
                    <span className="font-bold text-amber-400">{server.mysql_database || 'mysql'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">{isEn ? 'Password Stored' : 'وضعیت رمز عبور'}:</span>
                    <span className="font-bold text-emerald-400">
                      {server.mysql_password_set ? (isEn ? 'Configured (Encrypted at rest)' : 'تنظیم‌شده (رمزنگاری شده)') : (isEn ? 'None' : 'ثبت‌نشده')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={runTestConnection}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Test Connection' : 'تست مجدد اتصال'}</span>
                  </button>
                  {onEditServer && (
                    <button
                      type="button"
                      onClick={() => onEditServer(server)}
                      className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-medium transition cursor-pointer"
                    >
                      {isEn ? 'Edit Credentials' : 'ویرایش اطلاعات سرور'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
