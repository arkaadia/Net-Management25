import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ScrollText,
  FileText,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Clock,
  HardDrive,
  Copy,
  Check,
  Download,
  Settings,
  ChevronDown,
  ChevronRight,
  Database,
  User,
  Sliders,
  Terminal,
  Activity,
  Zap,
  Info,
  ExternalLink,
  X,
  FileCode,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresLogsOverview,
  PostgresLogEntry,
  PostgresLogSeverity,
  PostgresLoggingSettings,
  PostgresLogFileInfo,
} from '../../types';
import {
  fetchRemoteServerPostgresLogs,
  fetchRemoteServerPostgresLoggingSettings,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresLogsExplorerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
  onNavigateToSqlStudio?: (sql: string) => void;
}

export const PostgresLogsExplorerTab: React.FC<PostgresLogsExplorerTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
  onNavigateToSqlStudio,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PostgresLogsOverview | null>(null);

  // Auto-refresh
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Filters & Options
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [maxLines, setMaxLines] = useState<number>(500);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'errors' | 'auth' | 'slow'>('all');

  // Detail Modal & Settings Modal
  const [selectedEntry, setSelectedEntry] = useState<PostgresLogEntry | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Clipboard
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Load logs
  const loadLogs = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const res = await fetchRemoteServerPostgresLogs(server.id, {
          database: initialDatabase || server.postgres_database || 'postgres',
          logFileName: selectedFile || undefined,
          maxLines,
          severity: selectedSeverity !== 'ALL' ? (selectedSeverity as PostgresLogSeverity) : undefined,
          searchTerm: searchTerm.trim() || undefined,
        });

        if (res.success && res.data) {
          setOverview(res.data);
          // If no file was selected yet and we received a current file, update state
          if (!selectedFile && res.data.currentLogFile) {
            setSelectedFile(res.data.currentLogFile);
          }
        } else {
          setError(
            isEn
              ? res.error || 'Failed to retrieve PostgreSQL server logs'
              : res.errorFa || res.error || 'خطا در دریافت لاگ‌های سرور PostgreSQL'
          );
        }
      } catch (err: any) {
        setError(err.message || 'Network error fetching PostgreSQL logs');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [server.id, initialDatabase, server.postgres_database, selectedFile, maxLines, selectedSeverity, searchTerm, isEn]
  );

  useEffect(() => {
    loadLogs(true);
  }, [loadLogs]);

  // Handle auto-refresh interval
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (autoRefreshInterval > 0) {
      refreshTimerRef.current = setInterval(() => {
        loadLogs(false);
      }, autoRefreshInterval * 1000);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefreshInterval, loadLogs]);

  // Quick filter changes
  const handleQuickFilterChange = (filterType: 'all' | 'errors' | 'auth' | 'slow') => {
    setQuickFilter(filterType);
    if (filterType === 'all') {
      setSelectedSeverity('ALL');
      setSearchTerm('');
    } else if (filterType === 'errors') {
      setSelectedSeverity('ERROR');
      setSearchTerm('');
    } else if (filterType === 'auth') {
      setSelectedSeverity('ALL');
      setSearchTerm('authentication');
    } else if (filterType === 'slow') {
      setSelectedSeverity('ALL');
      setSearchTerm('duration:');
    }
  };

  // Filtered entries in memory (if quick filters apply on top)
  const displayEntries = useMemo(() => {
    if (!overview || !overview.entries) return [];
    let list = overview.entries;

    if (quickFilter === 'errors') {
      list = list.filter((e) => ['ERROR', 'FATAL', 'PANIC'].includes(e.severity));
    } else if (quickFilter === 'auth') {
      list = list.filter(
        (e) =>
          e.raw.toLowerCase().includes('password authentication failed') ||
          e.raw.toLowerCase().includes('no pg_hba.conf entry') ||
          e.sqlstate === '28P01' ||
          e.sqlstate === '28000'
      );
    } else if (quickFilter === 'slow') {
      list = list.filter((e) => e.raw.toLowerCase().includes('duration:') || e.raw.toLowerCase().includes('statement:'));
    }

    return list;
  }, [overview, quickFilter]);

  // Export handlers
  const handleExportText = () => {
    if (!displayEntries.length) return;
    const content = displayEntries.map((e) => e.raw).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postgres-logs-${server.name || server.ip}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    if (!displayEntries.length) return;
    const content = JSON.stringify(displayEntries, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postgres-logs-${server.name || server.ip}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSeverityBadgeClass = (sev: PostgresLogSeverity) => {
    switch (sev) {
      case 'PANIC':
      case 'FATAL':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold';
      case 'ERROR':
        return 'bg-red-500/20 text-red-400 border-red-500/30 font-semibold';
      case 'WARNING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'NOTICE':
      case 'INFO':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'STATEMENT':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30 font-mono';
      case 'DETAIL':
      case 'HINT':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'LOG':
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600/40';
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isLightMode
            ? 'bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-white border-amber-200 shadow-sm'
            : 'bg-gradient-to-r from-amber-950/40 via-orange-950/20 to-slate-900 border-amber-500/20 shadow-md'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                isLightMode
                  ? 'bg-amber-100 border-amber-300 text-amber-700 shadow-xs'
                  : 'bg-amber-950/80 border-amber-500/40 text-amber-400'
              }`}
            >
              <ScrollText className="w-6 h-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{isEn ? 'Server Logs Explorer & Log Analyzer' : 'کاوشگر و تحلیلگر لاگ‌های سرور PostgreSQL'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Postgres Server Logs & Audit' : 'لاگ‌های سرور و حسابرسی دیتابیس'}
                    infoWhatEn="Live inspection and multi-line parsing of PostgreSQL log files, error codes (SQLSTATE), authentication failures, slow queries, and active logging parameters."
                    infoWhatFa="پایش بلادرنگ و تجزیه چندخطی لاگ‌های PostgreSQL، کدهای خطای SQLSTATE، خطاهای احراز هویت، کوئری‌های کند و پارامترهای فعال لاگینگ."
                    infoWhyEn="Identifies fatal crashes, deadlocks, unauthorized access attempts, missing indexes, and slow statements without requiring manual SSH terminal logins."
                    infoWhyFa="شناسایی سریع خطاهای بحرانی، بن‌بست‌ها (Deadlock)، تلاش‌های نفوذ ناموفق، ایندکس‌های گمشده و کوئری‌های کند بدون نیاز به لاگین دستی در ترمینال سرور."
                    infoExampleEn="Search for SQLSTATE 28P01 (auth failed) or filter by FATAL/PANIC severity to diagnose unexpected backend connection dropouts."
                    infoExampleFa="جستجوی کد خطای 28P01 برای خطاهای رمز عبور یا فیلتر بر اساس FATAL جهت بررسی علت قطعی ارتباط سرویس‌ها با دیتابیس."
                  />
                </h3>

                {overview && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                      overview.source === 'database_catalog'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : overview.source === 'filesystem_ssh'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                        : overview.source === 'systemd_journal'
                        ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                        : 'bg-slate-700/50 text-slate-300 border-slate-600/40'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    {overview.source === 'database_catalog'
                      ? isEn
                        ? 'Live Catalog (SQL)'
                        : 'کاتالوگ دیتابیس (SQL)'
                      : overview.source === 'filesystem_ssh'
                      ? isEn
                        ? 'Filesystem Stream'
                        : 'جریان فایل‌سیستم'
                      : overview.source === 'systemd_journal'
                      ? isEn
                        ? 'Systemd Journal'
                        : 'ژورنال سیستم‌دی'
                      : isEn
                      ? 'Empty Source'
                      : 'منبع خالی'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Real-time telemetry and structured parsing for PostgreSQL server events and audit logs.'
                  : 'تلمتری لحظه‌ای و پالایش ساختاریافته رویدادها، خطاها و حسابرسی سرور PostgreSQL.'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-Refresh Select */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 hidden sm:inline">{isEn ? 'Auto:' : 'بروزرسانی:'}</span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className={`text-xs px-2.5 py-1.5 rounded-xl border font-mono transition cursor-pointer ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
                    : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-600'
                }`}
              >
                <option value={0}>{isEn ? 'Manual' : 'دستی'}</option>
                <option value={2}>{isEn ? 'Every 2s (Live)' : 'هر ۲ ثانیه (زنده)'}</option>
                <option value={5}>{isEn ? 'Every 5s' : 'هر ۵ ثانیه'}</option>
                <option value={10}>{isEn ? 'Every 10s' : 'هر ۱۰ ثانیه'}</option>
                <option value={30}>{isEn ? 'Every 30s' : 'هر ۳۰ ثانیه'}</option>
              </select>
            </div>

            {/* Logging Settings Button */}
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title={isEn ? 'Logging Settings' : 'تنظیمات لاگینگ'}
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{isEn ? 'Parameters' : 'پارامترها'}</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => loadLogs(true)}
              disabled={loading}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">{isEn ? 'Refresh' : 'تازه سازی'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ERROR ALERT */}
      {error && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold">{isEn ? 'Log Retrieval Error' : 'خطا در دریافت لاگ‌ها'}</p>
            <p className="mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* TOP KPI STATS CARDS */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {/* Card 1: Total Parsed Lines */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Total Entries' : 'کل سطرها'}</span>
              <FileText className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-bold font-mono text-blue-400">{overview.stats.total}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
              {overview.currentLogFile || (isEn ? 'Standard Log' : 'لاگ استاندارد')}
            </div>
          </div>

          {/* Card 2: Fatal / Panic Errors */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              overview.stats.fatalCount > 0
                ? isLightMode
                  ? 'bg-rose-50/80 border-rose-300'
                  : 'bg-rose-950/30 border-rose-800/60'
                : isLightMode
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Fatal / Panic' : 'بحرانی (Fatal)'}</span>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div
              className={`text-lg font-bold font-mono ${
                overview.stats.fatalCount > 0 ? 'text-rose-500 font-extrabold' : 'text-slate-400'
              }`}
            >
              {overview.stats.fatalCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {overview.stats.fatalCount > 0
                ? isEn
                  ? 'Critical attention needed'
                  : 'نیازمند بررسی فوری'
                : isEn
                ? 'No fatal events'
                : 'بدون خطای بحرانی'}
            </div>
          </div>

          {/* Card 3: Standard Errors */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Errors' : 'خطاها (Error)'}</span>
              <Activity className="w-3.5 h-3.5 text-red-400" />
            </div>
            <div
              className={`text-lg font-bold font-mono ${
                overview.stats.errorCount > 0 ? 'text-red-400' : 'text-slate-400'
              }`}
            >
              {overview.stats.errorCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isEn ? 'SQL / Query exceptions' : 'استثناهای کوئری و SQL'}
            </div>
          </div>

          {/* Card 4: Warnings */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Warnings' : 'هشدارها (Warn)'}</span>
              <Activity className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div
              className={`text-lg font-bold font-mono ${
                overview.stats.warningCount > 0 ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {overview.stats.warningCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isEn ? 'Notices & non-fatal' : 'هشدارهای غیربحرانی'}
            </div>
          </div>

          {/* Card 5: Auth Failures */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              overview.stats.authFailuresCount > 0
                ? isLightMode
                  ? 'bg-amber-50/80 border-amber-300'
                  : 'bg-amber-950/30 border-amber-800/60'
                : isLightMode
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Auth Failures' : 'خطاهای لاگین'}</span>
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div
              className={`text-lg font-bold font-mono ${
                overview.stats.authFailuresCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              {overview.stats.authFailuresCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isEn ? 'Password / HBA denials' : 'رد دسترسی یا رمز اشتباه'}
            </div>
          </div>

          {/* Card 6: Slow Queries / Statements */}
          <div
            className={`p-3 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Slow Queries' : 'کوئری‌های کند'}</span>
              <Clock className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div
              className={`text-lg font-bold font-mono ${
                overview.stats.slowQueriesCount > 0 ? 'text-purple-400 font-bold' : 'text-slate-400'
              }`}
            >
              {overview.stats.slowQueriesCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isEn ? 'Logged statement events' : 'رویدادهای زمانی ثبت‌شده'}
            </div>
          </div>
        </div>
      )}

      {/* CONTROLS: FILE SELECTOR, LIMITS, SEARCH & QUICK FILTERS */}
      <div
        className={`p-4 rounded-2xl border space-y-3 ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/40 border-slate-800'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* File selector dropdown & Max Lines */}
          <div className="flex flex-wrap items-center gap-2">
            {overview && overview.availableLogFiles.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">{isEn ? 'Log File:' : 'فایل لاگ:'}</span>
                <select
                  value={selectedFile}
                  onChange={(e) => {
                    setSelectedFile(e.target.value);
                  }}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border font-mono transition cursor-pointer max-w-[240px] truncate ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-700'
                      : 'bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  {overview.availableLogFiles.map((f) => (
                    <option key={f.filename} value={f.filename}>
                      {f.filename} ({f.sizePretty})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">{isEn ? 'Lines:' : 'تعداد سطر:'}</span>
              <select
                value={maxLines}
                onChange={(e) => setMaxLines(Number(e.target.value))}
                className={`text-xs px-2.5 py-1.5 rounded-xl border font-mono transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-700'
                    : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={handleExportText}
              disabled={displayEntries.length === 0}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 text-slate-300 hover:text-white bg-slate-800 border-slate-700 hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
              title={isEn ? 'Export visible logs as .log file' : 'خروجی متنی فایل لاگ'}
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>{isEn ? '.LOG Export' : 'خروجی LOG'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={displayEntries.length === 0}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 text-slate-300 hover:text-white bg-slate-800 border-slate-700 hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
              title={isEn ? 'Export visible logs as JSON' : 'خروجی ساختاریافته JSON'}
            >
              <Download className="w-3.5 h-3.5 text-purple-400" />
              <span>{isEn ? '.JSON Export' : 'خروجی JSON'}</span>
            </button>
          </div>
        </div>

        {/* Search input & Quick filter pills */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-700/30">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                isEn
                  ? 'Search by text, SQLSTATE (e.g. 42P01), PID, database, query...'
                  : 'جستجو بر اساس متن، کد خطا، شناسه PID، نام دیتابیس یا کوئری...'
              }
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border font-sans transition ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-amber-500'
                  : 'bg-slate-900/80 border-slate-800 text-slate-200 placeholder-slate-500 focus:border-amber-500'
              }`}
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => handleQuickFilterChange('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                quickFilter === 'all'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white'
              }`}
            >
              {isEn ? 'All' : 'همه'}
            </button>
            <button
              type="button"
              onClick={() => handleQuickFilterChange('errors')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                quickFilter === 'errors'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-800/60 text-rose-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{isEn ? 'Errors & Fatal' : 'خطاها و بحرانی'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFilterChange('auth')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                quickFilter === 'auth'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-800/60 text-amber-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>{isEn ? 'Auth Failures' : 'خطاهای ورود'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFilterChange('slow')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                quickFilter === 'slow'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-800/60 text-purple-400 hover:text-white'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{isEn ? 'Slow Queries' : 'کوئری‌های کند'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* LOG STREAM TABLE / VIEWER */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-slate-700/30 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">
              {isEn ? 'Log Records' : 'رکوردهای لاگ'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400">
              {displayEntries.length} {isEn ? 'matching' : 'مورد'}
            </span>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
            <span>
              {overview?.retrievedAt ? new Date(overview.retrievedAt).toLocaleTimeString() : ''}
            </span>
          </div>
        </div>

        {displayEntries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ScrollText className="w-10 h-10 mx-auto text-slate-600 mb-2 opacity-50" />
            <p className="font-semibold text-sm">
              {isEn ? 'No Log Entries Found' : 'هیچ رکورد لاگی یافت نشد'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {isEn
                ? 'Try adjusting your search criteria, selecting another log file, or verifying logging_collector settings.'
                : 'معیارهای جستجو را تغییر دهید یا بررسی کنید که پارامتر logging_collector روی سرور فعال باشد.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50 max-h-[620px] overflow-y-auto font-mono text-[11px]">
            {displayEntries.map((e) => (
              <div
                key={e.id}
                onClick={() => setSelectedEntry(e)}
                className={`p-2.5 sm:px-3.5 sm:py-2.5 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 cursor-pointer ${
                  isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  {/* Severity badge */}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] border shrink-0 ${getSeverityBadgeClass(
                      e.severity
                    )}`}
                  >
                    {e.severity}
                  </span>

                  {/* Timestamp */}
                  <span className="text-slate-400 shrink-0 select-none hidden md:inline">
                    {e.timestamp}
                  </span>

                  {/* PID / User / DB */}
                  {(e.pid || e.user || e.database) && (
                    <span className="text-slate-500 shrink-0 hidden lg:inline">
                      [{e.pid ? `PID:${e.pid} ` : ''}
                      {e.user ? `${e.user}@` : ''}
                      {e.database || ''}]
                    </span>
                  )}

                  {/* SQLSTATE Pill */}
                  {e.sqlstate && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-950/60 border border-red-500/40 text-red-300 font-bold shrink-0">
                      {e.sqlstate}
                    </span>
                  )}

                  {/* Message */}
                  <div className="truncate text-slate-200 font-sans flex-1">
                    <span>{e.message}</span>
                    {e.query && (
                      <span className="text-purple-400 ml-2 font-mono text-[11px] opacity-90">
                        [SQL: {e.query.slice(0, 80)}...]
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={(evt) => {
                      evt.stopPropagation();
                      handleCopy(e.raw, e.id);
                    }}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition"
                    title={isEn ? 'Copy line' : 'کپی سطر'}
                  >
                    {copiedKey === e.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL 1: LOG ENTRY DETAIL DRAWER */}
      {selectedEntry && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-3xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded text-xs border ${getSeverityBadgeClass(
                    selectedEntry.severity
                  )}`}
                >
                  {selectedEntry.severity}
                </span>
                <h4 className="font-bold text-sm">
                  {isEn ? 'Log Event Inspection' : 'بررسی رویداد و جزئیات لاگ'}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Meta attributes grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className="text-[10px] text-slate-400">{isEn ? 'Timestamp' : 'زمان'}</div>
                <div className="text-slate-200 truncate mt-0.5">{selectedEntry.timestamp}</div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className="text-[10px] text-slate-400">{isEn ? 'Process PID' : 'شناسه فرآیند (PID)'}</div>
                <div className="text-emerald-400 mt-0.5">{selectedEntry.pid || 'N/A'}</div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className="text-[10px] text-slate-400">{isEn ? 'User & DB' : 'کاربر و دیتابیس'}</div>
                <div className="text-cyan-400 truncate mt-0.5">
                  {selectedEntry.user || 'none'}@{selectedEntry.database || 'none'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className="text-[10px] text-slate-400">{isEn ? 'SQLSTATE Code' : 'کد خطای SQLSTATE'}</div>
                <div className="text-rose-400 font-bold mt-0.5">
                  {selectedEntry.sqlstate || 'N/A'}
                </div>
              </div>
            </div>

            {/* Primary message */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">
                {isEn ? 'Primary Message:' : 'متن اصلی پیام:'}
              </label>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 leading-relaxed whitespace-pre-wrap break-all">
                {selectedEntry.message}
              </div>
            </div>

            {/* Detail / Hint / Context if present */}
            {selectedEntry.detail && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-cyan-400">
                  {isEn ? 'DETAIL:' : 'جزئیات تکمیلی (Detail):'}
                </label>
                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs font-mono text-cyan-200 leading-relaxed whitespace-pre-wrap">
                  {selectedEntry.detail}
                </div>
              </div>
            )}

            {selectedEntry.hint && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-amber-400">
                  {isEn ? 'HINT:' : 'راهنما (Hint):'}
                </label>
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs font-mono text-amber-200 leading-relaxed whitespace-pre-wrap">
                  {selectedEntry.hint}
                </div>
              </div>
            )}

            {selectedEntry.context && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-blue-400">
                  {isEn ? 'CONTEXT:' : 'زمینه اجرا (Context):'}
                </label>
                <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs font-mono text-blue-200 leading-relaxed whitespace-pre-wrap">
                  {selectedEntry.context}
                </div>
              </div>
            )}

            {/* Statement / Query with action to SQL Studio */}
            {selectedEntry.query && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Executed Statement / Query:' : 'دستور SQL اجرا شده:'}</span>
                  </label>

                  {onNavigateToSqlStudio && (
                    <button
                      type="button"
                      onClick={() => {
                        const q = selectedEntry.query;
                        setSelectedEntry(null);
                        if (q) onNavigateToSqlStudio(q);
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>{isEn ? 'Open in SQL Studio' : 'باز کردن در SQL Studio'}</span>
                    </button>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs font-mono text-purple-200 leading-relaxed whitespace-pre-wrap">
                  {selectedEntry.query}
                </div>
              </div>
            )}

            {/* Raw Log Line */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-400">
                  {isEn ? 'Full Raw Log Record:' : 'رکورد کامل لاگ خام:'}
                </label>
                <button
                  type="button"
                  onClick={() => handleCopy(selectedEntry.raw, 'modal-raw')}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'modal-raw' ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedKey === 'modal-raw' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-black/60 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                {selectedEntry.raw}
              </pre>
            </div>

            {/* Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: LOGGING PARAMETERS & TUNING ADVISOR */}
      {isSettingsModalOpen && overview && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <h4 className="font-bold text-sm">
                  {isEn ? 'PostgreSQL Logging Parameters & Diagnostics' : 'پارامترهای پیکربندی و عیب‌یابی لاگینگ'}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'logging_collector' : 'کالکتور لاگ (logging_collector)'}</span>
                <div className="font-mono font-bold flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      overview.settings.loggingCollector ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                  />
                  <span className={overview.settings.loggingCollector ? 'text-emerald-400' : 'text-rose-400'}>
                    {overview.settings.loggingCollector ? 'ON (Collecting)' : 'OFF (StdErr/Syslog)'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'log_destination' : 'مقصد لاگ (log_destination)'}</span>
                <div className="font-mono text-cyan-400 font-bold">
                  {overview.settings.logDestination}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'log_directory' : 'پوشه لاگ (log_directory)'}</span>
                <div className="font-mono text-slate-200 truncate">
                  {overview.settings.logDirectory}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'log_filename' : 'فرمت فایل (log_filename)'}</span>
                <div className="font-mono text-slate-200 truncate">
                  {overview.settings.logFilename}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'log_min_messages' : 'حداقل سطح پیام'}</span>
                <div className="font-mono text-amber-400 font-bold">
                  {overview.settings.logMinMessages}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'log_min_duration_statement' : 'آستانه کوئری کند (ms)'}</span>
                <div className="font-mono text-purple-400 font-bold">
                  {overview.settings.logMinDurationStatement === -1
                    ? isEn
                      ? 'Disabled (-1)'
                      : 'غیرفعال (-1)'
                    : `${overview.settings.logMinDurationStatement} ms`}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'log_connections / disconn' : 'ثبت اتصال / قطع اتصال'}</span>
                <div className="font-mono text-slate-200">
                  {overview.settings.logConnections ? 'Conn: ON' : 'Conn: OFF'} /{' '}
                  {overview.settings.logDisconnections ? 'Disconn: ON' : 'Disconn: OFF'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1">
                <span className="text-slate-400">{isEn ? 'log_line_prefix' : 'پیشوند سطر لاگ'}</span>
                <div className="font-mono text-slate-200 truncate" title={overview.settings.logLinePrefix}>
                  {overview.settings.logLinePrefix}
                </div>
              </div>
            </div>

            {/* Best practices recommendation card */}
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-1.5 ${
                isLightMode ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/30 border-amber-600/30 text-amber-200'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-400" />
                <span>{isEn ? 'Production Logging Recommendations:' : 'توصیه‌های کاربردی برای سرورهای عملیاتی:'}</span>
              </div>
              <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>
                  {isEn
                    ? 'Enable logging_collector = on in postgresql.conf to allow rotating logs inside log_directory.'
                    : 'فعال‌سازی logging_collector = on در فایل postgresql.conf برای تفکیک روزانه فایل‌های لاگ.'}
                </li>
                <li>
                  {isEn
                    ? 'Set log_min_duration_statement = 1000 to automatically record any query taking longer than 1 second.'
                    : 'تنظیم log_min_duration_statement = 1000 جهت ثبت خودکار کوئری‌های با اجرای بیش از ۱ ثانیه.'}
                </li>
                <li>
                  {isEn
                    ? 'Set log_line_prefix = \'%m [%p] %q%u@%d \' to ensure timestamp, PID, user, and database name are captured.'
                    : 'تنظیم پیشوند لاگ به فرمت استاندارد \'%m [%p] %q%u@%d \' برای ردگیری دقیق کاربر و دیتابیس.'}
                </li>
              </ul>
            </div>

            {/* Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
