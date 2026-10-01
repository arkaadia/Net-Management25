import React, { useState } from 'react';
import {
  Server,
  ShieldCheck,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Users,
  UserCheck,
  Eye,
  EyeOff,
  Terminal,
  Lock,
  Search,
  KeyRound,
  Network,
  Radio,
  FileText,
  AlertTriangle,
  FolderSearch,
  Shield,
  Clock,
  Layers,
  Check,
  X
} from 'lucide-react';
import { ActiveDirectoryConfig, ADTestResult, ADSecurityGroup, ADUser } from '../../types';
import { testActiveDirectoryConnectionApi, syncActiveDirectoryApi } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useLanguage } from '../../i18n';

interface ActiveDirectoryTabProps {
  config: ActiveDirectoryConfig;
  onSaveConfig: (cfg: ActiveDirectoryConfig) => void;
}

export const ActiveDirectoryTab: React.FC<ActiveDirectoryTabProps> = ({
  config,
  onSaveConfig,
}) => {
  const { isRtl, isEn } = useLanguage();
  const [formData, setFormData] = useState<ActiveDirectoryConfig>({ ...config });
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ADTestResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'groups' | 'users'>('groups');
  const [searchQuery, setSearchQuery] = useState('');
  const [saveToast, setSaveToast] = useState(false);

  const handleInputChange = (field: keyof ActiveDirectoryConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSyncError(null);
    try {
      const result = await testActiveDirectoryConnectionApi(formData);
      setTestResult(result);
      if (result.success) {
        const updated: ActiveDirectoryConfig = {
          ...formData,
          lastSyncStatus: 'success',
          lastSyncMessage: result.message,
          lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        setFormData(updated);
        onSaveConfig(updated);
      } else {
        const updated: ActiveDirectoryConfig = {
          ...formData,
          lastSyncStatus: 'failed',
          lastSyncMessage: result.message,
          lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        setFormData(updated);
        onSaveConfig(updated);
      }
    } catch (err: any) {
      const failResult: ADTestResult = {
        success: false,
        latency_ms: 0,
        message: err.message || (isEn ? 'Failed to test connection to Active Directory' : 'خطا در تست ارتباط با اکتیو دایرکتوری'),
        logs: [`[Client Exception] ${err.message || 'Connection failure'}`],
      };
      setTestResult(failResult);
      const updated: ActiveDirectoryConfig = {
        ...formData,
        lastSyncStatus: 'failed',
        lastSyncMessage: failResult.message,
        lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      setFormData(updated);
      onSaveConfig(updated);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await syncActiveDirectoryApi(formData);
      if (res.success) {
        const updated: ActiveDirectoryConfig = {
          ...formData,
          syncedGroups: res.groups || [],
          syncedUsers: res.users || [],
          lastSyncStatus: 'success',
          lastSyncMessage:
            res.message ||
            (isEn
              ? `Successfully synchronized ${res.groups?.length || 0} security groups and ${res.users?.length || 0} domain users.`
              : `همگام‌سازی با موفقیت انجام شد (${res.groups?.length || 0} گروه امنیتی و ${res.users?.length || 0} کاربر دامین دریافت گردید).`),
          lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        setFormData(updated);
        onSaveConfig(updated);
      } else {
        const errorMsg =
          res.error ||
          (isEn
            ? 'Failed to synchronize objects from Active Directory'
            : 'خطا در دریافت و همگام‌سازی آبجکت‌ها از اکتیو دایرکتوری');
        setSyncError(errorMsg);
        const updated: ActiveDirectoryConfig = {
          ...formData,
          lastSyncStatus: 'failed',
          lastSyncMessage: errorMsg,
          lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        setFormData(updated);
        onSaveConfig(updated);
      }
    } catch (err: any) {
      const errorMsg =
        err.message ||
        (isEn
          ? 'Failed to connect to Active Directory server for synchronization'
          : 'خطا در برقراری ارتباط با سرور دامین جهت همگام‌سازی');
      setSyncError(errorMsg);
      const updated: ActiveDirectoryConfig = {
        ...formData,
        lastSyncStatus: 'failed',
        lastSyncMessage: errorMsg,
        lastSyncTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      setFormData(updated);
      onSaveConfig(updated);
    } finally {
      setIsSyncing(false);
    }
  };

  // Filtering synced items
  const filteredGroups = (formData.syncedGroups || []).filter(
    (g) =>
      g.cn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.dn.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = (formData.syncedUsers || []).filter(
    (u) =>
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.samAccountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isConnected = formData.lastSyncStatus === 'success';
  const isFailed = formData.lastSyncStatus === 'failed';

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Header Overview Card */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <span>{isEn ? 'Active Directory & LDAP Domain Controller' : 'اتصال به اکتیو دایرکتوری (Active Directory / LDAP)'}</span>
              {isConnected ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {isEn ? 'LDAP Connected' : 'ارتباط فعال'}
                </span>
              ) : isFailed ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono border border-rose-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  {isEn ? 'Connection Error' : 'خطا در ارتباط'}
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 font-mono border border-slate-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  {isEn ? 'Not Connected' : 'تنظیم نشده'}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Integrate directly with Microsoft Active Directory or OpenLDAP Domain Controllers to authenticate users and query authentic security groups.'
                : 'اتصال مستقیم به دامین کنترلر اکتیو دایرکتوری مایکروسافت جهت احراز هویت و استعلام لحظه‌ای گروه‌های امنیتی و کاربران واقعی.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncNow}
            disabled={isSyncing || isTesting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/15 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50"
            title={isEn ? 'Query and sync real users and groups from Active Directory DC' : 'دریافت و استعلام زنده کاربران و گروه‌های امنیتی از دامین کنترلر'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? (isEn ? 'Syncing...' : 'درحال دریافت...') : (isEn ? 'Sync Objects' : 'همگام‌سازی آبجکت‌ها')}</span>
          </button>

          <button
            onClick={handleTestConnection}
            disabled={isTesting || isSyncing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? (isEn ? 'Testing...' : 'درحال تست...') : (isEn ? 'Test Connection' : 'تست اتصال زنده')}</span>
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{isEn ? 'Active Directory configuration saved to database successfully.' : 'تنظیمات اکتیو دایرکتوری با موفقیت در دیتابیس ذخیره شد.'}</span>
        </div>
      )}

      {syncError && (
        <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">{isEn ? 'Directory Synchronization Error: ' : 'خطای همگام‌سازی اکتیو دایرکتوری: '}</span>
            <span>{syncError}</span>
          </div>
          <button onClick={() => setSyncError(null)} className="text-rose-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Connection Form & Live Test Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Configuration Form */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-4 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
          <div className="border-b border-white/10 pb-2 flex items-center justify-between">
            <h3 className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              <span>{isEn ? 'Domain Controller Connection Parameters' : 'پارامترهای اتصال به دامین کنترلر (LDAP / LDAPS)'}</span>
            </h3>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => handleInputChange('enabled', e.target.checked)}
                className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
              />
              <span>{isEn ? 'Enable AD Integration' : 'فعال‌سازی سرویس AD'}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Server Host / IP' : 'آدرس سرور یا IP دامین کنترلر'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Active Directory Server Host' : 'آدرس سرور اکتیو دایرکتوری'}
                  infoWhatEn="Hostname or IP address of the Windows Server Domain Controller or LDAP server."
                  infoWhatFa="آدرس آی‌پی یا نام دامنه سرور دامین کنترلر ویندوز سرور یا سرور LDAP سازمان."
                  infoWhyEn="Required to establish authentic TCP socket connection and query corporate directory objects."
                  infoWhyFa="جهت برقراری ارتباط سوکت TCP با سرور اکتیو دایرکتوری و استعلام لحظه‌ای آبجکت‌ها الزامی است."
                  infoExampleEn="192.168.1.10 or dc01.corp.internal"
                  infoExampleFa="192.168.1.10 یا dc01.corp.internal"
                />
              </div>
              <input
                type="text"
                required
                value={formData.server}
                onChange={(e) => handleInputChange('server', e.target.value)}
                placeholder="192.168.1.10 or dc01.corp.internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Port' : 'پورت'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'LDAP Port' : 'پورت پروتکل LDAP'}
                  infoWhatEn="TCP network port where LDAP / LDAPS is listening."
                  infoWhatFa="پورت شبکه جهت برقراری نشست با سرویس دایرکتوری."
                  infoWhyEn="Standard LDAP operates on port 389, while SSL/TLS encrypted LDAPS operates on port 636."
                  infoWhyFa="پورت پیش‌فرض برای LDAP عادی ۳۸۹ و برای نسخه امن رمزنگاری‌شده با گواهی ۶۳۶ است."
                  infoExampleEn="389 (LDAP) or 636 (LDAPS)"
                  infoExampleFa="389 (عادی) یا 636 (امن SSL)"
                />
              </div>
              <input
                type="number"
                required
                value={formData.port}
                onChange={(e) => handleInputChange('port', parseInt(e.target.value, 10) || 389)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Active Directory Domain' : 'نام دامین (Domain)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Active Directory Domain' : 'نام دامنه دایرکتوری'}
                  infoWhatEn="Full domain name of the Active Directory Forest / Realm."
                  infoWhatFa="نام کامل دامین تحت مدیریت ویندوز سرور."
                  infoWhyEn="Used for Kerberos authentication, user principal name (UPN) resolution, and directory context."
                  infoWhyFa="جهت تعیین فضای نام کاربران و تطابق قوانین دسترسی بر اساس دامین سازمان."
                  infoExampleEn="corp.internal or domain.local"
                  infoExampleFa="corp.internal یا domain.local"
                />
              </div>
              <input
                type="text"
                required
                value={formData.domain}
                onChange={(e) => handleInputChange('domain', e.target.value)}
                placeholder="corp.internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Base DN' : 'پایه دایرکتوری (Base DN)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Base Distinguished Name (BaseDN)' : 'پایه نام متمایز (Base DN)'}
                  infoWhatEn="Root distinguished name defining the top-level directory search boundary."
                  infoWhatFa="مسیر ریشه ساختار دایرکتوری در اکتیو دایرکتوری مایکروسافت."
                  infoWhyEn="Limits directory search operations to your organization domain partition."
                  infoWhyFa="مشخص‌کننده محدوده کل جستجو در دیتابیس دایرکتوری برای جلوگیری از سرچ بیهوده سایر کانتینرها."
                  infoExampleEn="DC=corp,DC=internal"
                  infoExampleFa="DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                required
                value={formData.baseDn}
                onChange={(e) => handleInputChange('baseDn', e.target.value)}
                placeholder="DC=corp,DC=internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Service Account / Bind User' : 'کاربر اتصال (Bind User / Service Account)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'LDAP Bind Account' : 'حساب کاربری اتصال (Bind User)'}
                  infoWhatEn="Username or Distinguished Name of the service account used to authenticate LDAP queries."
                  infoWhatFa="نام کاربری یا اکانت سرویس جهت بایند و احراز هویت اولیه در اکتیو دایرکتوری."
                  infoWhyEn="Active Directory rejects anonymous LDAP queries; this account reads groups and user profiles."
                  infoWhyFa="اکتیو دایرکتوری درخواست‌های ناشناس را رد می‌کند و برای استعلام گروه‌ها به اکانت بایند نیاز است."
                  infoExampleEn="svc-netops@corp.internal or CN=svc,OU=ServiceAccounts,DC=corp,DC=internal"
                  infoExampleFa="svc-netops@corp.internal یا CN=ldap_svc,DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                required
                value={formData.bindUser}
                onChange={(e) => handleInputChange('bindUser', e.target.value)}
                placeholder="svc-netops@corp.internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Bind Password' : 'رمز عبور اکانت سرویس'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Bind Password' : 'رمز عبور اکانت سرویس'}
                  infoWhatEn="Password credential for the LDAP Bind Service Account."
                  infoWhatFa="رمز عبور حساب سرویس برای احراز هویت در دامین کنترلر."
                  infoWhyEn="Required to complete the simple bind handshake with the Domain Controller."
                  infoWhyFa="جهت اعتبارسنجی نشست LDAP و کسب مجوز خواندن ساختار سازمانی."
                  infoExampleEn="SecureServicePass!2026"
                  infoExampleFa="کلمه عبور امن اکانت سرویس دامین"
                />
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.bindPassword || ''}
                  onChange={(e) => handleInputChange('bindPassword', e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-3 pr-10 rtl:pl-10 rtl:pr-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Security Groups Search OU' : 'واحد سازمانی گروه‌ها (Groups OU)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Groups Search Base' : 'مسیر جستجوی گروه‌ها (Groups OU)'}
                  infoWhatEn="Specific Organizational Unit (OU) where corporate security groups are located."
                  infoWhatFa="مسیر دقیق OU حاوی گروه‌های امنیتی شبکه در اکتیو دایرکتوری."
                  infoWhyEn="Limits queries to authorized network security groups rather than scanning millions of irrelevant objects."
                  infoWhyFa="باعث افزایش سرعت استعلام و تفکیک گروه‌های عملیاتی شبکه از سایر گروه‌های متفرقه می‌شود."
                  infoExampleEn="OU=SecurityGroups,DC=corp,DC=internal"
                  infoExampleFa="OU=SecurityGroups,DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                value={formData.groupSearchBase}
                onChange={(e) => handleInputChange('groupSearchBase', e.target.value)}
                placeholder="OU=SecurityGroups,DC=corp,DC=internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isEn ? 'Users Search OU' : 'واحد سازمانی کاربران (Users OU)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  title={isEn ? 'Users Search Base' : 'مسیر جستجوی کاربران (Users OU)'}
                  infoWhatEn="Specific Organizational Unit (OU) where domain user accounts reside."
                  infoWhatFa="مسیر سازمانی OU که اکانت‌های کاربران و کارشناسان در آن قرار دارد."
                  infoWhyEn="Restricts user synchronization to relevant department staff and skips machine/computer accounts."
                  infoWhyFa="فقط پرسنل بخش مربوطه را بازیابی می‌کند و حساب‌های سیستمی و رایانه‌ای را فیلتر می‌نماید."
                  infoExampleEn="OU=Staff,DC=corp,DC=internal"
                  infoExampleFa="OU=Staff,DC=corp,DC=internal"
                />
              </div>
              <input
                type="text"
                value={formData.userSearchBase}
                onChange={(e) => handleInputChange('userSearchBase', e.target.value)}
                placeholder="OU=Staff,DC=corp,DC=internal"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.useSsl}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFormData((prev) => ({
                    ...prev,
                    useSsl: checked,
                    port: checked ? (prev.port === 389 ? 636 : prev.port) : (prev.port === 636 ? 389 : prev.port),
                  }));
                }}
                className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
              />
              <span>{isEn ? 'Use SSL / TLS (LDAPS Port 636)' : 'استفاده از پروتکل امن SSL/TLS (LDAPS)'}</span>
            </label>

            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-md cursor-pointer"
            >
              {isEn ? 'Save AD Configuration' : 'ذخیره تنظیمات دایرکتوری'}
            </button>
          </div>
        </form>

        {/* Right: Diagnostics & Live Test Console Output */}
        <div className="lg:col-span-5 flex flex-col p-4 rounded-2xl bg-slate-950/80 border border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <h3 className="font-bold text-xs text-cyan-300 font-mono flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>{isEn ? 'LDAP Diagnostic & Health Console' : 'کنسول مانیتورینگ اتصال و عیب‌یابی دایرکتوری'}</span>
            </h3>
            {formData.lastSyncTime && (
              <span className="text-[10px] text-slate-400 font-mono">
                {isEn ? 'Last Sync: ' : 'آخرین همگام‌سازی: '} {formData.lastSyncTime.slice(11)}
              </span>
            )}
          </div>

          {/* Test Status Box */}
          <div className="space-y-2 flex-1 flex flex-col justify-between">
            <div className="space-y-1.5 font-mono text-[11px] text-slate-300 p-3 rounded-xl bg-slate-900 border border-white/10 max-h-[220px] overflow-y-auto custom-scrollbar">
              {testResult ? (
                testResult.logs.map((line, idx) => {
                  const isSuccess = line.includes('SUCCESS') || line.includes('Success') || line.includes('Connected') || line.includes('Verified');
                  const isFail = line.includes('Failure') || line.includes('Error') || line.includes('failed') || line.includes('rejected');
                  const isProbe = line.includes('Probe') || line.includes('Testing') || line.includes('Attempting');
                  return (
                    <div
                      key={idx}
                      className={`${
                        isFail
                          ? 'text-rose-400'
                          : isSuccess
                          ? 'text-emerald-400'
                          : isProbe
                          ? 'text-cyan-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic py-6 text-center text-xs">
                  {isEn
                    ? 'Click "Test Connection" to perform real TCP socket probe, validate bind credentials, and query directory RootDSE.'
                    : 'برای بررسی اتصال زنده سوکت LDAP، اعتبارسنجی بایند و بررسی ساختار BaseDN دکمه «تست اتصال زنده» را فشار دهید.'}
                </div>
              )}
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold text-xs">{testResult.message}</span>
                </div>
                {testResult.latency_ms > 0 && (
                  <span
                    className={`font-mono text-[10px] px-2 py-0.5 rounded border shrink-0 ${
                      testResult.success
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                    }`}
                  >
                    {testResult.latency_ms} ms
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Synced AD Objects Explorer (Groups & Users) */}
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('groups')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'groups'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isEn ? 'Active Directory Security Groups' : 'گروه‌های امنیتی اکتیو دایرکتوری (AD Groups)'}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-200">
                {formData.syncedGroups?.length || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('users')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeSubTab === 'users'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{isEn ? 'Domain Users' : 'کاربران دامین (Domain Users)'}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-200">
                {formData.syncedUsers?.length || 0}
              </span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search synced objects...' : 'جستجو در آبجکت‌های همگام‌شده...'}
              className="w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Groups View */}
        {activeSubTab === 'groups' && (
          <div>
            {filteredGroups.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredGroups.map((grp) => (
                  <div
                    key={grp.dn || grp.cn}
                    className="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 hover:border-cyan-500/40 transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white flex items-center gap-2">
                            <span>{grp.cn}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {grp.memberCount} {isEn ? 'Members' : 'عضو'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[280px]" title={grp.dn}>
                            {grp.dn}
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-300">
                      {grp.description || (isEn ? 'No description set on domain object' : 'توضیحاتی برای این گروه در دامین تنظیم نشده است')}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-white/15 bg-white/[0.01]">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  {(formData.syncedGroups || []).length === 0
                    ? isEn
                      ? 'No Security Groups Synchronized'
                      : 'هیچ گروه امنیتی همگام‌سازی نشده است'
                    : isEn
                    ? 'No Matching Security Groups'
                    : 'هیچ گروهی منطبق بر جستجو یافت نشد'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mb-4">
                  {(formData.syncedGroups || []).length === 0
                    ? isEn
                      ? 'Configure your Domain Controller host, credentials, and Search OU above, then click "Sync Objects" to retrieve authentic security groups from Active Directory.'
                      : 'مشخصات دامین کنترلر، اطلاعات احراز هویت و OU جستجو را در فرم بالا تکمیل کرده و دکمه «همگام‌سازی آبجکت‌ها» را بزنید تا گروه‌های واقعی استعلام شوند.'
                    : isEn
                    ? `No security groups match "${searchQuery}". Try a different search term.`
                    : `هیچ گروهی با عبارت «${searchQuery}» مطابقت ندارد.`}
                </p>
                {(formData.syncedGroups || []).length === 0 && (
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? (isEn ? 'Syncing...' : 'درحال همگام‌سازی...') : (isEn ? 'Sync Security Groups' : 'استعلام و همگام‌سازی گروه‌ها')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Users View */}
        {activeSubTab === 'users' && (
          <div>
            {filteredUsers.length > 0 ? (
              <div className="space-y-2">
                {filteredUsers.map((user) => (
                  <div
                    key={user.samAccountName || user.dn}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-white/10 hover:border-cyan-500/40 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-xs shrink-0">
                        {user.samAccountName ? user.samAccountName.slice(0, 2).toUpperCase() : 'AD'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-white">{user.displayName || user.samAccountName}</span>
                          <span className="text-[10px] font-mono text-cyan-300">
                            ({user.samAccountName})
                          </span>
                          {user.enabled ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                              {isEn ? 'Active' : 'فعال'}
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                              {isEn ? 'Disabled' : 'غیرفعال'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {user.department ? `${user.department} • ` : ''}
                          {user.title ? `${user.title} • ` : ''}
                          <span className="font-mono">{user.email}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(user.groups || []).map((g) => (
                        <span
                          key={g}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800/50 text-cyan-300"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-white/15 bg-white/[0.01]">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  {(formData.syncedUsers || []).length === 0
                    ? isEn
                      ? 'No Domain Users Synchronized'
                      : 'هیچ کاربری از دامین همگام‌سازی نشده است'
                    : isEn
                    ? 'No Matching Domain Users'
                    : 'هیچ کاربری منطبق بر جستجو یافت نشد'}
                </h4>
                <p className="text-xs text-slate-400 max-w-md mb-4">
                  {(formData.syncedUsers || []).length === 0
                    ? isEn
                      ? 'Configure your Domain Controller host, credentials, and Users Search OU above, then click "Sync Objects" to fetch authentic user accounts.'
                      : 'مشخصات دامین کنترلر و OU کاربران را تنظیم کرده و دکمه «همگام‌سازی آبجکت‌ها» را بزنید تا کاربران واقعی از اکتیو دایرکتوری بازیابی شوند.'
                    : isEn
                    ? `No domain users match "${searchQuery}". Try a different search term.`
                    : `هیچ کاربری با عبارت «${searchQuery}» مطابقت ندارد.`}
                </p>
                {(formData.syncedUsers || []).length === 0 && (
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? (isEn ? 'Syncing...' : 'درحال همگام‌سازی...') : (isEn ? 'Sync Domain Users' : 'استعلام و همگام‌سازی کاربران')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
