import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Edit2,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCode,
  HardDrive,
  Users,
  Settings,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Info,
  Check,
  Folder,
  FolderPlus,
  Eye,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresDatabaseItem,
  PostgresSchemaItem,
  PostgresCreateDatabaseRequest,
  PostgresUpdateDatabaseRequest,
  PostgresDropDatabaseRequest,
  PostgresCreateSchemaRequest,
  PostgresUpdateSchemaRequest,
  PostgresDropSchemaRequest,
} from '../../types';
import {
  fetchRemoteServerPostgresDatabases,
  createRemoteServerPostgresDatabase,
  updateRemoteServerPostgresDatabase,
  dropRemoteServerPostgresDatabase,
  fetchRemoteServerPostgresSchemas,
  createRemoteServerPostgresSchema,
  updateRemoteServerPostgresSchema,
  dropRemoteServerPostgresSchema,
  fetchRemoteServerPostgresRoles,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresDatabaseLifecycleTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  onRefreshOverview?: () => void;
  onOpenBrowserWithContext?: (db: string, schema?: string) => void;
}

export const PostgresDatabaseLifecycleTab: React.FC<PostgresDatabaseLifecycleTabProps> = ({
  server,
  isLightMode,
  isEn,
  onRefreshOverview,
  onOpenBrowserWithContext,
}) => {
  // Main view selection: 'databases' or 'schemas'
  const [activeSubView, setActiveSubView] = useState<'databases' | 'schemas'>('databases');

  // Databases Data
  const [databases, setDatabases] = useState<PostgresDatabaseItem[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [includeTemplates, setIncludeTemplates] = useState(false);
  const [dbSearch, setDbSearch] = useState('');

  // Selected Database for Schema exploration
  const [selectedDbForSchemas, setSelectedDbForSchemas] = useState<string>(
    server.postgres_database || 'postgres'
  );
  const [schemas, setSchemas] = useState<PostgresSchemaItem[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');

  // Available Roles (for owner assignment)
  const [roles, setRoles] = useState<string[]>(['postgres']);

  // Feedback Banner
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    messageFa: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ==========================================
  // Modals States
  // ==========================================
  // Database Modals
  const [isCreateDbModalOpen, setIsCreateDbModalOpen] = useState(false);
  const [isEditDbModalOpen, setIsEditDbModalOpen] = useState(false);
  const [isDropDbModalOpen, setIsDropDbModalOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState<PostgresDatabaseItem | null>(null);

  // Schema Modals
  const [isCreateSchemaModalOpen, setIsCreateSchemaModalOpen] = useState(false);
  const [isEditSchemaModalOpen, setIsEditSchemaModalOpen] = useState(false);
  const [isDropSchemaModalOpen, setIsDropSchemaModalOpen] = useState(false);
  const [selectedSchema, setSelectedSchema] = useState<PostgresSchemaItem | null>(null);

  // ==========================================
  // Form Fields - Database Create
  // ==========================================
  const [newDbName, setNewDbName] = useState('');
  const [newDbOwner, setNewDbOwner] = useState('postgres');
  const [newDbTemplate, setNewDbTemplate] = useState('');
  const [newDbEncoding, setNewDbEncoding] = useState('UTF8');
  const [newDbCollate, setNewDbCollate] = useState('');
  const [newDbCtype, setNewDbCtype] = useState('');
  const [newDbTablespace, setNewDbTablespace] = useState('');
  const [newDbConnectionLimit, setNewDbConnectionLimit] = useState<number>(-1);
  const [newDbAllowConn, setNewDbAllowConn] = useState(true);
  const [newDbIsTemplate, setNewDbIsTemplate] = useState(false);

  // Form Fields - Database Edit
  const [editDbNewName, setEditDbNewName] = useState('');
  const [editDbOwner, setEditDbOwner] = useState('postgres');
  const [editDbConnectionLimit, setEditDbConnectionLimit] = useState<number>(-1);
  const [editDbAllowConn, setEditDbAllowConn] = useState(true);
  const [editDbIsTemplate, setEditDbIsTemplate] = useState(false);
  const [editDbComment, setEditDbComment] = useState('');

  // Form Fields - Database Drop
  const [dropDbForce, setDropDbForce] = useState(true);

  // ==========================================
  // Form Fields - Schema Create / Edit / Drop
  // ==========================================
  const [newSchemaName, setNewSchemaName] = useState('');
  const [newSchemaOwner, setNewSchemaOwner] = useState('postgres');
  const [newSchemaComment, setNewSchemaComment] = useState('');

  const [editSchemaNewName, setEditSchemaNewName] = useState('');
  const [editSchemaOwner, setEditSchemaOwner] = useState('postgres');
  const [editSchemaComment, setEditSchemaComment] = useState('');

  const [dropSchemaCascade, setDropSchemaCascade] = useState(false);

  // ==========================================
  // Data Fetching
  // ==========================================
  const loadDatabases = useCallback(async () => {
    if (!server?.id) return;
    setLoadingDatabases(true);
    setFeedback(null);
    try {
      const res = await fetchRemoteServerPostgresDatabases(server.id, {
        includeTemplates,
      });
      if (res.success && res.databases) {
        setDatabases(res.databases);
        if (!selectedDbForSchemas && res.databases.length > 0) {
          setSelectedDbForSchemas(res.databases[0].name);
        }
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to enumerate databases.',
          messageFa: res.errorFa || 'خطا در دریافت کاتالوگ دیتابیس‌ها.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error fetching databases.',
        messageFa: 'خطای شبکه در دریافت لیست دیتابیس‌ها.',
      });
    } finally {
      setLoadingDatabases(false);
    }
  }, [server?.id, includeTemplates, selectedDbForSchemas]);

  const loadSchemas = useCallback(async (targetDb?: string) => {
    const dbToQuery = targetDb || selectedDbForSchemas;
    if (!server?.id || !dbToQuery) return;
    setLoadingSchemas(true);
    try {
      const res = await fetchRemoteServerPostgresSchemas(server.id, {
        database: dbToQuery,
      });
      if (res.success && res.schemas) {
        setSchemas(res.schemas);
      }
    } catch {
      // Ignore schema fetch failures gracefully
    } finally {
      setLoadingSchemas(false);
    }
  }, [server?.id, selectedDbForSchemas]);

  const loadRoles = useCallback(async () => {
    if (!server?.id) return;
    try {
      const res = await fetchRemoteServerPostgresRoles(server.id);
      if (res.success && res.roles) {
        setRoles(res.roles.map((r) => r.rolname));
      }
    } catch {}
  }, [server?.id]);

  useEffect(() => {
    loadDatabases();
    loadRoles();
  }, [loadDatabases, loadRoles]);

  useEffect(() => {
    if (activeSubView === 'schemas' && selectedDbForSchemas) {
      loadSchemas(selectedDbForSchemas);
    }
  }, [activeSubView, selectedDbForSchemas, loadSchemas]);

  // Filtered Databases
  const filteredDatabases = useMemo(() => {
    return databases.filter((db) => {
      const matches =
        db.name.toLowerCase().includes(dbSearch.toLowerCase()) ||
        db.owner.toLowerCase().includes(dbSearch.toLowerCase()) ||
        db.encoding.toLowerCase().includes(dbSearch.toLowerCase());
      if (!includeTemplates && db.isTemplate) return false;
      return matches;
    });
  }, [databases, dbSearch, includeTemplates]);

  // Filtered Schemas
  const filteredSchemas = useMemo(() => {
    return schemas.filter((s) => {
      return (
        s.name.toLowerCase().includes(schemaSearch.toLowerCase()) ||
        s.owner.toLowerCase().includes(schemaSearch.toLowerCase()) ||
        (s.comment && s.comment.toLowerCase().includes(schemaSearch.toLowerCase()))
      );
    });
  }, [schemas, schemaSearch]);

  // ==========================================
  // Handlers - Database Operations
  // ==========================================
  const handleOpenCreateDb = () => {
    setNewDbName('');
    setNewDbOwner('postgres');
    setNewDbTemplate('');
    setNewDbEncoding('UTF8');
    setNewDbCollate('');
    setNewDbCtype('');
    setNewDbTablespace('');
    setNewDbConnectionLimit(-1);
    setNewDbAllowConn(true);
    setNewDbIsTemplate(false);
    setIsCreateDbModalOpen(true);
  };

  const handleOpenEditDb = (db: PostgresDatabaseItem) => {
    setSelectedDb(db);
    setEditDbNewName(db.name);
    setEditDbOwner(db.owner);
    setEditDbConnectionLimit(db.connectionLimit ?? -1);
    setEditDbAllowConn(db.allowConnections);
    setEditDbIsTemplate(db.isTemplate);
    setEditDbComment('');
    setIsEditDbModalOpen(true);
  };

  const handleOpenDropDb = (db: PostgresDatabaseItem) => {
    setSelectedDb(db);
    setDropDbForce(true);
    setIsDropDbModalOpen(true);
  };

  const submitCreateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresCreateDatabaseRequest = {
      name: newDbName.trim(),
      owner: newDbOwner.trim() || undefined,
      template: newDbTemplate.trim() || undefined,
      encoding: newDbEncoding.trim() || undefined,
      lcCollate: newDbCollate.trim() || undefined,
      lcCtype: newDbCtype.trim() || undefined,
      tablespace: newDbTablespace.trim() || undefined,
      connectionLimit: Number(newDbConnectionLimit),
      allowConnections: newDbAllowConn,
      isTemplate: newDbIsTemplate,
    };

    try {
      const res = await createRemoteServerPostgresDatabase(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Database "${newDbName}" created successfully.`,
          messageFa: res.messageFa || `پایگاه داده "${newDbName}" با موفقیت ایجاد گردید.`,
        });
        setIsCreateDbModalOpen(false);
        await loadDatabases();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to create database.',
          messageFa: res.errorFa || res.messageFa || 'خطا در ایجاد پایگاه داده.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while creating database.',
        messageFa: 'خطای شبکه در ایجاد پایگاه داده.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitUpdateDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDb) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresUpdateDatabaseRequest = {
      name: selectedDb.name,
      newName: editDbNewName.trim() !== selectedDb.name ? editDbNewName.trim() : undefined,
      owner: editDbOwner !== selectedDb.owner ? editDbOwner : undefined,
      connectionLimit: Number(editDbConnectionLimit),
      allowConnections: editDbAllowConn,
      isTemplate: editDbIsTemplate,
      comment: editDbComment.trim() ? editDbComment.trim() : undefined,
    };

    try {
      const res = await updateRemoteServerPostgresDatabase(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Database "${selectedDb.name}" updated successfully.`,
          messageFa: res.messageFa || `مشخصات دیتابیس "${selectedDb.name}" با موفقیت به‌روزرسانی شد.`,
        });
        setIsEditDbModalOpen(false);
        await loadDatabases();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to update database.',
          messageFa: res.errorFa || res.messageFa || 'خطا در به‌روزرسانی پایگاه داده.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while updating database.',
        messageFa: 'خطای شبکه در به‌روزرسانی مشخصات پایگاه داده.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitDropDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDb) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresDropDatabaseRequest = {
      name: selectedDb.name,
      forceWithDisconnect: dropDbForce,
    };

    try {
      const res = await dropRemoteServerPostgresDatabase(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Database "${selectedDb.name}" dropped successfully.`,
          messageFa: res.messageFa || `پایگاه داده "${selectedDb.name}" با موفقیت حذف شد.`,
        });
        setIsDropDbModalOpen(false);
        await loadDatabases();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to drop database.',
          messageFa: res.errorFa || res.messageFa || 'خطا در حذف پایگاه داده.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while dropping database.',
        messageFa: 'خطای شبکه در حذف پایگاه داده.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // Handlers - Schema Operations
  // ==========================================
  const handleOpenCreateSchema = () => {
    setNewSchemaName('');
    setNewSchemaOwner('postgres');
    setNewSchemaComment('');
    setIsCreateSchemaModalOpen(true);
  };

  const handleOpenEditSchema = (sc: PostgresSchemaItem) => {
    setSelectedSchema(sc);
    setEditSchemaNewName(sc.name);
    setEditSchemaOwner(sc.owner);
    setEditSchemaComment(sc.comment || '');
    setIsEditSchemaModalOpen(true);
  };

  const handleOpenDropSchema = (sc: PostgresSchemaItem) => {
    setSelectedSchema(sc);
    setDropSchemaCascade(false);
    setIsDropSchemaModalOpen(true);
  };

  const submitCreateSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchemaName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresCreateSchemaRequest = {
      database: selectedDbForSchemas,
      name: newSchemaName.trim(),
      owner: newSchemaOwner.trim() || undefined,
      comment: newSchemaComment.trim() || undefined,
    };

    try {
      const res = await createRemoteServerPostgresSchema(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Schema "${newSchemaName}" created successfully.`,
          messageFa: res.messageFa || `اسکیمای "${newSchemaName}" با موفقیت ایجاد گردید.`,
        });
        setIsCreateSchemaModalOpen(false);
        await loadSchemas(selectedDbForSchemas);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to create schema.',
          messageFa: res.errorFa || res.messageFa || 'خطا در ایجاد اسکیما.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while creating schema.',
        messageFa: 'خطای شبکه در ایجاد اسکیما.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitUpdateSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchema) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresUpdateSchemaRequest = {
      database: selectedDbForSchemas,
      name: selectedSchema.name,
      newName: editSchemaNewName.trim() !== selectedSchema.name ? editSchemaNewName.trim() : undefined,
      owner: editSchemaOwner !== selectedSchema.owner ? editSchemaOwner : undefined,
      comment: editSchemaComment.trim() ? editSchemaComment.trim() : undefined,
    };

    try {
      const res = await updateRemoteServerPostgresSchema(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Schema "${selectedSchema.name}" updated successfully.`,
          messageFa: res.messageFa || `مشخصات اسکیمای "${selectedSchema.name}" با موفقیت به‌روزرسانی شد.`,
        });
        setIsEditSchemaModalOpen(false);
        await loadSchemas(selectedDbForSchemas);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to update schema.',
          messageFa: res.errorFa || res.messageFa || 'خطا در به‌روزرسانی اسکیما.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while updating schema.',
        messageFa: 'خطای شبکه در به‌روزرسانی اسکیما.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitDropSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchema) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresDropSchemaRequest = {
      database: selectedDbForSchemas,
      name: selectedSchema.name,
      cascade: dropSchemaCascade,
    };

    try {
      const res = await dropRemoteServerPostgresSchema(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Schema "${selectedSchema.name}" dropped successfully.`,
          messageFa: res.messageFa || `اسکیمای "${selectedSchema.name}" با موفقیت حذف گردید.`,
        });
        setIsDropSchemaModalOpen(false);
        await loadSchemas(selectedDbForSchemas);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to drop schema.',
          messageFa: res.errorFa || res.messageFa || 'خطا در حذف اسکیما.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while dropping schema.',
        messageFa: 'خطای شبکه در حذف اسکیما.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Banner and Navigation Tabs between Databases and Schemas */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span>{isEn ? 'Database & Schema Lifecycle Management' : 'مدیریت و پیکربندی پایگاه‌های داده و اسکیماها'}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEn
              ? 'Create, configure collations, reassign ownership, inspect physical storage sizes, and manage schemas lifecycle.'
              : 'ایجاد، پیکربندی اینکودینگ، انتقال مالکیت، بررسی فضای ذخیره‌سازی و مدیریت کامل چرخه حیات اسکیماها.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sub-view switcher: Databases vs Schemas */}
          <div
            className={`p-1 rounded-xl border flex items-center gap-1 ${
              isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveSubView('databases')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeSubView === 'databases'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isEn ? 'Databases' : 'دیتابیس‌ها'}</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
                {databases.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('schemas')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                activeSubView === 'schemas'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isEn ? 'Schemas' : 'اسکیماها'}</span>
            </button>
          </div>

          {/* Action Button: Create DB or Schema */}
          {activeSubView === 'databases' ? (
            <button
              type="button"
              onClick={handleOpenCreateDb}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isEn ? 'New Database' : 'دیتابیس جدید'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreateSchema}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              <span>{isEn ? 'New Schema' : 'اسکیمای جدید'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => (activeSubView === 'databases' ? loadDatabases() : loadSchemas())}
            disabled={loadingDatabases || loadingSchemas}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDatabases || loadingSchemas ? 'animate-spin' : ''}`} />
            <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>

          <FieldInfoTooltip
            fieldName="PostgreSQL Database & Schema Lifecycle"
            infoWhatEn="A PostgreSQL Database is an isolated set of catalog tables and schemas. Schemas are namespaces containing tables, views, sequences, and routines."
            infoWhatFa="دیتابیس در PostgreSQL مجموعه‌ای مجزا از جداول و فضاهاست. اسکیماها فضاهای نامی (Namespaces) هستند که جداول، ویوها و توابع درون آنها قرار می‌گیرند."
            infoWhyEn="Organizes multi-tenant data, provides distinct permission boundaries, and enables optimal collation/storage strategies."
            infoWhyFa="جداسازی بهینه داده‌ها، تعریف مرزهای امنیتی و انتخاب استراتژی مناسب اینکودینگ و فضاهای ذخیره‌سازی."
            infoExampleEn="app_production, analytics_staging, custom_schema"
            infoExampleFa="دیتابیس پروداکشن، دیتابیس استیجینگ تحلیل داده، اسکیمای اختصاصی"
            isEn={isEn}
            isLightMode={isLightMode}
          />
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedback.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{isEn ? feedback.message : feedback.messageFa}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: DATABASES CATALOG & LIFECYCLE                                    */}
      {/* ========================================================================= */}
      {activeSubView === 'databases' && (
        <div className="flex-1 flex flex-col space-y-3 min-h-0">
          {/* Filter Bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-400">
                <input
                  type="checkbox"
                  checked={includeTemplates}
                  onChange={(e) => setIncludeTemplates(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span>{isEn ? 'Show Templates (template0, template1)' : 'نمایش قالب‌ها (قالب ۰ و ۱)'}</span>
              </label>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
                placeholder={isEn ? 'Search databases, owners...' : 'جستجوی دیتابیس‌ها و مالکین...'}
                className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                  isLightMode
                    ? 'border-slate-300 bg-white focus:border-blue-500'
                    : 'border-slate-800 bg-slate-950 focus:border-blue-500 text-slate-200'
                }`}
              />
            </div>
          </div>

          {/* Databases Table */}
          <div
            className={`flex-1 rounded-xl border overflow-hidden flex flex-col ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr
                    className={`border-b font-mono font-bold text-[11px] uppercase tracking-wider ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-600'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400'
                    }`}
                  >
                    <th className="p-3">{isEn ? 'Database Name' : 'نام پایگاه داده'}</th>
                    <th className="p-3">{isEn ? 'Owner' : 'مالک'}</th>
                    <th className="p-3">{isEn ? 'Physical Size' : 'حجم فیزیکی'}</th>
                    <th className="p-3">{isEn ? 'Encoding / Collation' : 'اینکودینگ / کلاشن'}</th>
                    <th className="p-3 text-center">{isEn ? 'Connections' : 'اتصالات فعال'}</th>
                    <th className="p-3 text-center">{isEn ? 'State' : 'وضعیت'}</th>
                    <th className="p-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {loadingDatabases && databases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                        <span>{isEn ? 'Enumerating database catalog...' : 'در حال خواندن کاتالوگ دیتابیس...'}</span>
                      </td>
                    </tr>
                  ) : filteredDatabases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        <span>{isEn ? 'No databases found matching query.' : 'دیتابیسی یافت نشد.'}</span>
                      </td>
                    </tr>
                  ) : (
                    filteredDatabases.map((db) => {
                      const isDefault = db.name === (server.postgres_database || 'postgres');
                      const isSystem = ['postgres', 'template0', 'template1'].includes(db.name.toLowerCase());

                      return (
                        <tr
                          key={db.oid}
                          className={`transition ${
                            isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Name & Badges */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Database className={`w-4 h-4 shrink-0 ${isDefault ? 'text-blue-400' : 'text-slate-400'}`} />
                              <div>
                                <span className="font-bold text-slate-200">{db.name}</span>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {isDefault && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                      DEFAULT CONTEXT
                                    </span>
                                  )}
                                  {db.isTemplate && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                      TEMPLATE
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Owner */}
                          <td className="p-3 text-slate-300">{db.owner}</td>

                          {/* Size */}
                          <td className="p-3 font-bold text-emerald-400 tabular-nums">{db.sizePretty}</td>

                          {/* Encoding & Collation */}
                          <td className="p-3 text-[11px] text-slate-400">
                            <span>{db.encoding}</span>
                            {db.collation && (
                              <span className="text-slate-500 ml-1">({db.collation})</span>
                            )}
                          </td>

                          {/* Active Connections */}
                          <td className="p-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                db.activeConnections > 0
                                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                  : 'text-slate-500'
                              }`}
                            >
                              {db.activeConnections > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                              <span>{db.activeConnections}</span>
                            </span>
                          </td>

                          {/* State (Allow connections) */}
                          <td className="p-3 text-center">
                            {db.allowConnections ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <Unlock className="w-3 h-3" />
                                <span>{isEn ? 'ACCEPTING' : 'مجاز'}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                <Lock className="w-3 h-3" />
                                <span>{isEn ? 'LOCKED' : 'مسدود'}</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Explore Schemas Shortcut */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDbForSchemas(db.name);
                                  setActiveSubView('schemas');
                                }}
                                title={isEn ? 'View Schemas of this Database' : 'مشاهده اسکیماهای این پایگاه داده'}
                                className="p-1 rounded hover:bg-purple-500/20 text-slate-400 hover:text-purple-400 transition cursor-pointer"
                              >
                                <Layers className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit Database Configuration */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditDb(db)}
                                title={isEn ? 'Edit Database Settings' : 'ویرایش مشخصات دیتابیس'}
                                className="p-1 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Drop Database (Not allowed for system dbs) */}
                              {!isSystem && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDropDb(db)}
                                  title={isEn ? 'Drop Database' : 'حذف پایگاه داده'}
                                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: SCHEMAS LIFECYCLE & EXPLORATION                                  */}
      {/* ========================================================================= */}
      {activeSubView === 'schemas' && (
        <div className="flex-1 flex flex-col space-y-3 min-h-0">
          {/* Target DB Selector and Schema Search */}
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">{isEn ? 'In Database:' : 'در پایگاه داده:'}</span>
              <select
                value={selectedDbForSchemas}
                onChange={(e) => {
                  setSelectedDbForSchemas(e.target.value);
                  loadSchemas(e.target.value);
                }}
                className={`px-3 py-1.5 rounded-lg border outline-none font-mono font-semibold ${
                  isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950 text-slate-200'
                }`}
              >
                {databases.map((db) => (
                  <option key={db.name} value={db.name}>
                    {db.name} ({db.sizePretty})
                  </option>
                ))}
              </select>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={schemaSearch}
                onChange={(e) => setSchemaSearch(e.target.value)}
                placeholder={isEn ? 'Search schemas, owners...' : 'جستجوی اسکیماها...'}
                className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                  isLightMode
                    ? 'border-slate-300 bg-white focus:border-blue-500'
                    : 'border-slate-800 bg-slate-950 focus:border-blue-500 text-slate-200'
                }`}
              />
            </div>
          </div>

          {/* Schemas Table */}
          <div
            className={`flex-1 rounded-xl border overflow-hidden flex flex-col ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
            }`}
          >
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr
                    className={`border-b font-mono font-bold text-[11px] uppercase tracking-wider ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-600'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400'
                    }`}
                  >
                    <th className="p-3">{isEn ? 'Schema Name' : 'نام اسکیما'}</th>
                    <th className="p-3">{isEn ? 'Owner' : 'مالک'}</th>
                    <th className="p-3 text-center">{isEn ? 'Tables' : 'تعداد جداول'}</th>
                    <th className="p-3 text-center">{isEn ? 'Views' : 'ویوها'}</th>
                    <th className="p-3 text-center">{isEn ? 'Routines / Functions' : 'توابع و روال‌ها'}</th>
                    <th className="p-3">{isEn ? 'Comment' : 'توضیحات'}</th>
                    <th className="p-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {loadingSchemas && schemas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
                        <span>{isEn ? 'Loading schemas catalog...' : 'در حال دریافت اطلاعات اسکیماها...'}</span>
                      </td>
                    </tr>
                  ) : filteredSchemas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        <span>{isEn ? 'No schemas found in this database.' : 'اسکیمایی در این پایگاه داده یافت نشد.'}</span>
                      </td>
                    </tr>
                  ) : (
                    filteredSchemas.map((sc) => {
                      const isPublic = sc.name === 'public';
                      const isSystem = ['pg_catalog', 'information_schema', 'pg_toast'].includes(sc.name.toLowerCase());

                      return (
                        <tr
                          key={sc.name}
                          className={`transition ${
                            isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          {/* Name & Badges */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Layers className={`w-4 h-4 shrink-0 ${isPublic ? 'text-purple-400' : 'text-slate-400'}`} />
                              <div>
                                <span className="font-bold text-slate-200">{sc.name}</span>
                                {isPublic && (
                                  <span className="ml-2 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    PUBLIC
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Owner */}
                          <td className="p-3 text-slate-300">{sc.owner}</td>

                          {/* Table count */}
                          <td className="p-3 text-center">
                            <span className="font-bold text-cyan-400">{sc.tableCount}</span>
                          </td>

                          {/* View count */}
                          <td className="p-3 text-center">
                            <span className="text-slate-300">{sc.viewCount}</span>
                          </td>

                          {/* Routines count */}
                          <td className="p-3 text-center">
                            <span className="text-slate-300">{sc.routineCount}</span>
                          </td>

                          {/* Comment */}
                          <td className="p-3 text-slate-400 font-sans truncate max-w-[200px]">
                            {sc.comment || '-'}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Edit Schema */}
                              {!isSystem && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditSchema(sc)}
                                  title={isEn ? 'Edit Schema' : 'ویرایش اسکیما'}
                                  className="p-1 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Drop Schema */}
                              {!isSystem && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenDropSchema(sc)}
                                  title={isEn ? 'Drop Schema' : 'حذف اسکیما'}
                                  className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. CREATE DATABASE MODAL                                                  */}
      {/* ========================================================================= */}
      {isCreateDbModalOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 max-h-[90vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>{isEn ? 'Create PostgreSQL Database' : 'ایجاد پایگاه داده جدید PostgreSQL'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsCreateDbModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitCreateDatabase} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Database Name *' : 'نام پایگاه داده *'}
                </label>
                <input
                  type="text"
                  required
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  placeholder="e.g. app_production"
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-blue-500'
                      : 'border-slate-800 bg-slate-950 focus:border-blue-500 text-slate-200'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Owner */}
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Owner Role' : 'مالک (Owner)'}
                  </label>
                  <select
                    value={newDbOwner}
                    onChange={(e) => setNewDbOwner(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                    }`}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template */}
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Template (Optional)' : 'قالب مرجع (اختیاری)'}
                  </label>
                  <select
                    value={newDbTemplate}
                    onChange={(e) => setNewDbTemplate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                    }`}
                  >
                    <option value="">{isEn ? 'Default (template1)' : 'پیش‌فرض (template1)'}</option>
                    {databases.map((db) => (
                      <option key={db.name} value={db.name}>
                        {db.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Encoding */}
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Encoding' : 'اینکودینگ (Encoding)'}
                  </label>
                  <input
                    type="text"
                    value={newDbEncoding}
                    onChange={(e) => setNewDbEncoding(e.target.value)}
                    placeholder="UTF8"
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                    }`}
                  />
                </div>

                {/* Connection Limit */}
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Connection Limit (-1 for unlimited)' : 'محدودیت اتصال (-1 برای نامحدود)'}
                  </label>
                  <input
                    type="number"
                    value={newDbConnectionLimit}
                    onChange={(e) => setNewDbConnectionLimit(parseInt(e.target.value, 10))}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                    }`}
                  />
                </div>
              </div>

              {/* Advanced Flags */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newDbAllowConn}
                    onChange={(e) => setNewDbAllowConn(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Allow Client Connections' : 'پذیرش اتصالات کلاینت (ALLOW_CONNECTIONS)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newDbIsTemplate}
                    onChange={(e) => setNewDbIsTemplate(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Make Template Database' : 'تعریف به عنوان قالب (IS_TEMPLATE)'}</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateDbModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Create Database' : 'ایجاد پایگاه داده'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. EDIT DATABASE MODAL                                                    */}
      {/* ========================================================================= */}
      {isEditDbModalOpen && selectedDb && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 max-h-[90vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <span>
                  {isEn ? `Edit Database Settings: ${selectedDb.name}` : `ویرایش مشخصات دیتابیس: ${selectedDb.name}`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditDbModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitUpdateDatabase} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Rename Database' : 'تغییر نام دیتابیس'}
                </label>
                <input
                  type="text"
                  required
                  value={editDbNewName}
                  onChange={(e) => setEditDbNewName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Change Owner' : 'تغییر مالک'}
                  </label>
                  <select
                    value={editDbOwner}
                    onChange={(e) => setEditDbOwner(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                    }`}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Connection Limit' : 'محدودیت اتصال'}
                  </label>
                  <input
                    type="number"
                    value={editDbConnectionLimit}
                    onChange={(e) => setEditDbConnectionLimit(parseInt(e.target.value, 10))}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editDbAllowConn}
                    onChange={(e) => setEditDbAllowConn(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Allow Client Connections' : 'پذیرش اتصالات کلاینت'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editDbIsTemplate}
                    onChange={(e) => setEditDbIsTemplate(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Is Template' : 'تعریف به عنوان قالب'}</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Description / Comment' : 'توضیحات دیتابیس'}
                </label>
                <input
                  type="text"
                  value={editDbComment}
                  onChange={(e) => setEditDbComment(e.target.value)}
                  placeholder="e.g. Primary analytics data store"
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditDbModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Save Changes' : 'ذخیره تغییرات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DROP DATABASE MODAL                                                    */}
      {/* ========================================================================= */}
      {isDropDbModalOpen && selectedDb && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 text-rose-400 border-b pb-3 border-slate-800">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">
                {isEn ? `Confirm Drop Database: ${selectedDb.name}` : `تایید حذف پایگاه داده: ${selectedDb.name}`}
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {isEn
                ? `Are you sure you want to permanently drop database "${selectedDb.name}"? All tables, schemas, and stored data will be irrevocably destroyed.`
                : `آیا از حذف دائمی پایگاه داده "${selectedDb.name}" اطمینان دارید؟ تمامی اسکیماها، جداول و داده‌های ذخیره شده غیرقابل بازگشت خواهند بود.`}
            </p>

            <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-rose-300">
              <input
                type="checkbox"
                checked={dropDbForce}
                onChange={(e) => setDropDbForce(e.target.checked)}
                className="rounded text-rose-600 focus:ring-0"
              />
              <span>{isEn ? 'Terminate active connections before dropping' : 'قطع خودکار اتصالات فعال قبل از حذف'}</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDropDbModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitDropDatabase}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEn ? 'Permanently Drop' : 'حذف قطعی دیتابیس'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CREATE SCHEMA MODAL                                                    */}
      {/* ========================================================================= */}
      {isCreateSchemaModalOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-emerald-400" />
                <span>{isEn ? `New Schema in "${selectedDbForSchemas}"` : `ایجاد اسکیمای جدید در "${selectedDbForSchemas}"`}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsCreateSchemaModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitCreateSchema} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Schema Name *' : 'نام اسکیما *'}
                </label>
                <input
                  type="text"
                  required
                  value={newSchemaName}
                  onChange={(e) => setNewSchemaName(e.target.value)}
                  placeholder="e.g. analytics, reporting"
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Owner Role' : 'مالک (Owner)'}
                </label>
                <select
                  value={newSchemaOwner}
                  onChange={(e) => setNewSchemaOwner(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Comment / Description' : 'یادداشت یا توضیحات'}
                </label>
                <input
                  type="text"
                  value={newSchemaComment}
                  onChange={(e) => setNewSchemaComment(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateSchemaModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Create Schema' : 'ایجاد اسکیما'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. EDIT SCHEMA MODAL                                                      */}
      {/* ========================================================================= */}
      {isEditSchemaModalOpen && selectedSchema && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <span>
                  {isEn ? `Edit Schema: ${selectedSchema.name}` : `ویرایش مشخصات اسکیما: ${selectedSchema.name}`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditSchemaModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={submitUpdateSchema} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Rename Schema' : 'تغییر نام اسکیما'}
                </label>
                <input
                  type="text"
                  required
                  value={editSchemaNewName}
                  onChange={(e) => setEditSchemaNewName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Owner Role' : 'مالک (Owner)'}
                </label>
                <select
                  value={editSchemaOwner}
                  onChange={(e) => setEditSchemaOwner(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Comment' : 'توضیحات'}
                </label>
                <input
                  type="text"
                  value={editSchemaComment}
                  onChange={(e) => setEditSchemaComment(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isLightMode ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-950 text-slate-200'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditSchemaModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Save Schema' : 'ذخیره مشخصات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. DROP SCHEMA MODAL                                                      */}
      {/* ========================================================================= */}
      {isDropSchemaModalOpen && selectedSchema && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3 text-rose-400 border-b pb-3 border-slate-800">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="text-sm font-bold">
                {isEn ? `Drop Schema: ${selectedSchema.name}` : `حذف اسکیما: ${selectedSchema.name}`}
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {isEn
                ? `Are you sure you want to drop schema "${selectedSchema.name}" from database "${selectedDbForSchemas}"?`
                : `آیا از حذف اسکیمای "${selectedSchema.name}" از پایگاه داده "${selectedDbForSchemas}" اطمینان دارید؟`}
            </p>

            <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-rose-300">
              <input
                type="checkbox"
                checked={dropSchemaCascade}
                onChange={(e) => setDropSchemaCascade(e.target.checked)}
                className="rounded text-rose-600 focus:ring-0"
              />
              <span>{isEn ? 'Cascade drop all objects in this schema (CASCADE)' : 'حذف زنجیره‌ای تمام جداول و اشیای داخل اسکیما (CASCADE)'}</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDropSchemaModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submitDropSchema}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEn ? 'Drop Schema' : 'حذف قطعی اسکیما'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
