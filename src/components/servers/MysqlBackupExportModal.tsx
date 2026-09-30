import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  HardDrive,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Database,
  Table,
  Eye,
  Code,
  Zap,
  Activity,
  Clock,
  Sparkles,
  FileText,
  Layers,
  Settings,
} from 'lucide-react';
import { MysqlExportFormat, MysqlExportScope, MysqlDumpResult } from '../../types';
import { generateRemoteServerMysqlDump } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlBackupExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  serverId: string;
  serverName: string;
  databaseName: string;
  initialTableName?: string;
  availableTables?: string[];
  isLightMode?: boolean;
  isEn?: boolean;
}

export const MysqlBackupExportModal: React.FC<MysqlBackupExportModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  serverId,
  serverName,
  databaseName,
  initialTableName,
  availableTables = [],
  isLightMode = false,
  isEn = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Configuration States
  const [format, setFormat] = useState<MysqlExportFormat>('sql');
  const [scope, setScope] = useState<MysqlExportScope>('all');
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [tableSearch, setTableSearch] = useState('');

  // Advanced SQL Options
  const [includeDropTable, setIncludeDropTable] = useState(true);
  const [includeCreateDb, setIncludeCreateDb] = useState(false);
  const [disableForeignKeyChecks, setDisableForeignKeyChecks] = useState(true);
  const [includeViews, setIncludeViews] = useState(true);
  const [includeRoutines, setIncludeRoutines] = useState(true);
  const [includeTriggers, setIncludeTriggers] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [maxRowsLimit, setMaxRowsLimit] = useState<number>(0); // 0 means unlimited

  // Result State
  const [dumpResult, setDumpResult] = useState<MysqlDumpResult | null>(null);

  // Initialize selected tables
  useEffect(() => {
    if (initialTableName) {
      setSelectedTables(new Set([initialTableName]));
    } else {
      setSelectedTables(new Set(availableTables));
    }
  }, [initialTableName, availableTables, isOpen]);

  // Reset errors and results on modal open
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setDumpResult(null);
    }
  }, [isOpen]);

  const filteredTables = useMemo(() => {
    if (!tableSearch) return availableTables;
    return availableTables.filter((t) => t.toLowerCase().includes(tableSearch.toLowerCase()));
  }, [availableTables, tableSearch]);

  const handleToggleTable = (t: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };

  const handleSelectAllTables = () => {
    setSelectedTables(new Set(availableTables));
  };

  const handleDeselectAllTables = () => {
    setSelectedTables(new Set());
  };

  const handleGenerateDump = async () => {
    setError(null);
    setLoading(true);

    try {
      const tablesArray = Array.from(selectedTables);
      const res = await generateRemoteServerMysqlDump(serverId, {
        database: databaseName,
        format,
        scope,
        selectedTables: tablesArray.length === availableTables.length ? [] : tablesArray,
        includeDropTable,
        includeCreateDb,
        disableForeignKeyChecks,
        includeViews,
        includeRoutines,
        includeTriggers,
        includeEvents,
        maxRowsPerTable: maxRowsLimit,
      });

      if (res.success) {
        setDumpResult(res);
      } else {
        setError(isEn ? res.error || res.message : res.errorFa || res.messageFa);
      }
    } catch (err: any) {
      setError(err.message || 'Dump generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = () => {
    if (!dumpResult || !dumpResult.content) return;

    let mimeType = 'text/plain';
    if (dumpResult.format === 'json') mimeType = 'application/json';
    if (dumpResult.format === 'csv') mimeType = 'text/csv';
    if (dumpResult.format === 'sql') mimeType = 'application/sql';

    const blob = new Blob([dumpResult.content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dumpResult.filename || `${databaseName}_dump.${dumpResult.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyContent = () => {
    if (!dumpResult || !dumpResult.content) return;
    navigator.clipboard.writeText(dumpResult.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-3 sm:p-5 pointer-events-auto bg-black/60 backdrop-blur-sm"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`relative w-full flex flex-col rounded-2xl shadow-2xl transition-all duration-200 overflow-hidden border ${
          isMaximized ? 'h-full max-w-full' : 'max-h-[92vh] max-w-4xl'
        } ${
          isLightMode
            ? 'bg-slate-50 text-slate-800 border-slate-300 shadow-slate-900/20'
            : 'bg-slate-950 text-slate-100 border-cyan-500/30 shadow-cyan-950/40'
        }`}
      >
        {/* ============================================================ */}
        {/* MODAL HEADER WITH TRIAD CONTROLS                             */}
        {/* ============================================================ */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                isLightMode ? 'bg-indigo-50 text-indigo-600' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              }`}
            >
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">
                  {isEn ? 'MySQL Database & Table Backup / Export' : 'پشتیبان‌گیری و استخراج پایگاه داده MySQL'}
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {databaseName}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                <Database className="w-3 h-3 text-cyan-400" />
                <span>{serverName}</span>
                <span>•</span>
                <span className="text-cyan-400 font-semibold">{databaseName}</span>
              </p>
            </div>
          </div>

          {/* Triad Header Buttons */}
          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-1.5 rounded-lg transition ${
                  isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-slate-300'
                }`}
                title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-slate-300'
              }`}
              title={isMaximized ? (isEn ? 'Restore' : 'اندازه عادی') : isEn ? 'Maximize' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-rose-100 text-rose-600' : 'hover:bg-rose-500/20 text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* MODAL BODY (SCROLLABLE)                                      */}
        {/* ============================================================ */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div
              className={`p-4 rounded-xl flex items-start gap-3 border ${
                isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-bold">{isEn ? 'Export Failed' : 'خطا در پشتیبان‌گیری'}</p>
                <p className="font-mono break-all">{error}</p>
              </div>
            </div>
          )}

          {/* 1. Format and Scope Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300">{isEn ? 'Export Format' : 'فرمت خروجی'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Export Format' : 'فرمت پشتیبان‌گیری'}
                  whatIsIt={
                    isEn
                      ? 'Format of the generated backup: SQL Dump (.sql), JSON Data (.json), or CSV Dataset (.csv).'
                      : 'فرمت فایل خروجی شامل دامپ استاندارد SQL، ساختار داده‌های JSON یا فایل صفحه‌گسترده CSV.'
                  }
                  whyNeeded={
                    isEn
                      ? 'SQL is ideal for full database restoration; JSON and CSV are best for data migration and analytics.'
                      : 'فرمت SQL برای بازیابی کامل و فرمت‌های JSON/CSV برای انتقال داده و گزارش‌گیری مناسب هستند.'
                  }
                  practicalExample="SQL Dump (.sql)"
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'sql', label: 'SQL Dump', ext: '.sql', icon: <FileText className="w-3.5 h-3.5 text-indigo-400" /> },
                  { id: 'json', label: 'JSON Data', ext: '.json', icon: <Code className="w-3.5 h-3.5 text-amber-400" /> },
                  { id: 'csv', label: 'CSV Dataset', ext: '.csv', icon: <Table className="w-3.5 h-3.5 text-emerald-400" /> },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormat(item.id as MysqlExportFormat)}
                    className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                      format === item.id
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300 font-bold shadow-sm'
                        : isLightMode
                        ? 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-400'
                    }`}
                  >
                    {item.icon}
                    <span className="text-xs">{item.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">{item.ext}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300">{isEn ? 'Export Scope' : 'محدوده استخراج'}</label>
                <FieldInfoTooltip
                  title={isEn ? 'Export Scope' : 'محدوده محتوایی پشتیبان'}
                  whatIsIt={
                    isEn
                      ? 'Choose whether to dump Structure & Data, Structure Only (DDL schema), or Data Only (INSERTs).'
                      : 'تعیین اینکه ساختار و داده‌ها با هم صادر شوند، یا فقط ساختار DDL جداول، یا صرفاً سطرهای داده.'
                  }
                  whyNeeded={
                    isEn
                      ? 'Structure-only is great for version control; data-only is useful for populating existing schemas.'
                      : 'خروجی ساختار برای کنترل نسخه و خروجی داده برای تزریق به جداول موجود استفاده می‌شود.'
                  }
                  practicalExample="Structure and Data"
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'all',
                    label: isEn ? 'Structure & Data' : 'کامل (ساختار و داده)',
                    desc: isEn ? 'DDL + Inserts' : 'تعریف + سطرها',
                  },
                  {
                    id: 'structure_only',
                    label: isEn ? 'Structure Only' : 'فقط ساختار',
                    desc: isEn ? 'DDL Only' : 'بدون داده',
                  },
                  {
                    id: 'data_only',
                    label: isEn ? 'Data Only' : 'فقط داده‌ها',
                    desc: isEn ? 'Inserts Only' : 'بدون DDL',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScope(item.id as MysqlExportScope)}
                    className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                      scope === item.id
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300 font-bold shadow-sm'
                        : isLightMode
                        ? 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-400'
                    }`}
                  >
                    <span className="text-xs leading-tight">{item.label}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Table Selection with Search */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Table className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Select Tables to Export' : 'انتخاب جداول جهت استخراج'}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {selectedTables.size} / {availableTables.length}
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllTables}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 transition"
                >
                  {isEn ? 'Select All' : 'انتخاب همه'}
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={handleDeselectAllTables}
                  className="text-[11px] text-slate-400 hover:text-slate-300 transition"
                >
                  {isEn ? 'Deselect All' : 'لغو انتخاب همه'}
                </button>
              </div>
            </div>

            {availableTables.length > 6 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder={isEn ? 'Filter tables list...' : 'فیلتر کردن جداول...'}
                  className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs font-mono transition focus:outline-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 focus:border-cyan-500'
                      : 'bg-black/30 border-white/10 focus:border-cyan-400'
                  }`}
                />
              </div>
            )}

            <div
              className={`max-h-44 overflow-y-auto p-2.5 rounded-xl border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-black/20 border-white/5'
              }`}
            >
              {filteredTables.map((tbl) => {
                const isChecked = selectedTables.has(tbl);
                return (
                  <label
                    key={tbl}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition select-none ${
                      isChecked
                        ? isLightMode
                          ? 'bg-cyan-50 border-cyan-200 text-cyan-900 font-semibold'
                          : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 font-semibold'
                        : isLightMode
                        ? 'border-transparent hover:bg-slate-100 text-slate-600'
                        : 'border-transparent hover:bg-white/5 text-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleTable(tbl)}
                      className="rounded border-slate-400 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className="font-mono truncate">{tbl}</span>
                  </label>
                );
              })}
              {filteredTables.length === 0 && (
                <div className="col-span-full p-4 text-center text-xs text-slate-400">
                  {isEn ? 'No tables match the filter.' : 'هیچ جدولی با فیلتر وارد شده مطابقت ندارد.'}
                </div>
              )}
            </div>
          </div>

          {/* 3. Advanced SQL Dump Switches */}
          {format === 'sql' && (
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isEn ? 'Advanced SQL Dump Options' : 'تنظیمات پیشرفته دامپ SQL'}</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono">mysqldump compatibility</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeDropTable}
                    onChange={(e) => setIncludeDropTable(e.target.checked)}
                    className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{isEn ? 'Add DROP TABLE IF EXISTS' : 'افزودن DROP TABLE IF EXISTS'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={disableForeignKeyChecks}
                    onChange={(e) => setDisableForeignKeyChecks(e.target.checked)}
                    className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{isEn ? 'Disable Foreign Key Checks' : 'غیرفعال‌سازی موقت چک کلید خارجی'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeCreateDb}
                    onChange={(e) => setIncludeCreateDb(e.target.checked)}
                    className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{isEn ? 'Add CREATE DATABASE header' : 'افزودن دستور CREATE DATABASE'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeViews}
                    onChange={(e) => setIncludeViews(e.target.checked)}
                    className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{isEn ? 'Include Views' : 'شامل کردن نماها (Views)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeRoutines}
                    onChange={(e) => setIncludeRoutines(e.target.checked)}
                    className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{isEn ? 'Include Routines (Proc/Func)' : 'شامل کردن رویه‌ها و توابع'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeTriggers}
                    onChange={(e) => setIncludeTriggers(e.target.checked)}
                    className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{isEn ? 'Include Database Triggers' : 'شامل کردن تریگرها'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeEvents}
                    onChange={(e) => setIncludeEvents(e.target.checked)}
                    className="rounded border-slate-400 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{isEn ? 'Include Scheduled Events' : 'شامل کردن رویدادهای زمان‌بندی'}</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-slate-400 whitespace-nowrap">{isEn ? 'Row Limit:' : 'محدودیت سطر:'}</span>
                  <select
                    value={maxRowsLimit}
                    onChange={(e) => setMaxRowsLimit(Number(e.target.value))}
                    className={`px-2 py-1 rounded-lg border text-xs font-mono transition focus:outline-none ${
                      isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
                    }`}
                  >
                    <option value={0}>{isEn ? 'Unlimited (All Rows)' : 'بدون محدودیت (تمام سطرها)'}</option>
                    <option value={1000}>1,000</option>
                    <option value={5000}>5,000</option>
                    <option value={10000}>10,000</option>
                    <option value={50000}>50,000</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 4. Generated Output Preview & Download Card */}
          {dumpResult && (
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div
                className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                  isLightMode ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-400">
                      {isEn ? dumpResult.message : dumpResult.messageFa}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {dumpResult.filename} • {formatFileSize(dumpResult.totalBytes)} • {dumpResult.executionTimeMs} ms
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyContent}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                      isLightMode
                        ? 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Copy Dump' : 'کپی محتوا'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadFile}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Download File' : 'دانلود فایل'}</span>
                  </button>
                </div>
              </div>

              {/* Preview Snippet */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isEn ? 'Dump Content Preview' : 'پیش‌نمایش محتوای خروجی'}</span>
                  </span>
                  <span className="font-mono text-[11px]">
                    {dumpResult.content.length > 50000
                      ? isEn
                        ? 'Showing first 50KB'
                        : 'نمایش ۵۰ کیلوبایت اول'
                      : `${dumpResult.content.split('\n').length} lines`}
                  </span>
                </div>
                <pre
                  className={`p-3.5 rounded-xl border font-mono text-[11px] max-h-64 overflow-auto whitespace-pre-wrap ${
                    isLightMode ? 'bg-slate-100 border-slate-200 text-slate-800' : 'bg-black/40 border-white/5 text-cyan-200'
                  }`}
                >
                  {dumpResult.content.slice(0, 50000)}
                  {dumpResult.content.length > 50000 && '\n\n... [Content truncated for preview. Download file for complete dump]'}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* MODAL FOOTER                                                 */}
        {/* ============================================================ */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-white/10'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              isLightMode ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
            }`}
          >
            {isEn ? 'Close' : 'بستن'}
          </button>

          <button
            type="button"
            onClick={handleGenerateDump}
            disabled={loading || selectedTables.size === 0}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-lg shadow-indigo-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{isEn ? 'Generating Dump...' : 'در حال تولید فایل پشتیبان...'}</span>
              </>
            ) : (
              <>
                <HardDrive className="w-3.5 h-3.5" />
                <span>{isEn ? 'Generate Backup Dump' : 'تولید فایل پشتیبان'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
