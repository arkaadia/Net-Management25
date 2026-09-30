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
  FolderTree,
  Filter,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlDatabaseItem,
  MysqlMaintenanceAction,
  MysqlMaintenanceScope,
  MysqlCheckOption,
  MysqlRepairOption,
  MysqlMaintenanceRequest,
  MysqlMaintenanceResult,
  MysqlTableBloatMetric,
  MysqlActiveMaintenanceProgress,
  MysqlMaintenanceLockWarning,
} from '../../types';
import {
  runRemoteServerMysqlMaintenance,
  fetchRemoteServerMysqlBloatMetrics,
  fetchRemoteServerMysqlActiveMaintenance,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlMaintenanceModalProps {
  isOpen: boolean;
  server: RemoteServer;
  databases: MysqlDatabaseItem[];
  initialDatabase?: string;
  initialTable?: string;
  initialAction?: MysqlMaintenanceAction;
  onClose: () => void;
  onMinimize?: () => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const MysqlMaintenanceModal: React.FC<MysqlMaintenanceModalProps> = ({
  isOpen,
  server,
  databases,
  initialDatabase,
  initialTable,
  initialAction = 'optimize',
  onClose,
  onMinimize,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Active top-level subtab: 'operations' | 'bloat' | 'active_progress'
  const [activeTab, setActiveTab] = useState<'operations' | 'bloat' | 'active_progress'>('operations');

  // Operation parameters
  const [action, setAction] = useState<MysqlMaintenanceAction>(initialAction);
  const [scope, setScope] = useState<MysqlMaintenanceScope>(initialTable ? 'table' : 'database');
  const [selectedDb, setSelectedDb] = useState<string>(
    initialDatabase || server.mysql_database || databases[0]?.name || 'mysql'
  );
  const [table, setTable] = useState<string>(initialTable || '');
  const [selectedTables, setSelectedTables] = useState<string[]>(initialTable ? [initialTable] : []);

  // Options
  const [noWriteToBinlog, setNoWriteToBinlog] = useState<boolean>(false);
  const [checkOption, setCheckOption] = useState<MysqlCheckOption>('DEFAULT');
  const [repairOption, setRepairOption] = useState<MysqlRepairOption>('DEFAULT');
  const [rebuildEngine, setRebuildEngine] = useState<boolean>(false);

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<MysqlMaintenanceResult | null>(null);
  const [hasCopiedSql, setHasCopiedSql] = useState<boolean>(false);

  // Bloat & Fragmentation Metrics State
  const [bloatMetrics, setBloatMetrics] = useState<MysqlTableBloatMetric[]>([]);
  const [isLoadingBloat, setIsLoadingBloat] = useState<boolean>(false);
  const [bloatError, setBloatError] = useState<string | null>(null);
  const [bloatSearch, setBloatSearch] = useState<string>('');
  const [bloatSortBy, setBloatSortBy] = useState<'ratio' | 'free' | 'size' | 'name'>('ratio');
  const [bloatSortAsc, setBloatSortAsc] = useState<boolean>(false);

  // Active Maintenance Tasks State
  const [activeTasks, setActiveTasks] = useState<MysqlActiveMaintenanceProgress[]>([]);
  const [isLoadingActive, setIsLoadingActive] = useState<boolean>(false);
  const [autoRefreshActive, setAutoRefreshActive] = useState<boolean>(false);

  // Sync initial props
  useEffect(() => {
    if (initialDatabase) setSelectedDb(initialDatabase);
    if (initialTable) {
      setTable(initialTable);
      setSelectedTables([initialTable]);
      setScope('table');
    }
    if (initialAction) setAction(initialAction);
  }, [initialDatabase, initialTable, initialAction]);

  // Load bloat metrics
  const loadBloatMetrics = useCallback(async () => {
    setIsLoadingBloat(true);
    setBloatError(null);
    try {
      const res = await fetchRemoteServerMysqlBloatMetrics(server.id, selectedDb);
      if (res.success && res.metrics) {
        setBloatMetrics(res.metrics);
      } else {
        setBloatError(isEn ? res.error || 'Failed to fetch storage bloat metrics' : res.errorFa || 'خطا در دریافت شاخص‌های تکه‌تکه‌شدگی');
      }
    } catch (err: any) {
      setBloatError(err.message || 'Network error fetching table bloat metrics');
    } finally {
      setIsLoadingBloat(false);
    }
  }, [server.id, selectedDb, isEn]);

  // Load active processes
  const loadActiveTasks = useCallback(async () => {
    setIsLoadingActive(true);
    try {
      const res = await fetchRemoteServerMysqlActiveMaintenance(server.id, selectedDb);
      if (res.success && res.active) {
        setActiveTasks(res.active);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingActive(false);
    }
  }, [server.id, selectedDb]);

  // Periodic active task poll
  useEffect(() => {
    if (!isOpen || activeTab !== 'active_progress' || !autoRefreshActive) return;
    const interval = setInterval(() => {
      loadActiveTasks();
    }, 3000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab, autoRefreshActive, loadActiveTasks]);

  // Tab switch effect
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'bloat' && bloatMetrics.length === 0) {
      loadBloatMetrics();
    }
    if (activeTab === 'active_progress') {
      loadActiveTasks();
    }
  }, [isOpen, activeTab, loadBloatMetrics, loadActiveTasks, bloatMetrics.length]);

  // Dynamic lock warning calculation
  const lockWarning: MysqlMaintenanceLockWarning = useMemo(() => {
    if (action === 'optimize') {
      return {
        level: 'moderate',
        lockName: 'MDL_SHARED_UPGRADABLE (Online DDL)',
        blocksReads: false,
        blocksWrites: false,
        tempSpaceRequired: true,
        description:
          'InnoDB OPTIMIZE TABLE performs an online rebuild. Reads and writes remain online throughout, requiring brief metadata locks at start and end. Requires free disk space equal to table size.',
        descriptionFa:
          'دستور OPTIMIZE TABLE در موتور InnoDB جدول را به صورت آنلاین بازسازی می‌کند. عملیات خواندن و نوشتن مسدود نمی‌شوند اما به فضای خالی موقت روی دیسک معادل حجم جدول نیاز است.',
      };
    }
    if (action === 'analyze') {
      return {
        level: 'low',
        lockName: 'MDL_SHARED_READ',
        blocksReads: false,
        blocksWrites: false,
        tempSpaceRequired: false,
        description:
          'ANALYZE TABLE inspects key distributions and updates index cardinality in innodb_index_stats online without blocking concurrent queries.',
        descriptionFa:
          'دستور ANALYZE TABLE آمار توزیع کلیدها و کاردینالیتی ایندکس‌ها را به‌روزرسانی می‌کند و تداخلی با کوئری‌های همزمان ایجاد نمی‌نماید.',
      };
    }
    if (action === 'check') {
      const isExt = checkOption === 'EXTENDED';
      return {
        level: isExt ? 'heavy' : 'low',
        lockName: 'MDL_SHARED_READ',
        blocksReads: false,
        blocksWrites: isExt,
        tempSpaceRequired: false,
        description: isExt
          ? 'CHECK TABLE EXTENDED performs full key and row consistency checks. On large production tables, it can hold read locks and delay writes.'
          : 'CHECK TABLE scans table integrity and structure without blocking standard read traffic.',
        descriptionFa: isExt
          ? 'گزینه EXTENDED بررسی جامع خط‌به‌خط ساختار جدول را انجام می‌دهد و در جداول حجیم ممکن است عملیات‌های نوشتن را موقتاً با تاخیر مواجه سازد.'
          : 'دستور CHECK TABLE ساختار فیزیکی و منطقی جدول را به صورت ایمن بازرسی می‌کند.',
      };
    }
    if (action === 'repair') {
      return {
        level: 'exclusive',
        lockName: 'TL_WRITE_EXCLUSIVE',
        blocksReads: true,
        blocksWrites: true,
        tempSpaceRequired: true,
        description:
          'REPAIR TABLE restores damaged table files (primarily MyISAM/Aria). It acquires an exclusive lock, blocking all concurrent reads and writes.',
        descriptionFa:
          'دستور REPAIR TABLE اقدام به ترمیم جداول آسیب‌دیده می‌کند و کلیه دسترسی‌های خواندن و نوشتن را مسدود می‌سازد.',
      };
    }
    // rebuild_index
    return {
      level: 'moderate',
      lockName: 'MDL_SHARED_UPGRADABLE (ALTER TABLE)',
      blocksReads: false,
      blocksWrites: false,
      tempSpaceRequired: true,
      description:
        'Rebuilding table engine (ALTER TABLE ... ENGINE=InnoDB) completely defragments clustered B-Trees and secondary indexes online.',
      descriptionFa:
        'بازسازی کامل موتور جدول ایندکس‌ها و شاخه‌های B-Tree را بدون توقف خواندن و نوشتن مرتب‌سازی می‌کند.',
    };
  }, [action, checkOption]);

  // SQL command preview
  const sqlPreview = useMemo(() => {
    const noBinlog = noWriteToBinlog ? 'NO_WRITE_TO_BINLOG ' : '';
    const target = scope === 'table' && table ? `\`${selectedDb}\`.\`${table}\`` : `\`${selectedDb}\`.\`<all_tables>\``;

    if (action === 'optimize') {
      return `OPTIMIZE ${noBinlog}TABLE ${target};`;
    }
    if (action === 'analyze') {
      return `ANALYZE ${noBinlog}TABLE ${target};`;
    }
    if (action === 'check') {
      const opt = checkOption !== 'DEFAULT' ? ` ${checkOption}` : '';
      return `CHECK TABLE ${target}${opt};`;
    }
    if (action === 'repair') {
      const opt = repairOption !== 'DEFAULT' ? ` ${repairOption}` : '';
      return `REPAIR ${noBinlog}TABLE ${target}${opt};`;
    }
    return `ALTER TABLE ${target} ENGINE=InnoDB;`;
  }, [action, scope, selectedDb, table, noWriteToBinlog, checkOption, repairOption]);

  // Execute maintenance command
  const handleExecute = async () => {
    setIsRunning(true);
    setExecutionResult(null);

    const payload: MysqlMaintenanceRequest = {
      action,
      scope,
      database: selectedDb,
      table: scope === 'table' ? table : undefined,
      selectedTables: scope === 'selected_tables' ? selectedTables : undefined,
      noWriteToBinlog,
      checkOption: action === 'check' ? checkOption : undefined,
      repairOption: action === 'repair' ? repairOption : undefined,
      rebuildEngine: action === 'rebuild_index',
    };

    try {
      const res = await runRemoteServerMysqlMaintenance(server.id, payload);
      setExecutionResult(res);
      // Refresh bloat metrics in background if bloat tab was visited
      if (bloatMetrics.length > 0) {
        loadBloatMetrics();
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        action,
        scope,
        targetDescription: `${selectedDb}`,
        executedCommand: sqlPreview,
        durationMs: 0,
        message: err.message || 'Execution failed',
        messageFa: 'خطا در برقراری ارتباط با سرور',
        error: err.message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Copy SQL to clipboard
  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlPreview);
    setHasCopiedSql(true);
    setTimeout(() => setHasCopiedSql(false), 2000);
  };

  // Filtered & sorted bloat metrics
  const filteredBloat = useMemo(() => {
    let list = [...bloatMetrics];
    if (bloatSearch.trim()) {
      const q = bloatSearch.toLowerCase();
      list = list.filter((b) => b.tableName.toLowerCase().includes(q) || b.engine.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (bloatSortBy === 'ratio') cmp = a.fragmentationRatio - b.fragmentationRatio;
      else if (bloatSortBy === 'free') cmp = a.dataFreeBytes - b.dataFreeBytes;
      else if (bloatSortBy === 'size') cmp = a.totalSizeBytes - b.totalSizeBytes;
      else if (bloatSortBy === 'name') cmp = a.tableName.localeCompare(b.tableName);
      return bloatSortAsc ? cmp : -cmp;
    });
    return list;
  }, [bloatMetrics, bloatSearch, bloatSortBy, bloatSortAsc]);

  // Aggregate stats
  const totalFreeStorage = useMemo(() => {
    return bloatMetrics.reduce((sum, b) => sum + b.dataFreeBytes, 0);
  }, [bloatMetrics]);

  const avgFragmentation = useMemo(() => {
    if (bloatMetrics.length === 0) return 0;
    const sum = bloatMetrics.reduce((acc, b) => acc + b.fragmentationRatio, 0);
    return Number((sum / bloatMetrics.length).toFixed(1));
  }, [bloatMetrics]);

  const optimizeCandidateCount = useMemo(() => {
    return bloatMetrics.filter((b) => b.optimizeRecommended).length;
  }, [bloatMetrics]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div
        className={`w-full ${
          isMaximized ? 'h-full max-w-none' : 'max-w-6xl max-h-[92vh]'
        } flex flex-col rounded-2xl shadow-2xl transition-all duration-200 overflow-hidden border ${
          isLightMode ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* MODAL HEADER */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b select-none ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold truncate">
                  {isEn ? 'MySQL Database Maintenance & Optimization Hub' : 'مرکز نگهداری و بهینه‌سازی پایگاه داده MySQL'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0">
                  Phase 18
                </span>
              </div>
              <p className={`text-xs truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {server.name} ({server.ip || server.hostname}) — {isEn ? 'OPTIMIZE, ANALYZE, CHECK, REPAIR & Bloat Analyzer' : 'یکپارچه‌سازی، به‌روزرسانی آمار، بررسی سلامت و رفع تکه‌تکه‌شدگی'}
              </p>
            </div>
          </div>

          {/* TRIAD WINDOW CONTROLS */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                title={isEn ? 'Minimize to dock' : 'کوچک‌نمایی به داک'}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? (isEn ? 'Restore size' : 'خروج از تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg transition cursor-pointer hover:bg-rose-500/10 text-slate-400 hover:text-rose-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SUBTAB NAVIGATION BAR */}
        <div
          className={`flex items-center justify-between px-5 py-2 border-b gap-2 overflow-x-auto ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('operations')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'operations'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isEn ? 'Execute Operations' : 'اجرای عملیات نگهداری'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bloat')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'bloat'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isEn ? 'Table Bloat & Storage' : 'تحلیل تکه‌تکه‌شدگی و فضا'}</span>
              {bloatMetrics.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
                  {bloatMetrics.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('active_progress')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'active_progress'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isEn ? 'Live Tasks & Processlist' : 'وظایف فعال و فرآیندها'}</span>
              {activeTasks.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500 text-white font-mono animate-pulse">
                  {activeTasks.length}
                </span>
              )}
            </button>
          </div>

          {/* TARGET DATABASE SELECTOR */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Database:' : 'پایگاه داده:'}
            </span>
            <select
              value={selectedDb}
              onChange={(e) => {
                setSelectedDb(e.target.value);
                setTable('');
                setSelectedTables([]);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs border font-medium outline-none transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 focus:border-amber-500'
                  : 'bg-slate-800 border-slate-700 text-slate-200 focus:border-amber-500'
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

        {/* MODAL MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: OPERATIONS */}
          {activeTab === 'operations' && (
            <div className="space-y-5">
              {/* ACTION SELECTOR TILES */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">
                  {isEn ? 'Select Maintenance Action' : 'انتخاب نوع عملیات نگهداری'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {/* OPTIMIZE */}
                  <button
                    type="button"
                    onClick={() => setAction('optimize')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      action === 'optimize'
                        ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                        : isLightMode
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        OPTIMIZE
                      </span>
                    </div>
                    <div className="text-xs font-bold">{isEn ? 'Optimize Table' : 'یکپارچه‌سازی و بهینه‌سازی'}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {isEn ? 'Rebuilds storage, defragments B-Trees, reclaims space' : 'بازسازی فضای دیسک، رفع تکه‌تکه‌شدگی'}
                    </div>
                  </button>

                  {/* ANALYZE */}
                  <button
                    type="button"
                    onClick={() => setAction('analyze')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      action === 'analyze'
                        ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                        : isLightMode
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        ANALYZE
                      </span>
                    </div>
                    <div className="text-xs font-bold">{isEn ? 'Analyze Statistics' : 'تحلیل و آمار ایندکس‌ها'}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {isEn ? 'Updates key distribution in innodb_index_stats' : 'به‌روزرسانی آمار توزیع کلیدها'}
                    </div>
                  </button>

                  {/* CHECK */}
                  <button
                    type="button"
                    onClick={() => setAction('check')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      action === 'check'
                        ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                        : isLightMode
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        CHECK
                      </span>
                    </div>
                    <div className="text-xs font-bold">{isEn ? 'Check Table Integrity' : 'بررسی سلامت ساختار'}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {isEn ? 'Verifies physical file consistency & errors' : 'بررسی عدم خرابی فیزیکی و منطقی'}
                    </div>
                  </button>

                  {/* REPAIR */}
                  <button
                    type="button"
                    onClick={() => setAction('repair')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      action === 'repair'
                        ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                        : isLightMode
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400">
                        REPAIR
                      </span>
                    </div>
                    <div className="text-xs font-bold">{isEn ? 'Repair Table' : 'ترمیم جداول آسیب‌دیده'}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {isEn ? 'Fixes corrupted MyISAM / Aria tables' : 'تعمیر و بازسازی ساختار معیوب'}
                    </div>
                  </button>

                  {/* REBUILD INDEX */}
                  <button
                    type="button"
                    onClick={() => setAction('rebuild_index')}
                    className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      action === 'rebuild_index'
                        ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                        : isLightMode
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <RotateCw className="w-4 h-4 text-purple-500" />
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        REBUILD
                      </span>
                    </div>
                    <div className="text-xs font-bold">{isEn ? 'Rebuild Engine' : 'بازسازی کامل موتور'}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {isEn ? 'ALTER TABLE ... ENGINE=InnoDB force rebuild' : 'بازسازی آنلاین کلاسترهای InnoDB'}
                    </div>
                  </button>
                </div>
              </div>

              {/* SCOPE & TABLE CONFIGURATION */}
              <div
                className={`p-4 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* SCOPE SELECTION */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-slate-400">
                      {isEn ? 'Maintenance Target Scope' : 'دامنه اجرای عملیات'}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setScope('database')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center justify-center gap-2 ${
                          scope === 'database'
                            ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                            : isLightMode
                            ? 'border-slate-200 hover:bg-slate-50 text-slate-600'
                            : 'border-slate-800 hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Entire Database' : 'کل پایگاه داده'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setScope('table')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center justify-center gap-2 ${
                          scope === 'table'
                            ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                            : isLightMode
                            ? 'border-slate-200 hover:bg-slate-50 text-slate-600'
                            : 'border-slate-800 hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <TableIcon className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Single Table' : 'تک جدول'}</span>
                      </button>
                    </div>
                  </div>

                  {/* SPECIFIC TABLE INPUT */}
                  {scope === 'table' && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-400">
                          {isEn ? 'Target Table Name' : 'نام جدول هدف'}
                        </label>
                        <FieldInfoTooltip
                          title={isEn ? 'Target Table' : 'جدول هدف'}
                          whatIsIt={isEn ? 'The specific database table name to apply maintenance on.' : 'نام جدول مورد نظر جهت انجام عملیات بهینه‌سازی.'}
                          whyNeeded={isEn ? 'Focusing on single hot or fragmented tables avoids overhead on entire database.' : 'اجرا بر روی تک جدول مانع از بار پردازشی اضافی بر کل دیتابیس می‌شود.'}
                          practicalExample="orders, users, logs_2026"
                          isEn={isEn}
                        />
                      </div>
                      <input
                        type="text"
                        value={table}
                        onChange={(e) => setTable(e.target.value)}
                        placeholder={isEn ? 'e.g. orders, users, audit_logs' : 'مثال: orders, users'}
                        className={`w-full px-3 py-2 rounded-lg text-xs border font-mono outline-none transition ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-amber-500'
                            : 'bg-slate-800/80 border-slate-700 text-slate-100 focus:border-amber-500'
                        }`}
                      />
                    </div>
                  )}

                  {/* DATABASE INFO DISPLAY */}
                  {scope === 'database' && (
                    <div>
                      <label className="block text-xs font-semibold mb-1.5 text-slate-400">
                        {isEn ? 'Selected Database Target' : 'پایگاه داده انتخابی'}
                      </label>
                      <div
                        className={`px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between border ${
                          isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-800/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Database className="w-3.5 h-3.5 text-amber-500" />
                          <span>{selectedDb}</span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {isEn ? 'Iterates across all base tables' : 'اجرا بر روی کلیه جداول استاندارد'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ADVANCED EXECUTION OPTIONS */}
                <div className="mt-4 pt-3 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* NO_WRITE_TO_BINLOG */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={noWriteToBinlog}
                      onChange={(e) => setNoWriteToBinlog(e.target.checked)}
                      className="rounded border-slate-700 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-medium">
                      {isEn ? 'NO_WRITE_TO_BINLOG (LOCAL)' : 'عدم ثبت در باینری‌لاگ (LOCAL)'}
                    </span>
                    <FieldInfoTooltip
                      title={isEn ? 'Binary Log Suppression' : 'مهار باینری‌لاگ'}
                      whatIsIt={isEn ? 'Appends NO_WRITE_TO_BINLOG (or LOCAL) keyword to maintenance command.' : 'افزودن کلیدواژه NO_WRITE_TO_BINLOG جهت عدم ارسال دستور به رپلیکاها.'}
                      whyNeeded={isEn ? 'Prevents replicating heavyweight optimization queries to read-replicas.' : 'مانع از درگیر شدن سرورهای رپلیکا با اجرای مکرر عملیات بهینه‌سازی می‌شود.'}
                      practicalExample="OPTIMIZE NO_WRITE_TO_BINLOG TABLE t1;"
                      isEn={isEn}
                    />
                  </label>

                  {/* CHECK OPTIONS */}
                  {action === 'check' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">{isEn ? 'Mode:' : 'حالت:'}</span>
                      <select
                        value={checkOption}
                        onChange={(e) => setCheckOption(e.target.value as MysqlCheckOption)}
                        className={`flex-1 px-2 py-1 rounded text-xs border outline-none cursor-pointer ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <option value="DEFAULT">DEFAULT</option>
                        <option value="QUICK">QUICK (Skip checking links)</option>
                        <option value="FAST">FAST (Only unchecked)</option>
                        <option value="MEDIUM">MEDIUM (Checksum check)</option>
                        <option value="EXTENDED">EXTENDED (Full consistency check)</option>
                        <option value="CHANGED">CHANGED (Modified tables only)</option>
                      </select>
                    </div>
                  )}

                  {/* REPAIR OPTIONS */}
                  {action === 'repair' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">{isEn ? 'Mode:' : 'حالت:'}</span>
                      <select
                        value={repairOption}
                        onChange={(e) => setRepairOption(e.target.value as MysqlRepairOption)}
                        className={`flex-1 px-2 py-1 rounded text-xs border outline-none cursor-pointer ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <option value="DEFAULT">DEFAULT</option>
                        <option value="QUICK">QUICK (Only index tree)</option>
                        <option value="EXTENDED">EXTENDED (Row-by-row recovery)</option>
                        <option value="USE_FRM">USE_FRM (Rebuild using .frm)</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* LOCK & SAFETY WARNING CARD */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3 ${
                  lockWarning.level === 'exclusive'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    : lockWarning.level === 'heavy'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : lockWarning.level === 'moderate'
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                }`}
              >
                <div className="p-1.5 rounded-lg bg-black/20 shrink-0 mt-0.5">
                  {lockWarning.level === 'exclusive' || lockWarning.level === 'heavy' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  ) : lockWarning.level === 'moderate' ? (
                    <Lock className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Unlock className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {isEn ? 'Concurrency & Lock Evaluation:' : 'ارزیابی قفل و همروندی:'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-black/30">
                      {lockWarning.lockName}
                    </span>
                    {lockWarning.tempSpaceRequired && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {isEn ? 'Temp Disk Space Required' : 'نیازمند فضای دیسک موقت'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">
                    {isEn ? lockWarning.description : lockWarning.descriptionFa}
                  </p>
                </div>
              </div>

              {/* SQL COMMAND PREVIEW & EXECUTION BUTTON */}
              <div
                className={`p-4 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {isEn ? 'SQL Statement Preview' : 'پیش‌نمایش دستور ارسالی به موتور'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 transition cursor-pointer ${
                      isLightMode ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {hasCopiedSql ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedSql ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-black/40 border border-slate-800/80 font-mono text-xs text-amber-400 mb-4 overflow-x-auto select-all">
                  {sqlPreview}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {scope === 'table'
                        ? isEn
                          ? `Will execute on table ${selectedDb}.${table || '<name>'}`
                          : `بر روی جدول ${selectedDb}.${table || '<نام>'}`
                        : isEn
                        ? `Will iterate across all tables in ${selectedDb}`
                        : `بر روی کلیه جداول دیتابیس ${selectedDb}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={isRunning || (scope === 'table' && !table.trim())}
                    className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-md ${
                      isRunning || (scope === 'table' && !table.trim())
                        ? 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-400'
                        : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 active:scale-95'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{isEn ? 'Executing...' : 'در حال اجرا...'}</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>{isEn ? `Execute ${action.toUpperCase()}` : `اجرای عملیات ${action.toUpperCase()}`}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* EXECUTION RESULTS GRID */}
              {executionResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    executionResult.success
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-rose-500/30 bg-rose-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {executionResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                      )}
                      <h4 className="text-xs font-bold">
                        {executionResult.success
                          ? isEn
                            ? 'Operation Completed Successfully'
                            : 'عملیات با موفقیت به پایان رسید'
                          : isEn
                          ? 'Operation Finished with Warnings or Errors'
                          : 'عملیات با هشدار یا خطا به پایان رسید'}
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {isEn ? 'Duration:' : 'زمان اجرا:'} {executionResult.durationMs}ms
                    </span>
                  </div>

                  <p className="text-xs mb-3 text-slate-300">
                    {isEn ? executionResult.message : executionResult.messageFa}
                  </p>

                  {/* TABLE DETAILS TABLE */}
                  {executionResult.tableResults && executionResult.tableResults.length > 0 && (
                    <div className="rounded-lg border border-slate-800 overflow-hidden mb-3">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className={`border-b ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                            <th className="p-2 font-semibold">{isEn ? 'Table' : 'جدول'}</th>
                            <th className="p-2 font-semibold">{isEn ? 'Operation' : 'عملیات'}</th>
                            <th className="p-2 font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                            <th className="p-2 font-semibold">{isEn ? 'Message' : 'پیام موتور'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {executionResult.tableResults.map((tr, idx) => (
                            <tr
                              key={idx}
                              className={
                                tr.msgType === 'error'
                                  ? 'bg-rose-500/10 text-rose-300'
                                  : tr.msgType === 'warning'
                                  ? 'bg-amber-500/10 text-amber-300'
                                  : ''
                              }
                            >
                              <td className="p-2 font-bold">{tr.table}</td>
                              <td className="p-2 text-slate-400">{tr.op}</td>
                              <td className="p-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                    tr.msgType === 'error'
                                      ? 'bg-rose-500/20 text-rose-400'
                                      : tr.msgType === 'warning'
                                      ? 'bg-amber-500/20 text-amber-400'
                                      : 'bg-emerald-500/20 text-emerald-400'
                                  }`}
                                >
                                  {tr.msgType}
                                </span>
                              </td>
                              <td className="p-2 text-slate-300">{tr.msgText}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* OUTPUT LOGS */}
                  {executionResult.outputLogs && executionResult.outputLogs.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-slate-400 hover:text-slate-200 font-medium">
                        {isEn ? 'View Execution Logs' : 'مشاهده لاگ‌های دقیق اجرا'}
                      </summary>
                      <div className="p-3 mt-2 rounded bg-black/60 font-mono text-[11px] text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {executionResult.outputLogs.join('\n')}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TABLE BLOAT & STORAGE ANALYZER */}
          {activeTab === 'bloat' && (
            <div className="space-y-4">
              {/* SUMMARY STATS TILES */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  className={`p-3.5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="text-[11px] text-slate-500 mb-1">{isEn ? 'Total Tables Scanned' : 'تعداد کل جداول'}</div>
                  <div className="text-xl font-bold font-mono">{bloatMetrics.length}</div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="text-[11px] text-slate-500 mb-1">{isEn ? 'Reclaimable Free Space' : 'فضای قابل بازپس‌گیری'}</div>
                  <div className="text-xl font-bold font-mono text-amber-500">
                    {(totalFreeStorage / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="text-[11px] text-slate-500 mb-1">{isEn ? 'Average Fragmentation' : 'میانگین تکه‌تکه‌شدگی'}</div>
                  <div className="text-xl font-bold font-mono text-blue-500">{avgFragmentation}%</div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="text-[11px] text-slate-500 mb-1">{isEn ? 'Optimize Candidates' : 'نیازمند یکپارچه‌سازی'}</div>
                  <div className="text-xl font-bold font-mono text-rose-500">{optimizeCandidateCount}</div>
                </div>
              </div>

              {/* TOOLBAR */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={bloatSearch}
                    onChange={(e) => setBloatSearch(e.target.value)}
                    placeholder={isEn ? 'Filter by table or engine...' : 'جستجو در نام جدول یا موتور...'}
                    className={`w-full pl-9 pr-3 py-1.5 rounded-lg text-xs border outline-none ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <select
                    value={bloatSortBy}
                    onChange={(e) => setBloatSortBy(e.target.value as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs border outline-none cursor-pointer ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <option value="ratio">{isEn ? 'Sort by Fragmentation %' : 'مرتب‌سازی با درصد تکه‌تکه‌شدگی'}</option>
                    <option value="free">{isEn ? 'Sort by Free Bytes' : 'مرتب‌سازی با بایت‌های آزاد'}</option>
                    <option value="size">{isEn ? 'Sort by Total Size' : 'مرتب‌سازی با کل حجم'}</option>
                    <option value="name">{isEn ? 'Sort by Name' : 'مرتب‌سازی با نام'}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setBloatSortAsc(!bloatSortAsc)}
                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={loadBloatMetrics}
                    disabled={isLoadingBloat}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBloat ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Scan Now' : 'اسکن مجدد'}</span>
                  </button>
                </div>
              </div>

              {/* BLOAT DATA TABLE */}
              {isLoadingBloat ? (
                <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
                  <span className="text-xs">{isEn ? 'Introspecting table fragmentation & storage from information_schema...' : 'در حال اسکن متادیتای فضای جداول...'}</span>
                </div>
              ) : bloatError ? (
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
                  {bloatError}
                </div>
              ) : filteredBloat.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs">
                  {isEn ? 'No base tables found matching criteria.' : 'هیچ جدولی یافت نشد.'}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={`border-b ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                        <th className="p-2.5 font-semibold">{isEn ? 'Table Name' : 'نام جدول'}</th>
                        <th className="p-2.5 font-semibold">{isEn ? 'Engine' : 'موتور'}</th>
                        <th className="p-2.5 font-semibold text-right">{isEn ? 'Rows' : 'سطرها'}</th>
                        <th className="p-2.5 font-semibold text-right">{isEn ? 'Data Size' : 'حجم داده'}</th>
                        <th className="p-2.5 font-semibold text-right">{isEn ? 'Free Space' : 'فضای آزاد'}</th>
                        <th className="p-2.5 font-semibold">{isEn ? 'Fragmentation Ratio' : 'نسبت هدررفت'}</th>
                        <th className="p-2.5 font-semibold text-right">{isEn ? 'Quick Action' : 'اقدام سریع'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {filteredBloat.map((b) => (
                        <tr
                          key={b.tableName}
                          className={`hover:bg-amber-500/5 transition ${
                            b.bloatSeverity === 'critical'
                              ? 'bg-rose-500/5'
                              : b.bloatSeverity === 'high'
                              ? 'bg-amber-500/5'
                              : ''
                          }`}
                        >
                          <td className="p-2.5 font-bold flex items-center gap-1.5">
                            <TableIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span>{b.tableName}</span>
                          </td>
                          <td className="p-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                              {b.engine}
                            </span>
                          </td>
                          <td className="p-2.5 text-right text-slate-400">{b.tableRows.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-semibold">{b.dataSizePretty}</td>
                          <td className="p-2.5 text-right text-amber-400 font-bold">{b.dataFreePretty}</td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden min-w-[60px]">
                                <div
                                  className={`h-full rounded-full ${
                                    b.fragmentationRatio >= 25
                                      ? 'bg-rose-500'
                                      : b.fragmentationRatio >= 15
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, b.fragmentationRatio)}%` }}
                                />
                              </div>
                              <span
                                className={`text-[10px] font-bold ${
                                  b.fragmentationRatio >= 25
                                    ? 'text-rose-400'
                                    : b.fragmentationRatio >= 15
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {b.fragmentationRatio}%
                              </span>
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setTable(b.tableName);
                                setScope('table');
                                setAction('optimize');
                                setActiveTab('operations');
                              }}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-white border border-amber-500/20 transition cursor-pointer"
                            >
                              {isEn ? 'Optimize' : 'یکپارچه‌سازی'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE MAINTENANCE TASKS & PROCESSLIST */}
          {activeTab === 'active_progress' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-semibold">
                    {isEn ? 'Running Maintenance & DDL Queries' : 'کوئری‌های فعال نگهداری و DDL'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRefreshActive}
                      onChange={(e) => setAutoRefreshActive(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>{isEn ? 'Auto-refresh (3s)' : 'تازه‌سازی خودکار (۳ ثانیه)'}</span>
                  </label>

                  <button
                    type="button"
                    onClick={loadActiveTasks}
                    disabled={isLoadingActive}
                    className="px-2.5 py-1 rounded text-xs border border-slate-700 hover:bg-slate-800 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingActive ? 'animate-spin' : ''}`} />
                    <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
                  </button>
                </div>
              </div>

              {isLoadingActive && activeTasks.length === 0 ? (
                <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                  <span className="text-xs">{isEn ? 'Querying processlist...' : 'در حال بررسی فرآیندها...'}</span>
                </div>
              ) : activeTasks.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-slate-800 bg-slate-900/20 text-slate-400 text-xs flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500/60" />
                  <span className="font-semibold">
                    {isEn ? 'No Long-Running Maintenance Tasks Active' : 'هیچ عملیات نگهداری سنگین یا مسدودکننده‌ای در حال اجرا نیست'}
                  </span>
                  <p className="text-[11px] text-slate-500 max-w-md">
                    {isEn
                      ? 'The server processlist has no active OPTIMIZE, ANALYZE, CHECK, REPAIR, or ALTER TABLE processes.'
                      : 'کلیه منابع آزاد بوده و هیچ فرآیند بازسازی یا بررسی سلامت جدولی در جریان نیست.'}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={`border-b ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                        <th className="p-2.5 font-semibold">ID</th>
                        <th className="p-2.5 font-semibold">{isEn ? 'User' : 'کاربر'}</th>
                        <th className="p-2.5 font-semibold">{isEn ? 'Database' : 'پایگاه'}</th>
                        <th className="p-2.5 font-semibold">{isEn ? 'Elapsed Time' : 'زمان سپری‌شده'}</th>
                        <th className="p-2.5 font-semibold">{isEn ? 'State' : 'وضعیت'}</th>
                        <th className="p-2.5 font-semibold">{isEn ? 'Executing SQL' : 'دستور در حال اجرا'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {activeTasks.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/30">
                          <td className="p-2.5 font-bold text-amber-500">#{t.id}</td>
                          <td className="p-2.5 text-slate-300">{t.user}</td>
                          <td className="p-2.5 text-slate-400">{t.db || '-'}</td>
                          <td className="p-2.5 font-semibold text-rose-400">{t.timeSeconds}s</td>
                          <td className="p-2.5 text-slate-300">{t.state || '-'}</td>
                          <td className="p-2.5 text-amber-300 max-w-md truncate" title={t.info}>
                            {t.info}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t select-none ${
            isLightMode ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>{server.mysql_user || 'root'}@{server.ip || server.hostname}:{server.mysql_port || 3306}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
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
