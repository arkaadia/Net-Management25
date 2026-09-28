import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Database,
  Table as TableIcon,
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  HardDrive,
  Activity,
  Layers,
  Zap,
  Terminal,
  Copy,
  Check,
  Search,
  Sparkles,
  ShieldAlert,
  ArrowUpDown,
  Lock,
  Unlock,
  Sliders,
  RotateCw,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresDatabaseItem,
  PostgresMaintenanceAction,
  PostgresMaintenanceScope,
  PostgresMaintenanceRequest,
  PostgresMaintenanceResult,
  PostgresTableBloatMetric,
  PostgresActiveMaintenanceProgress,
  PostgresMaintenanceLockWarning,
} from '../../types';
import {
  runRemoteServerPostgresMaintenance,
  fetchRemoteServerPostgresBloatMetrics,
  fetchRemoteServerPostgresActiveMaintenance,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresMaintenanceModalProps {
  isOpen: boolean;
  server: RemoteServer;
  databases: PostgresDatabaseItem[];
  initialDatabase?: string;
  initialSchema?: string;
  initialTable?: string;
  initialAction?: PostgresMaintenanceAction;
  onClose: () => void;
  onMinimize?: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const PostgresMaintenanceModal: React.FC<PostgresMaintenanceModalProps> = ({
  isOpen,
  server,
  databases,
  initialDatabase,
  initialSchema,
  initialTable,
  initialAction = 'vacuum',
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Active top-level subtab: 'operations' | 'bloat' | 'active_progress'
  const [activeTab, setActiveTab] = useState<'operations' | 'bloat' | 'active_progress'>('operations');

  // Operation parameters
  const [action, setAction] = useState<PostgresMaintenanceAction>(initialAction);
  const [scope, setScope] = useState<PostgresMaintenanceScope>(initialTable ? 'table' : 'database');
  const [selectedDb, setSelectedDb] = useState<string>(
    initialDatabase || server.postgres_database || databases[0]?.name || 'postgres'
  );
  const [schema, setSchema] = useState<string>(initialSchema || 'public');
  const [table, setTable] = useState<string>(initialTable || '');
  const [indexName, setIndexName] = useState<string>('');

  // Options
  const [isFull, setIsFull] = useState<boolean>(false);
  const [isFreeze, setIsFreeze] = useState<boolean>(false);
  const [analyzeWithVacuum, setAnalyzeWithVacuum] = useState<boolean>(true);
  const [isVerbose, setIsVerbose] = useState<boolean>(true);
  const [isConcurrently, setIsConcurrently] = useState<boolean>(true);

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<PostgresMaintenanceResult | null>(null);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Bloat inspection state
  const [bloatMetrics, setBloatMetrics] = useState<PostgresTableBloatMetric[]>([]);
  const [loadingBloat, setLoadingBloat] = useState<boolean>(false);
  const [bloatSearch, setBloatSearch] = useState<string>('');

  // Active progress state
  const [activeTasks, setActiveTasks] = useState<PostgresActiveMaintenanceProgress[]>([]);
  const [loadingActive, setLoadingActive] = useState<boolean>(false);

  // Update initial parameters when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialDatabase) setSelectedDb(initialDatabase);
      if (initialSchema) setSchema(initialSchema);
      if (initialTable) {
        setTable(initialTable);
        setScope('table');
      }
      if (initialAction) setAction(initialAction);
    }
  }, [isOpen, initialDatabase, initialSchema, initialTable, initialAction]);

  // Load bloat metrics
  const loadBloatMetrics = useCallback(async () => {
    if (!selectedDb) return;
    setLoadingBloat(true);
    try {
      const res = await fetchRemoteServerPostgresBloatMetrics(server.id, {
        database: selectedDb,
      });
      if (res.success && res.metrics) {
        setBloatMetrics(res.metrics);
      }
    } catch (err) {
      console.error('Failed to load bloat metrics:', err);
    } finally {
      setLoadingBloat(false);
    }
  }, [server.id, selectedDb]);

  // Load active tasks
  const loadActiveTasks = useCallback(async () => {
    if (!selectedDb) return;
    setLoadingActive(true);
    try {
      const res = await fetchRemoteServerPostgresActiveMaintenance(server.id, {
        database: selectedDb,
      });
      if (res.success && res.activeTasks) {
        setActiveTasks(res.activeTasks);
      }
    } catch (err) {
      console.error('Failed to load active vacuum tasks:', err);
    } finally {
      setLoadingActive(false);
    }
  }, [server.id, selectedDb]);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'bloat') {
        loadBloatMetrics();
      } else if (activeTab === 'active_progress') {
        loadActiveTasks();
      }
    }
  }, [isOpen, activeTab, loadBloatMetrics, loadActiveTasks]);

  // Dynamic lock warning calculation
  const lockWarning: PostgresMaintenanceLockWarning = useMemo(() => {
    if (action === 'vacuum') {
      if (isFull) {
        return {
          level: 'exclusive',
          lockName: 'AccessExclusiveLock',
          blocksReads: true,
          blocksWrites: true,
          description:
            'VACUUM FULL rewrites table storage to disk. It takes AccessExclusiveLock and completely blocks all SELECT, INSERT, UPDATE, and DELETE operations!',
          descriptionFa:
            'دستور VACUUM FULL کل فایل جدول را بازنویسی می‌کند. این عملیات قفل انحصاری کامل گرفته و کلیه عملیات‌های خواندن و نوشتن را مسدود می‌سازد!',
        };
      }
      return {
        level: 'low',
        lockName: 'ShareUpdateExclusiveLock',
        blocksReads: false,
        blocksWrites: false,
        description:
          'Standard VACUUM operates online without locking concurrent SELECT, INSERT, UPDATE, or DELETE queries.',
        descriptionFa:
          'دستور VACUUM استاندارد به صورت آنلاین و بدون مسدودسازی خواندن و نوشتن اجرا می‌شود.',
      };
    }
    if (action === 'analyze') {
      return {
        level: 'low',
        lockName: 'ShareUpdateExclusiveLock',
        blocksReads: false,
        blocksWrites: false,
        description:
          'ANALYZE collects distribution statistics online without blocking concurrent table queries.',
        descriptionFa:
          'دستور ANALYZE آمار توزیع داده‌ها را به صورت آنلاین و بدون مسدودسازی خواندن و نوشتن جمع‌آوری می‌کند.',
      };
    }
    // action === 'reindex'
    if (isConcurrently) {
      return {
        level: 'moderate',
        lockName: 'ShareUpdateExclusiveLock (CONCURRENTLY)',
        blocksReads: false,
        blocksWrites: false,
        description:
          'REINDEX CONCURRENTLY rebuilds indexes in background without locking out concurrent table reads or writes.',
        descriptionFa:
          'دستور REINDEX CONCURRENTLY ایندکس‌ها را در پس‌زمینه بدون مسدود کردن خواندن و نوشتن بازسازی می‌کند.',
      };
    }
    return {
      level: 'heavy',
      lockName: 'ShareLock',
      blocksReads: false,
      blocksWrites: true,
      description:
        'Standard REINDEX locks out all write operations (INSERT, UPDATE, DELETE) until complete. Reads remain possible.',
      descriptionFa:
        'دستور REINDEX استاندارد تمامی عملیات‌های نوشتن را تا پایان بازسازی ایندکس مسدود می‌کند.',
    };
  }, [action, isFull, isConcurrently]);

  // Execute maintenance command
  const handleExecute = async () => {
    setIsRunning(true);
    setExecutionResult(null);

    const payload: PostgresMaintenanceRequest = {
      action,
      scope,
      database: selectedDb,
      schema: scope !== 'database' ? schema : undefined,
      table: scope === 'table' ? table : undefined,
      indexName: scope === 'index' ? indexName : undefined,
      full: action === 'vacuum' ? isFull : undefined,
      freeze: action === 'vacuum' ? isFreeze : undefined,
      analyzeWithVacuum: action === 'vacuum' ? analyzeWithVacuum : undefined,
      verbose: isVerbose,
      concurrently: action === 'reindex' ? isConcurrently : undefined,
    };

    try {
      const res = await runRemoteServerPostgresMaintenance(server.id, payload);
      setExecutionResult(res);
      // Auto refresh bloat metrics if on bloat tab
      if (activeTab === 'bloat') {
        loadBloatMetrics();
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        action,
        scope,
        targetDescription: scope,
        executedCommand: '',
        durationMs: 0,
        message: err.message || 'Execution error',
        messageFa: 'خطا در اجرای دستور',
        error: err.message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Quick maintenance for a specific table from bloat tab
  const handleQuickMaintainTable = (item: PostgresTableBloatMetric, op: PostgresMaintenanceAction) => {
    setSelectedDb(selectedDb);
    setSchema(item.schema);
    setTable(item.tableName);
    setScope('table');
    setAction(op);
    if (op === 'vacuum') {
      setIsFull(false);
      setAnalyzeWithVacuum(true);
    }
    setActiveTab('operations');
  };

  const copyLogs = () => {
    if (!executionResult?.outputLogs) return;
    navigator.clipboard.writeText(executionResult.outputLogs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const filteredBloat = useMemo(() => {
    if (!bloatSearch.trim()) return bloatMetrics;
    const q = bloatSearch.toLowerCase();
    return bloatMetrics.filter(
      (m) => m.tableName.toLowerCase().includes(q) || m.schema.toLowerCase().includes(q)
    );
  }, [bloatMetrics, bloatSearch]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs select-none`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`w-full flex flex-col rounded-2xl border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized ? 'h-full max-w-full' : 'max-h-[92vh] max-w-5xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-slate-400/20'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-black/80'
        }`}
      >
        {/* ======================================================== */}
        {/* HEADER: TITLE & 3 WINDOW CONTROL BUTTONS                 */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  {isEn ? 'PostgreSQL Maintenance & Optimization' : 'نگهداری و بهینه‌سازی پایگاه داده PostgreSQL'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  VACUUM / ANALYZE / REINDEX
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate font-mono">
                {server.name} ({server.ip}) • {isEn ? 'Database' : 'پایگاه داده'}:{' '}
                <strong className="text-cyan-400">{selectedDb}</strong>
              </p>
            </div>
          </div>

          {/* 3 Header Control Buttons: Close, Minimize, Fullscreen */}
          <div className="flex items-center gap-1 shrink-0">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-1.5 rounded-lg border transition ${
                  isLightMode
                    ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg border transition ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
              title={isMaximized ? (isEn ? 'Restore' : 'بازگردانی') : (isEn ? 'Maximize' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-transparent hover:border-rose-500/30 hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 transition"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SUBTABS BAR: OPERATIONS / BLOAT / ACTIVE VACUUMS         */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between border-b px-4 py-2 gap-2 shrink-0 ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('operations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'operations'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : isLightMode
                  ? 'bg-white text-slate-600 hover:bg-slate-200'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isEn ? 'Execute Maintenance' : 'اجرای دستورات نگهداری'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bloat')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'bloat'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : isLightMode
                  ? 'bg-white text-slate-600 hover:bg-slate-200'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isEn ? 'Dead Tuples & Bloat' : 'فضای مرده و هرزرفت جداول'}</span>
              {bloatMetrics.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                  {bloatMetrics.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('active_progress')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'active_progress'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : isLightMode
                  ? 'bg-white text-slate-600 hover:bg-slate-200'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isEn ? 'Live Progress Monitor' : 'پایش فعالیت زنده VACUUM'}</span>
              {activeTasks.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  {activeTasks.length} {isEn ? 'running' : 'در حال اجرا'}
                </span>
              )}
            </button>
          </div>

          {/* Database Selector */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Database className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg border outline-none cursor-pointer transition ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 focus:border-amber-500'
                  : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-amber-400'
              }`}
            >
              {databases.map((db) => (
                <option key={db.name} value={db.name}>
                  {db.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ======================================================== */}
        {/* BODY CONTENT                                             */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: OPERATIONS EXECUTION */}
          {activeTab === 'operations' && (
            <div className="space-y-4">
              {/* Action Tabs: VACUUM | ANALYZE | REINDEX */}
              <div
                className={`grid grid-cols-3 gap-2 p-1.5 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setAction('vacuum')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    action === 'vacuum'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : isLightMode
                      ? 'text-slate-600 hover:bg-slate-100'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>VACUUM</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAction('analyze')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    action === 'analyze'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : isLightMode
                      ? 'text-slate-600 hover:bg-slate-100'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>ANALYZE</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAction('reindex')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    action === 'reindex'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : isLightMode
                      ? 'text-slate-600 hover:bg-slate-100'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <RotateCw className="w-4 h-4" />
                  <span>REINDEX</span>
                </button>
              </div>

              {/* Scope & Target Configuration */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold flex items-center gap-1.5 uppercase tracking-wider text-slate-400">
                    <Sliders className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isEn ? 'Target Scope & Relations' : 'دامنه هدف و روابط دیتابیس'}</span>
                  </h4>

                  {/* Scope Selector */}
                  <div className="flex items-center gap-1 text-xs">
                    {(['database', 'table', 'schema', 'index'] as PostgresMaintenanceScope[]).map((sc) => {
                      if (action !== 'reindex' && (sc === 'schema' || sc === 'index')) return null;
                      return (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => setScope(sc)}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold capitalize transition ${
                            scope === sc
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : isLightMode
                              ? 'text-slate-600 hover:bg-slate-100'
                              : 'text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {sc}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Database */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      {isEn ? 'Database' : 'پایگاه داده'}
                    </label>
                    <input
                      type="text"
                      disabled
                      value={selectedDb}
                      className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono opacity-80 ${
                        isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-950 border-slate-800'
                      }`}
                    />
                  </div>

                  {/* Schema if table or schema scope */}
                  {scope !== 'database' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          {isEn ? 'Schema' : 'اسکیما'}
                        </label>
                        <FieldInfoTooltip
                          isEn={isEn}
                          title={isEn ? 'PostgreSQL Schema' : 'اسکیمای پایگاه داده'}
                          whatIsIt={
                            isEn
                              ? 'Namespace container for tables, views, and indexes. Defaults to public.'
                              : 'فضای نام حاوی جداول و ایندکس‌ها. به طور پیش‌فرض public است.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Ensures maintenance targets the correct namespace.'
                              : 'برای هدف‌گیری صحیح جداول و ایندکس‌های اسکیما مورد نیاز است.'
                          }
                          practicalExample="public"
                        />
                      </div>
                      <input
                        type="text"
                        value={schema}
                        onChange={(e) => setSchema(e.target.value)}
                        placeholder="public"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 focus:border-amber-500'
                            : 'bg-slate-950 border-slate-800 focus:border-amber-400'
                        }`}
                      />
                    </div>
                  )}

                  {/* Table name */}
                  {scope === 'table' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-400">
                          {isEn ? 'Table Name' : 'نام جدول'}
                        </label>
                        <FieldInfoTooltip
                          isEn={isEn}
                          title={isEn ? 'Target Table' : 'جدول هدف'}
                          whatIsIt={
                            isEn
                              ? 'Specific table to execute maintenance operations on.'
                              : 'جدول مشخصی که عملیات روی آن اجرا خواهد شد.'
                          }
                          whyNeeded={
                            isEn
                              ? 'Targeting individual tables avoids heavy whole-database locks.'
                              : 'نگهداری مجزای جدول از درگیر شدن کل دیتابیس جلوگیری می‌کند.'
                          }
                          practicalExample="users"
                        />
                      </div>
                      <input
                        type="text"
                        value={table}
                        onChange={(e) => setTable(e.target.value)}
                        placeholder={isEn ? 'e.g. users' : 'مثال: users'}
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 focus:border-amber-500'
                            : 'bg-slate-950 border-slate-800 focus:border-amber-400'
                        }`}
                      />
                    </div>
                  )}

                  {/* Index name if scope === index */}
                  {scope === 'index' && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                        {isEn ? 'Index Name' : 'نام ایندکس'}
                      </label>
                      <input
                        type="text"
                        value={indexName}
                        onChange={(e) => setIndexName(e.target.value)}
                        placeholder="idx_users_email"
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 focus:border-amber-500'
                            : 'bg-slate-950 border-slate-800 focus:border-amber-400'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Specific Options based on action */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {isEn ? 'Execution Options & Lock Configuration' : 'گزینه‌ها و تنظیمات قفل اجرایی'}
                </h4>

                {action === 'vacuum' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* FULL option */}
                    <label
                      className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer transition ${
                        isFull
                          ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                          : isLightMode
                          ? 'border-slate-200 hover:bg-slate-50'
                          : 'border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isFull}
                        onChange={(e) => setIsFull(e.target.checked)}
                        className="mt-0.5 rounded text-rose-500 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold flex items-center gap-1.5">
                          <span>VACUUM FULL</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            AccessExclusiveLock
                          </span>
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isEn
                            ? 'Rebuilds storage and shrinks table files on OS disk. Blocks all reads and writes until done.'
                            : 'فایل فیزیکی جدول را بازنویسی و حجم آزاد را به سیستم‌عامل برمی‌گرداند. خواندن و نوشتن را مسدود می‌کند.'}
                        </p>
                      </div>
                    </label>

                    {/* FREEZE option */}
                    <label
                      className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer transition ${
                        isFreeze
                          ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
                          : isLightMode
                          ? 'border-slate-200 hover:bg-slate-50'
                          : 'border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isFreeze}
                        onChange={(e) => setIsFreeze(e.target.checked)}
                        className="mt-0.5 rounded text-blue-500 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold">FREEZE</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isEn
                            ? 'Freezes transaction IDs aggressively to protect against transaction ID wraparound issues.'
                            : 'شناسه‌های تراکنش را تثبیت می‌کند تا از بروز مشکل چرخش تراکنش (Wraparound) جلوگیری کند.'}
                        </p>
                      </div>
                    </label>

                    {/* ANALYZE option */}
                    <label
                      className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer transition ${
                        analyzeWithVacuum
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                          : isLightMode
                          ? 'border-slate-200 hover:bg-slate-50'
                          : 'border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={analyzeWithVacuum}
                        onChange={(e) => setAnalyzeWithVacuum(e.target.checked)}
                        className="mt-0.5 rounded text-amber-500 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold">{isEn ? 'Include ANALYZE' : 'شامل ANALYZE'}</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isEn
                            ? 'Updates query planner statistics right after dead space cleanup in a single operation.'
                            : 'آمار توزیع داده‌ها برای پلنر کوئری را همزمان پس از پاکسازی به روز می‌کند.'}
                        </p>
                      </div>
                    </label>

                    {/* VERBOSE option */}
                    <label
                      className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer transition ${
                        isVerbose
                          ? 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                          : isLightMode
                          ? 'border-slate-200 hover:bg-slate-50'
                          : 'border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isVerbose}
                        onChange={(e) => setIsVerbose(e.target.checked)}
                        className="mt-0.5 rounded text-purple-500 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold">VERBOSE</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isEn
                            ? 'Prints detailed progress logs, pages cleaned, and reclaimed tuples count.'
                            : 'گزارش جزئیات پاکسازی صفحات، تعداد سطرهای مرده و مدت زمان را ثبت می‌کند.'}
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {action === 'reindex' && (
                  <div className="space-y-3">
                    <label
                      className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer transition text-xs ${
                        isConcurrently
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                          : isLightMode
                          ? 'border-slate-200 hover:bg-slate-50'
                          : 'border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isConcurrently}
                        onChange={(e) => setIsConcurrently(e.target.checked)}
                        className="mt-0.5 rounded text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold flex items-center gap-1.5">
                          <span>CONCURRENTLY</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            {isEn ? 'Recommended (Zero Downtime)' : 'پیشنهادی (بدون قطع نوشتن)'}
                          </span>
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isEn
                            ? 'Rebuilds the index in background without taking locks that block concurrent INSERT, UPDATE, or DELETE operations.'
                            : 'ایندکس را در پس‌زمینه بدون مسدودسازی عملیات نوشتن بازسازی می‌کند.'}
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {action === 'analyze' && (
                  <div className="space-y-3">
                    <label
                      className={`p-3 rounded-lg border flex items-start gap-2.5 cursor-pointer transition text-xs ${
                        isVerbose
                          ? 'bg-purple-500/10 border-purple-500/40 text-purple-300'
                          : isLightMode
                          ? 'border-slate-200 hover:bg-slate-50'
                          : 'border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isVerbose}
                        onChange={(e) => setIsVerbose(e.target.checked)}
                        className="mt-0.5 rounded text-purple-500 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold">VERBOSE</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isEn
                            ? 'Displays progress messages showing which relations are being analyzed.'
                            : 'گزارش گام‌به‌گام تحلیل جداول و نمونه‌گیری سطرها را در خروجی نمایش می‌دهد.'}
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* LOCK IMPACT WARNING BANNER */}
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  lockWarning.level === 'exclusive'
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                    : lockWarning.level === 'heavy'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : lockWarning.level === 'moderate'
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-200'
                    : isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {lockWarning.level === 'exclusive' ? (
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                  ) : lockWarning.level === 'heavy' ? (
                    <Lock className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Unlock className="w-5 h-5 text-emerald-400" />
                  )}
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <span>
                      {isEn ? 'Lock Impact Level' : 'سطح قفل‌گذاری'}:{' '}
                      <strong className="uppercase">{lockWarning.level}</strong> ({lockWarning.lockName})
                    </span>
                    {lockWarning.blocksWrites && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        {isEn ? 'Blocks Writes' : 'مسدودکننده نوشتن'}
                      </span>
                    )}
                    {lockWarning.blocksReads && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        {isEn ? 'Blocks Reads' : 'مسدودکننده خواندن'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] opacity-90">
                    {isEn ? lockWarning.description : lockWarning.descriptionFa}
                  </p>
                </div>
              </div>

              {/* RUN ACTION BUTTON */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="text-xs font-mono text-slate-400">
                  {isEn ? 'Target' : 'هدف'}:{' '}
                  <strong className="text-slate-200">
                    {scope === 'database'
                      ? `Database "${selectedDb}"`
                      : scope === 'table'
                      ? `Table "${schema}"."${table || '*'}"`
                      : `${scope}`}
                  </strong>
                </div>

                <button
                  type="button"
                  disabled={isRunning || (scope === 'table' && !table.trim())}
                  onClick={handleExecute}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-md disabled:opacity-40 cursor-pointer ${
                    lockWarning.level === 'exclusive'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-black'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Executing Maintenance...' : 'در حال اجرای عملیات نگهداری...'}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>
                        {isEn
                          ? `Execute ${action.toUpperCase()} Now`
                          : `اجرای اکنون ${action.toUpperCase()}`}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* EXECUTION RESULT CONSOLE */}
              {executionResult && (
                <div
                  className={`p-4 rounded-xl border space-y-3 animate-in fade-in ${
                    executionResult.success
                      ? isLightMode
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-emerald-950/20 border-emerald-900/50'
                      : isLightMode
                      ? 'bg-rose-50/50 border-rose-200'
                      : 'bg-rose-950/20 border-rose-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {executionResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className="text-xs font-bold font-mono">
                        {isEn ? executionResult.message : executionResult.messageFa}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {executionResult.durationMs} ms
                    </span>
                  </div>

                  {/* SQL executed */}
                  {executionResult.executedCommand && (
                    <div className="p-2 rounded-lg bg-black/40 border border-slate-800 font-mono text-[11px] text-cyan-300">
                      <code>{executionResult.executedCommand}</code>
                    </div>
                  )}

                  {/* Server Output Logs / Verbose notices */}
                  {executionResult.outputLogs && executionResult.outputLogs.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                        <span className="flex items-center gap-1">
                          <Terminal className="w-3 h-3 text-amber-400" />
                          <span>{isEn ? 'Server Output Notices' : 'لاگ‌های خروجی سرور'}</span>
                        </span>
                        <button
                          type="button"
                          onClick={copyLogs}
                          className="flex items-center gap-1 hover:text-white"
                        >
                          {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedLogs ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                        </button>
                      </div>
                      <pre className="p-3 rounded-lg bg-black/60 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {executionResult.outputLogs.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DEAD TUPLES & BLOAT INSPECTOR */}
          {activeTab === 'bloat' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={bloatSearch}
                      onChange={(e) => setBloatSearch(e.target.value)}
                      placeholder={isEn ? 'Search table or schema...' : 'جستجوی جدول یا اسکیما...'}
                      className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                        isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                      }`}
                    />
                  </div>
                  <span className="text-xs text-slate-400">
                    {isEn ? 'Found' : 'یافت شد'}: {filteredBloat.length} {isEn ? 'tables' : 'جدول'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={loadBloatMetrics}
                  disabled={loadingBloat}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBloat ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh Metrics' : 'بروزرسانی آمار'}</span>
                </button>
              </div>

              {loadingBloat && bloatMetrics.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                  <p>{isEn ? 'Scanning database statistics catalog...' : 'در حال اسکن کاتالوگ آماری پایگاه داده...'}</p>
                </div>
              ) : filteredBloat.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  {isEn ? 'No tables found matching criteria.' : 'جدولی مطابق با جستجو یافت نشد.'}
                </div>
              ) : (
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead
                        className={`text-[10px] uppercase font-bold tracking-wider border-b ${
                          isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        <tr>
                          <th className="py-2.5 px-3">{isEn ? 'Relation' : 'جدول'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Live Tuples' : 'سطرهای زنده'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Dead Tuples' : 'سطرهای مرده'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Dead Ratio' : 'نسبت هرزرفت'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Total Size' : 'حجم کل'}</th>
                          <th className="py-2.5 px-3">{isEn ? 'Last Vacuum' : 'آخرین VACUUM'}</th>
                          <th className="py-2.5 px-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40 font-mono">
                        {filteredBloat.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`transition ${
                              isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2 px-3 font-semibold text-slate-200">
                              <span className="text-slate-500">{item.schema}.</span>
                              <span className="text-cyan-400">{item.tableName}</span>
                            </td>
                            <td className="py-2 px-3 text-emerald-400">{item.liveTuples.toLocaleString()}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`font-bold ${
                                  item.deadTuples > 1000 ? 'text-rose-400' : 'text-slate-300'
                                }`}
                              >
                                {item.deadTuples.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      item.deadTupleRatio > 25
                                        ? 'bg-rose-500'
                                        : item.deadTupleRatio > 10
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(item.deadTupleRatio, 100)}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-[11px] font-bold ${
                                    item.deadTupleRatio > 25 ? 'text-rose-400' : 'text-slate-300'
                                  }`}
                                >
                                  {item.deadTupleRatio}%
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-300">{item.totalSizePretty}</td>
                            <td className="py-2 px-3 text-[11px] text-slate-400">
                              {item.lastVacuum
                                ? new Date(item.lastVacuum).toLocaleDateString()
                                : item.lastAutovacuum
                                ? `${new Date(item.lastAutovacuum).toLocaleDateString()} (auto)`
                                : isEn
                                ? 'Never'
                                : 'هرگز'}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1 font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleQuickMaintainTable(item, 'vacuum')}
                                  className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition cursor-pointer"
                                  title={isEn ? 'Run VACUUM on this table' : 'اجرای VACUUM'}
                                >
                                  VACUUM
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickMaintainTable(item, 'analyze')}
                                  className="px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-[11px] font-bold transition cursor-pointer"
                                  title={isEn ? 'Run ANALYZE on this table' : 'اجرای ANALYZE'}
                                >
                                  ANALYZE
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE ACTIVE MAINTENANCE PROGRESS */}
          {activeTab === 'active_progress' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {isEn
                    ? 'Monitors ongoing VACUUM operations currently running via pg_stat_progress_vacuum.'
                    : 'پایش زنده‌ی عملیات VACUUM در حال اجرا بر روی سرور از طریق جدول آماری pg_stat_progress_vacuum.'}
                </span>

                <button
                  type="button"
                  onClick={loadActiveTasks}
                  disabled={loadingActive}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingActive ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Poll Activity' : 'استعلام وضعیت'}</span>
                </button>
              </div>

              {loadingActive && activeTasks.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                  <p>{isEn ? 'Checking active vacuum jobs...' : 'در حال بررسی فرآیندهای فعال...'}</p>
                </div>
              ) : activeTasks.length === 0 ? (
                <div
                  className={`p-8 text-center rounded-xl border border-dashed text-xs text-slate-500 space-y-2 ${
                    isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-900/30 border-slate-800'
                  }`}
                >
                  <Activity className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="font-bold text-slate-400">
                    {isEn ? 'No active VACUUM operations currently running' : 'در حال حاضر هیچ فرآیند VACUUM فعالی در حال اجرا نیست'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {isEn
                      ? 'When a manual or autovacuum process runs, its real-time block progression and phase will display here.'
                      : 'به محض اجرای عملیات دستی یا اتوماتیک VACUUM، وضعیت پیشرفت بلاک‌ها در این بخش نمایش می‌یابد.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeTasks.map((task) => (
                    <div
                      key={task.pid}
                      className={`p-4 rounded-xl border space-y-3 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                            PID {task.pid}
                          </span>
                          <span className="text-slate-300 font-bold">{task.datname}</span>
                          {task.relname && (
                            <>
                              <span className="text-slate-500">•</span>
                              <span className="text-cyan-400 font-semibold">{task.relname}</span>
                            </>
                          )}
                        </div>

                        <span className="text-xs font-mono font-bold text-amber-400 capitalize">
                          {isEn ? 'Phase' : 'فاز'}: {task.phase.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Progress Bar if total blocks known */}
                      {task.heapBlksTotal && task.heapBlksTotal > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                            <span>
                              {isEn ? 'Scanned' : 'اسکن شده'}: {task.heapBlksScanned?.toLocaleString()} /{' '}
                              {task.heapBlksTotal.toLocaleString()} {isEn ? 'blocks' : 'بلاک'}
                            </span>
                            <span className="font-bold text-slate-200">
                              {Math.round(((task.heapBlksScanned || 0) / task.heapBlksTotal) * 100)}%
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                              style={{
                                width: `${Math.min(
                                  Math.round(((task.heapBlksScanned || 0) / task.heapBlksTotal) * 100),
                                  100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/40">
                        <div>
                          <span>{isEn ? 'Vacuumed Blocks' : 'بلاک‌های پاکسازی‌شده'}: </span>
                          <strong className="text-slate-200">{task.heapBlksVacuumed?.toLocaleString() || 0}</strong>
                        </div>
                        <div>
                          <span>{isEn ? 'Index Cycles' : 'دورهای ایندکس'}: </span>
                          <strong className="text-slate-200">{task.indexVacuumCount || 0}</strong>
                        </div>
                        <div>
                          <span>{isEn ? 'Dead Tuples Found' : 'سطرهای مرده'}: </span>
                          <strong className="text-rose-400">{task.numDeadTuples?.toLocaleString() || 0}</strong>
                        </div>
                        <div>
                          <span>{isEn ? 'Max Dead Tuples' : 'حداکثر سقف'}: </span>
                          <strong className="text-slate-200">{task.maxDeadTuples?.toLocaleString() || 0}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* FOOTER BAR                                               */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="text-xs text-slate-400 font-mono">
            {isEn ? 'PostgreSQL Engine Maintenance' : 'ابزار نگهداری موتور PostgreSQL'}
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg border text-xs font-semibold transition ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
