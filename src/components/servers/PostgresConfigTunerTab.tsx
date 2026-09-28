import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sliders,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  RefreshCw,
  Check,
  Copy,
  Download,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  Info,
  Server,
  Settings,
  ShieldAlert,
  Database,
  Globe,
  Monitor,
  PieChart,
  Terminal,
  Filter,
  CheckCircle2,
  HelpCircle,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresTuningRecommendationReport,
  PostgresTuningParameterRecommendation,
  PostgresWorkloadType,
  PostgresStorageType,
} from '../../types';
import {
  fetchRemoteServerPostgresTuningReport,
  applyRemoteServerPostgresTuning,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresConfigTunerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
  onNavigateToSqlStudio?: (sql: string) => void;
}

export const PostgresConfigTunerTab: React.FC<PostgresConfigTunerTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
  onNavigateToSqlStudio,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PostgresTuningRecommendationReport | null>(null);

  // Form Controls / Parameters
  const [workload, setWorkload] = useState<PostgresWorkloadType>('web');
  const [storage, setStorage] = useState<PostgresStorageType>('ssd');
  const [customRamGb, setCustomRamGb] = useState<number | ''>('');
  const [customCores, setCustomCores] = useState<number | ''>('');
  const [maxConnections, setMaxConnections] = useState<number | ''>('');

  // Selected Category filter
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'memory' | 'checkpoint' | 'parallelism' | 'planner' | 'connections' | 'wal'>('all');
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  // Selected parameters for application
  const [selectedParams, setSelectedParams] = useState<Set<string>>(new Set());

  // Apply Modal state
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyMethod, setApplyMethod] = useState<'alter_system' | 'append_conf'>('alter_system');
  const [sessionPassword, setSessionPassword] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string; messageFa: string } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Copy indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Load Tuning Report
  const loadReport = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const res = await fetchRemoteServerPostgresTuningReport(server.id, {
          database: initialDatabase || server.postgres_database || 'postgres',
          workload,
          storage,
          customRamGb: customRamGb ? Number(customRamGb) : undefined,
          customCores: customCores ? Number(customCores) : undefined,
          maxConnections: maxConnections ? Number(maxConnections) : undefined,
        });

        if (res.success && res.data) {
          setReport(res.data);
          // Auto-select all parameters initially
          const allParamNames = new Set(res.data.recommendations.map((r) => r.name));
          setSelectedParams(allParamNames);

          // If customRamGb was blank, seed with detected value
          if (customRamGb === '' && res.data.profile.totalRamBytes) {
            setCustomRamGb(Number((res.data.profile.totalRamBytes / (1024 * 1024 * 1024)).toFixed(0)));
          }
          if (customCores === '' && res.data.profile.cpuCores) {
            setCustomCores(res.data.profile.cpuCores);
          }
        } else {
          setError(
            isEn
              ? res.error || 'Failed to calculate tuning report'
              : res.errorFa || res.error || 'خطا در محاسبه توصیه‌های تیونینگ سرور'
          );
        }
      } catch (err: any) {
        setError(err.message || 'Network error fetching tuning recommendations');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [server.id, initialDatabase, server.postgres_database, workload, storage, customRamGb, customCores, maxConnections, isEn]
  );

  useEffect(() => {
    loadReport(true);
  }, [loadReport]);

  // Toggle selection for a parameter
  const toggleParam = (name: string) => {
    const next = new Set(selectedParams);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelectedParams(next);
  };

  const toggleAll = () => {
    if (!report) return;
    if (selectedParams.size === report.recommendations.length) {
      setSelectedParams(new Set());
    } else {
      setSelectedParams(new Set(report.recommendations.map((r) => r.name)));
    }
  };

  // Filtered recommendations
  const filteredRecs = useMemo(() => {
    if (!report || !report.recommendations) return [];
    return report.recommendations.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (showDiffOnly && !r.isDiff) return false;
      return true;
    });
  }, [report, categoryFilter, showDiffOnly]);

  // Handle Apply Configuration
  const handleApply = async () => {
    if (selectedParams.size === 0) {
      setApplyError(isEn ? 'Please select at least one parameter to apply' : 'لطفاً حداقل یک پارامتر را جهت اعمال انتخاب کنید');
      return;
    }

    setApplyLoading(true);
    setApplyError(null);
    setApplyResult(null);

    try {
      const res = await applyRemoteServerPostgresTuning(server.id, {
        workload,
        storage,
        customRamGb: customRamGb ? Number(customRamGb) : undefined,
        customCores: customCores ? Number(customCores) : undefined,
        maxConnections: maxConnections ? Number(maxConnections) : undefined,
        method: applyMethod,
        sessionPassword: sessionPassword || undefined,
        selectedParameters: Array.from(selectedParams),
        database: initialDatabase || server.postgres_database || 'postgres',
      });

      if (res.success) {
        setApplyResult({
          success: true,
          message: res.message,
          messageFa: res.messageFa,
        });
        // Reload report after 1.5s to see updated current values
        setTimeout(() => {
          loadReport(false);
        }, 1500);
      } else {
        setApplyError(
          isEn
            ? res.error || res.message || 'Failed to apply configuration'
            : res.errorFa || res.messageFa || res.error || 'خطا در اعمال تنظیمات'
        );
      }
    } catch (err: any) {
      setApplyError(err.message || 'Network error applying tuning configuration');
    } finally {
      setApplyLoading(false);
    }
  };

  // Download postgresql.conf file
  const handleDownloadConf = () => {
    if (!report) return;
    const blob = new Blob([report.generatedConfigSnippet], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postgresql-tuned-${server.name || server.ip}-${Date.now()}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isLightMode
            ? 'bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-white border-blue-200 shadow-sm'
            : 'bg-gradient-to-r from-blue-950/40 via-indigo-950/20 to-slate-900 border-blue-500/20 shadow-md'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border shrink-0 ${
                isLightMode
                  ? 'bg-blue-100 border-blue-300 text-blue-700 shadow-xs'
                  : 'bg-blue-950/80 border-blue-500/40 text-blue-400'
              }`}
            >
              <Sliders className="w-6 h-6" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>{isEn ? 'PostgreSQL Configuration Tuner & Sizing Advisor' : 'تنظیم و تیونینگ تخصصی پارامترها و مشاور سخت‌افزار'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    title={isEn ? 'Hardware Sizing & Configuration Tuner' : 'مشاور پیکربندی سخت‌افزار'}
                    infoWhatEn="Mathematical calculation of optimal PostgreSQL parameters (shared_buffers, work_mem, effective_cache_size, parallelism, and I/O costs) tailored to CPU cores, RAM, drive type, and workload profile."
                    infoWhatFa="محاسبه دقیق پارامترهای بهینه حافظه، پردازش موازی و هزینه‌های I/O بر اساس تعداد هسته‌های پردازنده، میزان رم، نوع دیسک و سناریوی کاربری سرور."
                    infoWhyEn="Default PostgreSQL settings are tuned for low-memory 20-year-old servers. Sizing ensures modern hardware is fully utilized without causing Out-Of-Memory (OOM) crashes."
                    infoWhyFa="تنظیمات پیش‌فرض PostgreSQL برای سرورهای قدیمی بسیار سبک طراحی شده‌اند. تیونینگ تضمین می‌کند حداکثر بهره‌وری از سخت‌افزار مدرن بدون خطر کرش OOM به دست آید."
                    infoExampleEn="For 16GB RAM on an SSD for Web applications, shared_buffers is set to 4GB (25%), effective_cache_size to 12GB (75%), and random_page_cost to 1.1."
                    infoExampleFa="برای سرور ۱۶ گیگابایت رم با دیسک SSD، مقدار shared_buffers به ۴ گیگابایت، کش به ۱۲ گیگابایت و هزینه خواندن تصادفی ایندکس به ۱.۱ تغییر می‌یابد."
                  />
                </h3>

                {report && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                      isLightMode
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    <Server className="w-3 h-3" />
                    <span>PostgreSQL {report.profile.postgresVersion}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {isEn
                  ? 'High-performance tuning engine based on PGTune algorithms, PostgreSQL high-load best practices, and real hardware probing.'
                  : 'موتور محاسباتی تیونینگ کارایی بالا بر اساس الگوریتم‌های PGTune، الگوهای برتر بار سنگین و کاوش مستقیم سخت‌افزار.'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadConf}
              disabled={!report}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title={isEn ? 'Download postgresql.conf' : 'دانلود فایل postgresql.conf'}
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">{isEn ? 'Export .conf' : 'خروجی conf'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setApplyError(null);
                setApplyResult(null);
                setIsApplyModalOpen(true);
              }}
              disabled={!report || selectedParams.size === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? `Apply Tuning (${selectedParams.size})`
                  : `اعمال پیکربندی (${selectedParams.size} پارامتر)`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => loadReport(true)}
              disabled={loading}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline">{isEn ? 'Recalculate' : 'محاسبه مجدد'}</span>
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
            <p className="font-semibold">{isEn ? 'Tuning Report Error' : 'خطا در محاسبه تیونینگ'}</p>
            <p className="mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* DETECTED HARDWARE SUMMARY CARDS */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Detected RAM */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Host System RAM' : 'حافظه رم سرور'}</span>
              <Activity className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">
              {report.profile.totalRamPretty}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {report.profile.isVirtual
                ? isEn
                  ? 'Virtual Machine (VM/Container)'
                  : 'ماشین مجازی / کانتینر'
                : isEn
                ? 'Bare-metal / Dedicated host'
                : 'سرور اختصاصی فیزیکی'}
            </div>
          </div>

          {/* Card 2: CPU Cores */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'CPU Processors' : 'هسته‌های پردازنده'}</span>
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {report.profile.cpuCores} {isEn ? 'Cores' : 'هسته'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {isEn ? 'Sizing parallel workers' : 'پایه‌گذار کارگرهای موازی'}
            </div>
          </div>

          {/* Card 3: Storage Type */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Detected Storage' : 'نوع دیسک ذخیره‌سازی'}</span>
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold uppercase font-mono text-purple-400">
              {report.storage}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {report.storage === 'nvme' || report.storage === 'ssd'
                ? isEn
                  ? 'High IOPS Flash storage'
                  : 'حافظه فلش پرسرعت IOPS بالا'
                : isEn
                ? 'Rotational HDD or SAN'
                : 'دیسک گردان یا شبکه SAN'}
            </div>
          </div>

          {/* Card 4: Impact Metrics */}
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>{isEn ? 'Execution Impact' : 'میزان تاثیر تغییرات'}</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xs font-mono flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                {report.immediateReloadCount} {isEn ? 'Hot Reload' : 'بارگذاری آنی'}
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                {report.requiresRestartCount} {isEn ? 'Restart Req' : 'نیازمند ریستارت'}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {report.recommendations.filter((r) => r.isDiff).length} {isEn ? 'parameters differ from current' : 'پارامتر نیاز به به‌روزرسانی دارند'}
            </div>
          </div>
        </div>
      )}

      {/* ADVISOR SIZING CONTROLS & WORKLOAD SELECTION */}
      <div
        className={`p-4 rounded-2xl border space-y-4 ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/40 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-700/30 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-400" />
            <h4 className="font-bold text-xs">
              {isEn ? 'Sizing Criteria & Workload Presets' : 'معیارهای تیونینگ و سناریوهای بار کاری'}
            </h4>
          </div>

          <button
            type="button"
            onClick={() => loadReport(true)}
            className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{isEn ? 'Recalculate Model' : 'بروزرسانی محاسبات'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Workload Profile */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>{isEn ? 'Application Workload:' : 'سناریوی کاربری:'}</span>
            </label>
            <select
              value={workload}
              onChange={(e) => setWorkload(e.target.value as PostgresWorkloadType)}
              className={`w-full text-xs p-2 rounded-xl border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <option value="web">{isEn ? 'Web Application (Balanced)' : 'برنامه‌های تحت وب (متعادل)'}</option>
              <option value="oltp">{isEn ? 'OLTP (High Concurrent Writes)' : 'سیستم‌های تراکنشی OLTP (نوشتن بالا)'}</option>
              <option value="dw">{isEn ? 'Data Warehouse / Analytics' : 'انبار داده و گزارش‌گیری تحلیلی (DW)'}</option>
              <option value="mixed">{isEn ? 'Mixed / General Purpose' : 'کاربری ترکیبی و عمومی'}</option>
              <option value="desktop">{isEn ? 'Desktop / Developer Local' : 'محیط لوکال یا دسکتاپ'}</option>
            </select>
          </div>

          {/* Storage Media */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">
              {isEn ? 'Storage Technology:' : 'فناوری دیسک ذخیره‌سازی:'}
            </label>
            <select
              value={storage}
              onChange={(e) => setStorage(e.target.value as PostgresStorageType)}
              className={`w-full text-xs p-2 rounded-xl border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              <option value="ssd">{isEn ? 'SSD / Cloud Block Storage' : 'دیسک SSD / فضای ابری'}</option>
              <option value="nvme">{isEn ? 'Fast NVMe SSD' : 'دیسک فوق‌سریع NVMe'}</option>
              <option value="san">{isEn ? 'SAN / Network Storage' : 'شبکه ذخیره‌سازی SAN'}</option>
              <option value="hdd">{isEn ? 'HDD (Rotational Magnetic)' : 'دیسک مکانیکی معمولی (HDD)'}</option>
            </select>
          </div>

          {/* Custom RAM */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">
              {isEn ? 'Total RAM (GB):' : 'میزان حافظه RAM (گیگابایت):'}
            </label>
            <input
              type="number"
              min={1}
              max={2048}
              value={customRamGb}
              onChange={(e) => setCustomRamGb(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g. 16"
              className={`w-full text-xs p-2 rounded-xl border font-mono transition ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            />
          </div>

          {/* Custom Cores */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">
              {isEn ? 'CPU Cores:' : 'تعداد هسته‌های CPU:'}
            </label>
            <input
              type="number"
              min={1}
              max={256}
              value={customCores}
              onChange={(e) => setCustomCores(e.target.value ? Number(e.target.value) : '')}
              placeholder="e.g. 4"
              className={`w-full text-xs p-2 rounded-xl border font-mono transition ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            />
          </div>

          {/* Max Connections */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">
              {isEn ? 'Max Connections:' : 'حداکثر اتصالات:'}
            </label>
            <input
              type="number"
              min={10}
              max={5000}
              value={maxConnections}
              onChange={(e) => setMaxConnections(e.target.value ? Number(e.target.value) : '')}
              placeholder={isEn ? 'Auto (e.g. 200)' : 'خودکار (مثلاً ۲۰۰)'}
              className={`w-full text-xs p-2 rounded-xl border font-mono transition ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            />
          </div>
        </div>
      </div>

      {/* FILTER TABS & PARAMETERS TABLE */}
      <div className="space-y-3">
        {/* Controls row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Category filter pills */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs">
            {(
              [
                { id: 'all', labelEn: 'All Categories', labelFa: 'همه دسته‌ها' },
                { id: 'memory', labelEn: 'Memory (RAM)', labelFa: 'حافظه (RAM)' },
                { id: 'checkpoint', labelEn: 'Checkpoints', labelFa: 'چک‌پوینت‌ها' },
                { id: 'parallelism', labelEn: 'Parallel Workers', labelFa: 'پردازش موازی' },
                { id: 'planner', labelEn: 'Query Planner', labelFa: 'پلنر کوئری' },
                { id: 'wal', labelEn: 'WAL Logs', labelFa: 'لاگ‌های WAL' },
                { id: 'connections', labelEn: 'Connections', labelFa: 'اتصالات' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isEn ? cat.labelEn : cat.labelFa}
              </button>
            ))}
          </div>

          {/* Diff toggle & Select all */}
          <div className="flex items-center gap-3 self-end sm:self-auto text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                checked={showDiffOnly}
                onChange={(e) => setShowDiffOnly(e.target.checked)}
                className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>{isEn ? 'Show Changes Only' : 'تنها موارد دارای تفاوت'}</span>
            </label>

            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
            >
              {selectedParams.size === report?.recommendations.length
                ? isEn
                  ? 'Deselect All'
                  : 'لغو انتخاب همه'
                : isEn
                ? 'Select All'
                : 'انتخاب همه'}
            </button>
          </div>
        </div>

        {/* Table of parameters */}
        <div
          className={`rounded-2xl border overflow-hidden ${
            isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
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
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedParams.size === report?.recommendations.length && report?.recommendations.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">{isEn ? 'Parameter & Category' : 'نام پارامتر و دسته'}</th>
                  <th className="py-3 px-3">{isEn ? 'Current Value' : 'مقدار فعلی'}</th>
                  <th className="py-3 px-3">{isEn ? 'Recommended Value' : 'مقدار پیشنهادی'}</th>
                  <th className="py-3 px-3">{isEn ? 'Apply Mode' : 'نحوه اعمال'}</th>
                  <th className="py-3 px-3">{isEn ? 'Engineering Rationale' : 'دلیل مهندسی تغییر'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30 font-mono text-[11px]">
                {filteredRecs.map((r) => {
                  const isChecked = selectedParams.has(r.name);
                  return (
                    <tr
                      key={r.name}
                      onClick={() => toggleParam(r.name)}
                      className={`transition cursor-pointer ${
                        isChecked
                          ? isLightMode
                            ? 'bg-blue-50/50 hover:bg-blue-50'
                            : 'bg-blue-950/20 hover:bg-blue-950/30'
                          : isLightMode
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleParam(r.name)}
                          className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Name & Category */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-200 font-mono text-xs flex items-center gap-1.5">
                          <span>{r.name}</span>
                          {r.isDiff && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title={isEn ? 'Modified' : 'تغییر یافته'} />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                          {isEn ? r.descriptionEn : r.descriptionFa}
                        </div>
                      </td>

                      {/* Current Value */}
                      <td className="py-3 px-3">
                        <span className="text-slate-400 font-mono font-semibold">
                          {r.currentValuePretty || r.currentValue}
                        </span>
                      </td>

                      {/* Recommended Value */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-blue-400 font-mono font-bold text-xs bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/30">
                            {r.recommendedValuePretty || r.recommendedValue}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(`${r.name} = '${r.recommendedValue}'`, r.name);
                            }}
                            className="text-slate-500 hover:text-slate-300 p-0.5 rounded"
                            title={isEn ? 'Copy parameter' : 'کپی پارامتر'}
                          >
                            {copiedKey === r.name ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Apply Mode */}
                      <td className="py-3 px-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            r.restartRequired
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {r.restartRequired
                            ? isEn
                              ? 'Restart Required'
                              : 'نیاز به ریستارت'
                            : isEn
                            ? 'Online Reload'
                            : 'بارگذاری آنلاین'}
                        </span>
                      </td>

                      {/* Rationale */}
                      <td className="py-3 px-3 font-sans text-xs text-slate-300 max-w-xs">
                        <p className="line-clamp-2 leading-relaxed">
                          {isEn ? r.rationaleEn : r.rationaleFa}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SNIPPET PREVIEW & ALTER SYSTEM QUERIES */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Box 1: postgresql.conf snippet */}
          <div
            className={`p-4 rounded-2xl border space-y-2 ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                <h4 className="font-bold text-xs">
                  {isEn ? 'postgresql.conf Direct Snippet' : 'کد پیکربندی فایل postgresql.conf'}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(report.generatedConfigSnippet, 'conf-snippet')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-semibold"
              >
                {copiedKey === 'conf-snippet' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKey === 'conf-snippet' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Snippet' : 'کپی اسنیپت')}</span>
              </button>
            </div>

            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 max-h-64 overflow-y-auto whitespace-pre">
              {report.generatedConfigSnippet}
            </pre>
          </div>

          {/* Box 2: ALTER SYSTEM SQL Script */}
          <div
            className={`p-4 rounded-2xl border space-y-2 ${
              isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-purple-400" />
                <h4 className="font-bold text-xs">
                  {isEn ? 'ALTER SYSTEM SQL Commands' : 'دستورات استاندارد SQL (ALTER SYSTEM)'}
                </h4>
              </div>

              <div className="flex items-center gap-2">
                {onNavigateToSqlStudio && (
                  <button
                    type="button"
                    onClick={() => {
                      const sql = report.alterSystemCommands.join('\n') + '\nSELECT pg_reload_conf();';
                      onNavigateToSqlStudio(sql);
                    }}
                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <span>{isEn ? 'Open in SQL Studio' : 'باز کردن در SQL Studio'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCopy(report.alterSystemCommands.join('\n'), 'sql-commands')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer font-semibold"
                >
                  {copiedKey === 'sql-commands' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === 'sql-commands' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy SQL' : 'کپی SQL')}</span>
                </button>
              </div>
            </div>

            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-purple-300 max-h-64 overflow-y-auto whitespace-pre">
              {report.alterSystemCommands.join('\n') + '\nSELECT pg_reload_conf();'}
            </pre>
          </div>
        </div>
      )}

      {/* MODAL: APPLY TUNING CONFIRMATION */}
      {isApplyModalOpen && report && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-blue-400" />
                <h4 className="font-bold text-sm">
                  {isEn ? 'Apply PostgreSQL Tuning Parameters' : 'تایید و اعمال پارامترهای تیونینگ پایگاه‌داده'}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Notification message */}
            <div className="text-xs text-slate-300 leading-relaxed space-y-2">
              <p>
                {isEn
                  ? `You are about to apply ${selectedParams.size} tuned parameters to database server "${server.name || server.ip}".`
                  : `شما در حال اعمال ${selectedParams.size} پارامتر بهینه‌سازی شده بر روی سرور "${server.name || server.ip}" هستید.`}
              </p>
            </div>

            {/* Method selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">
                {isEn ? 'Deployment Method:' : 'روش اعمال تنظیمات:'}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setApplyMethod('alter_system')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    applyMethod === 'alter_system'
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{isEn ? 'ALTER SYSTEM (SQL)' : 'دستور SQL ALTER SYSTEM'}</span>
                    {applyMethod === 'alter_system' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </div>
                  <p className="text-[11px] opacity-80 mt-1">
                    {isEn
                      ? 'Writes to postgresql.auto.conf inside database cluster and executes pg_reload_conf().'
                      : 'ثبت در فایل postgresql.auto.conf و بارگذاری مجدد بلادرنگ.'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setApplyMethod('append_conf')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    applyMethod === 'append_conf'
                      ? 'bg-purple-600/20 border-purple-500 text-white'
                      : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{isEn ? 'Append to postgresql.conf' : 'افزودن به postgresql.conf'}</span>
                    {applyMethod === 'append_conf' && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                  </div>
                  <p className="text-[11px] opacity-80 mt-1">
                    {isEn
                      ? 'Creates timestamped backup of postgresql.conf and appends new tuning directives via SSH.'
                      : 'تهیه نسخه پشتیبان و افزودن مقادیر جدید به انتهای فایل تنظیمات لینوکس.'}
                  </p>
                </button>
              </div>
            </div>

            {/* Restart Warning */}
            {report.requiresRestartCount > 0 && (
              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                  isLightMode ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-950/40 border-amber-600/50 text-amber-200'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    {isEn ? 'PostgreSQL Service Restart Advisory' : 'هشدار نیاز به راه‌اندازی مجدد سرویس'}
                  </p>
                  <p className="mt-0.5 opacity-90">
                    {isEn
                      ? 'Parameters such as shared_buffers, wal_buffers, max_connections, and max_worker_processes require a server restart to take effect in RAM.'
                      : 'پارامترهای اساسی حافظه مانند shared_buffers، wal_buffers، max_connections و پردازش‌های موازی پس از ریستارت سرویس فعال خواهند شد.'}
                  </p>
                </div>
              </div>
            )}

            {/* Error / Success message */}
            {applyError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                {applyError}
              </div>
            )}

            {applyResult && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs">
                {isEn ? applyResult.message : applyResult.messageFa}
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700/40">
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={applyLoading || applyResult !== null}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {applyLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Applying...' : 'در حال اعمال...'}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Execute & Reload' : 'اجرا و بارگذاری'}</span>
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
