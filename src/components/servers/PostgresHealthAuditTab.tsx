import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
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
          en: res.error || 'Failed to complete health audit',
          fa: res.errorFa || 'خطا در ارزیابی سلامت پایگاه داده',
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

  // Copy single SQL remediation
  const copyRemediation = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 2000);
  };

  // Copy whole audit markdown summary
  const copyAuditSummary = () => {
    if (!report) return;
    const lines: string[] = [];
    lines.push(`# PostgreSQL Health & Security Audit Report`);
    lines.push(`- **Server:** ${server.name} (${server.ip || 'localhost'})`);
    lines.push(`- **Database:** ${report.database}`);
    lines.push(`- **Generated At:** ${new Date(report.generatedAt).toLocaleString()}`);
    lines.push(`- **Overall Health Score:** ${report.overallScore}/100`);
    lines.push(`- **Engine Version:** ${report.serverVersion}`);
    lines.push(`- **Uptime:** ${report.uptime}`);
    lines.push(``);
    lines.push(`## KPIs & Summary`);
    lines.push(`- Buffer Cache Hit Ratio: ${report.summary.cacheHitRatio}%`);
    lines.push(`- Index Cache Hit Ratio: ${report.summary.indexHitRatio}%`);
    lines.push(`- Connection Saturation: ${report.summary.activeConnections} / ${report.summary.maxConnections} (${report.summary.connectionUsagePercent}%)`);
    lines.push(`- Superuser Roles: ${report.summary.superusersCount}`);
    lines.push(`- SSL Active: ${report.summary.sslEnabled ? 'Yes' : 'No'}`);
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

  // Filtered Items
  const filteredItems = useMemo(() => {
    if (!report) return [];
    return report.items.filter((item) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.titleFa.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.descriptionFa.toLowerCase().includes(searchQuery.toLowerCase());

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
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        badge: isEn ? 'Excellent Health' : 'سلامت عالی',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    }
    if (score >= 75) {
      return {
        text: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/30',
        badge: isEn ? 'Good Condition' : 'وضعیت مطلوب',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      };
    }
    if (score >= 50) {
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        badge: isEn ? 'Needs Attention' : 'نیازمند رسیدگی',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      };
    }
    return {
      text: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      badge: isEn ? 'Critical Vulnerabilities' : 'آسیب‌پذیری بحرانی',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    };
  };

  const scoreTheme = getScoreTheme(report?.overallScore ?? 100);

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
                  ? 'PostgreSQL Health Check & Security Audit'
                  : 'پایش سلامت، ممیزی امنیتی و تحلیل هوشمند (Health & Audit)'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Phase 15
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Automated security posture audit, buffer cache analysis, index bloat diagnostics, and remediation advisor.'
                : 'ارزیابی خودکار وضعیت امنیتی، نرخ کش بافر، انباشتگی جداول و ایندکس‌ها، و راهکارهای اصلاحی بلادرنگ.'}
            </p>
          </div>
        </div>

        {/* Database Picker & Audit Action */}
        <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
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
            <span>{loading ? (isEn ? 'Auditing...' : 'در حال ممیزی...') : (isEn ? 'Re-Evaluate' : 'ارزیابی مجدد')}</span>
          </button>

          {report && (
            <>
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
            </>
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

      {/* Health Score Overview & Key Metrics */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Score Card */}
          <div
            className={`p-4 rounded-2xl border flex flex-col justify-between ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">
                {isEn ? 'Overall Health Score' : 'امتیاز کلی سلامت'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${scoreTheme.badgeColor}`}
              >
                {scoreTheme.badge}
              </span>
            </div>

            <div className="my-3 flex items-baseline gap-2">
              <span className={`text-4xl font-black font-mono tracking-tight ${scoreTheme.text}`}>
                {report.overallScore}
              </span>
              <span className="text-xs text-slate-400 font-mono">/ 100</span>
            </div>

            {/* Check breakdown badges */}
            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800/60 text-center font-mono text-[11px]">
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

          {/* Quick Metrics Grid (3 cols on large screens) */}
          <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Cache Hit */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'Buffer Cache' : 'کش حافظه'}</span>
                <Cpu className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div
                className={`text-lg font-bold font-mono ${
                  report.summary.cacheHitRatio >= 95 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {report.summary.cacheHitRatio}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isEn ? 'Target: >99%' : 'هدف: بالای ۹۹٪'}
              </div>
            </div>

            {/* Index Hit */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'Index Cache' : 'کش ایندکس‌ها'}</span>
                <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div
                className={`text-lg font-bold font-mono ${
                  report.summary.indexHitRatio >= 90 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {report.summary.indexHitRatio}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {isEn ? 'Target: >95%' : 'هدف: بالای ۹۵٪'}
              </div>
            </div>

            {/* Connection Saturation */}
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
                className={`text-lg font-bold font-mono ${
                  report.summary.connectionUsagePercent < 80 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.summary.activeConnections} / {report.summary.maxConnections}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {report.summary.connectionUsagePercent}% {isEn ? 'capacity' : 'اشغال ظرفیت'}
              </div>
            </div>

            {/* SSL & Security */}
            <div
              className={`p-3 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>{isEn ? 'SSL / TLS' : 'رمزنگاری SSL'}</span>
                {report.summary.sslEnabled ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div
                className={`text-lg font-bold font-mono ${
                  report.summary.sslEnabled ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {report.summary.sslEnabled ? (isEn ? 'Active' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                {report.summary.superusersCount} {isEn ? 'superusers' : 'سوپریوزر'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search audit findings, recommendations or parameters...'
                : 'جستجو در یافته‌های ممیزی، توصیه‌ها یا پارامترها...'
            }
            className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-mono border focus:outline-hidden transition ${
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

        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
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
            <option value="security">{isEn ? 'Security' : 'امنیت'}</option>
            <option value="performance">{isEn ? 'Performance' : 'کارایی و حافظه'}</option>
            <option value="maintenance">{isEn ? 'Maintenance (VACUUM)' : 'نگهداری و پاکسازی'}</option>
            <option value="configuration">{isEn ? 'Configuration' : 'پیکربندی'}</option>
          </select>
        </div>
      </div>

      {/* Audit Checklist Findings */}
      <div className="space-y-3">
        {loading && !report ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mx-auto mb-2" />
            <p className="text-xs">{isEn ? 'Executing deep PostgreSQL health and security audit...' : 'در حال اجرای ممیزی جامع سلامت و امنیت پایگاه داده...'}</p>
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
              {isEn ? 'Your database checks are clean for this category.' : 'بررسی‌های این بخش در وضعیت پایدار هستند.'}
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
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
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
                          {isEn ? 'Recommended Action:' : 'راهکار پیشنهادی:'}
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
                                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:bg-blue-600/50 transition cursor-pointer"
                              >
                                {isEn ? 'Open in SQL Studio' : 'باز کردن در ویرایشگر SQL'}
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
                          className="p-3 rounded-xl bg-black/70 border border-slate-800 text-[11px] font-mono text-emerald-400 select-all overflow-x-auto"
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
