import React from 'react';
import {
  Tag,
  Sparkles,
  X,
  Minus,
  Calendar,
  CheckCircle2,
  History,
  ArrowUpCircle,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Terminal,
  Loader2,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Lock,
} from 'lucide-react';
import { APP_VERSION, RELEASE_HISTORY } from '../version';
import { useLanguage } from '../i18n/LanguageContext';
import { useUpdate } from '../context/UpdateContext';
import { useAuth } from '../context/AuthContext';
import { canUserCheckUpdate, canUserPerformUpdate } from '../utils/rbac';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isLightMode?: boolean;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode: isLightModeProp,
}) => {
  const { t, isEn, isRtl } = useLanguage();
  const {
    updateInfo,
    checking,
    updating,
    updateSuccess,
    updateLogs,
    error,
    countdown,
    checkUpdate,
    performUpdate,
  } = useUpdate();
  const { user, effectivePolicy } = useAuth();
  const canCheck = canUserCheckUpdate(user, effectivePolicy);
  const canPerform = canUserPerformUpdate(user, effectivePolicy);
  const isSuperAdmin =
    (user?.username || '').toLowerCase() === 'admin' ||
    (user?.role || '').toLowerCase().includes('super admin') ||
    (user?.role || '').toLowerCase().includes('administrator') ||
    effectivePolicy?.id === 'policy-super-admin';

  // Unified light theme detection
  const isLight = isLightModeProp ?? (
    typeof document !== 'undefined' && (
      document.querySelector('.theme-light') !== null ||
      document.documentElement.classList.contains('theme-light') ||
      localStorage.getItem('panel_theme') === 'light' ||
      localStorage.getItem('theme_mode') === 'light'
    )
  );

  const [isMaximized, setIsMaximized] = React.useState(false);

  if (!isOpen) return null;

  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const remoteNote = updateInfo?.releaseNote;
  const newVersionTitle = remoteNote
    ? isEn
      ? (remoteNote.title_en || (remoteNote.version ? `Release v${remoteNote.version}: System Enhancements & Fixes` : t('update_ready_to_install')))
      : (remoteNote.title || t('update_ready_to_install'))
    : t('update_ready_to_install');
  const newVersionChanges = remoteNote
    ? isEn
      ? (remoteNote.changes_en && remoteNote.changes_en.length > 0 ? remoteNote.changes_en : ['System optimizations, performance improvements, and UI enhancements.'])
      : (remoteNote.changes && remoteNote.changes.length > 0 ? remoteNote.changes : ['به‌روزرسانی و ارتقای کلی عملکرد سامانه'])
    : [];

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      } modal-backdrop-blur animate-fade-in`}
      data-modal-backdrop="true"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div className={`relative w-full ${
        isMaximized
          ? 'h-full max-h-full max-w-none rounded-none border-none my-0'
          : 'max-w-3xl max-h-[90vh] sm:max-h-[86vh] rounded-2xl border my-auto'
      } flex flex-col spatial-glass shadow-[0_0_50px_rgba(99,102,241,0.3)] overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-900 shadow-xl' : 'border-white/20 text-slate-100'
      }`}>
        {/* Header (Pinned) */}
        <div
          id="release-notes-modal-header"
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 backdrop-blur-md transition-colors ${
            isLight
              ? 'bg-slate-50/95 border-slate-200 text-slate-900'
              : 'bg-slate-900/95 border-white/10 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              isLight
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 shadow-xs'
                : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
            }`}>
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={`text-sm sm:text-base font-bold ${
                    isLight ? 'text-black font-extrabold' : 'text-white'
                  }`}
                  style={{ color: isLight ? '#000000' : '#ffffff' }}
                >
                  {t('release_notes_title')}
                </h2>
                <span
                  data-role="version-tag"
                  className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${
                    isLight
                      ? 'bg-slate-200/90 text-black border-slate-300 font-extrabold shadow-2xs'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                  }`}
                  style={{ color: isLight ? '#000000' : undefined }}
                >
                  v{APP_VERSION}
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isLight ? 'text-black font-medium' : 'text-slate-200'
                }`}
                style={{ color: isLight ? '#000000' : '#e2e8f0' }}
              >
                {t('release_notes_subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isLight
                    ? 'text-slate-600 hover:text-black hover:bg-slate-200'
                    : 'text-slate-300 hover:text-cyan-300 hover:bg-white/10'
                }`}
                title={isEn ? 'Minimize' : 'مینیمایز به نوار پایین'}
                aria-label={isEn ? 'Minimize' : 'مینیمایز'}
              >
                <Minus className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLight
                  ? 'text-slate-600 hover:text-black hover:bg-slate-200'
                  : 'text-slate-300 hover:text-cyan-300 hover:bg-white/10'
              }`}
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از حالت تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
              aria-label={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از حالت تمام‌صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLight
                  ? 'text-slate-600 hover:text-black hover:bg-slate-200'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              aria-label={t('action_close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Active Update Ready Banner & In-Panel Updater Section */}
          {(hasUpdate || updating || updateSuccess) && (
            <div className={`update-ready-banner p-5 rounded-2xl border relative overflow-hidden shadow-xs ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-black'
                : 'bg-gradient-to-br from-rose-950/60 via-indigo-950/40 to-slate-900/90 border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.25)] text-white'
            }`}>
              {!isLight && (
                <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500"></div>
              )}

              {/* Title Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                  </span>
                  <span
                    className={`update-version-badge font-mono text-base font-bold px-2.5 py-0.5 rounded-lg border ${
                      isLight
                        ? 'bg-slate-200 text-black border-slate-300 font-extrabold'
                        : 'text-white bg-rose-500/20 border-rose-500/40'
                    }`}
                    style={{ color: isLight ? '#000000' : undefined }}
                  >
                    v{updateInfo?.latestVersion}
                  </span>
                  <span
                    className={`update-tag-badge text-[11px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                      isLight
                        ? 'bg-slate-200 text-black border-slate-300 font-bold'
                        : 'bg-rose-500/30 text-rose-200 border-rose-500/40'
                    }`}
                    style={{ color: isLight ? '#000000' : undefined }}
                  >
                    {t('update_available_badge')}
                  </span>
                </div>

                {remoteNote?.releaseDate && (
                  <div
                    className={`update-banner-date flex items-center gap-1.5 text-xs font-mono ${
                      isLight ? 'text-black font-bold' : 'text-rose-300/80'
                    }`}
                    style={{ color: isLight ? '#000000' : undefined }}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{remoteNote.releaseDate}</span>
                  </div>
                )}
              </div>

              {/* Release Header Description */}
              <h3
                className={`update-banner-title text-sm sm:text-base font-bold mb-2 flex items-center gap-2 ${
                  isLight ? 'text-black font-extrabold' : 'text-white'
                }`}
                style={{ color: isLight ? '#000000' : undefined }}
              >
                <Sparkles className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-300'}`} />
                <span>{newVersionTitle}</span>
              </h3>

              {/* Remote Release Changes */}
              {newVersionChanges.length > 0 && (
                <div className={`update-inner-card mb-4 rounded-xl p-3 border ${
                  isLight ? 'bg-slate-100/90 border-slate-200 shadow-xs' : 'bg-black/30 border-white/10'
                }`}>
                  <div
                    className={`update-inner-card-title text-[11px] font-bold mb-2 ${
                      isLight ? 'text-black font-extrabold' : 'text-slate-300'
                    }`}
                    style={{ color: isLight ? '#000000' : undefined }}
                  >
                    {isEn ? `What's new in v${updateInfo?.latestVersion}:` : `لیست تغییرات نگارش جدید (v${updateInfo?.latestVersion}):`}
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {newVersionChanges.map((change, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                        <span
                          className={isLight ? 'font-semibold text-black' : 'text-slate-200'}
                          style={{ color: isLight ? '#000000' : undefined }}
                        >
                          {change}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Status and Action Buttons */}
              <div className={`mt-4 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-rose-500/20'}`}>
                {updateSuccess ? (
                  <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white">
                          {isEn ? 'Panel Updated Successfully!' : 'پنل با موفقیت به نگارش جدید ارتقا یافت!'}
                        </div>
                        <div className="text-xs text-emerald-300/90 mt-0.5">
                          {isEn
                            ? `Reloading interface in ${countdown} seconds...`
                            : `صفحه تا ${countdown} ثانیه دیگر مجدداً بارگذاری می‌شود...`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                    >
                      {isEn ? 'Reload Now' : 'تازه‌سازی فوری'}
                    </button>
                  </div>
                ) : updating ? (
                  <div className="p-4 rounded-xl bg-indigo-950/50 border border-indigo-500/40 text-indigo-200 space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-cyan-300 animate-spin shrink-0" />
                      <div>
                        <div className="font-bold text-sm text-white">
                          {isEn
                            ? `Updating panel to v${updateInfo?.latestVersion || APP_VERSION}...`
                            : `در حال ارتقای پنل به نگارش v${updateInfo?.latestVersion || APP_VERSION}...`}
                        </div>
                        <div className="text-[11px] text-cyan-300/80">
                          {isEn
                            ? 'Syncing code, installing dependencies, building bundle & restarting service...'
                            : 'همگام‌سازی کدها، نصب پکیج‌ها، ساخت مجدد باندل و ری‌استارت سرویس...'}
                        </div>
                      </div>
                    </div>

                    {/* Live Scrolling Terminal Logs */}
                    <div className="bg-black/80 rounded-xl p-3 font-mono text-[11px] text-slate-300 border border-white/10 space-y-1 max-h-48 overflow-y-auto">
                      <div className="flex items-center gap-2 text-cyan-400 border-b border-white/10 pb-1.5 mb-1.5 font-bold">
                        <Terminal className="w-3.5 h-3.5 shrink-0" />
                        <span>{isEn ? 'Live Update Console' : 'کنسول زنده ارتقای پنل'}</span>
                      </div>
                      {updateLogs.map((logLine, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 leading-relaxed text-slate-200">
                          <span className="text-cyan-400 shrink-0">›</span>
                          <span className="break-words">{logLine}</span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-slate-400">
                      {isEn
                        ? 'Please keep this window open. The server will restart and automatically reload when complete.'
                        : 'لطفاً این پنجره را باز نگه دارید. سرور پس از اتمام به طور خودکار ری‌استارت و تازه‌سازی می‌شود.'}
                    </p>
                  </div>
                ) : (
                  <div>
                    {error && (
                      <div className="mb-3 p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 flex items-center gap-2.5 text-rose-200 text-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="flex-1">{error}</span>
                      </div>
                    )}

                    {canPerform ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <button
                          onClick={() => performUpdate()}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-md transition cursor-pointer ${
                            isLight
                              ? 'bg-slate-900 hover:bg-black active:scale-98 text-white'
                              : 'bg-gradient-to-r from-rose-600 via-purple-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 active:scale-98 text-white shadow-[0_0_25px_rgba(244,63,94,0.4)]'
                          }`}
                        >
                          <ArrowUpCircle className="w-4 h-4 text-rose-200" />
                          <span>
                            {isEn
                              ? `Standard Update to v${updateInfo?.latestVersion}`
                              : `ارتقای استاندارد به v${updateInfo?.latestVersion}`}
                          </span>
                        </button>

                        <button
                          onClick={() => performUpdate({ clean: true })}
                          className={`flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl font-semibold text-xs transition cursor-pointer border ${
                            isLight
                              ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 shadow-xs'
                              : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-200 hover:text-white'
                          }`}
                          title={isEn ? 'Purge node_modules and clean reinstall all dependencies' : 'پاکسازی کامل node_modules و نصب مجدد تمام پکیج‌ها'}
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {isEn ? 'Clean Reinstall & Update' : 'نصب تمیز و پاکسازی عمیق پکیج‌ها'}
                          </span>
                        </button>

                        <a
                          href={updateInfo?.repoUrl || 'https://github.com/shahbazimasoud/Net-Management'}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-medium transition cursor-pointer border ${
                            isLight
                              ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                              : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-300 hover:text-white'
                          }`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>GitHub</span>
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs">
                        <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="flex-1">
                          {isEn
                            ? 'A new system update is available. In accordance with system security governance, only Super Administrator is authorized to perform system updates.'
                            : 'نگارش جدیدی از سیستم منتشر شده است. بر اساس قوانین امنیتی پایگاه داده، تنها مدیر ارشد (Super Admin) مجاز به اجرای به‌روزرسانی سیستم است.'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* If No Update Available, Provide Manual Full Reinstall & Sync Action (Super Admin Only) */}
          {canPerform && !hasUpdate && !updating && !updateSuccess && (
            <div className={`mb-4 rounded-xl p-3.5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className={`text-xs font-bold ${isLight ? 'text-black' : 'text-slate-200'}`}>
                    {isEn ? `System is on version v${APP_VERSION}` : `سامانه روی نگارش v${APP_VERSION} قرار دارد`}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {isEn
                      ? 'If packages or backend changes were incomplete on server, you can trigger a full clean sync & rebuild anytime.'
                      : 'چنانچه در سرور برخی پکیج‌ها یا تغییرات بک‌اند ناقص مانده‌اند، می‌توانید همگام‌سازی و نصب مجدد کامل را اجرا کنید.'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => performUpdate({ clean: true })}
                  disabled={updating}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                    isLight
                      ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900'
                      : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-200 hover:text-white'
                  } disabled:opacity-50`}
                  title={isEn ? 'Force full clean reinstall of all NPM packages, Python drivers, and rebuild bundle' : 'نصب تمیز و بازسازی کامل پکیج‌ها و درایورهای پایتون'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
                  <span>
                    {isEn ? 'Force Rebuild & Sync' : 'همگام‌سازی و نصب مجدد کامل'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Release History Header */}
          <div className={`release-history-header flex items-center justify-between pb-1 border-b ${
            isLight ? 'border-slate-200' : 'border-white/10'
          }`}>
            <h4
              className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-black font-extrabold' : 'text-slate-400'
              }`}
              style={{ color: isLight ? '#000000' : undefined }}
            >
              {isEn ? 'Installed Version History' : 'تاریخچه نسخه‌ها و نگارش‌های نصب‌شده'}
            </h4>
            <span
              className={`text-[11px] font-mono ${
                isLight ? 'text-slate-700 font-bold' : 'text-slate-400'
              }`}
              style={{ color: isLight ? '#334155' : undefined }}
            >
              {RELEASE_HISTORY.length} {isEn ? 'Releases' : 'نگارش ثبت‌شده'}
            </span>
          </div>

          {/* Historical Releases */}
          {RELEASE_HISTORY.map((rel, index) => {
            const isLatest = index === 0;
            const title = isEn
              ? (rel.title_en || `Release v${rel.version}: System Enhancements & Fixes`)
              : (rel.title || `نگارش v${rel.version}`);
            const changes = isEn
              ? (rel.changes_en && rel.changes_en.length > 0 ? rel.changes_en : ['System optimizations, performance improvements, and UI enhancements.'])
              : (rel.changes && rel.changes.length > 0 ? rel.changes : ['به‌روزرسانی و ارتقای کلی عملکرد سامانه']);

            return (
              <div
                key={rel.version}
                className={`release-history-card p-4 rounded-xl border transition-all ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 shadow-xs'
                    : isLatest && !hasUpdate
                    ? 'bg-indigo-950/30 border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className={`flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b ${
                  isLight ? 'border-slate-200' : 'border-white/10'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`release-history-version-badge font-mono text-sm font-bold px-2 py-0.5 rounded-lg border ${
                        isLight
                          ? 'bg-slate-200 text-black border-slate-300 font-extrabold'
                          : 'text-white bg-white/10 border-white/15'
                      }`}
                      style={{ color: isLight ? '#000000' : undefined }}
                    >
                      v{rel.version}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full uppercase ${
                        rel.type === 'major'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : rel.type === 'minor'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {rel.type === 'major'
                        ? t('release_notes_tag_major')
                        : rel.type === 'minor'
                        ? t('release_notes_tag_minor')
                        : t('release_notes_tag_patch')}
                    </span>
                    <span
                      className={`release-history-card-title text-sm font-bold ${
                        isLight ? 'text-black' : 'text-slate-200'
                      }`}
                      style={{ color: isLight ? '#000000' : undefined }}
                    >
                      {title}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 text-xs font-mono ${
                      isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'
                    }`}
                    style={{ color: isLight ? '#475569' : undefined }}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{rel.releaseDate}</span>
                  </div>
                </div>

                <ul className="space-y-2 text-xs">
                  {changes.map((change, cIdx) => (
                    <li
                      key={cIdx}
                      className="release-history-change-item flex items-start gap-2 leading-relaxed"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isLight ? 'text-emerald-600' : 'text-emerald-400'
                      }`} />
                      <span
                        className={`leading-relaxed ${
                          isLight ? 'text-slate-900 font-medium' : 'text-slate-300'
                        }`}
                        style={{ color: isLight ? '#0f172a' : undefined }}
                      >
                        {change}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer (Pinned) */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t text-xs shrink-0 backdrop-blur-md transition-colors ${
            isLight
              ? 'border-slate-200 bg-slate-50/95 text-slate-700'
              : 'border-white/10 bg-slate-900/85 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            {canCheck ? (
              <button
                onClick={() => checkUpdate(false, true)}
                disabled={checking}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition cursor-pointer text-xs font-medium ${
                  isLight
                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800 shadow-xs'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200 hover:text-white'
                }`}
                title={t('update_btn_check_now')}
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 ${checking ? 'animate-spin' : ''}`} />
                <span>{checking ? t('update_checking_in_progress') : (isEn ? 'Check for Updates' : 'بررسی نگارش جدید')}</span>
              </button>
            ) : (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-800/40 border border-white/5 text-[11px] text-slate-400 select-none"
                title={isEn ? 'Only Super Administrator is authorized to check for updates' : 'تنها مدیر ارشد (Super Admin) مجاز به بررسی نسخه جدید است'}
              >
                <Lock className="w-3 h-3 text-slate-400" />
                <span>{isEn ? 'Update Management Restricted' : 'بررسی آپدیت محدود به مدیر ارشد'}</span>
              </div>
            )}

            {canPerform && !hasUpdate && (
              <button
                onClick={() => performUpdate({ clean: true })}
                disabled={updating}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition cursor-pointer text-xs font-medium ${
                  isLight
                    ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900 shadow-xs'
                    : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/25 text-amber-300 hover:text-amber-100'
                }`}
                title={isEn ? 'Force clean reinstall all NPM & Python dependencies and rebuild production bundle' : 'پاکسازی و نصب مجدد تمام پکیج‌های نود و پایتون و بازسازی بیلد'}
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${updating ? 'animate-spin' : ''}`} />
                <span>{isEn ? 'Clean Reinstall & Rebuild' : 'نصب مجدد و بازسازی عمیق'}</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition cursor-pointer shadow-sm active:scale-95"
          >
            {t('release_notes_btn_close')}
          </button>
        </div>
      </div>
    </div>
  );
};
