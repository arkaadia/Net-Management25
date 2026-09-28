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
} from 'lucide-react';
import {
  RemoteServer,
  MysqlConnectionTestResult,
  MysqlOverview,
  MysqlDatabaseItem,
  MysqlProcessItem,
  MysqlVariableItem,
  MysqlQueryResult,
} from '../../types';
import {
  testRemoteServerMysqlConnection,
  fetchRemoteServerMysqlOverview,
  fetchRemoteServerMysqlDatabases,
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
    if (activeTab === 'databases') loadDatabases();
    if (activeTab === 'processlist') loadProcesslist();
    if (activeTab === 'variables') loadVariables();
  }, [isOpen, server, activeTab, loadDatabases, loadProcesslist, loadVariables]);

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
            { id: 'databases', label: isEn ? 'Databases' : 'پایگاه‌های داده', icon: Layers },
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Version' : 'نسخه موتور'}</span>
                    <span className="font-bold text-slate-200">{overview?.version || 'MySQL / MariaDB'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Slow Queries' : 'کوئری‌های کند'}</span>
                    <span className="font-bold text-rose-400">{overview?.slowQueries ?? 0}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Open Tables' : 'جداول باز'}</span>
                    <span className="font-bold text-slate-200">{overview?.openTables ?? '—'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Host & Port' : 'آدرس و پورت'}</span>
                    <span className="font-bold text-slate-200">{server.ip}:{server.mysql_port || 3306}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Default Database' : 'دیتابیس پیش‌فرض'}</span>
                    <span className="font-bold text-cyan-400">{server.mysql_database || 'mysql'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-black/10 border border-white/5">
                    <span className="text-slate-400 block text-[10px]">{isEn ? 'Connected User' : 'کاربر متصل'}</span>
                    <span className="font-bold text-emerald-400">{server.mysql_user || 'root'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. DATABASES TAB */}
          {activeTab === 'databases' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={dbSearch}
                    onChange={(e) => setDbSearch(e.target.value)}
                    placeholder={isEn ? 'Filter databases...' : 'فیلتر پایگاه‌های داده...'}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={loadDatabases}
                  disabled={isLoadingDatabases}
                  className="px-3 py-1.5 rounded-xl border text-xs flex items-center gap-1.5 hover:bg-white/10 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDatabases ? 'animate-spin text-orange-400' : ''}`} />
                  <span>{isEn ? 'Reload' : 'تازه‌سازی'}</span>
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
                      <th className="p-3">{isEn ? 'Database Name' : 'نام پایگاه داده'}</th>
                      <th className="p-3">{isEn ? 'Collation' : 'کدگذاری (Collation)'}</th>
                      <th className="p-3 text-center">{isEn ? 'Tables' : 'تعداد جداول'}</th>
                      <th className="p-3 text-right">{isEn ? 'Size' : 'حجم دیتابیس'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {isLoadingDatabases ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                          <span>{isEn ? 'Loading database catalog...' : 'در حال بارگذاری کاتالوگ...'}</span>
                        </td>
                      </tr>
                    ) : filteredDatabases.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400 font-sans">
                          {isEn ? 'No databases found.' : 'هیچ دیتابیسی یافت نشد.'}
                        </td>
                      </tr>
                    ) : (
                      filteredDatabases.map((db) => (
                        <tr
                          key={db.name}
                          className={`transition ${isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
                        >
                          <td className="p-3 flex items-center gap-2 font-bold text-slate-200">
                            <Database className="w-3.5 h-3.5 text-orange-400" />
                            <span>{db.name}</span>
                          </td>
                          <td className="p-3 text-slate-400">{db.defaultCollation}</td>
                          <td className="p-3 text-center text-cyan-400 font-bold">{db.tableCount}</td>
                          <td className="p-3 text-right text-emerald-400 font-bold">{db.sizePretty}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
