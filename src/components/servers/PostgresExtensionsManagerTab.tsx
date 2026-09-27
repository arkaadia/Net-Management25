import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Boxes,
  Puzzle,
  Download,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowUpCircle,
  Database,
  Layers,
  Sparkles,
  X,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  Cpu,
  MapPin,
  KeyRound,
  FileCode,
  SlidersHorizontal,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresExtensionItem,
  PostgresDatabaseItem,
  PostgresSchemaItem,
  PostgresInstallExtensionRequest,
  PostgresUpdateExtensionRequest,
  PostgresDropExtensionRequest,
} from '../../types';
import {
  fetchRemoteServerPostgresExtensions,
  installRemoteServerPostgresExtension,
  updateRemoteServerPostgresExtension,
  dropRemoteServerPostgresExtension,
  fetchRemoteServerPostgresDatabases,
  fetchRemoteServerPostgresSchemas,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresExtensionsManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialDatabase?: string;
}

export const PostgresExtensionsManagerTab: React.FC<PostgresExtensionsManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialDatabase,
}) => {
  // State
  const [extensions, setExtensions] = useState<PostgresExtensionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ en: string; fa?: string } | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ en: string; fa?: string } | null>(null);

  // Database context
  const [databases, setDatabases] = useState<PostgresDatabaseItem[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>(
    initialDatabase || server.postgres_database || 'postgres'
  );

  // Schemas list for target schema selection
  const [schemas, setSchemas] = useState<PostgresSchemaItem[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'installed' | 'available' | 'updates'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Install Modal
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [targetExtForInstall, setTargetExtForInstall] = useState<PostgresExtensionItem | null>(null);
  const [installSchema, setInstallSchema] = useState<string>('public');
  const [installVersion, setInstallVersion] = useState<string>('');
  const [installCascade, setInstallCascade] = useState<boolean>(false);
  const [installing, setInstalling] = useState(false);

  // Update Modal / Action
  const [updatingExtName, setUpdatingExtName] = useState<string | null>(null);

  // Drop Modal
  const [isDropModalOpen, setIsDropModalOpen] = useState(false);
  const [targetExtForDrop, setTargetExtForDrop] = useState<PostgresExtensionItem | null>(null);
  const [dropCascade, setDropCascade] = useState<boolean>(false);
  const [confirmExtName, setConfirmExtName] = useState<string>('');
  const [dropping, setDropping] = useState(false);

  // SQL Copy State
  const [copiedSql, setCopiedSql] = useState(false);

  // Load databases
  const loadDatabases = useCallback(async () => {
    try {
      const res = await fetchRemoteServerPostgresDatabases(server.id);
      if (res.success && res.databases) {
        setDatabases(res.databases);
      }
    } catch {}
  }, [server.id]);

  // Load schemas for selected DB
  const loadSchemas = useCallback(async (db: string) => {
    try {
      const res = await fetchRemoteServerPostgresSchemas(server.id, { database: db });
      if (res.success && res.schemas) {
        setSchemas(res.schemas);
      }
    } catch {}
  }, [server.id]);

  // Load extensions for selected DB
  const loadExtensions = useCallback(async (db: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerPostgresExtensions(server.id, { database: db });
      if (res.success && res.extensions) {
        setExtensions(res.extensions);
      } else {
        setError({
          en: res.error || 'Failed to fetch extensions',
          fa: res.errorFa || 'خطا در بارگذاری افزونه‌های پایگاه داده',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Network error fetching extensions',
        fa: 'خطای ارتباط با سرور در دریافت افزونه‌ها',
      });
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => {
    loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    if (selectedDb) {
      loadExtensions(selectedDb);
      loadSchemas(selectedDb);
    }
  }, [selectedDb, loadExtensions, loadSchemas]);

  // Open Install Modal
  const openInstallModal = (ext?: PostgresExtensionItem) => {
    setTargetExtForInstall(ext || null);
    setInstallSchema('public');
    setInstallVersion(ext ? ext.defaultVersion : '');
    setInstallCascade(false);
    setActionSuccess(null);
    setIsInstallModalOpen(true);
  };

  // Submit Install Extension
  const handleInstallExtension = async () => {
    if (!targetExtForInstall) return;
    setInstalling(true);
    setActionSuccess(null);
    setError(null);

    const payload: PostgresInstallExtensionRequest = {
      database: selectedDb,
      extensionName: targetExtForInstall.name,
      schemaName: installSchema.trim() ? installSchema.trim() : undefined,
      version: installVersion.trim() ? installVersion.trim() : undefined,
      cascade: installCascade,
    };

    try {
      const res = await installRemoteServerPostgresExtension(server.id, payload);
      if (res.success) {
        setActionSuccess({
          en: res.message,
          fa: res.messageFa,
        });
        setIsInstallModalOpen(false);
        await loadExtensions(selectedDb);
      } else {
        setError({
          en: res.error || res.message,
          fa: res.errorFa || res.messageFa,
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Failed to install extension',
        fa: 'خطا در نصب افزونه',
      });
    } finally {
      setInstalling(false);
    }
  };

  // Submit Update Extension
  const handleUpdateExtension = async (ext: PostgresExtensionItem) => {
    setUpdatingExtName(ext.name);
    setActionSuccess(null);
    setError(null);

    const payload: PostgresUpdateExtensionRequest = {
      database: selectedDb,
      extensionName: ext.name,
      targetVersion: ext.defaultVersion,
    };

    try {
      const res = await updateRemoteServerPostgresExtension(server.id, payload);
      if (res.success) {
        setActionSuccess({
          en: res.message,
          fa: res.messageFa,
        });
        await loadExtensions(selectedDb);
      } else {
        setError({
          en: res.error || res.message,
          fa: res.errorFa || res.messageFa,
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Failed to update extension',
        fa: 'خطا در ارتقای افزونه',
      });
    } finally {
      setUpdatingExtName(null);
    }
  };

  // Open Drop Modal
  const openDropModal = (ext: PostgresExtensionItem) => {
    setTargetExtForDrop(ext);
    setDropCascade(false);
    setConfirmExtName('');
    setActionSuccess(null);
    setIsDropModalOpen(true);
  };

  // Submit Drop Extension
  const handleDropExtension = async () => {
    if (!targetExtForDrop) return;
    if (confirmExtName.trim() !== targetExtForDrop.name.trim()) return;

    setDropping(true);
    setActionSuccess(null);
    setError(null);

    const payload: PostgresDropExtensionRequest = {
      database: selectedDb,
      extensionName: targetExtForDrop.name,
      cascade: dropCascade,
    };

    try {
      const res = await dropRemoteServerPostgresExtension(server.id, payload);
      if (res.success) {
        setActionSuccess({
          en: res.message,
          fa: res.messageFa,
        });
        setIsDropModalOpen(false);
        await loadExtensions(selectedDb);
      } else {
        setError({
          en: res.error || res.message,
          fa: res.errorFa || res.messageFa,
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Failed to drop extension',
        fa: 'خطا در حذف افزونه',
      });
    } finally {
      setDropping(false);
    }
  };

  // Categories helper
  const getExtensionCategory = (name: string, comment: string): string => {
    const text = (name + ' ' + comment).toLowerCase();
    if (text.includes('crypto') || text.includes('security') || text.includes('auth') || text.includes('ssl')) return 'security';
    if (text.includes('gis') || text.includes('geometry') || text.includes('spatial') || text.includes('geo')) return 'gis';
    if (text.includes('stat') || text.includes('monitor') || text.includes('perf') || text.includes('metric')) return 'performance';
    if (text.includes('uuid') || text.includes('json') || text.includes('xml') || text.includes('hstore') || text.includes('type')) return 'types';
    return 'general';
  };

  // Filtered extensions
  const filteredExtensions = useMemo(() => {
    return extensions.filter((ext) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ext.comment.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'installed') matchesStatus = ext.isInstalled;
      else if (statusFilter === 'available') matchesStatus = !ext.isInstalled;
      else if (statusFilter === 'updates') matchesStatus = ext.isUpdatable;

      let matchesCategory = true;
      if (categoryFilter !== 'all') {
        matchesCategory = getExtensionCategory(ext.name, ext.comment) === categoryFilter;
      }

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [extensions, searchQuery, statusFilter, categoryFilter]);

  // Statistics
  const totalCount = extensions.length;
  const installedCount = extensions.filter((e) => e.isInstalled).length;
  const updatableCount = extensions.filter((e) => e.isUpdatable).length;

  // Generated Install SQL preview
  const previewInstallSql = useMemo(() => {
    if (!targetExtForInstall) return '';
    let sql = `CREATE EXTENSION IF NOT EXISTS "${targetExtForInstall.name}"`;
    const clauses: string[] = [];
    if (installSchema.trim()) clauses.push(`SCHEMA "${installSchema.trim()}"`);
    if (installVersion.trim()) clauses.push(`VERSION '${installVersion.trim()}'`);
    if (installCascade) clauses.push(`CASCADE`);
    if (clauses.length > 0) sql += ` WITH ${clauses.join(' ')}`;
    return sql + ';';
  }, [targetExtForInstall, installSchema, installVersion, installCascade]);

  // Generated Drop SQL preview
  const previewDropSql = useMemo(() => {
    if (!targetExtForDrop) return '';
    let sql = `DROP EXTENSION IF EXISTS "${targetExtForDrop.name}"`;
    if (dropCascade) sql += ` CASCADE`;
    return sql + ';';
  }, [targetExtForDrop, dropCascade]);

  const copySql = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
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
                ? 'bg-purple-50 border-purple-200 text-purple-600'
                : 'bg-purple-500/10 border-purple-500/30 text-purple-400'
            }`}
          >
            <Puzzle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className={`text-sm font-bold ${
                  isLightMode ? 'text-slate-900' : 'text-slate-100'
                }`}
              >
                {isEn
                  ? 'PostgreSQL Extensions Management'
                  : 'مدیریت افزونه‌ها و اکستنشن‌های PostgreSQL'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                Phase 14
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Browse available server modules, install new capabilities, upgrade versions, and manage database extensions.'
                : 'مشاهده ماژول‌های موجود در سرور، نصب قابلیت‌های پیشرفته، ارتقای نگارش‌ها و مدیریت جامع اکستنشن‌ها.'}
            </p>
          </div>
        </div>

        {/* Database Picker & Refresh */}
        <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400">
              {isEn ? 'Database:' : 'پایگاه داده:'}
            </span>
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border focus:outline-hidden transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-800'
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

          <button
            type="button"
            disabled={loading}
            onClick={() => selectedDb && loadExtensions(selectedDb)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
              isLightMode
                ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{isEn ? error.en : error.fa || error.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            isLightMode
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{isEn ? actionSuccess.en : actionSuccess.fa || actionSuccess.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-emerald-300 p-0.5 cursor-pointer"
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
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">
              {isEn ? 'Available Modules' : 'کل ماژول‌های موجود در سرور'}
            </div>
            <div className="text-base font-bold font-mono text-slate-200">
              {totalCount}
            </div>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">
              {isEn ? 'Installed in Database' : 'نصب‌شده در پایگاه داده'}
            </div>
            <div className="text-base font-bold font-mono text-emerald-400">
              {installedCount}
            </div>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex items-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <ArrowUpCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">
              {isEn ? 'Updates Available' : 'به‌روزرسانی‌های در دسترس'}
            </div>
            <div className="text-base font-bold font-mono text-cyan-400">
              {updatableCount}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search extensions by name or keywords (e.g. uuid, crypto, pg_stat)...'
                : 'جستجو در نام افزونه یا توضیحات (مانند uuid, crypto, pg_stat)...'
            }
            className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs font-mono border focus:outline-hidden transition ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900 focus:border-purple-500'
                : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-purple-500'
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

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className={`flex items-center p-1 rounded-xl border ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            {(
              [
                { id: 'all', label: isEn ? 'All' : 'همه' },
                { id: 'installed', label: isEn ? `Installed (${installedCount})` : `نصب‌شده (${installedCount})` },
                { id: 'available', label: isEn ? 'Available' : 'قابل نصب' },
                { id: 'updates', label: isEn ? `Updates (${updatableCount})` : `ارتقا (${updatableCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-900 border-slate-700 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
            <option value="security">{isEn ? 'Security & Crypto' : 'امنیت و رمزنگاری'}</option>
            <option value="performance">{isEn ? 'Monitoring & Performance' : 'پایش و کارایی'}</option>
            <option value="types">{isEn ? 'Data Types & UUID' : 'انواع داده و UUID'}</option>
            <option value="gis">{isEn ? 'GIS & Geometry' : 'سیستم‌های مکانی و GIS'}</option>
            <option value="general">{isEn ? 'General Utilities' : 'ابزارهای عمومی'}</option>
          </select>
        </div>
      </div>

      {/* Extensions Table / Inventory */}
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
                <th className="py-2.5 px-3">{isEn ? 'Extension' : 'نام افزونه'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Description' : 'توضیحات'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Status' : 'وضعیت'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Version' : 'نگارش'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Schema' : 'اسکیما'}</th>
                <th className="py-2.5 px-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading && extensions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                      <span>{isEn ? 'Loading extensions from server...' : 'در حال دریافت افزونه‌های سرور...'}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredExtensions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <Boxes className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="font-semibold text-slate-400">
                        {isEn ? 'No extensions matched your filter' : 'هیچ افزونه‌ای با فیلتر انتخابی مطابقت ندارد'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {isEn
                          ? 'Try clearing the search query or changing category/status filters.'
                          : 'عبارت جستجو را پاک کنید یا فیلترهای دسته و وضعیت را تغییر دهید.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredExtensions.map((item) => (
                  <tr
                    key={item.name}
                    className={`transition-colors font-mono ${
                      isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Extension name & icon */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg border ${
                            item.isInstalled
                              ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          <Puzzle className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-200">{item.name}</div>
                          {item.relocatable && (
                            <span className="text-[9px] text-cyan-400/80 font-mono">
                              {isEn ? 'Relocatable' : 'قابل جابجایی'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Description */}
                    <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate" title={item.comment}>
                      {item.comment || (
                        <span className="text-slate-500 italic">
                          {isEn ? 'No description available' : 'بدون توضیح'}
                        </span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="py-2.5 px-3">
                      {item.isInstalled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isEn ? 'Installed' : 'نصب‌شده'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          <span>{isEn ? 'Available' : 'موجود'}</span>
                        </span>
                      )}
                    </td>

                    {/* Versions */}
                    <td className="py-2.5 px-3 text-[11px]">
                      {item.isInstalled ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-400 font-bold">{item.installedVersion}</span>
                          {item.isUpdatable && (
                            <span
                              className="text-amber-400 text-[10px] flex items-center gap-0.5 font-bold"
                              title={isEn ? `Upgrade to ${item.defaultVersion}` : `ارتقا به ${item.defaultVersion}`}
                            >
                              <span>→</span>
                              <span>{item.defaultVersion}</span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">{item.defaultVersion}</span>
                      )}
                    </td>

                    {/* Schema */}
                    <td className="py-2.5 px-3 text-[11px]">
                      {item.schemaName ? (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {item.schemaName}
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* If NOT installed: Install button */}
                        {!item.isInstalled && (
                          <button
                            type="button"
                            onClick={() => openInstallModal(item)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            <Download className="w-3 h-3" />
                            <span>{isEn ? 'Install' : 'نصب'}</span>
                          </button>
                        )}

                        {/* If Installed and update available */}
                        {item.isInstalled && item.isUpdatable && (
                          <button
                            type="button"
                            disabled={updatingExtName === item.name}
                            onClick={() => handleUpdateExtension(item)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <ArrowUpCircle className={`w-3 h-3 ${updatingExtName === item.name ? 'animate-spin' : ''}`} />
                            <span>{isEn ? 'Update' : 'ارتقا'}</span>
                          </button>
                        )}

                        {/* If installed: Drop button */}
                        {item.isInstalled && (
                          <button
                            type="button"
                            onClick={() => openDropModal(item)}
                            className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                            title={isEn ? 'Drop / Uninstall extension' : 'حذف و غیرفعال‌سازی افزونه'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INSTALL EXTENSION MODAL */}
      {isInstallModalOpen && targetExtForInstall && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !installing && setIsInstallModalOpen(false)}
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
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Install PostgreSQL Extension' : 'نصب افزونه در پایگاه داده'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEn
                      ? `Enable "${targetExtForInstall.name}" in database "${selectedDb}"`
                      : `فعال‌سازی افزونه "${targetExtForInstall.name}" در پایگاه داده "${selectedDb}"`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={installing}
                onClick={() => setIsInstallModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Extension Info Box */}
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-400 font-mono text-xs">
                  {targetExtForInstall.name}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {isEn ? 'Default version:' : 'نگارش پیش‌فرض:'} {targetExtForInstall.defaultVersion}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                {targetExtForInstall.comment || (isEn ? 'No description available' : 'بدون توضیح')}
              </p>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 text-xs">
              {/* Target Schema */}
              <div>
                <label className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <span>{isEn ? 'Target Schema' : 'اسکیمای هدف'}</span>
                  <FieldInfoTooltip
                    title={isEn ? 'Extension Schema' : 'اسکیمای افزونه'}
                    whatIsIt={
                      isEn
                        ? 'The schema namespace where extension functions, tables, and types will be created.'
                        : 'اسکیمایی که توابع، جداول و انواع داده‌ای افزونه در آن ایجاد و سازماندهی می‌شوند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Defaults to "public", but organizing extensions in a separate schema (e.g. "extensions") keeps schemas clean.'
                        : 'معمولاً public است، اما قرار دادن در اسکیماهای تفکیک‌شده به نظم ساختار پایگاه داده کمک می‌کند.'
                    }
                    practicalExample="public, extensions"
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </label>
                <select
                  value={installSchema}
                  onChange={(e) => setInstallSchema(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                >
                  <option value="public">public</option>
                  {schemas
                    .filter((s) => s.name !== 'public')
                    .map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Version specification (Optional) */}
              <div>
                <label className="font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <span>{isEn ? 'Specific Version (Optional)' : 'نگارش اختصاصی (اختیاری)'}</span>
                </label>
                <input
                  type="text"
                  value={installVersion}
                  onChange={(e) => setInstallVersion(e.target.value)}
                  placeholder={targetExtForInstall.defaultVersion}
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                />
              </div>

              {/* Cascade Checkbox */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={installCascade}
                    onChange={(e) => setInstallCascade(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">
                      {isEn ? 'Install Dependent Extensions (CASCADE)' : 'نصب خودکار پیش‌نیازها (CASCADE)'}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {isEn
                        ? 'Automatically installs other extensions required by this module.'
                        : 'در صورت نیاز به سایر افزونه‌های وابسته، آنها را نیز به‌صورت زنجیره‌ای نصب می‌کند.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* Live SQL Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-purple-400" />
                    <span>{isEn ? 'Generated SQL Command' : 'دستور SQL تولیدشده'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copySql(previewInstallSql)}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSql ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                  </button>
                </div>
                <pre
                  className="p-3 rounded-xl bg-black/60 border border-slate-800 text-[11px] font-mono text-emerald-400 select-all"
                  dir="ltr"
                >
                  {previewInstallSql}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                disabled={installing}
                onClick={() => setIsInstallModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                disabled={installing}
                onClick={handleInstallExtension}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {installing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {installing
                    ? isEn
                      ? 'Installing...'
                      : 'در حال نصب...'
                    : isEn
                    ? 'Execute Install'
                    : 'اجرای دستور نصب'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DROP EXTENSION MODAL */}
      {isDropModalOpen && targetExtForDrop && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => !dropping && setIsDropModalOpen(false)}
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
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Drop PostgreSQL Extension' : 'حذف و غیرفعال‌سازی افزونه'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEn
                      ? `Uninstall "${targetExtForDrop.name}" from database "${selectedDb}"`
                      : `حذف افزونه "${targetExtForDrop.name}" از پایگاه داده "${selectedDb}"`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={dropping}
                onClick={() => setIsDropModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Warning Box */}
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  {isEn ? 'Warning: Extension Removal' : 'هشدار: حذف اشیاء و ساختارهای افزونه'}
                </span>
                <p className="text-[11px] text-rose-300 mt-1">
                  {isEn
                    ? 'Dropping this extension will remove its associated functions, types, and schema objects. Any application relying on these functions may fail.'
                    : 'با حذف این افزونه، توابع، انواع داده‌ای و اشیاء مرتبط با آن حذف خواهند شد و کدهایی که از آن‌ها استفاده می‌کنند دچار خطا می‌شوند.'}
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 text-xs">
              {/* Cascade Checkbox */}
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dropCascade}
                    onChange={(e) => setDropCascade(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 bg-slate-900 border-slate-700 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">
                      {isEn ? 'Drop Dependent Objects (CASCADE)' : 'حذف اشیاء وابسته (CASCADE)'}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {isEn
                        ? 'Automatically drop objects that depend on the extension, and all objects that depend on those objects.'
                        : 'دستور CASCADE تمام اشیاء وابسته به این افزونه را نیز به‌صورت زنجیره‌ای حذف می‌نماید.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* Exact name confirmation */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  {isEn
                    ? `Type "${targetExtForDrop.name}" to confirm deletion:`
                    : `جهت تایید حذف، نام "${targetExtForDrop.name}" را وارد کنید:`}
                </label>
                <input
                  type="text"
                  value={confirmExtName}
                  onChange={(e) => setConfirmExtName(e.target.value)}
                  placeholder={targetExtForDrop.name}
                  className={`w-full px-3 py-2 rounded-xl border font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-700 text-slate-100'
                  }`}
                  dir="ltr"
                />
              </div>

              {/* Live SQL Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-rose-400" />
                    <span>{isEn ? 'Generated SQL Command' : 'دستور SQL تولیدشده'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copySql(previewDropSql)}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSql ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy' : 'کپی')}</span>
                  </button>
                </div>
                <pre
                  className="p-3 rounded-xl bg-black/60 border border-slate-800 text-[11px] font-mono text-rose-400 select-all"
                  dir="ltr"
                >
                  {previewDropSql}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
              <button
                type="button"
                disabled={dropping}
                onClick={() => setIsDropModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                disabled={dropping || confirmExtName.trim() !== targetExtForDrop.name.trim()}
                onClick={handleDropExtension}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {dropping ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {dropping
                    ? isEn
                      ? 'Dropping...'
                      : 'در حال حذف...'
                    : isEn
                    ? 'Execute Drop'
                    : 'حذف افزونه'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
