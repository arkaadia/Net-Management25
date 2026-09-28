import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Lock,
  Unlock,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Terminal,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Layers,
  Activity,
  Zap,
  Play,
  Square,
  AlertOctagon,
  Info,
  ExternalLink,
  GitCommit,
  Flame,
  ArrowRight,
  Shield,
  FileCode2,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresLocksOverview,
  PostgresLockItem,
  PostgresBlockingNode,
  PostgresDatabaseItem,
} from '../../types';
import {
  fetchRemoteServerPostgresLocks,
  fetchRemoteServerPostgresDatabases,
  terminateRemoteServerPostgresSession,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresLocksInspectorTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
  onNavigateToSqlStudio?: (sql: string) => void;
}

type ViewMode = 'tree' | 'table' | 'deadlock';
type TableFilter = 'all' | 'waiting' | 'blockers' | 'heavy';

export const PostgresLocksInspectorTab: React.FC<PostgresLocksInspectorTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
  onNavigateToSqlStudio,
}) => {
  const [selectedDb, setSelectedDb] = useState<string>(initialDatabase || server.postgres_database || 'postgres');
  const [databases, setDatabases] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [tableFilter, setTableFilter] = useState<TableFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PostgresLocksOverview | null>(null);

  // Auto-refresh interval (0 = off, else seconds)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const timerRef = useRef<any>(null);

  // Action / Termination state
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    pid: number;
    action: 'cancel' | 'terminate';
    query?: string;
    usename?: string;
    waitSec?: number;
    blockedCount?: number;
  }>({
    isOpen: false,
    pid: 0,
    action: 'cancel',
  });
  const [actionExecuting, setActionExecuting] = useState(false);
  const [actionResult, setActionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Expanded nodes in tree
  const [expandedNodes, setExpandedNodes] = useState<Record<number, boolean>>({});

  // Copied state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Load databases list
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetchRemoteServerPostgresDatabases(server.id);
        if (isMounted && res.success && res.databases) {
          const names = res.databases.map((d: PostgresDatabaseItem) => d.name);
          setDatabases(names);
          if (!names.includes(selectedDb) && names.length > 0) {
            setSelectedDb(names[0]);
          }
        }
      } catch {}
    })();
    return () => {
      isMounted = false;
    };
  }, [server.id]);

  // Fetch lock overview
  const fetchLocks = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerPostgresLocks(server.id, {
        database: selectedDb,
      });
      if (res.success && res.data) {
        setOverview(res.data);
        // By default, auto-expand all root blockers
        const exp: Record<number, boolean> = {};
        for (const node of res.data.blockingTree) {
          exp[node.pid] = true;
        }
        setExpandedNodes((prev) => ({ ...exp, ...prev }));
      } else {
        setError(res.error || (isEn ? 'Failed to fetch PostgreSQL locks telemetry.' : 'خطا در دریافت اطلاعات قفل‌های PostgreSQL.'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Connection error while inspecting locks.' : 'خطای ارتباط در پایش قفل‌ها.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [server.id, selectedDb, isEn]);

  useEffect(() => {
    fetchLocks();
  }, [fetchLocks]);

  // Setup auto-refresh timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefreshInterval > 0) {
      timerRef.current = setInterval(() => {
        fetchLocks(true);
      }, autoRefreshInterval * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshInterval, fetchLocks]);

  // Toggle tree node expansion
  const toggleExpand = (pid: number) => {
    setExpandedNodes((prev) => ({ ...prev, [pid]: !prev[pid] }));
  };

  // Execute cancel or terminate
  const executeSessionAction = async () => {
    if (!actionModal.pid) return;
    setActionExecuting(true);
    setActionResult(null);
    try {
      const res = await terminateRemoteServerPostgresSession(server.id, {
        pid: actionModal.pid,
        action: actionModal.action,
        database: selectedDb,
      });

      if (res.success) {
        setActionResult({
          success: true,
          message: isEn ? res.message : (res.messageFa || res.message),
        });
        setTimeout(() => {
          setActionModal((prev) => ({ ...prev, isOpen: false }));
          setActionResult(null);
          fetchLocks(true);
        }, 1500);
      } else {
        setActionResult({
          success: false,
          message: isEn ? (res.error || res.message) : (res.messageFa || res.message),
        });
      }
    } catch (err: any) {
      setActionResult({
        success: false,
        message: err.message || (isEn ? 'Failed to execute session action' : 'خطا در اجرای عملیات بر روی نشست'),
      });
    } finally {
      setActionExecuting(false);
    }
  };

  // Filtered locks for the table view
  const filteredLocks = useMemo(() => {
    if (!overview?.locks) return [];
    return overview.locks.filter((l) => {
      // Table filter
      if (tableFilter === 'waiting' && l.granted) return false;
      if (tableFilter === 'blockers' && !l.isBlocking) return false;
      if (
        tableFilter === 'heavy' &&
        l.mode !== 'ExclusiveLock' &&
        l.mode !== 'AccessExclusiveLock' &&
        l.mode !== 'ShareRowExclusiveLock'
      )
        return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPid = String(l.pid).includes(q);
        const matchRel = (l.relation || '').toLowerCase().includes(q);
        const matchSchema = (l.schema || '').toLowerCase().includes(q);
        const matchUser = (l.usename || '').toLowerCase().includes(q);
        const matchMode = l.mode.toLowerCase().includes(q);
        const matchQuery = (l.query || '').toLowerCase().includes(q);
        const matchApp = (l.applicationName || '').toLowerCase().includes(q);
        return matchPid || matchRel || matchSchema || matchUser || matchMode || matchQuery || matchApp;
      }
      return true;
    });
  }, [overview?.locks, tableFilter, searchQuery]);

  // Format seconds to human friendly string
  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  };

  // Color helper for lock modes
  const getLockModeBadge = (mode: string) => {
    if (mode === 'AccessExclusiveLock') {
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
    }
    if (mode === 'ExclusiveLock' || mode === 'ShareRowExclusiveLock') {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
    }
    if (mode.includes('Exclusive')) {
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    }
    if (mode === 'AccessShareLock') {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
    return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  };

  // Render tree node component recursively
  const renderTreeNode = (node: PostgresBlockingNode, depth: number = 0) => {
    const isExpanded = expandedNodes[node.pid] !== false;
    const hasChildren = node.blockedSessions && node.blockedSessions.length > 0;
    const isRoot = node.isRootBlocker;

    return (
      <div key={node.pid} className="space-y-2">
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            isRoot
              ? isLightMode
                ? 'bg-amber-50/80 border-amber-300 shadow-sm'
                : 'bg-amber-950/30 border-amber-500/40 shadow-sm'
              : isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/70 border-slate-800'
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Left: PID, User, and Hierarchy Badge */}
            <div className="flex items-start sm:items-center gap-2.5 flex-wrap">
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => toggleExpand(node.pid)}
                  className="p-1 rounded hover:bg-slate-500/20 transition cursor-pointer"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              )}

              {isRoot ? (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 animate-pulse">
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  {isEn ? 'ROOT BLOCKER' : 'مسدودکننده ریشه'}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <ArrowRight className="w-3 h-3" />
                  {isEn ? 'WAITING' : 'در انتظار'}
                </span>
              )}

              <span className="font-mono text-sm font-bold text-cyan-400">
                PID: {node.pid}
              </span>

              <span className={`text-xs px-2 py-0.5 rounded ${isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'}`}>
                {node.usename}
              </span>

              {node.clientAddr && (
                <span className="text-xs font-mono text-slate-400">
                  {node.clientAddr}
                </span>
              )}

              {node.state && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                    node.state === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : node.state.includes('idle')
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}
                >
                  {node.state}
                </span>
              )}

              {node.lockMode && (
                <span className={`text-[10px] px-2 py-0.5 rounded border ${getLockModeBadge(node.lockMode)}`}>
                  {node.lockMode}
                </span>
              )}

              {node.relation && (
                <span className="text-xs font-mono font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  {node.schema ? `${node.schema}.${node.relation}` : node.relation}
                </span>
              )}

              <div className="flex items-center gap-1 text-xs text-slate-400 ml-auto sm:ml-0">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono font-semibold text-amber-400">
                  {formatDuration(node.waitDurationSeconds)}
                </span>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              {node.blockedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {isEn ? `Blocking ${node.blockedCount}` : `مسدود کرده: ${node.blockedCount}`}
                </span>
              )}

              {/* Graceful Query Cancel */}
              <button
                type="button"
                onClick={() =>
                  setActionModal({
                    isOpen: true,
                    pid: node.pid,
                    action: 'cancel',
                    query: node.query,
                    usename: node.usename,
                    waitSec: node.waitDurationSeconds,
                    blockedCount: node.blockedCount,
                  })
                }
                title={isEn ? 'Cancel Query (pg_cancel_backend)' : 'لغو اجرای کوئری'}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/40 transition cursor-pointer flex items-center gap-1"
              >
                <Square className="w-3 h-3" />
                <span>{isEn ? 'Cancel Query' : 'لغو کوئری'}</span>
              </button>

              {/* Forceful Session Terminate */}
              <button
                type="button"
                onClick={() =>
                  setActionModal({
                    isOpen: true,
                    pid: node.pid,
                    action: 'terminate',
                    query: node.query,
                    usename: node.usename,
                    waitSec: node.waitDurationSeconds,
                    blockedCount: node.blockedCount,
                  })
                }
                title={isEn ? 'Kill Connection (pg_terminate_backend)' : 'قطع کامل اتصال نشست'}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition cursor-pointer flex items-center gap-1"
              >
                <AlertOctagon className="w-3 h-3" />
                <span>{isEn ? 'Terminate' : 'خاتمه اتصال'}</span>
              </button>
            </div>
          </div>

          {/* Query Preview */}
          {node.query && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-700/40 flex items-start justify-between gap-2">
              <pre
                className={`text-xs font-mono p-2 rounded-lg overflow-x-auto flex-1 max-h-24 ${
                  isLightMode ? 'bg-slate-100 text-slate-800' : 'bg-slate-950/80 text-cyan-300'
                }`}
              >
                {node.query}
              </pre>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(node.query!, `node-${node.pid}`)}
                  title={isEn ? 'Copy SQL' : 'کپی کوئری'}
                  className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  {copiedKey === `node-${node.pid}` ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {onNavigateToSqlStudio && (
                  <button
                    type="button"
                    onClick={() => onNavigateToSqlStudio(node.query!)}
                    title={isEn ? 'Open in SQL Studio' : 'باز کردن در ویرایشگر SQL'}
                    className="p-1.5 rounded hover:bg-slate-700/50 text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Children (Blocked sessions) */}
        {hasChildren && isExpanded && (
          <div className="space-y-2 border-l-2 border-dashed border-amber-500/30 pl-2">
            {node.blockedSessions.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          overview && overview.blockedSessionsCount > 0
            ? isLightMode
              ? 'bg-rose-50/70 border-rose-200'
              : 'bg-rose-950/20 border-rose-500/30'
            : isLightMode
            ? 'bg-white border-slate-200'
            : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                overview && overview.blockedSessionsCount > 0
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              }`}
            >
              {overview && overview.blockedSessionsCount > 0 ? (
                <ShieldAlert className="w-6 h-6" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{isEn ? 'Lock & Deadlock Inspector' : 'پایش زنده و ردیابی قفل‌ها و بن‌بست‌ها'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Lock & Deadlock Inspector' : 'پایش قفل‌ها و بن‌بست‌ها'}
                    infoWhatEn="Live inspector for PostgreSQL table/row locks, deadlocks, and blocking query hierarchies via pg_locks and pg_blocking_pids."
                    infoWhatFa="پایشگر زنده قفل‌های جدول/سطر، بن‌بست‌ها و سلسله‌مراتب کوئری‌های مسدودکننده PostgreSQL با استفاده از pg_locks و pg_blocking_pids."
                    infoWhyEn="High-concurrency workloads can suffer from stalled transactions or circular lock deadlocks that freeze application endpoints. This tool identifies root blockers and safely frees blocked resources."
                    infoWhyFa="ترافیک‌های سنگین همزمان ممکن است دچار توقف تراکنش‌ها یا بن‌بست‌های قفلی شوند که سرویس‌ها را معلق می‌کند. این ابزار مسدودکننده‌های ریشه را یافته و منابع را آزاد می‌سازد."
                    infoExampleEn="An idle in transaction process holding an exclusive row lock halts multiple UPDATE/SELECT queries. Identify PID, inspect SQL, and cancel or terminate it."
                    infoExampleFa="یک نشست با وضعیت idle in transaction که قفل ردیف را نگه داشته مانع دیگر کوئری‌ها می‌شود. با یافتن PID می‌توانید آن را متوقف کنید."
                  />
                </h3>
                {overview && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      overview.blockedSessionsCount > 0
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {overview.blockedSessionsCount > 0
                      ? isEn
                        ? `${overview.blockedSessionsCount} Blocked Queries Detected!`
                        : `${overview.blockedSessionsCount} کوئری مسدود شناسایی شد!`
                      : isEn
                      ? 'No Blocked Queries'
                      : 'هیچ کوئری مسدود نیست'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Real-time telemetry from pg_locks, pg_stat_activity, and pg_stat_database with session termination.'
                  : 'تلمتری واقعی از جداول سیستمی pg_locks و pg_stat_activity همراه با امکان آزادسازی و قطع نشست‌ها.'}
              </p>
            </div>
          </div>

          {/* Right Controls: Database, Refresh, Auto-Refresh Interval */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Database Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800/40 p-1 rounded-xl border border-slate-700/50">
              <Database className="w-3.5 h-3.5 text-cyan-400 ml-1.5" />
              <select
                value={selectedDb}
                onChange={(e) => setSelectedDb(e.target.value)}
                className={`text-xs font-medium bg-transparent border-0 outline-none pr-3 cursor-pointer ${
                  isLightMode ? 'text-slate-800' : 'text-slate-200'
                }`}
              >
                {databases.length > 0 ? (
                  databases.map((db) => (
                    <option key={db} value={db} className="bg-slate-900 text-white">
                      {db}
                    </option>
                  ))
                ) : (
                  <option value={selectedDb} className="bg-slate-900 text-white">
                    {selectedDb}
                  </option>
                )}
              </select>
            </div>

            {/* Auto-Refresh Select */}
            <div className="flex items-center gap-1.5 bg-slate-800/40 p-1 rounded-xl border border-slate-700/50">
              <Activity className="w-3.5 h-3.5 text-emerald-400 ml-1.5" />
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className={`text-xs font-medium bg-transparent border-0 outline-none pr-3 cursor-pointer ${
                  isLightMode ? 'text-slate-800' : 'text-slate-200'
                }`}
              >
                <option value={0} className="bg-slate-900 text-white">
                  {isEn ? 'Auto-Refresh: Off' : 'بروزرسانی خودکار: خاموش'}
                </option>
                <option value={2} className="bg-slate-900 text-white">
                  {isEn ? 'Every 2s (Fast)' : 'هر ۲ ثانیه (سریع)'}
                </option>
                <option value={5} className="bg-slate-900 text-white">
                  {isEn ? 'Every 5s' : 'هر ۵ ثانیه'}
                </option>
                <option value={10} className="bg-slate-900 text-white">
                  {isEn ? 'Every 10s' : 'هر ۱۰ ثانیه'}
                </option>
                <option value={30} className="bg-slate-900 text-white">
                  {isEn ? 'Every 30s' : 'هر ۳۰ ثانیه'}
                </option>
              </select>
            </div>

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={() => fetchLocks(false)}
              disabled={loading}
              className={`p-2 rounded-xl border transition cursor-pointer flex items-center gap-1.5 text-xs font-medium ${
                loading
                  ? 'opacity-60 cursor-not-allowed'
                  : isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="hidden sm:inline">{isEn ? 'Refresh' : 'بروزرسانی'}</span>
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* KPI Overview Cards */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Total Locks */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Total Locks' : 'کل قفل‌ها'}</span>
              <Lock className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">
              {overview.totalLocksCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'active in pg_locks' : 'فعال در جدول pg_locks'}
            </div>
          </div>

          {/* 2. Blocked / Waiting Locks */}
          <div
            className={`p-3.5 rounded-xl border ${
              overview.waitingLocksCount > 0
                ? isLightMode
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-rose-950/30 border-rose-500/40 animate-pulse'
                : isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Waiting Locks' : 'قفل‌های در انتظار'}</span>
              <AlertTriangle className={`w-3.5 h-3.5 ${overview.waitingLocksCount > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                overview.waitingLocksCount > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {overview.waitingLocksCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {overview.waitingLocksCount > 0
                ? isEn
                  ? 'Granted: FALSE'
                  : 'در انتظار تایید (False)'
                : isEn
                ? 'All Granted (OK)'
                : 'تمامی قفل‌ها برقرارند'}
            </div>
          </div>

          {/* 3. Root Blockers */}
          <div
            className={`p-3.5 rounded-xl border ${
              overview.rootBlockersCount > 0
                ? isLightMode
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-amber-950/30 border-amber-500/40'
                : isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Root Blockers' : 'مسدودکننده‌های ریشه'}</span>
              <Flame className={`w-3.5 h-3.5 ${overview.rootBlockersCount > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                overview.rootBlockersCount > 0 ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {overview.rootBlockersCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'holding up others' : 'متوقف‌کننده سایر نشست‌ها'}
            </div>
          </div>

          {/* 4. Heavy / Exclusive Locks */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Heavy Locks' : 'قفل‌های انحصاری'}</span>
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono text-purple-400">
              {overview.heavyLocksCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'Exclusive / AccessExcl' : 'قفل‌های Exclusive'}
            </div>
          </div>

          {/* 5. Longest Wait Duration */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Longest Wait' : 'طولانی‌ترین معطلی'}</span>
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {formatDuration(overview.longestWaitSeconds)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'query / tx duration' : 'طول عمر کوئری یا تراکنش'}
            </div>
          </div>

          {/* 6. Total Deadlocks Recorded */}
          <div
            className={`p-3.5 rounded-xl border ${
              overview.deadlockSummary.totalDeadlocksRecorded > 0
                ? isLightMode
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-rose-950/20 border-rose-500/30'
                : isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Deadlocks Logged' : 'بن‌بست‌های ثبت‌شده'}</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                overview.deadlockSummary.totalDeadlocksRecorded > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {overview.deadlockSummary.totalDeadlocksRecorded}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'timeout: ' + overview.deadlockSummary.deadlockTimeoutSetting : 'تایم‌اوت: ' + overview.deadlockSummary.deadlockTimeoutSetting}
            </div>
          </div>
        </div>
      )}

      {/* View Mode Tabs & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-700/40">
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'tree'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>{isEn ? 'Blocking Tree (Hierarchy)' : 'درخت وابستگی و مسدودسازی'}</span>
            {overview && overview.blockingTree.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                {overview.blockingTree.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isEn ? 'Active Locks Table' : 'جدول تفصیلی قفل‌ها'}</span>
            {overview && overview.locks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                {overview.locks.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode('deadlock')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'deadlock'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Deadlock Telemetry' : 'آمار و تنظیمات بن‌بست'}</span>
          </button>
        </div>

        {/* Search bar (active in table view) */}
        {viewMode === 'table' && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Filter PID, table, user, query...' : 'جستجوی PID، جدول، کاربر یا کوئری...'}
                className={`pl-8 pr-3 py-1.5 rounded-xl text-xs border outline-none w-56 sm:w-64 transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                    : 'bg-slate-800/60 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500/50'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: BLOCKING DEPENDENCY TREE */}
      {viewMode === 'tree' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {isEn
                ? 'Hierarchical relationship of blocking and blocked sessions (built from pg_blocking_pids):'
                : 'روابط سلسله‌مراتبی نشست‌های مسدودکننده و در انتظار (بر اساس تابع pg_blocking_pids):'}
            </span>
            {overview && (
              <span className="font-mono text-[11px] text-slate-500">
                {isEn ? `Last polled: ${new Date(overview.retrievedAt).toLocaleTimeString()}` : `آخرین بروزرسانی: ${new Date(overview.retrievedAt).toLocaleTimeString()}`}
              </span>
            )}
          </div>

          {overview?.blockingTree && overview.blockingTree.length > 0 ? (
            <div className="space-y-3">
              {overview.blockingTree.map((rootNode) => renderTreeNode(rootNode, 0))}
            </div>
          ) : (
            <div
              className={`p-8 rounded-2xl border text-center ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-emerald-400">
                {isEn ? 'No Blocking Queries Detected!' : 'هیچ کوئری مسدودکننده‌ای یافت نشد!'}
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {isEn
                  ? 'All database connections and transactions are proceeding normally without being blocked by other sessions.'
                  : 'تمامی تراکنش‌ها و نشست‌های پایگاه داده به شکل عادی در حال اجرا بوده و هیچ بن‌بست یا مسدودسازی فعالی وجود ندارد.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: ACTIVE LOCKS TABLE */}
      {viewMode === 'table' && (
        <div className="space-y-4">
          {/* Sub-filter tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setTableFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tableFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/40 text-slate-400 hover:text-white'
              }`}
            >
              {isEn ? 'All Locks' : 'همه قفل‌ها'} ({overview?.locks.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setTableFilter('waiting')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                tableFilter === 'waiting'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800/40 text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{isEn ? 'Waiting Only' : 'فقط منتظرها'}</span> ({overview?.waitingLocksCount || 0})
            </button>
            <button
              type="button"
              onClick={() => setTableFilter('blockers')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                tableFilter === 'blockers'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800/40 text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <Flame className="w-3 h-3" />
              <span>{isEn ? 'Blocker Sessions' : 'مسدودکننده‌ها'}</span> ({overview?.rootBlockersCount || 0})
            </button>
            <button
              type="button"
              onClick={() => setTableFilter('heavy')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                tableFilter === 'heavy'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800/40 text-purple-400 hover:bg-purple-500/10'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>{isEn ? 'Exclusive Only' : 'فقط انحصاری'}</span> ({overview?.heavyLocksCount || 0})
            </button>
          </div>

          {/* Table Container */}
          <div
            className={`rounded-2xl border overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                    isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-800/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <tr>
                    <th className="py-3 px-3.5">{isEn ? 'Status' : 'وضعیت'}</th>
                    <th className="py-3 px-3">{isEn ? 'PID' : 'شناسه PID'}</th>
                    <th className="py-3 px-3">{isEn ? 'Relation / Object' : 'جدول / آبجکت'}</th>
                    <th className="py-3 px-3">{isEn ? 'Lock Type & Mode' : 'نوع و حالت قفل'}</th>
                    <th className="py-3 px-3">{isEn ? 'User & Client' : 'کاربر و کلاینت'}</th>
                    <th className="py-3 px-3">{isEn ? 'Wait Duration' : 'زمان معطلی'}</th>
                    <th className="py-3 px-3">{isEn ? 'Current Query' : 'کوئری جاری'}</th>
                    <th className="py-3 px-3.5 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {filteredLocks.length > 0 ? (
                    filteredLocks.map((lock, idx) => (
                      <tr
                        key={`${lock.pid}-${lock.locktype}-${idx}`}
                        className={`transition hover:bg-slate-800/30 ${
                          !lock.granted
                            ? isLightMode
                              ? 'bg-rose-50/60'
                              : 'bg-rose-950/20'
                            : lock.isBlocking
                            ? isLightMode
                              ? 'bg-amber-50/60'
                              : 'bg-amber-950/20'
                            : ''
                        }`}
                      >
                        {/* Status (Granted vs Waiting) */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {lock.granted ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isEn ? 'Granted' : 'تاییدشده'}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{isEn ? 'WAITING' : 'معلق'}</span>
                            </span>
                          )}
                          {lock.isBlocking && (
                            <span className="mt-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit">
                              <Flame className="w-2.5 h-2.5 text-amber-400" />
                              <span>{isEn ? `Blocks ${lock.blockedPids.length}` : `مسدود: ${lock.blockedPids.length}`}</span>
                            </span>
                          )}
                        </td>

                        {/* PID */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-cyan-400">
                          {lock.pid}
                        </td>

                        {/* Relation / Object */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-sans">
                          {lock.relation ? (
                            <div>
                              <span className="font-semibold font-mono text-purple-400">
                                {lock.relation}
                              </span>
                              {lock.schema && (
                                <span className="text-[10px] text-slate-500 block">
                                  {lock.schema}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs italic font-mono">
                              {lock.locktype}
                            </span>
                          )}
                        </td>

                        {/* Lock Type & Mode */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${getLockModeBadge(lock.mode)}`}>
                            {lock.mode}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-0.5 font-mono">
                            {lock.locktype}
                          </span>
                        </td>

                        {/* User & Client */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-sans text-xs">
                          <span className="font-semibold text-slate-200">
                            {lock.usename || 'postgres'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            {lock.clientAddr}
                          </span>
                        </td>

                        {/* Wait Duration */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-amber-400">
                          {formatDuration(lock.waitDurationSeconds)}
                        </td>

                        {/* Query preview */}
                        <td className="py-2.5 px-3 max-w-xs font-mono text-[11px] truncate text-slate-300">
                          {lock.query ? (
                            <span title={lock.query}>{lock.query}</span>
                          ) : (
                            <span className="text-slate-500 italic">
                              {lock.state || (isEn ? 'idle' : 'غیرفعال')}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap text-right font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setActionModal({
                                  isOpen: true,
                                  pid: lock.pid,
                                  action: 'cancel',
                                  query: lock.query,
                                  usename: lock.usename,
                                  waitSec: lock.waitDurationSeconds,
                                  blockedCount: lock.blockedPids.length,
                                })
                              }
                              title={isEn ? 'Cancel query' : 'لغو کوئری'}
                              className="p-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 transition cursor-pointer"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActionModal({
                                  isOpen: true,
                                  pid: lock.pid,
                                  action: 'terminate',
                                  query: lock.query,
                                  usename: lock.usename,
                                  waitSec: lock.waitDurationSeconds,
                                  blockedCount: lock.blockedPids.length,
                                })
                              }
                              title={isEn ? 'Terminate connection' : 'خاتمه اتصال'}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition cursor-pointer"
                            >
                              <AlertOctagon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-sans">
                        {isEn ? 'No locks match the active filter criteria.' : 'هیچ قفلی با فیلترهای انتخابی مطابقت ندارد.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: DEADLOCK TELEMETRY & SETTINGS */}
      {viewMode === 'deadlock' && overview && (
        <div className="space-y-6">
          {/* Deadlock settings cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className={`p-4 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{isEn ? 'Deadlock Timeout' : 'زمان انتظار بن‌بست'}</span>
                <Clock className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {overview.deadlockSummary.deadlockTimeoutSetting}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {isEn
                  ? 'Time in milliseconds to wait on a lock before checking whether there is a deadlock condition.'
                  : 'مدت زمانی که قبل از بررسی وجود بن‌بست (Deadlock Check) در صف قفل منتظر می‌ماند.'}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{isEn ? 'Max Locks Per Tx' : 'حداکثر قفل به ازای تراکنش'}</span>
                <Layers className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-xl font-bold font-mono text-indigo-400">
                {overview.deadlockSummary.maxLocksPerTx}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {isEn
                  ? 'Determines master shared memory lock table allocation capacity (max_locks_per_transaction).'
                  : 'ظرفیت جدول تخصیص قفل‌های حافظه مشترک به ازای هر تراکنش.'}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{isEn ? 'Log Lock Waits' : 'ثبت گزارش معطلی قفل'}</span>
                <FileCode2 className="w-4 h-4 text-amber-400" />
              </div>
              <div
                className={`text-xl font-bold font-mono ${
                  overview.deadlockSummary.logLockWaitsSetting ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {overview.deadlockSummary.logLockWaitsSetting ? 'ON' : 'OFF'}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {isEn
                  ? 'When ON, logs a message if a session waits longer than deadlock_timeout to acquire a lock.'
                  : 'در صورت روشن بودن، لاگ هشداری در صورت معطلی بیش از حد مجاز ثبت می‌گردد.'}
              </p>
            </div>
          </div>

          {/* Database deadlocks table */}
          <div
            className={`p-5 rounded-2xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>{isEn ? 'Per-Database Deadlock & Conflict Metrics' : 'آمار تفکیکی بن‌بست‌ها و تداخل‌ها بر اساس پایگاه داده'}</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead
                  className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                    isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-800/60 border-slate-800 text-slate-400'
                  }`}
                >
                  <tr>
                    <th className="py-2.5 px-3">{isEn ? 'Database' : 'پایگاه داده'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Deadlocks' : 'تعداد بن‌بست‌ها'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Conflicts' : 'تداخل‌ها (Conflicts)'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Rollbacks' : 'رول‌بک‌ها'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {overview.deadlockSummary.databaseDeadlocks.map((row) => (
                    <tr key={row.datname} className="hover:bg-slate-800/20">
                      <td className="py-2.5 px-3 font-bold text-cyan-400 font-sans">
                        {row.datname}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            row.deadlocks > 0
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.deadlocks}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {row.conflicts || 0}
                      </td>
                      <td className="py-2.5 px-3 text-amber-400">
                        {row.xactRollback}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ACTION CONFIRMATION MODAL (Cancel / Terminate) */}
      {actionModal.isOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 sm:p-6 shadow-2xl transition-all ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                {actionModal.action === 'terminate' ? (
                  <AlertOctagon className="w-5 h-5 text-rose-400" />
                ) : (
                  <Square className="w-5 h-5 text-yellow-400" />
                )}
                <h3 className="font-bold text-base">
                  {actionModal.action === 'terminate'
                    ? isEn
                      ? `Terminate Backend Session (PID ${actionModal.pid})`
                      : `خاتمه دادن قطعی نشست (PID ${actionModal.pid})`
                    : isEn
                    ? `Cancel Running Query (PID ${actionModal.pid})`
                    : `لغو اجرای کوئری نشست (PID ${actionModal.pid})`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActionModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3.5 text-xs">
              {actionModal.blockedCount && actionModal.blockedCount > 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
                  <Flame className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      {isEn ? 'Root Blocker Detected:' : 'مسدودکننده اصلی شناسایی شد:'}
                    </span>{' '}
                    {isEn
                      ? `This session is currently blocking ${actionModal.blockedCount} other query(ies). Terminating it will immediately release locks and unblock the queue.`
                      : `این نشست در حال حاضر ${actionModal.blockedCount} کوئری دیگر را مسدود کرده است. قطع آن بلافاصله قفل‌ها را آزاد و صف را باز خواهد کرد.`}
                  </div>
                </div>
              ) : null}

              <p className="text-slate-400">
                {actionModal.action === 'terminate'
                  ? isEn
                    ? 'Executing pg_terminate_backend() will immediately drop the TCP connection and rollback any uncommitted transaction in this session.'
                    : 'اجرای دستور pg_terminate_backend() بلافاصله اتصال TCP را قطع کرده و هرگونه تراکنش کامیت‌نشده در این نشست را رول‌بک خواهد کرد.'
                  : isEn
                  ? 'Executing pg_cancel_backend() will gracefully interrupt the currently running query while keeping the client session connection open.'
                  : 'اجرای دستور pg_cancel_backend() کوئری فعال فعلی را به آرامی متوقف کرده اما اتصال کلاینت را باز نگه می‌دارد.'}
              </p>

              {/* Session Meta */}
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 font-mono text-[11px]">
                <div>
                  <span className="text-slate-500">{isEn ? 'PID: ' : 'شناسه: '}</span>
                  <span className="text-cyan-400 font-bold">{actionModal.pid}</span>
                </div>
                <div>
                  <span className="text-slate-500">{isEn ? 'User: ' : 'کاربر: '}</span>
                  <span className="text-slate-200">{actionModal.usename || 'postgres'}</span>
                </div>
                {actionModal.waitSec !== undefined && (
                  <div>
                    <span className="text-slate-500">{isEn ? 'Duration: ' : 'زمان معطلی: '}</span>
                    <span className="text-amber-400">{formatDuration(actionModal.waitSec)}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">{isEn ? 'Database: ' : 'دیتابیس: '}</span>
                  <span className="text-purple-400">{selectedDb}</span>
                </div>
              </div>

              {/* Query Preview */}
              {actionModal.query && (
                <div>
                  <span className="text-slate-400 font-semibold block mb-1">
                    {isEn ? 'Current Query:' : 'کوئری در حال اجرا:'}
                  </span>
                  <pre
                    className={`p-2.5 rounded-xl text-xs font-mono max-h-32 overflow-y-auto ${
                      isLightMode ? 'bg-slate-100 text-slate-800' : 'bg-slate-950 text-cyan-300'
                    }`}
                  >
                    {actionModal.query}
                  </pre>
                </div>
              )}

              {/* Feedback Alert */}
              {actionResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    actionResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {actionResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{actionResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setActionModal((prev) => ({ ...prev, isOpen: false }))}
                disabled={actionExecuting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={executeSessionAction}
                disabled={actionExecuting}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 text-white ${
                  actionModal.action === 'terminate'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/30'
                    : 'bg-yellow-600 hover:bg-yellow-500 shadow-lg shadow-yellow-900/30'
                } ${actionExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {actionExecuting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : actionModal.action === 'terminate' ? (
                  <AlertOctagon className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>
                  {actionModal.action === 'terminate'
                    ? isEn
                      ? 'Terminate Session'
                      : 'خاتمه قطعی نشست'
                    : isEn
                    ? 'Cancel Query'
                    : 'لغو کوئری'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
