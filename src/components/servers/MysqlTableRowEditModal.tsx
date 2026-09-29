import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Plus,
  Pencil,
  Trash2,
  Key,
  Database,
  Table as TableIcon,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Info,
  Shield,
  FileCode,
  Check,
  Sparkles,
  Clock,
  Copy,
} from 'lucide-react';
import { MysqlRowColumnValue } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlRowModalColumn {
  name: string;
  dataType: string;
  columnType?: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  defaultValue?: string | null;
  isAutoIncrement?: boolean;
  comment?: string;
}

export interface MysqlTableRowEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'insert' | 'edit' | 'delete';
  databaseName: string;
  tableName: string;
  columns: MysqlRowModalColumn[];
  initialRow?: Record<string, any> | null;
  onSubmitInsert?: (values: Record<string, MysqlRowColumnValue>) => Promise<{ success: boolean; error?: string }>;
  onSubmitUpdate?: (
    updatedValues: Record<string, MysqlRowColumnValue>,
    primaryKeyValues?: Record<string, any>,
    originalRow?: Record<string, any>
  ) => Promise<{ success: boolean; error?: string }>;
  onSubmitDelete?: (
    primaryKeyValues?: Record<string, any>,
    originalRow?: Record<string, any>
  ) => Promise<{ success: boolean; error?: string }>;
  isEn?: boolean;
  isLightMode?: boolean;
}

interface ColumnEditState {
  value: string;
  mode: 'value' | 'null' | 'default';
  isModified: boolean;
  jsonError?: string | null;
}

export const MysqlTableRowEditModal: React.FC<MysqlTableRowEditModalProps> = ({
  isOpen,
  onClose,
  mode,
  databaseName,
  tableName,
  columns,
  initialRow,
  onSubmitInsert,
  onSubmitUpdate,
  onSubmitDelete,
  isEn = true,
  isLightMode = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form state per column
  const [colStates, setColStates] = useState<Record<string, ColumnEditState>>({});

  // Detect primary keys
  const primaryKeyCols = useMemo(() => columns.filter((c) => c.isPrimaryKey), [columns]);

  // Primary key values from initialRow
  const primaryKeyValues = useMemo(() => {
    if (!initialRow || primaryKeyCols.length === 0) return undefined;
    const pks: Record<string, any> = {};
    for (const pk of primaryKeyCols) {
      if (initialRow[pk.name] !== undefined) {
        pks[pk.name] = initialRow[pk.name];
      }
    }
    return Object.keys(pks).length > 0 ? pks : undefined;
  }, [initialRow, primaryKeyCols]);

  // Initialize form state whenever modal opens or mode / row changes
  useEffect(() => {
    if (!isOpen) {
      setSubmitError(null);
      return;
    }

    setSubmitError(null);
    const newStates: Record<string, ColumnEditState> = {};

    for (const col of columns) {
      const isAuto = Boolean(
        col.isAutoIncrement ||
          (col.columnType && col.columnType.toLowerCase().includes('auto_increment')) ||
          (col.defaultValue && col.defaultValue.toLowerCase().includes('auto_increment'))
      );

      if (mode === 'insert') {
        const prefilledVal = initialRow ? initialRow[col.name] : undefined;
        const hasPrefill = initialRow && prefilledVal !== null && prefilledVal !== undefined;

        let strVal = '';
        if (hasPrefill) {
          strVal = typeof prefilledVal === 'object' ? JSON.stringify(prefilledVal, null, 2) : String(prefilledVal);
        }

        newStates[col.name] = {
          value: hasPrefill && !isAuto ? strVal : '',
          mode: isAuto ? 'default' : hasPrefill ? 'value' : col.defaultValue ? 'default' : 'value',
          isModified: hasPrefill && !isAuto,
          jsonError: null,
        };
      } else if (mode === 'edit' && initialRow) {
        const rawVal = initialRow[col.name];
        const isNull = rawVal === null || rawVal === undefined;
        let strVal = '';
        if (!isNull) {
          strVal = typeof rawVal === 'object' ? JSON.stringify(rawVal, null, 2) : String(rawVal);
        }

        newStates[col.name] = {
          value: strVal,
          mode: isNull ? 'null' : 'value',
          isModified: false,
          jsonError: null,
        };
      }
    }

    setColStates(newStates);
  }, [isOpen, mode, initialRow, columns]);

  if (!isOpen) return null;

  // Handle column value change
  const handleValueChange = (colName: string, val: string, dataType: string) => {
    let jsonErr: string | null = null;
    const isJson = dataType.toLowerCase().includes('json');
    if (isJson && val.trim() !== '') {
      try {
        JSON.parse(val);
      } catch (err: any) {
        jsonErr = err.message || (isEn ? 'Invalid JSON format' : 'فرمت JSON نامعتبر است');
      }
    }

    setColStates((prev) => {
      const origVal = initialRow ? initialRow[colName] : '';
      const origStr =
        origVal === null || origVal === undefined
          ? ''
          : typeof origVal === 'object'
          ? JSON.stringify(origVal, null, 2)
          : String(origVal);
      const isModified = mode === 'edit' ? val !== origStr : val !== '';

      return {
        ...prev,
        [colName]: {
          ...prev[colName],
          value: val,
          mode: 'value',
          isModified,
          jsonError: jsonErr,
        },
      };
    });
  };

  const handleModeChange = (colName: string, targetMode: 'value' | 'null' | 'default') => {
    setColStates((prev) => {
      const origVal = initialRow ? initialRow[colName] : null;
      const isNullOrig = origVal === null || origVal === undefined;
      const isModified = mode === 'edit' ? (targetMode === 'null' ? !isNullOrig : true) : true;

      return {
        ...prev,
        [colName]: {
          ...prev[colName],
          mode: targetMode,
          isModified,
        },
      };
    });
  };

  // Quick helper: Format Current MySQL DATETIME
  const handleInsertCurrentDatetime = (colName: string, dataType: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const mysqlDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    handleValueChange(colName, mysqlDateTime, dataType);
  };

  // Quick helper: Insert Today's Date
  const handleInsertTodayDate = (colName: string, dataType: string) => {
    const today = new Date().toISOString().slice(0, 10);
    handleValueChange(colName, today, dataType);
  };

  // Quick helper: Format / Beautify JSON
  const handleFormatJson = (colName: string, dataType: string) => {
    const current = colStates[colName]?.value;
    if (!current || !current.trim()) return;
    try {
      const parsed = JSON.parse(current);
      const beautified = JSON.stringify(parsed, null, 2);
      handleValueChange(colName, beautified, dataType);
    } catch {}
  };

  // Count modified columns in edit mode
  const modifiedCount = Object.values(colStates).filter((s) => s.isModified).length;

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate JSON errors
    const hasJsonErrors = Object.values(colStates).some((s) => s.mode === 'value' && Boolean(s.jsonError));
    if (hasJsonErrors) {
      setSubmitError(
        isEn
          ? 'Please fix invalid JSON syntax in marked fields before submitting.'
          : 'لطفاً خطاهای نحوی JSON را قبل از ارسال برطرف کنید.'
      );
      return;
    }

    // Validate NOT NULL constraints without default values
    for (const col of columns) {
      const st = colStates[col.name];
      if (!st) continue;

      const isColNotNull = col.isNullable === false;
      const isAuto = Boolean(
        col.isAutoIncrement ||
          (col.columnType && col.columnType.toLowerCase().includes('auto_increment')) ||
          (col.defaultValue && col.defaultValue.toLowerCase().includes('auto_increment'))
      );
      const hasDefault = Boolean(col.defaultValue || col.isPrimaryKey || isAuto);

      if (isColNotNull && !hasDefault) {
        if (st.mode === 'null') {
          setSubmitError(
            isEn
              ? `Column "${col.name}" has a NOT NULL constraint and cannot be set to NULL.`
              : `ستون "${col.name}" دارای قید NOT NULL است و نمی‌تواند تهی (NULL) باشد.`
          );
          return;
        }
        if (st.mode === 'value' && st.value.trim() === '') {
          setSubmitError(
            isEn
              ? `Column "${col.name}" is NOT NULL and requires a valid value.`
              : `ستون "${col.name}" دارای قید NOT NULL است و وارد کردن مقدار برای آن الزامی است.`
          );
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === 'insert' && onSubmitInsert) {
        const payload: Record<string, MysqlRowColumnValue> = {};
        for (const col of columns) {
          const st = colStates[col.name];
          if (!st) continue;

          if (st.mode === 'default') {
            payload[col.name] = { value: undefined, isDefault: true };
          } else if (st.mode === 'null') {
            payload[col.name] = { value: null, isNull: true };
          } else {
            let parsedVal: any = st.value;
            const lowerType = col.dataType.toLowerCase();

            if (lowerType.includes('tinyint(1)') || lowerType === 'bool' || lowerType === 'boolean') {
              parsedVal = st.value === '1' || st.value === 'true' || st.value === 'yes';
            } else if (lowerType.includes('int') && st.value.trim() !== '') {
              const num = parseInt(st.value.trim(), 10);
              parsedVal = isNaN(num) ? st.value : num;
            } else if (
              (lowerType.includes('decimal') ||
                lowerType.includes('float') ||
                lowerType.includes('double') ||
                lowerType.includes('numeric')) &&
              st.value.trim() !== ''
            ) {
              const num = parseFloat(st.value.trim());
              parsedVal = isNaN(num) ? st.value : num;
            } else if (lowerType.includes('json') && st.value.trim() !== '') {
              try {
                parsedVal = JSON.parse(st.value);
              } catch {
                parsedVal = st.value;
              }
            } else if (st.value.trim() === '' && col.isNullable !== false) {
              if (!lowerType.includes('char') && !lowerType.includes('text')) {
                payload[col.name] = { value: null, isNull: true };
                continue;
              }
            }
            payload[col.name] = { value: parsedVal };
          }
        }

        const res = await onSubmitInsert(payload);
        if (res.success) {
          onClose();
        } else {
          setSubmitError(res.error || (isEn ? 'Failed to insert row' : 'خطا در درج سطر'));
        }
      } else if (mode === 'edit' && onSubmitUpdate) {
        if (modifiedCount === 0) {
          setSubmitError(isEn ? 'No column values were modified.' : 'هیچ مقداری تغییر نیافته است.');
          setIsSubmitting(false);
          return;
        }

        const payload: Record<string, MysqlRowColumnValue> = {};
        for (const col of columns) {
          const st = colStates[col.name];
          if (!st || !st.isModified) continue;

          if (st.mode === 'default') {
            payload[col.name] = { value: undefined, isDefault: true };
          } else if (st.mode === 'null') {
            payload[col.name] = { value: null, isNull: true };
          } else {
            let parsedVal: any = st.value;
            const lowerType = col.dataType.toLowerCase();

            if (lowerType.includes('tinyint(1)') || lowerType === 'bool' || lowerType === 'boolean') {
              parsedVal = st.value === '1' || st.value === 'true' || st.value === 'yes';
            } else if (lowerType.includes('int') && st.value.trim() !== '') {
              const num = parseInt(st.value.trim(), 10);
              parsedVal = isNaN(num) ? st.value : num;
            } else if (
              (lowerType.includes('decimal') ||
                lowerType.includes('float') ||
                lowerType.includes('double') ||
                lowerType.includes('numeric')) &&
              st.value.trim() !== ''
            ) {
              const num = parseFloat(st.value.trim());
              parsedVal = isNaN(num) ? st.value : num;
            } else if (lowerType.includes('json') && st.value.trim() !== '') {
              try {
                parsedVal = JSON.parse(st.value);
              } catch {
                parsedVal = st.value;
              }
            } else if (st.value.trim() === '' && col.isNullable !== false) {
              if (!lowerType.includes('char') && !lowerType.includes('text')) {
                payload[col.name] = { value: null, isNull: true };
                continue;
              }
            }
            payload[col.name] = { value: parsedVal };
          }
        }

        const res = await onSubmitUpdate(payload, primaryKeyValues, initialRow || undefined);
        if (res.success) {
          onClose();
        } else {
          setSubmitError(res.error || (isEn ? 'Failed to update row' : 'خطا در به‌روزرسانی سطر'));
        }
      } else if (mode === 'delete' && onSubmitDelete) {
        const res = await onSubmitDelete(primaryKeyValues, initialRow || undefined);
        if (res.success) {
          onClose();
        } else {
          setSubmitError(res.error || (isEn ? 'Failed to delete row' : 'خطا در حذف سطر'));
        }
      }
    } catch (err: any) {
      setSubmitError(err.message || (isEn ? 'Unexpected transaction failure' : 'خطای غیرمنتظره در تراکنش دیتابیس'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999995] flex flex-col items-center justify-center select-none ${
        isMaximized ? 'p-0' : 'p-3 sm:p-5 bg-black/80 backdrop-blur-xs'
      }`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-3xl max-h-[92vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900 border-slate-700/80 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center ${
                mode === 'insert'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : mode === 'edit'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}
            >
              {mode === 'insert' ? (
                <Plus className="w-5 h-5" />
              ) : mode === 'edit' ? (
                <Pencil className="w-5 h-5" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">
                  {mode === 'insert' && (isEn ? 'Insert Row into MySQL Table' : 'درج سطر جدید در جدول MySQL')}
                  {mode === 'edit' && (isEn ? 'Edit MySQL Table Row' : 'ویرایش سطر جدول MySQL')}
                  {mode === 'delete' && (isEn ? 'Delete MySQL Table Row' : 'حذف سطر از جدول MySQL')}
                </h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                  {databaseName}.{tableName}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {mode === 'insert' &&
                  (isEn
                    ? 'Populate column fields and execute an atomic INSERT transaction.'
                    : 'مقادیر ستون‌ها را وارد کرده و تراکنش درج ایمن را اجرا نمایید.')}
                {mode === 'edit' &&
                  (isEn
                    ? 'Modify targeted values with strict LIMIT 1 protection.'
                    : 'مقادیر ستون‌های مدنظر را با حفاظت حداکثر ۱ سطر ویرایش کنید.')}
                {mode === 'delete' &&
                  (isEn
                    ? 'Permanently delete this specific record with strict LIMIT 1 protection.'
                    : 'این رکورد مشخص را با حفاظت امنیتی LIMIT 1 از جدول حذف کنید.')}
              </p>
            </div>
          </div>

          {/* Window Control Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition-colors ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  : 'border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  : 'border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title={isMaximized ? (isEn ? 'Restore' : 'بازگردانی') : (isEn ? 'Maximize' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition-colors ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                  : 'border-slate-700/60 text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Target Identity & Safety Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
              mode === 'delete'
                ? isLightMode
                  ? 'bg-red-50/80 border-red-200 text-red-800'
                  : 'bg-red-950/20 border-red-800/40 text-red-300'
                : isLightMode
                ? 'bg-blue-50/80 border-blue-200 text-blue-800'
                : 'bg-blue-950/20 border-blue-800/40 text-blue-300'
            }`}
          >
            <Shield className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-1 flex-1">
              <div className="font-semibold flex items-center gap-2">
                <span>{isEn ? 'Atomic Mutation Safety' : 'امنیت تراکنشی عملیات'}</span>
                <span className="px-1.5 py-0.2 rounded bg-black/10 font-mono text-[10px]">LIMIT 1</span>
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">
                {mode === 'insert' &&
                  (isEn
                    ? 'Values will be submitted inside an atomic transaction. Auto-increment fields and default values are respected.'
                    : 'مقادیر در قالب یک تراکنش اتمیک ارسال می‌شوند. فیلدهای Auto-increment و پیش‌فرض‌ها به‌صورت خودکار لحاظ می‌گردند.')}
                {mode === 'edit' &&
                  (primaryKeyValues
                    ? isEn
                      ? `Target row is strictly identified by Primary Key: (${Object.entries(primaryKeyValues)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')}). A LIMIT 1 clause is enforced on the server to prevent accidental mass updates.`
                      : `سطر هدف دقیقاً با کلید اصلی (${Object.entries(primaryKeyValues)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')}) مشخص شده است. شرط LIMIT 1 برای ممانعت قطعی از ویرایش انبوه اعمال می‌گردد.`
                    : isEn
                    ? 'Target row will be matched against all initial column values using MySQL null-safe equality (<=>) and guarded by LIMIT 1.'
                    : 'سطر هدف بر اساس تطابق مقادیر اولیه تمامی ستون‌ها با عملگر امن <=> و محدودیت محافظتی LIMIT 1 مشخص می‌شود.')}
                {mode === 'delete' &&
                  (primaryKeyValues
                    ? isEn
                      ? `Target row is uniquely identified by Primary Key: (${Object.entries(primaryKeyValues)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')}). Execution is atomic with LIMIT 1 protection.`
                      : `سطر هدف با کلید اصلی (${Object.entries(primaryKeyValues)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')}) مشخص شده است. عملیات حذف اتمیک و با گارد امنیتی LIMIT 1 اجرا خواهد شد.`
                    : isEn
                    ? 'Target row will be safely deleted matching all column values with LIMIT 1 protection.'
                    : 'سطر هدف بر اساس تطابق مقادیر ستون‌ها با گارد محافظتی LIMIT 1 حذف خواهد شد.')}
              </p>
            </div>
          </div>

          {/* Submission Error Banner */}
          {submitError && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                isLightMode
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-red-950/40 border-red-800/60 text-red-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
              <div className="flex-1 font-mono text-[11px] leading-relaxed break-all">{submitError}</div>
            </div>
          )}

          {/* Mode-specific content */}
          {mode === 'delete' ? (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                }`}
              >
                <h4 className="text-xs font-semibold flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-orange-400" />
                  <span>{isEn ? 'Record Values to be Deleted' : 'مقادیر رکوردی که حذف خواهد شد'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {columns.map((col) => {
                    const val = initialRow ? initialRow[col.name] : undefined;
                    const isNull = val === null || val === undefined;
                    return (
                      <div
                        key={col.name}
                        className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-medium flex items-center gap-1.5">
                            {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-400" />}
                            <span>{col.name}</span>
                          </span>
                          <span className="text-[10px] opacity-60 font-mono">{col.dataType}</span>
                        </div>
                        <div className="font-mono text-[11px] truncate">
                          {isNull ? (
                            <span className="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 text-[10px] italic">
                              NULL
                            </span>
                          ) : typeof val === 'object' ? (
                            JSON.stringify(val)
                          ) : (
                            String(val)
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div
                className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs ${
                  isLightMode
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                <span>
                  {isEn
                    ? 'Warning: This action cannot be undone. Are you sure you want to delete this row?'
                    : 'هشدار: این عملیات غیرقابل بازگشت است. آیا از حذف دائمی این سطر اطمینان دارید؟'}
                </span>
              </div>
            </div>
          ) : (
            /* Insert & Edit Column Form */
            <form id="mysql-row-edit-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                {columns.map((col) => {
                  const state = colStates[col.name] || {
                    value: '',
                    mode: 'value',
                    isModified: false,
                  };
                  const isAuto = Boolean(
                    col.isAutoIncrement ||
                      (col.columnType && col.columnType.toLowerCase().includes('auto_increment')) ||
                      (col.defaultValue && col.defaultValue.toLowerCase().includes('auto_increment'))
                  );
                  const isNotNull = col.isNullable === false;
                  const lowerType = col.dataType.toLowerCase();
                  const isJson = lowerType.includes('json');
                  const isTextarea = isJson || lowerType.includes('text') || lowerType.includes('blob');
                  const isBoolean =
                    lowerType.includes('tinyint(1)') || lowerType === 'bool' || lowerType === 'boolean';

                  return (
                    <div
                      key={col.name}
                      className={`p-3.5 rounded-xl border transition-all ${
                        state.isModified
                          ? isLightMode
                            ? 'bg-amber-50/40 border-amber-300 shadow-xs'
                            : 'bg-amber-950/10 border-amber-500/40 shadow-xs'
                          : isLightMode
                          ? 'bg-slate-50/70 border-slate-200'
                          : 'bg-slate-950/40 border-slate-800/80'
                      }`}
                    >
                      {/* Column Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-xs flex items-center gap-1.5">
                            {col.isPrimaryKey && <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                            <span>{col.name}</span>
                          </span>

                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 border border-slate-500/20 text-slate-400">
                            {col.columnType || col.dataType}
                          </span>

                          {isNotNull && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-medium">
                              NOT NULL
                            </span>
                          )}

                          {isAuto && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 font-medium">
                              AUTO_INCREMENT
                            </span>
                          )}

                          {state.isModified && mode === 'edit' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">
                              {isEn ? 'Modified' : 'تغییریافته'}
                            </span>
                          )}

                          <FieldInfoTooltip
                            title={col.name}
                            whatIsIt={
                              isEn
                                ? `Column "${col.name}" with type ${col.columnType || col.dataType}.`
                                : `ستون "${col.name}" با نوع داده‌ای ${col.columnType || col.dataType}.`
                            }
                            whyIsItNeeded={
                              col.isPrimaryKey
                                ? isEn
                                  ? 'Primary Key column providing unique identity to each row in MySQL.'
                                  : 'کلید اصلی جدول که هویت یکتا به هر سطر می‌بخشد.'
                                : isEn
                                ? 'Stores targeted data attribute according to database schema definition.'
                                : 'نگهداری ویژگی مشخص داده‌ای بر اساس تعریف اسکیما در دیتابیس.'
                            }
                            practicalExample={
                              col.defaultValue
                                ? isEn
                                  ? `Default: ${col.defaultValue}`
                                  : `مقدار پیش‌فرض: ${col.defaultValue}`
                                : isEn
                                ? 'Leave as NULL/DEFAULT or provide a valid scalar value.'
                                : 'می‌توانید روی NULL یا مقدار پیش‌فرض تنظیم یا مقدار وارد نمایید.'
                            }
                            isEn={isEn}
                            isLightMode={isLightMode}
                          />
                        </div>

                        {/* Mode toggles (Value, NULL, DEFAULT) */}
                        <div className="flex items-center gap-1 bg-black/10 dark:bg-black/30 p-0.5 rounded-lg border border-slate-700/30 text-[10px] font-mono">
                          <button
                            type="button"
                            onClick={() => handleModeChange(col.name, 'value')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              state.mode === 'value'
                                ? 'bg-cyan-500 text-white font-medium shadow-xs'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            VALUE
                          </button>

                          <button
                            type="button"
                            disabled={isNotNull && !col.defaultValue && !isAuto}
                            onClick={() => handleModeChange(col.name, 'null')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              state.mode === 'null'
                                ? 'bg-amber-500 text-white font-medium shadow-xs'
                                : isNotNull && !col.defaultValue && !isAuto
                                ? 'opacity-40 cursor-not-allowed text-slate-500'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                            title={
                              isNotNull && !col.defaultValue && !isAuto
                                ? isEn
                                  ? 'NOT NULL constraint active'
                                  : 'قید NOT NULL فعال است'
                                : undefined
                            }
                          >
                            NULL
                          </button>

                          <button
                            type="button"
                            onClick={() => handleModeChange(col.name, 'default')}
                            className={`px-2 py-0.5 rounded transition-colors ${
                              state.mode === 'default'
                                ? 'bg-emerald-500 text-white font-medium shadow-xs'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                            title={
                              isAuto
                                ? isEn
                                  ? 'MySQL AUTO_INCREMENT will generate next ID'
                                  : 'موتور MySQL شناسه بعدی را خودکار ایجاد می‌کند'
                                : col.defaultValue
                                ? isEn
                                  ? `Default: ${col.defaultValue}`
                                  : `پیش‌فرض: ${col.defaultValue}`
                                : isEn
                                ? 'Use database engine DEFAULT'
                                : 'استفاده از پیش‌فرض دیتابیس'
                            }
                          >
                            DEFAULT
                          </button>
                        </div>
                      </div>

                      {/* Input field based on mode */}
                      {state.mode === 'default' ? (
                        <div
                          className={`px-3 py-2 rounded-lg border text-xs font-mono flex items-center justify-between ${
                            isLightMode
                              ? 'bg-slate-100 border-slate-200 text-slate-500'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400'
                          }`}
                        >
                          <span className="italic flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                            <span>
                              {isAuto
                                ? isEn
                                  ? 'Auto-increment generated on insert'
                                  : 'تولید خودکار توسط Auto-increment در زمان درج'
                                : col.defaultValue
                                ? `DEFAULT: ${col.defaultValue}`
                                : isEn
                                ? 'Database DEFAULT expression'
                                : 'مقدار پیش‌فرض موتور دیتابیس'}
                            </span>
                          </span>
                        </div>
                      ) : state.mode === 'null' ? (
                        <div
                          className={`px-3 py-2 rounded-lg border text-xs font-mono flex items-center justify-between ${
                            isLightMode
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-amber-950/20 border-amber-800/40 text-amber-400'
                          }`}
                        >
                          <span className="italic font-bold">NULL</span>
                          <span className="text-[10px] opacity-75">
                            {isEn ? 'Value will be stored as SQL NULL' : 'مقدار به‌صورت NULL ذخیره می‌شود'}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {isBoolean ? (
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                                <input
                                  type="radio"
                                  name={`bool-${col.name}`}
                                  checked={state.value === '1' || state.value === 'true'}
                                  onChange={() => handleValueChange(col.name, '1', col.dataType)}
                                  className="accent-cyan-500"
                                />
                                <span className="text-emerald-400 font-bold">1 (TRUE)</span>
                              </label>

                              <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                                <input
                                  type="radio"
                                  name={`bool-${col.name}`}
                                  checked={state.value === '0' || state.value === 'false'}
                                  onChange={() => handleValueChange(col.name, '0', col.dataType)}
                                  className="accent-cyan-500"
                                />
                                <span className="text-rose-400 font-bold">0 (FALSE)</span>
                              </label>
                            </div>
                          ) : isTextarea ? (
                            <textarea
                              rows={isJson ? 4 : 2}
                              value={state.value}
                              onChange={(e) => handleValueChange(col.name, e.target.value, col.dataType)}
                              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono resize-y transition-colors outline-none focus:ring-1 focus:ring-cyan-500 ${
                                state.jsonError
                                  ? 'border-red-500 bg-red-950/10'
                                  : isLightMode
                                  ? 'bg-white border-slate-300 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                              placeholder={isJson ? '{\n  "key": "value"\n}' : 'Enter text / blob...'}
                            />
                          ) : (
                            <input
                              type="text"
                              value={state.value}
                              onChange={(e) => handleValueChange(col.name, e.target.value, col.dataType)}
                              className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors outline-none focus:ring-1 focus:ring-cyan-500 ${
                                isLightMode
                                  ? 'bg-white border-slate-300 text-slate-800'
                                  : 'bg-slate-900 border-slate-700 text-slate-100'
                              }`}
                              placeholder={col.defaultValue ? `Default: ${col.defaultValue}` : 'Enter value...'}
                            />
                          )}

                          {/* Quick Value Helpers */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-slate-400">
                            {(lowerType.includes('datetime') || lowerType.includes('timestamp')) && (
                              <button
                                type="button"
                                onClick={() => handleInsertCurrentDatetime(col.name, col.dataType)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700/40 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                              >
                                <Clock className="w-3 h-3 text-cyan-400" />
                                <span>{isEn ? 'Current Time' : 'زمان فعلی'}</span>
                              </button>
                            )}

                            {lowerType.includes('date') && !lowerType.includes('datetime') && (
                              <button
                                type="button"
                                onClick={() => handleInsertTodayDate(col.name, col.dataType)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700/40 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                              >
                                <Clock className="w-3 h-3 text-cyan-400" />
                                <span>{isEn ? "Today's Date" : 'تاریخ امروز'}</span>
                              </button>
                            )}

                            {isJson && (
                              <button
                                type="button"
                                onClick={() => handleFormatJson(col.name, col.dataType)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700/40 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                              >
                                <FileCode className="w-3 h-3 text-emerald-400" />
                                <span>{isEn ? 'Format JSON' : 'مرتب‌سازی JSON'}</span>
                              </button>
                            )}

                            {state.jsonError && (
                              <span className="text-red-400 font-mono text-[10px] flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>{state.jsonError}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-t shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            {mode === 'edit' && (
              <span
                className={`font-mono text-[11px] ${
                  modifiedCount > 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? `${modifiedCount} of ${columns.length} columns modified`
                  : `${modifiedCount} از ${columns.length} ستون تغییر یافته است`}
              </span>
            )}
            {mode === 'insert' && (
              <span className="text-slate-400 text-[11px]">
                {isEn ? `${columns.length} columns available` : `${columns.length} ستون در دسترس است`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            {mode === 'delete' ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Deleting...' : 'در حال حذف...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Confirm Delete' : 'تأیید حذف قطعی سطر'}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                form="mysql-row-edit-form"
                disabled={isSubmitting || (mode === 'edit' && modifiedCount === 0)}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white shadow-lg transition-all cursor-pointer ${
                  mode === 'insert'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                    : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Saving...' : 'در حال ذخیره‌سازی...'}</span>
                  </>
                ) : mode === 'insert' ? (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Insert Row' : 'درج سطر جدید'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Save Changes' : 'ذخیره تغییرات'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
