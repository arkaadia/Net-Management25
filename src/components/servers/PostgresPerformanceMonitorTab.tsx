import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Activity,
  Zap,
  TrendingUp,
  Clock,
  Database,
  RefreshCw,
  Search,
  Filter,
  Layers,
  HardDrive,
  Cpu,
  Flame,
  CheckCircle2,
  AlertTriangle,
  FileCode2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Info,
  Server,
  Users,
  SlidersHorizontal,
  ArrowDownUp,
  Percent,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresPerformanceOverview,
  PostgresStatStatementItem,
  PostgresLiveSessionItem,
  PostgresDatabaseItem,
} from '../../types';
import {
  fetchRemoteServerPostgresPerformance,
  fetchRemoteServerPostgresDatabases,
  resetRemoteServerPostgresStatStatements,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresPerformanceMonitorTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
  onNavigateToSqlStudio?: (sql: string) => void;
}

type PerformanceSubView = 'queries' | 'sessions' | 'bgwriter';
type QuerySortField = 'totalTime' | 'meanTime' | 'calls' | 'reads' | 'rows';

export const PostgresPerformanceMonitorTab: React.FC<PostgresPerformanceMonitorTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
  onNavigateToSqlStudio,
}) => {
  const [selectedDb, setSelectedDb] = useState<string>(initialDatabase || server.postgres_database || 'postgres');
  const [databases, setDatabases] = useState<string[]>([]);
  const [subView, setSubView] = useState<PerformanceSubView>('queries');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PostgresPerformanceOverview | null>(null);

  // Sorting & Filtering for queries
  const [sortField, setSortField] = useState<QuerySortField>('totalTime');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionFilter, setSessionFilter] = useState<'all' | 'active' | 'idle_in_tx'>('all');

  // Auto-Refresh
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const timerRef = useRef<any>(null);

  // Reset Dialog State
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean; message: string } | null>(null);

  // Copied state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Load databases
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

  // Fetch performance overview
  const fetchPerformance = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerPostgresPerformance(server.id, {
        database: selectedDb,
      });
      if (res.success && res.data) {
        setOverview(res.data);
      } else {
        setError(res.error || (isEn ? 'Failed to fetch PostgreSQL performance metrics.' : 'خطا در دریافت شاخص‌های کارایی پایگاه داده.'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Connection error while polling performance metrics.' : 'خطای ارتباط در دریافت شاخص‌های کارایی.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [server.id, selectedDb, isEn]);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  // Auto-refresh timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefreshInterval > 0) {
      timerRef.current = setInterval(() => {
        fetchPerformance(true);
      }, autoRefreshInterval * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshInterval, fetchPerformance]);

  // Reset pg_stat_statements
  const handleResetStats = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      const res = await resetRemoteServerPostgresStatStatements(server.id, {
        database: selectedDb,
      });
      if (res.success) {
        setResetResult({
          success: true,
          message: isEn ? res.message : (res.messageFa || res.message),
        });
        setTimeout(() => {
          setResetModalOpen(false);
          setResetResult(null);
          fetchPerformance(true);
        }, 1500);
      } else {
        setResetResult({
          success: false,
          message: isEn ? (res.error || res.message) : (res.messageFa || res.message),
        });
      }
    } catch (err: any) {
      setResetResult({
        success: false,
        message: err?.message || (isEn ? 'Failed to reset statistics' : 'خطا در بازنشانی آمار'),
      });
    } finally {
      setResetting(false);
    }
  };

  // Format milliseconds into friendly time string
  const formatTimeMs = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    const sec = ms / 1000;
    if (sec < 60) return `${sec.toFixed(2)}s`;
    const min = Math.floor(sec / 60);
    const remSec = (sec % 60).toFixed(1);
    return `${min}m ${remSec}s`;
  };

  // Format large numbers (1200000 -> 1.2M)
  const formatCompactNumber = (n: number) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  // Sorted & Filtered Top Queries
  const filteredQueries = useMemo(() => {
    if (!overview?.topQueries) return [];
    let list = [...overview.topQueries];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) => item.query.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      if (sortField === 'totalTime') return b.totalExecTimeMs - a.totalExecTimeMs;
      if (sortField === 'meanTime') return b.meanExecTimeMs - a.meanExecTimeMs;
      if (sortField === 'calls') return b.calls - a.calls;
      if (sortField === 'reads') return b.sharedBlksRead - a.sharedBlksRead;
      if (sortField === 'rows') return b.rows - a.rows;
      return 0;
    });

    return list;
  }, [overview?.topQueries, searchQuery, sortField]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    if (!overview?.activeSessions) return [];
    return overview.activeSessions.filter((s) => {
      if (sessionFilter === 'active') return s.state === 'active';
      if (sessionFilter === 'idle_in_tx') return s.state.includes('idle in transaction');
      return true;
    });
  }, [overview?.activeSessions, sessionFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border bg-amber-500/20 border-amber-500/40 text-amber-400">
              <Zap className="w-6 h-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{isEn ? 'Live Activity & Query Performance Monitor' : 'پایش زنده ترافیک و کارایی کوئری‌ها'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Live Activity & Performance Monitor' : 'پایش زنده کارایی و کوئری‌ها'}
                    infoWhatEn="Real-time telemetry measuring transactions (TPS), cache hit ratios, background writer flushes, and slow query diagnostics via pg_stat_statements."
                    infoWhatFa="پایشگر بلادرنگ برای سنجش نرخ تراکنش‌ها (TPS)، نرخ بهره‌وری کش بافر، فلاش‌های نویسنده پس‌زمینه و تحلیل کوئری‌های کند با pg_stat_statements."
                    infoWhyEn="Identifies slow queries, database throughput bottlenecks, heavy disk I/O, and checkpoint stress before they impact user applications."
                    infoWhyFa="شناسایی کوئری‌های سنگین، گلوگاه‌های گذردهی پایگاه داده، فشار دیسک و تنظیمات نامناسب چک‌پوینت قبل از بروز اختلال در سرویس‌ها."
                    infoExampleEn="Locate queries consuming 80% of cluster CPU or queries reading 500,000 blocks from disk to add appropriate indexes."
                    infoExampleFa="یافتن کوئری‌هایی که ۸۰٪ زمان پردازنده را به خود اختصاص داده‌اند یا بلاک‌های متعددی از دیسک می‌خوانند جهت ایندکس‌گذاری بهینه."
                  />
                </h3>

                {overview && overview.pgStatStatementsAvailable && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    pg_stat_statements {isEn ? 'Active' : 'فعال'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Real-time telemetry from pg_stat_database, pg_stat_activity, pg_stat_bgwriter and pg_stat_statements.'
                  : 'تلمتری لحظه‌ای از جداول آماری pg_stat_database، pg_stat_activity، pg_stat_bgwriter و افزونه pg_stat_statements.'}
              </p>
            </div>
          </div>

          {/* Right Controls */}
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

            {/* Manual Refresh */}
            <button
              type="button"
              onClick={() => fetchPerformance(false)}
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
          {/* 1. Cache Hit Ratio */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Cache Hit Ratio' : 'بهره‌وری کش بافر'}</span>
              <Percent className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                overview.dbStats.cacheHitRatio >= 99
                  ? 'text-emerald-400'
                  : overview.dbStats.cacheHitRatio >= 95
                  ? 'text-yellow-400'
                  : 'text-rose-400'
              }`}
            >
              {overview.dbStats.cacheHitRatio.toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {overview.dbStats.cacheHitRatio >= 99
                ? isEn
                  ? 'Excellent (In-RAM)'
                  : 'عالی (در رم)'
                : isEn
                ? 'High Disk Reads'
                : 'دیسک‌خوانی بالا'}
            </div>
          </div>

          {/* 2. Total Commits */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Total Commits' : 'مجموع کامیت‌ها'}</span>
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">
              {formatCompactNumber(overview.dbStats.xactCommit)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'xact_commit' : 'تراکنش‌های موفق'}
            </div>
          </div>

          {/* 3. Rollbacks */}
          <div
            className={`p-3.5 rounded-xl border ${
              overview.dbStats.xactRollback > 0
                ? isLightMode
                  ? 'bg-rose-50/60 border-rose-300'
                  : 'bg-rose-950/20 border-rose-500/30'
                : isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Rollbacks' : 'رول‌بک‌ها'}</span>
              <RotateCcw className={`w-3.5 h-3.5 ${overview.dbStats.xactRollback > 0 ? 'text-rose-400' : 'text-slate-400'}`} />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                overview.dbStats.xactRollback > 0 ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {formatCompactNumber(overview.dbStats.xactRollback)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'aborted transactions' : 'تراکنش‌های لغوشده'}
            </div>
          </div>

          {/* 4. Active Connections */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Active / Max' : 'اتصالات فعال'}</span>
              <Users className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {overview.connectionSummary.active}{' '}
              <span className="text-xs font-normal text-slate-500">
                / {overview.connectionSummary.maxConnections}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {overview.connectionSummary.idleInTransaction > 0
                ? isEn
                  ? `${overview.connectionSummary.idleInTransaction} Idle in TX!`
                  : `${overview.connectionSummary.idleInTransaction} معطل در تراکنش!`
                : isEn
                ? `${overview.connectionSummary.idle} idle connections`
                : `${overview.connectionSummary.idle} اتصال آماده`}
            </div>
          </div>

          {/* 5. Tuples Returned / Fetched */}
          <div
            className={`p-3.5 rounded-xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Tuples Returned' : 'سطرهای بازگردانی'}</span>
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono text-purple-400">
              {formatCompactNumber(overview.dbStats.tupReturned)}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn
                ? `W: ${formatCompactNumber(overview.dbStats.tupInserted + overview.dbStats.tupUpdated)} rows`
                : `نوشتن: ${formatCompactNumber(overview.dbStats.tupInserted + overview.dbStats.tupUpdated)} سطر`}
            </div>
          </div>

          {/* 6. Checkpoint Pressure */}
          <div
            className={`p-3.5 rounded-xl border ${
              overview.bgWriterStats && overview.bgWriterStats.forcedCheckpointPercent > 20
                ? isLightMode
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-amber-950/20 border-amber-500/30'
                : isLightMode
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Forced Checkpoints' : 'چک‌پوینت اضطراری'}</span>
              <Flame className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div
              className={`text-xl font-bold font-mono ${
                overview.bgWriterStats && overview.bgWriterStats.forcedCheckpointPercent > 20
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {overview.bgWriterStats ? `${overview.bgWriterStats.forcedCheckpointPercent}%` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {overview.bgWriterStats && overview.bgWriterStats.forcedCheckpointPercent > 20
                ? isEn
                  ? 'Tuning Recommended'
                  : 'نیاز به افزایش WAL'
                : isEn
                ? 'Healthy Cadence'
                : 'زمان‌بندی منظم'}
            </div>
          </div>
        </div>
      )}

      {/* Sub-View Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-700/40">
          <button
            type="button"
            onClick={() => setSubView('queries')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              subView === 'queries'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Slow & Top Queries (pg_stat_statements)' : 'کوئری‌های پرمصرف و کند'}</span>
            {overview && overview.topQueries.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                {overview.topQueries.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubView('sessions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              subView === 'sessions'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isEn ? 'Live Active Sessions' : 'نشست‌های فعال'}</span>
            {overview && overview.activeSessions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                {overview.activeSessions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubView('bgwriter')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              subView === 'bgwriter'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            <span>{isEn ? 'Background Writer & I/O' : 'نویسنده پس‌زمینه و چک‌پوینت'}</span>
          </button>
        </div>

        {/* Right Action: Reset Stats Button in queries view */}
        {subView === 'queries' && overview?.pgStatStatementsAvailable && (
          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-700 hover:border-slate-600 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 bg-slate-800/40"
          >
            <RotateCcw className="w-3 h-3 text-amber-400" />
            <span>{isEn ? 'Reset Statistics' : 'بازنشانی آمار'}</span>
          </button>
        )}
      </div>

      {/* VIEW 1: SLOW & TOP QUERIES (pg_stat_statements) */}
      {subView === 'queries' && (
        <div className="space-y-4">
          {/* Extension missing notice */}
          {overview && !overview.pgStatStatementsAvailable && (
            <div
              className={`p-5 rounded-2xl border ${
                isLightMode ? 'bg-amber-50/80 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-amber-400">
                    {isEn ? 'Extension pg_stat_statements is not enabled' : 'افزونه pg_stat_statements فعال نیست'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    {isEn
                      ? 'To track aggregated slow queries, execution times, and CPU consumption per SQL pattern, PostgreSQL requires the official pg_stat_statements extension. You can install it on this database via SQL:'
                      : 'برای ردیابی تجمعی کوئری‌های کند، میانگین زمان اجرا و سهم مصرف CPU به ازای هر الگوی SQL، افزونه رسمی pg_stat_statements مورد نیاز است. می‌توانید آن را با دستور زیر نصب کنید:'}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="px-3 py-1.5 rounded-lg bg-black/40 font-mono text-xs text-cyan-300 border border-slate-700/60">
                      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopy('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;', 'create-ext')}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                    >
                      {copiedKey === 'create-ext' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {onNavigateToSqlStudio && (
                      <button
                        type="button"
                        onClick={() => onNavigateToSqlStudio('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;')}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                      >
                        <FileCode2 className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Run in SQL Studio' : 'اجرا در ویرایشگر SQL'}</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    {isEn
                      ? 'Note: shared_preload_libraries = \'pg_stat_statements\' must also be present in postgresql.conf for full telemetry tracking.'
                      : 'نکته: جهت ردیابی کامل باید عبارت shared_preload_libraries = \'pg_stat_statements\' نیز در فایل postgresql.conf قرار داشته باشد.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Search & Sort Bar */}
          {overview?.pgStatStatementsAvailable && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isEn ? 'Search query text...' : 'جستجو در متن کوئری...'}
                  className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-xs border outline-none transition ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-800/60 border-slate-700 text-white focus:border-cyan-500/50'
                  }`}
                />
              </div>

              {/* Sort pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
                  <ArrowDownUp className="w-3 h-3" />
                  <span>{isEn ? 'Sort by:' : 'مرتب‌سازی:'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSortField('totalTime')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    sortField === 'totalTime' ? 'bg-blue-600 text-white' : 'bg-slate-800/40 text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Total CPU Time' : 'کل زمان CPU'}
                </button>
                <button
                  type="button"
                  onClick={() => setSortField('meanTime')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    sortField === 'meanTime' ? 'bg-blue-600 text-white' : 'bg-slate-800/40 text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Mean Latency' : 'میانگین تاخیر'}
                </button>
                <button
                  type="button"
                  onClick={() => setSortField('calls')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    sortField === 'calls' ? 'bg-blue-600 text-white' : 'bg-slate-800/40 text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Calls Count' : 'تعداد فراخوانی'}
                </button>
                <button
                  type="button"
                  onClick={() => setSortField('reads')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    sortField === 'reads' ? 'bg-blue-600 text-white' : 'bg-slate-800/40 text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Disk Reads' : 'خواندن از دیسک'}
                </button>
              </div>
            </div>
          )}

          {/* Queries List */}
          {filteredQueries.length > 0 ? (
            <div className="space-y-3">
              {filteredQueries.map((q, idx) => (
                <div
                  key={`${q.queryId}-${idx}`}
                  className={`p-4 rounded-xl border transition-all ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                    {/* Metrics Row */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {/* Percent of CPU badge */}
                      <span className="px-2 py-0.5 rounded font-bold font-mono text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {q.percentOfTotalCpu}% CPU
                      </span>

                      {/* Total Time */}
                      <span className="flex items-center gap-1 font-mono font-semibold text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        <span>{formatTimeMs(q.totalExecTimeMs)}</span>
                      </span>

                      {/* Mean Latency */}
                      <span className="text-slate-400 font-mono text-[11px]">
                        {isEn ? 'Mean:' : 'میانگین:'}{' '}
                        <strong className="text-cyan-400">{formatTimeMs(q.meanExecTimeMs)}</strong>
                      </span>

                      {/* Calls */}
                      <span className="text-slate-400 font-mono text-[11px]">
                        {isEn ? 'Calls:' : 'فراخوانی:'}{' '}
                        <strong className="text-purple-400">{formatCompactNumber(q.calls)}</strong>
                      </span>

                      {/* Cache Hit % */}
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${
                          q.cacheHitPercent >= 99
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {isEn ? 'Cache: ' : 'کش: '}{q.cacheHitPercent}%
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleCopy(q.query, `q-${q.queryId}`)}
                        className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition cursor-pointer"
                        title={isEn ? 'Copy SQL' : 'کپی کوئری'}
                      >
                        {copiedKey === `q-${q.queryId}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {onNavigateToSqlStudio && (
                        <button
                          type="button"
                          onClick={() => onNavigateToSqlStudio(q.query)}
                          className="px-2 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 transition cursor-pointer flex items-center gap-1"
                          title={isEn ? 'Open in SQL Studio' : 'باز کردن در ویرایشگر SQL'}
                        >
                          <FileCode2 className="w-3 h-3" />
                          <span>{isEn ? 'SQL Studio' : 'ویرایشگر'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* CPU Share visual bar */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(1, q.percentOfTotalCpu))}%` }}
                    />
                  </div>

                  {/* SQL Statement Preview */}
                  <pre
                    className={`p-2.5 rounded-xl text-xs font-mono max-h-36 overflow-x-auto ${
                      isLightMode ? 'bg-slate-100 text-slate-800' : 'bg-slate-950/80 text-cyan-300'
                    }`}
                  >
                    {q.query}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            overview?.pgStatStatementsAvailable && (
              <div
                className={`p-8 rounded-2xl border text-center ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <p className="text-xs text-slate-400">
                  {isEn ? 'No queries match your search query.' : 'هیچ کوئری با عبارت جستجو شده یافت نشد.'}
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* VIEW 2: LIVE ACTIVE SESSIONS (pg_stat_activity) */}
      {subView === 'sessions' && overview && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSessionFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  sessionFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800/40 text-slate-400 hover:text-white'
                }`}
              >
                {isEn ? 'All Sessions' : 'همه نشست‌ها'} ({overview.activeSessions.length})
              </button>
              <button
                type="button"
                onClick={() => setSessionFilter('active')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  sessionFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-800/40 text-emerald-400'
                }`}
              >
                {isEn ? 'Active Only' : 'فقط فعال'} ({overview.connectionSummary.active})
              </button>
              <button
                type="button"
                onClick={() => setSessionFilter('idle_in_tx')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                  sessionFilter === 'idle_in_tx' ? 'bg-yellow-600 text-white' : 'bg-slate-800/40 text-yellow-400'
                }`}
              >
                {isEn ? 'Idle in Transaction' : 'معطل در تراکنش'} ({overview.connectionSummary.idleInTransaction})
              </button>
            </div>

            <span className="font-mono text-[11px] text-slate-500">
              {isEn ? `Retrieved at: ${new Date(overview.retrievedAt).toLocaleTimeString()}` : `دریافت در: ${new Date(overview.retrievedAt).toLocaleTimeString()}`}
            </span>
          </div>

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
                    <th className="py-3 px-3.5">{isEn ? 'PID' : 'شناسه'}</th>
                    <th className="py-3 px-3">{isEn ? 'State' : 'وضعیت'}</th>
                    <th className="py-3 px-3">{isEn ? 'User / Client' : 'کاربر و آدرس'}</th>
                    <th className="py-3 px-3">{isEn ? 'Wait Event' : 'رویداد معطلی'}</th>
                    <th className="py-3 px-3">{isEn ? 'Duration' : 'مدت زمان'}</th>
                    <th className="py-3 px-3.5">{isEn ? 'Current Query' : 'کوئری جاری'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {filteredSessions.length > 0 ? (
                    filteredSessions.map((s) => (
                      <tr key={s.pid} className="hover:bg-slate-800/20 transition">
                        <td className="py-2.5 px-3.5 font-bold text-cyan-400">
                          {s.pid}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                              s.state === 'active'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : s.state.includes('idle in transaction')
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'bg-slate-500/20 text-slate-400'
                            }`}
                          >
                            {s.state}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-sans text-xs">
                          <div className="font-semibold text-slate-200">{s.usename}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{s.clientAddr}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {s.waitEvent ? (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {s.waitEventType}:{s.waitEvent}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-amber-400">
                          {s.durationSeconds.toFixed(1)}s
                        </td>
                        <td className="py-2.5 px-3.5 max-w-sm truncate text-slate-300">
                          {s.query ? (
                            <span title={s.query}>{s.query}</span>
                          ) : (
                            <span className="text-slate-500 italic font-sans">{isEn ? 'idle' : 'غیرفعال'}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                        {isEn ? 'No sessions match criteria.' : 'نشستی یافت نشد.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: BACKGROUND WRITER & I/O */}
      {subView === 'bgwriter' && overview?.bgWriterStats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className={`p-4 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="text-xs text-slate-400 mb-1">
                {isEn ? 'Timed Checkpoints' : 'چک‌پوینت‌های زمان‌بندی‌شده'}
              </div>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {formatCompactNumber(overview.bgWriterStats.checkpointsTimed)}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {isEn
                  ? 'Checkpoints triggered regularly on checkpoint_timeout schedule (healthy).'
                  : 'چک‌پوینت‌هایی که به صورت استاندارد در موعد زمانی مقرر اجرا شده‌اند.'}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                overview.bgWriterStats.forcedCheckpointPercent > 20
                  ? isLightMode
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-amber-950/20 border-amber-500/30'
                  : isLightMode
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="text-xs text-slate-400 mb-1">
                {isEn ? 'Requested (Forced) Checkpoints' : 'چک‌پوینت‌های اضطراری (پر شدن WAL)'}
              </div>
              <div
                className={`text-xl font-bold font-mono ${
                  overview.bgWriterStats.forcedCheckpointPercent > 20 ? 'text-amber-400' : 'text-slate-200'
                }`}
              >
                {formatCompactNumber(overview.bgWriterStats.checkpointsReq)} ({overview.bgWriterStats.forcedCheckpointPercent}%)
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {overview.bgWriterStats.forcedCheckpointPercent > 20
                  ? isEn
                    ? 'Warning: High forced checkpoints indicate max_wal_size is too small.'
                    : 'هشدار: نرخ بالای چک‌پوینت اضطراری نشان‌دهنده کم بودن پارامتر max_wal_size است.'
                  : isEn
                  ? 'Healthy ratio (below 20%).'
                  : 'نسبت سالم (کمتر از ۲۰٪).'}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="text-xs text-slate-400 mb-1">
                {isEn ? 'Maxwritten Clean Stalls' : 'توقف‌های پاکسازی بافر'}
              </div>
              <div className="text-xl font-bold font-mono text-purple-400">
                {formatCompactNumber(overview.bgWriterStats.maxwrittenClean)}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {isEn
                  ? 'Times background writer stopped because it wrote too many buffers (bgwriter_lru_maxpages).'
                  : 'دفعاتی که نویسنده پس‌زمینه به سقف نوشتن بافر در هر چرخه رسید.'}
              </p>
            </div>
          </div>

          {/* Buffer allocation metrics table */}
          <div
            className={`p-5 rounded-2xl border ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <span>{isEn ? 'Buffer Pool Write & Allocation Breakdown' : 'جزئیات تخصیص و نوشتن بافرهای حافظه'}</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">
                  {isEn ? 'Buffers by Checkpoints:' : 'بافرهای نوشته‌شده در چک‌پوینت:'}
                </span>
                <span className="text-base font-bold text-cyan-400 mt-1 block">
                  {formatCompactNumber(overview.bgWriterStats.buffersCheckpoint)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">
                  {isEn ? 'Buffers by BgWriter:' : 'بافرهای نوشته‌شده توسط BgWriter:'}
                </span>
                <span className="text-base font-bold text-emerald-400 mt-1 block">
                  {formatCompactNumber(overview.bgWriterStats.buffersClean)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">
                  {isEn ? 'Buffers by Backends:' : 'بافرهای نوشته‌شده توسط نشست‌ها:'}
                </span>
                <span className="text-base font-bold text-amber-400 mt-1 block">
                  {formatCompactNumber(overview.bgWriterStats.buffersBackend)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">
                  {isEn ? 'Buffers Allocated:' : 'کل بافرهای تخصیص‌یافته:'}
                </span>
                <span className="text-base font-bold text-purple-400 mt-1 block">
                  {formatCompactNumber(overview.bgWriterStats.buffersAlloc)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESET CONFIRMATION MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">
                  {isEn ? 'Reset pg_stat_statements Statistics' : 'بازنشانی آمار کوئری‌ها'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <p className="text-slate-400">
                {isEn
                  ? 'Are you sure you want to call pg_stat_statements_reset()? This will discard all aggregated query counts, execution durations, and cache telemetry back to zero.'
                  : 'آیا از اجرای pg_stat_statements_reset() اطمینان دارید؟ با این کار تمامی آمارهای تجمعی تعداد فراخوانی، زمان‌های اجرا و کش کوئری‌ها صفر خواهد شد.'}
              </p>

              {resetResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    resetResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {resetResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{resetResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={resetting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={handleResetStats}
                disabled={resetting}
                className={`px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg transition cursor-pointer flex items-center gap-1.5 ${
                  resetting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {resetting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Reset Now' : 'بازنشانی فوری'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
