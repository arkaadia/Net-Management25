import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  GitFork,
  Radio,
  Server,
  Database,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  HardDrive,
  Cpu,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Play,
  Pause,
  Trash2,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Info,
  Network,
  ArrowRight,
  TrendingDown,
  Activity,
  FileCode2,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresReplicationOverview,
  PostgresStandbyReplicaItem,
  PostgresReplicationSlotItem,
  PostgresWalReceiverStatus,
  PostgresClusterRole,
} from '../../types';
import {
  fetchRemoteServerPostgresReplication,
  manageRemoteServerPostgresReplicationSlot,
  controlRemoteServerPostgresWalReplay,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresReplicationTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
  onNavigateToSqlStudio?: (sql: string) => void;
}

type ReplicationSubView = 'replicas' | 'slots' | 'standby_receiver' | 'ha_guide';

export const PostgresReplicationTab: React.FC<PostgresReplicationTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
  onNavigateToSqlStudio,
}) => {
  const [subView, setSubView] = useState<ReplicationSubView>('replicas');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PostgresReplicationOverview | null>(null);

  // Auto-Refresh
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Search & Filter
  const [replicaSearch, setReplicaSearch] = useState('');
  const [slotSearch, setSlotSearch] = useState('');
  const [slotTypeFilter, setSlotTypeFilter] = useState<'all' | 'physical' | 'logical'>('all');

  // Modals
  const [isCreateSlotModalOpen, setIsCreateSlotModalOpen] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotReserve, setNewSlotReserve] = useState(true);
  const [createSlotLoading, setCreateSlotLoading] = useState(false);
  const [createSlotError, setCreateSlotError] = useState<string | null>(null);

  const [slotToDrop, setSlotToDrop] = useState<PostgresReplicationSlotItem | null>(null);
  const [dropSlotLoading, setDropSlotLoading] = useState(false);
  const [dropSlotError, setDropSlotError] = useState<string | null>(null);

  const [isReplayConfirmModalOpen, setIsReplayConfirmModalOpen] = useState(false);
  const [replayActionTarget, setReplayActionTarget] = useState<'pause' | 'resume'>('pause');
  const [replayControlLoading, setReplayControlLoading] = useState(false);
  const [replayControlError, setReplayControlError] = useState<string | null>(null);

  const [selectedReplicaDetails, setSelectedReplicaDetails] = useState<PostgresStandbyReplicaItem | null>(null);

  // Copy indicator
  const [copiedQueryKey, setCopiedQueryKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedQueryKey(key);
    setTimeout(() => setCopiedQueryKey(null), 2000);
  };

  // Load Replication Overview
  const loadReplicationOverview = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const res = await fetchRemoteServerPostgresReplication(server.id, {
          database: initialDatabase || server.postgres_database || 'postgres',
        });
        if (res.success && res.data) {
          setOverview(res.data);
          // If node is standby and current view is replicas, switch default to standby_receiver
          if (res.data.inRecovery && subView === 'replicas') {
            setSubView('standby_receiver');
          }
        } else {
          setError(
            isEn
              ? res.error || 'Failed to load replication metrics'
              : res.errorFa || res.error || 'خطا در دریافت وضعیت رپلیکیشن'
          );
        }
      } catch (err: any) {
        setError(err.message || 'Network error fetching replication metrics');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [server.id, initialDatabase, server.postgres_database, isEn, subView]
  );

  useEffect(() => {
    loadReplicationOverview(true);
  }, [loadReplicationOverview]);

  // Handle auto-refresh interval
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (autoRefreshInterval > 0) {
      refreshTimerRef.current = setInterval(() => {
        loadReplicationOverview(false);
      }, autoRefreshInterval * 1000);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefreshInterval, loadReplicationOverview]);

  // Handle Create Physical Slot
  const handleCreateSlot = async () => {
    const slotName = newSlotName.trim();
    if (!slotName) {
      setCreateSlotError(isEn ? 'Slot name cannot be empty' : 'نام اسلات نمی‌تواند خالی باشد');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(slotName)) {
      setCreateSlotError(
        isEn
          ? 'Slot name must contain only lowercase letters, numbers, and underscores'
          : 'نام اسلات باید فقط شامل حروف کوچک انگلیسی، اعداد و خط زیرین باشد'
      );
      return;
    }

    setCreateSlotLoading(true);
    setCreateSlotError(null);
    try {
      const res = await manageRemoteServerPostgresReplicationSlot(server.id, {
        slotName,
        action: 'create',
        slotType: 'physical',
        immediatelyReserve: newSlotReserve,
      });

      if (res.success) {
        setIsCreateSlotModalOpen(false);
        setNewSlotName('');
        await loadReplicationOverview(false);
      } else {
        setCreateSlotError(
          isEn
            ? res.error || res.message || 'Failed to create replication slot'
            : res.messageFa || res.error || 'خطا در ایجاد اسلات رپلیکیشن'
        );
      }
    } catch (err: any) {
      setCreateSlotError(err.message || 'Error executing request');
    } finally {
      setCreateSlotLoading(false);
    }
  };

  // Handle Drop Slot
  const handleDropSlot = async () => {
    if (!slotToDrop) return;
    setDropSlotLoading(true);
    setDropSlotError(null);
    try {
      const res = await manageRemoteServerPostgresReplicationSlot(server.id, {
        slotName: slotToDrop.slotName,
        action: 'drop',
      });

      if (res.success) {
        setSlotToDrop(null);
        await loadReplicationOverview(false);
      } else {
        setDropSlotError(
          isEn
            ? res.error || res.message || 'Failed to drop replication slot'
            : res.messageFa || res.error || 'خطا در حذف اسلات رپلیکیشن'
        );
      }
    } catch (err: any) {
      setDropSlotError(err.message || 'Error executing request');
    } finally {
      setDropSlotLoading(false);
    }
  };

  // Handle Standby Replay Pause / Resume
  const handleReplayControl = async () => {
    setReplayControlLoading(true);
    setReplayControlError(null);
    try {
      const res = await controlRemoteServerPostgresWalReplay(server.id, {
        action: replayActionTarget,
      });

      if (res.success) {
        setIsReplayConfirmModalOpen(false);
        await loadReplicationOverview(false);
      } else {
        setReplayControlError(
          isEn
            ? res.error || res.message || 'Failed to change WAL replay state'
            : res.messageFa || res.error || 'خطا در تغییر وضعیت پخش WAL'
        );
      }
    } catch (err: any) {
      setReplayControlError(err.message || 'Error executing request');
    } finally {
      setReplayControlLoading(false);
    }
  };

  // Filtered Replicas
  const filteredReplicas = useMemo(() => {
    if (!overview || !overview.replicas) return [];
    return overview.replicas.filter((r) => {
      if (!replicaSearch.trim()) return true;
      const q = replicaSearch.toLowerCase();
      return (
        r.applicationName.toLowerCase().includes(q) ||
        r.clientAddr.toLowerCase().includes(q) ||
        r.usename.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.syncState.toLowerCase().includes(q)
      );
    });
  }, [overview, replicaSearch]);

  // Filtered Slots
  const filteredSlots = useMemo(() => {
    if (!overview || !overview.replicationSlots) return [];
    return overview.replicationSlots.filter((s) => {
      if (slotTypeFilter !== 'all' && s.slotType !== slotTypeFilter) return false;
      if (!slotSearch.trim()) return true;
      const q = slotSearch.toLowerCase();
      return (
        s.slotName.toLowerCase().includes(q) ||
        (s.plugin && s.plugin.toLowerCase().includes(q)) ||
        (s.database && s.database.toLowerCase().includes(q))
      );
    });
  }, [overview, slotSearch, slotTypeFilter]);

  // Max lag among replicas
  const maxReplicaLag = useMemo(() => {
    if (!overview || !overview.replicas || overview.replicas.length === 0) return null;
    let maxBytes = 0;
    let maxSec = 0;
    overview.replicas.forEach((r) => {
      if (r.replayLagBytes > maxBytes) maxBytes = r.replayLagBytes;
      if (r.replayLagSeconds && r.replayLagSeconds > maxSec) maxSec = r.replayLagSeconds;
    });
    return {
      bytes: maxBytes,
      seconds: maxSec,
      isCritical: maxBytes > 50 * 1024 * 1024 || maxSec > 30,
    };
  }, [overview]);

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isLightMode
            ? 'bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-white border-emerald-200 shadow-sm'
            : 'bg-gradient-to-r from-emerald-950/40 via-teal-950/20 to-slate-900 border-emerald-500/20 shadow-md'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                isLightMode
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-700 shadow-xs'
                  : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
              }`}
            >
              <GitFork className="w-6 h-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{isEn ? 'Replication & High-Availability Monitor' : 'پایش رپلیکیشن و دسترسی‌پذیری بالا (HA)'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Replication & Cluster Health' : 'پایش رپلیکیشن و کلاستر'}
                    infoWhatEn="Live inspection of Primary and Standby cluster topology, streaming replication lag, WAL positions, replication slots, and WAL receiver telemetry."
                    infoWhatFa="پایش بلادرنگ معماری کلاستر پرایمری و استندبای، تاخیر رپلیکیشن استریمینگ، موقعیت لاگ‌های WAL، اسلات‌های رپلیکیشن و فرآیند دریافت لاگ."
                    infoWhyEn="Prevents data loss, monitors replication delay between master and read-replicas, and guards against disk exhaustion caused by orphaned replication slots."
                    infoWhyFa="جلوگیری از ریزش داده‌ها، پایش تاخیر همگام‌سازی بین نود اصلی و رپلیکاهای خواندنی، و محافظت در برابر پر شدن دیسک ناشی از اسلات‌های رپلیکیشن رهاشده."
                    infoExampleEn="Verify streaming lag is < 1 MB and 0 seconds, check physical replication slots are active, or pause WAL replay on a replica before testing DDL."
                    infoExampleFa="اطمینان از صفر بودن تاخیر رپلیکیشن، بررسی فعال بودن اسلات‌های فیزیکی، یا متوقف کردن موقت پخش WAL در نود رید-اونلی قبل از تست DDL."
                  />
                </h3>

                {overview && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                      overview.role === 'primary'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        overview.role === 'primary' ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'
                      }`}
                    />
                    {overview.role === 'primary'
                      ? isEn
                        ? 'PRIMARY (Read/Write Master)'
                        : 'پرایمری (نود اصلی خواندن/نوشتن)'
                      : isEn
                      ? 'STANDBY (Read-Only Replica)'
                      : 'استندبای (رپلیکای خواندنی)'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'Real-time telemetry from pg_stat_replication, pg_replication_slots, pg_stat_wal_receiver, and pg_is_in_recovery().'
                  : 'تلمتری لحظه‌ای از کاتالوگ‌های pg_stat_replication، pg_replication_slots، pg_stat_wal_receiver و تابع pg_is_in_recovery().'}
              </p>
            </div>
          </div>

          {/* Action controls */}
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
                <option value={0}>{isEn ? 'Manual only' : 'دستی'}</option>
                <option value={2}>{isEn ? 'Every 2s (Live)' : 'هر ۲ ثانیه (زنده)'}</option>
                <option value={5}>{isEn ? 'Every 5s' : 'هر ۵ ثانیه'}</option>
                <option value={10}>{isEn ? 'Every 10s' : 'هر ۱۰ ثانیه'}</option>
                <option value={30}>{isEn ? 'Every 30s' : 'هر ۳۰ ثانیه'}</option>
              </select>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => loadReplicationOverview(true)}
              disabled={loading}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
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
            <p className="font-semibold">{isEn ? 'Telemetry Retrieval Warning' : 'هشدار در دریافت اطلاعات رپلیکیشن'}</p>
            <p className="mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* CRITICAL ALERT: INACTIVE REPLICATION SLOTS RETAINING WAL */}
      {overview && overview.hasInactiveSlotsRisk && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse ${
            isLightMode
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-amber-950/40 border-amber-600/50 text-amber-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-sm">
                {isEn ? 'Critical WAL Retention Risk Detected!' : 'هشدار بحرانی: تجمع فایل‌های WAL توسط اسلات غیرفعال!'}
              </p>
              <p className="mt-1 opacity-90 leading-relaxed">
                {isEn
                  ? 'One or more replication slots are INACTIVE but retaining over 100 MB of WAL logs on disk. If left orphaned, PostgreSQL will never delete WAL segments, which will eventually exhaust server disk space and halt the database.'
                  : 'یک یا چند اسلات رپلیکیشن در حالت غیرفعال (Inactive) قرار دارند اما بیش از ۱۰۰ مگابایت لاگ WAL را روی دیسک نگه داشته‌اند. در صورت رها شدن، دیتابیس فایل‌های WAL را پاک نخواهد کرد و فضای دیسک سرور کاملا پر خواهد شد.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSubView('slots')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shrink-0 cursor-pointer shadow-xs transition"
          >
            {isEn ? 'Inspect & Drop Slots' : 'بررسی و آزادسازی اسلات‌ها'}
          </button>
        </div>
      )}

      {/* STANDBY REPLAY PAUSED ALERT */}
      {overview && overview.inRecovery && overview.walReceiver?.isReplayPaused && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            isLightMode ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-blue-950/40 border-blue-600/50 text-blue-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <Pause className="w-5 h-5 shrink-0 text-blue-400 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-sm">
                {isEn ? 'WAL Replay is Currently Paused on this Standby' : 'فرآیند بازپخش WAL روی این نود استندبای متوقف شده است'}
              </p>
              <p className="mt-1 opacity-90">
                {isEn
                  ? 'Standby is receiving WAL records from primary but is not applying them to data files. Replay was paused via pg_wal_replay_pause().'
                  : 'نود استندبای لاگ‌ها را دریافت می‌کند اما آن‌ها را روی فایل‌های داده اعمال نمی‌کند زیرا پخش موقتا متوقف شده است.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setReplayActionTarget('resume');
              setIsReplayConfirmModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 cursor-pointer shadow-xs transition flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isEn ? 'Resume WAL Replay' : 'از سرگیری بازپخش'}</span>
          </button>
        </div>
      )}

      {/* TOP KPI CARDS */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Cluster Role & Engine Mode */}
          <div
            className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Node Role' : 'نقش نود در کلاستر'}</span>
              <Server className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold flex items-center gap-2">
              <span className={overview.role === 'primary' ? 'text-emerald-400' : 'text-cyan-400'}>
                {overview.role === 'primary'
                  ? isEn
                    ? 'Primary Node'
                    : 'نود پرایمری'
                  : isEn
                  ? 'Standby Replica'
                  : 'استندبای رپلیکا'}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
              <span>wal_level: {overview.walLevel}</span>
              <span>•</span>
              <span>{overview.hotStandby ? 'Hot Standby' : 'Standard'}</span>
            </div>
          </div>

          {/* Card 2: Connected Replicas or Receiver Status */}
          <div
            className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>
                {overview.role === 'primary'
                  ? isEn
                    ? 'Connected Replicas'
                    : 'رپلیکاهای متصل'
                  : isEn
                  ? 'WAL Receiver'
                  : 'دریافت‌کننده WAL'}
              </span>
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono">
              {overview.role === 'primary' ? (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">{overview.connectedReplicasCount}</span>
                  <span className="text-xs font-normal text-slate-400 font-sans">
                    {isEn ? 'active stream(s)' : 'جریان فعال'}
                  </span>
                </div>
              ) : (
                <span
                  className={`text-sm ${
                    overview.walReceiver?.status === 'streaming'
                      ? 'text-emerald-400'
                      : overview.walReceiver?.status === 'stopped'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {overview.walReceiver?.status ? overview.walReceiver.status.toUpperCase() : 'UNKNOWN'}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 truncate">
              {overview.role === 'primary' ? (
                overview.synchronousStandbyNames ? (
                  <span className="text-emerald-500">Sync: {overview.synchronousStandbyNames}</span>
                ) : (
                  <span>{isEn ? 'Asynchronous replication' : 'رپلیکیشن آسنکرون'}</span>
                )
              ) : overview.walReceiver?.senderHost ? (
                <span>
                  from {overview.walReceiver.senderHost}:{overview.walReceiver.senderPort || 5432}
                </span>
              ) : (
                <span>{isEn ? 'Receiver idle' : 'آماده دریافت'}</span>
              )}
            </div>
          </div>

          {/* Card 3: Replication Lag */}
          <div
            className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Replication Lag' : 'تاخیر رپلیکیشن'}</span>
              <Activity className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono">
              {overview.role === 'primary' ? (
                maxReplicaLag ? (
                  <span className={maxReplicaLag.isCritical ? 'text-rose-400' : 'text-emerald-400'}>
                    {maxReplicaLag.bytes > 1024 * 1024
                      ? `${(maxReplicaLag.bytes / (1024 * 1024)).toFixed(2)} MB`
                      : maxReplicaLag.bytes > 1024
                      ? `${(maxReplicaLag.bytes / 1024).toFixed(1)} KB`
                      : `${maxReplicaLag.bytes} B`}
                  </span>
                ) : (
                  <span className="text-slate-400 text-sm">{isEn ? 'No Replicas' : 'بدون رپلیکا'}</span>
                )
              ) : overview.walReceiver?.replayLagSeconds !== undefined ? (
                <span className="text-emerald-400">
                  {overview.walReceiver.replayLagSeconds < 1
                    ? isEn
                      ? 'Real-Time (<1s)'
                      : 'بلادرنگ (<۱ ثانیه)'
                    : `${overview.walReceiver.replayLagSeconds}s`}
                </span>
              ) : (
                <span className="text-slate-400 text-sm">0s</span>
              )}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {overview.role === 'primary' ? (
                maxReplicaLag && maxReplicaLag.seconds > 0 ? (
                  <span>
                    {isEn ? 'Lag time: ' : 'زمان تاخیر: '}
                    {maxReplicaLag.seconds}s
                  </span>
                ) : (
                  <span>{isEn ? 'In sync' : 'کاملاً همگام'}</span>
                )
              ) : (
                <span>{isEn ? 'Standby Replay Lag' : 'تاخیر اعمال تغییرات'}</span>
              )}
            </div>
          </div>

          {/* Card 4: Replication Slots */}
          <div
            className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Replication Slots' : 'اسلات‌های رپلیکیشن'}</span>
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono flex items-center gap-2">
              <span className="text-purple-400">{overview.replicationSlots.length}</span>
              <span className="text-xs font-normal text-slate-400 font-sans">
                ({overview.replicationSlots.filter((s) => s.active).length} {isEn ? 'active' : 'فعال'})
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {overview.replicationSlots.some((s) => s.isRetainingWalRisk) ? (
                <span className="text-rose-400 font-semibold">{isEn ? 'WAL Retention Risk!' : 'خطر پر شدن WAL!'}</span>
              ) : (
                <span>
                  {overview.maxReplicationSlots} {isEn ? 'max slots allowed' : 'حداکثر اسلات مجاز'}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LSN WAL POSITIONS STRIP */}
      {overview && (
        <div
          className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-slate-400">{isEn ? 'Current WAL LSN:' : 'موقعیت فعلی WAL:'}</span>
              <span className="font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                {overview.currentWalLsn || overview.lastWalReplayLsn || 'N/A'}
              </span>
            </div>

            {overview.inRecovery && overview.lastWalReplayLsn && (
              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-slate-400">{isEn ? 'Last Replay LSN:' : 'آخرین موقعیت بازپخش:'}</span>
                <span className="font-semibold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
                  {overview.lastWalReplayLsn}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-slate-400">
              <span>{isEn ? 'Max Senders:' : 'حداکثر فرستنده:'}</span>
              <span className="font-mono text-slate-200">{overview.maxWalSenders}</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>
              {isEn ? 'Updated: ' : 'بروزرسانی: '}
              {new Date(overview.retrievedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}

      {/* SUB-VIEW NAVIGATION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-800/40 border border-slate-700/40">
          {overview?.role === 'primary' && (
            <button
              type="button"
              onClick={() => setSubView('replicas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                subView === 'replicas'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isEn ? 'Connected Replicas' : 'رپلیکاهای متصل'}</span>
              {overview && overview.replicas.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                  {overview.replicas.length}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubView('slots')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              subView === 'slots'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            <span>{isEn ? 'Replication Slots' : 'اسلات‌های رپلیکیشن'}</span>
            {overview && overview.replicationSlots.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20 text-white">
                {overview.replicationSlots.length}
              </span>
            )}
          </button>

          {overview?.inRecovery && (
            <button
              type="button"
              onClick={() => setSubView('standby_receiver')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                subView === 'standby_receiver'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'Standby Receiver & Controls' : 'دریافت‌کننده استندبای و کنترل پخش'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSubView('ha_guide')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              subView === 'ha_guide'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitFork className="w-3.5 h-3.5 text-blue-400" />
            <span>{isEn ? 'HA Architecture & Failover Guide' : 'راهنمای معماری HA و سناریوهای Failover'}</span>
          </button>
        </div>

        {subView === 'slots' && (
          <button
            type="button"
            onClick={() => {
              setNewSlotName('');
              setNewSlotReserve(true);
              setCreateSlotError(null);
              setIsCreateSlotModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Create Physical Slot' : 'ایجاد اسلات فیزیکی جدید'}</span>
          </button>
        )}
      </div>

      {/* SUB-VIEW 1: CONNECTED REPLICAS TABLE */}
      {subView === 'replicas' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={replicaSearch}
                onChange={(e) => setReplicaSearch(e.target.value)}
                placeholder={
                  isEn
                    ? 'Search by application name, IP address, user, or state...'
                    : 'جستجو بر اساس نام برنامه، آی‌پی، کاربر یا وضعیت...'
                }
                className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border font-sans transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-emerald-500'
                    : 'bg-slate-900/80 border-slate-800 text-slate-200 placeholder-slate-500 focus:border-emerald-500'
                }`}
              />
            </div>
          </div>

          {filteredReplicas.length === 0 ? (
            <div
              className={`p-10 text-center rounded-2xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-900/30 border-slate-800 text-slate-400'
              }`}
            >
              <Radio className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-50" />
              <p className="font-semibold text-sm">
                {overview?.connectedReplicasCount === 0
                  ? isEn
                    ? 'No Standby Replicas Connected'
                    : 'هیچ رپلیکای استندبای متصلی یافت نشد'
                  : isEn
                  ? 'No matching replicas found for search query'
                  : 'رپلیکایی مطابق با عبارت جستجو یافت نشد'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {overview?.connectedReplicasCount === 0
                  ? isEn
                    ? 'This PostgreSQL node is running as standalone Primary. Follow the HA Architecture Guide tab to configure streaming replication.'
                    : 'این نود در حال حاضر به عنوان پرایمری مستقل کار می‌کند. برای راه‌اندازی رپلیکیشن، تب راهنمای HA را بررسی نمایید.'
                  : ''}
              </p>
            </div>
          ) : (
            <div
              className={`rounded-2xl border overflow-hidden ${
                isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr
                      className={`border-b ${
                        isLightMode ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                      }`}
                    >
                      <th className="py-3 px-3">{isEn ? 'Client / Replica' : 'کلاینت / رپلیکا'}</th>
                      <th className="py-3 px-3">{isEn ? 'Application' : 'نام برنامه'}</th>
                      <th className="py-3 px-3">{isEn ? 'State & Mode' : 'وضعیت و همگام‌سازی'}</th>
                      <th className="py-3 px-3">{isEn ? 'Replication Lag' : 'تاخیر رپلیکیشن'}</th>
                      <th className="py-3 px-3 font-mono">{isEn ? 'Replay LSN' : 'موقعیت LSN'}</th>
                      <th className="py-3 px-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {filteredReplicas.map((r) => (
                      <tr
                        key={r.pid}
                        className={`transition ${
                          isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Client Address */}
                        <td className="py-3 px-3">
                          <div className="font-mono font-semibold flex items-center gap-1.5">
                            <span className="text-emerald-400">{r.clientAddr}</span>
                            {r.clientPort && <span className="text-slate-500 text-[10px]">:{r.clientPort}</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                            <span>PID: {r.pid}</span>
                            <span>•</span>
                            <span>{r.usename}</span>
                          </div>
                        </td>

                        {/* Application Name */}
                        <td className="py-3 px-3">
                          <span className="font-mono text-slate-200 font-semibold">
                            {r.applicationName || 'walreceiver'}
                          </span>
                          {r.clientHostname && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                              {r.clientHostname}
                            </div>
                          )}
                        </td>

                        {/* State & Sync */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                r.state === 'streaming'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : r.state === 'catchup'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              }`}
                            >
                              {r.state}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                r.syncState === 'sync'
                                  ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                                  : 'bg-slate-700/50 text-slate-300'
                              }`}
                            >
                              {r.syncState.toUpperCase()}
                            </span>
                          </div>
                        </td>

                        {/* Lag */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                r.isLagCritical
                                  ? 'text-rose-400'
                                  : r.replayLagBytes > 5 * 1024 * 1024
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {r.replayLagPretty}
                            </span>
                            {r.replayLagSeconds !== undefined && r.replayLagSeconds > 0 && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({r.replayLagSeconds}s)
                              </span>
                            )}
                          </div>
                          {r.isLagCritical && (
                            <span className="text-[9px] text-rose-400 font-semibold block mt-0.5">
                              {isEn ? 'High Lag Warning' : 'هشدار تاخیر بالا'}
                            </span>
                          )}
                        </td>

                        {/* Replay LSN */}
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                          <div className="flex items-center gap-1">
                            <span>{r.replayLsn || 'N/A'}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(r.replayLsn, `lsn-${r.pid}`)}
                              className="text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                              title={isEn ? 'Copy LSN' : 'کپی LSN'}
                            >
                              {copiedQueryKey === `lsn-${r.pid}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Sent: {r.sentLsn}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReplicaDetails(r)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                          >
                            {isEn ? 'Details' : 'جزئیات'}
                          </button>
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

      {/* SUB-VIEW 2: REPLICATION SLOTS */}
      {subView === 'slots' && (
        <div className="space-y-4">
          {/* Controls: Search and Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full sm:w-auto">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={slotSearch}
                onChange={(e) => setSlotSearch(e.target.value)}
                placeholder={isEn ? 'Search replication slots...' : 'جستجو در اسلات‌ها...'}
                className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border font-sans transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                    : 'bg-slate-900/80 border-slate-800 text-slate-200 placeholder-slate-500'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <span className="text-xs text-slate-400">{isEn ? 'Type:' : 'نوع:'}</span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-800/40 border border-slate-700/40 text-xs">
                {(['all', 'physical', 'logical'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSlotTypeFilter(t)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition ${
                      slotTypeFilter === t
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t === 'all' ? (isEn ? 'All' : 'همه') : t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredSlots.length === 0 ? (
            <div
              className={`p-10 text-center rounded-2xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-900/30 border-slate-800 text-slate-400'
              }`}
            >
              <HardDrive className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-50" />
              <p className="font-semibold text-sm">
                {isEn ? 'No Replication Slots Configured' : 'هیچ اسلات رپلیکیشنی تعریف نشده است'}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {isEn
                  ? 'Replication slots guarantee that PostgreSQL will not remove WAL segments needed by a standby until they are consumed. You can create a physical slot for your replicas.'
                  : 'اسلات‌های رپلیکیشن تضمین می‌کنند که لاگ‌های WAL مورد نیاز استندبای تا زمان مصرف حذف نشوند. می‌توانید یک اسلات فیزیکی برای رپلیکای خود ایجاد نمایید.'}
              </p>
            </div>
          ) : (
            <div
              className={`rounded-2xl border overflow-hidden ${
                isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr
                      className={`border-b ${
                        isLightMode ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                      }`}
                    >
                      <th className="py-3 px-3">{isEn ? 'Slot Name' : 'نام اسلات'}</th>
                      <th className="py-3 px-3">{isEn ? 'Type & Plugin' : 'نوع و پلاگین'}</th>
                      <th className="py-3 px-3">{isEn ? 'Active State' : 'وضعیت اتصال'}</th>
                      <th className="py-3 px-3">{isEn ? 'Retained WAL' : 'فضای اشغال‌شده WAL'}</th>
                      <th className="py-3 px-3 font-mono">{isEn ? 'Restart LSN' : 'موقعیت Restart LSN'}</th>
                      <th className="py-3 px-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {filteredSlots.map((s) => (
                      <tr
                        key={s.slotName}
                        className={`transition ${
                          s.isRetainingWalRisk
                            ? isLightMode
                              ? 'bg-rose-50/60'
                              : 'bg-rose-950/20'
                            : isLightMode
                            ? 'hover:bg-slate-50/80'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Slot Name */}
                        <td className="py-3 px-3 font-mono font-bold text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span>{s.slotName}</span>
                            {s.temporary && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-slate-700 text-slate-300">
                                TEMP
                              </span>
                            )}
                          </div>
                          {s.database && (
                            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                              {isEn ? 'DB: ' : 'دیتابیس: '}
                              {s.database}
                            </div>
                          )}
                        </td>

                        {/* Type & Plugin */}
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              s.slotType === 'physical'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {s.slotType}
                          </span>
                          {s.plugin && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {s.plugin}
                            </div>
                          )}
                        </td>

                        {/* Active State */}
                        <td className="py-3 px-3">
                          {s.active ? (
                            <div className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span className="font-semibold">{isEn ? 'Active' : 'متصل و فعال'}</span>
                              {s.activePid && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  (PID: {s.activePid})
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span className="font-semibold">{isEn ? 'Inactive' : 'غیرفعال'}</span>
                            </div>
                          )}
                        </td>

                        {/* Retained WAL */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-mono font-bold ${
                                s.isRetainingWalRisk
                                  ? 'text-rose-400 animate-pulse'
                                  : s.retainedBytes > 10 * 1024 * 1024
                                  ? 'text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {s.retainedPretty}
                            </span>
                          </div>
                          {s.isRetainingWalRisk && (
                            <span className="text-[9px] text-rose-400 font-semibold block mt-0.5">
                              {isEn ? 'Risk: Holding WAL Files' : 'خطر: عدم آزادسازی دیسک'}
                            </span>
                          )}
                        </td>

                        {/* Restart LSN */}
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                          <div>{s.restartLsn || 'N/A'}</div>
                          {s.confirmedFlushLsn && (
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Flush: {s.confirmedFlushLsn}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSlotToDrop(s);
                              setDropSlotError(null);
                            }}
                            className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-600 transition cursor-pointer border border-rose-500/30"
                            title={isEn ? 'Drop replication slot' : 'حذف اسلات رپلیکیشن'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* SUB-VIEW 3: STANDBY RECEIVER & CONTROLS */}
      {subView === 'standby_receiver' && overview?.walReceiver && (
        <div className="space-y-4">
          <div
            className={`p-5 rounded-2xl border ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-700/30">
              <div>
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? 'WAL Receiver Process (pg_stat_wal_receiver)' : 'فرآیند دریافت لاگ (pg_stat_wal_receiver)'}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isEn
                    ? 'Monitors the background stream receiving WAL blocks from the primary server.'
                    : 'پایش فرآیند پس‌زمینه دریافت بلاک‌های WAL از سرور پرایمری.'}
                </p>
              </div>

              {/* Pause / Resume Toolbar */}
              <div className="flex items-center gap-2">
                {overview.walReceiver.isReplayPaused ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReplayActionTarget('resume');
                      setIsReplayConfirmModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Resume WAL Replay' : 'ادامه بازپخش WAL'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReplayActionTarget('pause');
                      setIsReplayConfirmModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Pause WAL Replay' : 'توقف موقت بازپخش WAL'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Receiver Specs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">{isEn ? 'Receiver Status' : 'وضعیت گیرنده'}</span>
                <span className="font-bold text-sm text-emerald-400 uppercase mt-1 block">
                  {overview.walReceiver.status}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">{isEn ? 'Sender Primary Host' : 'آدرس هاست پرایمری'}</span>
                <span className="font-bold text-sm text-slate-200 mt-1 block">
                  {overview.walReceiver.senderHost || 'localhost'}:{overview.walReceiver.senderPort || 5432}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">{isEn ? 'Replication Slot' : 'اسلات رپلیکیشن'}</span>
                <span className="font-bold text-sm text-purple-400 mt-1 block">
                  {overview.walReceiver.slotName || (isEn ? 'None (Unslotted)' : 'بدون اسلات')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">{isEn ? 'Written LSN' : 'موقعیت LSN نوشته‌شده'}</span>
                <span className="font-bold text-sm text-cyan-300 mt-1 block">
                  {overview.walReceiver.writtenLsn || 'N/A'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">{isEn ? 'Flushed LSN' : 'موقعیت LSN فلاش‌شده'}</span>
                <span className="font-bold text-sm text-cyan-300 mt-1 block">
                  {overview.walReceiver.flushedLsn || 'N/A'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <span className="text-slate-400 block text-[11px] font-sans">{isEn ? 'Last Replay Time' : 'زمان آخرین تراکنش بازپخش'}</span>
                <span className="font-bold text-sm text-slate-200 mt-1 block font-sans">
                  {overview.walReceiver.lastXactReplayTimestamp
                    ? new Date(overview.walReceiver.lastXactReplayTimestamp).toLocaleTimeString()
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Sanitized Connection Info */}
            {overview.walReceiver.conninfoSanitized && (
              <div className="mt-4 p-3 rounded-xl bg-slate-800/20 border border-slate-700/30 text-xs">
                <span className="text-slate-400 block mb-1 text-[11px]">
                  {isEn ? 'Sanitized Connection Info (conninfo):' : 'اطلاعات اتصال امن‌سازی‌شده (conninfo):'}
                </span>
                <code className="text-slate-300 font-mono text-[11px] break-all">
                  {overview.walReceiver.conninfoSanitized}
                </code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: HA ARCHITECTURE & FAILOVER GUIDE */}
      {subView === 'ha_guide' && (
        <div className="space-y-4">
          <div
            className={`p-5 rounded-2xl border ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <h4 className="font-bold text-sm flex items-center gap-2 text-blue-400">
              <GitFork className="w-4 h-4" />
              <span>{isEn ? 'PostgreSQL High Availability & Failover Blueprint' : 'نقشه راه معماری دسترسی‌پذیری بالا و انتقال بحران (Failover)'}</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isEn
                ? 'Standard industry procedures and SQL commands for promoting standbys, configuring synchronous replication, and monitoring cluster health.'
                : 'دستورالعمل‌های استاندارد مهندسی و فرامین SQL برای ارتقای استندبای به پرایمری (Failover)، پیکربندی رپلیکیشن سنکرون و نظارت بر سلامت کلاستر.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              {/* Command 1: Promote Standby */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-200">
                    {isEn ? '1. Promote Standby to Primary (Failover)' : '۱. ارتقای استندبای به پرایمری (دستور Promote)'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopy('SELECT pg_promote();', 'sql-promote')}
                      className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                      title={isEn ? 'Copy SQL' : 'کپی کوئری'}
                    >
                      {copiedQueryKey === 'sql-promote' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {onNavigateToSqlStudio && (
                      <button
                        type="button"
                        onClick={() => onNavigateToSqlStudio('SELECT pg_promote();')}
                        className="text-blue-400 hover:text-blue-300 p-1 rounded cursor-pointer"
                        title={isEn ? 'Open in SQL Studio' : 'اجرا در SQL Studio'}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  {isEn
                    ? 'Promotes this standby replica to a standalone writable primary node (PostgreSQL 12+). The node exits recovery mode immediately.'
                    : 'نود استندبای را به نود اصلی با قابلیت خواندن و نوشتن ارتقا می‌دهد (نسخه ۱۲ به بالا) و بلافاصله از حالت ریکاوری خارج می‌شود.'}
                </p>
                <pre className="p-2.5 rounded-lg bg-black/40 text-[11px] font-mono text-emerald-400 overflow-x-auto">
                  SELECT pg_promote();
                </pre>
              </div>

              {/* Command 2: Replication Lag Inspection */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-200">
                    {isEn ? '2. Live Replication Lag in Bytes' : '۲. محاسبه تاخیر رپلیکیشن بر حسب بایت'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `SELECT application_name, client_addr, pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes FROM pg_stat_replication;`,
                          'sql-lag'
                        )
                      }
                      className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                      title={isEn ? 'Copy SQL' : 'کپی کوئری'}
                    >
                      {copiedQueryKey === 'sql-lag' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {onNavigateToSqlStudio && (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToSqlStudio(
                            `SELECT application_name, client_addr, pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes FROM pg_stat_replication;`
                          )
                        }
                        className="text-blue-400 hover:text-blue-300 p-1 rounded cursor-pointer"
                        title={isEn ? 'Open in SQL Studio' : 'اجرا در SQL Studio'}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  {isEn
                    ? 'Computes exact byte lag between primary WAL write position and replica replay position using pg_wal_lsn_diff.'
                    : 'محاسبه اختلاف بایت بین موقعیت نوشتن WAL در پرایمری و موقعیت پخش در رپلیکا با تابع pg_wal_lsn_diff.'}
                </p>
                <pre className="p-2.5 rounded-lg bg-black/40 text-[11px] font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                  {`SELECT application_name, client_addr, pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes FROM pg_stat_replication;`}
                </pre>
              </div>

              {/* Command 3: Synchronous Standby Tuning */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-2">
                <span className="font-bold text-xs text-slate-200 block">
                  {isEn ? '3. Zero Data Loss (Synchronous Replication)' : '۳. رپلیکیشن سنکرون جهت تضمین عدم ریزش داده'}
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  {isEn
                    ? 'In postgresql.conf, set synchronous_commit = on and define which standby nodes must acknowledge commit before returning to client:'
                    : 'در فایل postgresql.conf با تنظیم synchronous_commit = on و تعیین نام استندبای‌ها در synchronous_standby_names، تراکنش‌ها فقط پس از تایید رپلیکا کامیت می‌شوند:'}
                </p>
                <pre className="p-2.5 rounded-lg bg-black/40 text-[11px] font-mono text-amber-300 overflow-x-auto whitespace-pre-wrap">
                  {`synchronous_commit = on\nsynchronous_standby_names = 'FIRST 1 (standby_node1, standby_node2)'`}
                </pre>
              </div>

              {/* Command 4: Orphaned Slots Cleanup */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-2">
                <span className="font-bold text-xs text-slate-200 block">
                  {isEn ? '4. Orphaned Slots & Disk Space Hygiene' : '۴. محافظت دیسک و پاکسازی اسلات‌های رهاشده'}
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  {isEn
                    ? 'Always drop replication slots for decommissioned servers. Also configure max_slot_wal_keep_size in postgresql.conf (e.g. 50GB) to cap maximum disk retained by a stalled slot.'
                    : 'اسلات‌های متعلق به سرورهای خاموش را حتما حذف کنید. همچنین پارامتر max_slot_wal_keep_size را در postgresql.conf (مثلا ۵۰ گیگابایت) تنظیم کنید تا از پر شدن کل دیسک جلوگیری شود.'}
                </p>
                <pre className="p-2.5 rounded-lg bg-black/40 text-[11px] font-mono text-purple-300 overflow-x-auto whitespace-pre-wrap">
                  {`max_slot_wal_keep_size = 51200MB  -- Cap WAL retention\nwal_keep_size = 4096MB`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE REPLICATION SLOT */}
      {isCreateSlotModalOpen && (
        <div className="fixed inset-0 z-[999995] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <h4 className="font-bold text-sm flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4 text-purple-400" />
              <span>{isEn ? 'Create Physical Replication Slot' : 'ایجاد اسلات فیزیکی جدید'}</span>
            </h4>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {isEn
                ? 'Creates a new physical replication slot (pg_create_physical_replication_slot) to retain WAL files for your streaming replica.'
                : 'ایجاد اسلات رپلیکیشن فیزیکی جهت نگهداری فایل‌های لاگ WAL برای نودهای استریمینگ رپلیکا.'}
            </p>

            {createSlotError && (
              <div className="p-3 mb-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{createSlotError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-300">
                  {isEn ? 'Slot Name' : 'نام اسلات'}
                </label>
                <input
                  type="text"
                  value={newSlotName}
                  onChange={(e) => setNewSlotName(e.target.value)}
                  placeholder={isEn ? 'e.g., replica_node_1' : 'مثال: replica_node_1'}
                  className={`w-full px-3 py-2 rounded-xl border font-mono transition ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-800'
                      : 'bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="immediatelyReserve"
                  checked={newSlotReserve}
                  onChange={(e) => setNewSlotReserve(e.target.checked)}
                  className="rounded border-slate-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="immediatelyReserve" className="cursor-pointer text-slate-300 select-none">
                  {isEn ? 'Immediately reserve WAL at current LSN position' : 'رزرو فوری WAL در موقعیت فعلی LSN'}
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setIsCreateSlotModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleCreateSlot}
                disabled={createSlotLoading}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {createSlotLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEn ? 'Create Slot' : 'ایجاد اسلات'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DROP REPLICATION SLOT CONFIRMATION */}
      {slotToDrop && (
        <div className="fixed inset-0 z-[999995] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm">
                  {isEn ? 'Drop Replication Slot?' : 'حذف اسلات رپلیکیشن؟'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {isEn
                    ? `Are you sure you want to drop replication slot "${slotToDrop.slotName}"? Any standby replica connected via this slot will stop receiving changes, and retained WAL files will be purged.`
                    : `آیا از حذف اسلات رپلیکیشن "${slotToDrop.slotName}" اطمینان دارید؟ هر رپلیکایی که از این اسلات استفاده می‌کرده متوقف شده و فایل‌های لاگ نگهداری‌شده آزاد خواهند شد.`}
                </p>
              </div>
            </div>

            {dropSlotError && (
              <div className="p-3 my-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{dropSlotError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setSlotToDrop(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleDropSlot}
                disabled={dropSlotLoading}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {dropSlotLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEn ? 'Drop Slot' : 'حذف قطعی'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PAUSE / RESUME WAL REPLAY CONFIRMATION */}
      {isReplayConfirmModalOpen && (
        <div className="fixed inset-0 z-[999995] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  replayActionTarget === 'pause'
                    ? 'bg-amber-950/60 border border-amber-500/30 text-amber-400'
                    : 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-400'
                }`}
              >
                {replayActionTarget === 'pause' ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="font-bold text-sm">
                  {replayActionTarget === 'pause'
                    ? isEn
                      ? 'Pause WAL Replay on Standby?'
                      : 'توقف موقت بازپخش WAL در نود استندبای؟'
                    : isEn
                    ? 'Resume WAL Replay on Standby?'
                    : 'از سرگیری بازپخش WAL در نود استندبای؟'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {replayActionTarget === 'pause'
                    ? isEn
                      ? 'Pausing replay halts data updates on this replica while continuing to receive WAL streams from the primary. Useful for troubleshooting, consistency checks, or delaying bad DDL propagation.'
                      : 'توقف بازپخش باعث می‌شود تغییرات فعلا روی دیتابیس اعمال نشوند اما دریافت لاگ از پرایمری ادامه خواهد یافت. این ویژگی برای عیب‌یابی و تاخیر در اعمال تغییرات مخرب کاربرد دارد.'
                    : isEn
                    ? 'Resuming replay will apply all buffered WAL records and bring the standby back in sync with the primary.'
                    : 'ادامه بازپخش باعث می‌شود تمام لاگ‌های بافرشده اعمال گردیده و استندبای دوباره با پرایمری همگام شود.'}
                </p>
              </div>
            </div>

            {replayControlError && (
              <div className="p-3 my-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{replayControlError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setIsReplayConfirmModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleReplayControl}
                disabled={replayControlLoading}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
                  replayActionTarget === 'pause'
                    ? 'bg-amber-600 hover:bg-amber-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {replayControlLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {replayActionTarget === 'pause'
                    ? isEn
                      ? 'Confirm Pause'
                      : 'تایید توقف'
                    : isEn
                    ? 'Confirm Resume'
                    : 'تایید از سرگیری'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REPLICA DETAILS DRAWER */}
      {selectedReplicaDetails && (
        <div className="fixed inset-0 z-[999995] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl transition-all ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/40">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-sm">
                  {selectedReplicaDetails.applicationName || 'walreceiver'} (PID: {selectedReplicaDetails.pid})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReplicaDetails(null)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 mt-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                  <span className="text-slate-400 text-[10px] font-sans block">{isEn ? 'Client Address' : 'آدرس کلاینت'}</span>
                  <span className="text-slate-200 font-semibold">{selectedReplicaDetails.clientAddr}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                  <span className="text-slate-400 text-[10px] font-sans">{isEn ? 'Sync Mode' : 'حالت همگام‌سازی'}</span>
                  <span className="text-purple-300 font-semibold uppercase">{selectedReplicaDetails.syncState}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">{isEn ? 'Sent LSN:' : 'موقعیت ارسالی (Sent):'}</span>
                  <span className="text-slate-200">{selectedReplicaDetails.sentLsn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{isEn ? 'Write LSN:' : 'موقعیت نوشتن (Write):'}</span>
                  <span className="text-slate-200">{selectedReplicaDetails.writeLsn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{isEn ? 'Flush LSN:' : 'موقعیت فلاش (Flush):'}</span>
                  <span className="text-slate-200">{selectedReplicaDetails.flushLsn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{isEn ? 'Replay LSN:' : 'موقعیت بازپخش (Replay):'}</span>
                  <span className="text-emerald-400 font-bold">{selectedReplicaDetails.replayLsn}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                  <span className="text-slate-400 text-[10px] font-sans block">{isEn ? 'Byte Lag' : 'تاخیر بایتی'}</span>
                  <span className="text-slate-200 font-semibold">{selectedReplicaDetails.replayLagPretty}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                  <span className="text-slate-400 text-[10px] font-sans block">{isEn ? 'Time Lag' : 'تاخیر زمانی'}</span>
                  <span className="text-slate-200 font-semibold">
                    {selectedReplicaDetails.replayLagSeconds !== undefined ? `${selectedReplicaDetails.replayLagSeconds}s` : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
                <span className="text-slate-400 text-[10px] font-sans block">{isEn ? 'Stream Started At' : 'زمان برقراری اتصال استریم'}</span>
                <span className="text-slate-200 font-sans">
                  {new Date(selectedReplicaDetails.backendStart).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setSelectedReplicaDetails(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
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
