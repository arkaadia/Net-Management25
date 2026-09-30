import React, { useState } from 'react';
import {
  Key,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Settings,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Zap,
  Server,
  AlertTriangle,
  Lock,
  Database,
  ExternalLink,
  ChevronRight,
  Code,
  Sliders,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlConnectionTestResult,
  MysqlAutoFixResult,
  MysqlUserPrivilegesAuditResult,
  MysqlAutoGrantResult,
} from '../../types';
import {
  autoFixRemoteServerMysqlAccess,
  auditRemoteServerMysqlUserPrivileges,
  autoGrantRemoteServerMysqlUserPrivileges,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface MysqlConnectionTroubleshootPanelProps {
  server: RemoteServer;
  testResult: MysqlConnectionTestResult | null;
  isTesting: boolean;
  onRunTest: () => Promise<void>;
  onEditServer?: (server: RemoteServer) => void;
  onOpenTerminal?: (server: RemoteServer) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const MysqlConnectionTroubleshootPanel: React.FC<MysqlConnectionTroubleshootPanelProps> = ({
  server,
  testResult,
  isTesting,
  onRunTest,
  onEditServer,
  onOpenTerminal,
  isLightMode = false,
  isEn = true,
}) => {
  const [activeSection, setActiveSection] = useState<'auto_fix' | 'manual_guide' | 'user_privileges'>('auto_fix');

  // Automated SSH Fix State
  const [ephemeralPass, setEphemeralPass] = useState('');
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  const [fixResult, setFixResult] = useState<MysqlAutoFixResult | null>(null);

  // User Privileges Audit State
  const [isAuditingUser, setIsAuditingUser] = useState(false);
  const [auditResult, setAuditResult] = useState<MysqlUserPrivilegesAuditResult | null>(null);

  // Auto-Grant State
  const [isGranting, setIsGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<MysqlAutoGrantResult | null>(null);

  // Snippet Copy State
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  const hasSshCredentials = Boolean(server.ssh_password || server.ssh_key);

  const handleRunAutoFix = async () => {
    setIsApplyingFix(true);
    setFixResult(null);
    try {
      const res = await autoFixRemoteServerMysqlAccess(server.id, ephemeralPass || undefined);
      setFixResult(res);
      await onRunTest();
    } catch (err: any) {
      setFixResult({
        success: false,
        message: err.message || 'Auto-fix failed',
        messageFa: err.message || 'خطا در اعمال خودکار تنظیمات',
        logs: [`Error: ${err.message}`],
      });
    } finally {
      setIsApplyingFix(false);
    }
  };

  const handleRunAuditUser = async () => {
    setIsAuditingUser(true);
    setAuditResult(null);
    try {
      const res = await auditRemoteServerMysqlUserPrivileges(server.id, ephemeralPass || undefined);
      setAuditResult(res);
    } catch (err: any) {
      setAuditResult({
        success: false,
        message: err.message,
        messageFa: 'خطا در ارزیابی دسترسی‌های کاربر',
        userExists: false,
        username: server.mysql_user || 'root',
        userHosts: [],
        hasRemoteHost: false,
        targetDatabase: server.mysql_database || 'mysql',
        targetDbExists: false,
        hasDbPrivileges: false,
        grants: [],
        recommendedGrantSql: '',
      });
    } finally {
      setIsAuditingUser(false);
    }
  };

  const handleRunAutoGrant = async () => {
    setIsGranting(true);
    setGrantResult(null);
    try {
      const res = await autoGrantRemoteServerMysqlUserPrivileges(server.id, {
        database: server.mysql_database || 'mysql',
        ephemeralSshPassword: ephemeralPass || undefined,
      });
      setGrantResult(res);
      await onRunTest();
      await handleRunAuditUser();
    } catch (err: any) {
      setGrantResult({
        success: false,
        message: err.message,
        messageFa: 'خطا در اعطای دسترسی به کاربر',
        executedSql: '',
      });
    } finally {
      setIsGranting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl pb-4">
      {/* 1. CURRENT CONNECTION PARAMETERS & STATUS */}
      <div
        className={`p-4 rounded-xl border space-y-3 transition-colors ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-bold">
              {isEn ? 'Connection Parameters & Status' : 'پارامترهای اتصال و وضعیت ارتباط'}
            </span>
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              infoWhatEn="Detailed parameters and transport layers used to negotiate MySQL / MariaDB sessions."
              infoWhatFa="پارامترها و پروتکل‌های لایه ارتباطی مورد استفاده جهت تبادل داده با MariaDB/MySQL."
              infoWhyEn="Ensures authentication parameters, ports, and tunneling match server security rules."
              infoWhyFa="اطمینان از تطابق تنظیمات احراز هویت، پورت‌ها و لایه امنیتی با فایروال سرور."
              infoExampleEn="Host: 192.168.1.100, Port: 3306, User: root, Transport: SSH Tunnel"
              infoExampleFa="هاست: ۱۹۲.۱۶۸.۱.۱۰۰، پورت: ۳۳۰۶، کاربر: root، پروتکل: تونل SSH"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRunTest}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Test Connection' : 'تست مجدد اتصال'}</span>
            </button>
            {onEditServer && (
              <button
                type="button"
                onClick={() => onEditServer(server)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                  isLightMode ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-white/10 hover:bg-white/10 text-slate-300'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{isEn ? 'Edit Server Credentials' : 'ویرایش مشخصات سرور'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono">
          <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">
              {isEn ? 'Host / IP' : 'آدرس هاست / IP'}
            </span>
            <span className="font-bold text-slate-200 truncate block mt-0.5">{server.ip || '—'}</span>
          </div>

          <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">
              {isEn ? 'MySQL Port' : 'پورت اتصال'}
            </span>
            <span className="font-bold text-slate-200 block mt-0.5">{server.mysql_port || 3306}</span>
          </div>

          <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">
              {isEn ? 'Username' : 'نام کاربری'}
            </span>
            <span className="font-bold text-cyan-400 truncate block mt-0.5">{server.mysql_user || 'root'}</span>
          </div>

          <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">
              {isEn ? 'Target Database' : 'نام پایگاه داده'}
            </span>
            <span className="font-bold text-amber-400 truncate block mt-0.5">{server.mysql_database || 'mysql'}</span>
          </div>

          <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">
              {isEn ? 'Password' : 'وضعیت رمز عبور'}
            </span>
            <span className={`font-bold block mt-0.5 ${server.mysql_password_set ? 'text-emerald-400' : 'text-rose-400'}`}>
              {server.mysql_password_set ? (isEn ? 'Configured' : 'تنظیم‌شده') : (isEn ? 'None' : 'ثبت‌نشده')}
            </span>
          </div>

          <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-semibold">
              {isEn ? 'SSH Credentials' : 'دسترسی لینوکس SSH'}
            </span>
            <span className={`font-bold block mt-0.5 ${hasSshCredentials ? 'text-emerald-400' : 'text-amber-400'}`}>
              {hasSshCredentials ? (isEn ? 'Available (Ready for Auto-Fix)' : 'آماده (آماده تعمیر خودکار)') : (isEn ? 'Not Configured' : 'ثبت‌نشده')}
            </span>
          </div>
        </div>

        {/* Live Test Result Banner */}
        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              testResult.success
                ? isLightMode
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : isLightMode
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold flex items-center gap-2">
                  <span>{testResult.success ? (isEn ? 'Connection Successful' : 'اتصال برقرار است') : (isEn ? 'Connection Failed' : 'ارتباط ناموفق')}</span>
                  {testResult.latencyMs !== undefined && (
                    <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-black/20 font-normal">
                      {testResult.latencyMs}ms
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] leading-relaxed mt-1 opacity-90">
                  {isEn ? testResult.message : testResult.messageFa || testResult.message}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. THREE-WAY TROUBLESHOOTING NAVIGATION */}
      <div
        className={`flex items-center gap-2 p-1.5 rounded-xl border ${
          isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/60 border-white/10'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveSection('auto_fix')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSection === 'auto_fix'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>{isEn ? '1-Click Auto-Fix (SSH)' : 'تعمیر خودکار با یک کلیک (SSH)'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('manual_guide')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSection === 'manual_guide'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>{isEn ? 'Manual Configuration Guide' : 'راهنمای گام‌به‌گام دستی'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('user_privileges')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSection === 'user_privileges'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{isEn ? 'User & Database Privileges' : 'بررسی و صدور مجوز کاربر'}</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION A: AUTOMATED 1-CLICK FIX VIA SSH                      */}
      {/* ------------------------------------------------------------- */}
      {activeSection === 'auto_fix' && (
        <div
          className={`p-4 rounded-xl border space-y-4 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-xs text-orange-400">
                <Zap className="w-4 h-4" />
                <span>
                  {isEn
                    ? 'Automated Remote Remediation via SSH'
                    : 'اعمال و پیکربندی خودکار از راه دور توسط SSH'}
                </span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Connects to Linux host over SSH, changes bind-address to 0.0.0.0 in MariaDB config, restarts the service, and opens port 3306 in firewall."
                  infoWhatFa="از طریق SSH به سرور متصل شده، bind-address را در فایل کانفیگ به 0.0.0.0 تغییر داده، سرویس را ری‌استارت و پورت ۳۳۰۶ را در فایروال باز می‌کند."
                  infoWhyEn="Bypasses manual terminal editing and ensures MariaDB accepts remote network connections without service downtime."
                  infoWhyFa="رفع سریع مشکل بدون نیاز به ورود دستی به ترمینال و اعمال استاندارد تغییرات روی فایروال و سرویس."
                  infoExampleEn="Updates /etc/mysql/mariadb.conf.d/50-server.cnf & runs ufw allow 3306/tcp"
                  infoExampleFa="ویرایش فایل 50-server.cnf و اجرای دستور ufw allow 3306/tcp"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                {isEn
                  ? 'This tool will automatically locate your MariaDB/MySQL config file (e.g. 50-server.cnf), configure bind-address = 0.0.0.0, restart the service, and open port 3306 in UFW or Firewalld.'
                  : 'این ابزار به‌طور خودکار فایل پیکربندی MariaDB سرور را پیدا کرده، مقدار bind-address را به 0.0.0.0 تغییر می‌دهد، سرویس دیتابیس را ری‌استارت کرده و پورت ۳۳۰۶ را در فایروال سرور (UFW یا Firewalld) باز می‌نماید.'}
              </p>
            </div>
          </div>

          {/* SSH Credentials Notice if missing */}
          {!hasSshCredentials && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                isLightMode ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {isEn
                    ? 'Linux SSH & Terminal Credentials Required'
                    : 'اطلاعات دسترسی Linux SSH سرور وارد نشده است'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {isEn
                  ? 'To let the panel connect and automatically configure the server files and firewall, please provide the root SSH password or configure SSH credentials in Server Settings.'
                  : 'برای اینکه پنل بتواند به سرور لینوکس متصل شده و فایل کانفیگ و فایروال را اصلاح کند، لطفاً رمز عبور root را در کادر زیر وارد کنید یا در قسمت ویرایش سرور، مشخصات SSH را ثبت نمایید.'}
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <div className="relative flex-1">
                  <Lock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={ephemeralPass}
                    onChange={(e) => setEphemeralPass(e.target.value)}
                    placeholder={isEn ? 'Enter Linux SSH root password for this task...' : 'رمز عبور کاربر root سرور لینوکس را وارد کنید...'}
                    className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono transition ${
                      isLightMode
                        ? 'bg-white border-slate-300 focus:border-orange-500 text-slate-800'
                        : 'bg-black/40 border-white/10 focus:border-orange-500 text-white'
                    }`}
                  />
                </div>
                {onEditServer && (
                  <button
                    type="button"
                    onClick={() => onEditServer(server)}
                    className="px-3 py-1.5 rounded-lg border border-amber-500/30 hover:bg-amber-500/20 text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Edit Server SSH Credentials' : 'ویرایش مشخصات سرور'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunAutoFix}
              disabled={isApplyingFix || (!hasSshCredentials && !ephemeralPass.trim())}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-orange-950/20"
            >
              <Zap className={`w-4 h-4 ${isApplyingFix ? 'animate-bounce' : ''}`} />
              <span>
                {isApplyingFix
                  ? isEn
                    ? 'Connecting & Configuring MariaDB via SSH...'
                    : 'در حال اتصال به سرور و اعمال خودکار تنظیمات...'
                  : isEn
                  ? 'Run 1-Click Auto-Fix (Bind Address & Firewall)'
                  : 'اعمال خودکار تنظیمات Bind Address و فایروال'}
              </span>
            </button>
            {hasSshCredentials && onOpenTerminal && (
              <button
                type="button"
                onClick={() => onOpenTerminal(server)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  isLightMode ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-white/10 hover:bg-white/10 text-slate-300'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{isEn ? 'Open Server Terminal' : 'ترمینال سرور'}</span>
              </button>
            )}
          </div>

          {/* Execution Result & Logs */}
          {fixResult && (
            <div className="space-y-2 pt-2">
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  fixResult.success
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : isLightMode
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {fixResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold">{isEn ? fixResult.message : fixResult.messageFa || fixResult.message}</span>
                </div>
                {fixResult.configUpdated && (
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-black/20 shrink-0">
                    {fixResult.configUpdated}
                  </span>
                )}
              </div>

              {/* Logs Console */}
              {fixResult.logs && fixResult.logs.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold px-1">
                    <span>{isEn ? 'Remote Execution Logs' : 'گزارش مراحل اجرای دستورات روی سرور'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(fixResult.logs.join('\n'), 'fix-logs')}
                      className="flex items-center gap-1 hover:text-white transition cursor-pointer"
                    >
                      {copiedSnippet === 'fix-logs' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedSnippet === 'fix-logs' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Logs' : 'کپی لاگ')}</span>
                    </button>
                  </div>
                  <div className="p-3 rounded-lg bg-black/60 border border-white/10 font-mono text-[10px] text-slate-300 space-y-1 max-h-40 overflow-y-auto custom-scrollbar select-text">
                    {fixResult.logs.map((log, idx) => (
                      <div key={idx} className="leading-tight">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION B: MANUAL STEP-BY-STEP CONFIGURATION GUIDE            */}
      {/* ------------------------------------------------------------- */}
      {activeSection === 'manual_guide' && (
        <div
          className={`p-4 rounded-xl border space-y-4 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div>
            <div className="flex items-center gap-2 font-bold text-xs text-orange-400">
              <Terminal className="w-4 h-4" />
              <span>{isEn ? 'Manual Step-by-Step Configuration' : 'راهنمای گام‌به‌گام پیکربندی دستی سرور'}</span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                infoWhatEn="Manual bash and terminal commands to open MariaDB remote listening address and allow port 3306 in Linux firewall."
                infoWhatFa="دستورات شل لینوکس جهت تغییر آدرس گوش‌دادن MariaDB به 0.0.0.0 و باز کردن پورت ۳۳۰۶ در فایروال."
                infoWhyEn="Required when server SSH is not accessible from the panel, allowing sysadmins to apply standard network configs directly in SSH."
                infoWhyFa="کاربرد در زمان عدم دسترسی مستقیم پنل به SSH، جهت اجرای مستقیم توسط مدیر سرور در ترمینال لینوکس."
                infoExampleEn="sudo nano /etc/mysql/mariadb.conf.d/50-server.cnf"
                infoExampleFa="ویرایش فایل کانفیگ و ری‌استارت سرویس mariadb"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
              {isEn
                ? 'Follow these 2 steps on your server terminal to configure MariaDB remote access and firewall rules:'
                : 'برای فعال‌سازی دسترسی ریموت به MariaDB، مراحل ۲ گانه زیر را در ترمینال سرور لینوکس خود اجرا کنید:'}
            </p>
          </div>

          {/* STEP 1: BIND ADDRESS */}
          <div className={`p-3.5 rounded-xl border space-y-2.5 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-emerald-400">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px]">۱</span>
                <span>{isEn ? 'Step 1: Open Server IP (Bind Address)' : 'مرحله ۱: باز کردن آی‌پی سرور (Bind Address)'}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              {isEn
                ? 'By default, MariaDB only accepts local connections (127.0.0.1). To change it, open the configuration file:'
                : 'به‌صورت پیش‌فرض MariaDB فقط اتصالات داخل خود سرور (127.0.0.1) را قبول می‌کند. برای تغییر آن، فایل تنظیمات را باز کنید:'}
            </p>

            <div className="space-y-1">
              <div className="flex items-center justify-between p-2 rounded bg-black/60 border border-white/10 font-mono text-[11px] text-cyan-300">
                <code>sudo nano /etc/mysql/mariadb.conf.d/50-server.cnf</code>
                <button
                  type="button"
                  onClick={() => handleCopy('sudo nano /etc/mysql/mariadb.conf.d/50-server.cnf', 'edit-cmd')}
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
                >
                  {copiedSnippet === 'edit-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSnippet === 'edit-cmd' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                </button>
              </div>
              <span className="text-[10px] text-slate-400 block px-1">
                {isEn ? '(On some distributions, the file path is /etc/my.cnf or /etc/mysql/my.cnf)' : '(در برخی توزیع‌ها مسیر فایل /etc/my.cnf یا /etc/mysql/my.cnf است)'}
              </span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed pt-1">
              {isEn
                ? 'Find the following line and change it to 0.0.0.0 (or place a # before it to comment it out):'
                : 'خط زیر را پیدا کرده و آن را به 0.0.0.0 تغییر دهید (یا قبل از آن # بگذارید تا کامنت شود):'}
            </p>

            <div className="flex items-center justify-between p-2 rounded bg-black/60 border border-white/10 font-mono text-[11px] text-amber-300">
              <code>bind-address = 0.0.0.0</code>
              <button
                type="button"
                onClick={() => handleCopy('bind-address = 0.0.0.0', 'bind-line')}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
              >
                {copiedSnippet === 'bind-line' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet === 'bind-line' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed pt-1">
              {isEn
                ? 'Save the file (in nano: press Ctrl+O then Enter, and Ctrl+X to exit) and restart the service:'
                : 'فایل را ذخیره کرده (در nano: کلید Ctrl+O سپس Enter و برای خروج Ctrl+X) و سرویس را ری‌استارت کنید:'}
            </p>

            <div className="flex items-center justify-between p-2 rounded bg-black/60 border border-white/10 font-mono text-[11px] text-emerald-300">
              <code>sudo systemctl restart mariadb</code>
              <button
                type="button"
                onClick={() => handleCopy('sudo systemctl restart mariadb', 'restart-cmd')}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
              >
                {copiedSnippet === 'restart-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet === 'restart-cmd' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
              </button>
            </div>
          </div>

          {/* STEP 2: FIREWALL CONFIGURATION */}
          <div className={`p-3.5 rounded-xl border space-y-2.5 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs text-orange-400">
                <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[11px]">۲</span>
                <span>{isEn ? 'Step 2: Open Port 3306 in Server Firewall' : 'مرحله ۲: باز کردن پورت ۳۳۰۶ در فایروال'}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              {isEn
                ? 'Default MariaDB port is 3306. You must allow this TCP port in your active Linux firewall:'
                : 'پورت دیفالت MariaDB برابر 3306 است. باید این پورت را در فایروال سرور باز کنید:'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* UFW */}
              <div className={`p-3 rounded-lg border ${isLightMode ? 'bg-white border-slate-200' : 'bg-black/40 border-white/10'} space-y-2`}>
                <div className="font-bold text-[11px] text-cyan-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>{isEn ? 'UFW Firewall (Ubuntu / Debian)' : 'فایروال UFW (اوبونتو / دبیان)'}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-black/60 border border-white/10 font-mono text-[10px] text-slate-200">
                  <code>sudo ufw allow 3306/tcp && sudo ufw reload</code>
                  <button
                    type="button"
                    onClick={() => handleCopy('sudo ufw allow 3306/tcp && sudo ufw reload', 'ufw-cmd')}
                    className="ml-2 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
                  >
                    {copiedSnippet === 'ufw-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSnippet === 'ufw-cmd' ? (isEn ? 'Copied' : 'کپی') : (isEn ? 'Copy' : 'کپی')}</span>
                  </button>
                </div>
              </div>

              {/* Firewalld */}
              <div className={`p-3 rounded-lg border ${isLightMode ? 'bg-white border-slate-200' : 'bg-black/40 border-white/10'} space-y-2`}>
                <div className="font-bold text-[11px] text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Firewalld (Rocky / Alma / CentOS)' : 'فایروال Firewalld (راکی / آلما / CentOS)'}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-black/60 border border-white/10 font-mono text-[10px] text-slate-200">
                  <code>sudo firewall-cmd --zone=public --add-port=3306/tcp --permanent && sudo firewall-cmd --reload</code>
                  <button
                    type="button"
                    onClick={() => handleCopy('sudo firewall-cmd --zone=public --add-port=3306/tcp --permanent && sudo firewall-cmd --reload', 'firewalld-cmd')}
                    className="ml-2 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
                  >
                    {copiedSnippet === 'firewalld-cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSnippet === 'firewalld-cmd' ? (isEn ? 'Copied' : 'کپی') : (isEn ? 'Copy' : 'کپی')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION C: USER & DATABASE PRIVILEGES AUDIT & GRANT           */}
      {/* ------------------------------------------------------------- */}
      {activeSection === 'user_privileges' && (
        <div
          className={`p-4 rounded-xl border space-y-4 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div>
            <div className="flex items-center gap-2 font-bold text-xs text-orange-400">
              <ShieldCheck className="w-4 h-4" />
              <span>{isEn ? 'User & Database Privileges Audit' : 'بررسی و اعطای دسترسی کاربر به پایگاه داده'}</span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                infoWhatEn="Checks if user exists, whether remote wildcard '%' host is allowed, and grants ALL PRIVILEGES on the target database."
                infoWhatFa="بررسی وجود کاربر در MariaDB، صدور مجوز دسترسی از هاست '%' و اعطای دسترسی به پایگاه‌داده مورد نظر."
                infoWhyEn="Ensures MySQL user is not blocked by localhost host restrictions or missing database schema grants."
                infoWhyFa="جلوگیری از خطاهای Access Denied ناشی از محدود بودن کاربر به localhost یا عدم وجود دیتابیس."
                infoExampleEn="GRANT ALL PRIVILEGES ON mydb.* TO 'myuser'@'%'; FLUSH PRIVILEGES;"
                infoExampleFa="اعطای دسترسی به پایگاه‌داده و اجرای FLUSH PRIVILEGES"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
              {isEn
                ? `Checks if user '${server.mysql_user || 'root'}' exists in MariaDB, has remote host access ('%'), and holds privileges on database '${server.mysql_database || 'mysql'}'.`
                : `بررسی اینکه آیا کاربر «${server.mysql_user || 'root'}» در ماریا‌دی‌بی وجود دارد، دسترسی ریموت با میزبان '%' دارد و مجوزهای لازم روی پایگاه‌داده «${server.mysql_database || 'mysql'}» به آن داده شده است یا خیر.`}
            </p>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunAuditUser}
              disabled={isAuditingUser}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditingUser ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Audit User Privileges' : 'بررسی وضعیت دسترسی کاربر'}</span>
            </button>

            <button
              type="button"
              onClick={handleRunAutoGrant}
              disabled={isGranting}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50 shadow-sm"
            >
              <Zap className={`w-3.5 h-3.5 ${isGranting ? 'animate-bounce' : ''}`} />
              <span>
                {isGranting
                  ? isEn
                    ? 'Granting Privileges via SSH...'
                    : 'در حال اعطای دسترسی از طریق SSH...'
                  : isEn
                  ? 'Auto-Grant Full Privileges via SSH'
                  : 'اعطای خودکار دسترسی کامل به دیتابیس (SSH)'}
              </span>
            </button>

            {onEditServer && (
              <button
                type="button"
                onClick={() => onEditServer(server)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                  isLightMode ? 'border-slate-300 hover:bg-slate-100 text-slate-700' : 'border-white/10 hover:bg-white/10 text-slate-300'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{isEn ? 'Edit Server Database Name' : 'ویرایش نام دیتابیس در سرور'}</span>
              </button>
            )}
          </div>

          {/* Grant Result Banner */}
          {grantResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                grantResult.success
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {grantResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{isEn ? grantResult.message : grantResult.messageFa || grantResult.message}</span>
              </div>
            </div>
          )}

          {/* Audit Results Card */}
          {auditResult && (
            <div className={`p-3.5 rounded-xl border space-y-3 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10'}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-white border-slate-200' : 'bg-black/40 border-white/10'}`}>
                  <span className="text-slate-400 text-[10px] block font-sans font-semibold">
                    {isEn ? 'User Exists' : 'وجود کاربر در دیتابیس'}
                  </span>
                  <span className={`font-bold block mt-1 ${auditResult.userExists ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {auditResult.userExists ? (isEn ? 'Yes' : 'بله') : (isEn ? 'Not Found' : 'یافت نشد')}
                  </span>
                </div>

                <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-white border-slate-200' : 'bg-black/40 border-white/10'}`}>
                  <span className="text-slate-400 text-[10px] block font-sans font-semibold">
                    {isEn ? 'Remote Host (%)' : 'دسترسی ریموت (%)'}
                  </span>
                  <span className={`font-bold block mt-1 ${auditResult.hasRemoteHost ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {auditResult.hasRemoteHost ? (isEn ? 'Allowed (%)' : 'مجاز (%)') : (isEn ? 'Local Only' : 'فقط لوکال')}
                  </span>
                </div>

                <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-white border-slate-200' : 'bg-black/40 border-white/10'}`}>
                  <span className="text-slate-400 text-[10px] block font-sans font-semibold">
                    {isEn ? 'Target DB Exists' : 'وجود دیتابیس هدف'}
                  </span>
                  <span className={`font-bold block mt-1 ${auditResult.targetDbExists ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {auditResult.targetDbExists ? (isEn ? 'Exists' : 'موجود است') : (isEn ? 'Not Found' : 'یافت نشد')}
                  </span>
                </div>

                <div className={`p-2.5 rounded-lg border ${isLightMode ? 'bg-white border-slate-200' : 'bg-black/40 border-white/10'}`}>
                  <span className="text-slate-400 text-[10px] block font-sans font-semibold">
                    {isEn ? 'DB Privileges' : 'مجوزهای دسترسی'}
                  </span>
                  <span className={`font-bold block mt-1 ${auditResult.hasDbPrivileges ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {auditResult.hasDbPrivileges ? (isEn ? 'Granted' : 'تأیید شده') : (isEn ? 'Missing' : 'ناقص یا فاقد مجوز')}
                  </span>
                </div>
              </div>

              {auditResult.userHosts.length > 0 && (
                <div className="text-[11px] font-mono flex items-center gap-2">
                  <span className="text-slate-400">{isEn ? 'Configured hosts for user:' : 'هاست‌های ثبت‌شده برای کاربر:'}</span>
                  <span className="text-cyan-300 font-bold">{auditResult.userHosts.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Manual Terminal Guide for User & Privileges */}
          <div className={`p-3.5 rounded-xl border space-y-2.5 ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/30 border-white/10'}`}>
            <div className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>{isEn ? 'How to Connect & Grant User Privileges Manually via Terminal' : 'نحوه اتصال و اعطای دستی دسترسی به کاربر از طریق ترمینال'}</span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              {isEn
                ? '1. Connect to MySQL / MariaDB terminal as root on the server:'
                : '۱. با کاربر root به ترمینال MariaDB در سرور وصل شوید:'}
            </p>

            <div className="flex items-center justify-between p-2 rounded bg-black/60 border border-white/10 font-mono text-[11px] text-cyan-300">
              <code>sudo mariadb -u root</code>
              <button
                type="button"
                onClick={() => handleCopy('sudo mariadb -u root', 'mariadb-login')}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
              >
                {copiedSnippet === 'mariadb-login' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSnippet === 'mariadb-login' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed pt-1">
              {isEn
                ? `2. Create user with wildcard '%' host and grant full permissions on database '${server.mysql_database || 'mysql'}':`
                : `۲. کاربر را با میزبان '%' ایجاد کرده و کلیه دسترسی‌ها روی پایگاه‌داده «${server.mysql_database || 'mysql'}» را صادر کنید:`}
            </p>

            <div className="space-y-1">
              <div className="flex items-start justify-between p-2.5 rounded bg-black/60 border border-white/10 font-mono text-[10px] text-amber-300">
                <code className="select-all leading-relaxed whitespace-pre-wrap">
                  {`CREATE DATABASE IF NOT EXISTS \`${server.mysql_database || 'mysql'}\`;\nCREATE USER IF NOT EXISTS '${server.mysql_user || 'root'}'@'%' IDENTIFIED BY 'YOUR_PASSWORD';\nGRANT ALL PRIVILEGES ON \`${server.mysql_database || 'mysql'}\`.* TO '${server.mysql_user || 'root'}'@'%';\nFLUSH PRIVILEGES;`}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `CREATE DATABASE IF NOT EXISTS \`${server.mysql_database || 'mysql'}\`;\nCREATE USER IF NOT EXISTS '${server.mysql_user || 'root'}'@'%' IDENTIFIED BY 'YOUR_PASSWORD';\nGRANT ALL PRIVILEGES ON \`${server.mysql_database || 'mysql'}\`.* TO '${server.mysql_user || 'root'}'@'%';\nFLUSH PRIVILEGES;`,
                      'grant-full-sql'
                    )
                  }
                  className="ml-2 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
                >
                  {copiedSnippet === 'grant-full-sql' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSnippet === 'grant-full-sql' ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy SQL' : 'کپی SQL')}</span>
                </button>
              </div>
            </div>

            <div className={`p-3 rounded-lg border mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              isLightMode ? 'bg-cyan-50 border-cyan-200 text-cyan-950' : 'bg-cyan-950/20 border-cyan-500/30 text-cyan-200'
            }`}>
              <div className="text-[11px] leading-relaxed">
                {isEn
                  ? '3. After creating the database and granting access, add the database name in Edit Server settings so Net-Management connects to it directly.'
                  : '۳. پس از ساخت پایگاه داده و صدور دسترسی، نام آن را در بخش Edit Server: MySQL Database وارد کنید تا پنل مستقیماً به آن متصل شود.'}
              </div>
              {onEditServer && (
                <button
                  type="button"
                  onClick={() => onEditServer(server)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition cursor-pointer shrink-0"
                >
                  {isEn ? 'Edit Server Database' : 'ویرایش دیتابیس در سرور'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
