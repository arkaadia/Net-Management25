import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Shield,
  Lock,
  Unlock,
  Key,
  Database,
  Layers,
  Table as TableIcon,
  Zap,
  Code2,
  RefreshCw,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCode,
  Users,
  Search,
  Sliders,
  ChevronRight,
  Info,
  Check,
  Copy,
  ExternalLink,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlPrivilegeScope,
  MysqlRoutineType,
  MysqlApplicablePrivilege,
  MysqlAccountGrantsEntry,
  MysqlPermissionsMatrixResponse,
  MysqlPermissionDelta,
  MysqlUserGrant,
  MysqlDatabaseItem,
} from '../../types';
import {
  fetchRemoteServerMysqlPermissions,
  applyRemoteServerMysqlPermissions,
  fetchRemoteServerMysqlGrants,
  fetchRemoteServerMysqlDatabases,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlPermissionsManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  databases?: MysqlDatabaseItem[];
  initialScope?: MysqlPrivilegeScope;
  initialDatabase?: string;
  initialTable?: string;
  onRefreshOverview?: () => void;
}

const TEMPLATE_PRESETS: {
  id: string;
  labelEn: string;
  labelFa: string;
  descriptionEn: string;
  descriptionFa: string;
  privs: string[];
  withGrantOption?: boolean;
}[] = [
  {
    id: 'readonly',
    labelEn: 'Read-Only (SELECT)',
    labelFa: 'فقط خواندنی (SELECT)',
    descriptionEn: 'Allow SELECT queries only. Ideal for BI tools and read-only replica users.',
    descriptionFa: 'اجازه اجرای کوئری‌های SELECT فقط برای ابزارهای گزارش‌گیری و کاربران خواندنی.',
    privs: ['SELECT'],
  },
  {
    id: 'readwrite',
    labelEn: 'Read-Write (DML)',
    labelFa: 'خواندن و نوشتن داده (DML)',
    descriptionEn: 'Standard application permissions: SELECT, INSERT, UPDATE, DELETE.',
    descriptionFa: 'مجوزهای استاندارد برنامه‌های کاربردی: خواندن، درج، ویرایش و حذف رکوردها.',
    privs: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    id: 'developer',
    labelEn: 'Developer (DML + DDL)',
    labelFa: 'توسعه‌دهنده نرم‌افزار (DDL + DML)',
    descriptionEn: 'Data operations plus schema creation, alteration, and index management.',
    descriptionFa: 'عملیات داده به همراه ساخت، تغییر ساختار جداول، ایندکس‌ها و تریگرها.',
    privs: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'INDEX', 'CREATE VIEW', 'SHOW VIEW', 'TRIGGER'],
  },
  {
    id: 'fulladmin',
    labelEn: 'Full Administrator (ALL PRIVILEGES)',
    labelFa: 'مدیر ارشد پایگاه داده (ALL PRIVILEGES)',
    descriptionEn: 'Grant all privileges with GRANT OPTION on selected scope.',
    descriptionFa: 'اعطای تمامی اختیارات به همراه حق تفویض (WITH GRANT OPTION).',
    privs: ['ALL PRIVILEGES', 'GRANT OPTION'],
    withGrantOption: true,
  },
];

export const MysqlPermissionsManagerTab: React.FC<MysqlPermissionsManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  databases: initialDatabases = [],
  initialScope = 'database',
  initialDatabase = '',
  initialTable = '',
  onRefreshOverview,
}) => {
  // Target Selection State
  const [scope, setScope] = useState<MysqlPrivilegeScope>(initialScope);
  const [database, setDatabase] = useState<string>(initialDatabase);
  const [table, setTable] = useState<string>(initialTable);
  const [column, setColumn] = useState<string>('');
  const [routineType, setRoutineType] = useState<MysqlRoutineType>('PROCEDURE');
  const [routineName, setRoutineName] = useState<string>('');

  // Available Databases list
  const [dbList, setDbList] = useState<string[]>(initialDatabases.map((d) => d.name));

  // Loading & State
  const [loading, setLoading] = useState(false);
  const [matrixData, setMatrixData] = useState<MysqlPermissionsMatrixResponse | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; messageFa: string } | null>(null);

  // Editable Grid Matrix State: Map of "user@host:privilege" -> boolean (hasPrivilege)
  const [currentGrid, setCurrentGrid] = useState<Record<string, boolean>>({});
  const [initialGrid, setInitialGrid] = useState<Record<string, boolean>>({});

  // With Grant Option map per user: Map of "user@host" -> boolean
  const [withGrantOptionMap, setWithGrantOptionMap] = useState<Record<string, boolean>>({});

  // Filter / Search inside the Matrix
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'all' | 'data' | 'structure' | 'admin' | 'routine'>('all');
  const [selectedAccountForPreset, setSelectedAccountForPreset] = useState<string>('');

  // Raw SHOW GRANTS Modal state
  const [inspectModal, setInspectModal] = useState<{
    isOpen: boolean;
    user: string;
    host: string;
    loading: boolean;
    rawGrants: string[];
    parsedGrants: MysqlUserGrant[];
    error?: string;
  }>({
    isOpen: false,
    user: '',
    host: '',
    loading: false,
    rawGrants: [],
    parsedGrants: [],
  });

  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Fetch Databases if empty
  useEffect(() => {
    if (!server?.id) return;
    if (dbList.length === 0) {
      fetchRemoteServerMysqlDatabases(server.id)
        .then((res) => {
          if (res.success && res.databases) {
            const names = res.databases.map((d) => d.name).filter((n) => !['information_schema', 'performance_schema', 'sys'].includes(n));
            setDbList(names);
            if (!database && names.length > 0) {
              setDatabase(names[0]);
            }
          }
        })
        .catch(() => {});
    } else if (!database && dbList.length > 0) {
      setDatabase(dbList[0]);
    }
  }, [server?.id, dbList, database]);

  // Load Permissions Matrix for current target scope
  const loadPermissions = useCallback(async () => {
    if (!server?.id) return;
    if (scope === 'database' && !database) return;
    if (scope === 'table' && (!database || !table)) return;
    if (scope === 'column' && (!database || !table || !column)) return;
    if (scope === 'routine' && (!database || !routineName)) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetchRemoteServerMysqlPermissions(server.id, {
        scope,
        database: scope !== 'global' ? database : undefined,
        table: scope === 'table' || scope === 'column' ? table : undefined,
        column: scope === 'column' ? column : undefined,
        routineType: scope === 'routine' ? routineType : undefined,
        routineName: scope === 'routine' ? routineName : undefined,
      });

      if (res.success && res.accounts) {
        setMatrixData(res);
        const grid: Record<string, boolean> = {};
        const grantOptMap: Record<string, boolean> = {};

        for (const acc of res.accounts) {
          const accKey = `${acc.user}@${acc.host}`;
          grantOptMap[accKey] = Boolean(acc.hasGrantOption);

          for (const priv of res.applicablePrivileges) {
            const key = `${accKey}:${priv.name}`;
            grid[key] = Boolean(acc.privileges[priv.name]);
          }
        }

        setInitialGrid(grid);
        setCurrentGrid(grid);
        setWithGrantOptionMap(grantOptMap);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to load permissions matrix.',
          messageFa: res.errorFa || 'خطا در بارگذاری ماتریس مجوزهای MySQL.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error fetching permissions.',
        messageFa: 'خطای شبکه در دریافت مجوزهای MySQL.',
      });
    } finally {
      setLoading(false);
    }
  }, [server?.id, scope, database, table, column, routineType, routineName]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Calculate pending Deltas between initialGrid and currentGrid
  const pendingDeltas = useMemo(() => {
    if (!matrixData) return [];
    const deltas: MysqlPermissionDelta[] = [];

    for (const acc of matrixData.accounts) {
      // Superusers usually have unrestricted global rights, but allow granting specific object rights
      const accKey = `${acc.user}@${acc.host}`;
      const withGrantOption = Boolean(withGrantOptionMap[accKey]);

      for (const priv of matrixData.applicablePrivileges) {
        const key = `${accKey}:${priv.name}`;
        const initialVal = Boolean(initialGrid[key]);
        const currentVal = Boolean(currentGrid[key]);

        if (initialVal !== currentVal) {
          deltas.push({
            user: acc.user,
            host: acc.host,
            privilege: priv.name,
            action: currentVal ? 'grant' : 'revoke',
            withGrantOption: currentVal ? withGrantOption : undefined,
          });
        }
      }
    }
    return deltas;
  }, [matrixData, initialGrid, currentGrid, withGrantOptionMap]);

  // Target label and SQL clause helper
  const targetClause = useMemo(() => {
    if (scope === 'global') return '*.*';
    if (scope === 'database') return `\`${database || '*'}\`.*`;
    if (scope === 'table') return `\`${database || '*'}\`.\`${table || '*'}\``;
    if (scope === 'column') return `\`${database || '*'}\`.\`${table || '*'}\` (\`${column || '*'}\`)`;
    if (scope === 'routine') return `${routineType} \`${database || '*'}\`.\`${routineName || '*'}\``;
    return '*.*';
  }, [scope, database, table, column, routineType, routineName]);

  // Generated SQL preview string
  const previewSql = useMemo(() => {
    if (pendingDeltas.length === 0) return '';
    const stmts: string[] = [];

    for (const d of pendingDeltas) {
      const safeUser = d.user.replace(/'/g, "''");
      const safeHost = d.host.replace(/'/g, "''");
      let privClause = d.privilege;

      if (scope === 'column' && column) {
        privClause = `${d.privilege} (\`${column.replace(/`/g, '``')}\`)`;
      }

      if (d.action === 'grant') {
        if (d.privilege === 'GRANT OPTION') {
          stmts.push(`GRANT USAGE ON ${targetClause} TO '${safeUser}'@'${safeHost}' WITH GRANT OPTION;`);
        } else {
          const withOpt = d.withGrantOption ? ' WITH GRANT OPTION' : '';
          stmts.push(`GRANT ${privClause} ON ${targetClause} TO '${safeUser}'@'${safeHost}'${withOpt};`);
        }
      } else {
        if (d.privilege === 'GRANT OPTION') {
          stmts.push(`REVOKE GRANT OPTION ON ${targetClause} FROM '${safeUser}'@'${safeHost}';`);
        } else {
          stmts.push(`REVOKE ${privClause} ON ${targetClause} FROM '${safeUser}'@'${safeHost}';`);
        }
      }
    }

    stmts.push('FLUSH PRIVILEGES;');
    return stmts.join('\n');
  }, [pendingDeltas, scope, column, targetClause]);

  // Toggle single privilege in grid
  const togglePrivilege = (user: string, host: string, priv: string) => {
    const key = `${user}@${host}:${priv}`;
    setCurrentGrid((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Toggle all privileges for an account
  const toggleAllForAccount = (user: string, host: string, enable: boolean) => {
    if (!matrixData) return;
    const accKey = `${user}@${host}`;
    setCurrentGrid((prev) => {
      const next = { ...prev };
      for (const priv of matrixData.applicablePrivileges) {
        next[`${accKey}:${priv.name}`] = enable;
      }
      return next;
    });
  };

  // Toggle single privilege column for all visible accounts
  const toggleColumnForAll = (priv: string, enable: boolean) => {
    if (!matrixData) return;
    setCurrentGrid((prev) => {
      const next = { ...prev };
      for (const acc of matrixData.accounts) {
        next[`${acc.user}@${acc.host}:${priv}`] = enable;
      }
      return next;
    });
  };

  // Apply a template preset to an account
  const applyPresetToAccount = (userHost: string, presetId: string) => {
    const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId);
    if (!preset || !matrixData) return;

    setCurrentGrid((prev) => {
      const next = { ...prev };
      // First clear all
      for (const priv of matrixData.applicablePrivileges) {
        next[`${userHost}:${priv.name}`] = false;
      }
      // Enable preset privs
      for (const p of preset.privs) {
        if (matrixData.applicablePrivileges.some((ap) => ap.name === p)) {
          next[`${userHost}:${p}`] = true;
        }
      }
      return next;
    });

    if (preset.withGrantOption) {
      setWithGrantOptionMap((prev) => ({
        ...prev,
        [userHost]: true,
      }));
    }
  };

  // Discard all unsaved modifications
  const handleDiscard = () => {
    setCurrentGrid({ ...initialGrid });
  };

  // Inspect SHOW GRANTS for a user
  const handleInspectGrants = async (user: string, host: string) => {
    setInspectModal({
      isOpen: true,
      user,
      host,
      loading: true,
      rawGrants: [],
      parsedGrants: [],
    });

    try {
      const res = await fetchRemoteServerMysqlGrants(server.id, user, host);
      if (res.success) {
        setInspectModal({
          isOpen: true,
          user,
          host,
          loading: false,
          rawGrants: res.rawGrants || [],
          parsedGrants: res.grants || [],
        });
      } else {
        setInspectModal((prev) => ({
          ...prev,
          loading: false,
          error: res.error || 'Failed to fetch user grants',
        }));
      }
    } catch (err: any) {
      setInspectModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Network error fetching user grants',
      }));
    }
  };

  // Apply pending permissions changes
  const handleApplyPermissions = async () => {
    if (!server?.id || pendingDeltas.length === 0) return;
    setApplying(true);
    setFeedback(null);

    try {
      const res = await applyRemoteServerMysqlPermissions(server.id, {
        scope,
        database: scope !== 'global' ? database : undefined,
        table: scope === 'table' || scope === 'column' ? table : undefined,
        column: scope === 'column' ? column : undefined,
        routineType: scope === 'routine' ? routineType : undefined,
        routineName: scope === 'routine' ? routineName : undefined,
        deltas: pendingDeltas,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Permissions updated successfully.',
          messageFa: res.messageFa || 'سطوح دسترسی با موفقیت به‌روزرسانی شد.',
        });
        setIsPreviewOpen(false);
        // Refresh permissions
        loadPermissions();
        if (onRefreshOverview) onRefreshOverview();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Error executing permission statements.',
          messageFa: res.errorFa || 'خطا در اعمال تغییرات مجوزها.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error applying permissions.',
        messageFa: 'خطای شبکه در اعمال مجوزها.',
      });
    } finally {
      setApplying(false);
    }
  };

  // Filtered accounts for display
  const filteredAccounts = useMemo(() => {
    if (!matrixData?.accounts) return [];
    if (!accountSearch.trim()) return matrixData.accounts;
    const q = accountSearch.toLowerCase().trim();
    return matrixData.accounts.filter(
      (acc) => acc.user.toLowerCase().includes(q) || acc.host.toLowerCase().includes(q)
    );
  }, [matrixData?.accounts, accountSearch]);

  // Filtered applicable privileges by category
  const filteredPrivileges = useMemo(() => {
    if (!matrixData?.applicablePrivileges) return [];
    if (selectedCategoryFilter === 'all') return matrixData.applicablePrivileges;
    return matrixData.applicablePrivileges.filter((p) => p.category === selectedCategoryFilter);
  }, [matrixData?.applicablePrivileges, selectedCategoryFilter]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- */}
      {/* 1. TOP TARGET CONTROLS (Scope & Object Choosers)     */}
      {/* ---------------------------------------------------- */}
      <div
        className={`p-4 rounded-xl border transition ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/10'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Scope Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <Key className="w-3.5 h-3.5 text-orange-400" />
              <span>{isEn ? 'Privilege Scope' : 'سطح و دامنه دسترسی'}</span>
              <FieldInfoTooltip
                title={isEn ? 'Privilege Scope' : 'دامنه دسترسی در MySQL'}
                whatIsIt={
                  isEn
                    ? 'Determines whether permissions apply globally across all databases (*.*), to a single database (db.*), or to specific tables and routines.'
                    : 'مشخص می‌کند که مجوزها به طور سراسری روی تمام دیتابیس‌ها (*.*)، یا یک دیتابیس خاص (db.*) یا جدول و رویه معین اعمال شوند.'
                }
                whyNeeded={
                  isEn
                    ? 'Enforces the Principle of Least Privilege (PoLP) and isolates database access between microservices or tenant accounts.'
                    : 'اصل حداقل سطح دسترسی (PoLP) را پیاده‌سازی کرده و امنیت داده‌ها را بین سرویس‌ها تضمین می‌کند.'
                }
                example={
                  isEn
                    ? 'Global: *.* for DBAs; Database: mydb.* for App users; Table: mydb.audit_logs for security collectors.'
                    : 'سراسری: *.* برای ادمین‌ها؛ دیتابیس: mydb.* برای برنامه‌ها؛ جدول: mydb.audit_logs برای لاگرها.'
                }
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'global', label: isEn ? 'Global (*.*)' : 'سراسری (*.*)', icon: Shield },
                { id: 'database', label: isEn ? 'Database (db.*)' : 'پایگاه داده (db.*)', icon: Database },
                { id: 'table', label: isEn ? 'Table (db.table)' : 'جدول (db.table)', icon: TableIcon },
                { id: 'column', label: isEn ? 'Column' : 'ستون جدول', icon: Sliders },
                { id: 'routine', label: isEn ? 'Routine (Proc/Func)' : 'رویه یا تابع', icon: Code2 },
              ].map((s) => {
                const Icon = s.icon;
                const isSelected = scope === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setScope(s.id as MysqlPrivilegeScope);
                      if (s.id === 'database' && !database && dbList.length > 0) setDatabase(dbList[0]);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                      isSelected
                        ? 'bg-orange-500 text-white shadow-xs'
                        : isLightMode
                        ? 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Target Inputs */}
          <div className="flex items-center gap-2 flex-wrap">
            {scope !== 'global' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">{isEn ? 'Database:' : 'پایگاه داده:'}</span>
                <select
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden transition cursor-pointer font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-800 border-white/10 text-slate-200'
                  }`}
                >
                  {dbList.map((db) => (
                    <option key={db} value={db}>
                      {db}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(scope === 'table' || scope === 'column') && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">{isEn ? 'Table:' : 'جدول:'}</span>
                <input
                  type="text"
                  placeholder={isEn ? 'table_name' : 'نام جدول'}
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  className={`w-32 px-2.5 py-1.5 rounded-lg text-xs border outline-hidden font-mono transition ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-orange-500'
                      : 'bg-slate-800 border-white/10 text-slate-200 focus:border-orange-500'
                  }`}
                />
              </div>
            )}

            {scope === 'column' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 font-medium">{isEn ? 'Column:' : 'ستون:'}</span>
                <input
                  type="text"
                  placeholder={isEn ? 'column_name' : 'نام ستون'}
                  value={column}
                  onChange={(e) => setColumn(e.target.value)}
                  className={`w-28 px-2.5 py-1.5 rounded-lg text-xs border outline-hidden font-mono transition ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-orange-500'
                      : 'bg-slate-800 border-white/10 text-slate-200 focus:border-orange-500'
                  }`}
                />
              </div>
            )}

            {scope === 'routine' && (
              <>
                <select
                  value={routineType}
                  onChange={(e) => setRoutineType(e.target.value as MysqlRoutineType)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden transition cursor-pointer font-mono ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-800 border-white/10 text-slate-200'
                  }`}
                >
                  <option value="PROCEDURE">PROCEDURE</option>
                  <option value="FUNCTION">FUNCTION</option>
                </select>
                <input
                  type="text"
                  placeholder={isEn ? 'routine_name' : 'نام رویه یا تابع'}
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  className={`w-36 px-2.5 py-1.5 rounded-lg text-xs border outline-hidden font-mono transition ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 focus:border-orange-500'
                      : 'bg-slate-800 border-white/10 text-slate-200 focus:border-orange-500'
                  }`}
                />
              </>
            )}

            <button
              type="button"
              onClick={loadPermissions}
              disabled={loading}
              className={`p-2 rounded-lg border flex items-center gap-1 text-xs font-medium transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
              title={isEn ? 'Reload Matrix' : 'بارگذاری مجدد ماتریس'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Current Target Banner */}
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>{isEn ? 'Active Target:' : 'هدف فعال:'}</span>
            <span className="px-2 py-0.5 rounded font-mono font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
              {targetClause}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            {isEn
              ? 'Changes are held in memory until you review the SQL diff and click Apply.'
              : 'تغییرات در حافظه موقت نگهداری شده و پس از بازبینی SQL و کلیک روی اعمال، ذخیره می‌شوند.'}
          </span>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs transition animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : 'bg-rose-950/40 border-rose-800 text-rose-200'
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
          <button type="button" onClick={() => setFeedback(null)} className="p-1 hover:opacity-70 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. TEMPLATE PRESETS TOOLBAR                          */}
      {/* ---------------------------------------------------- */}
      <div
        className={`p-3 rounded-xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/10'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Quick Template Presets:' : 'الگوهای سریع دسترسی:'}</span>
          </div>

          {/* Account Selector for Preset */}
          <select
            value={selectedAccountForPreset}
            onChange={(e) => setSelectedAccountForPreset(e.target.value)}
            className={`px-2.5 py-1 rounded-lg text-xs border outline-hidden transition cursor-pointer font-mono ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-800 border-white/10 text-slate-200'
            }`}
          >
            <option value="">{isEn ? 'Select User@Host...' : 'انتخاب کاربر@هاست...'}</option>
            {matrixData?.accounts.map((acc) => (
              <option key={`${acc.user}@${acc.host}`} value={`${acc.user}@${acc.host}`}>
                {acc.user}@{acc.host}
              </option>
            ))}
          </select>

          {/* Preset Buttons */}
          {TEMPLATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={!selectedAccountForPreset}
              onClick={() => applyPresetToAccount(selectedAccountForPreset, preset.id)}
              className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title={isEn ? preset.descriptionEn : preset.descriptionFa}
            >
              {isEn ? preset.labelEn : preset.labelFa}
            </button>
          ))}
        </div>

        {/* Search input for accounts */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={isEn ? 'Filter users/hosts...' : 'جستجو در کاربران و هاست‌ها...'}
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            className={`w-full pl-8 pr-3 py-1 rounded-lg border text-xs outline-hidden transition ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800 focus:border-orange-500'
                : 'bg-slate-950 border-white/10 text-slate-200 focus:border-orange-500'
            }`}
          />
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. CATEGORY FILTER PILLS                             */}
      {/* ---------------------------------------------------- */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <span className="text-slate-500 text-[11px] mr-1">{isEn ? 'Filter Privileges:' : 'فیلتر مجوزها:'}</span>
        {[
          { id: 'all', label: isEn ? 'All Privileges' : 'تمامی مجوزها' },
          { id: 'data', label: isEn ? 'Data (DML)' : 'عملیات داده (DML)', color: 'text-emerald-400' },
          { id: 'structure', label: isEn ? 'Structure (DDL)' : 'ساختار (DDL)', color: 'text-blue-400' },
          { id: 'admin', label: isEn ? 'Admin & Server' : 'مدیریتی و سرور', color: 'text-purple-400' },
          { id: 'routine', label: isEn ? 'Routines' : 'توابع و رویه‌ها', color: 'text-amber-400' },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategoryFilter(cat.id as any)}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer border ${
              selectedCategoryFilter === cat.id
                ? 'bg-orange-500 text-white border-orange-500'
                : isLightMode
                ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
            }`}
          >
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------- */}
      {/* 4. PERMISSIONS MATRIX TABLE                          */}
      {/* ---------------------------------------------------- */}
      <div
        className={`rounded-xl border overflow-hidden transition ${
          isLightMode ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/80 border-white/10'
        }`}
      >
        <div className="overflow-x-auto max-h-[550px] custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            {/* Table Header */}
            <thead className="sticky top-0 z-10 shadow-xs">
              <tr
                className={`border-b text-[11px] font-bold tracking-wider ${
                  isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-slate-950 border-white/10 text-slate-300'
                }`}
              >
                {/* Account Column */}
                <th className="py-3 px-3 min-w-[200px] sticky left-0 z-20 backdrop-blur-md bg-inherit">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-orange-400" />
                    <span>{isEn ? "User Account ('user'@'host')" : "حساب کاربری ('کاربر'@'هاست')"}</span>
                  </div>
                </th>

                {/* Inspect Grants action */}
                <th className="py-3 px-2 w-20 text-center">{isEn ? 'Grants' : 'مجوزها'}</th>

                {/* With Grant Option Column */}
                <th className="py-3 px-2 w-28 text-center" title={isEn ? 'Allows the grantee to give these permissions to other users' : 'اجازه تفویض دسترسی به سایر کاربران'}>
                  <div className="flex items-center justify-center gap-1 text-purple-400">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{isEn ? 'Grant Opt' : 'تفویض'}</span>
                  </div>
                </th>

                {/* Applicable Privileges Columns */}
                {filteredPrivileges.map((p) => {
                  const catColor =
                    p.category === 'data'
                      ? 'text-emerald-400'
                      : p.category === 'structure'
                      ? 'text-blue-400'
                      : p.category === 'admin'
                      ? 'text-purple-400'
                      : 'text-amber-400';

                  return (
                    <th
                      key={p.name}
                      className="py-3 px-2 text-center min-w-[90px] border-l border-white/5 group select-none"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`font-mono text-[11px] ${catColor}`} title={isEn ? p.descriptionEn : p.descriptionFa}>
                          {p.name}
                        </span>
                        {/* Column Quick Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition mt-0.5">
                          <button
                            type="button"
                            onClick={() => toggleColumnForAll(p.name, true)}
                            title={isEn ? `Grant ${p.name} to all` : `اعطای ${p.name} به همه`}
                            className="p-0.5 text-[9px] rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleColumnForAll(p.name, false)}
                            title={isEn ? `Revoke ${p.name} from all` : `لغو ${p.name} از همه`}
                            className="p-0.5 text-[9px] rounded bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 cursor-pointer"
                          >
                            -
                          </button>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-white/5">
              {loading && !matrixData ? (
                <tr>
                  <td colSpan={filteredPrivileges.length + 3} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-orange-400" />
                      <span>{isEn ? 'Querying MySQL server grants matrix...' : 'در حال دریافت اطلاعات مجوزهای MySQL...'}</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={filteredPrivileges.length + 3} className="py-10 text-center text-slate-400">
                    {isEn ? 'No MySQL accounts found matching filter.' : 'هیچ کاربری با این مشخصات یافت نشد.'}
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const accKey = `${acc.user}@${acc.host}`;
                  const isSuper = Boolean(acc.isSuperuser);
                  const withGrantOption = Boolean(withGrantOptionMap[accKey]);

                  return (
                    <tr
                      key={accKey}
                      className={`transition ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Account Name Cell (Sticky Left) */}
                      <td className="py-2.5 px-3 sticky left-0 z-10 backdrop-blur-md bg-inherit font-mono">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200">
                              '{acc.user}'@'{acc.host}'
                            </span>
                            {isSuper && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                {isEn ? 'SUPER' : 'ارشد'}
                              </span>
                            )}
                          </div>

                          {/* Row Quick Action: All / None */}
                          <div className="flex items-center gap-1 opacity-0 hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() => toggleAllForAccount(acc.user, acc.host, true)}
                              title={isEn ? 'Grant all' : 'اعطای همه'}
                              className="px-1 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer"
                            >
                              {isEn ? 'All' : 'همه'}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleAllForAccount(acc.user, acc.host, false)}
                              title={isEn ? 'Clear all' : 'حذف همه'}
                              className="px-1 py-0.5 rounded text-[10px] bg-rose-500/15 text-rose-400 hover:bg-rose-500/30 cursor-pointer"
                            >
                              {isEn ? 'None' : 'هیچ'}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Inspect SHOW GRANTS Button */}
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleInspectGrants(acc.user, acc.host)}
                          className="px-2 py-1 rounded text-[11px] font-medium border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition cursor-pointer flex items-center justify-center gap-1 mx-auto"
                          title={isEn ? "Run SHOW GRANTS for this account" : "مشاهده دستورات SHOW GRANTS"}
                        >
                          <Eye className="w-3 h-3" />
                          <span>{isEn ? 'View' : 'نمایش'}</span>
                        </button>
                      </td>

                      {/* WITH GRANT OPTION Checkbox */}
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={withGrantOption}
                          onChange={(e) =>
                            setWithGrantOptionMap((prev) => ({
                              ...prev,
                              [accKey]: e.target.checked,
                            }))
                          }
                          className="rounded border-slate-700 text-purple-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Privilege Cells */}
                      {filteredPrivileges.map((p) => {
                        const cellKey = `${accKey}:${p.name}`;
                        const currentVal = Boolean(currentGrid[cellKey]);
                        const initialVal = Boolean(initialGrid[cellKey]);
                        const isModified = currentVal !== initialVal;

                        let cellBg = '';
                        if (isModified) {
                          cellBg = currentVal ? 'bg-emerald-500/15' : 'bg-rose-500/15';
                        }

                        return (
                          <td
                            key={p.name}
                            onClick={() => togglePrivilege(acc.user, acc.host, p.name)}
                            className={`py-2 px-2 text-center border-l border-white/5 cursor-pointer transition select-none ${cellBg} ${
                              isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-center">
                              {currentVal ? (
                                <div
                                  className={`w-5 h-5 rounded flex items-center justify-center shadow-xs transition ${
                                    isModified
                                      ? 'bg-emerald-500 text-white animate-pulse'
                                      : 'bg-blue-600 text-white'
                                  }`}
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              ) : (
                                <div
                                  className={`w-5 h-5 rounded border flex items-center justify-center transition ${
                                    isModified
                                      ? 'border-rose-500 bg-rose-500/20 text-rose-400'
                                      : 'border-slate-700 text-transparent hover:border-slate-500'
                                  }`}
                                >
                                  {isModified ? <X className="w-3.5 h-3.5" /> : null}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 5. BOTTOM PENDING CHANGES & ACTION BAR               */}
      {/* ---------------------------------------------------- */}
      {pendingDeltas.length > 0 && (
        <div
          className={`sticky bottom-2 z-20 p-3.5 rounded-xl border shadow-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            isLightMode
              ? 'bg-white border-orange-300 text-slate-800'
              : 'bg-slate-950 border-orange-500/40 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold flex items-center gap-2">
                <span>
                  {isEn
                    ? `${pendingDeltas.length} Unsaved Permission Modification(s)`
                    : `${pendingDeltas.length} تغییر ذخیره نشده در سطوح دسترسی`}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400">
                  +{pendingDeltas.filter((d) => d.action === 'grant').length} {isEn ? 'Grants' : 'اعطا'}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-500/20 text-rose-400">
                  -{pendingDeltas.filter((d) => d.action === 'revoke').length} {isEn ? 'Revokes' : 'لغو'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isEn
                  ? 'Click Preview SQL to inspect the exact GRANT/REVOKE commands before execution.'
                  : 'برای مشاهده دقیق دستورات GRANT/REVOKE قبل از اعمال نهایی، روی پیش‌نمایش کلیک کنید.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isEn ? 'Discard' : 'انصراف و بازنشانی'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-md flex items-center gap-1.5 transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isEn ? 'Preview SQL & Apply' : 'پیش‌نمایش SQL و اعمال'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 6. MODAL A: PREVIEW SQL & APPLY CHANGES              */}
      {/* ---------------------------------------------------- */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b flex items-center justify-between border-white/10">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-orange-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'Review MySQL Permissions Changes' : 'بازبینی تغییرات سطوح دسترسی MySQL'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? `Applying ${pendingDeltas.length} permission change(s) on ${targetClause}`
                      : `اعمال ${pendingDeltas.length} تغییر مجوز روی دامنه ${targetClause}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {/* Diff summary pills */}
              <div className="space-y-1.5">
                <span className="font-semibold text-slate-300">{isEn ? 'Affected Accounts & Privileges:' : 'کاربران و مجوزهای متاثر:'}</span>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-2 rounded-lg bg-black/20 border border-white/5">
                  {pendingDeltas.map((d, i) => (
                    <span
                      key={i}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 border ${
                        d.action === 'grant'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      <span className="font-bold">{d.action === 'grant' ? '+GRANT' : '-REVOKE'}</span>
                      <span>{d.privilege}</span>
                      <span className="text-slate-500">→</span>
                      <span>'{d.user}'@'{d.host}'</span>
                      {d.withGrantOption && <span className="text-purple-400">(+OPT)</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* SQL Code View */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">{isEn ? 'Generated SQL Script:' : 'دستورات اجرایی SQL:'}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(previewSql)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSql ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy SQL' : 'کپی SQL'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-950 border border-white/10 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-56 leading-relaxed select-all">
                  {previewSql}
                </pre>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  {isEn
                    ? 'All statements will be executed sequentially followed by FLUSH PRIVILEGES. Audit records will be logged.'
                    : 'دستورات به صورت ترتیبی اجرا شده و در انتها دستور FLUSH PRIVILEGES صادر خواهد شد. عملیات در لاگ امنیتی ثبت می‌شود.'}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className={`px-4 py-2 rounded-lg text-xs font-medium border transition cursor-pointer ${
                  isLightMode
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={handleApplyPermissions}
                disabled={applying}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                {applying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Executing SQL...' : 'در حال اعمال...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Confirm & Execute' : 'تایید و اجرای نهایی'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 7. MODAL B: SHOW GRANTS RAW INSPECTOR                */}
      {/* ---------------------------------------------------- */}
      {inspectModal.isOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-white/10'
            }`}
          >
            <div className="p-4 border-b flex items-center justify-between border-white/10">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    {isEn ? 'SHOW GRANTS Inspection' : 'بررسی دستورات SHOW GRANTS'}
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    '{inspectModal.user}'@'{inspectModal.host}'
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectModal({ ...inspectModal, isOpen: false })}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {inspectModal.loading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-2" />
                  <span>{isEn ? 'Running SHOW GRANTS...' : 'در حال اجرای SHOW GRANTS...'}</span>
                </div>
              ) : inspectModal.error ? (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  {inspectModal.error}
                </div>
              ) : (
                <>
                  {/* Parsed Grants Summary */}
                  <div className="space-y-1.5">
                    <span className="font-semibold text-slate-300">{isEn ? 'Parsed Scope Breakdown:' : 'تحلیل دامنه‌های دسترسی:'}</span>
                    <div className="space-y-1.5">
                      {inspectModal.parsedGrants.map((g, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-black/20 border border-white/5 flex flex-col gap-1 text-[11px]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-orange-400">
                              {g.scope.toUpperCase()}: {g.database ? `\`${g.database}\`` : '*'}{g.table ? `.\`${g.table}\`` : ''}{g.routineName ? ` (${g.routineType} ${g.routineName})` : ''}
                            </span>
                            {g.withGrantOption && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                WITH GRANT OPTION
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {g.privileges.map((p) => (
                              <span key={p} className="px-1.5 py-0.2 rounded bg-white/5 text-slate-300 font-mono text-[10px]">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Raw SQL Output */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">{isEn ? 'Raw SHOW GRANTS Output:' : 'خروجی متنی خام SHOW GRANTS:'}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(inspectModal.rawGrants.join('\n'))}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
                      >
                        {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedSql ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy' : 'کپی'}</span>
                      </button>
                    </div>
                    <pre className="p-3 rounded-xl bg-slate-950 border border-white/10 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-56 leading-relaxed select-all">
                      {inspectModal.rawGrants.join('\n')}
                    </pre>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-white/10 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setInspectModal({ ...inspectModal, isOpen: false })}
                className="px-4 py-1.5 rounded-lg text-xs font-medium border border-white/10 hover:bg-white/10 text-slate-300 transition cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
