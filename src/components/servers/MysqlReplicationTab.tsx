import React, { useState, useEffect, useCallback } from 'react';
import {
  GitFork,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Lock,
  Unlock,
  Copy,
  Check,
  Server,
  Database,
  Layers,
  Activity,
  Terminal,
  Clock,
  HardDrive,
  Network,
  Shield,
  FileText,
  Sliders,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlReplicationOverview,
  MysqlReplicationRole,
  MysqlReplicationChannelStatus,
  MysqlReplicationActionType,
} from '../../types';
import {
  fetchRemoteServerMysqlReplicationOverview,
  executeRemoteServerMysqlReplicationAction,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface MysqlReplicationTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
}

export const MysqlReplicationTab: React.FC<MysqlReplicationTabProps> = ({
  server,
  isLightMode,
  isEn,
}) => {
  const [overview, setOverview] = useState<MysqlReplicationOverview | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'channels' | 'replicas' | 'binlogs' | 'ha_cluster' | 'wizard'>('channels');
  
  // Action Dialog state
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    action: MysqlReplicationActionType;
    channelName?: string;
    titleEn: string;
    titleFa: string;
    descriptionEn: string;
    descriptionFa: string;
    requiresPurgeTarget?: boolean;
    purgeTargetType?: 'file' | 'datetime';
    purgeTargetValue?: string;
    requiresResetAll?: boolean;
    resetAllChecked?: boolean;
    isDangerous?: boolean;
  } | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const loadData = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchRemoteServerMysqlReplicationOverview(server.id, force);
      if (res.success && res.overview) {
        setOverview(res.overview);
      } else {
        setError(isEn ? (res.error || 'Failed to load replication overview') : (res.errorFa || 'خطا در بارگذاری اطلاعات رونویسی'));
      }
    } catch (err: any) {
      setError(err.message || (isEn ? 'Failed to fetch replication data' : 'خطا در برقراری ارتباط'));
    } finally {
      setLoading(false);
    }
  }, [server.id, isEn]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExecuteAction = async () => {
    if (!actionModal) return;
    try {
      setActionLoading(true);
      setActionFeedback(null);
      const res = await executeRemoteServerMysqlReplicationAction(server.id, {
        action: actionModal.action,
        channelName: actionModal.channelName,
        purgeTarget: actionModal.purgeTargetValue,
        resetAll: actionModal.resetAllChecked,
      });

      if (res.success) {
        setActionFeedback({
          success: true,
          message: isEn ? res.message : res.messageFa,
        });
        setActionModal(null);
        await loadData(true);
      } else {
        setActionFeedback({
          success: false,
          message: isEn ? res.message : res.messageFa,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        success: false,
        message: err.message || (isEn ? 'Action execution failed' : 'خطا در اجرای عملیات'),
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadge = (role: MysqlReplicationRole) => {
    switch (role) {
      case 'group_replication':
        return {
          label: isEn ? 'Group Replication (Cluster)' : 'گروه رونویسی (کلاستر)',
          bg: isLightMode ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-purple-950/60 text-purple-300 border-purple-700/60',
          icon: Layers,
        };
      case 'dual':
        return {
          label: isEn ? 'Dual Role (Source & Replica)' : 'دوگانه (مبدأ و رپلیکا)',
          bg: isLightMode ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60',
          icon: GitFork,
        };
      case 'replica':
        return {
          label: isEn ? 'Replica (Slave / Downstream)' : 'رپلیکا (پیرو / مقصَد)',
          bg: isLightMode ? 'bg-cyan-100 text-cyan-800 border-cyan-300' : 'bg-cyan-950/60 text-cyan-300 border-cyan-700/60',
          icon: Network,
        };
      case 'source':
        return {
          label: isEn ? 'Source (Master / Primary)' : 'مبدأ (مستر / پرایمری)',
          bg: isLightMode ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60',
          icon: Server,
        };
      default:
        return {
          label: isEn ? 'Standalone Server' : 'سرور منفرد (Standalone)',
          bg: isLightMode ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800/80 text-slate-300 border-slate-700',
          icon: Server,
        };
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <RefreshCw className="w-10 h-10 animate-spin text-cyan-500" />
        <p className={`text-sm ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
          {isEn ? 'Analyzing MySQL replication topologies and binary logs...' : 'در حال بررسی ساختار رونویسی و لاگ‌های باینری MySQL...'}
        </p>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className={`p-8 rounded-xl border m-4 ${
        isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
      }`}>
        <div className="flex items-center space-x-3 rtl:space-x-reverse mb-3">
          <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0" />
          <h3 className="font-semibold text-base">
            {isEn ? 'Replication Introspection Error' : 'خطای دریافت اطلاعات رونویسی'}
          </h3>
        </div>
        <p className="text-sm mb-4 font-mono whitespace-pre-wrap">{error}</p>
        <button
          onClick={() => loadData(true)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm flex items-center space-x-2 rtl:space-x-reverse transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{isEn ? 'Retry Query' : 'تلاش مجدد'}</span>
        </button>
      </div>
    );
  }

  if (!overview) return null;

  const roleMeta = getRoleBadge(overview.role);
  const RoleIcon = roleMeta.icon;

  return (
    <div className={`p-5 space-y-6 ${isLightMode ? 'text-slate-800' : 'text-slate-100'}`}>
      {/* Top Banner / KPIs */}
      <div className={`p-5 rounded-2xl border shadow-sm transition-all ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-dashed border-slate-700/40">
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className={`p-3 rounded-xl border ${roleMeta.bg}`}>
              <RoleIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <span className={`px-2.5 py-0.5 text-xs font-bold uppercase rounded-full border ${roleMeta.bg}`}>
                  {roleMeta.label}
                </span>
                {overview.isMariaDb && (
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                    isLightMode ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                  }`}>
                    MariaDB
                  </span>
                )}
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'MySQL Replication Role' : 'نقش سرور در رونویسی MySQL'}
                  infoWhatEn="Determines whether this MySQL server acts as a Replication Source (Master), Replica (Slave), Dual (Master & Slave in multi-tier chaining), Group Replication node, or Standalone."
                  infoWhatFa="مشخص می‌کند که آیا این سرور MySQL به عنوان مبدأ (Master)، رپلیکا (Slave)، دوگانه (Dual) یا سرور منفرد فعالیت دارد."
                  infoWhyEn="Knowing the exact node role prevents accidental writes to read-only replicas and ensures failover operations target the correct source node."
                  infoWhyFa="شناخت دقیق نقش سرور مانع از نوشتن ناخواسته بر روی رپلیکاهای فقط-خواندنی شده و پایداری زنجیره داده را تضمین می‌کند."
                  infoExampleEn="Single Primary topology: 1 Source (read/write) + 2 Replicas (read-only)."
                  infoExampleFa="توپولوژی تک مبدأ: یک سرور مبدأ برای نوشتن و خواندن + دو سرور رپلیکا به صورت فقط-خواندنی."
                />
              </div>
              <h2 className="text-lg font-bold mt-1 flex items-center space-x-2 rtl:space-x-reverse">
                <span>{server.name}</span>
                <span className="text-xs font-normal text-slate-400">({overview.serverVersion})</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <button
              onClick={() => loadData(true)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center space-x-1.5 rtl:space-x-reverse transition-colors ${
                isLightMode 
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' 
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
            </button>

            {/* Read-only Toggle quick control */}
            {overview.isReadOnly ? (
              <button
                onClick={() => setActionModal({
                  open: true,
                  action: 'set_read_write',
                  titleEn: 'Enable Read/Write Mode',
                  titleFa: 'فعال‌سازی حالت خواندن/نوشتن (Read/Write)',
                  descriptionEn: 'Disable READ_ONLY and SUPER_READ_ONLY on this MySQL server, allowing write queries from clients.',
                  descriptionFa: 'غیرفعال‌سازی حالت فقط-خواندنی و مجاز نمودن دستورات درج، ویرایش و حذف داده.',
                  isDangerous: false,
                })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-amber-600 hover:bg-amber-500 text-white border-amber-600 flex items-center space-x-1.5 rtl:space-x-reverse transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isEn ? 'Read-Only (Unlock)' : 'فقط-خواندنی (بازگشایی)'}</span>
              </button>
            ) : (
              <button
                onClick={() => setActionModal({
                  open: true,
                  action: 'set_read_only',
                  titleEn: 'Enforce Read-Only Mode',
                  titleFa: 'فعال‌سازی حالت فقط-خواندنی (Read-Only)',
                  descriptionEn: 'Set READ_ONLY and SUPER_READ_ONLY globally. Client write queries (INSERT/UPDATE/DELETE) will be rejected.',
                  descriptionFa: 'اعمال سراسری محدودیت فقط-خواندنی بر روی تمامی پایگاه‌ها به منظور جلوگیری از بروز تناقض در فرآیند رونویسی.',
                  isDangerous: true,
                })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center space-x-1.5 rtl:space-x-reverse transition-colors ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-amber-50 border-slate-300 text-slate-700 hover:text-amber-700 hover:border-amber-400'
                    : 'bg-slate-800 hover:bg-amber-950/40 border-slate-700 text-slate-200 hover:text-amber-300 hover:border-amber-600'
                }`}
              >
                <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isEn ? 'Read-Write (Lock)' : 'خواندن/نوشتن (قفل)'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Telemetry Pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
          {/* Server ID */}
          <div className={`p-2.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
            <span className="text-[11px] text-slate-400 block">{isEn ? 'Server ID' : 'شناسه سرور (ID)'}</span>
            <span className="text-sm font-bold font-mono text-cyan-400">{overview.serverId}</span>
          </div>

          {/* Binary Logging */}
          <div className={`p-2.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
            <span className="text-[11px] text-slate-400 block">{isEn ? 'Binary Log' : 'لاگ باینری (log_bin)'}</span>
            <div className="flex items-center space-x-1 rtl:space-x-reverse mt-0.5">
              {overview.binlogEnabled ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-500 uppercase">{overview.binlogFormat || 'ON'}</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-bold text-slate-400">OFF</span>
                </>
              )}
            </div>
          </div>

          {/* GTID Mode */}
          <div className={`p-2.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
            <span className="text-[11px] text-slate-400 block">{isEn ? 'GTID Mode' : 'وضعیت GTID'}</span>
            <span className={`text-xs font-bold uppercase font-mono ${
              overview.gtidMode === 'ON' ? 'text-emerald-400' : 'text-slate-400'
            }`}>
              {overview.gtidMode || 'OFF'}
            </span>
          </div>

          {/* Replica Channels */}
          <div className={`p-2.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
            <span className="text-[11px] text-slate-400 block">{isEn ? 'Replica Channels' : 'کانال‌های رونویسی'}</span>
            <span className="text-sm font-bold text-cyan-400">{overview.channels.length}</span>
          </div>

          {/* Connected Replicas */}
          <div className={`p-2.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
            <span className="text-[11px] text-slate-400 block">{isEn ? 'Connected Slaves' : 'رپلیکاهای متصل'}</span>
            <span className="text-sm font-bold text-cyan-400">{overview.connectedReplicas.length}</span>
          </div>

          {/* Total Binlog Storage */}
          <div className={`p-2.5 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
            <span className="text-[11px] text-slate-400 block">{isEn ? 'Binlog Disk Size' : 'حجم لاگ‌های باینری'}</span>
            <span className="text-xs font-bold font-mono text-amber-400">
              {overview.formattedTotalBinlogSize || '0 B'}
            </span>
          </div>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          actionFeedback.success 
            ? (isLightMode ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-emerald-950/50 border-emerald-800 text-emerald-200')
            : (isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/50 border-rose-800 text-rose-200')
        }`}>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            {actionFeedback.success ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-rose-500" />}
            <span className="text-sm font-medium">{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs px-2 py-1 rounded hover:bg-slate-500/20"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 rtl:space-x-reverse border-b border-slate-700/50 pb-2">
        <button
          onClick={() => setActiveSubTab('channels')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition-all ${
            activeSubTab === 'channels'
              ? (isLightMode ? 'bg-cyan-600 text-white shadow-sm' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40')
              : (isLightMode ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800')
          }`}
        >
          <Network className="w-4 h-4" />
          <span>{isEn ? 'Replica Channels' : 'کانال‌ها و وضعیت رپلیکا'}</span>
          {overview.channels.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-700/60 text-cyan-100">
              {overview.channels.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('replicas')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition-all ${
            activeSubTab === 'replicas'
              ? (isLightMode ? 'bg-cyan-600 text-white shadow-sm' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40')
              : (isLightMode ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800')
          }`}
        >
          <Server className="w-4 h-4" />
          <span>{isEn ? 'Connected Slaves' : 'رپلیکاهای متصل به این سرور'}</span>
          {overview.connectedReplicas.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-700/60 text-cyan-100">
              {overview.connectedReplicas.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('binlogs')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition-all ${
            activeSubTab === 'binlogs'
              ? (isLightMode ? 'bg-cyan-600 text-white shadow-sm' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40')
              : (isLightMode ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800')
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>{isEn ? 'Binary Logs & Purge' : 'فایل‌های لاگ باینری و پاکسازی'}</span>
          {overview.binaryLogs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-200">
              {overview.binaryLogs.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('ha_cluster')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition-all ${
            activeSubTab === 'ha_cluster'
              ? (isLightMode ? 'bg-cyan-600 text-white shadow-sm' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40')
              : (isLightMode ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800')
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{isEn ? 'HA & Group Replication' : 'کلاستر و دسترسی‌پذیری بالا (HA)'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('wizard')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse transition-all ${
            activeSubTab === 'wizard'
              ? (isLightMode ? 'bg-cyan-600 text-white shadow-sm' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40')
              : (isLightMode ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800')
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>{isEn ? 'Setup Wizard & Commands' : 'راهنمای راه‌اندازی و دستورات'}</span>
        </button>
      </div>

      {/* Sub-tab 1: Channels */}
      {activeSubTab === 'channels' && (
        <div className="space-y-4">
          {overview.channels.length === 0 ? (
            <div className={`p-8 text-center rounded-2xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}>
              <Network className="w-12 h-12 mx-auto text-slate-500 mb-3 opacity-60" />
              <h3 className="font-bold text-base">
                {isEn ? 'No Inbound Replication Channels Active' : 'هیچ کانال رونویسی ورودی روی این سرور پیکربندی نشده است'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
                {isEn 
                  ? 'This server currently does not replicate from any upstream MySQL source. If this server should act as a replica, use the Setup Wizard tab to view configuration commands.'
                  : 'این سرور در حال حاضر از هیچ سرور دیگری رونویسی دریافت نمی‌کند. برای تبدیل این سرور به رپلیکا از برگه "راهنمای راه‌اندازی" استفاده کنید.'}
              </p>
              <button
                onClick={() => setActiveSubTab('wizard')}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
              >
                {isEn ? 'View Replication Commands' : 'مشاهده دستورات راه‌اندازی'}
              </button>
            </div>
          ) : (
            overview.channels.map((ch, idx) => (
              <div
                key={ch.channelName || idx}
                className={`p-5 rounded-2xl border shadow-sm ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                {/* Channel Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-700/40">
                  <div className="flex items-center space-x-3 rtl:space-x-reverse">
                    <div className={`p-2.5 rounded-xl border ${
                      ch.slaveIoRunning === 'Yes' && ch.slaveSqlRunning === 'Yes'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                    }`}>
                      <Network className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                          {isEn ? 'Channel' : 'کانال'}: {ch.channelName}
                        </span>
                        {ch.autoPosition && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
                            Auto Position (GTID)
                          </span>
                        )}
                        {ch.masterSslAllowed && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800 flex items-center space-x-1 rtl:space-x-reverse">
                            <Shield className="w-3 h-3" />
                            <span>SSL</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                        {isEn ? 'Upstream Source' : 'سرور مبدأ'}: <strong className="text-slate-200">{ch.sourceHost}:{ch.sourcePort}</strong> ({ch.sourceUser})
                      </p>
                    </div>
                  </div>

                  {/* Channel Controls */}
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    {ch.slaveIoRunning === 'Yes' || ch.slaveSqlRunning === 'Yes' ? (
                      <button
                        onClick={() => setActionModal({
                          open: true,
                          action: 'stop_replica',
                          channelName: ch.channelName,
                          titleEn: `Stop Replication (${ch.channelName})`,
                          titleFa: `توقف رونویسی (کانال ${ch.channelName})`,
                          descriptionEn: `Execute STOP REPLICA / STOP SLAVE for channel '${ch.channelName}'. This pauses incoming data synchronization.`,
                          descriptionFa: `توقف موقت همگام‌سازی و فرآیند دریافت داده از سرور مبدأ در کانال '${ch.channelName}'.`,
                          isDangerous: true,
                        })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-amber-600/90 hover:bg-amber-500 text-white flex items-center space-x-1.5 rtl:space-x-reverse transition-colors"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Stop Replica' : 'توقف رپلیکا'}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setActionModal({
                          open: true,
                          action: 'start_replica',
                          channelName: ch.channelName,
                          titleEn: `Start Replication (${ch.channelName})`,
                          titleFa: `آغاز رونویسی (کانال ${ch.channelName})`,
                          descriptionEn: `Execute START REPLICA / START SLAVE for channel '${ch.channelName}'. This connects to the upstream source and resumes syncing.`,
                          descriptionFa: `آغاز یا ادامه همگام‌سازی و برقراری ارتباط مجدد با سرور مبدأ در کانال '${ch.channelName}'.`,
                          isDangerous: false,
                        })}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 rtl:space-x-reverse transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Start Replica' : 'شروع رپلیکا'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setActionModal({
                        open: true,
                        action: 'reset_replica',
                        channelName: ch.channelName,
                        titleEn: `Reset Replication Channel (${ch.channelName})`,
                        titleFa: `ریست کانال رونویسی (${ch.channelName})`,
                        descriptionEn: `Reset replication status for channel '${ch.channelName}'. You can optionally clear all connection metadata via 'RESET REPLICA ALL'.`,
                        descriptionFa: `ریست اطلاعات و کانترهای رونویسی برای کانال '${ch.channelName}'. همچنین امکان پاکسازی کامل اطلاعات اتصال با پارامتر ALL وجود دارد.`,
                        requiresResetAll: true,
                        isDangerous: true,
                      })}
                      className={`p-1.5 rounded-lg border text-xs transition-colors ${
                        isLightMode 
                          ? 'border-slate-300 text-slate-700 hover:bg-slate-100' 
                          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                      title={isEn ? 'Reset Channel' : 'ریست کانال'}
                    >
                      <RotateCcw className="w-4 h-4 text-rose-400" />
                    </button>
                  </div>
                </div>

                {/* Status Badges Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  {/* I/O Thread */}
                  <div className={`p-3 rounded-xl border ${
                    ch.slaveIoRunning === 'Yes' 
                      ? (isLightMode ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/30 border-emerald-800/50')
                      : (isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/30 border-rose-800/50')
                  }`}>
                    <span className="text-[11px] text-slate-400 block">{isEn ? 'Replica I/O Thread' : 'تِرد ورودی/خروجی (I/O)'}</span>
                    <div className="flex items-center space-x-1.5 rtl:space-x-reverse mt-1">
                      {ch.slaveIoRunning === 'Yes' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      )}
                      <span className={`text-xs font-bold uppercase ${
                        ch.slaveIoRunning === 'Yes' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {ch.slaveIoRunning}
                      </span>
                    </div>
                  </div>

                  {/* SQL Thread */}
                  <div className={`p-3 rounded-xl border ${
                    ch.slaveSqlRunning === 'Yes' 
                      ? (isLightMode ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/30 border-emerald-800/50')
                      : (isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/30 border-rose-800/50')
                  }`}>
                    <span className="text-[11px] text-slate-400 block">{isEn ? 'Replica SQL Thread' : 'تِرد پردازش SQL'}</span>
                    <div className="flex items-center space-x-1.5 rtl:space-x-reverse mt-1">
                      {ch.slaveSqlRunning === 'Yes' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      )}
                      <span className={`text-xs font-bold uppercase ${
                        ch.slaveSqlRunning === 'Yes' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {ch.slaveSqlRunning}
                      </span>
                    </div>
                  </div>

                  {/* Seconds Behind Source */}
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                    <span className="text-[11px] text-slate-400 block">{isEn ? 'Replication Lag' : 'تأخیر رونویسی (Lag)'}</span>
                    <div className="flex items-center space-x-1.5 rtl:space-x-reverse mt-1">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span className={`text-xs font-bold font-mono ${
                        ch.secondsBehindMaster === null
                          ? 'text-slate-400'
                          : ch.secondsBehindMaster === 0
                            ? 'text-emerald-400'
                            : ch.secondsBehindMaster < 60
                              ? 'text-amber-400'
                              : 'text-rose-400'
                      }`}>
                        {ch.secondsBehindMaster === null ? 'NULL (Disconnected)' : `${ch.secondsBehindMaster} s`}
                      </span>
                    </div>
                  </div>

                  {/* Master Server ID */}
                  <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                    <span className="text-[11px] text-slate-400 block">{isEn ? 'Master Server ID' : 'شناسه سرور مبدأ'}</span>
                    <span className="text-xs font-bold font-mono text-slate-200 mt-1 block">
                      {ch.masterServerId || 'Unknown'}
                    </span>
                  </div>
                </div>

                {/* Log Coordinates */}
                <div className="mt-4 p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 font-mono text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-400">
                    <div>
                      <span>Master Log Position: </span>
                      <strong className="text-cyan-300">{ch.masterLogFile || 'None'}:{ch.readMasterLogPos || 0}</strong>
                    </div>
                    <div>
                      <span>Relay Log Position: </span>
                      <strong className="text-cyan-300">{ch.relayLogFile || 'None'}:{ch.relayLogPos || 0}</strong>
                    </div>
                    <div>
                      <span>Exec Master Position: </span>
                      <strong className="text-emerald-300">{ch.execMasterLogPos || 0}</strong>
                    </div>
                  </div>

                  {/* GTID sets if available */}
                  {ch.retrievedGtidSet && (
                    <div className="pt-2 border-t border-slate-800/60 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Retrieved GTID Set:</span>
                        <button
                          onClick={() => handleCopy(ch.retrievedGtidSet!, `gtid-retrieved-${idx}`)}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 rtl:space-x-reverse"
                        >
                          {copiedId === `gtid-retrieved-${idx}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedId === `gtid-retrieved-${idx}` ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="text-slate-300 break-all select-all font-mono mt-0.5">
                        {ch.retrievedGtidSet}
                      </div>
                    </div>
                  )}

                  {ch.executedGtidSet && (
                    <div className="pt-2 border-t border-slate-800/60 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Executed GTID Set:</span>
                        <button
                          onClick={() => handleCopy(ch.executedGtidSet!, `gtid-exec-${idx}`)}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 rtl:space-x-reverse"
                        >
                          {copiedId === `gtid-exec-${idx}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedId === `gtid-exec-${idx}` ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="text-slate-300 break-all select-all font-mono mt-0.5">
                        {ch.executedGtidSet}
                      </div>
                    </div>
                  )}
                </div>

                {/* Errors Banner */}
                {(ch.lastIoError || ch.lastSqlError) && (
                  <div className={`mt-4 p-4 rounded-xl border space-y-2 ${
                    isLightMode ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-rose-950/40 border-rose-800 text-rose-200'
                  }`}>
                    <div className="flex items-center space-x-2 rtl:space-x-reverse font-bold text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span>{isEn ? 'Replication Error Detected' : 'خطای رونویسی شناسایی شد'}</span>
                    </div>
                    {ch.lastIoError && (
                      <div className="text-xs font-mono">
                        <span className="font-bold text-rose-400">Last I/O Error [Errno: {ch.lastIoErrno}]:</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{ch.lastIoError}</p>
                      </div>
                    )}
                    {ch.lastSqlError && (
                      <div className="text-xs font-mono pt-1 border-t border-rose-800/40">
                        <span className="font-bold text-rose-400">Last SQL Error [Errno: {ch.lastSqlErrno}]:</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{ch.lastSqlError}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Sub-tab 2: Connected Replicas */}
      {activeSubTab === 'replicas' && (
        <div className={`p-5 rounded-2xl border shadow-sm ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-700/40">
            <div>
              <h3 className="font-bold text-sm">
                {isEn ? 'Downstream Connected Replicas' : 'سرورهای رپلیکای متصل به این منبع'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn 
                  ? 'Replicas actively reading binary logs from this MySQL instance.' 
                  : 'رپلیکاهایی که لاگ‌های باینری این سرور را دریافت و اعمال می‌کنند.'}
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
              {overview.connectedReplicas.length} {isEn ? 'Connected' : 'متصل'}
            </span>
          </div>

          {overview.connectedReplicas.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Server className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-50" />
              <p>{isEn ? 'No downstream replicas currently connected.' : 'در حال حاضر هیچ سرور رپلیکایی به این منبع متصل نیست.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className={`border-b ${isLightMode ? 'border-slate-200 text-slate-600 bg-slate-50' : 'border-slate-800 text-slate-400 bg-slate-950/60'}`}>
                  <tr>
                    <th className="py-2.5 px-3">{isEn ? 'Server ID' : 'شناسه سرور'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Host / IP' : 'آدرس هاست'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Port' : 'پورت'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Replica User' : 'کاربر اتصال'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Binlog Thread / State' : 'وضعیت تِرد لاگ باینری'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Uptime' : 'مدت اتصال'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {overview.connectedReplicas.map((cr, idx) => (
                    <tr key={idx} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}>
                      <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">{cr.serverId || '—'}</td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-200">{cr.host}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">{cr.port}</td>
                      <td className="py-2.5 px-3 text-slate-300">{cr.user || '—'}</td>
                      <td className="py-2.5 px-3 font-mono text-emerald-400">
                        {cr.command || 'Binlog Dump'}
                        {cr.state && <span className="text-[10px] text-slate-400 block">{cr.state}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {cr.timeSeconds !== undefined ? `${cr.timeSeconds}s` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 3: Binary Logs & Purge */}
      {activeSubTab === 'binlogs' && (
        <div className={`p-5 rounded-2xl border shadow-sm ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-700/40">
            <div>
              <h3 className="font-bold text-sm flex items-center space-x-2 rtl:space-x-reverse">
                <span>{isEn ? 'Binary Log Files' : 'فایل‌های ثبت وقایع باینری (Binary Logs)'}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {overview.formattedTotalBinlogSize}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEn 
                  ? 'Binary logs record all schema and table modifications for replication and point-in-time recovery.' 
                  : 'لاگ‌های باینری تمام تغییرات ساختار و داده‌ها را به منظور رونویسی و بازیابی نقطه-زمانی ثبت می‌کنند.'}
              </p>
            </div>

            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <button
                onClick={() => setActionModal({
                  open: true,
                  action: 'purge_binlogs_to',
                  titleEn: 'Purge Binary Logs to File',
                  titleFa: 'پاکسازی لاگ‌های باینری تا فایل مشخص',
                  descriptionEn: 'Deletes all binary log files prior to the specified target log. Active logs cannot be deleted.',
                  descriptionFa: 'حذف تمام فایل‌های لاگ باینری قدیمی‌تر از فایل مشخص شده جهت آزادسازی فضای دیسک.',
                  requiresPurgeTarget: true,
                  purgeTargetType: 'file',
                  purgeTargetValue: overview.binaryLogs[0]?.fileName || '',
                  isDangerous: true,
                })}
                disabled={overview.binaryLogs.length <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white flex items-center space-x-1.5 rtl:space-x-reverse transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Purge Older Logs' : 'پاکسازی لاگ‌های قدیمی'}</span>
              </button>

              <button
                onClick={() => setActionModal({
                  open: true,
                  action: 'reset_master',
                  titleEn: 'Reset All Master Binary Logs (RESET MASTER)',
                  titleFa: 'ریست کامل تمام لاگ‌های باینری (RESET MASTER)',
                  descriptionEn: 'Deletes ALL binary log files and resets the binary log index to 1. WARNING: Connected replicas will lose their sync position!',
                  descriptionFa: 'هشدار جدی: تمامی لاگ‌های باینری حذف شده و شمارنده از ابتدا آغاز می‌گردد. رپلیکاهای متصل موقعیت همگام‌سازی را از دست خواهند داد!',
                  isDangerous: true,
                })}
                className={`p-1.5 rounded-lg border text-xs transition-colors ${
                  isLightMode ? 'border-rose-300 text-rose-700 hover:bg-rose-50' : 'border-rose-800 text-rose-400 hover:bg-rose-950/50'
                }`}
                title={isEn ? 'Reset Master' : 'ریست کامل مستر'}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!overview.binlogEnabled ? (
            <div className="py-10 text-center text-slate-400 text-xs">
              <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2 opacity-70" />
              <p className="font-semibold text-slate-300">
                {isEn ? 'Binary Logging is Disabled (log_bin = OFF)' : 'ثبت لاگ‌های باینری غیرفعال است (log_bin = OFF)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                {isEn 
                  ? 'To enable replication or point-in-time recovery, configure log_bin = ON in your server my.cnf file.' 
                  : 'برای فعال‌سازی رونویسی و پشتیبان‌گیری پیشرفته، مقدار log_bin = ON را در my.cnf سرور فعال نمایید.'}
              </p>
            </div>
          ) : overview.binaryLogs.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs">
              <HardDrive className="w-8 h-8 mx-auto text-slate-500 mb-2 opacity-50" />
              <p>{isEn ? 'No binary log files found.' : 'هیچ فایل لاگ باینری یافت نشد.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto mt-4 max-h-96">
              <table className="w-full text-left rtl:text-right text-xs">
                <thead className={`border-b sticky top-0 ${isLightMode ? 'border-slate-200 text-slate-600 bg-slate-50' : 'border-slate-800 text-slate-400 bg-slate-950'}`}>
                  <tr>
                    <th className="py-2.5 px-3">{isEn ? 'Log File Name' : 'نام فایل لاگ'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'File Size' : 'حجم فایل'}</th>
                    <th className="py-2.5 px-3">{isEn ? 'Status' : 'وضعیت'}</th>
                    <th className="py-2.5 px-3 text-right rtl:text-left">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {overview.binaryLogs.map((bl, idx) => (
                    <tr key={idx} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}>
                      <td className="py-2 px-3 font-mono font-bold text-slate-200 flex items-center space-x-2 rtl:space-x-reverse">
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{bl.fileName}</span>
                      </td>
                      <td className="py-2 px-3 font-mono text-amber-400">{bl.formattedSize}</td>
                      <td className="py-2 px-3">
                        {bl.isCurrent ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                            {isEn ? 'Active Writing' : 'در حال نوشتن (Active)'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
                            {isEn ? 'Archived' : 'آرشیوشده'}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right rtl:text-left">
                        {!bl.isCurrent && (
                          <button
                            onClick={() => setActionModal({
                              open: true,
                              action: 'purge_binlogs_to',
                              titleEn: `Purge Binlogs up to ${bl.fileName}`,
                              titleFa: `پاکسازی لاگ‌ها تا فایل ${bl.fileName}`,
                              descriptionEn: `Deletes all logs older than '${bl.fileName}'. This cannot be undone.`,
                              descriptionFa: `حذف تمامی فایل‌های قدیمی‌تر از '${bl.fileName}' جهت آزادسازی فضای ذخیره‌سازی.`,
                              requiresPurgeTarget: true,
                              purgeTargetType: 'file',
                              purgeTargetValue: bl.fileName,
                              isDangerous: true,
                            })}
                            className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                          >
                            {isEn ? 'Purge to here' : 'پاکسازی تا اینجا'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 4: HA & Cluster */}
      {activeSubTab === 'ha_cluster' && (
        <div className="space-y-4">
          {/* Group Replication Card */}
          <div className={`p-5 rounded-2xl border shadow-sm ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="flex items-center space-x-3 rtl:space-x-reverse pb-4 border-b border-slate-700/40">
              <div className={`p-2.5 rounded-xl border ${
                overview.groupReplication.enabled 
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' 
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">
                  {isEn ? 'MySQL Group Replication / InnoDB Cluster' : 'گروه رونویسی و کلاستر (Group Replication / InnoDB Cluster)'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isEn 
                    ? 'Synchronous multi-master or single-primary high availability clustering with Paxos consensus.' 
                    : 'کلاسترینگ فوق پیشرفته با دسترسی‌پذیری بالا، تحمل خطا بر پایه اجماع پکسوس (Paxos).'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className="text-[11px] text-slate-400 block">{isEn ? 'Cluster State' : 'وضعیت کلاستر'}</span>
                <span className={`text-xs font-bold uppercase ${
                  overview.groupReplication.enabled ? 'text-purple-400' : 'text-slate-400'
                }`}>
                  {overview.groupReplication.enabled ? 'ONLINE (ACTIVE)' : 'NOT CONFIGURED'}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className="text-[11px] text-slate-400 block">{isEn ? 'Group Name' : 'نام گروه'}</span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {overview.groupReplication.groupName || '—'}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className="text-[11px] text-slate-400 block">{isEn ? 'Member Role' : 'نقش در کلاستر'}</span>
                <span className="text-xs font-bold text-cyan-400">
                  {overview.groupReplication.memberRole || (overview.groupReplication.singlePrimaryMode ? 'PRIMARY' : '—')}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className="text-[11px] text-slate-400 block">{isEn ? 'Cluster Members' : 'اعضای کلاستر'}</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {overview.groupReplication.membersCount || (overview.groupReplication.enabled ? 1 : 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Semi-Synchronous Replication Card */}
          <div className={`p-5 rounded-2xl border shadow-sm ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}>
            <div className="flex items-center space-x-3 rtl:space-x-reverse pb-4 border-b border-slate-700/40">
              <div className={`p-2.5 rounded-xl border ${
                overview.semiSync.masterEnabled || overview.semiSync.slaveEnabled 
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' 
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">
                  {isEn ? 'Semi-Synchronous Replication (rpl_semi_sync)' : 'رونویسی نیمه‌همگام (Semi-Synchronous Replication)'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isEn 
                    ? 'Guarantees that transactions commit on the primary only after at least one replica confirms receiving the binary log events.' 
                    : 'تضمین می‌کند که تراکنش در سرور مبدأ تنها پس از تایید دریافت لاگ توسط حداقل یک رپلیکا ثبت نهایی شود.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className="text-[11px] text-slate-400 block">{isEn ? 'Source / Master Plugin' : 'پلاگین مبدأ (Master)'}</span>
                <span className={`text-xs font-bold uppercase ${
                  overview.semiSync.masterEnabled ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                  {overview.semiSync.masterEnabled ? (overview.semiSync.masterStatus ? 'ON (Active)' : 'ENABLED (Idle)') : 'DISABLED'}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className="text-[11px] text-slate-400 block">{isEn ? 'Replica / Slave Plugin' : 'پلاگین رپلیکا (Slave)'}</span>
                <span className={`text-xs font-bold uppercase ${
                  overview.semiSync.slaveEnabled ? 'text-emerald-400' : 'text-slate-400'
                }`}>
                  {overview.semiSync.slaveEnabled ? (overview.semiSync.slaveStatus ? 'ON (Active)' : 'ENABLED (Idle)') : 'DISABLED'}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'}`}>
                <span className="text-[11px] text-slate-400 block">{isEn ? 'Sync Timeout' : 'مهلت زمانی (Timeout)'}</span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {overview.semiSync.timeoutMs ? `${overview.semiSync.timeoutMs} ms` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 5: Setup Wizard */}
      {activeSubTab === 'wizard' && (
        <div className={`p-5 rounded-2xl border shadow-sm space-y-5 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div>
            <h3 className="font-bold text-sm">
              {isEn ? 'MySQL Replication Architecture & Setup Commands' : 'معماری و دستورات راه‌اندازی رونویسی MySQL'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isEn 
                ? 'Copy and execute these standard commands to configure replication between this node and remote instances.' 
                : 'دستورات زیر را برای راه‌اندازی و برقراری ارتباط رونویسی بین سرورهای مبدأ و پیرو کپی و اجرا نمایید.'}
            </p>
          </div>

          {/* Step 1: Create Replication User */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400">
                1. {isEn ? 'Create Replication User on Source Server' : 'ایجاد کاربر رونویسی در سرور مبدأ (Source / Master)'}
              </span>
              <button
                onClick={() => handleCopy(
                  `CREATE USER 'repl_user'@'%' IDENTIFIED BY 'STRONG_SECRET_PASSWORD';\nGRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';\nFLUSH PRIVILEGES;`,
                  'cmd-step-1'
                )}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 rtl:space-x-reverse"
              >
                {copiedId === 'cmd-step-1' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === 'cmd-step-1' ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 overflow-x-auto">
{`CREATE USER 'repl_user'@'%' IDENTIFIED BY 'STRONG_SECRET_PASSWORD';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;`}
            </pre>
          </div>

          {/* Step 2: Configure Replica (MySQL 8.0.22+ GTID) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400">
                2. {isEn ? 'Connect Replica with GTID Auto-Position (MySQL 8.0.22+)' : 'اتصال رپلیکا با حالت خودکار GTID (مخصوص MySQL 8.0.22 به بالا)'}
              </span>
              <button
                onClick={() => handleCopy(
                  `CHANGE REPLICATION SOURCE TO\n  SOURCE_HOST = '${server.ip}',\n  SOURCE_PORT = ${server.mysql_port || 3306},\n  SOURCE_USER = 'repl_user',\n  SOURCE_PASSWORD = 'STRONG_SECRET_PASSWORD',\n  SOURCE_AUTO_POSITION = 1;\nSTART REPLICA;\nSHOW REPLICA STATUS\\G;`,
                  'cmd-step-2'
                )}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 rtl:space-x-reverse"
              >
                {copiedId === 'cmd-step-2' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === 'cmd-step-2' ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 overflow-x-auto">
{`CHANGE REPLICATION SOURCE TO
  SOURCE_HOST = '${server.ip}',
  SOURCE_PORT = ${server.mysql_port || 3306},
  SOURCE_USER = 'repl_user',
  SOURCE_PASSWORD = 'STRONG_SECRET_PASSWORD',
  SOURCE_AUTO_POSITION = 1;
START REPLICA;
SHOW REPLICA STATUS\\G;`}
            </pre>
          </div>

          {/* Step 3: Traditional Binlog File & Position (MySQL 5.7 / MariaDB) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400">
                3. {isEn ? 'Connect Replica using Log File & Position (MySQL 5.7 / MariaDB)' : 'اتصال رپلیکا با لاگ‌فایل و پوزیشن (مخصوص 5.7 و MariaDB)'}
              </span>
              <button
                onClick={() => handleCopy(
                  `CHANGE MASTER TO\n  MASTER_HOST = '${server.ip}',\n  MASTER_PORT = ${server.mysql_port || 3306},\n  MASTER_USER = 'repl_user',\n  MASTER_PASSWORD = 'STRONG_SECRET_PASSWORD',\n  MASTER_LOG_FILE = '${overview.currentBinlogFile || 'mysql-bin.000001'}',\n  MASTER_LOG_POS = ${overview.currentBinlogPos || 4};\nSTART SLAVE;\nSHOW SLAVE STATUS\\G;`,
                  'cmd-step-3'
                )}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 rtl:space-x-reverse"
              >
                {copiedId === 'cmd-step-3' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedId === 'cmd-step-3' ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-xl bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 overflow-x-auto">
{`CHANGE MASTER TO
  MASTER_HOST = '${server.ip}',
  MASTER_PORT = ${server.mysql_port || 3306},
  MASTER_USER = 'repl_user',
  MASTER_PASSWORD = 'STRONG_SECRET_PASSWORD',
  MASTER_LOG_FILE = '${overview.currentBinlogFile || 'mysql-bin.000001'}',
  MASTER_LOG_POS = ${overview.currentBinlogPos || 4};
START SLAVE;
SHOW SLAVE STATUS\\G;`}
            </pre>
          </div>
        </div>
      )}

      {/* Confirmation & Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[999995] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl transition-all ${
            isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
          }`}>
            <div className="flex items-center space-x-3 rtl:space-x-reverse mb-4">
              <div className={`p-3 rounded-xl border ${
                actionModal.isDangerous ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
              }`}>
                {actionModal.isDangerous ? <AlertTriangle className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="font-bold text-base">
                  {isEn ? actionModal.titleEn : actionModal.titleFa}
                </h3>
                <span className="text-xs text-slate-400 block font-mono mt-0.5">
                  Action: {actionModal.action}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-400 mb-4">
              {isEn ? actionModal.descriptionEn : actionModal.descriptionFa}
            </p>

            {/* If purge target is required */}
            {actionModal.requiresPurgeTarget && (
              <div className="mb-4 space-y-1.5">
                <label className="text-xs font-semibold block text-slate-300">
                  {isEn ? 'Purge Target File' : 'نام فایل مرجع جهت پاکسازی'}
                </label>
                <input
                  type="text"
                  value={actionModal.purgeTargetValue || ''}
                  onChange={(e) => setActionModal({ ...actionModal, purgeTargetValue: e.target.value })}
                  placeholder="mysql-bin.000010"
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono outline-none ${
                    isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950 border-slate-700'
                  }`}
                />
                <span className="text-[11px] text-slate-500 block">
                  {isEn 
                    ? 'All binary log files prior to this filename will be purged immediately.' 
                    : 'تمامی فایل‌های لاگ پیش از این فایل فوراً حذف خواهند شد.'}
                </span>
              </div>
            )}

            {/* If resetAll option is available */}
            {actionModal.requiresResetAll && (
              <label className="flex items-center space-x-2 rtl:space-x-reverse mb-4 cursor-pointer text-xs select-none">
                <input
                  type="checkbox"
                  checked={actionModal.resetAllChecked || false}
                  onChange={(e) => setActionModal({ ...actionModal, resetAllChecked: e.target.checked })}
                  className="rounded border-slate-700 text-rose-500 focus:ring-0"
                />
                <span className="text-rose-400 font-semibold">
                  {isEn ? 'Clear all configuration (RESET REPLICA ALL)' : 'حذف کامل کانفیگ اتصال (RESET REPLICA ALL)'}
                </span>
              </label>
            )}

            <div className="flex items-center justify-end space-x-2 rtl:space-x-reverse pt-2">
              <button
                onClick={() => setActionModal(null)}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  isLightMode ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 rtl:space-x-reverse text-white transition-colors ${
                  actionModal.isDangerous ? 'bg-rose-600 hover:bg-rose-500' : 'bg-cyan-600 hover:bg-cyan-500'
                }`}
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEn ? 'Confirm & Execute' : 'تأیید و اجرا'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
