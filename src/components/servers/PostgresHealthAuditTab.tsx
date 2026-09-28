import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Download,
  Copy,
  Check,
  X,
  Database,
  Cpu,
  Wrench,
  SlidersHorizontal,
  HardDrive,
  Clock,
  Sparkles,
  Terminal,
  FileText,
  ChevronDown,
  ChevronUp,
  Key,
  Unlock,
  Printer,
  ExternalLink,
  Shield,
  Zap,
  BarChart3,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresHealthAuditReport,
  PostgresHealthCheckItem,
  PostgresAuditCategory,
  PostgresAuditSeverity,
  PostgresDatabaseItem,
} from '../../types';
import {
  fetchRemoteServerPostgresHealthAudit,
  fetchRemoteServerPostgresDatabases,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresHealthAuditTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
  onNavigateToSqlStudio?: (sql: string) => void;
}

export const PostgresHealthAuditTab: React.FC<PostgresHealthAuditTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
  onNavigateToSqlStudio,
}) => {
  // Report state
  const [report, setReport] = useState<PostgresHealthAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ en: string; fa?: string } | null>(null);

  // Database selector
  const [databases, setDatabases] = useState<PostgresDatabaseItem[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>(
    initialDatabase || server.postgres_database || 'postgres'
  );

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<'all' | PostgresAuditCategory>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | PostgresAuditSeverity>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Expanded items
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Copy states
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Load databases
  const loadDatabases = useCallback(async () => {
    try {
      const res = await fetchRemoteServerPostgresDatabases(server.id);
      if (res.success && res.databases) {
        setDatabases(res.databases);
      }
    } catch {}
  }, [server.id]);

  // Run audit
  const runAudit = useCallback(async (dbName: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerPostgresHealthAudit(server.id, { database: dbName });
      if (res.success && res.report) {
        setReport(res.report);
      } else {
        setError({
          en: res.error || 'Failed to complete health and security audit',
          fa: res.errorFa || 'خطا در ارزیابی و ممیزی سلامت پایگاه داده',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Network error running health audit',
        fa: 'خطای ارتباط با سرور در ممیزی سلامت دیتابیس',
      });
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    if (selectedDb) {
      runAudit(selectedDb);
    }
  }, [selectedDb, runAudit]);

  // Toggle item expansion
  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Expand / Collapse all
  const toggleAll = (expand: boolean) => {
    if (!report) return;
    const nextState: Record<string, boolean> = {};
    report.items.forEach((it) => {
      nextState[it.id] = expand;
    });
    setExpandedItems(nextState);
  };

  // Copy single SQL remediation
  const copyRemediation = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 2000);
  };

  // Copy whole audit markdown summary (Bilingual compliant)
  const copyAuditSummary = () => {
    if (!report) return;
    const lines: string[] = [];
    if (isEn) {
      lines.push(`# PostgreSQL Comprehensive Health & Security Audit Report`);
      lines.push(`- **Server:** ${server.name} (${server.ip || 'localhost'})`);
      lines.push(`- **Database Audited:** ${report.database}`);
      lines.push(`- **Generated At:** ${new Date(report.generatedAt).toLocaleString()}`);
      lines.push(`- **Overall Health Score:** ${report.overallScore}/100`);
      lines.push(`- **Security Score:** ${report.securityScore}/100`);
      lines.push(`- **Performance Score:** ${report.performanceScore}/100`);
      lines.push(`- **Maintenance Score:** ${report.maintenanceScore}/100`);
      lines.push(`- **Storage Score:** ${report.storageScore}/100`);
      lines.push(`- **Engine Version:** ${report.serverVersion}`);
      lines.push(`- **Uptime:** ${report.uptime}`);
      lines.push(``);
      lines.push(`## Key Security & Storage Indicators`);
      lines.push(`- Buffer Cache Hit Ratio: ${report.summary.cacheHitRatio}%`);
      lines.push(`- Index Cache Hit Ratio: ${report.summary.indexHitRatio}%`);
      lines.push(`- Connection Saturation: ${report.summary.activeConnections} / ${report.summary.maxConnections} (${report.summary.connectionUsagePercent}%)`);
      lines.push(`- Superuser Roles: ${report.summary.superusersCount} (${(report.summary.superuserNames || []).join(', ')})`);
      lines.push(`- Passwordless Login Accounts: ${report.summary.passwordlessRolesCount} ${report.summary.passwordlessNames?.length ? `(${report.summary.passwordlessNames.join(', ')})` : ''}`);
      lines.push(`- pg_hba.conf Open Trust Rules: ${report.summary.openTrustRulesCount}`);
      lines.push(`- SSL Active: ${report.summary.sslEnabled ? 'Yes' : 'No'}`);
      lines.push(`- Cluster Storage Footprint: ${report.summary.totalDatabaseSizePretty}`);
      lines.push(`- Max Transaction ID Age: ${report.summary.wraparoundMaxAge.toLocaleString()} (${report.summary.wraparoundPercent}% of wraparound threshold)`);
      lines.push(`- WAL Archiver: ${report.summary.walArchiverFailing ? 'CRITICAL FAILURE' : 'Healthy'}`);
      lines.push(`- Bloated Tables: ${report.summary.bloatedTablesCount}`);
      lines.push(`- Unused Indexes: ${report.summary.unusedIndexesCount}`);
      lines.push(`- Idle in Transaction: ${report.summary.idleInTxCount}`);
      lines.push(``);
      lines.push(`## Findings (${report.items.length})`);
      report.items.forEach((item) => {
        lines.push(`### [${item.severity.toUpperCase()}] ${item.title}`);
        lines.push(`- Category: ${item.category}`);
        lines.push(`- Metric: ${item.metricValue}`);
        lines.push(`- Description: ${item.description}`);
        lines.push(`- Recommendation: ${item.recommendation}`);
        if (item.remediationSql) {
          lines.push(`\`\`\`sql\n${item.remediationSql}\n\`\`\``);
        }
        lines.push(``);
      });
    } else {
      lines.push(`# گزارش ممیزی جامع سلامت و امنیت پایگاه داده PostgreSQL`);
      lines.push(`- **نام سرور:** ${server.name} (${server.ip || 'localhost'})`);
      lines.push(`- **پایگاه داده بررسی‌شده:** ${report.database}`);
      lines.push(`- **زمان ثبت گزارش:** ${new Date(report.generatedAt).toLocaleString('fa-IR')}`);
      lines.push(`- **امتیاز کلی سلامت:** ${report.overallScore} از ۱۰۰`);
      lines.push(`- **امتیاز امنیت:** ${report.securityScore} از ۱۰۰`);
      lines.push(`- **امتیاز کارایی:** ${report.performanceScore} از ۱۰۰`);
      lines.push(`- **امتیاز نگهداری:** ${report.maintenanceScore} از ۱۰۰`);
      lines.push(`- **امتیاز ذخیره‌سازی:** ${report.storageScore} از ۱۰۰`);
      lines.push(`- **نسخه موتور:** ${report.serverVersion}`);
      lines.push(`- **مدت زمان پایداری:** ${report.uptime}`);
      lines.push(``);
      lines.push(`## شاخص‌های کلیدی امنیت و ذخیره‌سازی`);
      lines.push(`- نرخ کش بافر حافظه: ${report.summary.cacheHitRatio}٪`);
      lines.push(`- نرخ کش ایندکس‌ها: ${report.summary.indexHitRatio}٪`);
      lines.push(`- اشغال ظرفیت اتصالات: ${report.summary.activeConnections} از ${report.summary.maxConnections} (${report.summary.connectionUsagePercent}٪)`);
      lines.push(`- کاربران با دسترسی سوپریوزر: ${report.summary.superusersCount} (${(report.summary.superuserNames || []).join(', ')})`);
      lines.push(`- حساب‌های بدون کلمه عبور: ${report.summary.passwordlessRolesCount} ${report.summary.passwordlessNames?.length ? `(${report.summary.passwordlessNames.join(', ')})` : ''}`);
      lines.push(`- قوانین بدون احراز هویت trust در pg_hba: ${report.summary.openTrustRulesCount}`);
      lines.push(`- رمزنگاری SSL: ${report.summary.sslEnabled ? 'فعال' : 'غیرفعال'}`);
      lines.push(`- مجموع حجم دیتابیس‌های کلاستر: ${report.summary.totalDatabaseSizePretty}`);
      lines.push(`- حداکثر سن شناسه تراکنش (XID): ${report.summary.wraparoundMaxAge.toLocaleString()} (${report.summary.wraparoundPercent}٪ سقف ایمن)`);
      lines.push(`- وضعیت آرشیو WAL: ${report.summary.walArchiverFailing ? 'خطای بحرانی' : 'سالم'}`);
      lines.push(`- جداول با انباشتگی رکوردهای مرده: ${report.summary.bloatedTablesCount}`);
      lines.push(`- ایندکس‌های بلااستفاده: ${report.summary.unusedIndexesCount}`);
      lines.push(`- نشست‌های رهاشده (Idle in Tx): ${report.summary.idleInTxCount}`);
      lines.push(``);
      lines.push(`## فهرست یافته‌ها و ارزیابی‌ها (${report.items.length})`);
      report.items.forEach((item) => {
        lines.push(`### [${item.severity.toUpperCase()}] ${item.titleFa}`);
        lines.push(`- دسته‌بندی: ${item.category}`);
        lines.push(`- مقدار مشاهده‌شده: ${item.metricValue}`);
        lines.push(`- شرح وضعیت: ${item.descriptionFa}`);
        lines.push(`- اقدام پیشنهادی: ${item.recommendationFa}`);
        if (item.remediationSql) {
          lines.push(`\`\`\`sql\n${item.remediationSql}\n\`\`\``);
        }
        lines.push(``);
      });
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  // Export JSON Report
  const exportJsonReport = () => {
    if (!report) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `postgres_health_audit_${report.database}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Print HTML Report
  const printReport = () => {
    window.print();
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    if (!report) return [];
    return report.items.filter((item) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === '' ||
        item.title.toLowerCase().includes(q) ||
        item.titleFa.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.descriptionFa.toLowerCase().includes(q) ||
        item.metricValue.toLowerCase().includes(q) ||
        item.recommendation.toLowerCase().includes(q) ||
        item.recommendationFa.toLowerCase().includes(q);

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesSeverity = severityFilter === 'all' || item.severity === severityFilter;

      return matchesSearch && matchesCategory && matchesSeverity;
    });
  }, [report, searchQuery, categoryFilter, severityFilter]);

  // Score color helper
  const getScoreTheme = (score: number) => {
    if (score >= 90) {
      return {
        text: 'text-emerald-400',
        barBg: 'bg-emerald-500',
        badge: isEn ? 'Excellent Health' : 'سلامت عالی',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    }
    if (score >= 75) {
      return {
        text: 'text-cyan-400',
        barBg: 'bg-cyan-500',
        badge: isEn ? 'Good Condition' : 'وضعیت مطلوب',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      };
    }
    if (score >= 50) {
      return {
        text: 'text-amber-400',
        barBg: 'bg-amber-500',
        badge: isEn ? 'Needs Attention' : 'نیازمند رسیدگی',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      };
    }
    return {
      text: 'text-rose-400',
      barBg: 'bg-rose-500',
      badge: isEn ? 'Critical Vulnerabilities' : 'آسیب‌پذیری بحرانی',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    };
  };

  const overallTheme = getScoreTheme(report?.overallScore ?? 100);

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/70 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`text-sm font-bold ${
                  isLightMode ? 'text-slate-900' : 'text-slate-100'
                }`}
              >
                {isEn
                  ? 'PostgreSQL Health Check & Security Auditing Hub'
                  : 'مرکز ممیزی امنیتی و پایش سلامت پایگاه داده (Health & Security)'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Phase 19
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Vulnerability assessment, passwordless login & superuser auditing, port exposure, storage capacity & wraparound analysis.'
                : 'ارزیابی تنظیمات آسیب‌پذیر، بررسی حساب‌های بدون رمز و سوپریوزرها، تحلیل پورت‌ها، ظرفیت دیسک و سن شناسه‌های تراکنش.'}
            </p>
          </div>
        </div>

        {/* Database Picker & Actions */}
        <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400">
              {isEn ? 'Database:' : 'پایگاه داده:'}
            </span>
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border focus:outline-hidden transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
                  : 'bg-slate-950 border-slate-700 text-slate-100'
              }`}
            >
              {databases.map((db) => (
                <option key={db.oid} value={db.name}>
                  {db.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => selectedDb && runAudit(selectedDb)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? (isEn ? 'Auditing...' : 'در حال ممیزی...') : (isEn ? 'Run Audit' : 'اجرای ممیزی')}</span>
          </button>

          {report && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={copyAuditSummary}
                className={`p-1.5 rounded-xl border transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
                title={isEn ? 'Copy Markdown Audit Summary' : 'کپی خلاصه ممیزی (Markdown)'}
              >
                {copiedSummary ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={exportJsonReport}
                className={`p-1.5 rounded-xl border transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
                title={isEn ? 'Export Full JSON Report' : 'دریافت خروجی کامل JSON'}
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={printReport}
                className={`p-1.5 rounded-xl border transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
                title={isEn ? 'Print / Export PDF' : 'چاپ یا دریافت PDF'}
              >
                <Printer className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{isEn ? error.en : error.fa || error.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Critical Warnings Flash Banner (Passwordless, Wraparound, WAL Archiver, Trust Rules) */}
      {report && (report.summary.passwordlessRolesCount > 0 || report.summary.openTrustRulesCount > 0 || report.summary.walArchiverFailing || report.summary.wraparoundPercent > 50) && (
        <div
          className={`p-4 rounded-2xl border space-y-2 ${
            isLightMode ? 'bg-rose-50/90 border-rose-300 text-rose-900' : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-500 animate-bounce" />
            <span>{isEn ? 'Critical Security & Health Flags Detected' : 'شدیدترین هشدارهای امنیتی و سلامت شناسایی شدند'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {report.summary.passwordlessRolesCount > 0 && (
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
                <Unlock className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">
                  {report.summary.passwordlessRolesCount} {isEn ? 'Passwordless Login Account(s)' : 'حساب بدون رمز عبور'}
                </span>
              </div>
            )}
            {report.summary.openTrustRulesCount > 0 && (
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">
                  {report.summary.openTrustRulesCount} {isEn ? 'pg_hba "trust" rule(s)' : 'قانون بدون رمز در pg_hba'}
                </span>
              </div>
            )}
            {report.summary.walArchiverFailing && (
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{isEn ? 'WAL Archiver Failing' : 'خطای آرشیو لاگ WAL'}</span>
              </div>
            )}
            {report.summary.wraparoundPercent > 50 && (
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
                <Zap className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">
                  {report.summary.wraparoundPercent}% {isEn ? 'Wraparound Risk' : 'خطر Wraparound'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Executive Scorecard & Category Breakdown */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main Scorecard (4 cols) */}
          <div
            className={`lg:col-span-4 p-4 rounded-2xl border flex flex-col justify-between ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">
                  {isEn ? 'Overall Health & Posture' : 'شاخص کلی سلامت و امنیت'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${overallTheme.badgeColor}`}>
                  {overallTheme.badge}
                </span>
              </div>

              <div className="my-3 flex items-baseline gap-2">
                <span className={`text-4xl font-black font-mono tracking-tight ${overallTheme.text}`}>
                  {report.overallScore}
                </span>
                <span className="text-xs text-slate-400 font-mono">/ 100</span>
              </div>

              {/* Four Sub-scores with mini bars */}
              <div className="space-y-2 pt-2 border-t border-slate-800/40 text-xs">
                {/* Security Score */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Shield className="w-3 h-3 text-purple-400" />
                      <span>{isEn ? 'Security' : 'امنیت'}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">{report.securityScore}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${getScoreTheme(report.securityScore).barBg}`}
                      style={{ width: `${report.securityScore}%` }}
                    />
                  </div>
                </div>

                {/* Performance Score */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Cpu className="w-3 h-3 text-cyan-400" />
                      <span>{isEn ? 'Performance' : 'کارایی و حافظه'}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">{report.performanceScore}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${getScoreTheme(report.performanceScore).barBg}`}
                      style={{ width: `${report.performanceScore}%` }}
                    />
                  </div>
                </div>

                {/* Maintenance Score */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Wrench className="w-3 h-3 text-amber-400" />
                      <span>{isEn ? 'Maintenance (VACUUM)' : 'نگهداری و پاکسازی'}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">{report.maintenanceScore}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${getScoreTheme(report.maintenanceScore).barBg}`}
                      style={{ width: `${report.maintenanceScore}%` }}
                    />
                  </div>
                </div>

                {/* Storage & Durability Score */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <HardDrive className="w-3 h-3 text-emerald-400" />
                      <span>{isEn ? 'Storage & Durability' : 'ذخیره‌سازی و پایداری'}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">{report.storageScore}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${getScoreTheme(report.storageScore).barBg}`}
                      style={{ width: `${report.storageScore}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Check breakdown pills */}
            <div className="grid grid-cols-3 gap-1.5 pt-3 border-t border-slate-800/60 text-center font-mono text-[11px] mt-3">
              <div className="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <div className="font-bold">{report.passedCount}</div>
                <div className="text-[9px] text-slate-400 uppercase">{isEn ? 'Passed' : 'مطلوب'}</div>
              </div>
              <div className="p-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <div className="font-bold">{report.warningCount}</div>
                <div className="text-[9px] text-slate-400 uppercase">{isEn ? 'Warnings' : 'هشدار'}</div>
              </div>
              <div className="p-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <div className="font-bold">{report.criticalCount}</div>
                <div className="text-[9px] text-slate-400 uppercase">{isEn ? 'Critical' : 'بحرانی'}</div>
              </div>
            </div>
          </div>

          {/* Quick Metrics KPI Grid (8 cols) */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* KPI 1: Buffer Cache Hit */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'Buffer Cache Hit' : 'نرخ کش بافر'}</span>
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div
                className={`text-base font-bold font-mono ${
                  report.summary.cacheHitRatio >= 95 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {report.summary.cacheHitRatio}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isEn ? 'Target: >99% in RAM' : 'هدف: بالای ۹۹٪ در رم'}
              </div>
            </div>

            {/* KPI 2: Connection Saturation */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'Connections' : 'اتصالات فعال'}</span>
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div
                className={`text-base font-bold font-mono ${
                  report.summary.connectionUsagePercent < 80 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.summary.activeConnections} / {report.summary.maxConnections}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {report.summary.connectionUsagePercent}% {isEn ? 'capacity' : 'اشغال'} ({report.summary.idleInTxCount} {isEn ? 'idle in tx' : 'معلق'})
              </div>
            </div>

            {/* KPI 3: Superusers & Passwordless */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'Roles & Access' : 'نقش‌ها و دسترسی'}</span>
                <Key className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div
                className={`text-base font-bold font-mono ${
                  report.summary.passwordlessRolesCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {report.summary.superusersCount} {isEn ? 'Superuser(s)' : 'سوپریوزر'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {report.summary.passwordlessRolesCount > 0 ? (
                  <span className="text-rose-400 font-bold">
                    {report.summary.passwordlessRolesCount} {isEn ? 'without password!' : 'بدون رمز!'}
                  </span>
                ) : (
                  <span>{isEn ? 'All roles secured' : 'همگی دارای رمز'}</span>
                )}
              </div>
            </div>

            {/* KPI 4: Cluster Storage Footprint */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'Cluster Storage' : 'حجم کل کلاستر'}</span>
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-base font-bold font-mono text-emerald-400">
                {report.summary.totalDatabaseSizePretty}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {databases.length} {isEn ? 'databases' : 'پایگاه داده'}
              </div>
            </div>

            {/* KPI 5: Transaction ID (XID) Wraparound */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'XID Age / Wraparound' : 'سن تراکنش (XID)'}</span>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div
                className={`text-base font-bold font-mono ${
                  report.summary.wraparoundPercent < 50 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.summary.wraparoundPercent}% {isEn ? 'of 2B' : 'از ۲ میلیارد'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate font-mono">
                {report.summary.wraparoundMaxAge.toLocaleString()} XIDs
              </div>
            </div>

            {/* KPI 6: Encryption & Auth */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'Encryption & Auth' : 'رمزنگاری و پورت'}</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div
                className={`text-base font-bold font-mono ${
                  report.summary.sslEnabled ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                SSL: {report.summary.sslEnabled ? (isEn ? 'Active' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {report.summary.openTrustRulesCount > 0 ? (
                  <span className="text-rose-400 font-bold">{report.summary.openTrustRulesCount} {isEn ? 'trust rules!' : 'قانون trust!'}</span>
                ) : (
                  <span>{isEn ? 'pg_hba hardened' : 'احراز هویت ایمن'}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search audit checks, security findings, SQL scripts...'
                : 'جستجو در ممیزی‌ها، یافته‌های امنیتی، اسکریپت‌های اصلاحی...'
            }
            className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs font-mono border focus:outline-hidden transition ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-emerald-500'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Severity Filter & Category Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Severity Tabs */}
          <div
            className={`flex items-center p-1 rounded-xl border ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            {(
              [
                { id: 'all', label: isEn ? 'All' : 'همه' },
                { id: 'critical', label: isEn ? 'Critical' : 'بحرانی' },
                { id: 'warning', label: isEn ? 'Warnings' : 'هشدارها' },
                { id: 'good', label: isEn ? 'Healthy' : 'مطلوب' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSeverityFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  severityFilter === tab.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
            <option value="security">{isEn ? 'Security & Accounts' : 'امنیت و دسترسی'}</option>
            <option value="storage">{isEn ? 'Storage & Durability' : 'ذخیره‌سازی و دیسک'}</option>
            <option value="performance">{isEn ? 'Performance & RAM' : 'کارایی و حافظه'}</option>
            <option value="maintenance">{isEn ? 'Maintenance (VACUUM)' : 'نگهداری و پاکسازی'}</option>
            <option value="configuration">{isEn ? 'Configuration' : 'پیکربندی سرور'}</option>
          </select>

          {/* Expand/Collapse All Buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleAll(true)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer ${
                isLightMode ? 'border-slate-200 hover:bg-slate-100 text-slate-700' : 'border-slate-800 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isEn ? 'Expand All' : 'باز کردن همه'}
            </button>
            <button
              type="button"
              onClick={() => toggleAll(false)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer ${
                isLightMode ? 'border-slate-200 hover:bg-slate-100 text-slate-700' : 'border-slate-800 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isEn ? 'Collapse All' : 'بستن همه'}
            </button>
          </div>
        </div>
      </div>

      {/* Audit Checklist Findings */}
      <div className="space-y-3">
        {loading && !report ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mx-auto mb-2" />
            <p className="text-xs">
              {isEn
                ? 'Executing authentic deep PostgreSQL health, security & storage audit...'
                : 'در حال اجرای ممیزی جامع، اصیل و عمیق سلامت، امنیت و ذخیره‌سازی PostgreSQL...'}
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div
            className={`p-8 rounded-2xl border text-center ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="font-semibold text-slate-300 text-sm">
              {isEn ? 'No issues matching current filters' : 'موردی با فیلترهای انتخابی یافت نشد'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isEn ? 'All verified parameters in this category are healthy.' : 'تمامی شاخص‌های این دسته در وضعیت مطلوب قرار دارند.'}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isExpanded = expandedItems[item.id] !== false; // default expanded

            const severityBorder =
              item.severity === 'critical'
                ? 'border-rose-500/40 bg-rose-950/20'
                : item.severity === 'warning'
                ? 'border-amber-500/40 bg-amber-950/20'
                : item.severity === 'good'
                ? 'border-emerald-500/30 bg-emerald-950/10'
                : 'border-slate-800 bg-slate-900/40';

            const severityBadge =
              item.severity === 'critical'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : item.severity === 'warning'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : item.severity === 'good'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700';

            const categoryIcon =
              item.category === 'security' ? (
                <ShieldCheck className="w-4 h-4 text-purple-400" />
              ) : item.category === 'storage' ? (
                <HardDrive className="w-4 h-4 text-emerald-400" />
              ) : item.category === 'performance' ? (
                <Cpu className="w-4 h-4 text-cyan-400" />
              ) : item.category === 'maintenance' ? (
                <Wrench className="w-4 h-4 text-amber-400" />
              ) : (
                <SlidersHorizontal className="w-4 h-4 text-blue-400" />
              );

            return (
              <div
                key={item.id}
                className={`rounded-2xl border transition-all p-4 ${severityBorder}`}
              >
                {/* Header row */}
                <div
                  className="flex items-center justify-between gap-3 cursor-pointer select-none"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 shrink-0">
                      {categoryIcon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-100">
                          {isEn ? item.title : item.titleFa}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${severityBadge}`}>
                          {item.severity}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                          {item.category}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-1.5">
                        <span className="text-slate-500">{isEn ? 'Observed:' : 'مقدار مشاهده‌شده:'}</span>
                        <span className="text-slate-200 font-semibold">{item.metricValue}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <FieldInfoTooltip
                      title={isEn ? item.title : item.titleFa}
                      whatIsIt={isEn ? item.description : item.descriptionFa}
                      whyNeeded={isEn ? item.recommendation : item.recommendationFa}
                      practicalExample={item.metricValue}
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                    <button
                      type="button"
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-800/50 space-y-3 text-xs">
                    {/* Description */}
                    <p className="text-slate-300 leading-relaxed">
                      {isEn ? item.description : item.descriptionFa}
                    </p>

                    {/* Recommendation box */}
                    <div className="p-3 rounded-xl bg-black/40 border border-slate-800 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-emerald-400 block mb-0.5">
                          {isEn ? 'Recommended Action:' : 'اقدام پیشنهادی:'}
                        </span>
                        <span className="text-slate-300">
                          {isEn ? item.recommendation : item.recommendationFa}
                        </span>
                      </div>
                    </div>

                    {/* Remediation SQL Snippet */}
                    {item.remediationSql && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{isEn ? 'Remediation SQL Script' : 'اسکریپت اصلاحی SQL'}</span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            {onNavigateToSqlStudio && (
                              <button
                                type="button"
                                onClick={() => onNavigateToSqlStudio(item.remediationSql!)}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:bg-blue-600/50 transition cursor-pointer flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>{isEn ? 'Open in SQL Studio' : 'باز کردن در ویرایشگر SQL'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => copyRemediation(item.id, item.remediationSql!)}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
                            >
                              {copiedSqlId === item.id ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedSqlId === item.id ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                            </button>
                          </div>
                        </div>

                        <pre
                          className="p-3 rounded-xl bg-black/70 border border-slate-800 text-[11px] font-mono text-emerald-400 select-all overflow-x-auto whitespace-pre-wrap"
                          dir="ltr"
                        >
                          {item.remediationSql}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
