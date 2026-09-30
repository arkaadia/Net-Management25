import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Activity,
  Cpu,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Users,
  Server,
  Zap,
  Play,
  Pause,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Copy,
  Check,
  ShieldAlert,
  Flame,
  FileCode,
  Terminal,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlProcessItem,
  MysqlProcesslistResponse,
  MysqlKillType,
  MysqlKillProcessResult,
} from '../../types';
import {
  fetchRemoteServerMysqlProcesslist,
  killRemoteServerMysqlProcess,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlProcesslistTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  onRefreshOverview?: () => void;
}

type SortField = 'id' | 'user' | 'host' | 'db' | 'command' | 'time' | 'state';
type SortOrder = 'asc' | 'desc';

export const MysqlProcesslistTab: React.FC<MysqlProcesslistTabProps> = ({
  server,
  isLightMode,
  isEn,
  onRefreshOverview,
}) => {
  // State
  const [loading, setLoading] = useState(false);
  const [processes, setProcesses] = useState<MysqlProcessItem[]>([]);
  const [currentConnectionId, setCurrentConnectionId] = useState<number | undefined>();
  const [summary, setSummary] = useState({
    total: 0,
    activeQueries: 0,
    sleeping: 0,
    locked: 0,
    maxDurationSeconds: 0,
  });
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    messageFa: string;
  } | null>(null);

  // Auto-refresh timer
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5); // 5 seconds default
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState<number>(5);
  const timerRef = useRef<any>(null);
  const countdownRef = useRef<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dbFilter, setDbFilter] = useState<string>('all');
  const [commandFilter, setCommandFilter] = useState<string>('all');
  const [hideSleep, setHideSleep] = useState<boolean>(false);
  const [minDuration, setMinDuration] = useState<number>(0);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Expanded query info modal / row
  const [selectedProcessForSql, setSelectedProcessForSql] = useState<MysqlProcessItem | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // Kill Confirmation Dialog
  const [killModal, setKillModal] = useState<{
    isOpen: boolean;
    process: MysqlProcessItem | null;
    type: MysqlKillType;
    killing: boolean;
  }>({
    isOpen: false,
    process: null,
    type: 'connection',
    killing: false,
  });

  // Fetch processlist from backend
  const fetchProcesslist = useCallback(
    async (quiet = false) => {
      if (!server?.id) return;
      if (!quiet) setLoading(true);

      try {
        const res: MysqlProcesslistResponse = await fetchRemoteServerMysqlProcesslist(server.id);
        if (res.success && res.processes) {
          setProcesses(res.processes);
          setCurrentConnectionId(res.currentConnectionId);
          if (res.summary) {
            setSummary(res.summary);
          }
        } else if (res.error) {
          setFeedback({
            type: 'error',
            message: res.error,
            messageFa: res.errorFa || 'خطا در دریافت لیست پروسس‌ها',
          });
        }
      } catch (err: any) {
        setFeedback({
          type: 'error',
          message: err.message || 'Network error fetching processlist',
          messageFa: 'خطای شبکه در دریافت لیست پروسس‌های MySQL',
        });
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [server?.id]
  );

  // Initial load
  useEffect(() => {
    fetchProcesslist();
  }, [fetchProcesslist]);

  // Handle auto-refresh interval
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (autoRefreshInterval <= 0) return;

    setAutoRefreshCountdown(autoRefreshInterval);

    countdownRef.current = setInterval(() => {
      setAutoRefreshCountdown((prev) => (prev > 1 ? prev - 1 : autoRefreshInterval));
    }, 1000);

    timerRef.current = setInterval(() => {
      fetchProcesslist(true);
    }, autoRefreshInterval * 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefreshInterval, fetchProcesslist]);

  // Distinct lists for dropdown filters
  const distinctUsers = useMemo(() => {
    const set = new Set<string>();
    processes.forEach((p) => {
      if (p.user) set.add(p.user);
    });
    return Array.from(set).sort();
  }, [processes]);

  const distinctDbs = useMemo(() => {
    const set = new Set<string>();
    processes.forEach((p) => {
      if (p.db) set.add(p.db);
    });
    return Array.from(set).sort();
  }, [processes]);

  const distinctCommands = useMemo(() => {
    const set = new Set<string>();
    processes.forEach((p) => {
      if (p.command) set.add(p.command);
    });
    return Array.from(set).sort();
  }, [processes]);

  // Filtered & Sorted Processes
  const filteredAndSortedProcesses = useMemo(() => {
    let result = [...processes];

    // Filter hide sleep
    if (hideSleep) {
      result = result.filter((p) => p.command.toLowerCase() !== 'sleep');
    }

    // Filter user
    if (userFilter !== 'all') {
      result = result.filter((p) => p.user.toLowerCase() === userFilter.toLowerCase());
    }

    // Filter db
    if (dbFilter !== 'all') {
      result = result.filter((p) => p.db?.toLowerCase() === dbFilter.toLowerCase());
    }

    // Filter command
    if (commandFilter !== 'all') {
      result = result.filter((p) => p.command.toLowerCase() === commandFilter.toLowerCase());
    }

    // Filter min duration
    if (minDuration > 0) {
      result = result.filter((p) => p.time >= minDuration);
    }

    // Search term (query info, host, or user)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.user.toLowerCase().includes(q) ||
          p.host.toLowerCase().includes(q) ||
          (p.db && p.db.toLowerCase().includes(q)) ||
          (p.info && p.info.toLowerCase().includes(q)) ||
          (p.state && p.state.toLowerCase().includes(q)) ||
          p.id.toString().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    processes,
    hideSleep,
    userFilter,
    dbFilter,
    commandFilter,
    minDuration,
    searchTerm,
    sortField,
    sortOrder,
  ]);

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc'); // Default descending
    }
  };

  // Open kill confirmation dialog
  const openKillDialog = (process: MysqlProcessItem, type: MysqlKillType) => {
    setKillModal({
      isOpen: true,
      process,
      type,
      killing: false,
    });
  };

  // Confirm kill execution
  const handleConfirmKill = async () => {
    if (!server?.id || !killModal.process) return;

    setKillModal((prev) => ({ ...prev, killing: true }));
    setFeedback(null);

    try {
      const res: MysqlKillProcessResult = await killRemoteServerMysqlProcess(
        server.id,
        killModal.process.id,
        killModal.type
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message,
          messageFa: res.messageFa,
        });
        setKillModal({ isOpen: false, process: null, type: 'connection', killing: false });
        // Refresh processlist immediately
        fetchProcesslist(true);
        if (onRefreshOverview) onRefreshOverview();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message,
          messageFa: res.errorFa || res.messageFa || 'خطا در متوقف‌سازی پروسس',
        });
        setKillModal((prev) => ({ ...prev, killing: false }));
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error killing process',
        messageFa: 'خطای شبکه در ارسال دستور متوقف‌سازی',
      });
      setKillModal((prev) => ({ ...prev, killing: false }));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- */}
      {/* 1. METRICS OVERVIEW CARDS                            */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total Connections */}
        <div
          className={`p-3 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans font-bold uppercase">
              {isEn ? 'Total Threads' : 'کل اتصالات'}
            </div>
            <div className="text-lg font-bold font-mono text-blue-400">{summary.total}</div>
          </div>
        </div>

        {/* Active Queries */}
        <div
          className={`p-3 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans font-bold uppercase">
              {isEn ? 'Active Queries' : 'کوئری‌های فعال'}
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400">{summary.activeQueries}</div>
          </div>
        </div>

        {/* Sleeping Threads */}
        <div
          className={`p-3 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-slate-500/15 text-slate-400 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans font-bold uppercase">
              {isEn ? 'Sleeping / Idle' : 'اتصالات خوابیده'}
            </div>
            <div className="text-lg font-bold font-mono text-slate-300">{summary.sleeping}</div>
          </div>
        </div>

        {/* Locked Threads */}
        <div
          className={`p-3 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              summary.locked > 0
                ? 'bg-rose-500/20 text-rose-400 animate-bounce'
                : 'bg-slate-500/15 text-slate-400'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans font-bold uppercase">
              {isEn ? 'Waiting Locks' : 'منتظر قفل'}
            </div>
            <div
              className={`text-lg font-bold font-mono ${
                summary.locked > 0 ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {summary.locked}
            </div>
          </div>
        </div>

        {/* Max Duration */}
        <div
          className={`p-3 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans font-bold uppercase">
              {isEn ? 'Longest Query' : 'طولانی‌ترین'}
            </div>
            <div className="text-lg font-bold font-mono text-orange-400">
              {summary.maxDurationSeconds}s
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs transition animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : 'bg-rose-950/40 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{isEn ? feedback.message : feedback.messageFa}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:opacity-70 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. CONTROLS, AUTO-REFRESH & FILTER TOOLBAR           */}
      {/* ---------------------------------------------------- */}
      <div
        className={`p-3.5 rounded-xl border flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
        }`}
      >
        {/* Left: Search & Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Search box */}
          <div className="relative min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={isEn ? 'Filter SQL, Host, User...' : 'جستجوی کوئری، هاست، کاربر...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-hidden transition ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 focus:border-orange-500'
                  : 'bg-slate-950 border-white/10 text-slate-200 focus:border-orange-500'
              }`}
            />
          </div>

          {/* User Filter */}
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden transition cursor-pointer font-mono ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Users' : 'همه کاربران'}</option>
            {distinctUsers.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {/* DB Filter */}
          <select
            value={dbFilter}
            onChange={(e) => setDbFilter(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden transition cursor-pointer font-mono ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Databases' : 'همه دیتابیس‌ها'}</option>
            {distinctDbs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Command Filter */}
          <select
            value={commandFilter}
            onChange={(e) => setCommandFilter(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden transition cursor-pointer font-mono ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Commands' : 'همه دستورات'}</option>
            {distinctCommands.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Duration threshold */}
          <select
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden transition cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <option value={0}>{isEn ? 'Any Duration' : 'تمام زمان‌ها'}</option>
            <option value={1}>{isEn ? '> 1s duration' : 'بیشتر از ۱ ثانیه'}</option>
            <option value={5}>{isEn ? '> 5s duration' : 'بیشتر از ۵ ثانیه'}</option>
            <option value={10}>{isEn ? '> 10s duration' : 'بیشتر از ۱۰ ثانیه'}</option>
            <option value={60}>{isEn ? '> 60s long running' : 'بیشتر از ۱ دقیقه'}</option>
          </select>

          {/* Hide sleep toggle */}
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideSleep}
              onChange={(e) => setHideSleep(e.target.checked)}
              className="rounded border-slate-700 text-orange-600 focus:ring-0 cursor-pointer"
            />
            <span>{isEn ? 'Hide Sleep' : 'مخفی‌سازی اتصالات بیکار'}</span>
          </label>
        </div>

        {/* Right: Auto-Refresh Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Auto Refresh selector */}
          <div className="flex items-center gap-1.5 bg-black/10 px-2 py-1 rounded-lg border border-white/5">
            <Clock className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[11px] text-slate-400">{isEn ? 'Auto:' : 'تازه‌سازی خودکار:'}</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className={`px-2 py-0.5 rounded text-[11px] border outline-hidden transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-white/10 text-slate-200'
              }`}
            >
              <option value={0}>{isEn ? 'Off' : 'غیرفعال'}</option>
              <option value={1}>1s</option>
              <option value={2}>2s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
            </select>

            {autoRefreshInterval > 0 && (
              <span className="text-[10px] font-mono text-orange-400 font-bold w-4 text-center">
                {autoRefreshCountdown}s
              </span>
            )}
          </div>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={() => fetchProcesslist(false)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 text-xs font-medium transition cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-400' : ''}`} />
            <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. PROCESSLIST DATA TABLE                            */}
      {/* ---------------------------------------------------- */}
      <div
        className={`rounded-xl border overflow-hidden transition ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/80 border-white/10'
        }`}
      >
        <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 shadow-xs">
              <tr
                className={`border-b text-[11px] font-bold tracking-wider select-none ${
                  isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-slate-950 border-white/10 text-slate-300'
                }`}
              >
                {/* ID Column */}
                <th
                  className="py-3 px-3 w-20 cursor-pointer hover:text-orange-400 transition"
                  onClick={() => handleSort('id')}
                >
                  <div className="flex items-center gap-1">
                    <span>ID</span>
                    {sortField === 'id' &&
                      (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </div>
                </th>

                {/* User Column */}
                <th
                  className="py-3 px-2.5 cursor-pointer hover:text-orange-400 transition"
                  onClick={() => handleSort('user')}
                >
                  <div className="flex items-center gap-1">
                    <span>{isEn ? 'User' : 'کاربر'}</span>
                    {sortField === 'user' &&
                      (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </div>
                </th>

                {/* Host Column */}
                <th
                  className="py-3 px-2.5 cursor-pointer hover:text-orange-400 transition"
                  onClick={() => handleSort('host')}
                >
                  <div className="flex items-center gap-1">
                    <span>{isEn ? 'Host (IP:Port)' : 'هاست مبدا'}</span>
                    {sortField === 'host' &&
                      (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </div>
                </th>

                {/* Database Column */}
                <th
                  className="py-3 px-2.5 cursor-pointer hover:text-orange-400 transition"
                  onClick={() => handleSort('db')}
                >
                  <div className="flex items-center gap-1">
                    <span>{isEn ? 'Database' : 'دیتابیس'}</span>
                    {sortField === 'db' &&
                      (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </div>
                </th>

                {/* Command Column */}
                <th
                  className="py-3 px-2.5 cursor-pointer hover:text-orange-400 transition"
                  onClick={() => handleSort('command')}
                >
                  <div className="flex items-center gap-1">
                    <span>{isEn ? 'Command' : 'دستور'}</span>
                    {sortField === 'command' &&
                      (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </div>
                </th>

                {/* Time (s) Column */}
                <th
                  className="py-3 px-2.5 w-24 cursor-pointer hover:text-orange-400 transition"
                  onClick={() => handleSort('time')}
                >
                  <div className="flex items-center gap-1">
                    <span>{isEn ? 'Time (s)' : 'زمان'}</span>
                    {sortField === 'time' &&
                      (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </div>
                </th>

                {/* State Column */}
                <th
                  className="py-3 px-2.5 cursor-pointer hover:text-orange-400 transition"
                  onClick={() => handleSort('state')}
                >
                  <div className="flex items-center gap-1">
                    <span>{isEn ? 'State' : 'وضعیت'}</span>
                    {sortField === 'state' &&
                      (sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </div>
                </th>

                {/* Query Info Column */}
                <th className="py-3 px-3 flex-1">{isEn ? 'SQL Statement / Info' : 'متن کوئری'}</th>

                {/* Actions Column */}
                <th className="py-3 px-3 text-center min-w-[150px]">{isEn ? 'Actions' : 'عملیات'}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 font-mono text-[11px]">
              {loading && processes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-orange-400 mx-auto mb-2" />
                    <span>{isEn ? 'Querying SHOW FULL PROCESSLIST...' : 'در حال دریافت پروسس‌های سرور MySQL...'}</span>
                  </td>
                </tr>
              ) : filteredAndSortedProcesses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    {isEn ? 'No running threads matched the filter criteria.' : 'هیچ اتصالی با فیلترهای انتخابی یافت نشد.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedProcesses.map((p) => {
                  const isCurrent = Boolean(p.isCurrentConnection);
                  const isQuery = p.command.toLowerCase() === 'query';
                  const isSleep = p.command.toLowerCase() === 'sleep';

                  // Duration badge color
                  let timeColor = 'text-slate-300';
                  if (p.time > 60) timeColor = 'text-rose-400 font-bold';
                  else if (p.time > 10) timeColor = 'text-orange-400 font-bold';
                  else if (p.time > 2) timeColor = 'text-amber-400';

                  return (
                    <tr
                      key={p.id}
                      className={`transition ${
                        isCurrent
                          ? isLightMode
                            ? 'bg-blue-50/60'
                            : 'bg-blue-950/20'
                          : isLightMode
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Thread ID */}
                      <td className="py-2.5 px-3 font-bold text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>{p.id}</span>
                          {isCurrent && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-sans font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {isEn ? 'You' : 'این نشست'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* User */}
                      <td className="py-2.5 px-2.5 text-cyan-400 font-medium">{p.user}</td>

                      {/* Host */}
                      <td className="py-2.5 px-2.5 text-slate-400 max-w-[140px] truncate" title={p.host}>
                        {p.host}
                      </td>

                      {/* DB */}
                      <td className="py-2.5 px-2.5 text-amber-400">
                        {p.db ? p.db : <span className="text-slate-600">—</span>}
                      </td>

                      {/* Command */}
                      <td className="py-2.5 px-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold ${
                            isQuery
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : isSleep
                              ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                              : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                          }`}
                        >
                          {p.command}
                        </span>
                      </td>

                      {/* Time */}
                      <td className={`py-2.5 px-2.5 ${timeColor}`}>{p.time}s</td>

                      {/* State */}
                      <td className="py-2.5 px-2.5 text-slate-400 max-w-[130px] truncate" title={p.state || ''}>
                        {p.state ? (
                          <span
                            className={
                              p.state.toLowerCase().includes('lock')
                                ? 'text-rose-400 font-semibold'
                                : 'text-slate-300'
                            }
                          >
                            {p.state}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Info / SQL */}
                      <td className="py-2.5 px-3 max-w-sm">
                        {p.info ? (
                          <div
                            onClick={() => setSelectedProcessForSql(p)}
                            className="cursor-pointer group flex items-center justify-between gap-1 p-1 rounded hover:bg-black/20"
                            title={isEn ? 'Click to inspect full query' : 'برای مشاهده متن کامل کوئری کلیک کنید'}
                          >
                            <span className="truncate text-emerald-300 font-mono text-[11px] group-hover:text-emerald-200">
                              {p.info}
                            </span>
                            <FileCode className="w-3 h-3 text-slate-500 group-hover:text-emerald-400 shrink-0" />
                          </div>
                        ) : (
                          <span className="text-slate-600 font-sans italic">{isEn ? 'idle' : 'بیکار'}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Cancel Query (KILL QUERY) */}
                          <button
                            type="button"
                            onClick={() => openKillDialog(p, 'query')}
                            disabled={isCurrent || !isQuery}
                            className="px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                              isCurrent
                                ? isEn
                                  ? 'Cannot cancel current session query'
                                  : 'امکان لغو کوئری نشست جاری وجود ندارد'
                                : isEn
                                ? `Cancel query on thread ${p.id} (keeps connection open)`
                                : `لغو کوئری ترد ${p.id} بدون قطع اتصال`
                            }
                          >
                            {isEn ? 'Cancel Query' : 'لغو کوئری'}
                          </button>

                          {/* Terminate Connection (KILL CONNECTION) */}
                          <button
                            type="button"
                            onClick={() => openKillDialog(p, 'connection')}
                            disabled={isCurrent}
                            className="px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                              isCurrent
                                ? isEn
                                  ? 'Cannot kill own connection'
                                  : 'امکان بستن اتصال جاری وجود ندارد'
                                : isEn
                                ? `Terminate connection ${p.id}`
                                : `بستن کامل اتصال ${p.id}`
                            }
                          >
                            {isEn ? 'Kill Conn' : 'قطع اتصال'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. MODAL A: QUERY INSPECTION MODAL                   */}
      {/* ---------------------------------------------------- */}
      {selectedProcessForSql && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
            }`}
          >
            <div className="p-4 border-b flex items-center justify-between border-white/10">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Thread Query Details' : 'مشاهده جزئیات کوئری ترد'}
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    Thread ID: #{selectedProcessForSql.id} | User: {selectedProcessForSql.user} | Time:{' '}
                    {selectedProcessForSql.time}s
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProcessForSql(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">{isEn ? 'Executing SQL Query:' : 'متن دستور SQL:'}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(selectedProcessForSql.info || '')}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSql ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy SQL' : 'کپی'}</span>
                </button>
              </div>

              <pre className="p-3.5 rounded-xl bg-slate-950 border border-white/10 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed select-all">
                {selectedProcessForSql.info || '—'}
              </pre>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-black/20 border border-white/5">
                  <span className="text-slate-500 block">{isEn ? 'Database' : 'پایگاه داده'}:</span>
                  <span className="font-mono text-amber-400 font-bold">{selectedProcessForSql.db || '—'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-black/20 border border-white/5">
                  <span className="text-slate-500 block">{isEn ? 'State' : 'وضعیت'}:</span>
                  <span className="font-mono text-slate-200">{selectedProcessForSql.state || '—'}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedProcessForSql(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/10 text-slate-300 transition cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. MODAL B: KILL QUERY / CONNECTION CONFIRMATION     */}
      {/* ---------------------------------------------------- */}
      {killModal.isOpen && killModal.process && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between border-white/10">
              <div className="flex items-center gap-2.5">
                {killModal.type === 'query' ? (
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {killModal.type === 'query'
                      ? isEn
                        ? 'Cancel Running Query (KILL QUERY)'
                        : 'لغو کوئری فعال (KILL QUERY)'
                      : isEn
                      ? 'Terminate Connection (KILL CONNECTION)'
                      : 'قطع کامل اتصال (KILL CONNECTION)'}
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    Thread ID #{killModal.process.id} ({killModal.process.user}@{killModal.process.host})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setKillModal({ isOpen: false, process: null, type: 'connection', killing: false })}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                {killModal.type === 'query'
                  ? isEn
                    ? `This will issue KILL QUERY ${killModal.process.id}. The currently running SQL statement will be aborted, but the client connection will remain open.`
                    : `دستور KILL QUERY ${killModal.process.id} صادر خواهد شد. اجرای دستور SQL متوقف می‌شود ولی ارتباط کلاینت با سرور قطع نخواهد شد.`
                  : isEn
                  ? `This will issue KILL CONNECTION ${killModal.process.id}. The entire connection socket and thread will be terminated immediately.`
                    : `دستور KILL CONNECTION ${killModal.process.id} صادر خواهد شد. اتصال کلاینت و ترد پردازشی به طور کامل خاتمه می‌یابد.`}
              </p>

              {/* Target info */}
              <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">{isEn ? 'Database:' : 'دیتابیس:'}</span>
                  <span className="text-amber-400 font-bold">{killModal.process.db || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isEn ? 'Running Time:' : 'مدت اجرا:'}</span>
                  <span className="text-orange-400 font-bold">{killModal.process.time}s</span>
                </div>
                {killModal.process.info && (
                  <div>
                    <span className="text-slate-500 block mb-1">{isEn ? 'Query Snippet:' : 'بخشی از کوئری:'}</span>
                    <div className="p-2 rounded bg-black/40 text-emerald-300 text-[10px] truncate">
                      {killModal.process.info}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setKillModal({ isOpen: false, process: null, type: 'connection', killing: false })}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={handleConfirmKill}
                disabled={killModal.killing}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                  killModal.type === 'query'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {killModal.killing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Terminating...' : 'در حال توقف...'}</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>
                      {killModal.type === 'query'
                        ? isEn
                          ? 'Confirm Kill Query'
                          : 'تایید لغو کوئری'
                        : isEn
                        ? 'Confirm Kill Connection'
                        : 'تایید قطع اتصال'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
