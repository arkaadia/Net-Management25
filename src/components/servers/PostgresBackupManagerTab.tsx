import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Archive,
  Download,
  Upload,
  RefreshCw,
  Plus,
  Trash2,
  Database,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  HardDrive,
  Copy,
  Check,
  X,
  Layers,
  Table as TableIcon,
  ShieldAlert,
  Terminal,
  Clock,
  Sparkles,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresBackupItem,
  PostgresCreateBackupRequest,
  PostgresRestoreBackupRequest,
  PostgresBackupMode,
  PostgresBackupFormat,
  PostgresDatabaseItem,
  PostgresSchemaItem,
} from '../../types';
import {
  fetchRemoteServerPostgresBackups,
  createRemoteServerPostgresBackup,
  restoreRemoteServerPostgresBackup,
  deleteRemoteServerPostgresBackup,
  fetchRemoteServerPostgresDatabases,
  fetchRemoteServerPostgresSchemas,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresBackupManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
}

export const PostgresBackupManagerTab: React.FC<PostgresBackupManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
}) => {
  // Backups list state
  const [backups, setBackups] = useState<PostgresBackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ en: string; fa?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'full' | 'schema_only' | 'data_only'>('all');

  // Databases catalog
  const [databases, setDatabases] = useState<PostgresDatabaseItem[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>(
    initialDatabase || server.postgres_database || 'postgres'
  );

  // Schemas available in selected database
  const [schemasList, setSchemasList] = useState<PostgresSchemaItem[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  // Create Backup Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDb, setCreateDb] = useState<string>(
    initialDatabase || server.postgres_database || 'postgres'
  );
  const [createMode, setCreateMode] = useState<PostgresBackupMode>('full');
  const [createFormat, setCreateFormat] = useState<PostgresBackupFormat>('plain');
  const [selectedSchemas, setSelectedSchemas] = useState<string[]>([]);
  const [includeDrop, setIncludeDrop] = useState(true);
  const [useInserts, setUseInserts] = useState(true);
  const [compressionLevel, setCompressionLevel] = useState<number>(0);
  const [customFilename, setCustomFilename] = useState('');
  const [creating, setCreating] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState<{ en: string; fa?: string } | null>(null);
  const [sqlDumpPreview, setSqlDumpPreview] = useState<string | null>(null);
  const [copiedPreview, setCopiedPreview] = useState(false);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreTargetBackup, setRestoreTargetBackup] = useState<PostgresBackupItem | null>(null);
  const [restoreTargetDb, setRestoreTargetDb] = useState<string>('');
  const [restoreCleanFirst, setRestoreCleanFirst] = useState(false);
  const [restoreSingleTx, setRestoreSingleTx] = useState(true);
  const [restoreExitOnError, setRestoreExitOnError] = useState(false);
  const [confirmDbNameInput, setConfirmDbNameInput] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    message: string;
    messageFa: string;
    outputLog?: string;
  } | null>(null);

  // Delete Backup Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetBackup, setDeleteTargetBackup] = useState<PostgresBackupItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch Databases
  const loadDatabases = useCallback(async () => {
    try {
      const res = await fetchRemoteServerPostgresDatabases(server.id);
      if (res.success && res.databases) {
        setDatabases(res.databases);
      }
    } catch {}
  }, [server.id]);

  // Fetch Schemas for Create Dialog
  const loadSchemasForDb = useCallback(
    async (dbName: string) => {
      setLoadingSchemas(true);
      try {
        const res = await fetchRemoteServerPostgresSchemas(server.id, { database: dbName });
        if (res.success && res.schemas) {
          setSchemasList(res.schemas);
        } else {
          setSchemasList([]);
        }
      } catch {
        setSchemasList([]);
      } finally {
        setLoadingSchemas(false);
      }
    },
    [server.id]
  );

  // Fetch Backups
  const loadBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerPostgresBackups(server.id);
      if (res.success && res.backups) {
        setBackups(res.backups);
      } else {
        setError({
          en: res.error || 'Failed to fetch backups',
          fa: res.errorFa || 'خطا در بارگذاری فهرست فایل‌های بکاپ',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Network error fetching backups',
        fa: 'خطای ارتباط با سرور در دریافت بکاپ‌ها',
      });
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadDatabases();
    loadBackups();
  }, [loadDatabases, loadBackups]);

  useEffect(() => {
    if (isCreateModalOpen && createDb) {
      loadSchemasForDb(createDb);
    }
  }, [isCreateModalOpen, createDb, loadSchemasForDb]);

  // Handle open create modal
  const openCreateModal = () => {
    setCreateDb(selectedDb || server.postgres_database || 'postgres');
    setCreateMode('full');
    setCreateFormat('plain');
    setSelectedSchemas([]);
    setIncludeDrop(true);
    setUseInserts(true);
    setCompressionLevel(0);
    setCustomFilename('');
    setCreateSuccessMsg(null);
    setSqlDumpPreview(null);
    setIsCreateModalOpen(true);
  };

  // Handle submit create backup
  const handleCreateBackup = async () => {
    if (!createDb) return;
    setCreating(true);
    setCreateSuccessMsg(null);
    setError(null);

    const payload: PostgresCreateBackupRequest = {
      database: createDb,
      mode: createMode,
      format: createFormat,
      schemas: selectedSchemas.length > 0 ? selectedSchemas : undefined,
      includeDrop,
      useInserts,
      compressionLevel,
      customFilename: customFilename.trim() ? customFilename.trim() : undefined,
    };

    try {
      const res = await createRemoteServerPostgresBackup(server.id, payload);
      if (res.success && res.backup) {
        setCreateSuccessMsg({
          en: res.message,
          fa: res.messageFa,
        });
        if (res.sqlDumpPreview) {
          setSqlDumpPreview(res.sqlDumpPreview);
        }
        await loadBackups();
      } else {
        setError({
          en: res.error || res.message,
          fa: res.errorFa || res.messageFa,
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Failed to create backup',
        fa: 'خطا در ایجاد نسخه پشتیبان',
      });
    } finally {
      setCreating(false);
    }
  };

  // Handle open restore modal
  const openRestoreModal = (backup: PostgresBackupItem) => {
    setRestoreTargetBackup(backup);
    setRestoreTargetDb(backup.database || server.postgres_database || 'postgres');
    setRestoreCleanFirst(false);
    setRestoreSingleTx(true);
    setRestoreExitOnError(false);
    setConfirmDbNameInput('');
    setRestoreResult(null);
    setIsRestoreModalOpen(true);
  };

  // Handle submit restore
  const handleRestoreBackup = async () => {
    if (!restoreTargetBackup || !restoreTargetDb) return;
    if (confirmDbNameInput.trim() !== restoreTargetDb.trim()) return;

    setRestoring(true);
    setRestoreResult(null);

    const payload: PostgresRestoreBackupRequest = {
      database: restoreTargetDb,
      filename: restoreTargetBackup.filename,
      cleanFirst: restoreCleanFirst,
      singleTransaction: restoreSingleTx,
      exitOnError: restoreExitOnError,
    };

    try {
      const res = await restoreRemoteServerPostgresBackup(server.id, payload);
      setRestoreResult({
        success: res.success,
        message: res.message,
        messageFa: res.messageFa,
        outputLog: res.outputLog,
      });
    } catch (err: any) {
      setRestoreResult({
        success: false,
        message: err.message || 'Restore failed',
        messageFa: 'خطا در عملیات بازیابی',
      });
    } finally {
      setRestoring(false);
    }
  };

  // Handle open delete modal
  const openDeleteModal = (backup: PostgresBackupItem) => {
    setDeleteTargetBackup(backup);
    setIsDeleteModalOpen(true);
  };

  // Handle submit delete
  const handleDeleteBackup = async () => {
    if (!deleteTargetBackup) return;
    setDeleting(true);
    try {
      const res = await deleteRemoteServerPostgresBackup(server.id, deleteTargetBackup.filename);
      if (res.success) {
        setIsDeleteModalOpen(false);
        setDeleteTargetBackup(null);
        await loadBackups();
      } else {
        setError({
          en: res.error || res.message,
          fa: res.messageFa,
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Failed to delete backup',
        fa: 'خطا در حذف فایل پشتیبان',
      });
    } finally {
      setDeleting(false);
    }
  };

  // Filtered Backups
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        b.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.database.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMode = filterMode === 'all' || b.mode === filterMode;
      return matchesSearch && matchesMode;
    });
  }, [backups, searchQuery, filterMode]);

  // Aggregate size of backups
  const totalSizeBytes = useMemo(() => {
    return backups.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
  }, [backups]);

  const totalSizePretty = useMemo(() => {
    if (totalSizeBytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(totalSizeBytes) / Math.log(1024));
    return `${(totalSizeBytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }, [totalSizeBytes]);

  const copySqlPreview = () => {
    if (!sqlDumpPreview) return;
    navigator.clipboard.writeText(sqlDumpPreview);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Control Bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
          isLightMode
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/70 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isLightMode
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            }`}
          >
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`text-sm font-bold ${
                  isLightMode ? 'text-slate-900' : 'text-slate-100'
                }`}
              >
                {isEn
                  ? 'PostgreSQL Backup & Restore Management'
                  : 'مدیریت نسخه پشتیبان و بازیابی (Backup & Restore)'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                Phase 13
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Create logical SQL dumps, schema exports, or native binary archives with zero data loss.'
                : 'ایجاد دانپ منطقی SQL، خروجی ساختار اسکیما و بایگانی‌های باینری فشرده با امنیت و حفظ سلامت داده‌ها.'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
          <button
            type="button"
            disabled={loading}
            onClick={loadBackups}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
              isLightMode
                ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'New Backup / Dump' : 'ایجاد نسخه پشتیبان جدید'}</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            isLightMode
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{isEn ? error.en : error.fa || error.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-amber-400 hover:text-amber-300 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Archive className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">
              {isEn ? 'Total Backup Files' : 'تعداد کل فایل‌های بکاپ'}
            </div>
            <div className="text-base font-bold font-mono text-slate-200">
              {backups.length}
            </div>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <HardDrive className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">
              {isEn ? 'Total Backup Storage' : 'حجم اشغال‌شده توسط بکاپ‌ها'}
            </div>
            <div className="text-base font-bold font-mono text-emerald-400 tabular-nums">
              {totalSizePretty}
            </div>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">
              {isEn ? 'Latest Backup' : 'آخرین نسخه پشتیبان'}
            </div>
            <div className="text-xs font-mono font-semibold text-slate-300">
              {backups[0] ? new Date(backups[0].createdAt).toLocaleString() : isEn ? 'Never' : 'تاکنون ایجاد نشده'}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn ? 'Search backups by filename or database...' : 'جستجو در نام فایل یا پایگاه داده...'
            }
            className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-mono border focus:outline-hidden transition ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-blue-500'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Mode Filter Tabs */}
        <div
          className={`flex items-center p-1 rounded-xl border ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          {(
            [
              { id: 'all', label: isEn ? 'All Backups' : 'همه' },
              { id: 'full', label: isEn ? 'Full (DDL+Data)' : 'کامل' },
              { id: 'schema_only', label: isEn ? 'Schema Only' : 'اسکیما' },
              { id: 'data_only', label: isEn ? 'Data Only' : 'داده‌ها' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                filterMode === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Backups Inventory Table */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/40 border-slate-800'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left" dir="ltr">
            <thead
              className={`text-[11px] font-mono uppercase tracking-wider border-b select-none ${
                isLightMode
                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              <tr>
                <th className="py-2.5 px-3">{isEn ? 'Backup File & Target' : 'نام فایل و دیتابیس'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Size' : 'حجم'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Mode' : 'نوع'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Format' : 'فرمت'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Engine' : 'موتور'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Created At' : 'تاریخ ساخت'}</th>
                <th className="py-2.5 px-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading && backups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                      <span>{isEn ? 'Loading backups...' : 'در حال بارگذاری نسخه‌های پشتیبان...'}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBackups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <Archive className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="font-semibold text-slate-400">
                        {isEn ? 'No backup files found' : 'هیچ نسخه پشتیبانی یافت نشد'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {isEn
                          ? 'Generate a new backup to safely archive your PostgreSQL databases.'
                          : 'یک نسخه پشتیبان جدید ایجاد نمایید تا پایگاه‌های داده سرور خود را ایمن‌سازی کنید.'}
                      </p>
                      <button
                        type="button"
                        onClick={openCreateModal}
                        className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 transition cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Create First Backup' : 'ایجاد اولین بکاپ'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBackups.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors font-mono ${
                      isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Filename & Database */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-200">{item.filename}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Database className="w-3 h-3 text-cyan-400" />
                            <span>{item.database}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Size */}
                    <td className="py-2.5 px-3 font-bold text-emerald-400 tabular-nums">
                      {item.sizePretty}
                    </td>

                    {/* Mode */}
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          item.mode === 'full'
                            ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                            : item.mode === 'schema_only'
                            ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {item.mode}
                      </span>
                    </td>

                    {/* Format */}
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                        {item.format}
                      </span>
                    </td>

                    {/* Engine */}
                    <td className="py-2.5 px-3 text-[11px]">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          item.engineUsed === 'native_pg_dump'
                            ? 'text-cyan-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {item.engineUsed === 'native_pg_dump' ? 'Native pg_dump' : 'Logical SQL'}
                      </span>
                    </td>

                    {/* Created At */}
                    <td className="py-2.5 px-3 text-[11px] text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Download button */}
                        <a
                          href={item.downloadUrl || `/api/remote-servers/${server.id}/postgres/backups/${encodeURIComponent(item.filename)}/download`}
                          download={item.filename}
                          className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                          title={isEn ? 'Download backup file' : 'دانلود فایل بکاپ'}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        {/* Restore button */}
                        <button
                          type="button"
                          onClick={() => openRestoreModal(item)}
                          className="p-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer"
                          title={isEn ? 'Restore into database' : 'بازیابی در دیتابیس'}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => openDeleteModal(item)}
                          className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                          title={isEn ? 'Delete backup file' : 'حذف فایل بکاپ'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE BACKUP MODAL */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !creating && setIsCreateModalOpen(false)}
        >
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl p-5 space-y-4 my-8 transition-all ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
            }`}
            onClick={(e) => e.stopPropagation()}
            dir={isEn ? 'ltr' : 'rtl'}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Create PostgreSQL Backup' : 'ایجاد نسخه پشتیبان از پایگاه داده'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEn
                      ? 'Configure database dump scope, output format, compression, and options'
                      : 'تنظیم دامنه دانپ، فرمت فایل، سطح فشرده‌سازی و گزینه‌های پیشرفته'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Success Message Banner */}
            {createSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{isEn ? createSuccessMsg.en : createSuccessMsg.fa || createSuccessMsg.en}</span>
              </div>
            )}

            {/* Modal Body */}
            <div className="space-y-4 text-xs">
              {/* Database selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>{isEn ? 'Target Database' : 'پایگاه داده هدف'}</span>
                    <FieldInfoTooltip
                      title={isEn ? 'Database Selection' : 'انتخاب پایگاه داده'}
                      whatIsIt={
                        isEn
                          ? 'The specific PostgreSQL database from which tables, schemas, and records will be dumped.'
                          : 'دیتابیس مشخصی که اسکیماها، ساختار جداول و داده‌های آن برای ایجاد نسخه پشتیبان استخراج می‌شوند.'
                      }
                      whyNeeded={
                        isEn
                          ? 'PostgreSQL logical backups are scoped to a specific database.'
                          : 'دانپ منطقی در پستگرس‌اس‌کیوال در سطح یک دیتابیس مشخص انجام می‌گیرد.'
                      }
                      practicalExample="postgres, app_db, production_db"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </label>
                </div>
                <select
                  value={createDb}
                  onChange={(e) => setCreateDb(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                >
                  {databases.map((db) => (
                    <option key={db.oid} value={db.name}>
                      {db.name} ({db.sizePretty || (db as any).sizeFormatted || ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode & Format Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Mode */}
                <div>
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                    <span>{isEn ? 'Dump Mode' : 'حالت پشتیبان‌گیری'}</span>
                    <FieldInfoTooltip
                      title={isEn ? 'Backup Mode' : 'حالت بکاپ'}
                      whatIsIt={
                        isEn
                          ? 'Determines whether DDL structure, data rows, or both will be included.'
                          : 'تعیین می‌کند که آیا ساختار جداول (DDL)، فقط رکوردها (Data) یا هر دو در فایل قرار گیرند.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Useful for schema-only migrations or exporting data rows without affecting schema definitions.'
                          : 'برای انتقال صرف ساختار بدون داده یا خروجی گرفتن از رکوردها بسیار کاربردی است.'
                      }
                      practicalExample="Full (DDL + Data), Schema Only, Data Only"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </label>
                  <select
                    value={createMode}
                    onChange={(e) => setCreateMode(e.target.value as PostgresBackupMode)}
                    className={`w-full px-3 py-2 rounded-xl border ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  >
                    <option value="full">
                      {isEn ? 'Full (Schema DDL + Data Rows)' : 'کامل (ساختار اسکیما + رکوردها)'}
                    </option>
                    <option value="schema_only">
                      {isEn ? 'Schema Only (DDL structures)' : 'فقط اسکیما (بدون رکوردها)'}
                    </option>
                    <option value="data_only">
                      {isEn ? 'Data Only (INSERT rows)' : 'فقط داده‌ها (دستورات INSERT)'}
                    </option>
                  </select>
                </div>

                {/* Format */}
                <div>
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                    <span>{isEn ? 'Output Format' : 'فرمت خروجی'}</span>
                    <FieldInfoTooltip
                      title={isEn ? 'Output Format' : 'فرمت فایل دانپ'}
                      whatIsIt={
                        isEn
                          ? 'Plain SQL script (.sql) or pg_dump custom archive (.dump).'
                          : 'اسکریپت متنی استاندارد SQL یا فایل باینری فشرده کاتالوگ pg_dump.'
                      }
                      whyNeeded={
                        isEn
                          ? 'Plain SQL is human-readable and universal; Custom format is faster and supports selective pg_restore.'
                          : 'فرمت Plain متنی و همه‌جا قابل خواندن است؛ فرمت Custom سریع‌تر بوده و با pg_restore قابلیت انتخاب دارد.'
                      }
                      practicalExample="Plain SQL, Custom Archive"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </label>
                  <select
                    value={createFormat}
                    onChange={(e) => setCreateFormat(e.target.value as PostgresBackupFormat)}
                    className={`w-full px-3 py-2 rounded-xl border ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  >
                    <option value="plain">{isEn ? 'Plain SQL Script (.sql)' : 'اسکریپت متنی SQL (.sql)'}</option>
                    <option value="custom">{isEn ? 'Custom Binary Archive (.dump)' : 'بایگانی باینری Custom (.dump)'}</option>
                    <option value="tar">{isEn ? 'Tar Archive (.tar)' : 'بایگانی Tar (.tar)'}</option>
                  </select>
                </div>
              </div>

              {/* Compression & Custom Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                    <span>{isEn ? 'Compression Level' : 'سطح فشرده‌سازی (Gzip)'}</span>
                  </label>
                  <select
                    value={compressionLevel}
                    onChange={(e) => setCompressionLevel(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  >
                    <option value={0}>{isEn ? '0 - No Compression (Raw .sql)' : '۰ - بدون فشرده‌سازی (.sql)'}</option>
                    <option value={1}>{isEn ? '1 - Fastest (Low compression)' : '۱ - بیشترین سرعت'}</option>
                    <option value={6}>{isEn ? '6 - Balanced (Recommended)' : '۶ - متعادل (پیش‌نهادی)'}</option>
                    <option value={9}>{isEn ? '9 - Maximum Compression (.sql.gz)' : '۹ - حداکثر فشرده‌سازی'}</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                    <span>{isEn ? 'Custom Filename (Optional)' : 'نام فایل اختصاصی (اختیاری)'}</span>
                  </label>
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder={`${createDb}_backup.sql`}
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-950 border-slate-700 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 space-y-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeDrop}
                    onChange={(e) => setIncludeDrop(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">
                      {isEn ? 'Include DROP ... IF EXISTS Statements' : 'افزودن دستورات DROP ... IF EXISTS'}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {isEn
                        ? 'Ensures clean recreation by dropping objects before re-creating them.'
                        : 'با حذف اشیاء پیش از ایجاد مجدد، امکان بازنویسی تمیز را فراهم می‌سازد.'}
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useInserts}
                    onChange={(e) => setUseInserts(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">
                      {isEn ? 'Use INSERT INTO Commands' : 'استفاده از دستورات INSERT INTO'}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {isEn
                        ? 'Generates portable standard SQL INSERT statements instead of COPY.'
                        : 'تولید دستورات استاندارد و سازگار INSERT به جای متد COPY.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* Schemas checklist (Optional filter) */}
              {schemasList.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-slate-300">
                      {isEn ? 'Filter by Schema (Optional)' : 'فیلتر بر اساس اسکیماها (اختیاری)'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {selectedSchemas.length === 0
                        ? isEn
                          ? 'All Schemas'
                          : 'تمام اسکیماها'
                        : `${selectedSchemas.length} ${isEn ? 'selected' : 'انتخاب شده'}`}
                    </span>
                  </div>
                  <div className="max-h-28 overflow-y-auto p-2 rounded-xl border border-slate-800 bg-slate-950/60 space-y-1">
                    {schemasList.map((s) => {
                      const isChecked = selectedSchemas.includes(s.name);
                      return (
                        <label
                          key={s.name}
                          className="flex items-center gap-2 text-[11px] text-slate-300 hover:text-white cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSchemas([...selectedSchemas, s.name]);
                              } else {
                                setSelectedSchemas(selectedSchemas.filter((x) => x !== s.name));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                          />
                          <span className="font-mono">{s.name}</span>
                          <span className="text-slate-500 font-mono text-[10px]">
                            ({s.tableCount} tables, {s.sizePretty})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SQL Dump Preview if available */}
              {sqlDumpPreview && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-blue-400" />
                      <span>{isEn ? 'SQL Dump Preview (Initial lines)' : 'پیش‌نمایش خروجی SQL'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={copySqlPreview}
                      className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedPreview ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPreview ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-black/60 border border-slate-800 text-[11px] font-mono text-emerald-400 max-h-36 overflow-y-auto select-all" dir="ltr">
                    {sqlDumpPreview}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                disabled={creating}
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>

              <button
                type="button"
                disabled={creating}
                onClick={handleCreateBackup}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{creating ? (isEn ? 'Creating Dump...' : 'در حال دانپ...') : (isEn ? 'Execute Backup' : 'اجرای پشتیبان‌گیری')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE BACKUP MODAL */}
      {isRestoreModalOpen && restoreTargetBackup && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !restoring && setIsRestoreModalOpen(false)}
        >
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-2xl p-5 space-y-4 my-8 transition-all ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
            }`}
            onClick={(e) => e.stopPropagation()}
            dir={isEn ? 'ltr' : 'rtl'}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Restore PostgreSQL Backup' : 'بازیابی نسخه پشتیبان پایگاه داده'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEn ? 'Import and apply SQL dump statements into target database' : 'اعمال و بازیابی فایل دانپ در پایگاه داده انتخابی'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={restoring}
                onClick={() => setIsRestoreModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning Banner */}
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  {isEn ? 'Data Overwrite Warning' : 'هشدار بازنویسی و تغییر ساختار'}
                </span>
                <p className="text-[11px] text-amber-300/90 mt-0.5">
                  {isEn
                    ? 'Restoring will execute SQL statements directly on the target database. Existing records may be overwritten or modified.'
                    : 'فرآیند بازیابی دستورات SQL را مستقیماً بر روی دیتابیس اجرا می‌کند. ممکن است رکوردهای جاری بازنویسی شوند.'}
                </p>
              </div>
            </div>

            {/* Restore Result Banner */}
            {restoreResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  restoreResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {restoreResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  <span>{isEn ? restoreResult.message : restoreResult.messageFa}</span>
                </div>
                {restoreResult.outputLog && (
                  <pre className="p-2 rounded-lg bg-black/50 text-[10px] font-mono max-h-24 overflow-y-auto text-slate-300">
                    {restoreResult.outputLog}
                  </pre>
                )}
              </div>
            )}

            {/* Form */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  {isEn ? 'Source Backup File' : 'فایل نسخه پشتیبان مبدا'}
                </label>
                <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 font-mono text-cyan-400 text-xs flex items-center justify-between">
                  <span>{restoreTargetBackup.filename}</span>
                  <span className="text-slate-400 font-bold">{restoreTargetBackup.sizePretty}</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  {isEn ? 'Destination Database' : 'پایگاه داده مقصد جهت بازیابی'}
                </label>
                <select
                  value={restoreTargetDb}
                  onChange={(e) => setRestoreTargetDb(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                >
                  {databases.map((db) => (
                    <option key={db.oid} value={db.name}>
                      {db.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggles */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={restoreSingleTx}
                    onChange={(e) => setRestoreSingleTx(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    {isEn ? 'Wrap in single transaction (BEGIN ... COMMIT)' : 'اجرا در قالب یک تراکنش واحد (Transactional Rollback)'}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={restoreCleanFirst}
                    onChange={(e) => setRestoreCleanFirst(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    {isEn ? 'Clean objects first (--clean / DROP IF EXISTS)' : 'پاکسازی اولیه اشیاء موجود (--clean)'}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={restoreExitOnError}
                    onChange={(e) => setRestoreExitOnError(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <span className="text-slate-300">
                    {isEn ? 'Halt and rollback on first statement error' : 'توقف و لغو تراکنش در اولین خطای دستوری'}
                  </span>
                </label>
              </div>

              {/* Confirmation Input */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  {isEn
                    ? `Type destination database name "${restoreTargetDb}" to confirm:`
                    : `جهت تایید نام دیتابیس مقصد "${restoreTargetDb}" را تایپ کنید:`}
                </label>
                <input
                  type="text"
                  value={confirmDbNameInput}
                  onChange={(e) => setConfirmDbNameInput(e.target.value)}
                  placeholder={restoreTargetDb}
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setIsRestoreModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                disabled={restoring || confirmDbNameInput.trim() !== restoreTargetDb.trim()}
                onClick={handleRestoreBackup}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {restoring ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{restoring ? (isEn ? 'Restoring...' : 'در حال بازیابی...') : (isEn ? 'Start Restore' : 'شروع بازیابی')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && deleteTargetBackup && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !deleting && setIsDeleteModalOpen(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl p-5 space-y-4 transition-all ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
            }`}
            onClick={(e) => e.stopPropagation()}
            dir={isEn ? 'ltr' : 'rtl'}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  {isEn ? 'Delete Backup File' : 'حذف فایل نسخه پشتیبان'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isEn
                    ? 'Are you sure you want to permanently delete this backup?'
                    : 'آیا از حذف دائمی این فایل نسخه پشتیبان اطمینان دارید؟'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 font-mono text-xs space-y-1">
              <div className="text-slate-200 font-bold">{deleteTargetBackup.filename}</div>
              <div className="text-slate-400 text-[11px]">
                {deleteTargetBackup.database} ({deleteTargetBackup.sizePretty})
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteBackup}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEn ? 'Delete Permanently' : 'حذف قطعی فایل'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
