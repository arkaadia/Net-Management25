import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n';
import { useAuth, AuthUser } from '../../context/AuthContext';
import { NetworkGlobe3D, GlobeThemeType } from './NetworkGlobe3D';
import { APP_VERSION } from '../../version';
import {
  ShieldCheck,
  Server,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  LogIn,
  Globe,
  Database,
  KeyRound,
  Layers,
  Palette,
  Sun,
  Moon
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess?: (user: AuthUser) => void;
  currentTheme?: GlobeThemeType;
  onThemeChange?: (theme: GlobeThemeType) => void;
}

const THEME_OPTIONS: { id: GlobeThemeType; name: string; nameFa: string; color: string; isLight?: boolean }[] = [
  { id: 'obsidian', name: 'Obsidian Space', nameFa: 'فضایی آبسیدین', color: '#6366f1' },
  { id: 'emerald', name: 'Emerald Cyber', nameFa: 'زمردی سایبر', color: '#10b981' },
  { id: 'cobalt', name: 'Cobalt Blue', nameFa: 'کبالت پررنگ', color: '#0284c7' },
  { id: 'rose', name: 'Rose Red', nameFa: 'زرشکی نئون', color: '#f43f5e' },
  { id: 'amber', name: 'Amber Gold', nameFa: 'کهربایی طلایی', color: '#f59e0b' },
  { id: 'light', name: 'Clean Light', nameFa: 'تم روشن و شفاف', color: '#ffffff', isLight: true },
];

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  currentTheme: propTheme,
  onThemeChange,
}) => {
  const { isEn, language, setLanguage, isRtl } = useLanguage();
  const { login } = useAuth();

  // Local or propagated theme state
  const [theme, setTheme] = useState<GlobeThemeType>(() => {
    if (propTheme) return propTheme;
    const saved = (localStorage.getItem('panel_theme') as GlobeThemeType) || 'obsidian';
    return saved;
  });

  const [showThemePicker, setShowThemePicker] = useState(false);

  const isLight = theme === 'light';

  // Apply theme to HTML documentElement
  const handleSelectTheme = (newTheme: GlobeThemeType) => {
    setTheme(newTheme);
    localStorage.setItem('panel_theme', newTheme);
    localStorage.setItem('theme_mode', newTheme === 'light' ? 'light' : 'dark');

    if (typeof document !== 'undefined') {
      // Remove previous theme classes
      THEME_OPTIONS.forEach((t) => {
        document.documentElement.classList.remove(`theme-${t.id}`);
      });
      document.documentElement.classList.add(`theme-${newTheme}`);

      if (newTheme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }

    if (onThemeChange) {
      onThemeChange(newTheme);
    }
    setShowThemePicker(false);
  };

  useEffect(() => {
    // Initial sync of theme on mount
    handleSelectTheme(theme);
  }, []);

  const [authType, setAuthType] = useState<'local' | 'ad'>('local');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [domain, setDomain] = useState('corp.internal');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedRemaining, setLockedRemaining] = useState<number | null>(null);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedRemaining || lockedRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockedRemaining((prev) => {
        if (!prev || prev <= 1) {
          setErrorMsg(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg(isEn ? 'Please enter both username and password.' : 'لطفاً نام کاربری و کلمه عبور را وارد فرمایید.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          authType,
          domain: domain.trim(),
          rememberMe,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const textResponse = await res.text().catch(() => '');
        console.error('[Login non-JSON response]', res.status, textResponse.slice(0, 150));
        throw new Error(
          isEn
            ? `Authentication server returned status ${res.status} (${res.statusText || 'Service Gateway Error'}). Please verify backend connection.`
            : `سرویس احراز هویت وضعیت نامعتبر ${res.status} برگرداند. لطفاً اتصال به سرور پایگاه داده را بررسی فرمایید.`
        );
      }

      if (res.ok && data.success) {
        login(data.token, data.user, rememberMe, data.effectivePolicy);
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      } else {
        if (data.locked && data.remainingSec) {
          setLockedRemaining(data.remainingSec);
          setErrorMsg(
            isEn
              ? `Security Lockout: Account locked for ${data.remainingSec}s due to multiple failed attempts.`
              : `قفل امنیتی: به دلیل تلاش‌های مکرر، ورود تا ${data.remainingSec} ثانیه دیگر مسدود شد.`
          );
        } else {
          setErrorMsg(
            isEn
              ? data.error || 'Authentication failed. Please check credentials.'
              : data.message || 'نام کاربری یا کلمه عبور نادرست است.'
          );
          if (data.attemptsLeft !== undefined) {
            setAttemptsLeft(data.attemptsLeft);
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(
        isEn
          ? `Authentication error: ${err.message || 'Service temporarily unavailable'}`
          : `خطای احراز هویت: ${err.message || 'سرویس در دسترس نیست'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (u: string, p: string, type: 'local' | 'ad') => {
    setAuthType(type);
    setUsername(u);
    setPassword(p);
    setErrorMsg(null);
  };

  return (
    <div
      className={`w-screen h-screen flex flex-col md:flex-row overflow-hidden transition-colors duration-500 font-sans ${
        isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'
      } ${isRtl ? 'rtl' : 'ltr'}`}
    >
      {/* ------------------------------------------------------------- */}
      {/* LEFT 1/4 (25-30%): Modern Security Login Card */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`w-full md:w-[380px] lg:w-[420px] xl:w-[440px] shrink-0 h-full flex flex-col justify-between p-6 sm:p-8 z-30 shadow-2xl backdrop-blur-2xl overflow-y-auto transition-colors duration-500 ${
          isLight
            ? 'bg-white/95 border-r border-slate-200/80 text-slate-800'
            : 'bg-slate-900/95 border-r border-white/10 text-slate-100'
        }`}
      >
        {/* Top Header: Brand, Language Toggle, and Theme Menu */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] text-xs font-mono border border-white/20">
                NT
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold text-base tracking-tight font-mono ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    NetTopology
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      isLight
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    v{APP_VERSION}
                  </span>
                </div>
                <p className={`text-[10px] font-sans ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn ? 'Enterprise Operations Center' : 'مرکز عملیات و امنیت شبکه'}
                </p>
              </div>
            </div>

            {/* Language & Theme Controls */}
            <div className="flex items-center gap-1.5 relative">
              {/* Theme Switcher Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowThemePicker(!showThemePicker)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                  title={isEn ? 'Change Panel Theme' : 'تغییر تم پنل'}
                >
                  {isLight ? (
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Palette className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                  <span className="hidden sm:inline font-mono text-[10px] uppercase font-bold">
                    {theme}
                  </span>
                </button>

                {/* Theme Selector Dropdown Popover */}
                {showThemePicker && (
                  <div
                    className={`absolute ${
                      isRtl ? 'left-0' : 'right-0'
                    } top-full mt-2 w-48 p-2 rounded-xl shadow-2xl border z-50 animate-in fade-in zoom-in-95 duration-150 ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-800'
                        : 'bg-slate-900 border-slate-700 text-slate-100'
                    }`}
                  >
                    <div
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-1 mb-1 border-b ${
                        isLight
                          ? 'text-slate-500 border-slate-100'
                          : 'text-slate-400 border-slate-800'
                      }`}
                    >
                      {isEn ? 'Panel Themes' : 'تم‌های نرم‌افزار'}
                    </div>
                    <div className="space-y-1">
                      {THEME_OPTIONS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectTheme(item.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                            theme === item.id
                              ? isLight
                                ? 'bg-indigo-50 text-indigo-700 font-bold'
                                : 'bg-indigo-600/30 text-cyan-300 font-bold'
                              : isLight
                              ? 'hover:bg-slate-100 text-slate-700'
                              : 'hover:bg-white/5 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span>{isEn ? item.name : item.nameFa}</span>
                          </div>
                          {item.isLight ? (
                            <Sun className="w-3 h-3 text-amber-500" />
                          ) : (
                            <Moon className="w-3 h-3 text-indigo-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Language Switcher */}
              <button
                type="button"
                onClick={() => setLanguage(language === 'en' ? 'fa' : 'en')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
                title={isEn ? 'Switch Language' : 'تغییر زبان'}
              >
                <Globe className="w-3.5 h-3.5 text-cyan-500" />
                <span className="font-mono text-[11px] font-semibold uppercase">
                  {language === 'en' ? 'FA' : 'EN'}
                </span>
              </button>
            </div>
          </div>

          {/* Form Title */}
          <div className="mb-6">
            <h2
              className={`text-xl font-bold mb-1 tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {isEn ? 'System Authentication' : 'احراز هویت و ورود به سامانه'}
            </h2>
            <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              {isEn
                ? 'Sign in with your local administrator credentials or Active Directory domain account.'
                : 'با حساب محلی مدیر سیستم یا حساب سازمانی اکتیو دایرکتوری وارد شوید.'}
            </p>
          </div>

          {/* Segmented Auth Mode Switcher */}
          <div
            className={`p-1 rounded-xl border flex items-center mb-5 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-white/10'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setAuthType('local');
                setUsername('admin');
                setPassword('admin123');
                setErrorMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                authType === 'local'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isEn ? 'Local Account' : 'حساب محلی'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthType('ad');
                setUsername('m.rezaei@corp.internal');
                setPassword('admin123');
                setErrorMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                authType === 'ad'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>{isEn ? 'Active Directory' : 'اکتیو دایرکتوری'}</span>
            </button>
          </div>

          {/* Alert / Error Banner */}
          {errorMsg && (
            <div
              className={`p-3 rounded-xl mb-4 border text-xs flex items-start gap-2.5 ${
                lockedRemaining
                  ? 'bg-rose-950/60 border-rose-500/50 text-rose-200 animate-pulse'
                  : isLight
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/50 border-amber-500/40 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium leading-relaxed">{errorMsg}</p>
                {attemptsLeft !== null && attemptsLeft > 0 && !lockedRemaining && (
                  <p
                    className={`text-[10px] mt-1 font-mono ${
                      isLight ? 'text-amber-800' : 'text-amber-300/80'
                    }`}
                  >
                    {isEn
                      ? `Attempts remaining before security lockout: ${attemptsLeft}`
                      : `تعداد تلاش‌های مجاز باقی‌مانده تا قفل سیستم: ${attemptsLeft}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Active Directory Domain Selector (Shown if AD selected) */}
            {authType === 'ad' && (
              <div>
                <label
                  className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 font-mono ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  {isEn ? 'Domain Name / Kerberos Realm' : 'نام دامین / اکتیو دایرکتوری'}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 pointer-events-none text-slate-400">
                    <Layers className="w-4 h-4 text-cyan-500" />
                  </div>
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="corp.internal"
                    className={`w-full rounded-xl py-2.5 pl-10 pr-3 text-xs transition font-mono focus:outline-none ${
                      isLight
                        ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600'
                        : 'bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                    }`}
                    required
                  />
                </div>
              </div>
            )}

            {/* Username Input */}
            <div>
              <label
                className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 font-mono ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {authType === 'local'
                  ? isEn
                    ? 'Username'
                    : 'نام کاربری'
                  : isEn
                  ? 'UPN / Domain Username'
                  : 'نام کاربری دامین (UPN)'}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 pointer-events-none text-slate-400">
                  <User className="w-4 h-4 text-indigo-500" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={authType === 'local' ? 'admin' : 'username@corp.internal'}
                  className={`w-full rounded-xl py-2.5 pl-10 pr-3 text-xs transition font-mono focus:outline-none ${
                    isLight
                      ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600'
                      : 'bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                  }`}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label
                className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 font-mono ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {isEn ? 'Password' : 'رمز عبور'}
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4 text-indigo-500" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className={`w-full rounded-xl py-2.5 pl-10 pr-10 text-xs transition font-mono focus:outline-none ${
                    isLight
                      ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600'
                      : 'bg-slate-950/60 border border-white/10 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                  }`}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 transition cursor-pointer ${
                    isLight
                      ? 'text-slate-400 hover:text-slate-700'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Option */}
            <div className="flex items-center justify-between pt-1">
              <label
                className={`flex items-center gap-2 text-xs cursor-pointer select-none ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className={`rounded h-4 w-4 cursor-pointer ${
                    isLight
                      ? 'border-slate-300 text-indigo-600 focus:ring-indigo-500'
                      : 'border-white/20 bg-slate-950 text-indigo-600 focus:ring-indigo-500'
                  }`}
                />
                <span>{isEn ? 'Remember session on this device' : 'مرا به خاطر بسپار (نشست امن)'}</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || (lockedRemaining !== null && lockedRemaining > 0)}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs shadow-[0_0_20px_rgba(99,102,241,0.4)] transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>
                {loading
                  ? isEn
                    ? 'Authenticating...'
                    : 'در حال اعتبارسنجی...'
                  : isEn
                  ? 'Authenticate & Enter'
                  : 'احراز هویت و ورود به سامانه'}
              </span>
            </button>
          </form>

          {/* Quick Demo Fill Badges */}
          <div
            className={`mt-6 pt-5 border-t ${
              isLight ? 'border-slate-200' : 'border-white/10'
            }`}
          >
            <div
              className={`flex items-center justify-between text-[11px] font-mono mb-2.5 ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>{isEn ? 'Quick Demo Credentials:' : 'حساب‌های پیش‌فرض تست سریع:'}</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('admin', 'admin123', 'local')}
                className={`p-2 rounded-lg border text-left text-[11px] transition cursor-pointer group ${
                  isLight
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
              >
                <div
                  className={`font-bold flex items-center justify-between ${
                    isLight
                      ? 'text-slate-900 group-hover:text-indigo-600'
                      : 'text-white group-hover:text-cyan-300'
                  }`}
                >
                  <span>admin</span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
                      isLight
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    Super
                  </span>
                </div>
                <div
                  className={`text-[10px] font-mono ${
                    isLight ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  admin123
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('helpdesk_user', 'helpdesk123', 'local')}
                className={`p-2 rounded-lg border text-left text-[11px] transition cursor-pointer group ${
                  isLight
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
              >
                <div
                  className={`font-bold flex items-center justify-between ${
                    isLight
                      ? 'text-slate-900 group-hover:text-amber-700'
                      : 'text-white group-hover:text-amber-300'
                  }`}
                >
                  <span>helpdesk_user</span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
                      isLight
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    Ops
                  </span>
                </div>
                <div
                  className={`text-[10px] font-mono ${
                    isLight ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  helpdesk123
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('noc_operator', 'noc123', 'local')}
                className={`p-2 rounded-lg border text-left text-[11px] transition cursor-pointer group ${
                  isLight
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
              >
                <div
                  className={`font-bold flex items-center justify-between ${
                    isLight
                      ? 'text-slate-900 group-hover:text-emerald-700'
                      : 'text-white group-hover:text-emerald-300'
                  }`}
                >
                  <span>noc_operator</span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
                      isLight
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    NOC
                  </span>
                </div>
                <div
                  className={`text-[10px] font-mono ${
                    isLight ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  noc123
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickFill('m.rezaei@corp.internal', 'admin123', 'ad')}
                className={`p-2 rounded-lg border text-left text-[11px] transition cursor-pointer group ${
                  isLight
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                }`}
              >
                <div
                  className={`font-bold flex items-center justify-between ${
                    isLight
                      ? 'text-slate-900 group-hover:text-cyan-700'
                      : 'text-white group-hover:text-indigo-300'
                  }`}
                >
                  <span>m.rezaei</span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
                      isLight
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    AD
                  </span>
                </div>
                <div
                  className={`text-[10px] font-mono ${
                    isLight ? 'text-slate-500' : 'text-slate-500'
                  }`}
                >
                  corp.internal
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Security Badges */}
        <div
          className={`pt-6 border-t flex items-center justify-between text-[10px] font-mono ${
            isLight ? 'border-slate-200 text-slate-500' : 'border-white/10 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-cyan-600" />
            <span>PostgreSQL Secured</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>TLS 1.3 Strict</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT 3/4 (70-75%): Interactive 3D Network Globe Animation */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 h-full relative overflow-hidden hidden md:block">
        <NetworkGlobe3D theme={theme} />
      </div>
    </div>
  );
};
