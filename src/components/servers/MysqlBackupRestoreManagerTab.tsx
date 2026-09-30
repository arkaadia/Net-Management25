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
  RotateCcw,
  Eye,
  Settings,
  Maximize2,
  Minimize2,
  Minus,
  Sliders,
  ShieldCheck,
  AlertCircle,
  Upload,
  Play,
  FileText,
  Clock,
  Layers,
  Terminal,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlBackupItem,
  MysqlBackupCategory,
  MysqlBackupFileFormat,
  MysqlBackupRestoreMode,
  MysqlCreateBackupRequest,
  MysqlValidateRestoreResult,
  MysqlRestoreBackupResult,
  MysqlBackupPreviewResult,
  MysqlDatabaseItem,
} from '../../types';
import {
  fetchRemoteServerMysqlBackups,
  createRemoteServerMysqlBackup,
  restoreRemoteServerMysqlBackup,
  validateRemoteServerMysqlRestore,
  previewRemoteServerMysqlBackup,
  deleteRemoteServerMysqlBackup,
  uploadRemoteServerMysqlBackup,
  fetchRemoteServerMysqlDatabases,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlBackupRestoreManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
  onNavigateToSqlStudio?: (sql: string, dbName?: string) => void;
}

export const MysqlBackupRestoreManagerTab: React.FC<MysqlBackupRestoreManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
  onNavigateToSqlStudio,
}) => {
  // Backups repository state
  const [backups, setBackups] = useState<MysqlBackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ en: string; fa?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'database' | 'configuration'>('all');
  const [filterMode, setFilterMode] = useState<string>('all');

  // Databases catalog
  const [databases, setDatabases] = useState<MysqlDatabaseItem[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>(
    initialDatabase || server.mysql_database || ''
  );

  // Sub-view: 'repository' | 'wizard' | 'upload'
  const [activeSubView, setActiveSubView] = useState<'repository' | 'wizard' | 'upload'>('repository');

  // CREATE BACKUP MODAL STATE
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<MysqlBackupCategory>('database');
  const [createDb, setCreateDb] = useState<string>(
    initialDatabase || server.mysql_database || ''
  );
  const [createMode, setCreateMode] = useState<MysqlBackupRestoreMode>('full');
  const [createFormat, setCreateFormat] = useState<MysqlBackupFileFormat>('sql');
  const [includeDropTable, setIncludeDropTable] = useState(true);
  const [includeCreateDb, setIncludeCreateDb] = useState(false);
  const [disableForeignKeyChecks, setDisableForeignKeyChecks] = useState(true);
  const [includeViews, setIncludeViews] = useState(true);
  const [includeRoutines, setIncludeRoutines] = useState(true);
  const [includeTriggers, setIncludeTriggers] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [customFilename, setCustomFilename] = useState('');
  const [creating, setCreating] = useState(false);
  const [createSuccessMsg, setCreateSuccessMsg] = useState<{ en: string; fa?: string } | null>(null);
  const [sqlDumpPreview, setSqlDumpPreview] = useState<string | null>(null);
  const [copiedPreview, setCopiedPreview] = useState(false);

  // RESTORE & IMPORT WIZARD STATE
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreSourceType, setRestoreSourceType] = useState<'existing_backup' | 'custom_sql' | 'upload_file'>('existing_backup');
  const [restoreTargetBackup, setRestoreTargetBackup] = useState<MysqlBackupItem | null>(null);
  const [restoreCustomSql, setRestoreCustomSql] = useState('');
  const [restoreTargetDb, setRestoreTargetDb] = useState<string>(
    initialDatabase || server.mysql_database || ''
  );
  const [createNewDbMode, setCreateNewDbMode] = useState(false);
  const [newDbNameInput, setNewDbNameInput] = useState('');
  const [restoreSingleTx, setRestoreSingleTx] = useState(false);
  const [restoreDisableFk, setRestoreDisableFk] = useState(true);
  const [restoreDisableUnique, setRestoreDisableUnique] = useState(true);
  const [restoreContinueOnError, setRestoreContinueOnError] = useState(true);
  const [hasConfirmedOverwrite, setHasConfirmedOverwrite] = useState(false);
  const [confirmDbNameInput, setConfirmDbNameInput] = useState('');
  const [isValidatingRestore, setIsValidatingRestore] = useState(false);
  const [restoreValidation, setRestoreValidation] = useState<MysqlValidateRestoreResult | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<MysqlRestoreBackupResult | null>(null);

  // PREVIEW MODAL STATE
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewBackup, setPreviewBackup] = useState<MysqlBackupItem | null>(null);
  const [previewData, setPreviewData] = useState<MysqlBackupPreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);

  // DELETE CONFIRMATION MODAL STATE
  const [deleteBackupTarget, setDeleteBackupTarget] = useState<MysqlBackupItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // UPLOAD STATE
  const [uploadFilename, setUploadFilename] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Load databases
  const loadDatabases = useCallback(async () => {
    try {
      const res = await fetchRemoteServerMysqlDatabases(server.id);
      if (res.success && res.databases) {
        setDatabases(res.databases);
        if (!selectedDb && res.databases.length > 0) {
          const defaultDb = res.databases.find((d) => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(d.name)) || res.databases[0];
          setSelectedDb(defaultDb.name);
          setCreateDb(defaultDb.name);
          setRestoreTargetDb(defaultDb.name);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load MySQL databases:', err.message);
    }
  }, [server.id, selectedDb]);

  // Load backups list
  const loadBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerMysqlBackups(server.id);
      if (res.success && res.backups) {
        setBackups(res.backups);
      } else {
        setError({
          en: res.error || 'Failed to load MySQL backups repository',
          fa: res.errorFa || 'خطا در دریافت لیست نسخه‌های پشتیبان MySQL',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Network error fetching backups',
        fa: 'خطای ارتباط با سرور در دریافت نسخه‌های پشتیبان',
      });
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadDatabases();
    loadBackups();
  }, [loadDatabases, loadBackups]);

  // Compute metrics
  const totalSizeBytes = useMemo(() => {
    return backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);
  }, [backups]);

  const databaseBackupsCount = useMemo(() => {
    return backups.filter((b) => b.category === 'database' || !b.category).length;
  }, [backups]);

  const configBackupsCount = useMemo(() => {
    return backups.filter((b) => b.category === 'configuration').length;
  }, [backups]);

  // Filtered backups
  const filteredBackups = useMemo(() => {
    return backups.filter((b) => {
      // Category filter
      if (selectedCategory !== 'all' && b.category !== selectedCategory) {
        if (selectedCategory === 'database' && b.category) return false;
      }
      // Mode filter
      if (filterMode !== 'all' && b.mode !== filterMode) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = b.filename.toLowerCase().includes(q);
        const matchesDb = (b.database || '').toLowerCase().includes(q);
        const matchesDesc = (b.description || '').toLowerCase().includes(q);
        const matchesDescFa = (b.descriptionFa || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDb && !matchesDesc && !matchesDescFa) return false;
      }
      return true;
    });
  }, [backups, selectedCategory, filterMode, searchQuery]);

  // Handler: Trigger Create Backup
  const handleCreateBackup = async () => {
    setCreating(true);
    setCreateSuccessMsg(null);
    setSqlDumpPreview(null);
    try {
      const res = await createRemoteServerMysqlBackup(server.id, {
        category: createCategory,
        database: createCategory === 'configuration' ? undefined : createDb,
        mode: createMode,
        format: createFormat,
        includeDropTable,
        includeCreateDb,
        disableForeignKeyChecks,
        includeViews,
        includeRoutines,
        includeTriggers,
        includeEvents,
        customFilename: customFilename.trim() || undefined,
      });

      if (res.success) {
        setCreateSuccessMsg({
          en: res.message,
          fa: res.messageFa,
        });
        if (res.sqlDumpPreview) {
          setSqlDumpPreview(res.sqlDumpPreview);
        }
        await loadBackups();
        // Reset form custom filename
        setCustomFilename('');
      } else {
        alert(isEn ? res.message || res.error || 'Backup creation failed' : res.messageFa || res.errorFa || 'ایجاد نسخه پشتیبان با خطا مواجه شد');
      }
    } catch (err: any) {
      alert(isEn ? err.message || 'Failed to create backup' : 'خطای ارتباط در ایجاد نسخه پشتیبان');
    } finally {
      setCreating(false);
    }
  };

  // Handler: Open Restore Modal for a Backup Item
  const handleOpenRestoreModal = (backup?: MysqlBackupItem) => {
    setRestoreTargetBackup(backup || null);
    if (backup) {
      setRestoreSourceType('existing_backup');
      setRestoreTargetDb(backup.database || selectedDb || server.mysql_database || '');
    }
    setCreateNewDbMode(false);
    setNewDbNameInput('');
    setHasConfirmedOverwrite(false);
    setConfirmDbNameInput('');
    setRestoreValidation(null);
    setRestoreResult(null);
    setIsRestoreModalOpen(true);

    if (backup) {
      triggerRestoreValidation(backup.filename, backup.database || selectedDb || server.mysql_database || '');
    }
  };

  // Handler: Validate Restore
  const triggerRestoreValidation = async (filename?: string, targetDb?: string, sqlContent?: string) => {
    const finalDb = createNewDbMode ? newDbNameInput.trim() : (targetDb || restoreTargetDb).trim();
    if (!finalDb) return;

    setIsValidatingRestore(true);
    setRestoreValidation(null);
    try {
      const res = await validateRemoteServerMysqlRestore(server.id, {
        filename,
        sqlContent,
        targetDatabase: finalDb,
      });
      setRestoreValidation(res);
      // Auto confirm if no collisions
      if (res.valid && !res.requiresExplicitConfirmation) {
        setHasConfirmedOverwrite(true);
      } else {
        setHasConfirmedOverwrite(false);
      }
    } catch (err: any) {
      console.warn('Restore validation error:', err.message);
    } finally {
      setIsValidatingRestore(false);
    }
  };

  // Handler: Execute Restore
  const handleExecuteRestore = async () => {
    const finalDb = createNewDbMode ? newDbNameInput.trim() : restoreTargetDb.trim();
    if (!finalDb) {
      alert(isEn ? 'Please specify a target database.' : 'لطفاً نام دیتابیس مقصد را مشخص نمایید.');
      return;
    }

    if (restoreValidation?.requiresExplicitConfirmation && !hasConfirmedOverwrite) {
      alert(isEn ? 'Please confirm data overwrite risk before proceeding.' : 'لطفاً تاییدیه پذیرش ریسک تغییر یا بازنویسی داده‌ها را علامت بزنید.');
      return;
    }

    setRestoring(true);
    setRestoreResult(null);
    try {
      const res = await restoreRemoteServerMysqlBackup(server.id, {
        targetDatabase: finalDb,
        filename: restoreSourceType === 'existing_backup' && restoreTargetBackup ? restoreTargetBackup.filename : undefined,
        sqlContent: restoreSourceType === 'custom_sql' ? restoreCustomSql : undefined,
        createDatabaseIfNotExists: createNewDbMode,
        singleTransaction: restoreSingleTx,
        disableForeignKeyChecks: restoreDisableFk,
        disableUniqueChecks: restoreDisableUnique,
        continueOnError: restoreContinueOnError,
      });

      setRestoreResult(res);
      if (res.success) {
        await loadDatabases();
      }
    } catch (err: any) {
      setRestoreResult({
        success: false,
        message: err.message || 'Restore failed',
        messageFa: 'خطا در بازیابی نسخه پشتیبان',
        executedStatementsCount: 0,
        affectedRowsCount: 0,
        durationMs: 0,
        warningsCount: 0,
        errorsCount: 1,
        error: err.message,
      });
    } finally {
      setRestoring(false);
    }
  };

  // Handler: Open Preview Modal
  const handleOpenPreview = async (backup: MysqlBackupItem) => {
    setPreviewBackup(backup);
    setPreviewData(null);
    setLoadingPreview(true);
    setCopiedCode(false);
    setIsPreviewModalOpen(true);
    try {
      const res = await previewRemoteServerMysqlBackup(server.id, backup.filename);
      setPreviewData(res);
    } catch (err: any) {
      setPreviewData({
        success: false,
        filename: backup.filename,
        content: '',
        totalLines: 0,
        isTruncated: false,
        sizeBytes: 0,
        category: 'database',
        format: 'sql',
        error: err.message || 'Failed to read preview',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  // Handler: Execute Delete
  const handleConfirmDelete = async () => {
    if (!deleteBackupTarget) return;
    setDeleting(true);
    try {
      const res = await deleteRemoteServerMysqlBackup(server.id, deleteBackupTarget.filename);
      if (res.success) {
        setDeleteBackupTarget(null);
        await loadBackups();
      } else {
        alert(isEn ? res.message || res.error || 'Failed to delete backup' : res.messageFa || res.errorFa || 'خطا در حذف نسخه پشتیبان');
      }
    } catch (err: any) {
      alert(isEn ? err.message || 'Delete failed' : 'خطای ارتباط در حذف نسخه پشتیبان');
    } finally {
      setDeleting(false);
    }
  };

  // Handler: Upload backup file
  const handleUploadFile = async () => {
    if (!uploadFilename.trim() || !uploadContent.trim()) {
      setUploadError(isEn ? 'Please choose a file or paste SQL content.' : 'لطفاً یک فایل انتخاب کرده یا محتوای SQL را وارد نمایید.');
      return;
    }
    setUploading(true);
    setUploadSuccess(null);
    setUploadError(null);
    try {
      const res = await uploadRemoteServerMysqlBackup(server.id, uploadFilename.trim(), uploadContent);
      if (res.success && res.backup) {
        setUploadSuccess(
          isEn
            ? `Backup "${res.backup.filename}" uploaded successfully (${res.backup.sizePretty}).`
            : `نسخه پشتیبان "${res.backup.filename}" با موفقیت ذخیره شد (${res.backup.sizePretty}).`
        );
        setUploadFilename('');
        setUploadContent('');
        await loadBackups();
      } else {
        setUploadError(isEn ? res.error || 'Upload failed' : res.errorFa || 'خطا در ذخیره‌سازی فایل');
      }
    } catch (err: any) {
      setUploadError(isEn ? err.message || 'Upload error' : 'خطای ارتباط در آپلود فایل');
    } finally {
      setUploading(false);
    }
  };

  // File Picker for Upload
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFilename(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUploadContent(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      {/* 1. Header Toolbar & Quick Stats */}
      <div
        className={`px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${
          isLightMode
            ? 'bg-slate-100/80 border-slate-200 text-slate-800'
            : 'bg-slate-900/90 border-slate-800 text-slate-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">
                {isEn ? 'MySQL Advanced Backup & Restore Suite' : 'مدیریت پشتیبان‌گیری و بازیابی پیشرفته MySQL'}
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Phase 17
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isEn
                ? 'Production-grade logical dumps, table exports, pre-restore collision checks & safety-gated rollback.'
                : 'دامپ منطقی سطح تجاری، خروجی جداول، اعتبارسنجی برخورد قبل از بازیابی و رول‌بک ایمن.'}
            </p>
          </div>
        </div>

        {/* Telemetry Metric Badges */}
        <div className="flex items-center gap-2">
          <div
            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${
              isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold">{backups.length}</span>
            <span className="text-[10px] text-slate-400">{isEn ? 'Backups' : 'نسخه'}</span>
          </div>

          <div
            className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${
              isLightMode ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950/60 border-slate-800 text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-semibold font-mono">{(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
            <span className="text-[10px] text-slate-400">{isEn ? 'Storage' : 'حجم کل'}</span>
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={() => {
              setCreateSuccessMsg(null);
              setSqlDumpPreview(null);
              setIsCreateModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Create Backup' : 'پشتیبان‌گیری جدید'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenRestoreModal()}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isEn ? 'Restore / Import' : 'بازیابی / ایمپورت'}</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={loadBackups}
            title={isEn ? 'Refresh Backups' : 'بروزرسانی لیست'}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Sub-views Switcher & Filters Bar */}
      <div
        className={`px-5 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Subview Buttons */}
          <div
            className={`p-0.5 rounded-lg border flex items-center gap-1 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveSubView('repository')}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubView === 'repository'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{isEn ? 'Repository' : 'آرشیو نسخه‌ها'}</span>
              <span className="text-[10px] opacity-80 px-1 py-0.2 rounded-full bg-black/20">
                {backups.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('wizard')}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubView === 'wizard'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isEn ? 'Restore Wizard' : 'ویزارد بازیابی'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('upload')}
              className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubView === 'upload'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isEn ? 'Upload SQL File' : 'آپلود فایل اسکریپت'}</span>
            </button>
          </div>

          {/* Category Filter */}
          {activeSubView === 'repository' && (
            <div className="flex items-center gap-1 pl-2">
              <span className="text-[11px] text-slate-400">{isEn ? 'Category:' : 'دسته‌بندی:'}</span>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'All' : 'همه'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('database')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  selectedCategory === 'database'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'Databases' : 'پایگاه‌های داده'} ({databaseBackupsCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('configuration')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  selectedCategory === 'configuration'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isEn ? 'Configs (my.cnf)' : 'تنظیمات سرور'} ({configBackupsCount})
              </button>
            </div>
          )}
        </div>

        {/* Search Bar */}
        {activeSubView === 'repository' && (
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search backups by name, DB...' : 'جستجو در نسخه‌ها...'}
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-cyan-500'
                  : 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500 focus:border-cyan-500'
              }`}
            />
          </div>
        )}
      </div>

      {/* 3. Main Content Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* Error notification banner */}
        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{isEn ? error.en : error.fa || error.en}</span>
            </div>
            <button
              type="button"
              onClick={loadBackups}
              className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold cursor-pointer"
            >
              {isEn ? 'Retry' : 'تلاش مجدد'}
            </button>
          </div>
        )}

        {/* VIEW 1: REPOSITORY LIST */}
        {activeSubView === 'repository' && (
          <div>
            {loading && backups.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                <p className="text-xs">{isEn ? 'Loading backup repository...' : 'در حال بارگذاری آرشیو نسخه‌های پشتیبان...'}</p>
              </div>
            ) : filteredBackups.length === 0 ? (
              <div
                className={`py-16 px-4 rounded-2xl border text-center flex flex-col items-center justify-center gap-3 ${
                  isLightMode ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                }`}
              >
                <div className="p-3.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Archive className="w-8 h-8" />
                </div>
                <h3 className="text-sm font-bold text-slate-200">
                  {isEn ? 'No Backups Found' : 'هیچ نسخه پشتیبانی یافت نشد'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md">
                  {isEn
                    ? 'No backup files matching your criteria exist on this server. Click "Create Backup" to generate a new snapshot.'
                    : 'نسخه پشتیبانی منطبق با فیلتر شما بر روی این سرور وجود ندارد. جهت ایجاد اولین نسخه پشتیبان دکمه "پشتیبان‌گیری جدید" را کلیک نمایید.'}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateSuccessMsg(null);
                      setSqlDumpPreview(null);
                      setIsCreateModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Create First Backup' : 'ایجاد اولین نسخه پشتیبان'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubView('upload')}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Upload Existing SQL' : 'آپلود فایل اسکریپت SQL'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredBackups.map((b) => (
                  <div
                    key={b.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isLightMode
                        ? 'bg-white border-slate-200 hover:border-cyan-500/50 shadow-xs'
                        : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Left: Icon & Name */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`p-2.5 rounded-xl shrink-0 mt-0.5 border ${
                            b.category === 'configuration'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                          }`}
                        >
                          {b.category === 'configuration' ? (
                            <Settings className="w-5 h-5" />
                          ) : (
                            <FileCode className="w-5 h-5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-xs truncate" title={b.filename}>
                              {b.filename}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase border ${
                                b.category === 'configuration'
                                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                  : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              }`}
                            >
                              {b.category}
                            </span>
                            {b.database && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                {b.database}
                              </span>
                            )}
                            {b.mode && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                {b.mode === 'structure_only' ? 'DDL Only' : b.mode === 'data_only' ? 'Data Only' : 'Full Dump'}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3 text-cyan-400" />
                              <strong className="text-slate-300 font-mono">{b.sizePretty}</strong>
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{new Date(b.createdAt).toLocaleString()}</span>
                            </span>
                            {b.tablesCount !== undefined && b.tablesCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Database className="w-3 h-3 text-emerald-400" />
                                <span>{b.tablesCount} {isEn ? 'tables' : 'جدول'}</span>
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500 font-mono">
                              {b.engineUsed}
                            </span>
                          </div>

                          {(b.description || b.descriptionFa) && (
                            <p className="text-[11px] text-slate-400 mt-1 italic">
                              {isEn ? b.description || b.descriptionFa : b.descriptionFa || b.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenRestoreModal(b)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                          title={isEn ? 'Restore this backup' : 'بازیابی این نسخه'}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Restore' : 'بازیابی'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenPreview(b)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                          }`}
                          title={isEn ? 'Preview Content' : 'پیش‌نمایش محتوا'}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <a
                          href={`/api/remote-servers/${server.id}/mysql/backups/${encodeURIComponent(b.filename)}/download`}
                          download={b.filename}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer inline-flex items-center justify-center ${
                            isLightMode
                              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                          }`}
                          title={isEn ? 'Download Backup File' : 'دانلود فایل نسخه پشتیبان'}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={() => setDeleteBackupTarget(b)}
                          className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                          title={isEn ? 'Delete Backup' : 'حذف نسخه پشتیبان'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: RESTORE & IMPORT WIZARD */}
        {activeSubView === 'wizard' && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div
              className={`p-5 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Safety-Gated MySQL Restore & Import Wizard' : 'ویزارد بازیابی و ایمپورت ایمن MySQL'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Pre-restore table collision verification, transactional safety, and statement-level progress.'
                      : 'اعتبارسنجی برخورد جداول قبل از اجرا، امنیت تراکنشی و گزارش وضعیت سطر به سطر.'}
                  </p>
                </div>
              </div>

              {/* Step 1: Source Selection */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    {isEn ? '1. Select Restore Source:' : '۱. منبع بازیابی را انتخاب کنید:'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRestoreSourceType('existing_backup');
                        if (backups.length > 0 && !restoreTargetBackup) {
                          setRestoreTargetBackup(backups[0]);
                          triggerRestoreValidation(backups[0].filename, restoreTargetDb);
                        }
                      }}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        restoreSourceType === 'existing_backup'
                          ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 shadow-xs'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Archive className="w-4 h-4" />
                        <span className="text-[10px] font-mono">{backups.length} {isEn ? 'files' : 'فایل'}</span>
                      </div>
                      <span className="font-semibold text-xs text-slate-200">{isEn ? 'From Repository' : 'از آرشیو سرور'}</span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Pick an existing server backup' : 'انتخاب از میان نسخه‌های موجود'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRestoreSourceType('custom_sql')}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        restoreSourceType === 'custom_sql'
                          ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 shadow-xs'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <FileCode className="w-4 h-4" />
                        <span className="text-[10px] font-mono">SQL</span>
                      </div>
                      <span className="font-semibold text-xs text-slate-200">{isEn ? 'Paste Raw SQL' : 'ورود مستقیم اسکریپت SQL'}</span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Paste multi-statement dump' : 'ورود کدهای اسکریپت در ویرایشگر'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRestoreSourceType('upload_file');
                        setActiveSubView('upload');
                      }}
                      className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 text-left flex flex-col gap-1 transition-all cursor-pointer text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <Upload className="w-4 h-4" />
                        <span className="text-[10px] font-mono">.sql / .dump</span>
                      </div>
                      <span className="font-semibold text-xs text-slate-200">{isEn ? 'Upload Local File' : 'آپلود فایل از رایانه'}</span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Upload .sql from your device' : 'بارگذاری مستقیم فایل اسکریپت'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Backup selection dropdown if existing_backup */}
                {restoreSourceType === 'existing_backup' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      {isEn ? 'Backup File:' : 'فایل نسخه پشتیبان:'}
                    </label>
                    <select
                      value={restoreTargetBackup?.filename || ''}
                      onChange={(e) => {
                        const b = backups.find((x) => x.filename === e.target.value) || null;
                        setRestoreTargetBackup(b);
                        if (b) {
                          setRestoreTargetDb(b.database || selectedDb || '');
                          triggerRestoreValidation(b.filename, b.database || selectedDb || '');
                        }
                      }}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-200'
                      }`}
                    >
                      {backups.map((b) => (
                        <option key={b.filename} value={b.filename}>
                          {b.filename} ({b.sizePretty}) - {b.database || 'All'} - {new Date(b.createdAt).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Raw SQL textarea if custom_sql */}
                {restoreSourceType === 'custom_sql' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Paste SQL Statements:' : 'اسکریپت SQL را اینجا وارد کنید:'}
                      </label>
                      <button
                        type="button"
                        onClick={() => triggerRestoreValidation(undefined, restoreTargetDb, restoreCustomSql)}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
                      >
                        {isEn ? 'Validate Script' : 'اعتبارسنجی اسکریپت'}
                      </button>
                    </div>
                    <textarea
                      rows={6}
                      value={restoreCustomSql}
                      onChange={(e) => setRestoreCustomSql(e.target.value)}
                      placeholder={isEn ? 'CREATE TABLE example (id INT PRIMARY KEY); INSERT INTO example VALUES (1);' : 'دستورات SQL...'}
                      className={`w-full px-3 py-2 rounded-xl border font-mono text-xs ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-200'
                      }`}
                      dir="ltr"
                    />
                  </div>
                )}

                {/* Step 2: Target Database Selection */}
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-300">
                      {isEn ? '2. Target Database Destination:' : '۲. مقصد پایگاه داده جهت بازیابی:'}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-cyan-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={createNewDbMode}
                        onChange={(e) => {
                          setCreateNewDbMode(e.target.checked);
                          if (e.target.checked && !newDbNameInput) {
                            setNewDbNameInput(`${restoreTargetDb || 'restored'}_${Date.now().toString().slice(-4)}`);
                          }
                        }}
                        className="rounded text-cyan-600"
                      />
                      <span>{isEn ? 'Create New Database' : 'ایجاد پایگاه داده جدید'}</span>
                    </label>
                  </div>

                  {createNewDbMode ? (
                    <div>
                      <input
                        type="text"
                        value={newDbNameInput}
                        onChange={(e) => {
                          setNewDbNameInput(e.target.value);
                          triggerRestoreValidation(
                            restoreTargetBackup?.filename,
                            e.target.value,
                            restoreCustomSql
                          );
                        }}
                        placeholder={isEn ? 'new_database_name' : 'نام پایگاه داده جدید'}
                        className={`w-full px-3 py-2 rounded-xl border font-mono text-xs ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-700 text-slate-200'
                        }`}
                        dir="ltr"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        {isEn
                          ? 'A brand-new isolated database will be created automatically with UTF8MB4 encoding.'
                          : 'یک دیتابیس مجزای جدید به صورت خودکار با انکودینگ UTF8MB4 ساخته خواهد شد.'}
                      </p>
                    </div>
                  ) : (
                    <select
                      value={restoreTargetDb}
                      onChange={(e) => {
                        setRestoreTargetDb(e.target.value);
                        triggerRestoreValidation(
                          restoreTargetBackup?.filename,
                          e.target.value,
                          restoreCustomSql
                        );
                      }}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                        isLightMode
                          ? 'bg-white border-slate-300 text-slate-800'
                          : 'bg-slate-950 border-slate-700 text-slate-200'
                      }`}
                    >
                      {databases.map((db) => (
                        <option key={db.name} value={db.name}>
                          {db.name} ({db.tableCount || 0} {isEn ? 'tables' : 'جدول'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Step 3: Safety Validation Diagnostics Box */}
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-cyan-400" />
                      <span>{isEn ? '3. Pre-Restore Safety Inspection:' : '۳. ارزیابی امنیتی قبل از بازیابی:'}</span>
                    </span>
                    {isValidatingRestore && (
                      <span className="text-[11px] text-cyan-400 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{isEn ? 'Inspecting target...' : 'در حال بررسی...'}</span>
                      </span>
                    )}
                  </div>

                  {restoreValidation ? (
                    <div
                      className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                        restoreValidation.tableCollisions.length > 0
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {restoreValidation.tableCollisions.length > 0 ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-semibold">
                            {isEn
                              ? restoreValidation.warning || 'Pre-restore analysis complete: Clean target destination.'
                              : restoreValidation.warningFa || 'ارزیابی قبل از اجرا کامل شد: بدون تداخل ساختاری.'}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-300 font-mono">
                            <span>
                              {isEn ? 'Statements:' : 'دستورات:'} <strong>{restoreValidation.statementsCount}</strong>
                            </span>
                            <span>
                              {isEn ? 'CREATE TABLE:' : 'ساخت جدول:'} <strong>{restoreValidation.detectedOperations.createTable}</strong>
                            </span>
                            <span>
                              {isEn ? 'DROP TABLE:' : 'حذف جدول:'} <strong>{restoreValidation.detectedOperations.dropTable}</strong>
                            </span>
                            <span>
                              {isEn ? 'INSERTS:' : 'درج داده:'} <strong>{restoreValidation.detectedOperations.insert}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Collisions Warning Box */}
                      {restoreValidation.tableCollisions.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-black/40 border border-amber-500/20 text-[11px]">
                          <span className="font-bold text-amber-300">
                            {isEn ? 'Detected Table Collisions:' : 'جداول دارای تداخل نام:'}
                          </span>
                          <div className="flex flex-wrap gap-1 mt-1 font-mono">
                            {restoreValidation.tableCollisions.map((tbl) => (
                              <span key={tbl} className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {tbl}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-[11px] text-slate-400">
                      {isEn
                        ? 'Select a backup file or provide SQL script above to run automatic collision detection.'
                        : 'یک فایل یا اسکریپت SQL جهت بررسی خودکار تداخلات انتخاب نمایید.'}
                    </div>
                  )}
                </div>

                {/* Step 4: Execution Controls */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    {isEn ? '4. Execution Tuning Options:' : '۴. گزینه‌های کنترلی اجرای اسکریپت:'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreDisableFk}
                        onChange={(e) => setRestoreDisableFk(e.target.checked)}
                        className="rounded text-cyan-600"
                      />
                      <div>
                        <span className="font-semibold text-slate-200">
                          {isEn ? 'Disable Foreign Key Checks' : 'غیرفعال‌سازی بررسی کلیدهای خارجی'}
                        </span>
                        <p className="text-[10px] text-slate-400">SET FOREIGN_KEY_CHECKS = 0</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreDisableUnique}
                        onChange={(e) => setRestoreDisableUnique(e.target.checked)}
                        className="rounded text-cyan-600"
                      />
                      <div>
                        <span className="font-semibold text-slate-200">
                          {isEn ? 'Disable Unique Checks' : 'غیرفعال‌سازی بررسی یکتایی'}
                        </span>
                        <p className="text-[10px] text-slate-400">SET UNIQUE_CHECKS = 0</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreSingleTx}
                        onChange={(e) => setRestoreSingleTx(e.target.checked)}
                        className="rounded text-cyan-600"
                      />
                      <div>
                        <span className="font-semibold text-slate-200">
                          {isEn ? 'Single Transaction Wrap' : 'اجرا درون یک تراکنش واحد'}
                        </span>
                        <p className="text-[10px] text-slate-400">START TRANSACTION / COMMIT</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreContinueOnError}
                        onChange={(e) => setRestoreContinueOnError(e.target.checked)}
                        className="rounded text-cyan-600"
                      />
                      <div>
                        <span className="font-semibold text-slate-200">
                          {isEn ? 'Continue on Error' : 'ادامه اجرا در صورت بروز خطا'}
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {isEn ? 'Log warnings without halting' : 'ثبت هشدار و ادامه فرآیند'}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Overwrite Confirmation Checkbox */}
                {restoreValidation?.requiresExplicitConfirmation && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasConfirmedOverwrite}
                        onChange={(e) => setHasConfirmedOverwrite(e.target.checked)}
                        className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <span className="font-bold text-rose-300">
                          {isEn
                            ? 'I acknowledge that existing data in target tables will be modified or dropped.'
                            : 'من تایید می‌کنم که داده‌های موجود در جداول مقصد ممکن است بازنویسی یا جایگزین شوند.'}
                        </span>
                        <p className="text-[10px] text-rose-400 mt-0.5">
                          {isEn
                            ? 'This action cannot be undone unless you have a separate recent backup.'
                            : 'این عملیات غیرقابل بازگشت است مگر آنکه نسخه پشتیبان دیگری در اختیار داشته باشید.'}
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {/* Execute Button */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={restoring || (restoreValidation?.requiresExplicitConfirmation && !hasConfirmedOverwrite)}
                    onClick={handleExecuteRestore}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {restoring ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{isEn ? 'Restoring Database...' : 'در حال اجرای بازیابی...'}</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>{isEn ? 'Start Restore Execution' : 'شروع عملیات بازیابی'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Restore Execution Result Banner */}
            {restoreResult && (
              <div
                className={`p-4 rounded-2xl border text-xs space-y-3 ${
                  restoreResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {restoreResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm">
                      {isEn ? restoreResult.message : restoreResult.messageFa || restoreResult.message}
                    </h4>
                    <p className="text-[11px] opacity-80 mt-0.5 font-mono">
                      {restoreResult.executedStatementsCount} {isEn ? 'statements' : 'دستور'} | {restoreResult.affectedRowsCount} {isEn ? 'rows affected' : 'سطر تحت تاثیر'} | {(restoreResult.durationMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>

                {restoreResult.outputLog && (
                  <div>
                    <span className="font-bold block mb-1 text-[11px] opacity-90">
                      {isEn ? 'Execution Log:' : 'گزارش اجرای فرامین:'}
                    </span>
                    <pre
                      className="p-3 rounded-xl bg-black/60 border border-slate-800 text-[11px] font-mono max-h-48 overflow-y-auto select-all text-slate-300"
                      dir="ltr"
                    >
                      {restoreResult.outputLog}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: UPLOAD SQL FILE */}
        {activeSubView === 'upload' && (
          <div className="max-w-2xl mx-auto space-y-4">
            <div
              className={`p-5 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Upload SQL Dump File to Server' : 'آپلود فایل اسکریپت SQL به سرور'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Upload .sql, .dump, or .json dumps directly to server backup storage for inspection & restoration.'
                      : 'فایل‌های اسکریپت دیتابیس را جهت بازرسی و بازیابی به حافظه سرور ارسال کنید.'}
                  </p>
                </div>
              </div>

              {uploadSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              {uploadError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <div className="space-y-4 text-xs">
                {/* File picker drop area */}
                <div
                  className={`p-6 rounded-xl border-2 border-dashed text-center flex flex-col items-center justify-center gap-2 ${
                    isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-slate-700'
                  }`}
                >
                  <FileCode className="w-8 h-8 text-cyan-400" />
                  <label className="cursor-pointer font-bold text-cyan-400 hover:text-cyan-300 text-sm">
                    <span>{isEn ? 'Select file from computer' : 'انتخاب فایل از رایانه'}</span>
                    <input
                      type="file"
                      accept=".sql,.dump,.json,.csv,.txt"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[10px] text-slate-400">
                    {isEn ? 'Supports standard MySQL dump files (.sql, .dump, .json)' : 'پشتیبانی از اسکریپت‌های استاندارد MySQL (.sql, .dump, .json)'}
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    {isEn ? 'Target Filename on Server:' : 'نام فایل روی سرور:'}
                  </label>
                  <input
                    type="text"
                    value={uploadFilename}
                    onChange={(e) => setUploadFilename(e.target.value)}
                    placeholder="backup_2026.sql"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-950 border-slate-700 text-slate-200'
                    }`}
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    {isEn ? 'File Content (or paste script):' : 'محتوای اسکریپت (یا الصاق مستقیم متن):'}
                  </label>
                  <textarea
                    rows={8}
                    value={uploadContent}
                    onChange={(e) => setUploadContent(e.target.value)}
                    placeholder={isEn ? '-- Paste SQL script here...' : '-- اسکریپت SQL خود را اینجا وارد کنید...'}
                    className={`w-full px-3 py-2 rounded-xl border font-mono text-[11px] ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-950 border-slate-700 text-slate-200'
                    }`}
                    dir="ltr"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={uploading || !uploadFilename.trim() || !uploadContent.trim()}
                    onClick={handleUploadFile}
                    className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEn ? 'Uploading...' : 'در حال ذخیره‌سازی...'}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Save to Server Repository' : 'ذخیره در آرشیو سرور'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. MODAL: CREATE BACKUP DIALOG */}
      {isCreateModalOpen &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
            <div
              className={`w-full max-w-2xl rounded-2xl border flex flex-col max-h-[90vh] shadow-2xl overflow-hidden ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
              }`}
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      {isEn ? 'Create New MySQL Backup' : 'ایجاد نسخه پشتیبان جدید MySQL'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {isEn ? 'Full database, structure-only, or selective table export.' : 'دامپ کامل، فقط ساختار (DDL) یا استخراج داده‌ها.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                {createSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">{isEn ? 'Backup Created Successfully!' : 'نسخه پشتیبان با موفقیت ایجاد شد!'}</span>
                      <p className="text-[11px] opacity-90 mt-0.5">
                        {isEn ? createSuccessMsg.en : createSuccessMsg.fa || createSuccessMsg.en}
                      </p>
                    </div>
                  </div>
                )}

                {/* Scope: Category */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateCategory('database')}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer ${
                      createCategory === 'database'
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    <div>
                      <span className="font-semibold block">{isEn ? 'Database Dump' : 'دامپ پایگاه داده'}</span>
                      <span className="text-[10px] text-slate-400">{isEn ? 'Tables & Objects' : 'جداول و اشیاء دیتابیس'}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateCategory('configuration')}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer ${
                      createCategory === 'configuration'
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-950/40 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                    <div>
                      <span className="font-semibold block">{isEn ? 'Server my.cnf' : 'تنظیمات my.cnf'}</span>
                      <span className="text-[10px] text-slate-400">{isEn ? 'Config snapshot' : 'اسنپ‌شات فایل کانفیگ'}</span>
                    </div>
                  </button>
                </div>

                {createCategory === 'database' && (
                  <>
                    {/* Database selector */}
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        {isEn ? 'Select Database:' : 'انتخاب پایگاه داده:'}
                      </label>
                      <select
                        value={createDb}
                        onChange={(e) => setCreateDb(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border font-mono ${
                          isLightMode
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-slate-950 border-slate-700 text-slate-200'
                        }`}
                      >
                        {databases.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name} ({d.tableCount || 0} {isEn ? 'tables' : 'جدول'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mode: Full / DDL / Data */}
                    <div>
                      <label className="block font-semibold text-slate-300 mb-1">
                        {isEn ? 'Export Scope:' : 'محدوده استخراج:'}
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setCreateMode('full')}
                          className={`p-2 rounded-lg border text-center font-semibold cursor-pointer ${
                            createMode === 'full'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-slate-950/40 border-slate-800 text-slate-400'
                          }`}
                        >
                          {isEn ? 'Full (Structure & Data)' : 'کامل (ساختار و داده)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreateMode('structure_only')}
                          className={`p-2 rounded-lg border text-center font-semibold cursor-pointer ${
                            createMode === 'structure_only'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-slate-950/40 border-slate-800 text-slate-400'
                          }`}
                        >
                          {isEn ? 'Structure Only (DDL)' : 'فقط ساختار (DDL)'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreateMode('data_only')}
                          className={`p-2 rounded-lg border text-center font-semibold cursor-pointer ${
                            createMode === 'data_only'
                              ? 'bg-cyan-600 text-white'
                              : 'bg-slate-950/40 border-slate-800 text-slate-400'
                          }`}
                        >
                          {isEn ? 'Data Only (INSERTS)' : 'فقط داده‌ها (INSERTS)'}
                        </button>
                      </div>
                    </div>

                    {/* DDL Options */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeDropTable}
                          onChange={(e) => setIncludeDropTable(e.target.checked)}
                          className="rounded text-cyan-600"
                        />
                        <span>DROP TABLE IF EXISTS</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={disableForeignKeyChecks}
                          onChange={(e) => setDisableForeignKeyChecks(e.target.checked)}
                          className="rounded text-cyan-600"
                        />
                        <span>FOREIGN_KEY_CHECKS=0</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeViews}
                          onChange={(e) => setIncludeViews(e.target.checked)}
                          className="rounded text-cyan-600"
                        />
                        <span>{isEn ? 'Include Views' : 'شامل نماها (Views)'}</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-800 bg-slate-950/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeRoutines}
                          onChange={(e) => setIncludeRoutines(e.target.checked)}
                          className="rounded text-cyan-600"
                        />
                        <span>{isEn ? 'Procedures & Functions' : 'رویه‌ها و توابع'}</span>
                      </label>
                    </div>
                  </>
                )}

                {/* Custom filename input */}
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    {isEn ? 'Custom Filename (optional):' : 'نام فایل سفارشی (اختیاری):'}
                  </label>
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder="my_database_backup.sql"
                    className={`w-full px-3 py-2 rounded-xl border font-mono ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-800'
                        : 'bg-slate-950 border-slate-700 text-slate-200'
                    }`}
                    dir="ltr"
                  />
                </div>

                {sqlDumpPreview && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-300">{isEn ? 'Dump Preview Snippet:' : 'پیش‌نمایش اسکریپت تولیدشده:'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(sqlDumpPreview);
                          setCopiedPreview(true);
                          setTimeout(() => setCopiedPreview(false), 2000);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPreview ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedPreview ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
                      </button>
                    </div>
                    <pre className="p-3 rounded-xl bg-black/60 border border-slate-800 text-[11px] font-mono max-h-40 overflow-y-auto select-all text-cyan-300" dir="ltr">
                      {sqlDumpPreview}
                    </pre>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Close' : 'بستن'}
                </button>
                <button
                  type="button"
                  disabled={creating || (createCategory === 'database' && !createDb)}
                  onClick={handleCreateBackup}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isEn ? 'Creating Dump...' : 'در حال ایجاد دامپ...'}</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Execute Backup' : 'اجرای پشتیبان‌گیری'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 5. MODAL: PREVIEW / INSPECT DIALOG */}
      {isPreviewModalOpen &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
            <div
              className={`w-full ${
                isPreviewMaximized ? 'max-w-full h-full' : 'max-w-4xl max-h-[90vh]'
              } rounded-2xl border flex flex-col shadow-2xl overflow-hidden ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
              }`}
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm font-mono truncate max-w-md">
                      {previewBackup?.filename}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {previewData ? `${previewData.totalLines} ${isEn ? 'lines' : 'سطر'} | ${(previewData.sizeBytes / 1024).toFixed(1)} KB` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (previewData?.content) {
                        navigator.clipboard.writeText(previewData.content);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
                  </button>

                  {onNavigateToSqlStudio && previewData?.content && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateToSqlStudio(previewData.content, previewBackup?.database);
                        setIsPreviewModalOpen(false);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Open in SQL Studio' : 'باز کردن در SQL Studio'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsPreviewMaximized(!isPreviewMaximized)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {isPreviewMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPreviewModalOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Code viewer body */}
              <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-xs text-slate-300">
                {loadingPreview ? (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                    <span>{isEn ? 'Reading backup file content...' : 'در حال خواندن محتوای فایل...'}</span>
                  </div>
                ) : previewData?.error ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
                    {previewData.error}
                  </div>
                ) : (
                  <div>
                    {previewData?.isTruncated && (
                      <div className="mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px]">
                        {isEn
                          ? 'Showing first 512 KB of file. For complete content, please download the file directly.'
                          : 'نمایش ۵۱۲ کیلوبایت اولیه فایل. جهت دریافت محتوای کامل، فایل را دانلود نمایید.'}
                      </div>
                    )}
                    <pre className="select-all whitespace-pre-wrap break-all" dir="ltr">
                      {previewData?.content}
                    </pre>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">
                  {previewBackup?.filename}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPreviewModalOpen(false);
                      if (previewBackup) handleOpenRestoreModal(previewBackup);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Proceed to Restore' : 'ورود به مرحله بازیابی'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPreviewModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    {isEn ? 'Close' : 'بستن'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 6. MODAL: DELETE CONFIRMATION */}
      {deleteBackupTarget &&
        createPortal(
          <div className="fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
            <div
              className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Delete Backup File' : 'حذف نسخه پشتیبان'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn ? 'Permanent file removal from server storage.' : 'حذف دائمی فایل از حافظه سرور.'}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs">
                <p>
                  {isEn
                    ? `Are you sure you want to delete "${deleteBackupTarget.filename}" (${deleteBackupTarget.sizePretty})? This operation cannot be reversed.`
                    : `آیا از حذف نسخه پشتیبان "${deleteBackupTarget.filename}" (${deleteBackupTarget.sizePretty}) اطمینان دارید؟ این عملیات غیرقابل بازگشت است.`}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteBackupTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isEn ? 'Deleting...' : 'در حال حذف...'}</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Delete File' : 'حذف قطعی'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
