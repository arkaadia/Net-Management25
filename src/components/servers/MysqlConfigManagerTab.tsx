import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Copy,
  History,
  Save,
  Check,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Search,
  KeyRound,
  Network,
  Lock,
  Unlock,
  SlidersHorizontal,
  RotateCw,
  Eye,
  FileText,
  AlertCircle,
  Database,
  Cpu,
  Server,
  Layers,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlClientAuthConfigData,
  MysqlClientHostAccessRule,
  MysqlCnfParameter,
  MysqlCnfBackupItem,
  MysqlVariableItem,
} from '../../types';
import {
  fetchRemoteServerMysqlClientAuthConfig,
  saveRemoteServerMysqlClientAuthConfig,
  restoreRemoteServerMysqlCnfBackup,
  updateRemoteServerMysqlHostRule,
  updateRemoteServerMysqlDynamicVariable,
  flushRemoteServerMysqlPrivileges,
  fetchRemoteServerMysqlVariables,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface MysqlConfigManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  sessionPassword?: string;
}

type SubTab = 'hosts' | 'params' | 'variables' | 'raw' | 'backups';

export const MysqlConfigManagerTab: React.FC<MysqlConfigManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  sessionPassword,
}) => {
  // Navigation
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('hosts');

  // Core Data State
  const [loading, setLoading] = useState(false);
  const [configData, setConfigData] = useState<MysqlClientAuthConfigData | null>(null);
  const [rawText, setRawText] = useState('');
  const [originalRawText, setOriginalRawText] = useState('');
  const [parameters, setParameters] = useState<MysqlCnfParameter[]>([]);
  const [originalParamsJson, setOriginalParamsJson] = useState('[]');
  const [hostRules, setHostRules] = useState<MysqlClientHostAccessRule[]>([]);

  // Live Runtime Variables State
  const [systemVariables, setSystemVariables] = useState<MysqlVariableItem[]>([]);
  const [loadingVariables, setLoadingVariables] = useState(false);
  const [varSearchQuery, setVarSearchQuery] = useState('');

  // Status Banners
  const [error, setError] = useState<{ en: string; fa?: string } | null>(null);
  const [successBanner, setSuccessBanner] = useState<{ en: string; fa?: string } | null>(null);

  // Filters
  const [hostSearch, setHostSearch] = useState('');
  const [hostScopeFilter, setHostScopeFilter] = useState<'all' | 'localhost' | 'subnet' | 'wildcard'>('all');
  const [hostRiskFilter, setHostRiskFilter] = useState<'all' | 'safe' | 'warning' | 'critical'>('all');
  const [paramSearch, setParamSearch] = useState('');
  const [paramCategoryFilter, setParamCategoryFilter] = useState<string>('all');

  // Modals
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoReloadService, setAutoReloadService] = useState(true);
  const [autoFlushPrivileges, setAutoFlushPrivileges] = useState(true);

  // Edit Host Rule Modal
  const [editHostModalOpen, setEditHostModalOpen] = useState(false);
  const [targetHostRule, setTargetHostRule] = useState<MysqlClientHostAccessRule | null>(null);
  const [newHostValue, setNewHostValue] = useState('');
  const [toggleRequireSsl, setToggleRequireSsl] = useState(false);
  const [toggleAccountLocked, setToggleAccountLocked] = useState(false);
  const [updatingHostRule, setUpdatingHostRule] = useState(false);

  // Edit Dynamic Variable Modal
  const [editVarModalOpen, setEditVarModalOpen] = useState(false);
  const [targetVariable, setTargetVariable] = useState<MysqlVariableItem | null>(null);
  const [newVarValue, setNewVarValue] = useState('');
  const [persistVariable, setPersistVariable] = useState(true);
  const [updatingVariable, setUpdatingVariable] = useState(false);

  // Backup Restore Modal
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [targetBackup, setTargetBackup] = useState<MysqlCnfBackupItem | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);

  // Flushing Privileges State
  const [flushing, setFlushing] = useState(false);

  // Unsaved changes detection
  const hasRawChanges = rawText !== originalRawText;
  const hasParamChanges = useMemo(() => {
    return JSON.stringify(parameters) !== originalParamsJson;
  }, [parameters, originalParamsJson]);
  const hasChanges = hasRawChanges || hasParamChanges;

  // Load configuration and host access data
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerMysqlClientAuthConfig(server.id, {
        password: sessionPassword,
      });

      if (res.success && res.data) {
        setConfigData(res.data);
        setRawText(res.data.rawContent || '');
        setOriginalRawText(res.data.rawContent || '');
        setParameters(res.data.parameters || []);
        setOriginalParamsJson(JSON.stringify(res.data.parameters || []));
        setHostRules(res.data.hostRules || []);
      } else {
        setError({
          en: res.error || 'Failed to load MySQL configuration and client authentication rules.',
          fa: res.errorFa || 'خطا در بارگذاری پیکربندی و احراز هویت کلاینت‌های MySQL.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Network connection failed while querying MySQL configuration.',
        fa: 'خطای برقراری ارتباط در دریافت تنظیمات MySQL.',
      });
    } finally {
      setLoading(false);
    }
  }, [server.id, sessionPassword]);

  // Load live system variables
  const loadVariables = useCallback(async () => {
    setLoadingVariables(true);
    try {
      const res = await fetchRemoteServerMysqlVariables(server.id);
      if (res.success && res.variables) {
        setSystemVariables(res.variables);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingVariables(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (activeSubTab === 'variables' && systemVariables.length === 0) {
      loadVariables();
    }
  }, [activeSubTab, systemVariables.length, loadVariables]);

  // Computed Host Rules Metrics
  const hostMetrics = useMemo(() => {
    const total = hostRules.length;
    const wildcardCount = hostRules.filter((r) => r.accessScope === 'wildcard').length;
    const localhostCount = hostRules.filter((r) => r.accessScope === 'localhost').length;
    const sslEnforcedCount = hostRules.filter((r) => Boolean(r.sslType)).length;
    const criticalCount = hostRules.filter((r) => r.riskLevel === 'critical').length;
    const warningCount = hostRules.filter((r) => r.riskLevel === 'warning').length;

    return {
      total,
      wildcardCount,
      localhostCount,
      sslEnforcedCount,
      criticalCount,
      warningCount,
    };
  }, [hostRules]);

  // Filtered Host Rules
  const filteredHostRules = useMemo(() => {
    return hostRules.filter((r) => {
      if (hostScopeFilter !== 'all' && r.accessScope !== hostScopeFilter) return false;
      if (hostRiskFilter !== 'all' && r.riskLevel !== hostRiskFilter) return false;
      if (hostSearch.trim()) {
        const q = hostSearch.toLowerCase().trim();
        const matchesUser = r.user.toLowerCase().includes(q);
        const matchesHost = r.host.toLowerCase().includes(q);
        const matchesPlugin = r.plugin.toLowerCase().includes(q);
        if (!matchesUser && !matchesHost && !matchesPlugin) return false;
      }
      return true;
    });
  }, [hostRules, hostScopeFilter, hostRiskFilter, hostSearch]);

  // Filtered Parameters
  const filteredParameters = useMemo(() => {
    return parameters.filter((p) => {
      if (paramCategoryFilter !== 'all' && p.category !== paramCategoryFilter) return false;
      if (paramSearch.trim()) {
        const q = paramSearch.toLowerCase().trim();
        const matchesKey = p.key.toLowerCase().includes(q);
        const matchesVal = p.value.toLowerCase().includes(q);
        const matchesDesc = (p.descriptionEn || '').toLowerCase().includes(q) || (p.descriptionFa || '').includes(q);
        if (!matchesKey && !matchesVal && !matchesDesc) return false;
      }
      return true;
    });
  }, [parameters, paramCategoryFilter, paramSearch]);

  // Filtered System Variables
  const filteredVariables = useMemo(() => {
    if (!varSearchQuery.trim()) return systemVariables;
    const q = varSearchQuery.toLowerCase().trim();
    return systemVariables.filter((v) => v.name.toLowerCase().includes(q) || v.value.toLowerCase().includes(q));
  }, [systemVariables, varSearchQuery]);

  // Handle Flush Privileges
  const handleFlushPrivileges = async () => {
    setFlushing(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const res = await flushRemoteServerMysqlPrivileges(server.id, { password: sessionPassword });
      if (res.success) {
        setSuccessBanner({
          en: res.message || 'Privileges and hosts cache flushed successfully (FLUSH PRIVILEGES).',
          fa: res.messageFa || 'مجوزها و حافظه کش هاست‌ها با موفقیت بازخوانی شدند.',
        });
        await loadConfig();
      } else {
        setError({
          en: res.error || 'Failed to flush MySQL privileges.',
          fa: res.errorFa || 'خطا در بازخوانی مجوزهای MySQL.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Connection error while flushing privileges.',
        fa: 'خطای ارتباط در بازخوانی مجوزها.',
      });
    } finally {
      setFlushing(false);
    }
  };

  // Handle Saving Configuration
  const handleConfirmSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const payload: any = {
        sessionPassword,
        reloadService: autoReloadService,
        flushPrivileges: autoFlushPrivileges,
      };

      if (activeSubTab === 'raw') {
        payload.rawContent = rawText;
      } else {
        payload.parameters = parameters;
      }

      const res = await saveRemoteServerMysqlClientAuthConfig(server.id, payload);

      if (res.success) {
        setSuccessBanner({
          en: res.message || 'MySQL configuration updated successfully.',
          fa: res.messageFa || 'پیکربندی MySQL با موفقیت ذخیره شد.',
        });
        setDiffModalOpen(false);
        await loadConfig();
      } else {
        setError({
          en: res.error || 'Failed to save MySQL configuration.',
          fa: res.errorFa || 'خطا در ذخیره‌سازی پیکربندی MySQL.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Connection error while saving configuration.',
        fa: 'خطای ارتباط در ذخیره‌سازی پیکربندی.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle Updating Host Rule
  const handleSaveHostRule = async () => {
    if (!targetHostRule) return;
    setUpdatingHostRule(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const res = await updateRemoteServerMysqlHostRule(server.id, {
        user: targetHostRule.user,
        oldHost: targetHostRule.host,
        newHost: newHostValue.trim() || targetHostRule.host,
        requireSsl: toggleRequireSsl,
        accountLocked: toggleAccountLocked,
        sessionPassword,
      });

      if (res.success) {
        setSuccessBanner({
          en: res.message || `User '${targetHostRule.user}'@'${newHostValue}' rule updated successfully.`,
          fa: res.messageFa || `قانون دسترسی هاست برای کاربر '${targetHostRule.user}' با موفقیت به‌روز شد.`,
        });
        setEditHostModalOpen(false);
        await loadConfig();
      } else {
        setError({
          en: res.error || 'Failed to update MySQL user host rule.',
          fa: res.errorFa || 'خطا در به‌روزرسانی قانون هاست کاربر.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Connection error while updating host rule.',
        fa: 'خطای ارتباط در به‌روزرسانی قانون هاست.',
      });
    } finally {
      setUpdatingHostRule(false);
    }
  };

  // Handle Updating Dynamic Variable
  const handleSaveDynamicVariable = async () => {
    if (!targetVariable) return;
    setUpdatingVariable(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const res = await updateRemoteServerMysqlDynamicVariable(server.id, {
        name: targetVariable.name,
        value: newVarValue,
        persist: persistVariable,
        sessionPassword,
      });

      if (res.success) {
        setSuccessBanner({
          en: res.message || `Variable '${targetVariable.name}' updated successfully.`,
          fa: res.messageFa || `متغیر '${targetVariable.name}' با موفقیت به‌روزرسانی شد.`,
        });
        setEditVarModalOpen(false);
        await loadVariables();
        await loadConfig();
      } else {
        setError({
          en: res.error || 'Failed to update system variable.',
          fa: res.errorFa || 'خطا در به‌روزرسانی متغیر سیستمی.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Connection error while updating system variable.',
        fa: 'خطای ارتباط در به‌روزرسانی متغیر.',
      });
    } finally {
      setUpdatingVariable(false);
    }
  };

  // Handle Restoring Backup
  const handleConfirmRestore = async () => {
    if (!targetBackup) return;
    setRestoringBackup(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const res = await restoreRemoteServerMysqlCnfBackup(
        server.id,
        targetBackup.fileName,
        true,
        sessionPassword
      );

      if (res.success) {
        setSuccessBanner({
          en: res.message || `Backup ${targetBackup.fileName} restored successfully.`,
          fa: res.messageFa || `پشتیبان ${targetBackup.fileName} با موفقیت بازیابی شد.`,
        });
        setRestoreModalOpen(false);
        await loadConfig();
      } else {
        setError({
          en: res.error || 'Failed to restore configuration backup.',
          fa: res.errorFa || 'خطا در بازیابی نسخه پشتیبان.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Connection error during configuration restore.',
        fa: 'خطای ارتباط در بازیابی نسخه پشتیبان.',
      });
    } finally {
      setRestoringBackup(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP HEADER & METADATA BAR */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-slate-900/80 border-slate-800 shadow-lg shadow-black/20'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-100'}`}>
                  {isEn
                    ? 'Client Authentication & my.cnf Configuration Hub'
                    : 'هاب احراز هویت کلاینت‌ها و پیکربندی سرور (my.cnf)'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30">
                  {configData?.metadata.detectedEngine === 'mariadb' ? 'MariaDB' : 'MySQL 8.x'}
                </span>
                {configData?.metadata.exists ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{isEn ? 'Host Config Active' : 'فایل فعال روی دیسک'}</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    <span>{isEn ? 'Engine Runtime Mode' : 'پیکربندی زنده موتور'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 font-mono text-[11px]">
                <span>{configData?.metadata.filePath || '/etc/mysql/mysql.conf.d/mysqld.cnf'}</span>
                {configData?.metadata.fileSizeBytes ? (
                  <span className="text-slate-500">({configData.metadata.fileSizeBytes} bytes, {configData.metadata.lineCount} lines)</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFlushPrivileges}
              disabled={flushing || loading}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title={isEn ? 'Flush database privileges and host cache' : 'بازخوانی سریع سطوح دسترسی و حافظه کش هاست‌ها'}
            >
              <RotateCw className={`w-3.5 h-3.5 ${flushing ? 'animate-spin text-orange-400' : ''}`} />
              <span>{isEn ? 'Flush Privileges' : 'بازخوانی مجوزها'}</span>
            </button>

            <button
              type="button"
              onClick={loadConfig}
              disabled={loading}
              className={`p-1.5 rounded-xl border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title={isEn ? 'Refresh Configuration' : 'تازه‌سازی پیکربندی'}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
            </button>

            {hasChanges && (
              <button
                type="button"
                onClick={() => setDiffModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer animate-pulse"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isEn ? 'Review & Apply' : 'بررسی و اعمال تغییرات'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Security Badges Row */}
        {configData && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-3 mt-3 border-t border-slate-800/40 text-xs">
            <div className={`p-2 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>{isEn ? 'Bind Address' : 'آدرس شنود شبکه'}</span>
                <Network className="w-3 h-3 text-cyan-400" />
              </div>
              <p className="font-mono font-bold mt-1 text-cyan-300 truncate" title={configData.activeBindAddress}>
                {configData.activeBindAddress}
              </p>
            </div>

            <div className={`p-2 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>{isEn ? 'Listen Port' : 'پورت شنود'}</span>
                <Server className="w-3 h-3 text-orange-400" />
              </div>
              <p className="font-mono font-bold mt-1 text-orange-300">
                {configData.activePort}
              </p>
            </div>

            <div className={`p-2 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>{isEn ? 'SSL / TLS Enforcement' : 'الزام رمزنگاری SSL'}</span>
                <Lock className="w-3 h-3 text-emerald-400" />
              </div>
              <p className={`font-bold mt-1 ${configData.activeRequireSecureTransport ? 'text-emerald-400' : 'text-amber-400'}`}>
                {configData.activeRequireSecureTransport ? (isEn ? 'STRICT' : 'اجباری') : (isEn ? 'OPTIONAL' : 'اختیاری')}
              </p>
            </div>

            <div className={`p-2 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>{isEn ? 'Skip Name Resolve' : 'عدم جستجوی DNS'}</span>
                <Zap className="w-3 h-3 text-purple-400" />
              </div>
              <p className="font-bold mt-1 text-purple-300">
                {configData.activeSkipNameResolve ? (isEn ? 'ENABLED (Fast)' : 'فعال (سریع)') : (isEn ? 'DISABLED' : 'غیرفعال')}
              </p>
            </div>

            <div className={`p-2 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>{isEn ? 'Max Connections' : 'سقف اتصالات'}</span>
                <Cpu className="w-3 h-3 text-blue-400" />
              </div>
              <p className="font-mono font-bold mt-1 text-blue-300">
                {configData.activeMaxConnections}
              </p>
            </div>

            <div className={`p-2 rounded-xl border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="flex items-center justify-between text-slate-400 text-[10px]">
                <span>{isEn ? 'Default Auth Plugin' : 'پلاگین احراز هویت'}</span>
                <KeyRound className="w-3 h-3 text-amber-400" />
              </div>
              <p className="font-mono text-[11px] font-bold mt-1 text-amber-300 truncate" title={configData.activeDefaultAuthPlugin}>
                {configData.activeDefaultAuthPlugin}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Success Banner */}
      {successBanner && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{isEn ? successBanner.en : successBanner.fa || successBanner.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="p-1 text-emerald-400 hover:text-emerald-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{isEn ? error.en : error.fa || error.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 text-rose-400 hover:text-rose-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. SUB-TABS NAVIGATION */}
      <div
        className={`flex items-center gap-1.5 p-1 rounded-xl border ${
          isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('hosts')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'hosts'
              ? 'bg-orange-500 text-slate-950 shadow-sm'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-200'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>{isEn ? 'Client Host Access Matrix' : 'ماتریس دسترسی هاست‌های کلاینت'}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-current">
            {hostRules.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('params')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'params'
              ? 'bg-orange-500 text-slate-950 shadow-sm'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-200'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{isEn ? 'Visual my.cnf Editor' : 'ویرایشگر بصری my.cnf'}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-current">
            {parameters.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('variables')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'variables'
              ? 'bg-orange-500 text-slate-950 shadow-sm'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-200'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>{isEn ? 'Live System Variables Tuner' : 'تنظیم زنده متغیرهای سیستمی'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('raw')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'raw'
              ? 'bg-orange-500 text-slate-950 shadow-sm'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-200'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{isEn ? 'Raw my.cnf Text' : 'متن خام my.cnf'}</span>
          {hasRawChanges && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('backups')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeSubTab === 'backups'
              ? 'bg-orange-500 text-slate-950 shadow-sm'
              : isLightMode
              ? 'text-slate-600 hover:bg-slate-200'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>{isEn ? 'Backup History & Rollback' : 'تاریخچه پشتیبان‌ها و بازیابی'}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-current">
            {configData?.metadata.backups.length || 0}
          </span>
        </button>
      </div>

      {/* 3. SUB-TAB 1: CLIENT HOST ACCESS MATRIX */}
      {activeSubTab === 'hosts' && (
        <div className="space-y-4">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'Total Accounts' : 'کل حساب‌های کاربری'}</span>
                <KeyRound className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-xl font-bold font-mono mt-1 text-slate-100">{hostMetrics.total}</p>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                hostMetrics.wildcardCount > 0
                  ? isLightMode
                    ? 'bg-amber-50/60 border-amber-200'
                    : 'bg-amber-950/20 border-amber-500/30'
                  : isLightMode
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'Wildcard % Hosts' : 'هاست‌های آزاد (%)'}</span>
                <Network className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-xl font-bold font-mono mt-1 text-amber-400">{hostMetrics.wildcardCount}</p>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'Localhost Only' : 'فقط لوکال‌هاست'}</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xl font-bold font-mono mt-1 text-emerald-400">{hostMetrics.localhostCount}</p>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'SSL Enforced' : 'دارای الزام SSL'}</span>
                <Lock className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-xl font-bold font-mono mt-1 text-blue-400">{hostMetrics.sslEnforcedCount}</p>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                hostMetrics.criticalCount > 0
                  ? isLightMode
                    ? 'bg-rose-50/60 border-rose-200'
                    : 'bg-rose-950/20 border-rose-500/30'
                  : isLightMode
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isEn ? 'High Risk Items' : 'موارد پرخطر'}</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-xl font-bold font-mono mt-1 text-rose-400">{hostMetrics.criticalCount}</p>
            </div>
          </div>

          {/* Search & Scope Filters Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={hostSearch}
                  onChange={(e) => setHostSearch(e.target.value)}
                  placeholder={isEn ? 'Search user, host or plugin...' : 'جستجوی کاربر، هاست یا افزونه...'}
                  className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs ${
                    isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                  }`}
                />
              </div>

              <select
                value={hostScopeFilter}
                onChange={(e: any) => setHostScopeFilter(e.target.value)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <option value="all">{isEn ? 'All Scopes' : 'همه محدوده‌ها'}</option>
                <option value="localhost">{isEn ? 'Localhost Only' : 'فقط لوکال‌هاست'}</option>
                <option value="subnet">{isEn ? 'Subnet Restricted' : 'محدود به زیرشبکه'}</option>
                <option value="wildcard">{isEn ? 'Wildcard (%)' : 'آزاد (%)'}</option>
              </select>

              <select
                value={hostRiskFilter}
                onChange={(e: any) => setHostRiskFilter(e.target.value)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <option value="all">{isEn ? 'All Risks' : 'همه سطوح ریسک'}</option>
                <option value="critical">{isEn ? 'Critical Only' : 'فقط موارد بحرانی'}</option>
                <option value="warning">{isEn ? 'Warnings' : 'هشدارها'}</option>
                <option value="safe">{isEn ? 'Safe' : 'امن'}</option>
              </select>
            </div>
          </div>

          {/* Host Rules Table */}
          <div
            className={`rounded-2xl border overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <table className="w-full text-xs text-left">
              <thead className={isLightMode ? 'bg-slate-100' : 'bg-slate-950/60'}>
                <tr className="border-b border-slate-800">
                  <th className="p-3">{isEn ? 'User Account' : 'نام کاربری'}</th>
                  <th className="p-3">{isEn ? 'Host Binding' : 'هاست مجاز'}</th>
                  <th className="p-3">{isEn ? 'Access Scope' : 'دامنه دسترسی'}</th>
                  <th className="p-3">{isEn ? 'Auth Plugin' : 'پلاگین احراز هویت'}</th>
                  <th className="p-3">{isEn ? 'SSL Enforcement' : 'الزام SSL'}</th>
                  <th className="p-3">{isEn ? 'Security Status' : 'وضعیت امنیتی'}</th>
                  <th className="p-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                {filteredHostRules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-sans">
                      {isEn ? 'No client host authorization rules found.' : 'هیچ قانونی یافت نشد.'}
                    </td>
                  </tr>
                ) : (
                  filteredHostRules.map((r) => (
                    <tr
                      key={`${r.user}@${r.host}`}
                      className={
                        r.riskLevel === 'critical'
                          ? isLightMode
                            ? 'bg-rose-50/50 hover:bg-rose-100/50'
                            : 'bg-rose-950/15 hover:bg-rose-950/25'
                          : isLightMode
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-slate-800/30'
                      }
                    >
                      <td className="p-3 font-bold text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{r.user}</span>
                          {r.accountLocked && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/30 font-sans">
                              {isEn ? 'LOCKED' : 'قفل'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 font-mono font-semibold text-orange-300">
                        {r.host}
                      </td>

                      <td className="p-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.accessScope === 'localhost'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : r.accessScope === 'wildcard'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {r.accessScope === 'localhost'
                            ? isEn ? 'Localhost' : 'محلی'
                            : r.accessScope === 'wildcard'
                            ? isEn ? 'Global %' : 'سراسری %'
                            : isEn ? 'Subnet' : 'زیرشبکه'}
                        </span>
                      </td>

                      <td className="p-3 font-mono text-slate-400">{r.plugin || 'default'}</td>

                      <td className="p-3 font-sans">
                        {r.sslType ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1 w-fit">
                            <Lock className="w-3 h-3" />
                            <span>{r.sslType}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">{isEn ? 'None' : 'ندارد'}</span>
                        )}
                      </td>

                      <td className="p-3 font-sans">
                        <div className="flex items-center gap-1.5">
                          {r.riskLevel === 'critical' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{isEn ? 'Critical Risk' : 'ریسک بحرانی'}</span>
                            </span>
                          ) : r.riskLevel === 'warning' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>{isEn ? 'Warning' : 'هشدار'}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isEn ? 'Secure' : 'امن'}</span>
                            </span>
                          )}

                          <FieldInfoTooltip
                            title={isEn ? 'Security Evaluation' : 'تحلیل امنیتی حساب'}
                            whatIsIt={isEn ? r.riskReasonEn || 'Host access check' : r.riskReasonFa || 'بررسی دسترسی هاست'}
                            whyNeeded={
                              isEn
                                ? 'Restricting accounts to explicit subnets and enforcing SSL prevents unauthorized eavesdropping and credential theft.'
                                : 'محدودسازی حساب‌ها به زیرشبکه‌های مشخص و الزام SSL مانع استراق سمع و سرقت احراز هویت می‌شود.'
                            }
                            practicalExample={
                              isEn
                                ? `Suggested host: 192.168.1.% or localhost`
                                : `مقدار پیشنهادی هاست: 192.168.1.% یا localhost`
                            }
                            isLightMode={isLightMode}
                            isEn={isEn}
                          />
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setTargetHostRule(r);
                            setNewHostValue(r.host);
                            setToggleRequireSsl(Boolean(r.sslType));
                            setToggleAccountLocked(r.accountLocked);
                            setEditHostModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 font-semibold text-[10px] inline-flex items-center gap-1 cursor-pointer transition"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>{isEn ? 'Modify' : 'اصلاح'}</span>
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

      {/* 4. SUB-TAB 2: VISUAL MY.CNF PARAMETERS EDITOR */}
      {activeSubTab === 'params' && (
        <div className="space-y-4">
          {/* Category Filter Pills & Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: isEn ? 'All Directives' : 'همه پارامترها' },
                { id: 'networking', label: isEn ? 'Networking & Port' : 'شبکه و پورت شنود' },
                { id: 'security', label: isEn ? 'Security & SSL' : 'امنیت و SSL' },
                { id: 'performance', label: isEn ? 'Performance & Memory' : 'کارایی و بافر' },
                { id: 'logging', label: isEn ? 'Logging & Slow Query' : 'لاگ‌برداری و کوئری کند' },
                { id: 'general', label: isEn ? 'General' : 'عمومی' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setParamCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    paramCategoryFilter === cat.id
                      ? 'bg-orange-500 text-slate-950 font-bold shadow-sm'
                      : isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="relative max-w-xs flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={paramSearch}
                onChange={(e) => setParamSearch(e.target.value)}
                placeholder={isEn ? 'Filter directive name or value...' : 'فیلتر پارامتر یا مقدار...'}
                className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                }`}
              />
            </div>
          </div>

          {/* Parameters List */}
          <div
            className={`rounded-2xl border overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <table className="w-full text-xs text-left">
              <thead className={isLightMode ? 'bg-slate-100' : 'bg-slate-950/60'}>
                <tr className="border-b border-slate-800">
                  <th className="p-3">{isEn ? 'Section' : 'بخش'}</th>
                  <th className="p-3">{isEn ? 'Directive' : 'پارامتر'}</th>
                  <th className="p-3">{isEn ? 'Category' : 'دسته‌بندی'}</th>
                  <th className="p-3">{isEn ? 'Current Value' : 'مقدار فعلی'}</th>
                  <th className="p-3">{isEn ? 'Description' : 'توضیحات و راهنما'}</th>
                  <th className="p-3 text-right">{isEn ? 'Status' : 'وضعیت'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                {filteredParameters.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-sans">
                      {isEn ? 'No parameters match current filter.' : 'هیچ پارامتری با این فیلتر مطابقت ندارد.'}
                    </td>
                  </tr>
                ) : (
                  filteredParameters.map((p, idx) => (
                    <tr key={`${p.section}-${p.key}-${idx}`} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'}>
                      <td className="p-3 font-bold text-orange-400">[{p.section}]</td>

                      <td className="p-3 font-bold text-cyan-300 flex items-center gap-1.5">
                        <span>{p.key}</span>
                        <FieldInfoTooltip
                          title={p.key}
                          whatIsIt={isEn ? p.descriptionEn || p.key : p.descriptionFa || p.key}
                          whyNeeded={
                            isEn
                              ? `Configures MySQL daemon behavior for ${p.category} management.`
                              : `تعیین‌کننده رفتار موتور دیتابیس در بخش ${p.category}.`
                          }
                          practicalExample={isEn ? `Current value: ${p.value}` : `مقدار فعلی: ${p.value}`}
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </td>

                      <td className="p-3 font-sans">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                          {p.category}
                        </span>
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          value={p.value}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParameters((prev) =>
                              prev.map((item) =>
                                item.section === p.section && item.key === p.key ? { ...item, value: val } : item
                              )
                            );
                          }}
                          className={`w-full max-w-xs px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold ${
                            isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
                          }`}
                        />
                      </td>

                      <td className="p-3 font-sans text-slate-400 max-w-sm truncate" title={isEn ? p.descriptionEn : p.descriptionFa}>
                        {isEn ? p.descriptionEn : p.descriptionFa}
                      </td>

                      <td className="p-3 text-right font-sans">
                        {p.isCommented ? (
                          <span className="text-slate-500 text-[10px] font-semibold">{isEn ? 'Commented' : 'غیرفعال'}</span>
                        ) : (
                          <span className="text-emerald-400 text-[10px] font-semibold flex items-center justify-end gap-1">
                            <Check className="w-3 h-3" />
                            <span>{isEn ? 'Active' : 'فعال'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. SUB-TAB 3: LIVE SYSTEM VARIABLES TUNER */}
      {activeSubTab === 'variables' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative max-w-md flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={varSearchQuery}
                onChange={(e) => setVarSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search live server variables (e.g. timeout, buffer, max)...' : 'جستجوی متغیرهای زنده (مانند buffer، timeout)...'}
                className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs ${
                  isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
                }`}
              />
            </div>

            <button
              type="button"
              onClick={loadVariables}
              disabled={loadingVariables}
              className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingVariables ? 'animate-spin text-orange-400' : ''}`} />
              <span>{isEn ? 'Refresh Variables' : 'تازه‌سازی متغیرها'}</span>
            </button>
          </div>

          <div
            className={`rounded-2xl border overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <table className="w-full text-xs text-left">
              <thead className={isLightMode ? 'bg-slate-100' : 'bg-slate-950/60'}>
                <tr className="border-b border-slate-800">
                  <th className="p-3">{isEn ? 'System Variable Name' : 'نام متغیر سیستمی'}</th>
                  <th className="p-3">{isEn ? 'Active Runtime Value' : 'مقدار زنده در حافظه سرور'}</th>
                  <th className="p-3 text-right">{isEn ? 'Action' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                {loadingVariables ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-400 font-sans">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-orange-400 mb-2" />
                      <span>{isEn ? 'Loading server system variables...' : 'در حال واکشی متغیرهای سیستمی...'}</span>
                    </td>
                  </tr>
                ) : filteredVariables.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-400 font-sans">
                      {isEn ? 'No variables found.' : 'هیچ متغیری یافت نشد.'}
                    </td>
                  </tr>
                ) : (
                  filteredVariables.slice(0, 100).map((v) => (
                    <tr key={v.name} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'}>
                      <td className="p-3 font-bold text-cyan-300">{v.name}</td>
                      <td className="p-3 text-slate-200 max-w-xl truncate" title={v.value}>
                        {v.value}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setTargetVariable(v);
                            setNewVarValue(v.value);
                            setPersistVariable(true);
                            setEditVarModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 font-semibold text-[10px] inline-flex items-center gap-1 cursor-pointer transition font-sans"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>{isEn ? 'Tune' : 'تنظیم'}</span>
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

      {/* 6. SUB-TAB 4: RAW MY.CNF TEXT EDITOR */}
      {activeSubTab === 'raw' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {isEn ? 'Edit raw configuration file directly:' : 'ویرایش مستقیم متن فایل پیکربندی:'}
            </span>
            {hasRawChanges && (
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{isEn ? 'Unsaved raw edits' : 'تغییرات ذخیره‌نشده'}</span>
              </span>
            )}
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={22}
            className={`w-full p-4 rounded-2xl border font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-orange-500 custom-scrollbar ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-slate-950 border-slate-800 text-slate-100 shadow-inner'
            }`}
          />
        </div>
      )}

      {/* 7. SUB-TAB 5: BACKUP HISTORY & ROLLBACK */}
      {activeSubTab === 'backups' && (
        <div className="space-y-4">
          <div
            className={`rounded-2xl border overflow-hidden ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <table className="w-full text-xs text-left">
              <thead className={isLightMode ? 'bg-slate-100' : 'bg-slate-950/60'}>
                <tr className="border-b border-slate-800">
                  <th className="p-3">{isEn ? 'Backup File Name' : 'نام فایل پشتیبان'}</th>
                  <th className="p-3">{isEn ? 'Full Path' : 'مسیر کامل روی دیسک'}</th>
                  <th className="p-3">{isEn ? 'Timestamp Tag' : 'برچسب زمانی'}</th>
                  <th className="p-3 text-right">{isEn ? 'Rollback' : 'بازیابی'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                {(!configData?.metadata.backups || configData.metadata.backups.length === 0) ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 font-sans">
                      {isEn ? 'No automated backups found on server.' : 'هیچ نسخه پشتیبانی یافت نشد.'}
                    </td>
                  </tr>
                ) : (
                  configData.metadata.backups.map((b) => (
                    <tr key={b.fileName} className={isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'}>
                      <td className="p-3 font-bold text-orange-400 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" />
                        <span>{b.fileName}</span>
                      </td>

                      <td className="p-3 text-slate-400">{b.filePath}</td>

                      <td className="p-3 text-cyan-300">{b.timestamp}</td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setTargetBackup(b);
                            setRestoreModalOpen(true);
                          }}
                          className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold text-[10px] inline-flex items-center gap-1 cursor-pointer transition font-sans"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>{isEn ? 'Restore This' : 'بازیابی این نسخه'}</span>
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

      {/* ========================================================================= */}
      {/* 8. MODAL: UNIFIED DIFF & PRE-APPLY CONFIRMATION (Universal Modal Standards) */}
      {/* ========================================================================= */}
      {diffModalOpen &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[85vh] ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              {/* Header with 3 Control Buttons */}
              <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <Save className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Review Configuration Changes (Pre-Save Diff)' : 'پیش‌نمایش تغییرات پیکربندی (Unified Diff)'}
                  </h4>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDiffModalOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 space-y-3 overflow-y-auto flex-1 custom-scrollbar text-xs">
                <p className="text-slate-400">
                  {isEn
                    ? 'The following atomic changes will be backed up and applied to MySQL:'
                    : 'تغییرات زیر پس از ایجاد نسخه پشتیبان به صورت اتمیک بر روی سرور اعمال خواهند شد:'}
                </p>

                <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-slate-300 max-h-60 overflow-y-auto border border-slate-800">
                  <p className="text-slate-500">--- {configData?.metadata.filePath || '/etc/mysql/my.cnf'}</p>
                  <p className="text-emerald-400">+++ {configData?.metadata.filePath || '/etc/mysql/my.cnf'}.new</p>
                  <p className="text-cyan-400 mt-2">@@ Modified Directives @@</p>
                  {parameters
                    .filter((p) => {
                      const originalParam = (configData?.parameters || []).find(
                        (op) => op.section === p.section && op.key === p.key
                      );
                      return !originalParam || originalParam.value !== p.value;
                    })
                    .map((p) => (
                      <div key={p.key} className="text-emerald-300 py-0.5">
                        + [{p.section}] {p.key} = {p.value}
                      </div>
                    ))}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoReloadService}
                      onChange={(e) => setAutoReloadService(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500"
                    />
                    <span className="text-slate-200 font-semibold">
                      {isEn ? 'Reload MySQL daemon after applying' : 'بارگذاری مجدد سرویس MySQL پس از اعمال'}
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFlushPrivileges}
                      onChange={(e) => setAutoFlushPrivileges(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500"
                    />
                    <span className="text-slate-200 font-semibold">
                      {isEn ? 'Flush privileges & host cache (FLUSH PRIVILEGES)' : 'بازخوانی مجوزها و کش هاست‌ها'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setDiffModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Confirm & Apply' : 'تایید و اعمال نهایی'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* 9. MODAL: EDIT HOST RULE (Universal Modal Standards)                      */}
      {/* ========================================================================= */}
      {editHostModalOpen &&
        targetHostRule &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl flex flex-col ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <Network className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    {isEn ? `Modify Host Access: ${targetHostRule.user}` : `اصلاح دسترسی هاست: ${targetHostRule.user}`}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={() => setEditHostModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    {isEn ? 'Host Pattern (e.g. 192.168.1.%, localhost, %)' : 'الگوی هاست (مانند 192.168.1.%, localhost, %)'}
                  </label>
                  <input
                    type="text"
                    value={newHostValue}
                    onChange={(e) => setNewHostValue(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs font-semibold ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    {isEn
                      ? 'Changing the host will safely rename the user@host account and rebind privileges.'
                      : 'تغییر هاست موجب تغییر نام ایمن حساب و تطبیق مجدد مجوزها می‌شود.'}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={toggleRequireSsl}
                      onChange={(e) => setToggleRequireSsl(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500"
                    />
                    <span className="text-slate-200 font-semibold">
                      {isEn ? 'Require SSL / TLS encryption (REQUIRE SSL)' : 'الزام رمزنگاری SSL/TLS (REQUIRE SSL)'}
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={toggleAccountLocked}
                      onChange={(e) => setToggleAccountLocked(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500"
                    />
                    <span className="text-slate-200 font-semibold">
                      {isEn ? 'Lock this user account (ACCOUNT LOCK)' : 'قفل کردن این حساب کاربری (ACCOUNT LOCK)'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditHostModalOpen(false)}
                  disabled={updatingHostRule}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveHostRule}
                  disabled={updatingHostRule}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                >
                  {updatingHostRule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Save Host Rule' : 'ذخیره قانون هاست'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* 10. MODAL: EDIT DYNAMIC VARIABLE (Universal Modal Standards)              */}
      {/* ========================================================================= */}
      {editVarModalOpen &&
        targetVariable &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl flex flex-col ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-100 truncate max-w-xs">
                    {targetVariable.name}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={() => setEditVarModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    {isEn ? 'New Value:' : 'مقدار جدید:'}
                  </label>
                  <input
                    type="text"
                    value={newVarValue}
                    onChange={(e) => setNewVarValue(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs font-semibold ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={persistVariable}
                      onChange={(e) => setPersistVariable(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500"
                    />
                    <span className="text-slate-200 font-semibold">
                      {isEn
                        ? 'Persist setting across server restart (SET PERSIST)'
                        : 'ذخیره پایدار پس از راه‌اندازی مجدد سرور (SET PERSIST)'}
                    </span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {isEn
                      ? 'If unchecked, setting will apply only to current server memory (SET GLOBAL).'
                      : 'در صورت عدم انتخاب، تنظیم فقط در حافظه موقت سرور اعمال می‌شود (SET GLOBAL).'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditVarModalOpen(false)}
                  disabled={updatingVariable}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveDynamicVariable}
                  disabled={updatingVariable}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                >
                  {updatingVariable ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Apply Variable' : 'اعمال متغیر'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* 11. MODAL: BACKUP RESTORE CONFIRMATION (Universal Modal Standards)        */}
      {/* ========================================================================= */}
      {restoreModalOpen &&
        targetBackup &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl flex flex-col ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <History className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Confirm Backup Rollback' : 'تایید بازیابی نسخه پشتیبان'}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={() => setRestoreModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs">
                <p className="text-slate-300">
                  {isEn
                    ? `Are you sure you want to rollback active MySQL configuration to:`
                    : `آیا از بازیابی پیکربندی فعال MySQL به نسخه پشتیبان زیر اطمینان دارید؟`}
                </p>
                <div className="p-3 rounded-xl bg-slate-950 font-mono text-[11px] text-orange-400 border border-slate-800">
                  {targetBackup.fileName}
                </div>
                <p className="text-slate-500 text-[11px]">
                  {isEn
                    ? 'Active my.cnf will be atomically replaced and MySQL privileges reloaded.'
                    : 'فایل فعال my.cnf به طور اتمیک جایگزین شده و مجوزهای MySQL مجدداً بارگذاری می‌شوند.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setRestoreModalOpen(false)}
                  disabled={restoringBackup}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRestore}
                  disabled={restoringBackup}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition"
                >
                  {restoringBackup ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                  <span>{isEn ? 'Rollback Now' : 'بازیابی فوری'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
