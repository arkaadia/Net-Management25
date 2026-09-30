import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Download,
  Copy,
  Check,
  X,
  Lock,
  Unlock,
  Key,
  Database,
  Cpu,
  FileText,
  Clock,
  Terminal,
  ChevronDown,
  ChevronUp,
  Zap,
  Filter,
  HardDrive,
  Eye,
  Activity,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlSecurityAuditReport,
  MysqlSecurityCheckItem,
  MysqlSecurityCategory,
  MysqlSecurityRiskLevel,
  MysqlAuditLogEntry,
} from '../../types';
import {
  fetchRemoteServerMysqlSecurityAudit,
  executeRemoteServerMysqlHardeningRemediation,
  fetchRemoteServerMysqlAuditLogs,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlSecurityAuditTabProps {
  server: RemoteServer;
  isLightMode?: boolean;
  isEn?: boolean;
  onNavigateToSqlStudio?: (sql: string) => void;
}

export const MysqlSecurityAuditTab: React.FC<MysqlSecurityAuditTabProps> = ({
  server,
  isLightMode = false,
  isEn = true,
  onNavigateToSqlStudio,
}) => {
  // Main view state
  const [activeSubView, setActiveSubView] = useState<'audit_checks' | 'audit_trail'>('audit_checks');

  // Audit report state
  const [report, setReport] = useState<MysqlSecurityAuditReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditErrorFa, setAuditErrorFa] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

  // Remediation modal state
  const [remediatingCheck, setRemediatingCheck] = useState<MysqlSecurityCheckItem | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  const [remediationResult, setRemediationResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Audit trail state
  const [auditLogs, setAuditLogs] = useState<MysqlAuditLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilterCategory, setLogFilterCategory] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState('');

  // Toast / notification state
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);

  // Fetch security audit report
  const loadSecurityAudit = useCallback(async () => {
    setIsLoading(true);
    setAuditError(null);
    setAuditErrorFa(null);
    try {
      const res = await fetchRemoteServerMysqlSecurityAudit(server.id);
      if (res.success && res.report) {
        setReport(res.report);
      } else {
        setAuditError(res.error || 'Failed to complete security audit.');
        setAuditErrorFa(res.errorFa || 'خطا در ارزیابی و اجرای ممیزی امنیتی MySQL.');
      }
    } catch (err: any) {
      setAuditError(err.message || 'Network communication error during audit.');
      setAuditErrorFa('خطای ارتباط شبکه در حین اجرای ممیزی امنیتی.');
    } finally {
      setIsLoading(false);
    }
  }, [server.id]);

  // Fetch persistent audit logs
  const loadAuditLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetchRemoteServerMysqlAuditLogs(server.id, 150);
      if (res.success && res.entries) {
        setAuditLogs(res.entries);
      }
    } catch (err) {
      console.warn('[MysqlAuditTab] Failed to fetch audit logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadSecurityAudit();
    loadAuditLogs();
  }, [loadSecurityAudit, loadAuditLogs]);

  // Handle remediation execution
  const handleExecuteRemediation = async () => {
    if (!remediatingCheck) return;
    setIsApplyingFix(true);
    setRemediationResult(null);

    try {
      const res = await executeRemoteServerMysqlHardeningRemediation(server.id, {
        checkId: remediatingCheck.id,
        action: 'apply_fix',
      });

      if (res.success) {
        setRemediationResult({
          success: true,
          msg: isEn ? res.message : res.messageFa,
        });
        // Refresh audit report & logs
        setTimeout(() => {
          loadSecurityAudit();
          loadAuditLogs();
          setRemediatingCheck(null);
        }, 1200);
      } else {
        setRemediationResult({
          success: false,
          msg: isEn ? res.message : res.messageFa,
        });
      }
    } catch (err: any) {
      setRemediationResult({
        success: false,
        msg: err.message || 'Remediation request failed.',
      });
    } finally {
      setIsApplyingFix(false);
    }
  };

  // Copy SQL helper
  const handleCopySql = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 2500);
  };

  // Export report as JSON
  const handleExportReport = () => {
    if (!report) return;
    const jsonStr = JSON.stringify(report, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mysql-security-audit-${server.ip}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered check items
  const filteredChecks = useMemo(() => {
    if (!report?.checks) return [];
    return report.checks.filter((chk) => {
      // Category filter
      if (selectedCategory !== 'ALL' && chk.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'ALL' && chk.status !== selectedStatus) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = (chk.title || '').toLowerCase().includes(q) || (chk.titleFa || '').toLowerCase().includes(q);
        const inDesc = (chk.description || '').toLowerCase().includes(q) || (chk.descriptionFa || '').toLowerCase().includes(q);
        const inId = chk.id.toLowerCase().includes(q);
        if (!inTitle && !inDesc && !inId) return false;
      }
      return true;
    });
  }, [report, selectedCategory, selectedStatus, searchQuery]);

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (logFilterCategory !== 'ALL' && log.category !== logFilterCategory) {
        return false;
      }
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase().trim();
        const inAction = (log.action || '').toLowerCase().includes(q) || (log.actionFa || '').toLowerCase().includes(q);
        const inTarget = (log.target || '').toLowerCase().includes(q);
        const inUser = (log.user || '').toLowerCase().includes(q);
        if (!inAction && !inTarget && !inUser) return false;
      }
      return true;
    });
  }, [auditLogs, logFilterCategory, logSearch]);

  // Helper score color
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 border-emerald-500 bg-emerald-500/10';
    if (score >= 70) return 'text-cyan-500 border-cyan-500 bg-cyan-500/10';
    if (score >= 50) return 'text-amber-500 border-amber-500 bg-amber-500/10';
    return 'text-rose-500 border-rose-500 bg-rose-500/10';
  };

  const getRiskBadge = (risk: MysqlSecurityRiskLevel) => {
    switch (risk) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-600 text-white shadow-xs">
            {isEn ? 'Critical Risk' : 'ریسک بحرانی'}
          </span>
        );
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-600 text-white shadow-xs">
            {isEn ? 'High Risk' : 'ریسک بالا'}
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-600 text-white shadow-xs">
            {isEn ? 'Medium Risk' : 'ریسک متوسط'}
          </span>
        );
      case 'low':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-600 text-white shadow-xs">
            {isEn ? 'Low Risk' : 'ریسک پایین'}
          </span>
        );
      case 'good':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-600 text-white shadow-xs">
            {isEn ? 'Hardened / Secure' : 'ایمن و محافظت‌شده'}
          </span>
        );
    }
  };

  const getStatusIcon = (status: MysqlSecurityCheckItem['status']) => {
    switch (status) {
      case 'failed':
        return <XCircle className="w-5 h-5 text-rose-500 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />;
      case 'passed':
      default:
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* HEADER / OVERVIEW CARD */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/90 border-slate-800 shadow-md'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-2xl ${
                isLightMode ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' : 'bg-cyan-950/50 text-cyan-400 border border-cyan-800/60'
              }`}
            >
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                  {isEn ? 'MySQL Security Audit & Safety Hardening' : 'ممیزی امنیتی و مقاوم‌سازی پایگاه داده MySQL'}
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    isLightMode ? 'bg-slate-100 text-slate-600 border border-slate-200' : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  Phase 20
                </span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  title={isEn ? 'Production Hardening & Audit Hub' : 'سامانه ممیزی و مقاوم‌سازی امنیتی'}
                  infoWhatEn="A comprehensive security compliance scanner and hardening suite for MySQL/MariaDB instances. Audits passwords, excessive grants, TLS/SSL transport, file boundaries (secure_file_priv), and query safety."
                  infoWhatFa="مجموعه بازرسی امنیتی و مقاوم‌سازی برای پایگاه‌های داده MySQL/MariaDB. بررسی کلمات عبور، مجوزهای دسترسی، رمزنگاری TLS/SSL، حریم فایل‌های سرور و امنیت کوئری‌ها."
                  infoWhyEn="Identifies exploitable vulnerabilities, unauthenticated root accounts, public network exposures, and accidental mass-deletion vectors before attackers exploit them."
                  infoWhyFa="شناسایی آسیب‌پذیری‌ها، حساب‌های بدون رمز ریشه، درگاه‌های باز شبکه و خطرات حذف ناخواسته داده‌ها قبل از وقوع حوادث امنیتی."
                  infoExampleEn="Disables local_infile, enforces require_secure_transport, revokes FILE grants, and enables safe update modes."
                  infoExampleFa="غیرفعال‌سازی local_infile، الزام رمزنگاری SSL، سلب مجوزهای خطرناک فایل و فعال‌سازی حالت‌های امنیتی."
                />
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Real-time vulnerability assessment, zero simulated checks, automated 1-click remediation, and persistent audit logging.'
                  : 'ارزیابی بی‌درنگ آسیب‌پذیری‌ها، داده‌های واقعی، اصلاح امنیتی خودکار و ثبت تاریخچه عملیات در لاگ حسابرسی.'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap self-end lg:self-auto">
            <button
              type="button"
              onClick={handleExportReport}
              disabled={!report}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              } disabled:opacity-50`}
              title={isEn ? 'Export security audit report as JSON' : 'خروجی گزارش ممیزی امنیتی به صورت JSON'}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isEn ? 'Export Report' : 'دریافت گزارش'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadSecurityAudit();
                loadAuditLogs();
              }}
              disabled={isLoading}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                isLightMode
                  ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? (isEn ? 'Auditing...' : 'در حال بررسی...') : isEn ? 'Run Full Audit' : 'اجرای ممیزی کامل'}</span>
            </button>
          </div>
        </div>

        {/* SCORE & TELEMETRY STRIP */}
        {report && (
          <div className="mt-5 pt-4 border-t border-slate-700/30 grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
            {/* Overall Score */}
            <div className="flex items-center gap-3 col-span-2 sm:col-span-1">
              <div
                className={`w-14 h-14 rounded-2xl border-2 flex flex-col items-center justify-center font-bold font-mono text-xl ${getScoreColor(
                  report.overallScore
                )}`}
              >
                <span>{report.overallScore}</span>
                <span className="text-[9px] font-sans -mt-1 opacity-75">{isEn ? '/ 100' : 'از ۱۰۰'}</span>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">{isEn ? 'Security Score' : 'امتیاز امنیتی'}</div>
                <div className="mt-0.5">{getRiskBadge(report.overallRisk)}</div>
              </div>
            </div>

            {/* Total Checks */}
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <div>
                <div className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                  {report.totalChecks}
                </div>
                <div className="text-[10px] text-slate-400">{isEn ? 'Total Rules Evaluated' : 'قوانین ارزیابی‌شده'}</div>
              </div>
            </div>

            {/* Passed Checks */}
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-base font-bold text-emerald-500">{report.passedChecks}</div>
                <div className="text-[10px] text-slate-400">{isEn ? 'Passed Checks' : 'موارد ایمن'}</div>
              </div>
            </div>

            {/* Warnings */}
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-base font-bold text-amber-500">{report.warningChecks}</div>
                <div className="text-[10px] text-slate-400">{isEn ? 'Warnings' : 'هشدارها'}</div>
              </div>
            </div>

            {/* Failed Checks */}
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <XCircle className="w-4 h-4 text-rose-400" />
              <div>
                <div className="text-base font-bold text-rose-500">{report.failedChecks}</div>
                <div className="text-[10px] text-slate-400">{isEn ? 'Critical / Failed' : 'موارد آسیب‌پذیر'}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ERROR BANNER */}
      {auditError && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-xs ${
            isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/50 border-rose-800 text-rose-200'
          }`}
        >
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">{isEn ? 'Audit Failure: ' : 'خطای ممیزی: '}</span>
            <span>{isEn ? auditError : auditErrorFa || auditError}</span>
          </div>
          <button
            type="button"
            onClick={loadSecurityAudit}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition cursor-pointer"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      {/* SUB-VIEW SWITCHER & CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* View Tabs */}
        <div
          className={`p-1 rounded-xl border inline-flex gap-1 ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveSubView('audit_checks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              activeSubView === 'audit_checks'
                ? 'bg-cyan-600 text-white shadow-xs'
                : isLightMode
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isEn ? 'Security Checks & Hardening' : 'آسیب‌پذیری‌ها و اصلاحات'}</span>
            {report && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800/40 text-white font-mono">
                {report.checks.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('audit_trail')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              activeSubView === 'audit_trail'
                ? 'bg-cyan-600 text-white shadow-xs'
                : isLightMode
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isEn ? 'Administrative Audit Trail' : 'لاگ حسابرسی عملیات مدیر'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800/40 text-white font-mono">
              {auditLogs.length}
            </span>
          </button>
        </div>

        {/* Filter bar for active subview */}
        {activeSubView === 'audit_checks' ? (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search check items...' : 'جستجو در قوانین امنیتی...'}
                className={`pl-8 pr-3 py-1.5 rounded-lg text-xs border transition outline-hidden ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-800 focus:border-cyan-500'
                    : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs border transition outline-hidden cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <option value="ALL">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
              <option value="authentication">{isEn ? 'Authentication & Passwords' : 'احراز هویت و کلمات عبور'}</option>
              <option value="privileges">{isEn ? 'Privileges & Permissions' : 'مجوزها و دسترسی‌ها'}</option>
              <option value="network_ssl">{isEn ? 'Network & TLS/SSL' : 'شبکه و رمزنگاری SSL'}</option>
              <option value="engine_hardening">{isEn ? 'File & OS Hardening' : 'حریم فایل‌ها و سیستم‌عامل'}</option>
              <option value="data_protection">{isEn ? 'Data Protection & Safety' : 'حفاظت داده و حالت ایمن'}</option>
              <option value="logging_audit">{isEn ? 'Logging & Recovery' : 'ثبت لاگ و رهگیری'}</option>
            </select>

            {/* Status Dropdown */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs border transition outline-hidden cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <option value="ALL">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
              <option value="failed">{isEn ? 'Failed Only' : 'فقط موارد مردود'}</option>
              <option value="warning">{isEn ? 'Warnings Only' : 'فقط هشدارها'}</option>
              <option value="passed">{isEn ? 'Passed Only' : 'فقط موارد ایمن'}</option>
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder={isEn ? 'Filter audit trail...' : 'فیلتر لاگ عملیات...'}
                className={`pl-8 pr-3 py-1.5 rounded-lg text-xs border transition outline-hidden ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-800 focus:border-cyan-500'
                    : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-cyan-500'
                }`}
              />
              {logSearch && (
                <button
                  type="button"
                  onClick={() => setLogSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <select
              value={logFilterCategory}
              onChange={(e) => setLogFilterCategory(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs border transition outline-hidden cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <option value="ALL">{isEn ? 'All Action Categories' : 'همه انواع عملیات'}</option>
              <option value="user_management">{isEn ? 'User Management' : 'مدیریت کاربران'}</option>
              <option value="grant_revoke">{isEn ? 'Grant / Revoke Privileges' : 'اعطا و سلب مجوزها'}</option>
              <option value="destructive_ddl">{isEn ? 'Destructive DDL (Drop/Truncate)' : 'دستورات مخرب DDL'}</option>
              <option value="config_mutation">{isEn ? 'Configuration & Hardening' : 'پیکربندی و اصلاحات امنیتی'}</option>
              <option value="replication_control">{isEn ? 'Replication Actions' : 'عملیات رونویسی'}</option>
              <option value="backup_restore">{isEn ? 'Backup & Restore' : 'پشتیبان‌گیری و بازیابی'}</option>
              <option value="session_kill">{isEn ? 'Process Termination' : 'قطع اتصال نشست‌ها'}</option>
            </select>
          </div>
        )}
      </div>

      {/* SUB-VIEW 1: AUDIT CHECKS & REMEDIATION */}
      {activeSubView === 'audit_checks' && (
        <div className="space-y-3">
          {isLoading && !report ? (
            <div
              className={`p-12 rounded-2xl border flex flex-col items-center justify-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
              <p className={`text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn ? 'Evaluating 12+ security parameters against live database...' : 'در حال بررسی استانداردهای امنیتی روی سرور زنده...'}
              </p>
            </div>
          ) : filteredChecks.length === 0 ? (
            <div
              className={`p-10 rounded-2xl border text-center ${
                isLightMode ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <ShieldCheck className="w-10 h-10 mx-auto opacity-40 mb-2" />
              <p className="text-sm font-semibold">{isEn ? 'No check items match the active filters.' : 'هیچ قانونی با این فیلترها یافت نشد.'}</p>
              <p className="text-xs mt-1">{isEn ? 'Try adjusting your search query or category.' : 'دسته‌بندی یا عبارت جستجو را تغییر دهید.'}</p>
            </div>
          ) : (
            filteredChecks.map((chk) => {
              const isExpanded = expandedCheckId === chk.id;
              const hasRemediation = Boolean(chk.remediationSql);

              return (
                <div
                  key={chk.id}
                  className={`rounded-2xl border transition-all ${
                    chk.status === 'failed'
                      ? isLightMode
                        ? 'bg-rose-50/30 border-rose-200 hover:border-rose-300'
                        : 'bg-rose-950/10 border-rose-900/50 hover:border-rose-800/80'
                      : chk.status === 'warning'
                      ? isLightMode
                        ? 'bg-amber-50/30 border-amber-200 hover:border-amber-300'
                        : 'bg-amber-950/10 border-amber-900/50 hover:border-amber-800/80'
                      : isLightMode
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="mt-0.5">{getStatusIcon(chk.status)}</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                            {isEn ? chk.title : chk.titleFa}
                          </h4>
                          {getRiskBadge(chk.riskLevel)}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                              isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {chk.category}
                          </span>
                        </div>
                        <p className={`text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
                          {isEn ? chk.description : chk.descriptionFa}
                        </p>

                        {/* Values comparison */}
                        <div className="flex items-center gap-3 text-[11px] pt-1 flex-wrap">
                          <div>
                            <span className="text-slate-400">{isEn ? 'Current: ' : 'وضعیت فعلی: '}</span>
                            <span
                              className={`font-mono font-semibold ${
                                chk.status === 'failed'
                                  ? 'text-rose-500'
                                  : chk.status === 'warning'
                                  ? 'text-amber-500'
                                  : 'text-emerald-500'
                              }`}
                            >
                              {chk.currentValue}
                            </span>
                          </div>
                          <span className="text-slate-500">•</span>
                          <div>
                            <span className="text-slate-400">{isEn ? 'Recommended: ' : 'مقدار پیشنهادی: '}</span>
                            <span className="font-mono font-medium text-slate-300">{chk.recommendedValue}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      {hasRemediation && chk.status !== 'passed' && (
                        <button
                          type="button"
                          onClick={() => setRemediatingCheck(chk)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                          title={isEn ? 'Apply 1-click automated hardening fix' : 'اعمال خودکار اصلاح امنیتی'}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>{isEn ? '1-Click Fix' : 'اصلاح سریع'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedCheckId(isExpanded ? null : chk.id)}
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          isLightMode
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                        title={isEn ? 'Toggle details' : 'نمایش جزئیات بیشتر'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* EXPANDED ACCORDION DRAWER */}
                  {isExpanded && (
                    <div
                      className={`p-4 sm:p-5 border-t space-y-3 text-xs ${
                        isLightMode ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                      }`}
                    >
                      {/* Security Impact */}
                      <div>
                        <div className="font-semibold text-slate-400 text-[11px] mb-1">
                          {isEn ? 'Exploitability & Threat Impact:' : 'تاثیر و سناریوی تهدید امنیتی:'}
                        </div>
                        <p className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                          {isEn ? chk.impact : chk.impactFa}
                        </p>
                      </div>

                      {/* Details list if available */}
                      {chk.details && chk.details.length > 0 && (
                        <div>
                          <div className="font-semibold text-slate-400 text-[11px] mb-1.5">
                            {isEn ? 'Affected Accounts / Resources:' : 'حساب‌ها و منابع شناسایی‌شده:'}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {chk.details.map((d, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded-lg border flex items-center justify-between text-xs font-mono ${
                                  d.isWarning
                                    ? isLightMode
                                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                                    : isLightMode
                                    ? 'bg-white border-slate-200 text-slate-800'
                                    : 'bg-slate-900 border-slate-800 text-slate-200'
                                }`}
                              >
                                <span>{isEn ? d.label : d.labelFa}</span>
                                <span className="font-bold">{d.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Remediation Guide & SQL */}
                      <div className="pt-2 border-t border-slate-700/20 space-y-2">
                        <div className="font-semibold text-slate-400 text-[11px]">
                          {isEn ? 'Remediation Steps & Hardening Guide:' : 'راهکار رفع و دستورالعمل مقاوم‌سازی:'}
                        </div>
                        <p className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                          {isEn ? chk.remediationGuide : chk.remediationGuideFa || chk.remediationGuide}
                        </p>

                        {chk.remediationSql && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>{isEn ? 'Remediation SQL:' : 'دستور SQL اصلاحی:'}</span>
                              <div className="flex items-center gap-2">
                                {onNavigateToSqlStudio && (
                                  <button
                                    type="button"
                                    onClick={() => onNavigateToSqlStudio(chk.remediationSql!)}
                                    className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <Terminal className="w-3 h-3" />
                                    <span>{isEn ? 'Open in Query Editor' : 'ویرایش در SQL Studio'}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleCopySql(chk.remediationSql!, chk.id)}
                                  className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedSqlId === chk.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>{isEn ? 'Copy SQL' : 'کپی دستور'}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            <pre
                              className={`p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto border ${
                                isLightMode ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-cyan-300'
                              }`}
                            >
                              {chk.remediationSql}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUB-VIEW 2: ADMINISTRATIVE AUDIT TRAIL */}
      {activeSubView === 'audit_trail' && (
        <div
          className={`rounded-2xl border overflow-hidden ${
            isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800 shadow-sm'
          }`}
        >
          <div className="p-4 border-b border-slate-700/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <h4 className={`text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                {isEn ? 'Persistent Administrative Action Log' : 'تاریخچه ثبت‌شده عملیات مدیریتی پایگاه داده'}
              </h4>
            </div>
            <button
              type="button"
              onClick={loadAuditLogs}
              disabled={isLoadingLogs}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title={isEn ? 'Refresh audit logs' : 'تازه‌سازی لاگ‌ها'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr
                  className={`border-b text-[11px] font-bold ${
                    isLightMode ? 'bg-slate-100/80 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <th className="py-2.5 px-4">{isEn ? 'Timestamp' : 'زمان'}</th>
                  <th className="py-2.5 px-4">{isEn ? 'Action' : 'عملیات'}</th>
                  <th className="py-2.5 px-4">{isEn ? 'Category' : 'دسته‌بندی'}</th>
                  <th className="py-2.5 px-4">{isEn ? 'Target' : 'هدف'}</th>
                  <th className="py-2.5 px-4">{isEn ? 'Initiator' : 'مجری'}</th>
                  <th className="py-2.5 px-4">{isEn ? 'Status' : 'وضعیت'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/20">
                {isLoadingLogs && auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-500" />
                      {isEn ? 'Loading audit records...' : 'در حال بارگذاری سوابق حسابرسی...'}
                    </td>
                  </tr>
                ) : filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      <FileText className="w-6 h-6 mx-auto mb-1 opacity-40" />
                      {isEn ? 'No administrative actions recorded yet.' : 'هنوز هیچ عملیات مدیریتی ثبت نشده است.'}
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className={`transition ${
                        isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {new Date(log.timestamp).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-200">
                        {isEn ? log.action : log.actionFa || log.action}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            isLightMode ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {log.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-cyan-400 max-w-[200px] truncate" title={log.target}>
                        {log.target}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">
                        {log.user}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.status === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {log.status === 'success' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>{isEn ? 'SUCCESS' : 'موفق'}</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-rose-400" />
                              <span>{isEn ? 'FAILED' : 'ناموفق'}</span>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 1-CLICK REMEDIATION CONFIRMATION MODAL */}
      {remediatingCheck && (
        <div className="fixed inset-0 z-[999995] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold">
                    {isEn ? 'Confirm Automated Hardening Remediation' : 'تایید اجرای اصلاحیه امنیتی خودکار'}
                  </h4>
                  <div className="text-xs text-slate-400">
                    {isEn ? remediatingCheck.title : remediatingCheck.titleFa}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRemediatingCheck(null)}
                className="p-1 hover:text-slate-400 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={`text-xs ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
              {isEn
                ? 'The following SQL statement will be executed on the MySQL server to resolve this vulnerability. An immutable audit record will be logged.'
                : 'دستور SQL زیر جهت رفع این آسیب‌پذیری روی سرور MySQL اجرا خواهد شد و سوابق آن در سیستم لاگ ثبت می‌گردد:'}
            </p>

            {remediatingCheck.remediationSql && (
              <pre
                className={`p-3 rounded-xl font-mono text-xs overflow-x-auto border ${
                  isLightMode ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-800 text-emerald-400'
                }`}
              >
                {remediatingCheck.remediationSql}
              </pre>
            )}

            {remediationResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  remediationResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {remediationResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{remediationResult.msg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-700/40">
              <button
                type="button"
                onClick={() => setRemediatingCheck(null)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  isLightMode ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={handleExecuteRemediation}
                disabled={isApplyingFix}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isApplyingFix && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isApplyingFix ? (isEn ? 'Applying...' : 'در حال اعمال...') : isEn ? 'Execute Fix' : 'اجرای اصلاحیه'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
