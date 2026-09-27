import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Download,
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
  Play,
  RotateCcw,
  FileText,
  Eye,
  Settings,
  Users,
  Maximize2,
  Minimize2,
  Minus,
  Sliders,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresBackupItem,
  PostgresBackupCategory,
  PostgresBackupMode,
  PostgresConfigBackupType,
  PostgresBackupFormat,
  PostgresCreateBackupRequest,
  PostgresRestoreBackupRequest,
  PostgresValidateRestoreResult,
  PostgresBackupPreviewResult,
  PostgresDatabaseItem,
  PostgresSchemaItem,
} from '../../types';
import {
  fetchRemoteServerPostgresBackups,
  createRemoteServerPostgresBackup,
  restoreRemoteServerPostgresBackup,
  validateRemoteServerPostgresRestore,
  previewRemoteServerPostgresBackup,
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

  // Dual Category Switcher (All / Database / Configuration)
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'database' | 'configuration'>('all');
  const [filterMode, setFilterMode] = useState<string>('all');

  // Databases catalog
  const [databases, setDatabases] = useState<PostgresDatabaseItem[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>(
    initialDatabase || server.postgres_database || 'postgres'
  );

  // Schemas available in selected database
  const [schemasList, setSchemasList] = useState<PostgresSchemaItem[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  // CREATE BACKUP MODAL STATE
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<PostgresBackupCategory>('database');
  const [createDb, setCreateDb] = useState<string>(
    initialDatabase || server.postgres_database || 'postgres'
  );
  const [createMode, setCreateMode] = useState<PostgresBackupMode>('full');
  const [createConfigType, setCreateConfigType] = useState<PostgresConfigBackupType>('postgresql_conf');
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

  // RESTORE MODAL STATE (Safety-Gated Workflow)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreTargetBackup, setRestoreTargetBackup] = useState<PostgresBackupItem | null>(null);
  const [restoreTargetDb, setRestoreTargetDb] = useState<string>('');
  const [restoreCleanFirst, setRestoreCleanFirst] = useState(false);
  const [restoreSingleTx, setRestoreSingleTx] = useState(true);
  const [restoreExitOnError, setRestoreExitOnError] = useState(false);
  const [confirmDbNameInput, setConfirmDbNameInput] = useState('');
  const [hasConfirmedOverwrite, setHasConfirmedOverwrite] = useState(false);
  const [isValidatingRestore, setIsValidatingRestore] = useState(false);
  const [restoreValidation, setRestoreValidation] = useState<PostgresValidateRestoreResult | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    message: string;
    messageFa: string;
    outputLog?: string;
  } | null>(null);

  // PREVIEW / INSPECT MODAL STATE
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<PostgresBackupItem | null>(null);
  const [previewData, setPreviewData] = useState<PostgresBackupPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // DELETE MODAL STATE
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
    if (isCreateModalOpen && createCategory === 'database' && createDb) {
      loadSchemasForDb(createDb);
    }
  }, [isCreateModalOpen, createCategory, createDb, loadSchemasForDb]);

  // Handle open create modal
  const openCreateModal = () => {
    setCreateCategory('database');
    setCreateDb(selectedDb || server.postgres_database || 'postgres');
    setCreateMode('full');
    setCreateConfigType('postgresql_conf');
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
    setCreating(true);
    setCreateSuccessMsg(null);
    setError(null);

    const payload: PostgresCreateBackupRequest = {
      category: createCategory,
      database: createCategory === 'database' ? createDb : (server.postgres_database || 'postgres'),
      mode: createCategory === 'database' ? createMode : undefined,
      configType: createCategory === 'configuration' ? createConfigType : undefined,
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

  // Handle open restore modal with validation
  const openRestoreModal = async (backup: PostgresBackupItem) => {
    setRestoreTargetBackup(backup);
    const targetDb = backup.database || server.postgres_database || 'postgres';
    setRestoreTargetDb(targetDb);
    setRestoreCleanFirst(false);
    setRestoreSingleTx(true);
    setRestoreExitOnError(false);
    setConfirmDbNameInput('');
    setHasConfirmedOverwrite(false);
    setRestoreResult(null);
    setIsRestoreModalOpen(true);

    // Run validation immediately
    setIsValidatingRestore(true);
    setRestoreValidation(null);
    try {
      const valRes = await validateRemoteServerPostgresRestore(server.id, {
        filename: backup.filename,
        targetDatabase: targetDb,
      });
      setRestoreValidation(valRes);
    } catch (valErr: any) {
      console.warn('Restore validation error:', valErr.message);
    } finally {
      setIsValidatingRestore(false);
    }
  };

  // Handle target DB change in restore dialog -> re-validate
  const handleRestoreDbChange = async (newDb: string) => {
    setRestoreTargetDb(newDb);
    setConfirmDbNameInput('');
    setHasConfirmedOverwrite(false);
    if (!restoreTargetBackup) return;

    setIsValidatingRestore(true);
    try {
      const valRes = await validateRemoteServerPostgresRestore(server.id, {
        filename: restoreTargetBackup.filename,
        targetDatabase: newDb,
      });
      setRestoreValidation(valRes);
    } catch {} finally {
      setIsValidatingRestore(false);
    }
  };

  // Handle submit restore
  const handleRestoreBackup = async () => {
    if (!restoreTargetBackup || !restoreTargetDb) return;
    if (confirmDbNameInput.trim() !== restoreTargetDb.trim()) return;

    // Strict validation safety: if target has existing tables, require checkbox
    if (restoreValidation?.targetHasExistingData && !hasConfirmedOverwrite) {
      return;
    }

    setRestoring(true);
    setRestoreResult(null);

    const payload: PostgresRestoreBackupRequest = {
      database: restoreTargetDb,
      filename: restoreTargetBackup.filename,
      category: restoreTargetBackup.category,
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

  // Handle open preview / inspect modal
  const openPreviewModal = async (backup: PostgresBackupItem) => {
    setPreviewBackup(backup);
    setIsPreviewModalOpen(true);
    setLoadingPreview(true);
    setCopiedCode(false);
    try {
      const res = await previewRemoteServerPostgresBackup(server.id, backup.filename);
      setPreviewData(res);
    } catch (err: any) {
      setPreviewData({
        success: false,
        filename: backup.filename,
        content: '',
        totalLines: 0,
        isTruncated: false,
        sizeBytes: backup.sizeBytes,
        category: backup.category,
        format: backup.format,
        error: err.message,
      });
    } finally {
      setLoadingPreview(false);
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
      // 1. Search Query
      const matchesSearch =
        searchQuery.trim() === '' ||
        b.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.database && b.database.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (b.configType && b.configType.toLowerCase().includes(searchQuery.toLowerCase()));

      // 2. Category Filter
      const matchesCategory =
        selectedCategory === 'all' || b.category === selectedCategory;

      // 3. Sub-Mode Filter
      let matchesMode = true;
      if (filterMode !== 'all') {
        if (b.category === 'database') {
          matchesMode = b.mode === filterMode;
        } else if (b.category === 'configuration') {
          matchesMode = b.configType === filterMode;
        }
      }

      return matchesSearch && matchesCategory && matchesMode;
    });
  }, [backups, searchQuery, selectedCategory, filterMode]);

  // Aggregate stats
  const dbBackupsCount = useMemo(() => backups.filter((b) => b.category === 'database').length, [backups]);
  const configBackupsCount = useMemo(() => backups.filter((b) => b.category === 'configuration').length, [backups]);

  const totalSizeBytes = useMemo(() => {
    return backups.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
  }, [backups]);

  const totalSizePretty = useMemo(() => {
    if (totalSizeBytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(totalSizeBytes) / Math.log(1024));
    return `${(totalSizeBytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }, [totalSizeBytes]);

  const latestBackupDate = useMemo(() => {
    if (backups.length === 0) return null;
    const sorted = [...backups].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted[0]?.createdAt;
  }, [backups]);

  const copySqlPreview = () => {
    if (!sqlDumpPreview) return;
    navigator.clipboard.writeText(sqlDumpPreview);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  const copyPreviewCode = () => {
    if (!previewData?.content) return;
    navigator.clipboard.writeText(previewData.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
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
                Phase 17
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Comprehensive database dumps (Full / Schema / Data) and server configuration backups (postgresql.conf / pg_hba / Roles) with zero-loss safety verification.'
                : 'پشتیبان‌گیری جامع دیتابیس (کامل، ساختار، رکوردها) و فایل‌های کانفیگ سرور (postgresql.conf، pg_hba و رول‌ها) با اعتبارسنجی قطعی پیش از بازیابی.'}
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
            <span>{isEn ? 'Create Backup' : 'ایجاد نسخه پشتیبان'}</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* Card 1: Total Backups */}
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
            <Archive className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Total Stored Backups' : 'کل نسخه‌های پشتیبان'}</div>
            <div className="text-base font-bold text-slate-100 font-mono mt-0.5">
              {backups.length}{' '}
              <span className="text-xs font-normal text-slate-400">({totalSizePretty})</span>
            </div>
          </div>
        </div>

        {/* Card 2: Database Dumps */}
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Database Backups' : 'پشتیبان‌های دیتابیس'}</div>
            <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
              {dbBackupsCount}{' '}
              <span className="text-[11px] font-normal text-slate-400">
                {isEn ? 'dumps' : 'فایل دانپ'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Configuration Snapshots */}
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Configuration Snapshots' : 'پشتیبان‌های پیکربندی'}</div>
            <div className="text-base font-bold text-purple-400 font-mono mt-0.5">
              {configBackupsCount}{' '}
              <span className="text-[11px] font-normal text-slate-400">
                {isEn ? 'conf/roles' : 'تنظیمات/رول'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Latest Backup Time */}
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Latest Activity' : 'آخرین نسخه پشتیبان'}</div>
            <div className="text-xs font-bold text-slate-200 font-mono mt-0.5 truncate max-w-[130px]">
              {latestBackupDate
                ? new Date(latestBackupDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date(latestBackupDate).toLocaleDateString() + ')'
                : isEn ? 'No Backups' : 'بدون نسخه'}
            </div>
          </div>
        </div>
      </div>

      {/* Category Pills & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category switcher */}
        <div
          className={`p-1 rounded-xl border flex items-center gap-1 self-start ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setFilterMode('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : isLightMode
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>{isEn ? 'All Backups' : 'همه نسخه‌ها'}</span>
            <span className="text-[10px] opacity-75 font-mono">({backups.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedCategory('database');
              setFilterMode('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'database'
                ? 'bg-emerald-600 text-white shadow-xs'
                : isLightMode
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{isEn ? 'Database Backups' : 'پشتیبان پایگاه داده'}</span>
            <span className="text-[10px] opacity-75 font-mono">({dbBackupsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedCategory('configuration');
              setFilterMode('all');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              selectedCategory === 'configuration'
                ? 'bg-purple-600 text-white shadow-xs'
                : isLightMode
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{isEn ? 'Configuration Backups' : 'پشتیبان تنظیمات'}</span>
            <span className="text-[10px] opacity-75 font-mono">({configBackupsCount})</span>
          </button>
        </div>

        {/* Sub-Filters and Search */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedCategory === 'database' && (
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <option value="all">{isEn ? 'All Dumps' : 'همه نوع دانپ‌ها'}</option>
              <option value="full">{isEn ? 'Full Dumps' : 'دانپ کامل (Full)'}</option>
              <option value="schema_only">{isEn ? 'Schema Only (DDL)' : 'صرفاً اسکیما (DDL)'}</option>
              <option value="data_only">{isEn ? 'Data Only (INSERTs)' : 'صرفاً داده‌ها (INSERTs)'}</option>
            </select>
          )}

          {selectedCategory === 'configuration' && (
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <option value="all">{isEn ? 'All Config Backups' : 'همه پشتیبان‌های کانفیگ'}</option>
              <option value="postgresql_conf">postgresql.conf</option>
              <option value="pg_hba">pg_hba.conf</option>
              <option value="cluster_roles">{isEn ? 'Cluster Roles' : 'رول‌های سرور'}</option>
            </select>
          )}

          {/* Search Bar */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search backups...' : 'جستجو در نسخه‌ها...'}
              className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs font-mono ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'
                  : 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Backups List Table */}
      <div
        className={`rounded-2xl border overflow-hidden transition-all ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr
                className={`border-b font-semibold ${
                  isLightMode
                    ? 'bg-slate-50/80 border-slate-200 text-slate-600'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <th className="py-3 px-4">{isEn ? 'Backup File & Target' : 'نام فایل و هدف'}</th>
                <th className="py-3 px-3">{isEn ? 'Category & Type' : 'دسته‌بندی و نوع'}</th>
                <th className="py-3 px-3">{isEn ? 'Size' : 'حجم فایل'}</th>
                <th className="py-3 px-3">{isEn ? 'Created At' : 'تاریخ ایجاد'}</th>
                <th className="py-3 px-3">{isEn ? 'Engine' : 'موتور ایجاد'}</th>
                <th className="py-3 px-4 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                      <span>{isEn ? 'Loading stored backups...' : 'در حال بارگذاری نسخه‌های پشتیبان...'}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredBackups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Archive className="w-8 h-8 text-slate-600 stroke-[1.5]" />
                      <span className="font-semibold">
                        {isEn ? 'No backups found' : 'هیچ نسخه پشتیبانی یافت نشد'}
                      </span>
                      <p className="text-[11px] text-slate-500 max-w-sm">
                        {isEn
                          ? 'Click "Create Backup" above to export your database or server configuration.'
                          : 'جهت ایجاد نسخه پشتیبان از دیتابیس یا فایل‌های پیکربندی سرور، از دکمه "ایجاد نسخه پشتیبان" استفاده فرمایید.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBackups.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isLightMode
                        ? 'hover:bg-slate-50/80 text-slate-800'
                        : 'hover:bg-slate-800/40 text-slate-200'
                    }`}
                  >
                    {/* Filename & Target */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            item.category === 'configuration'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {item.category === 'configuration' ? (
                            <FileCode className="w-3.5 h-3.5" />
                          ) : (
                            <Database className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div>
                          <div className="font-mono font-bold text-xs flex items-center gap-1.5">
                            <span className="truncate max-w-[220px] sm:max-w-xs">{item.filename}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                            <span>{item.database || 'postgres'}</span>
                            {item.tablesCount !== undefined && item.tablesCount > 0 && (
                              <span className="text-[10px] text-slate-500">
                                • {item.tablesCount} {isEn ? 'tables' : 'جدول'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category & Type */}
                    <td className="py-3 px-3">
                      {item.category === 'configuration' ? (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                            {isEn ? 'Config' : 'پیکربندی'}
                          </span>
                          <span className="text-[10px] text-purple-300/80 font-mono">
                            {item.configType || 'conf'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 items-start">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {item.mode === 'full'
                              ? isEn ? 'Full Dump' : 'دانپ کامل'
                              : item.mode === 'schema_only'
                              ? isEn ? 'Schema Only' : 'صرفاً اسکیما'
                              : isEn ? 'Data Only' : 'صرفاً داده'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono uppercase">
                            {item.format}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Size */}
                    <td className="py-3 px-3 font-mono font-semibold text-slate-300">
                      {item.sizePretty}
                    </td>

                    {/* Created At */}
                    <td className="py-3 px-3 text-[11px] text-slate-400 font-mono">
                      <div>{new Date(item.createdAt).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Engine */}
                    <td className="py-3 px-3 text-[11px] font-mono text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-[10px] text-slate-300">
                        {item.engineUsed === 'native_pg_dump'
                          ? 'pg_dump'
                          : item.engineUsed === 'config_snapshot'
                          ? 'Snapshot'
                          : 'SQL Dumper'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Preview / Inspect Button */}
                        <button
                          type="button"
                          onClick={() => openPreviewModal(item)}
                          title={isEn ? 'Preview & Inspect content' : 'پیش‌نمایش و بررسی محتوای فایل'}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-200 hover:bg-blue-50 hover:text-blue-600 text-slate-600'
                              : 'bg-slate-800 border-slate-700 hover:bg-blue-900/40 hover:text-blue-400 text-slate-300'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Download Button */}
                        {item.downloadUrl && (
                          <a
                            href={item.downloadUrl}
                            download={item.filename}
                            title={isEn ? 'Download backup file' : 'دانلود فایل نسخه پشتیبان'}
                            className={`p-1.5 rounded-lg border transition cursor-pointer inline-flex items-center justify-center ${
                              isLightMode
                                ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {/* Restore Button */}
                        <button
                          type="button"
                          onClick={() => openRestoreModal(item)}
                          title={isEn ? 'Restore to database' : 'بازیابی و اعمال بر روی دیتابیس'}
                          className="p-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => openDeleteModal(item)}
                          title={isEn ? 'Delete backup' : 'حذف فایل'}
                          className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
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
      {isCreateModalOpen &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[999990] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => !creating && setIsCreateModalOpen(false)}
          >
            <div
              className={`w-full max-w-2xl rounded-2xl border shadow-2xl p-5 space-y-4 my-auto transition-all ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
              }`}
              onClick={(e) => e.stopPropagation()}
              dir={isEn ? 'ltr' : 'rtl'}
            >
              {/* Header with Universal Modal Buttons (Rule 7) */}
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>{isEn ? 'Create PostgreSQL Backup' : 'ایجاد نسخه پشتیبان جدید PostgreSQL'}</span>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'PostgreSQL Backup Types' : 'انواع نسخه پشتیبان PostgreSQL'}
                        whatIsIt={
                          isEn
                            ? 'Allows exporting database schemas/data or PostgreSQL server configuration files.'
                            : 'امکان خروجی گرفتن از ساختار و داده‌های دیتابیس یا فایل‌های پیکربندی سرور PostgreSQL.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Essential for disaster recovery, migrations, development staging, and audit safety.'
                            : 'برای بازیابی در مواقع بحران، مهاجرت داده‌ها، محیط‌های آزمایشی و حفظ امنیت سرور ضروری است.'
                        }
                        example={
                          isEn
                            ? 'Database Full Dump for production apps; postgresql.conf snapshot before tuning parameters.'
                            : 'دانپ کامل برای اپلیکیشن‌ها؛ نسخه پشتیبان از postgresql.conf قبل از تغییر پارامترهای سرور.'
                        }
                      />
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isEn
                        ? 'Select between full database dump or configuration snapshot.'
                        : 'انتخاب نوع خروجی بین دانپ پایگاه داده یا فایل‌های پیکربندی سرور.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Success Notification */}
              {createSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{isEn ? createSuccessMsg.en : createSuccessMsg.fa || createSuccessMsg.en}</span>
                  </div>
                  {sqlDumpPreview && (
                    <button
                      type="button"
                      onClick={copySqlPreview}
                      className="px-2 py-1 rounded bg-emerald-800/40 hover:bg-emerald-700/40 text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                    >
                      {copiedPreview ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPreview ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy SQL' : 'کپی SQL')}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Category Radio Toggle: Database vs Configuration */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCreateCategory('database')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center gap-3 ${
                    createCategory === 'database'
                      ? 'bg-blue-600/15 border-blue-500 text-blue-200'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                  }`}
                >
                  <Database className={`w-5 h-5 ${createCategory === 'database' ? 'text-blue-400' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-bold text-xs text-slate-100">
                      {isEn ? 'Database Backup' : 'پشتیبان پایگاه داده'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {isEn ? 'Full Dump, Schema (DDL) or Data (INSERTs)' : 'دانپ کامل، ساختار اسکیما یا رکوردها'}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCreateCategory('configuration')}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center gap-3 ${
                    createCategory === 'configuration'
                      ? 'bg-purple-600/15 border-purple-500 text-purple-200'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-700'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                  }`}
                >
                  <FileCode className={`w-5 h-5 ${createCategory === 'configuration' ? 'text-purple-400' : 'text-slate-400'}`} />
                  <div>
                    <div className="font-bold text-xs text-slate-100">
                      {isEn ? 'Configuration Backup' : 'پشتیبان فایل‌های کانفیگ'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {isEn ? 'postgresql.conf, pg_hba.conf & Roles' : 'فایل‌های کانفیگ، دسترسی‌ها و رول‌ها'}
                    </div>
                  </div>
                </button>
              </div>

              {/* Form Body */}
              <div className="space-y-4 text-xs">
                {/* DATABASE BACKUP OPTIONS */}
                {createCategory === 'database' && (
                  <div className="space-y-3.5">
                    {/* Database selection */}
                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">
                        {isEn ? 'Target Database' : 'پایگاه داده مورد نظر'}
                      </label>
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
                            {db.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Dump Mode */}
                    <div>
                      <label className="font-semibold text-slate-300 block mb-1">
                        {isEn ? 'Dump Mode' : 'حالت ایجاد پشتیبان'}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setCreateMode('full')}
                          className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                            createMode === 'full'
                              ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-bold'
                              : 'border-slate-800 bg-slate-950/40 text-slate-400'
                          }`}
                        >
                          <div>{isEn ? 'Full Dump' : 'کامل (Full)'}</div>
                          <div className="text-[9px] text-slate-500">{isEn ? 'Schema + Data' : 'اسکیما + داده‌ها'}</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCreateMode('schema_only')}
                          className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                            createMode === 'schema_only'
                              ? 'bg-amber-600/20 border-amber-500 text-amber-300 font-bold'
                              : 'border-slate-800 bg-slate-950/40 text-slate-400'
                          }`}
                        >
                          <div>{isEn ? 'Schema Only' : 'صرفاً ساختار'}</div>
                          <div className="text-[9px] text-slate-500">{isEn ? 'DDL only' : 'تعاریف جداول بدون رکورد'}</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setCreateMode('data_only')}
                          className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                            createMode === 'data_only'
                              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold'
                              : 'border-slate-800 bg-slate-950/40 text-slate-400'
                          }`}
                        >
                          <div>{isEn ? 'Data Only' : 'صرفاً داده‌ها'}</div>
                          <div className="text-[9px] text-slate-500">{isEn ? 'Table rows only' : 'دستورات INSERT'}</div>
                        </button>
                      </div>
                    </div>

                    {/* Dump Format */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold text-slate-300 block mb-1">
                          {isEn ? 'Format' : 'فرمت خروجی'}
                        </label>
                        <select
                          value={createFormat}
                          onChange={(e) => setCreateFormat(e.target.value as PostgresBackupFormat)}
                          className={`w-full px-3 py-2 rounded-xl border font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-slate-100'
                          }`}
                        >
                          <option value="plain">{isEn ? 'Plain SQL Script (.sql)' : 'اسکریپت متنی SQL (.sql)'}</option>
                          <option value="custom">{isEn ? 'PostgreSQL Custom Dump (.dump)' : 'فرمت فشرده باینری (.dump)'}</option>
                          <option value="tar">{isEn ? 'Tar Archive (.tar)' : 'بایگانی فشرده (.tar)'}</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-semibold text-slate-300 block mb-1">
                          {isEn ? 'Compression (gzip)' : 'فشرده‌سازی gzip'}
                        </label>
                        <select
                          value={compressionLevel}
                          onChange={(e) => setCompressionLevel(Number(e.target.value))}
                          className={`w-full px-3 py-2 rounded-xl border font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-slate-100'
                          }`}
                        >
                          <option value={0}>{isEn ? 'No compression (.sql)' : 'بدون فشرده‌سازی'}</option>
                          <option value={1}>{isEn ? 'Fastest (Level 1)' : 'سریع‌ترین (سطح ۱)'}</option>
                          <option value={6}>{isEn ? 'Balanced (Level 6)' : 'متعادل (سطح ۶)'}</option>
                          <option value={9}>{isEn ? 'Maximum (Level 9)' : 'حداکثر فشرده‌سازی (سطح ۹)'}</option>
                        </select>
                      </div>
                    </div>

                    {/* Options checkboxes */}
                    <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeDrop}
                          onChange={(e) => setIncludeDrop(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span className="text-slate-300">
                          {isEn ? 'Include DROP IF EXISTS statements' : 'درج دستورات DROP IF EXISTS پیش از ساخت اشیاء'}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useInserts}
                          onChange={(e) => setUseInserts(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span className="text-slate-300">
                          {isEn ? 'Use standard INSERT syntax instead of COPY' : 'استفاده از ساختار استاندارد INSERT به جای COPY'}
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* CONFIGURATION BACKUP OPTIONS */}
                {createCategory === 'configuration' && (
                  <div className="space-y-3.5">
                    <label className="font-semibold text-slate-300 block mb-1">
                      {isEn ? 'Configuration Target' : 'موضوع فایل کانفیگ'}
                    </label>

                    <div className="grid grid-cols-1 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setCreateConfigType('postgresql_conf')}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                          createConfigType === 'postgresql_conf'
                            ? 'bg-cyan-600/15 border-cyan-500 text-cyan-200'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Sliders className="w-4 h-4 text-cyan-400 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-200">
                              {isEn ? 'PostgreSQL Server Configuration (postgresql.conf)' : 'تنظیمات کلی سرور (postgresql.conf)'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {isEn
                                ? 'Export all active runtime parameters, memory, logging, and connection limits from pg_settings.'
                                : 'خروجی کامل از کلیه پارامترهای حافظه، اتصالات، لاگ‌ها و رفتار اجرایی سرور.'}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400">
                          .conf
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreateConfigType('pg_hba')}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                          createConfigType === 'pg_hba'
                            ? 'bg-purple-600/15 border-purple-500 text-purple-200'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-200">
                              {isEn ? 'Client Authentication Rules (pg_hba.conf)' : 'قوانین احراز هویت کلاینت‌ها (pg_hba.conf)'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {isEn
                                ? 'Snapshot of network CIDRs, authentication methods (scram, md5, peer), and allowed databases.'
                                : 'نسخه پشتیبان از قوانین دسترسی شبکه‌ای، روش‌های احراز هویت و دسترسی کاربران.'}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-purple-400">
                          .conf
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreateConfigType('cluster_roles')}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                          createConfigType === 'cluster_roles'
                            ? 'bg-indigo-600/15 border-indigo-500 text-indigo-200'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-200">
                              {isEn ? 'Cluster Roles & Global Privileges Dump' : 'رول‌ها و دسترسی‌های سراسری سرور'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {isEn
                                ? 'SQL script recreating all user accounts, password hashes, privilege flags, and role memberships.'
                                : 'اسکریپت SQL جهت بازسازی کلیه کاربران، پسوردها، پرچم‌های دسترسی و عضویت‌های گروهی.'}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-400">
                          .sql
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom Filename Field */}
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    {isEn ? 'Custom Filename (Optional)' : 'نام سفارشی فایل (اختیاری)'}
                  </label>
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder={
                      createCategory === 'database'
                        ? `${createDb}_backup_${new Date().toISOString().slice(0, 10)}.sql`
                        : `${createConfigType}_backup.conf`
                    }
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-xs ${
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
                  disabled={creating}
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>

                <button
                  type="button"
                  disabled={creating}
                  onClick={handleCreateBackup}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{creating ? (isEn ? 'Generating...' : 'در حال ایجاد...') : (isEn ? 'Execute Backup' : 'اجرای پشتیبان‌گیری')}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* RESTORE MODAL (Multi-Step Safety-Gated Workflow - Phase 17) */}
      {isRestoreModalOpen &&
        restoreTargetBackup &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[999990] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => !restoring && setIsRestoreModalOpen(false)}
          >
            <div
              className={`w-full max-w-xl rounded-2xl border shadow-2xl p-5 space-y-4 my-auto transition-all ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
              }`}
              onClick={(e) => e.stopPropagation()}
              dir={isEn ? 'ltr' : 'rtl'}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>{isEn ? 'Restore Backup (Phase 17)' : 'بازیابی نسخه پشتیبان (فاز ۱۷)'}</span>
                      <FieldInfoTooltip
                        isEn={isEn}
                        isLightMode={isLightMode}
                        title={isEn ? 'Restore Safety Workflow' : 'فرآیند ایمن بازیابی پشتیبان'}
                        whatIsIt={
                          isEn
                            ? 'Executes pre-restore collision checks and runs SQL statements or applies server configurations.'
                            : 'اعتبارسنجی اولیه عدم تداخل را انجام داده و دستورات SQL یا تنظیمات سرور را با رعایت اصول ایمنی اعمال می‌کند.'
                        }
                        whyNeeded={
                          isEn
                            ? 'Prevents accidental overwrites of existing active databases with strict confirmation requirements.'
                            : 'از بازنویسی ناخواسته دیتابیس‌های فعال از طریق تاییدیه دو مرحله‌ای و هشدار تداخل جلوگیری می‌نماید.'
                        }
                        example={
                          isEn
                            ? 'Wrap in single transaction to ensure rollback if any statement encounters a syntax or foreign key error.'
                            : 'اجرا در قالب تراکنش واحد تا در صورت بروز هر خطایی، کلیه تغییرات به صورت خودکار رول‌بک شوند.'
                        }
                      />
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {restoreTargetBackup.category === 'configuration'
                        ? isEn ? 'Apply configuration parameters and trigger reload' : 'اعمال پارامترهای پیکربندی و بارگذاری مجدد سرور'
                        : isEn ? 'Import and apply SQL dump statements into target database' : 'اعمال و بازیابی فایل دانپ در پایگاه داده انتخابی'}
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

              {/* Pre-Restore Live Validation Report */}
              {isValidatingRestore ? (
                <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-950/20 text-blue-300 text-xs flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                  <span>{isEn ? 'Validating target database and table collision risks...' : 'در حال بررسی دیتابیس مقصد و سنجش ریسک تداخل جداول...'}</span>
                </div>
              ) : restoreValidation?.targetHasExistingData ? (
                <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/60 text-amber-200 text-xs space-y-2">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-300">
                        {isEn ? 'Warning: Target Database Has Existing Tables!' : 'هشدار: پایگاه داده مقصد دارای جدول فعال است!'}
                      </span>
                      <p className="text-[11px] text-amber-200/90 mt-1">
                        {isEn ? restoreValidation.warning : restoreValidation.warningFa}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-amber-500/30">
                    <label className="flex items-center gap-2 cursor-pointer font-bold select-none text-amber-200 text-[11px]">
                      <input
                        type="checkbox"
                        checked={hasConfirmedOverwrite}
                        onChange={(e) => setHasConfirmedOverwrite(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-amber-600 focus:ring-0"
                      />
                      <span>
                        {isEn
                          ? `I explicitly confirm that I understand existing data in "${restoreTargetDb}" may be modified/overwritten.`
                          : `صراحتاً تایید می‌کنم که از بازنویسی یا تغییر داده‌های موجود در پایگاه داده "${restoreTargetDb}" مطلع هستم.`}
                      </span>
                    </label>
                  </div>
                </div>
              ) : restoreValidation && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {isEn
                      ? `Clean target verified: Target database "${restoreTargetDb}" is ready for restore without collision.`
                      : `بررسی موفق: پایگاه داده "${restoreTargetDb}" فاقد جدول تداخلی بوده و آماده بازیابی ایمن است.`}
                  </span>
                </div>
              )}

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
                    {restoreResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>{isEn ? restoreResult.message : restoreResult.messageFa}</span>
                  </div>
                  {restoreResult.outputLog && (
                    <pre className="p-2 rounded-lg bg-black/50 text-[10px] font-mono max-h-24 overflow-y-auto text-slate-300">
                      {restoreResult.outputLog}
                    </pre>
                  )}
                </div>
              )}

              {/* Form Options */}
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    {isEn ? 'Source Backup File' : 'فایل نسخه پشتیبان مبدا'}
                  </label>
                  <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 font-mono text-cyan-400 text-xs flex items-center justify-between">
                    <span className="truncate max-w-[320px]">{restoreTargetBackup.filename}</span>
                    <span className="text-slate-400 font-bold">{restoreTargetBackup.sizePretty}</span>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    {isEn ? 'Destination Database' : 'پایگاه داده مقصد جهت بازیابی'}
                  </label>
                  <select
                    value={restoreTargetDb}
                    onChange={(e) => handleRestoreDbChange(e.target.value)}
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
                      ? `Type destination database name "${restoreTargetDb}" to verify:`
                      : `جهت تایید نهایی نام دیتابیس مقصد "${restoreTargetDb}" را تایپ فرمایید:`}
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
                  disabled={
                    restoring ||
                    confirmDbNameInput.trim() !== restoreTargetDb.trim() ||
                    (Boolean(restoreValidation?.targetHasExistingData) && !hasConfirmedOverwrite)
                  }
                  onClick={handleRestoreBackup}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  {restoring ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{restoring ? (isEn ? 'Restoring...' : 'در حال بازیابی...') : (isEn ? 'Execute Restore' : 'اجرای بازیابی')}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* PREVIEW / INSPECT BACKUP MODAL */}
      {isPreviewModalOpen &&
        previewBackup &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[999990] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setIsPreviewModalOpen(false)}
          >
            <div
              className={`w-full max-w-3xl rounded-2xl border shadow-2xl p-5 space-y-4 my-auto transition-all ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'
              }`}
              onClick={(e) => e.stopPropagation()}
              dir="ltr"
            >
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 font-mono">
                      {previewBackup.filename}
                    </h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 font-mono mt-0.5">
                      <span>{previewBackup.sizePretty}</span>
                      <span>•</span>
                      <span>{previewData ? `${previewData.totalLines} lines` : 'Loading...'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {previewData?.content && (
                    <button
                      type="button"
                      onClick={copyPreviewCode}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                  {previewBackup.downloadUrl && (
                    <a
                      href={previewBackup.downloadUrl}
                      download={previewBackup.filename}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsPreviewModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Code viewer */}
              {loadingPreview ? (
                <div className="py-16 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-2" />
                  <span>Loading content preview...</span>
                </div>
              ) : previewData?.error ? (
                <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs">
                  {previewData.error}
                </div>
              ) : (
                <div className="relative">
                  <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-200 overflow-x-auto max-h-[460px] overflow-y-auto leading-relaxed select-text">
                    {previewData?.content}
                  </pre>
                  {previewData?.isTruncated && (
                    <div className="text-[10px] text-slate-500 font-mono mt-1 text-center">
                      (Preview truncated to first 300 lines for performance. Download full file to view all.)
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen &&
        deleteTargetBackup &&
        createPortal(
          <div
            className="fixed top-0 left-0 right-0 bottom-8 z-[999990] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => !deleting && setIsDeleteModalOpen(false)}
          >
            <div
              className={`w-full max-w-md rounded-2xl border shadow-2xl p-5 space-y-4 my-auto transition-all ${
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
                <div className="text-slate-200 font-bold truncate">{deleteTargetBackup.filename}</div>
                <div className="text-slate-400 text-[11px]">
                  {deleteTargetBackup.database || 'postgres'} ({deleteTargetBackup.sizePretty})
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
          </div>,
          document.body
        )}
    </div>
  );
};
