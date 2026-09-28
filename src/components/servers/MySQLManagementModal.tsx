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
  MysqlViewSummary,
  MysqlRoutineSummary,
  MysqlTriggerSummary,
  MysqlEventSummary,
  MysqlSequenceSummary,
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
  fetchRemoteServerMysqlDatabaseObjects,
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

  // Database browser tree navigation state (Phase 3 & Phase 4)
  type TreeNodeType =
    | 'root'
    | 'databases_folder'
    | 'database'
    | 'tables_folder'
    | 'table'
    | 'views_folder'
    | 'view'
    | 'procedures_folder'
    | 'procedure'
    | 'functions_folder'
    | 'function'
    | 'triggers_folder'
    | 'trigger'
    | 'events_folder'
    | 'event'
    | 'sequences_folder'
    | 'sequence'
    | 'users_folder'
    | 'user'
    | 'server_folder';

  const [selectedTreeNode, setSelectedTreeNode] = useState<{
    type: TreeNodeType;
    id: string;
    name: string;
    dbName?: string;
    tableName?: string;
    viewName?: string;
    procedureName?: string;
    functionName?: string;
    triggerName?: string;
    eventName?: string;
    sequenceName?: string;
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
  const [objectSearch, setObjectSearch] = useState('');
  const [dbActiveObjectTab, setDbActiveObjectTab] = useState<
    'tables' | 'views' | 'procedures' | 'functions' | 'triggers' | 'events' | 'sequences'
  >('tables');
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

  const handleOpenSqlForDatabase = (dbName: string, table?: string, customQuery?: string) => {
    let query = '';
    if (customQuery) {
      query = customQuery;
    } else if (table) {
      query = `USE \`${dbName}\`;\nSELECT * FROM \`${table}\` LIMIT 50;`;
    } else {
      query = `USE \`${dbName}\`;\nSHOW TABLES;`;
    }
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

                                        {/* Schema Objects sub-branches under database (Phase 4) */}
                                        {isExpanded && (
                                          <div className="pl-3 mt-0.5 space-y-0.5 border-l border-slate-700/20 ml-2">
                                            {isLoadingDetails ? (
                                              <div className="py-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                                                <RefreshCw className="w-3 h-3 animate-spin text-orange-400" />
                                                <span>{isEn ? 'Loading schema objects...' : 'در حال خواندن اجزای دیتابیس...'}</span>
                                              </div>
                                            ) : (
                                              <>
                                                {/* 1. TABLES FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'tables_folder',
                                                        id: `db:${db.name}:tables`,
                                                        name: isEn ? 'Tables' : 'جداول',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('tables');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'tables_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-orange-500/20 text-orange-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:tables`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:tables`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Table className="w-3 h-3 text-cyan-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Tables' : 'جداول'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.tables?.length ?? details?.tableCount ?? db.tableCount}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:tables`) && details?.tables && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.tables
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
                                                              <Table className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                                                              <span className="truncate flex-1" title={table.name}>
                                                                {table.name}
                                                              </span>
                                                              <span className="text-[9px] text-slate-500 font-mono">
                                                                {table.approxRows > 0 ? table.approxRows.toLocaleString() : '0'}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 2. VIEWS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'views_folder',
                                                        id: `db:${db.name}:views`,
                                                        name: isEn ? 'Views' : 'نماها',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('views');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'views_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-purple-500/20 text-purple-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:views`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:views`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Eye className="w-3 h-3 text-purple-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Views' : 'نماها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.views?.length ?? details?.viewsCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:views`) && details?.views && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.views
                                                        .filter((v) => !treeSearch || v.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((view) => {
                                                          const isViewSelected =
                                                            selectedTreeNode.type === 'view' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.viewName === view.name;
                                                          return (
                                                            <div
                                                              key={view.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'view',
                                                                  id: `view:${db.name}:${view.name}`,
                                                                  name: view.name,
                                                                  dbName: db.name,
                                                                  viewName: view.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isViewSelected
                                                                  ? 'bg-purple-500/25 text-purple-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Eye className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                                                              <span className="truncate flex-1" title={view.name}>
                                                                {view.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 3. STORED PROCEDURES FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'procedures_folder',
                                                        id: `db:${db.name}:procedures`,
                                                        name: isEn ? 'Stored Procedures' : 'رویه‌های ذخیره‌شده',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('procedures');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'procedures_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:procedures`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:procedures`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Code className="w-3 h-3 text-emerald-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Procedures' : 'رویه‌ها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.procedures?.length ?? details?.proceduresCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:procedures`) && details?.procedures && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.procedures
                                                        .filter((p) => !treeSearch || p.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((proc) => {
                                                          const isProcSelected =
                                                            selectedTreeNode.type === 'procedure' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.procedureName === proc.name;
                                                          return (
                                                            <div
                                                              key={proc.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'procedure',
                                                                  id: `procedure:${db.name}:${proc.name}`,
                                                                  name: proc.name,
                                                                  dbName: db.name,
                                                                  procedureName: proc.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isProcSelected
                                                                  ? 'bg-emerald-500/25 text-emerald-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Code className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                                                              <span className="truncate flex-1" title={proc.name}>
                                                                {proc.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 4. STORED FUNCTIONS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'functions_folder',
                                                        id: `db:${db.name}:functions`,
                                                        name: isEn ? 'Stored Functions' : 'توابع ذخیره‌شده',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('functions');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'functions_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:functions`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:functions`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Functions' : 'توابع'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.functions?.length ?? details?.functionsCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:functions`) && details?.functions && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.functions
                                                        .filter((f) => !treeSearch || f.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((func) => {
                                                          const isFuncSelected =
                                                            selectedTreeNode.type === 'function' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.functionName === func.name;
                                                          return (
                                                            <div
                                                              key={func.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'function',
                                                                  id: `function:${db.name}:${func.name}`,
                                                                  name: func.name,
                                                                  dbName: db.name,
                                                                  functionName: func.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isFuncSelected
                                                                  ? 'bg-amber-500/25 text-amber-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                                              <span className="truncate flex-1" title={func.name}>
                                                                {func.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 5. TRIGGERS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'triggers_folder',
                                                        id: `db:${db.name}:triggers`,
                                                        name: isEn ? 'Triggers' : 'تریگرها',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('triggers');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'triggers_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-rose-500/20 text-rose-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:triggers`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:triggers`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Activity className="w-3 h-3 text-rose-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Triggers' : 'تریگرها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.triggers?.length ?? details?.triggersCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:triggers`) && details?.triggers && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.triggers
                                                        .filter((tr) => !treeSearch || tr.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((trig) => {
                                                          const isTrigSelected =
                                                            selectedTreeNode.type === 'trigger' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.triggerName === trig.name;
                                                          return (
                                                            <div
                                                              key={trig.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'trigger',
                                                                  id: `trigger:${db.name}:${trig.name}`,
                                                                  name: trig.name,
                                                                  dbName: db.name,
                                                                  triggerName: trig.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isTrigSelected
                                                                  ? 'bg-rose-500/25 text-rose-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Activity className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                                              <span className="truncate flex-1" title={trig.name}>
                                                                {trig.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 6. EVENTS FOLDER */}
                                                <div>
                                                  <div
                                                    onClick={() => {
                                                      setSelectedTreeNode({
                                                        type: 'events_folder',
                                                        id: `db:${db.name}:events`,
                                                        name: isEn ? 'Scheduled Events' : 'رویدادها',
                                                        dbName: db.name,
                                                      });
                                                      setDbActiveObjectTab('events');
                                                    }}
                                                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                      selectedTreeNode.type === 'events_folder' && selectedTreeNode.dbName === db.name
                                                        ? 'bg-blue-500/20 text-blue-300 font-bold'
                                                        : isLightMode
                                                        ? 'hover:bg-slate-200 text-slate-700'
                                                        : 'hover:bg-white/5 text-slate-300'
                                                    }`}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleTreeNode(`db:${db.name}:events`);
                                                      }}
                                                      className="p-0.5 hover:text-white"
                                                    >
                                                      {expandedTreeNodes.has(`db:${db.name}:events`) ? (
                                                        <ChevronDown className="w-2.5 h-2.5" />
                                                      ) : (
                                                        <ChevronRight className="w-2.5 h-2.5" />
                                                      )}
                                                    </button>
                                                    <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                                                    <span className="truncate flex-1">{isEn ? 'Events' : 'رویدادها'}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">
                                                      {details?.events?.length ?? details?.eventsCount ?? 0}
                                                    </span>
                                                  </div>
                                                  {expandedTreeNodes.has(`db:${db.name}:events`) && details?.events && (
                                                    <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                      {details.events
                                                        .filter((ev) => !treeSearch || ev.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                        .map((event) => {
                                                          const isEventSelected =
                                                            selectedTreeNode.type === 'event' &&
                                                            selectedTreeNode.dbName === db.name &&
                                                            selectedTreeNode.eventName === event.name;
                                                          return (
                                                            <div
                                                              key={event.name}
                                                              onClick={() => {
                                                                setSelectedTreeNode({
                                                                  type: 'event',
                                                                  id: `event:${db.name}:${event.name}`,
                                                                  name: event.name,
                                                                  dbName: db.name,
                                                                  eventName: event.name,
                                                                });
                                                              }}
                                                              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                isEventSelected
                                                                  ? 'bg-blue-500/25 text-blue-300 font-bold'
                                                                  : isLightMode
                                                                  ? 'hover:bg-slate-200 text-slate-600'
                                                                  : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                              }`}
                                                            >
                                                              <Clock className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                                                              <span className="truncate flex-1" title={event.name}>
                                                                {event.name}
                                                              </span>
                                                            </div>
                                                          );
                                                        })}
                                                    </div>
                                                  )}
                                                </div>

                                                {/* 7. SEQUENCES FOLDER (if supported) */}
                                                {details?.sequences && details.sequences.length > 0 && (
                                                  <div>
                                                    <div
                                                      onClick={() => {
                                                        setSelectedTreeNode({
                                                          type: 'sequences_folder',
                                                          id: `db:${db.name}:sequences`,
                                                          name: isEn ? 'Sequences' : 'دنباله‌ها',
                                                          dbName: db.name,
                                                        });
                                                        setDbActiveObjectTab('sequences');
                                                      }}
                                                      className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-sans ${
                                                        selectedTreeNode.type === 'sequences_folder' && selectedTreeNode.dbName === db.name
                                                          ? 'bg-teal-500/20 text-teal-300 font-bold'
                                                          : isLightMode
                                                          ? 'hover:bg-slate-200 text-slate-700'
                                                          : 'hover:bg-white/5 text-slate-300'
                                                      }`}
                                                    >
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          toggleTreeNode(`db:${db.name}:sequences`);
                                                        }}
                                                        className="p-0.5 hover:text-white"
                                                      >
                                                        {expandedTreeNodes.has(`db:${db.name}:sequences`) ? (
                                                          <ChevronDown className="w-2.5 h-2.5" />
                                                        ) : (
                                                          <ChevronRight className="w-2.5 h-2.5" />
                                                        )}
                                                      </button>
                                                      <Hash className="w-3 h-3 text-teal-400 shrink-0" />
                                                      <span className="truncate flex-1">{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                                                      <span className="text-[10px] text-slate-500 font-mono">
                                                        {details.sequences.length}
                                                      </span>
                                                    </div>
                                                    {expandedTreeNodes.has(`db:${db.name}:sequences`) && (
                                                      <div className="pl-3 space-y-0.5 border-l border-slate-700/20 ml-2 mt-0.5">
                                                        {details.sequences
                                                          .filter((s) => !treeSearch || s.name.toLowerCase().includes(treeSearch.toLowerCase()))
                                                          .map((seq) => {
                                                            const isSeqSelected =
                                                              selectedTreeNode.type === 'sequence' &&
                                                              selectedTreeNode.dbName === db.name &&
                                                              selectedTreeNode.sequenceName === seq.name;
                                                            return (
                                                              <div
                                                                key={seq.name}
                                                                onClick={() => {
                                                                  setSelectedTreeNode({
                                                                    type: 'sequence',
                                                                    id: `sequence:${db.name}:${seq.name}`,
                                                                    name: seq.name,
                                                                    dbName: db.name,
                                                                    sequenceName: seq.name,
                                                                  });
                                                                }}
                                                                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer text-[11px] transition font-mono ${
                                                                  isSeqSelected
                                                                    ? 'bg-teal-500/25 text-teal-300 font-bold'
                                                                    : isLightMode
                                                                    ? 'hover:bg-slate-200 text-slate-600'
                                                                    : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'
                                                                }`}
                                                              >
                                                                <Hash className="w-2.5 h-2.5 text-teal-400 shrink-0" />
                                                                <span className="truncate flex-1" title={seq.name}>
                                                                  {seq.name}
                                                                </span>
                                                              </div>
                                                            );
                                                          })}
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                              </>
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
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          >
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span className="text-orange-400 font-bold">{selectedTreeNode.dbName}</span>
                        </>
                      )}
                      {(selectedTreeNode.type === 'tables_folder' ||
                        selectedTreeNode.type === 'views_folder' ||
                        selectedTreeNode.type === 'procedures_folder' ||
                        selectedTreeNode.type === 'functions_folder' ||
                        selectedTreeNode.type === 'triggers_folder' ||
                        selectedTreeNode.type === 'events_folder' ||
                        selectedTreeNode.type === 'sequences_folder') && (
                        <>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          >
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() =>
                              setSelectedTreeNode({
                                type: 'database',
                                id: `db:${selectedTreeNode.dbName}`,
                                name: selectedTreeNode.dbName!,
                                dbName: selectedTreeNode.dbName,
                              })
                            }
                          >
                            {selectedTreeNode.dbName}
                          </span>
                          <span>/</span>
                          <span className="text-orange-400 font-bold">{selectedTreeNode.name}</span>
                        </>
                      )}
                      {(selectedTreeNode.type === 'table' ||
                        selectedTreeNode.type === 'view' ||
                        selectedTreeNode.type === 'procedure' ||
                        selectedTreeNode.type === 'function' ||
                        selectedTreeNode.type === 'trigger' ||
                        selectedTreeNode.type === 'event' ||
                        selectedTreeNode.type === 'sequence') && (
                        <>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'databases_folder', id: 'databases_folder', name: 'Databases' })}
                          >
                            {isEn ? 'Databases' : 'پایگاه‌های داده'}
                          </span>
                          <span>/</span>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() =>
                              setSelectedTreeNode({
                                type: 'database',
                                id: `db:${selectedTreeNode.dbName}`,
                                name: selectedTreeNode.dbName!,
                                dbName: selectedTreeNode.dbName,
                              })
                            }
                          >
                            {selectedTreeNode.dbName}
                          </span>
                          <span>/</span>
                          <span className="text-cyan-400 font-bold">{selectedTreeNode.name}</span>
                        </>
                      )}
                      {selectedTreeNode.type === 'users_folder' && (
                        <span className="text-blue-400 font-bold">{isEn ? 'Users & Accounts' : 'کاربران و دسترسی‌ها'}</span>
                      )}
                      {selectedTreeNode.type === 'user' && (
                        <>
                          <span
                            className="hover:underline cursor-pointer"
                            onClick={() => setSelectedTreeNode({ type: 'users_folder', id: 'users_folder', name: 'Users' })}
                          >
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
                  {/* VIEW C: INDIVIDUAL DATABASE SCHEMA & OBJECT EXPLORER */}
                  {/* ---------------------------------------------------- */}
                  {selectedTreeNode.dbName &&
                    (selectedTreeNode.type === 'database' ||
                      selectedTreeNode.type === 'tables_folder' ||
                      selectedTreeNode.type === 'views_folder' ||
                      selectedTreeNode.type === 'procedures_folder' ||
                      selectedTreeNode.type === 'functions_folder' ||
                      selectedTreeNode.type === 'triggers_folder' ||
                      selectedTreeNode.type === 'events_folder' ||
                      selectedTreeNode.type === 'sequences_folder' ||
                      selectedTreeNode.type === 'table' ||
                      selectedTreeNode.type === 'view' ||
                      selectedTreeNode.type === 'procedure' ||
                      selectedTreeNode.type === 'function' ||
                      selectedTreeNode.type === 'trigger' ||
                      selectedTreeNode.type === 'event' ||
                      selectedTreeNode.type === 'sequence') && (
                      <div className="space-y-4">
                        {(() => {
                          const dbName = selectedTreeNode.dbName!;
                          const details = dbDetailsCache[dbName];
                          const dbMeta = databases.find((d) => d.name === dbName);
                          const isLoading = loadingDbDetails.has(dbName);

                          // ========================================================
                          // SUB-VIEW 1: INDIVIDUAL VIEW INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'view') {
                            const currentView = details?.views?.find(
                              (v) => v.name === selectedTreeNode.viewName || v.name === selectedTreeNode.name
                            );
                            const viewDef = currentView?.definition
                              ? `CREATE OR REPLACE ALGORITHM = UNDEFINED\nVIEW \`${dbName}\`.\`${currentView.name}\` AS\n${currentView.definition};`
                              : `-- No definition retrieved for view \`${dbName}\`.\`${selectedTreeNode.name}\``;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'views_folder',
                                          id: `db:${dbName}:views`,
                                          name: isEn ? 'Views' : 'نماها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('views');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Views' : 'بازگشت به نماها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Eye className="w-4 h-4 text-purple-400" />
                                      <span className="font-bold text-sm font-mono text-purple-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-sans font-bold">
                                        VIEW
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(viewDef, `view-def-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `view-def-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `view-def-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied SQL' : 'کپی شد'
                                          : isEn ? 'Copy View SQL' : 'کپی SQL نما'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSqlForDatabase(dbName, selectedTreeNode.name)}
                                      className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span>{isEn ? 'Query View' : 'اجرای کوئری'}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Updatable' : 'قابل ویرایش'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {currentView?.isUpdatable ? (
                                        <span className="text-emerald-400">YES</span>
                                      ) : (
                                        <span className="text-slate-400">NO</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Check Option' : 'بررسی محدودیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {currentView?.checkOption || 'NONE'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Security Type' : 'نوع امنیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-purple-300 mt-1">
                                      {currentView?.securityType || 'DEFINER'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Created At' : 'تاریخ ساخت'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate">
                                      {currentView?.createTime ? new Date(currentView.createTime).toLocaleDateString() : '—'}
                                    </div>
                                  </div>
                                </div>

                                {/* Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Code className="w-3.5 h-3.5 text-purple-400" />
                                      <span>{isEn ? 'View Definition (SQL DDL)' : 'تعریف SQL نما (DDL)'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-purple-500/20 bg-slate-950 font-mono text-xs text-purple-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {viewDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 2: INDIVIDUAL STORED PROCEDURE INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'procedure') {
                            const proc = details?.procedures?.find(
                              (p) => p.name === selectedTreeNode.procedureName || p.name === selectedTreeNode.name
                            );
                            const procDef = proc?.definition || proc?.body || `-- Routine body not available or empty`;
                            const callStmt = `CALL \`${dbName}\`.\`${selectedTreeNode.name}\`();`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'procedures_folder',
                                          id: `db:${dbName}:procedures`,
                                          name: isEn ? 'Stored Procedures' : 'رویه‌های ذخیره‌شده',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('procedures');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Procedures' : 'بازگشت به رویه‌ها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Code className="w-4 h-4 text-emerald-400" />
                                      <span className="font-bold text-sm font-mono text-emerald-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-sans font-bold">
                                        PROCEDURE
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(callStmt, `call-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `call-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `call-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy CALL' : 'کپی دستور CALL'}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSqlForDatabase(dbName, undefined, callStmt)}
                                      className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Terminal className="w-3.5 h-3.5" />
                                      <span>{isEn ? 'Open in Console' : 'کنسول SQL'}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک/تعریف‌کننده'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={proc?.definer}>
                                      {proc?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Security Context' : 'زمینه امنیتی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {proc?.securityType || 'DEFINER'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Deterministic' : 'قطعی/تکرارپذیر'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {proc?.isDeterministic ? (
                                        <span className="text-emerald-400">YES</span>
                                      ) : (
                                        <span className="text-slate-400">NO</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Data Access' : 'سطح دسترسی داده'}
                                    </div>
                                    <div className="text-xs font-mono text-amber-300 mt-1 truncate">
                                      {proc?.sqlDataAccess || 'CONTAINS SQL'}
                                    </div>
                                  </div>
                                </div>

                                {/* Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Code className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>{isEn ? 'Procedure Routine Definition' : 'متن و کدهای رویه ذخیره‌شده'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-emerald-500/20 bg-slate-950 font-mono text-xs text-emerald-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {procDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 3: INDIVIDUAL STORED FUNCTION INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'function') {
                            const func = details?.functions?.find(
                              (f) => f.name === selectedTreeNode.functionName || f.name === selectedTreeNode.name
                            );
                            const funcDef = func?.definition || func?.body || `-- Function body not available or empty`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'functions_folder',
                                          id: `db:${dbName}:functions`,
                                          name: isEn ? 'Stored Functions' : 'توابع ذخیره‌شده',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('functions');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Functions' : 'بازگشت به توابع'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Zap className="w-4 h-4 text-amber-400" />
                                      <span className="font-bold text-sm font-mono text-amber-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-sans font-bold">
                                        FUNCTION
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(funcDef, `func-def-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `func-def-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `func-def-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy Function SQL' : 'کپی متن تابع'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Return Type' : 'نوع بازگشتی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-amber-300 mt-1">
                                      {func?.returnType || 'text'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={func?.definer}>
                                      {func?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Security Type' : 'نوع امنیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {func?.securityType || 'DEFINER'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Deterministic' : 'قطعی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {func?.isDeterministic ? (
                                        <span className="text-emerald-400">YES</span>
                                      ) : (
                                        <span className="text-slate-400">NO</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                                      <span>{isEn ? 'Function Routine Body' : 'کدهای بدنه تابع'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-amber-500/20 bg-slate-950 font-mono text-xs text-amber-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {funcDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 4: INDIVIDUAL TRIGGER INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'trigger') {
                            const trig = details?.triggers?.find(
                              (tr) => tr.name === selectedTreeNode.triggerName || tr.name === selectedTreeNode.name
                            );
                            const trigDef = trig?.statement
                              ? `CREATE TRIGGER \`${trig.name}\`\n${trig.timing} ${trig.event} ON \`${trig.tableName}\`\nFOR EACH ROW\n${trig.statement};`
                              : `-- Trigger statement not available`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'triggers_folder',
                                          id: `db:${dbName}:triggers`,
                                          name: isEn ? 'Triggers' : 'تریگرها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('triggers');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Triggers' : 'بازگشت به تریگرها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Activity className="w-4 h-4 text-rose-400" />
                                      <span className="font-bold text-sm font-mono text-rose-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-sans font-bold">
                                        TRIGGER
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(trigDef, `trig-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `trig-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `trig-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy Trigger SQL' : 'کپی متن تریگر'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Target Table' : 'جدول هدف'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1 truncate">
                                      {trig?.tableName || '—'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Timing' : 'زمان اجرا'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-rose-300 mt-1">
                                      {trig?.timing || 'BEFORE'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Event' : 'عملیات عامل'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-amber-300 mt-1">
                                      {trig?.event || 'INSERT'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={trig?.definer}>
                                      {trig?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                </div>

                                {/* Statement Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Activity className="w-3.5 h-3.5 text-rose-400" />
                                      <span>{isEn ? 'Trigger Action Statement' : 'دستورات اجرایی تریگر'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-rose-500/20 bg-slate-950 font-mono text-xs text-rose-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {trigDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 5: INDIVIDUAL SCHEDULED EVENT INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'event') {
                            const ev = details?.events?.find(
                              (e) => e.name === selectedTreeNode.eventName || e.name === selectedTreeNode.name
                            );
                            const evDef = ev?.definition || `-- Scheduled event body not available`;

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'events_folder',
                                          id: `db:${dbName}:events`,
                                          name: isEn ? 'Scheduled Events' : 'رویدادها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('events');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Events' : 'بازگشت به رویدادها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-4 h-4 text-blue-400" />
                                      <span className="font-bold text-sm font-mono text-blue-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-sans font-bold">
                                        EVENT
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(evDef, `ev-def-${selectedTreeNode.name}`)}
                                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-mono flex items-center gap-1.5 text-slate-300 cursor-pointer"
                                    >
                                      {copiedSnippet === `ev-def-${selectedTreeNode.name}` ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                      <span>
                                        {copiedSnippet === `ev-def-${selectedTreeNode.name}`
                                          ? isEn ? 'Copied' : 'کپی شد'
                                          : isEn ? 'Copy Event SQL' : 'کپی متن رویداد'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Status' : 'وضعیت'}
                                    </div>
                                    <div className="text-sm font-bold font-mono mt-1">
                                      {ev?.status === 'ENABLED' ? (
                                        <span className="text-emerald-400">ENABLED</span>
                                      ) : (
                                        <span className="text-rose-400">{ev?.status || 'DISABLED'}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Schedule Type' : 'نوع زمان‌بندی'}
                                    </div>
                                    <div className="text-sm font-bold font-mono text-cyan-300 mt-1">
                                      {ev?.type || 'RECURRING'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Interval' : 'دوره تکرار'}
                                    </div>
                                    <div className="text-xs font-mono text-amber-300 mt-1">
                                      {ev?.intervalValue ? `${ev.intervalValue} ${ev.intervalField || ''}` : 'One-time'}
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Definer' : 'مالک'}
                                    </div>
                                    <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={ev?.definer}>
                                      {ev?.definer || 'root@localhost'}
                                    </div>
                                  </div>
                                </div>

                                {/* Event Definition Code Viewer */}
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-bold flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                                      <span>{isEn ? 'Event Scheduler Body' : 'کدهای رویداد زمان‌بندی‌شده'}</span>
                                    </span>
                                  </div>
                                  <div className="p-4 rounded-xl border border-blue-500/20 bg-slate-950 font-mono text-xs text-blue-200 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar shadow-inner">
                                    {evDef}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // SUB-VIEW 6: INDIVIDUAL SEQUENCE INSPECTOR
                          // ========================================================
                          if (selectedTreeNode.type === 'sequence') {
                            const seq = details?.sequences?.find(
                              (s) => s.name === selectedTreeNode.sequenceName || s.name === selectedTreeNode.name
                            );

                            return (
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTreeNode({
                                          type: 'sequences_folder',
                                          id: `db:${dbName}:sequences`,
                                          name: isEn ? 'Sequences' : 'دنباله‌ها',
                                          dbName,
                                        });
                                        setDbActiveObjectTab('sequences');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
                                    >
                                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                                      <span>{isEn ? 'Back to Sequences' : 'بازگشت به دنباله‌ها'}</span>
                                    </button>
                                    <div className="flex items-center gap-2">
                                      <Hash className="w-4 h-4 text-teal-400" />
                                      <span className="font-bold text-sm font-mono text-teal-200">{selectedTreeNode.name}</span>
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-teal-500/20 text-teal-300 font-sans font-bold">
                                        SEQUENCE
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Metadata Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Start Value' : 'مقدار شروع'}
                                    </div>
                                    <div className="text-sm font-bold text-teal-300 mt-1">{seq?.startValue ?? '1'}</div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Minimum Value' : 'حداقل مقدار'}
                                    </div>
                                    <div className="text-sm font-bold text-slate-300 mt-1">{seq?.minimumValue ?? '1'}</div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Maximum Value' : 'حداکثر مقدار'}
                                    </div>
                                    <div className="text-sm font-bold text-slate-300 mt-1">{seq?.maximumValue ?? '—'}</div>
                                  </div>
                                  <div className="p-3 rounded-xl border border-white/10 bg-black/20">
                                    <div className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                                      {isEn ? 'Increment' : 'گام افزایش'}
                                    </div>
                                    <div className="text-sm font-bold text-emerald-400 mt-1">{seq?.increment ?? '1'}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // ========================================================
                          // DEFAULT VIEW: DATABASE SCHEMA & OBJECTS CATEGORY TABS
                          // ========================================================
                          const tablesList = details?.tables || [];
                          const viewsList = details?.views || [];
                          const proceduresList = details?.procedures || [];
                          const functionsList = details?.functions || [];
                          const triggersList = details?.triggers || [];
                          const eventsList = details?.events || [];
                          const sequencesList = details?.sequences || [];

                          return (
                            <>
                              {/* Database Header Card */}
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
                                    title={isEn ? 'Reload Schema Objects' : 'بروزرسانی اجزا'}
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

                              {/* Schema Objects Category Selector Tabs */}
                              <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 overflow-x-auto custom-scrollbar">
                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('tables')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'tables'
                                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Table className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>{isEn ? 'Tables' : 'جداول'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {tablesList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('views')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'views'
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Eye className="w-3.5 h-3.5 text-purple-400" />
                                  <span>{isEn ? 'Views' : 'نماها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {viewsList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('procedures')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'procedures'
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Code className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{isEn ? 'Procedures' : 'رویه‌ها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {proceduresList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('functions')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'functions'
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{isEn ? 'Functions' : 'توابع'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {functionsList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('triggers')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'triggers'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                                  <span>{isEn ? 'Triggers' : 'تریگرها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {triggersList.length}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setDbActiveObjectTab('events')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                    dbActiveObjectTab === 'events'
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold'
                                      : 'hover:bg-white/5 text-slate-400'
                                  }`}
                                >
                                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                                  <span>{isEn ? 'Events' : 'رویدادها'}</span>
                                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                    {eventsList.length}
                                  </span>
                                </button>

                                {sequencesList.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setDbActiveObjectTab('sequences')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                                      dbActiveObjectTab === 'sequences'
                                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30 font-bold'
                                        : 'hover:bg-white/5 text-slate-400'
                                    }`}
                                  >
                                    <Hash className="w-3.5 h-3.5 text-teal-400" />
                                    <span>{isEn ? 'Sequences' : 'دنباله‌ها'}</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 font-mono">
                                      {sequencesList.length}
                                    </span>
                                  </button>
                                )}
                              </div>

                              {/* Search bar inside category */}
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-slate-400 font-bold">
                                  {dbActiveObjectTab === 'tables' && `${isEn ? 'Base Tables' : 'جداول پایه'} (${tablesList.length})`}
                                  {dbActiveObjectTab === 'views' && `${isEn ? 'Database Views' : 'نماهای دیتابیس'} (${viewsList.length})`}
                                  {dbActiveObjectTab === 'procedures' && `${isEn ? 'Stored Procedures' : 'رویه‌های ذخیره‌شده'} (${proceduresList.length})`}
                                  {dbActiveObjectTab === 'functions' && `${isEn ? 'Stored Functions' : 'توابع ذخیره‌شده'} (${functionsList.length})`}
                                  {dbActiveObjectTab === 'triggers' && `${isEn ? 'Database Triggers' : 'تریگرهای دیتابیس'} (${triggersList.length})`}
                                  {dbActiveObjectTab === 'events' && `${isEn ? 'Scheduled Events' : 'رویدادهای زمان‌بندی‌شده'} (${eventsList.length})`}
                                  {dbActiveObjectTab === 'sequences' && `${isEn ? 'Database Sequences' : 'دنباله‌ها'} (${sequencesList.length})`}
                                </span>

                                <div className="relative w-48 sm:w-64">
                                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input
                                    type="text"
                                    value={tableSearch}
                                    onChange={(e) => setTableSearch(e.target.value)}
                                    placeholder={isEn ? `Search in ${dbActiveObjectTab}...` : `جستجو در ${dbActiveObjectTab}...`}
                                    className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-white/10 bg-black/20 text-xs focus:outline-hidden"
                                  />
                                </div>
                              </div>

                              {/* ---------------------------------------------- */}
                              {/* 1. TABLES GRID                                  */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'tables' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Table' : 'نام جدول'}</th>
                                        <th className="p-2.5">{isEn ? 'Engine' : 'موتور'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Approx Rows' : 'تعداد سطرها'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Data Size' : 'حجم داده'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Index Size' : 'حجم ایندکس'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Total Size' : 'حجم کل'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Query' : 'کوئری'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {isLoading ? (
                                        <tr>
                                          <td colSpan={7} className="p-8 text-center text-slate-400">
                                            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                                            <span>{isEn ? 'Fetching tables...' : 'در حال خواندن جداول...'}</span>
                                          </td>
                                        </tr>
                                      ) : tablesList.length > 0 ? (
                                        tablesList
                                          .filter((t) => !tableSearch || t.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((t) => (
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
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Table className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                <span className="truncate max-w-xs">{t.name}</span>
                                              </td>
                                              <td className="p-2.5 text-slate-300 font-sans text-[11px]">{t.engine || 'InnoDB'}</td>
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
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={7} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No base tables found.' : 'هیچ جدول پایه‌ای در این دیتابیس یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 2. VIEWS GRID                                   */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'views' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'View Name' : 'نام نما'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Updatable' : 'قابل ویرایش'}</th>
                                        <th className="p-2.5">{isEn ? 'Check Option' : 'محدودیت'}</th>
                                        <th className="p-2.5">{isEn ? 'Security Type' : 'زمینه امنیتی'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Query' : 'کوئری'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {viewsList.length > 0 ? (
                                        viewsList
                                          .filter((v) => !tableSearch || v.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((v) => (
                                            <tr
                                              key={v.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'view',
                                                  id: `view:${dbName}:${v.name}`,
                                                  name: v.name,
                                                  dbName,
                                                  viewName: v.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Eye className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                                <span className="truncate max-w-xs">{v.name}</span>
                                              </td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {v.isUpdatable ? (
                                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">YES</span>
                                                ) : (
                                                  <span className="text-slate-500">NO</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-slate-300 text-[11px]">{v.checkOption || 'NONE'}</td>
                                              <td className="p-2.5 text-purple-300 text-[11px]">{v.securityType || 'DEFINER'}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'view',
                                                      id: `view:${dbName}:${v.name}`,
                                                      name: v.name,
                                                      dbName,
                                                      viewName: v.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-purple-500/20 text-purple-300"
                                                  title={isEn ? 'Inspect DDL' : 'مشاهده تعریف'}
                                                >
                                                  <Eye className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => handleOpenSqlForDatabase(dbName, v.name)}
                                                  className="p-1 rounded hover:bg-orange-500/20 text-slate-400 hover:text-orange-300"
                                                  title={`SELECT * FROM \`${dbName}\`.\`${v.name}\` LIMIT 50`}
                                                >
                                                  <Play className="w-3 h-3" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No views found in this database.' : 'هیچ نمایی (View) در این دیتابیس یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 3. STORED PROCEDURES GRID                       */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'procedures' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Procedure' : 'نام رویه'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5">{isEn ? 'Security' : 'امنیت'}</th>
                                        <th className="p-2.5">{isEn ? 'Data Access' : 'سطح دسترسی'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Deterministic' : 'تکرارپذیر'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {proceduresList.length > 0 ? (
                                        proceduresList
                                          .filter((p) => !tableSearch || p.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((p) => (
                                            <tr
                                              key={p.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'procedure',
                                                  id: `procedure:${dbName}:${p.name}`,
                                                  name: p.name,
                                                  dbName,
                                                  procedureName: p.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Code className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                <span className="truncate max-w-xs">{p.name}</span>
                                              </td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs" title={p.definer}>
                                                {p.definer || 'root@localhost'}
                                              </td>
                                              <td className="p-2.5 text-cyan-300 text-[11px]">{p.securityType || 'DEFINER'}</td>
                                              <td className="p-2.5 text-amber-300 text-[11px]">{p.sqlDataAccess || 'CONTAINS SQL'}</td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {p.isDeterministic ? (
                                                  <span className="text-emerald-400 font-bold">YES</span>
                                                ) : (
                                                  <span className="text-slate-500">NO</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => copyToClipboard(`CALL \`${dbName}\`.\`${p.name}\`();`, `call-${p.name}`)}
                                                  className="p-1 rounded hover:bg-emerald-500/20 text-emerald-300"
                                                  title={isEn ? 'Copy CALL command' : 'کپی دستور فراخوانی'}
                                                >
                                                  <Copy className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No stored procedures found.' : 'هیچ رویه ذخیره‌شده‌ای (Procedure) یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 4. STORED FUNCTIONS GRID                        */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'functions' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Function' : 'نام تابع'}</th>
                                        <th className="p-2.5">{isEn ? 'Return Type' : 'نوع بازگشتی'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5">{isEn ? 'Security' : 'امنیت'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Deterministic' : 'تکرارپذیر'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {functionsList.length > 0 ? (
                                        functionsList
                                          .filter((f) => !tableSearch || f.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((f) => (
                                            <tr
                                              key={f.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'function',
                                                  id: `function:${dbName}:${f.name}`,
                                                  name: f.name,
                                                  dbName,
                                                  functionName: f.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                <span className="truncate max-w-xs">{f.name}</span>
                                              </td>
                                              <td className="p-2.5 text-amber-300 font-bold text-[11px]">{f.returnType || 'text'}</td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs">{f.definer || 'root@localhost'}</td>
                                              <td className="p-2.5 text-cyan-300 text-[11px]">{f.securityType || 'DEFINER'}</td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {f.isDeterministic ? (
                                                  <span className="text-emerald-400 font-bold">YES</span>
                                                ) : (
                                                  <span className="text-slate-500">NO</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'function',
                                                      id: `function:${dbName}:${f.name}`,
                                                      name: f.name,
                                                      dbName,
                                                      functionName: f.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-amber-500/20 text-amber-300"
                                                  title={isEn ? 'Inspect Function' : 'مشاهده تابع'}
                                                >
                                                  <Zap className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No stored functions found.' : 'هیچ تابع ذخیره‌شده‌ای (Function) یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 5. TRIGGERS GRID                                */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'triggers' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Trigger' : 'نام تریگر'}</th>
                                        <th className="p-2.5">{isEn ? 'Target Table' : 'جدول هدف'}</th>
                                        <th className="p-2.5">{isEn ? 'Timing' : 'زمان'}</th>
                                        <th className="p-2.5">{isEn ? 'Event' : 'رویداد'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {triggersList.length > 0 ? (
                                        triggersList
                                          .filter((tr) => !tableSearch || tr.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((tr) => (
                                            <tr
                                              key={tr.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'trigger',
                                                  id: `trigger:${dbName}:${tr.name}`,
                                                  name: tr.name,
                                                  dbName,
                                                  triggerName: tr.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Activity className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                                <span className="truncate max-w-xs">{tr.name}</span>
                                              </td>
                                              <td className="p-2.5 text-cyan-300 font-bold text-[11px]">{tr.tableName}</td>
                                              <td className="p-2.5 text-rose-300 text-[11px]">{tr.timing}</td>
                                              <td className="p-2.5 text-amber-300 text-[11px]">{tr.event}</td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs">{tr.definer || 'root@localhost'}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'trigger',
                                                      id: `trigger:${dbName}:${tr.name}`,
                                                      name: tr.name,
                                                      dbName,
                                                      triggerName: tr.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-rose-500/20 text-rose-300"
                                                  title={isEn ? 'Inspect Trigger' : 'مشاهده تریگر'}
                                                >
                                                  <Activity className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No triggers found in this database.' : 'هیچ تریگری در این دیتابیس یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 6. SCHEDULED EVENTS GRID                        */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'events' && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Event Name' : 'نام رویداد'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Status' : 'وضعیت'}</th>
                                        <th className="p-2.5">{isEn ? 'Type' : 'نوع زمان‌بندی'}</th>
                                        <th className="p-2.5">{isEn ? 'Interval' : 'دوره'}</th>
                                        <th className="p-2.5">{isEn ? 'Definer' : 'مالک'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Inspect' : 'مشاهده'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {eventsList.length > 0 ? (
                                        eventsList
                                          .filter((ev) => !tableSearch || ev.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                          .map((ev) => (
                                            <tr
                                              key={ev.name}
                                              onClick={() => {
                                                setSelectedTreeNode({
                                                  type: 'event',
                                                  id: `event:${dbName}:${ev.name}`,
                                                  name: ev.name,
                                                  dbName,
                                                  eventName: ev.name,
                                                });
                                              }}
                                              className={`transition cursor-pointer ${
                                                isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                              }`}
                                            >
                                              <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                                <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                                <span className="truncate max-w-xs">{ev.name}</span>
                                              </td>
                                              <td className="p-2.5 text-center font-sans text-[11px]">
                                                {ev.status === 'ENABLED' ? (
                                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">ENABLED</span>
                                                ) : (
                                                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">{ev.status}</span>
                                                )}
                                              </td>
                                              <td className="p-2.5 text-cyan-300 text-[11px]">{ev.type}</td>
                                              <td className="p-2.5 text-amber-300 text-[11px]">
                                                {ev.intervalValue ? `${ev.intervalValue} ${ev.intervalField || ''}` : 'One-time'}
                                              </td>
                                              <td className="p-2.5 text-slate-300 text-[11px] truncate max-w-xs">{ev.definer || 'root@localhost'}</td>
                                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSelectedTreeNode({
                                                      type: 'event',
                                                      id: `event:${dbName}:${ev.name}`,
                                                      name: ev.name,
                                                      dbName,
                                                      eventName: ev.name,
                                                    });
                                                  }}
                                                  className="p-1 rounded hover:bg-blue-500/20 text-blue-300"
                                                  title={isEn ? 'Inspect Event' : 'مشاهده رویداد'}
                                                >
                                                  <Clock className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))
                                      ) : (
                                        <tr>
                                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                                            {isEn ? 'No scheduled events found.' : 'هیچ رویداد زمان‌بندی‌شده‌ای (Event) یافت نشد.'}
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* ---------------------------------------------- */}
                              {/* 7. SEQUENCES GRID (if available)                */}
                              {/* ---------------------------------------------- */}
                              {dbActiveObjectTab === 'sequences' && sequencesList.length > 0 && (
                                <div className="rounded-xl border border-white/10 overflow-hidden">
                                  <table className="w-full text-xs text-left">
                                    <thead className={isLightMode ? 'bg-slate-100' : 'bg-black/30'}>
                                      <tr className="border-b border-white/10 text-slate-400 font-semibold">
                                        <th className="p-2.5">{isEn ? 'Sequence Name' : 'نام دنباله'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Start' : 'شروع'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Min' : 'حداقل'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Max' : 'حداکثر'}</th>
                                        <th className="p-2.5 text-right">{isEn ? 'Increment' : 'افزایش'}</th>
                                        <th className="p-2.5 text-center">{isEn ? 'Cycle' : 'چرخه'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                      {sequencesList
                                        .filter((s) => !tableSearch || s.name.toLowerCase().includes(tableSearch.toLowerCase()))
                                        .map((s) => (
                                          <tr
                                            key={s.name}
                                            onClick={() => {
                                              setSelectedTreeNode({
                                                type: 'sequence',
                                                id: `sequence:${dbName}:${s.name}`,
                                                name: s.name,
                                                dbName,
                                                sequenceName: s.name,
                                              });
                                            }}
                                            className={`transition cursor-pointer ${
                                              isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                                            }`}
                                          >
                                            <td className="p-2.5 flex items-center gap-2 font-bold text-slate-200">
                                              <Hash className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                              <span className="truncate max-w-xs">{s.name}</span>
                                            </td>
                                            <td className="p-2.5 text-right text-teal-300 font-bold">{s.startValue ?? '1'}</td>
                                            <td className="p-2.5 text-right text-slate-300">{s.minimumValue ?? '1'}</td>
                                            <td className="p-2.5 text-right text-slate-300">{s.maximumValue ?? '—'}</td>
                                            <td className="p-2.5 text-right text-emerald-400 font-bold">{s.increment ?? '1'}</td>
                                            <td className="p-2.5 text-center font-sans text-[11px]">
                                              {s.cycleOption ? (
                                                <span className="text-emerald-400 font-bold">YES</span>
                                              ) : (
                                                <span className="text-slate-500">NO</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
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
