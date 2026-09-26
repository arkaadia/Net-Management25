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
  RotateCcw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { PostgresSqlQuerySafetyReport } from '../../types';

export interface PostgresDestructiveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (auditNotes?: string) => Promise<void> | void;
  serverName: string;
  serverIp: string;
  databaseName: string;
  query: string;
  safetyReport: PostgresSqlQuerySafetyReport;
  isExecuting?: boolean;
  isEn?: boolean;
  isLightMode?: boolean;
}

export const PostgresDestructiveConfirmModal: React.FC<PostgresDestructiveConfirmModalProps> = ({
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
                  {isEn ? 'Confirm Destructive SQL Execution' : 'تأیید اجرای عملیات پرخطر و مخرب SQL'}
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
              disabled={isExecuting}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-slate-200/70 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
              }`}
              title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-slate-200/70 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
              }`}
              title={isMaximized ? (isEn ? 'Restore' : 'خروج از تمام‌صفحه') : isEn ? 'Maximize' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-rose-100 text-rose-600' : 'hover:bg-rose-900/50 text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Warning Message Card */}
            <div
              className={`p-3.5 rounded-xl border flex gap-3 text-xs leading-relaxed ${
                isCritical
                  ? isLightMode
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                  : isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
              }`}
            >
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
              <div className="space-y-1">
                <p className="font-bold text-sm">
                  {isEn
                    ? 'SQL Safety Guard Alert: Destructive Statements Detected'
                    : 'هشدار سامانه ایمنی دیتابیس: دستورات مخرب شناسایی شد'}
                </p>
                <p>
                  {isEn
                    ? 'The SQL statement(s) you are attempting to execute contain destructive operations (such as DROP, TRUNCATE, or unbounded mass modifications). These actions can result in permanent, non-recoverable data loss or schema removal.'
                    : 'دستوراتی که قصد اجرای آن‌ها را دارید شامل عملیات تخریبی پایگاه داده (نظیر حذف کامل جدول، پاک‌سازی فوری داده‌ها با TRUNCATE، یا تغییرات بدون شرط) هستند که می‌تواند منجر به از دست رفتن دائمی و غیرقابل بازگشت اطلاعات شود.'}
                </p>
              </div>
            </div>

            {/* List of Detected Risks */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold flex items-center justify-between">
                <span>{isEn ? 'Detected Hazards & Impact' : 'خطرات و تغییرات شناسایی‌شده'}</span>
                <span className="text-[11px] font-mono opacity-60">
                  {safetyReport.statementCount} {isEn ? 'statement(s)' : 'دستور'}
                </span>
              </label>
              <div
                className={`rounded-xl border p-2.5 space-y-2 max-h-36 overflow-y-auto ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
                }`}
              >
                {(isEn ? safetyReport.destructiveReasons : safetyReport.destructiveReasonsFa).map(
                  (reason, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                      <span className="font-mono text-rose-400 font-semibold">{reason}</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Query Preview Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Target SQL Query' : 'متن کوئری مورد نظر'}</span>
                </label>
                <button
                  type="button"
                  onClick={handleCopyQuery}
                  className={`text-[11px] flex items-center gap-1 px-2 py-0.5 rounded transition ${
                    isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
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
              <div
                className={`rounded-xl border p-3 font-mono text-xs max-h-36 overflow-y-auto whitespace-pre-wrap select-text leading-5 ${
                  isLightMode ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-cyan-300'
                }`}
              >
                {query}
              </div>
            </div>

            {/* Audit Notes Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center justify-between">
                <span>{isEn ? 'Audit Reason / Change Ticket (Optional)' : 'علت اجرا / شناسه تیکت تغییرات (جهت ثبت در لاگ امنیتی)'}</span>
                <span className="text-[10px] font-mono opacity-50">addAuditLog</span>
              </label>
              <input
                type="text"
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                placeholder={
                  isEn
                    ? 'e.g., Authorized schema migration CR-4029'
                    : 'مثال: مجوز تغییرات دیتابیس تیکت ۱۲۳۴'
                }
                className={`w-full text-xs px-3 py-2 rounded-xl border outline-none transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-rose-500'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-rose-500'
                }`}
              />
            </div>

            {/* Safety Acknowledgment Checkbox */}
            <label
              className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition select-none ${
                isRiskAcknowledged
                  ? isLightMode
                    ? 'bg-rose-50/70 border-rose-300'
                    : 'bg-rose-950/30 border-rose-500/40'
                  : isLightMode
                  ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  : 'bg-slate-900/40 border-slate-800 hover:bg-slate-900'
              }`}
            >
              <input
                type="checkbox"
                checked={isRiskAcknowledged}
                onChange={(e) => setIsRiskAcknowledged(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span className="text-xs leading-relaxed font-semibold">
                {isEn
                  ? 'I confirm that I have reviewed the SQL statements above, understand the destructive nature of this action, and authorize permanent execution on the live database.'
                  : 'اینجانب تأیید می‌کنم که دستورات فوق را به دقت بررسی کرده و با آگاهی کامل از ماهیت تخریبی و غیرقابل بازگشت آن، مجوز اجرای این کوئری را بر روی پایگاه داده زنده صادر می‌نمایم.'}
              </span>
            </label>

            {/* Keyword Type Confirmation */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold flex items-center justify-between">
                <span>
                  {isEn ? (
                    <>
                      Type <span className="font-mono font-bold text-rose-500">CONFIRM</span> to verify:
                    </>
                  ) : (
                    <>
                      جهت تأیید نهایی، کلمه <span className="font-mono font-bold text-rose-500">تایید</span> یا <span className="font-mono font-bold text-rose-500">CONFIRM</span> را وارد کنید:
                    </>
                  )}
                </span>
                {isInputMatched && (
                  <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {isEn ? 'Verified' : 'تأیید شد'}
                  </span>
                )}
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={requiredConfirmKeyword}
                className={`w-full text-xs font-mono font-bold px-3 py-2 rounded-xl border outline-none uppercase transition ${
                  isInputMatched
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-rose-500'
                    : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-rose-500'
                }`}
              />
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div
            className={`px-4 py-3 border-t flex items-center justify-between gap-3 shrink-0 ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                isLightMode
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  : 'border-slate-800 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="submit"
              disabled={!canExecute}
              className="px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Executing...' : 'در حال اجرا...'}</span>
                </>
              ) : (
                <>
                  <Flame className="w-4 h-4 fill-white/20" />
                  <span>{isEn ? 'Confirm & Execute Destructive SQL' : 'تأیید و اجرای عملیات پرخطر'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
