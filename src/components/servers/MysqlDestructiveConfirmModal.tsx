import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Flame,
  ShieldAlert,
  Database,
  Server,
  FileCode,
  Copy,
  Check,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { MysqlSqlQuerySafetyReport } from '../../types';

export interface MysqlDestructiveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (auditNotes?: string) => Promise<void> | void;
  serverName: string;
  serverIp: string;
  databaseName: string;
  query: string;
  safetyReport: MysqlSqlQuerySafetyReport;
  isExecuting?: boolean;
  isEn?: boolean;
  isLightMode?: boolean;
}

export const MysqlDestructiveConfirmModal: React.FC<MysqlDestructiveConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  serverName,
  serverIp,
  databaseName,
  query,
  safetyReport,
  isExecuting = false,
  isEn = false,
  isLightMode = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [isRiskAcknowledged, setIsRiskAcknowledged] = useState(false);
  const [auditNotes, setAuditNotes] = useState('');
  const [copiedQuery, setCopiedQuery] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmationText('');
      setIsRiskAcknowledged(false);
      setAuditNotes('');
      setCopiedQuery(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const requiredConfirmKeyword = isEn ? 'CONFIRM' : 'تایید';
  const isInputMatched =
    confirmationText.trim().toUpperCase() === 'CONFIRM' ||
    (!isEn && confirmationText.trim() === 'تایید');

  const canExecute = isRiskAcknowledged && isInputMatched && !isExecuting;

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(query);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canExecute) return;
    onConfirm(auditNotes.trim() || undefined);
  };

  const isCritical = safetyReport.overallRiskLevel === 'critical';

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-3 sm:p-5 pointer-events-auto bg-black/60 backdrop-blur-xs select-none"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col rounded-2xl shadow-2xl border transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'w-full h-full'
            : 'w-full max-w-2xl max-h-[90vh]'
        } ${
          isLightMode
            ? 'bg-white border-rose-300 text-slate-800'
            : 'bg-slate-950 border-rose-500/50 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isCritical
              ? isLightMode
                ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : isLightMode
              ? 'bg-amber-50/90 border-amber-200 text-amber-950'
              : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isCritical
                  ? 'bg-rose-500/20 text-rose-500 animate-pulse'
                  : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {isCritical ? <Flame className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-sm sm:text-base truncate flex items-center gap-2">
                <span>
                  {isEn ? 'Confirm Destructive MySQL Execution' : 'تأیید اجرای عملیات پرخطر و مخرب MySQL'}
                </span>
                <span
                  className={`text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-full border ${
                    isCritical
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  }`}
                >
                  {isEn
                    ? isCritical
                      ? 'CRITICAL RISK'
                      : 'HIGH RISK'
                    : isCritical
                    ? 'ریسک بحرانی'
                    : 'ریسک بالا'}
                </span>
              </h4>
              <p className="text-[11px] opacity-80 truncate flex items-center gap-1.5 font-mono">
                <Server className="w-3 h-3 inline shrink-0" />
                <span>{serverName} ({serverIp})</span>
                <span>•</span>
                <Database className="w-3 h-3 inline shrink-0" />
                <span>{databaseName}</span>
              </p>
            </div>
          </div>

          {/* Window Control Buttons */}
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-200 text-slate-600'
                  : 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title={isEn ? 'Minimize / Cancel' : 'انصراف و بستن'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className={`p-1.5 rounded-lg border transition ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-200 text-slate-600'
                  : 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white border border-rose-500/30 transition"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Risk Warning Notice Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              isCritical
                ? isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                : isLightMode
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            }`}
          >
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
            <div className="space-y-1 text-xs">
              <p className="font-bold text-sm">
                {isEn
                  ? 'Warning: Irreversible Database Mutation Detected'
                  : 'هشدار: عملیات غیرقابل بازگشت در پایگاه داده شناسایی شد'}
              </p>
              <p className="leading-relaxed opacity-90">
                {isEn
                  ? 'The submitted MySQL statement contains destructive operations that may drop tables, erase databases, or purge rows permanently. Review the hazards below carefully before proceeding.'
                  : 'دستور ارسالی MySQL شامل عملیات‌های مخربی نظیر حذف جدول، پاک‌سازی دیتابیس یا حذف سراسری رکوردها است. لطفاً پیش از اجرا، خطرات شناسایی‌شده را به دقت بررسی کنید.'}
              </p>
            </div>
          </div>

          {/* Identified Hazards / Reasons */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>{isEn ? 'Detected Hazards & Affected Objects' : 'خطرات شناسایی‌شده و اهداف عملیات'}</span>
              <span className="font-mono text-[11px] text-rose-400">
                {safetyReport.destructiveReasons.length} {isEn ? 'Hazard(s)' : 'مورد بحرانی'}
              </span>
            </h5>
            <div className="space-y-1.5">
              {(isEn ? safetyReport.destructiveReasons : safetyReport.destructiveReasonsFa).map((reason, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    isLightMode
                      ? 'bg-rose-50/50 border-rose-200 text-rose-900'
                      : 'bg-rose-950/20 border-rose-900/40 text-rose-300'
                  }`}
                >
                  <Flame className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                  <span className="leading-relaxed">{reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SQL Preview Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'SQL Statement Preview' : 'پیش‌نمایش دستور ارسالی'}</span>
              </span>
              <button
                type="button"
                onClick={handleCopyQuery}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 border transition ${
                  isLightMode
                    ? 'border-slate-300 hover:bg-slate-100 text-slate-600'
                    : 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {copiedQuery ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>{isEn ? 'Copied' : 'کپی شد'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{isEn ? 'Copy' : 'کپی'}</span>
                  </>
                )}
              </button>
            </div>
            <pre
              className={`p-3 rounded-xl border font-mono text-xs max-h-36 overflow-y-auto whitespace-pre-wrap break-all ${
                isLightMode
                  ? 'bg-slate-100 border-slate-300 text-slate-800'
                  : 'bg-slate-900/90 border-slate-800 text-emerald-300'
              }`}
            >
              {query}
            </pre>
          </div>

          {/* Audit Notes Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              {isEn
                ? 'Operator Audit Reason / Ticket Reference (Optional)'
                : 'علت اجرای عملیات / شماره تیکت پشتیبانی (اختیاری)'}
            </label>
            <input
              type="text"
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              placeholder={
                isEn
                  ? 'e.g. Scheduled migration TICKET-4029 approved by Lead DBA'
                  : 'مثلاً: اجرای مایگریشن طبق تیکت ۴۰۲۹ با تأیید مدیر پایگاه داده'
              }
              className={`w-full px-3 py-2 rounded-xl border text-xs outline-hidden transition ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 focus:border-rose-500'
                  : 'bg-slate-900 border-slate-800 text-slate-200 focus:border-rose-500'
              }`}
            />
          </div>

          {/* Confirmation Checkbox */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer ${
              isLightMode
                ? 'bg-rose-50/40 border-rose-200'
                : 'bg-rose-950/20 border-rose-900/40'
            }`}
            onClick={() => setIsRiskAcknowledged((prev) => !prev)}
          >
            <input
              type="checkbox"
              id="mysql-destructive-acknowledge"
              checked={isRiskAcknowledged}
              onChange={(e) => setIsRiskAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
            />
            <label
              htmlFor="mysql-destructive-acknowledge"
              className="text-xs font-medium leading-relaxed cursor-pointer select-none"
            >
              {isEn
                ? 'I fully understand that this operation directly modifies or permanently purges data on this MySQL instance, and I take responsibility for its execution.'
                : 'من کاملاً متوجه هستم که این عملیات داده‌ها یا ساختار پایگاه داده MySQL را مستقیماً تغییر داده یا برای همیشه نابود می‌کند و مسئولیت اجرای آن را می‌پذیرم.'}
            </label>
          </div>

          {/* Keyword Verification Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 block">
              {isEn ? (
                <>
                  Type <span className="font-mono text-rose-400 font-bold uppercase">CONFIRM</span> to unlock execution:
                </>
              ) : (
                <>
                  برای تأیید، کلمه <span className="font-mono text-rose-400 font-bold">تایید</span> یا <span className="font-mono text-rose-400 font-bold">CONFIRM</span> را وارد کنید:
                </>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={requiredConfirmKeyword}
                className={`w-full px-3 py-2 rounded-xl border text-sm font-mono tracking-wider outline-hidden transition ${
                  isInputMatched
                    ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-300'
                    : isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 focus:border-rose-500'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-rose-500'
                }`}
              />
              {isInputMatched && (
                <div className="absolute right-3 top-2.5 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className={`p-3 sm:p-4 border-t flex items-center justify-between shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className={`px-4 py-2 rounded-xl border text-xs font-semibold transition ${
              isLightMode
                ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                : 'border-slate-800 hover:bg-slate-800 text-slate-300'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canExecute}
            className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg ${
              canExecute
                ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-rose-600/30'
                : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>
              {isExecuting
                ? isEn
                  ? 'Executing Destructive Query...'
                  : 'در حال اجرای عملیات مخرب...'
                : isEn
                ? 'Execute Destructive Query'
                : 'تأیید و اجرای عملیات پرخطر'}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
