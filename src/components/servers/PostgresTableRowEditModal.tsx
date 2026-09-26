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
} from 'lucide-react';
import { PostgresTableDataColumnInfo, PostgresRowColumnValue } from '../../types';

export interface PostgresTableRowEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'insert' | 'edit' | 'delete';
  databaseName: string;
  schemaName: string;
  tableName: string;
  columns: PostgresTableDataColumnInfo[];
  initialRow?: Record<string, any> | null;
  onSubmitInsert?: (values: Record<string, PostgresRowColumnValue>) => Promise<{ success: boolean; error?: string }>;
  onSubmitUpdate?: (
    updatedValues: Record<string, PostgresRowColumnValue>,
    primaryKeyValues?: Record<string, any>,
    ctid?: string,
    originalRow?: Record<string, any>
  ) => Promise<{ success: boolean; error?: string }>;
  onSubmitDelete?: (
    primaryKeyValues?: Record<string, any>,
    ctid?: string,
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

export const PostgresTableRowEditModal: React.FC<PostgresTableRowEditModalProps> = ({
  isOpen,
  onClose,
  mode,
  databaseName,
  schemaName,
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

  const rowCtid = useMemo(() => {
    if (!initialRow || !initialRow._pg_ctid) return undefined;
    return String(initialRow._pg_ctid);
  }, [initialRow]);

  // Initialize form state whenever modal opens or mode / row changes
  useEffect(() => {
    if (!isOpen) {
      setSubmitError(null);
      return;
    }

    setSubmitError(null);
    const newStates: Record<string, ColumnEditState> = {};

    for (const col of columns) {
      if (mode === 'insert') {
        // If column is primary key or has SERIAL / auto type, default to 'default' mode
        const isAuto =
          col.isPrimaryKey ||
          col.dataType.includes('serial') ||
          col.formattedType.includes('serial');

        newStates[col.name] = {
          value: '',
          mode: isAuto ? 'default' : 'value',
          isModified: false,
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
      const origStr = origVal === null || origVal === undefined ? '' : typeof origVal === 'object' ? JSON.stringify(origVal, null, 2) : String(origVal);
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

    setIsSubmitting(true);

    try {
      if (mode === 'insert' && onSubmitInsert) {
        const payload: Record<string, PostgresRowColumnValue> = {};
        for (const col of columns) {
          const st = colStates[col.name];
          if (!st) continue;

          if (st.mode === 'default') {
            payload[col.name] = { value: undefined, isDefault: true };
          } else if (st.mode === 'null') {
            payload[col.name] = { value: null, isNull: true };
          } else {
            // Type conversion where beneficial
            let parsedVal: any = st.value;
            const lowerType = col.dataType.toLowerCase();
            if (lowerType.includes('bool')) {
              parsedVal = st.value === 'true' || st.value === 't';
            } else if (lowerType.includes('int') && st.value.trim() !== '') {
              const num = parseInt(st.value.trim(), 10);
              parsedVal = isNaN(num) ? st.value : num;
            } else if ((lowerType.includes('numeric') || lowerType.includes('float') || lowerType.includes('double')) && st.value.trim() !== '') {
              const num = parseFloat(st.value.trim());
              parsedVal = isNaN(num) ? st.value : num;
            } else if (lowerType.includes('json') && st.value.trim() !== '') {
              try {
                parsedVal = JSON.parse(st.value);
              } catch {
                parsedVal = st.value;
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

        const payload: Record<string, PostgresRowColumnValue> = {};
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
            if (lowerType.includes('bool')) {
              parsedVal = st.value === 'true' || st.value === 't';
            } else if (lowerType.includes('int') && st.value.trim() !== '') {
              const num = parseInt(st.value.trim(), 10);
              parsedVal = isNaN(num) ? st.value : num;
            } else if ((lowerType.includes('numeric') || lowerType.includes('float') || lowerType.includes('double')) && st.value.trim() !== '') {
              const num = parseFloat(st.value.trim());
              parsedVal = isNaN(num) ? st.value : num;
            } else if (lowerType.includes('json') && st.value.trim() !== '') {
              try {
                parsedVal = JSON.parse(st.value);
              } catch {
                parsedVal = st.value;
              }
            }
            payload[col.name] = { value: parsedVal };
          }
        }

        const res = await onSubmitUpdate(payload, primaryKeyValues, rowCtid, initialRow || undefined);
        if (res.success) {
          onClose();
        } else {
          setSubmitError(res.error || (isEn ? 'Failed to update row' : 'خطا در به‌روزرسانی سطر'));
        }
      } else if (mode === 'delete' && onSubmitDelete) {
        const res = await onSubmitDelete(primaryKeyValues, rowCtid, initialRow || undefined);
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
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header Bar */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${
            mode === 'delete'
              ? isLightMode
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-rose-950/40 border-rose-900/60 text-rose-300'
              : mode === 'edit'
              ? isLightMode
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-amber-950/30 border-amber-900/50 text-amber-300'
              : isLightMode
              ? 'bg-cyan-50/70 border-cyan-200 text-cyan-950'
              : 'bg-cyan-950/30 border-cyan-900/50 text-cyan-300'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                mode === 'delete'
                  ? 'bg-rose-500/20 text-rose-400'
                  : mode === 'edit'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-cyan-500/20 text-cyan-400'
              }`}
            >
              {mode === 'delete' ? (
                <Trash2 className="w-4 h-4" />
              ) : mode === 'edit' ? (
                <Pencil className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </div>

            <div className="min-w-0">
              <h4 className="font-bold text-sm truncate flex items-center gap-1.5">
                <span>
                  {mode === 'delete'
                    ? isEn
                      ? 'Delete Table Row'
                      : 'حذف سطر از جدول'
                    : mode === 'edit'
                    ? isEn
                      ? 'Edit Table Row'
                      : 'ویرایش سطر جدول'
                    : isEn
                    ? 'Insert New Table Row'
                    : 'افزودن سطر جدید به جدول'}
                </span>
                <span className="text-xs font-mono font-normal opacity-75 truncate">
                  ({schemaName}.{tableName})
                </span>
              </h4>
              <p className="text-[11px] opacity-70 truncate flex items-center gap-2 font-mono">
                <span>{databaseName}</span>
                <span>•</span>
                <span>
                  {mode === 'delete'
                    ? isEn
                      ? 'Safe transactional deletion with 1-row verification'
                      : 'حذف ایمن در قالب تراکنش با سنجش دقیق ۱ سطر'
                    : mode === 'edit'
                    ? isEn
                      ? 'Isolated UPDATE transaction with atomic commit'
                      : 'تراکنش مجزای UPDATE با تعهد اتمیک'
                    : isEn
                    ? 'Safe parameterized INSERT with default value support'
                    : 'درج پارامتری ایمن با پشتیبانی از مقادیر پیش‌فرض'}
                </span>
              </p>
            </div>
          </div>

          {/* 3-Control Window Header Buttons */}
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
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
              disabled={isSubmitting}
              className={`p-1.5 rounded-lg transition ${
                isLightMode ? 'hover:bg-rose-100 text-rose-600' : 'hover:bg-rose-900/50 text-rose-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Target Row Identification Banner for Edit / Delete */}
            {(mode === 'edit' || mode === 'delete') && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="text-xs font-mono">
                    <span className="text-slate-400 font-sans">{isEn ? 'Target Identifier:' : 'شناسه سطر هدف:'} </span>
                    {primaryKeyValues ? (
                      <span className="font-bold text-amber-400">
                        {Object.entries(primaryKeyValues)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')}
                      </span>
                    ) : rowCtid ? (
                      <span className="font-bold text-cyan-400">ctid {rowCtid}</span>
                    ) : (
                      <span className="text-slate-400 italic">
                        {isEn ? 'Matched by original column values' : 'تطابق با مقادیر اولیه ستون‌ها'}
                      </span>
                    )}
                  </div>
                </div>

                {mode === 'edit' && (
                  <div className="text-[11px] font-sans font-semibold">
                    {modifiedCount > 0 ? (
                      <span className="text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        {isEn ? `${modifiedCount} modified` : `${modifiedCount} ستون ویرایش‌شده`}
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        {isEn ? 'No changes yet' : 'بدون تغییر'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Error banner if submission failed */}
            {submitError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 space-y-0.5">
                  <p className="font-bold">{isEn ? 'Operation Failed' : 'خطا در اجرای عملیات'}</p>
                  <p className="font-mono text-[11px] leading-relaxed break-words">{submitError}</p>
                </div>
              </div>
            )}

            {/* DELETE CONFIRMATION SCREEN */}
            {mode === 'delete' ? (
              <div className="space-y-4 py-2">
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 ${
                    isLightMode ? 'bg-rose-50/50 border-rose-200' : 'bg-rose-950/20 border-rose-900/40'
                  }`}
                >
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 text-xs">
                    <h5 className="font-bold text-rose-400 text-sm">
                      {isEn ? 'Confirm Row Deletion' : 'تایید حذف قطعی سطر'}
                    </h5>
                    <p className="text-slate-300 leading-relaxed">
                      {isEn
                        ? `Are you sure you want to permanently delete this row from table "${schemaName}"."${tableName}"? This action runs within an isolated database transaction and strictly verifies that exactly 1 row is affected.`
                        : `آیا از حذف دائمی این سطر از جدول "${schemaName}"."${tableName}" اطمینان دارید؟ این عملیات درون یک تراکنش مجزای دیتابیس اجرا شده و به صورت سخت‌گیرانه بررسی می‌کند که دقیقاً ۱ سطر تحت تاثیر قرار گیرد.`}
                    </p>
                  </div>
                </div>

                {/* Target Row Summary */}
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div className="px-3.5 py-2 border-b text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>{isEn ? 'Row Snapshot to be Deleted' : 'پیش‌نمایش اطلاعات سطری که حذف خواهد شد'}</span>
                    <span className="font-mono text-[10px] lowercase">
                      {columns.length} {isEn ? 'columns' : 'ستون'}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-800/40 max-h-64 overflow-y-auto">
                    {columns.map((col) => {
                      const val = initialRow ? initialRow[col.name] : null;
                      const isNull = val === null || val === undefined;
                      const str = isNull ? 'NULL' : typeof val === 'object' ? JSON.stringify(val) : String(val);

                      return (
                        <div key={col.name} className="px-3.5 py-2 flex items-center justify-between gap-4 text-xs font-mono">
                          <div className="flex items-center gap-1.5 min-w-[140px] shrink-0">
                            {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-400" />}
                            <span className={col.isPrimaryKey ? 'font-bold text-amber-300' : 'text-slate-300'}>
                              {col.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-normal">({col.formattedType})</span>
                          </div>
                          <div className="truncate max-w-xs text-right">
                            {isNull ? (
                              <span className="text-slate-500 italic">NULL</span>
                            ) : (
                              <span className="text-slate-200">{str}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* INSERT / EDIT FORM */
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3.5">
                  {columns.map((col) => {
                    const st = colStates[col.name] || {
                      value: '',
                      mode: 'value',
                      isModified: false,
                      jsonError: null,
                    };

                    const lowerType = col.dataType.toLowerCase();
                    const isBool = lowerType.includes('bool');
                    const isJson = lowerType.includes('json');
                    const isNumeric = lowerType.includes('int') || lowerType.includes('numeric') || lowerType.includes('float') || lowerType.includes('double');
                    const isLongText = lowerType.includes('text') || isJson;

                    return (
                      <div
                        key={col.name}
                        className={`p-3 rounded-xl border transition ${
                          st.isModified
                            ? 'border-amber-500/40 bg-amber-500/5'
                            : isLightMode
                            ? 'bg-slate-50/70 border-slate-200'
                            : 'bg-slate-900/50 border-slate-800/80'
                        }`}
                      >
                        {/* Column Header & Metadata */}
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                          <div className="flex items-center gap-2">
                            {col.isPrimaryKey && (
                              <span title="Primary Key">
                                <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              </span>
                            )}
                            <span className={`text-xs font-mono font-bold ${col.isPrimaryKey ? 'text-amber-400' : isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                              {col.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/30 text-cyan-400 border border-cyan-500/20">
                              {col.formattedType}
                            </span>
                            {st.isModified && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {isEn ? 'Modified' : 'ویرایش‌شده'}
                              </span>
                            )}
                          </div>

                          {/* Mode Options: Value / NULL / DEFAULT */}
                          <div className="flex items-center gap-1 text-[11px] font-mono">
                            <button
                              type="button"
                              onClick={() => handleModeChange(col.name, 'value')}
                              className={`px-2 py-0.5 rounded transition ${
                                st.mode === 'value'
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {isEn ? 'Value' : 'مقدار'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleModeChange(col.name, 'null')}
                              className={`px-2 py-0.5 rounded transition ${
                                st.mode === 'null'
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              NULL
                            </button>
                            <button
                              type="button"
                              onClick={() => handleModeChange(col.name, 'default')}
                              className={`px-2 py-0.5 rounded transition ${
                                st.mode === 'default'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                              title={isEn ? 'Use PostgreSQL column DEFAULT' : 'استفاده از مقدار پیش‌فرض ستون'}
                            >
                              DEFAULT
                            </button>
                          </div>
                        </div>

                        {/* Input Field / Value Presentation */}
                        {st.mode === 'null' ? (
                          <div className="py-2 px-3 rounded-lg border border-dashed border-purple-500/30 bg-purple-500/5 text-purple-300 text-xs font-mono italic">
                            NULL — {isEn ? 'Column will be set to database NULL' : 'این ستون برابر با مقدار تهی (NULL) قرار خواهد گرفت'}
                          </div>
                        ) : st.mode === 'default' ? (
                          <div className="py-2 px-3 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-xs font-mono">
                            DEFAULT — {isEn ? 'PostgreSQL will auto-assign default value or sequence' : 'مقدار پیش‌فرض یا سکوئنس خودکار توسط دیتابیس اختصاص می‌یابد'}
                          </div>
                        ) : isBool ? (
                          <select
                            value={st.value}
                            onChange={(e) => handleValueChange(col.name, e.target.value, col.dataType)}
                            className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                              isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                            }`}
                          >
                            <option value="">{isEn ? '-- Select Boolean --' : '-- انتخاب وضعیت بولی --'}</option>
                            <option value="true">TRUE</option>
                            <option value="false">FALSE</option>
                          </select>
                        ) : isLongText ? (
                          <div className="space-y-1">
                            <textarea
                              rows={isJson ? 4 : 2}
                              value={st.value}
                              onChange={(e) => handleValueChange(col.name, e.target.value, col.dataType)}
                              placeholder={isJson ? '{\n  "key": "value"\n}' : isEn ? 'Enter text...' : 'متن را وارد کنید...'}
                              className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none resize-y ${
                                st.jsonError
                                  ? 'border-rose-500/60 bg-rose-500/5'
                                  : isLightMode
                                  ? 'bg-white border-slate-300 text-slate-900'
                                  : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}
                            />
                            {st.jsonError && (
                              <p className="text-[11px] text-rose-400 font-mono flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>{st.jsonError}</span>
                              </p>
                            )}
                          </div>
                        ) : (
                          <input
                            type={isNumeric ? 'number' : 'text'}
                            step={isNumeric ? 'any' : undefined}
                            value={st.value}
                            onChange={(e) => handleValueChange(col.name, e.target.value, col.dataType)}
                            placeholder={isEn ? `Enter ${col.formattedType}...` : `مقدار ${col.formattedType}...`}
                            className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${
                              isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-200'
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div
            className={`px-4 py-3 border-t shrink-0 flex items-center justify-between gap-3 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                {mode === 'delete'
                  ? isEn
                    ? 'Isolated transaction • 1-row safety abort'
                    : 'تراکنش ایزوله • توقف ایمن در عدم تطابق سطر'
                  : mode === 'edit'
                  ? isEn
                    ? 'Atomic UPDATE • Explicit row targeting'
                    : 'به‌روزرسانی اتمیک • هدف‌گیری صریح سطر'
                  : isEn
                  ? 'Parameterized INSERT • RETURNING validation'
                  : 'درج پارامتری ایمن • اعتبارسنجی خروجی'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                } disabled:opacity-50`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="submit"
                disabled={isSubmitting || (mode === 'edit' && modifiedCount === 0)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm ${
                  mode === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : mode === 'edit'
                    ? 'bg-amber-500 hover:bg-amber-600 text-black font-bold'
                    : 'bg-cyan-500 hover:bg-cyan-600 text-black font-bold'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Processing...' : 'در حال پردازش...'}</span>
                  </>
                ) : mode === 'delete' ? (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Confirm & Delete Row' : 'تایید و حذف دائمی سطر'}</span>
                  </>
                ) : mode === 'edit' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Save Changes' : 'ذخیره تغییرات'}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Insert Row' : 'درج سطر'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
