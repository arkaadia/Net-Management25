import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Database,
  Plus,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Code,
  Shield,
  Layers,
} from 'lucide-react';
import { executeRemoteServerMysqlQuery } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlCreateDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  serverId: string;
  serverName: string;
  existingDatabases?: string[];
  onSuccess: (createdDbName: string) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

const COMMON_CHARSETS = [
  {
    id: 'utf8mb4',
    name: 'utf8mb4 (Unicode 4-byte)',
    descEn: 'Full multilingual Unicode with emoji support (Default & Recommended)',
    descFa: 'یونیکد کامل ۴ بایتی با پشتیبانی از ایموجی و تمام زبان‌ها (پیش‌فرض و استاندارد)',
    collations: [
      { id: 'utf8mb4_unicode_ci', name: 'utf8mb4_unicode_ci (Standard Multilingual)' },
      { id: 'utf8mb4_0900_ai_ci', name: 'utf8mb4_0900_ai_ci (MySQL 8.0+ Accent-Insensitive)' },
      { id: 'utf8mb4_persian_ci', name: 'utf8mb4_persian_ci (Persian/Farsi Alphabet Optimized)' },
      { id: 'utf8mb4_general_ci', name: 'utf8mb4_general_ci (Legacy Fast)' },
      { id: 'utf8mb4_bin', name: 'utf8mb4_bin (Case-Sensitive Binary Exact)' },
    ],
  },
  {
    id: 'utf8mb3',
    name: 'utf8 / utf8mb3 (Unicode 3-byte)',
    descEn: 'Legacy 3-byte UTF-8, BMP characters only',
    descFa: 'یونیکد ۳ بایتی قدیمی (بدون پشتیبانی از ایموجی)',
    collations: [
      { id: 'utf8_general_ci', name: 'utf8_general_ci' },
      { id: 'utf8_unicode_ci', name: 'utf8_unicode_ci' },
      { id: 'utf8_bin', name: 'utf8_bin' },
    ],
  },
  {
    id: 'latin1',
    name: 'latin1 (cp1252 West European)',
    descEn: 'Single-byte Western European',
    descFa: 'کدگذاری تک‌بایتی اروپای غربی',
    collations: [
      { id: 'latin1_swedish_ci', name: 'latin1_swedish_ci (MySQL Default)' },
      { id: 'latin1_general_ci', name: 'latin1_general_ci' },
      { id: 'latin1_bin', name: 'latin1_bin' },
    ],
  },
  {
    id: 'ascii',
    name: 'ascii (US ASCII 7-bit)',
    descEn: 'Standard US-ASCII',
    descFa: 'کدگذاری ۷ بیتی استاندارد اسکی',
    collations: [
      { id: 'ascii_general_ci', name: 'ascii_general_ci' },
      { id: 'ascii_bin', name: 'ascii_bin' },
    ],
  },
  {
    id: 'binary',
    name: 'binary (Raw Bytes)',
    descEn: 'Binary byte comparison without translation',
    descFa: 'مقایسه خام بایت‌ها بدون تغییر کدگذاری',
    collations: [{ id: 'binary', name: 'binary' }],
  },
];

export const MysqlCreateDatabaseModal: React.FC<MysqlCreateDatabaseModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  serverId,
  serverName,
  existingDatabases = [],
  onSuccess,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [dbName, setDbName] = useState('');
  const [charset, setCharset] = useState('utf8mb4');
  const [collation, setCollation] = useState('utf8mb4_unicode_ci');
  const [ifNotExists, setIfNotExists] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  // Available collations based on selected charset
  const currentCharsetObj = useMemo(() => {
    return COMMON_CHARSETS.find((c) => c.id === charset) || COMMON_CHARSETS[0];
  }, [charset]);

  // Handle charset change and update collation accordingly
  const handleCharsetChange = (newCharset: string) => {
    setCharset(newCharset);
    const targetObj = COMMON_CHARSETS.find((c) => c.id === newCharset) || COMMON_CHARSETS[0];
    if (targetObj.collations.length > 0) {
      setCollation(targetObj.collations[0].id);
    }
  };

  // Live SQL preview
  const generatedSql = useMemo(() => {
    const cleanName = dbName.trim();
    if (!cleanName) {
      return ifNotExists
        ? `CREATE DATABASE IF NOT EXISTS \`new_database\` CHARACTER SET ${charset} COLLATE ${collation};`
        : `CREATE DATABASE \`new_database\` CHARACTER SET ${charset} COLLATE ${collation};`;
    }
    const escaped = cleanName.replace(/`/g, '``');
    return ifNotExists
      ? `CREATE DATABASE IF NOT EXISTS \`${escaped}\` CHARACTER SET ${charset} COLLATE ${collation};`
      : `CREATE DATABASE \`${escaped}\` CHARACTER SET ${charset} COLLATE ${collation};`;
  }, [dbName, charset, collation, ifNotExists]);

  const handleCopySql = () => {
    navigator.clipboard.writeText(generatedSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = dbName.trim();
    if (!cleanName) {
      setErrorMessage(isEn ? 'Database name is required.' : 'نام پایگاه داده الزامی است.');
      return;
    }

    // Validation: identifier rules
    if (!/^[a-zA-Z0-9_$]+$/.test(cleanName)) {
      setErrorMessage(
        isEn
          ? 'Database name can only contain alphanumeric characters, underscores, and dollar signs.'
          : 'نام پایگاه داده فقط می‌تواند شامل حروف انگلیسی، اعداد، کاراکترهای _ و $ باشد.'
      );
      return;
    }

    if (cleanName.length > 64) {
      setErrorMessage(
        isEn ? 'Database name cannot exceed 64 characters in MySQL.' : 'طول نام پایگاه داده در MySQL نمی‌تواند از ۶۴ کاراکتر بیشتر باشد.'
      );
      return;
    }

    // Duplicate check
    const isDuplicate = existingDatabases.some((d) => d.toLowerCase() === cleanName.toLowerCase());
    if (isDuplicate && !ifNotExists) {
      setErrorMessage(
        isEn
          ? `A database named "${cleanName}" already exists on this server.`
          : `پایگاه داده‌ای با نام «${cleanName}» قبلاً روی این سرور وجود دارد.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await executeRemoteServerMysqlQuery(serverId, generatedSql);
      if (!result.success) {
        throw new Error(result.error || (isEn ? 'Failed to create database.' : 'ایجاد پایگاه داده با خطا مواجه شد.'));
      }

      onSuccess(cleanName);
      onClose();
      // Reset form
      setDbName('');
      setCharset('utf8mb4');
      setCollation('utf8mb4_unicode_ci');
      setIfNotExists(true);
    } catch (err: any) {
      setErrorMessage(err.message || (isEn ? 'Failed to execute CREATE DATABASE.' : 'خطا در اجرای دستور ساخت دیتابیس.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 pointer-events-auto bg-black/60 backdrop-blur-xs select-none"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col rounded-2xl shadow-2xl border transition-all duration-200 overflow-hidden ${
          isMaximized ? 'w-full h-full' : 'w-full max-w-2xl max-h-[92vh]'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-100'}`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                <span>{isEn ? 'Create MySQL Database' : 'ساخت پایگاه داده جدید MySQL'}</span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {serverName} • MySQL / MariaDB Engine
              </p>
            </div>
          </div>

          {/* 3 Header Control Buttons */}
          <div className="flex items-center gap-1">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              title={isMaximized ? (isEn ? 'Exit Fullscreen' : 'خروج از تمام صفحه') : (isEn ? 'Fullscreen' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <div className="flex-1 font-medium">{errorMessage}</div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="p-1 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Database Name */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-300">
                {isEn ? 'Database Name' : 'نام پایگاه داده'}
                <span className="text-rose-400 ml-1">*</span>
              </label>
              <FieldInfoTooltip
                title={isEn ? 'MySQL Database Name' : 'نام پایگاه داده در MySQL'}
                whatIsIt={
                  isEn
                    ? 'The unique schema identifier used to create and access tables, views, and data.'
                    : 'شناسه یکتای پایگاه داده که برای ساخت و دسترسی به جداول، نماها و داده‌ها در سرور MySQL استفاده می‌شود.'
                }
                whyNeeded={
                  isEn
                    ? 'Every database must have a unique identifier according to MySQL schema naming rules (max 64 characters, letters, digits, and underscores).'
                    : 'بر اساس قوانین نام‌گذاری MySQL، هر دیتابیس باید نامی متمایز (حداکثر ۶۴ کاراکتر متشکل از حروف، ارقام و خط زیر) داشته باشد.'
                }
                practicalExample={
                  isEn
                    ? 'my_app_production, shop_db, analytics_2026'
                    : 'shop_db, app_production, portal_main'
                }
                isEn={isEn}
              />
            </div>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                value={dbName}
                onChange={(e) => {
                  setDbName(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder={isEn ? 'e.g. app_production, crm_db...' : 'مثال: app_production, shop_db...'}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono outline-none transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-orange-500 shadow-xs'
                    : 'bg-slate-900 border-white/10 text-slate-100 focus:border-orange-500/60 shadow-inner'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              {isEn
                ? 'Only alphanumeric characters (a-z, 0-9), underscores (_), and dollar signs ($) are allowed.'
                : 'فقط استفاده از حروف لاتین، ارقام، خط زیر (_) و علامت دلار ($) مجاز است.'}
            </p>
          </div>

          {/* Charset & Collation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            {/* Character Set */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {isEn ? 'Character Set' : 'کدگذاری نویسه‌ها (Charset)'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'MySQL Character Set' : 'مجموعه نویسه‌ها در MySQL'}
                  whatIsIt={
                    isEn
                      ? 'The character encoding standard used to store text characters and strings in the database.'
                      : 'استاندارد کدگذاری نویسه‌ها برای ذخیره‌سازی متن و رشته‌ها در جداول این پایگاه داده.'
                  }
                  whyNeeded={
                    isEn
                      ? 'utf8mb4 is standard and strongly recommended as it supports 4-byte UTF-8, emojis, and all international alphabets without truncation.'
                      : 'انتخاب utf8mb4 اکیداً توصیه می‌شود زیرا از استاندارد کامل ۴ بایتی، ایموجی‌ها و الفبای فارسی/عربی بدون خطای کوتاه شدن متن پشتیبانی می‌کند.'
                  }
                  practicalExample="utf8mb4 (Recommended)"
                  isEn={isEn}
                />
              </div>
              <select
                value={charset}
                onChange={(e) => handleCharsetChange(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none cursor-pointer transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 focus:border-orange-500'
                    : 'bg-slate-900 border-white/10 text-slate-200 focus:border-orange-500/60'
                }`}
              >
                {COMMON_CHARSETS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">
                {isEn ? currentCharsetObj.descEn : currentCharsetObj.descFa}
              </p>
            </div>

            {/* Collation */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {isEn ? 'Collation' : 'ترتیب و مقایسه (Collation)'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'MySQL Collation Rules' : 'قواعد مرتب‌سازی و مقایسه (Collation)'}
                  whatIsIt={
                    isEn
                      ? 'The set of rules determining how characters are compared, sorted, and indexed (e.g. case-sensitivity and language nuances).'
                      : 'مجموعه قوانینی که نحوه مقایسه، ایندکس‌گذاری و مرتب‌سازی حروف (مانند حروف کوچک/بزرگ یا الفبای زبان‌های خاص) را تعیین می‌کند.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Choosing the right collation prevents unexpected sorting bugs and ensures proper handling of accented or multilingual strings.'
                      : 'انتخاب Collation مناسب موجب مرتب‌سازی صحیح کلمات و جستجوی استاندارد متون بر اساس زبان مورد نظر می‌گردد.'
                  }
                  practicalExample="utf8mb4_unicode_ci, utf8mb4_persian_ci"
                  isEn={isEn}
                />
              </div>
              <select
                value={collation}
                onChange={(e) => setCollation(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none cursor-pointer transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 focus:border-orange-500'
                    : 'bg-slate-900 border-white/10 text-slate-200 focus:border-orange-500/60'
                }`}
              >
                {currentCharsetObj.collations.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">
                {collation.includes('persian')
                  ? isEn
                    ? 'Optimized for Persian/Farsi alphabet sorting.'
                    : 'بهینه‌سازی‌شده برای مرتب‌سازی الفبای فارسی (حروف ک، گ، ی).'
                  : isEn
                  ? 'Standard multilingual comparison rule.'
                  : 'قاعده مقایسه استاندارد چندزبانه.'}
              </p>
            </div>
          </div>

          {/* IF NOT EXISTS Checkbox */}
          <div className="p-3 rounded-xl border border-white/10 bg-black/15 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
              <input
                type="checkbox"
                checked={ifNotExists}
                onChange={(e) => setIfNotExists(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 focus:ring-0 accent-orange-500 cursor-pointer"
              />
              <span className="font-medium">
                {isEn ? 'Add IF NOT EXISTS guard' : 'افزودن شرط IF NOT EXISTS (عدم خطا در صورت وجود دیتابیس)'}
              </span>
            </label>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              IF NOT EXISTS
            </span>
          </div>

          {/* Generated SQL Preview */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Code className="w-3.5 h-3.5 text-orange-400" />
                <span>{isEn ? 'Generated SQL Statement' : 'دستور SQL تولیدشده'}</span>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="text-[11px] px-2 py-1 rounded-md border border-white/10 hover:bg-white/10 text-slate-300 flex items-center gap-1 transition cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">{isEn ? 'Copied' : 'کپی شد'}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>{isEn ? 'Copy' : 'کپی'}</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 rounded-xl border border-white/10 bg-slate-950 font-mono text-xs text-orange-300 overflow-x-auto custom-scrollbar select-text">
              {generatedSql}
            </pre>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                  : 'border-white/10 hover:bg-white/5 text-slate-300'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !dbName.trim()}
              className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition shadow-md cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Creating Database...' : 'در حال ساخت دیتابیس...'}</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Create Database' : 'ساخت پایگاه داده'}</span>
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
