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
} from 'lucide-react';
import {
  RemoteServer,
  PostgresObjectScope,
  PostgresPrivilegeType,
  PostgresObjectPermissionsInfo,
  PostgresPermissionDelta,
  PostgresRolePermissionsEntry,
} from '../../types';
import {
  fetchRemoteServerPostgresPermissions,
  applyRemoteServerPostgresPermissions,
  fetchRemoteServerPostgresDatabases,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresPermissionsManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  initialScope?: PostgresObjectScope;
  initialDatabase?: string;
  initialSchema?: string;
  initialObjectName?: string;
}

const TEMPLATE_PRESETS: Record<
  PostgresObjectScope,
  { labelEn: string; labelFa: string; privs: PostgresPrivilegeType[] }[]
> = {
  database: [
    { labelEn: 'Read/Connect', labelFa: 'اتصال و خواندن', privs: ['CONNECT'] },
    { labelEn: 'Full Developer', labelFa: 'توسعه‌دهنده کامل', privs: ['CONNECT', 'CREATE', 'TEMPORARY'] },
  ],
  schema: [
    { labelEn: 'Usage (Read)', labelFa: 'استفاده (خواندن)', privs: ['USAGE'] },
    { labelEn: 'Full Schema Creator', labelFa: 'ایجاد اشیاء در اسکیما', privs: ['USAGE', 'CREATE'] },
  ],
  table: [
    { labelEn: 'Read-Only (SELECT)', labelFa: 'فقط خواندنی', privs: ['SELECT'] },
    { labelEn: 'Read-Write (Data)', labelFa: 'خواندن و نوشتن داده', privs: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
    { labelEn: 'Full Table Admin', labelFa: 'مدیریت کامل جدول', privs: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] },
  ],
  sequence: [
    { labelEn: 'Usage (NextVal)', labelFa: 'تولید شناسه (NextVal)', privs: ['USAGE', 'SELECT'] },
    { labelEn: 'Full Sequence', labelFa: 'مدیریت کامل توالی', privs: ['USAGE', 'SELECT', 'UPDATE'] },
  ],
  function: [
    { labelEn: 'Execute', labelFa: 'اجازه اجرا', privs: ['EXECUTE'] },
  ],
};

export const PostgresPermissionsManagerTab: React.FC<PostgresPermissionsManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  initialScope = 'database',
  initialDatabase = 'postgres',
  initialSchema = 'public',
  initialObjectName = 'postgres',
}) => {
  // Target Selection State
  const [scope, setScope] = useState<PostgresObjectScope>(initialScope);
  const [database, setDatabase] = useState(initialDatabase);
  const [schema, setSchema] = useState(initialSchema);
  const [objectName, setObjectName] = useState(initialObjectName);

  // Available Databases list
  const [dbList, setDbList] = useState<string[]>(['postgres']);

  // Loading & State
  const [loading, setLoading] = useState(false);
  const [permData, setPermData] = useState<PostgresObjectPermissionsInfo | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string; messageFa: string } | null>(null);

  // Editable Grid Matrix State: Map of "roleName:privilege" -> boolean (hasPrivilege)
  const [currentGrid, setCurrentGrid] = useState<Record<string, boolean>>({});
  const [initialGrid, setInitialGrid] = useState<Record<string, boolean>>({});

  // Filter / Search inside the Matrix
  const [roleSearch, setRoleSearch] = useState('');
  const [selectedRoleForTemplate, setSelectedRoleForTemplate] = useState<string>('');

  // Cascade toggle for revokes
  const [cascadeRevoke, setCascadeRevoke] = useState(false);

  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  // Fetch Databases on mount
  useEffect(() => {
    if (!server?.id) return;
    fetchRemoteServerPostgresDatabases(server.id)
      .then((res) => {
        if (res.success && res.databases) {
          const names = res.databases.map((d) => d.name);
          setDbList(names);
          if (!names.includes(database) && names.length > 0) {
            setDatabase(names[0]);
          }
        }
      })
      .catch(() => {});
  }, [server?.id]);

  // Load Permissions for current target
  const loadPermissions = useCallback(async () => {
    if (!server?.id || !database || !objectName.trim()) return;
    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetchRemoteServerPostgresPermissions(server.id, {
        scope,
        database,
        schema: scope !== 'database' ? schema : undefined,
        objectName: objectName.trim(),
      });

      if (res.success && res.data) {
        setPermData(res.data);
        const grid: Record<string, boolean> = {};

        for (const rg of res.data.roleGrants) {
          for (const priv of res.data.applicablePrivileges) {
            const hasPriv = rg.privileges.some((p) => p.privilege.toUpperCase() === priv.toUpperCase());
            grid[`${rg.roleName}:${priv}`] = hasPriv;
          }
        }

        setInitialGrid(grid);
        setCurrentGrid(grid);
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to load permissions.',
          messageFa: res.errorFa || 'خطا در بارگذاری دسترسی‌های شیء.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error fetching permissions.',
        messageFa: 'خطای شبکه در دریافت دسترسی‌ها.',
      });
    } finally {
      setLoading(false);
    }
  }, [server?.id, scope, database, schema, objectName]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Calculate pending Deltas between initialGrid and currentGrid
  const pendingDeltas = useMemo(() => {
    if (!permData) return [];
    const deltas: PostgresPermissionDelta[] = [];

    for (const rg of permData.roleGrants) {
      // Superusers or Owners don't need GRANT/REVOKE as they have absolute implicit rights
      if (rg.isSuperuser) continue;

      for (const priv of permData.applicablePrivileges) {
        const key = `${rg.roleName}:${priv}`;
        const initialVal = Boolean(initialGrid[key]);
        const currentVal = Boolean(currentGrid[key]);

        if (initialVal !== currentVal) {
          deltas.push({
            roleName: rg.roleName,
            privilege: priv,
            action: currentVal ? 'grant' : 'revoke',
          });
        }
      }
    }
    return deltas;
  }, [permData, initialGrid, currentGrid]);

  // Generated SQL preview string
  const previewSql = useMemo(() => {
    if (!permData || pendingDeltas.length === 0) return '';
    let targetSql = '';
    if (scope === 'database') {
      targetSql = `DATABASE "${objectName || database}"`;
    } else if (scope === 'schema') {
      targetSql = `SCHEMA "${objectName}"`;
    } else if (scope === 'table') {
      targetSql = `TABLE "${schema}"."${objectName}"`;
    } else if (scope === 'sequence') {
      targetSql = `SEQUENCE "${schema}"."${objectName}"`;
    } else if (scope === 'function') {
      targetSql = `ROUTINE "${schema}"."${objectName}"`;
    }

    const stmts: string[] = [];
    for (const d of pendingDeltas) {
      const roleTarget = d.roleName.toUpperCase() === 'PUBLIC' ? 'PUBLIC' : `"${d.roleName}"`;
      if (d.action === 'grant') {
        stmts.push(`GRANT ${d.privilege} ON ${targetSql} TO ${roleTarget};`);
      } else {
        stmts.push(`REVOKE ${d.privilege} ON ${targetSql} FROM ${roleTarget}${cascadeRevoke ? ' CASCADE' : ' RESTRICT'};`);
      }
    }
    return stmts.join('\n');
  }, [permData, pendingDeltas, scope, schema, objectName, database, cascadeRevoke]);

  // Toggle single privilege in grid
  const togglePrivilege = (roleName: string, priv: PostgresPrivilegeType) => {
    const key = `${roleName}:${priv}`;
    setCurrentGrid((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Toggle all privileges for a role
  const toggleAllForRole = (roleName: string, enable: boolean) => {
    if (!permData) return;
    setCurrentGrid((prev) => {
      const next = { ...prev };
      for (const priv of permData.applicablePrivileges) {
        next[`${roleName}:${priv}`] = enable;
      }
      return next;
    });
  };

  // Apply a Preset Template to selected role
  const applyPresetTemplate = (roleName: string, presetPrivs: PostgresPrivilegeType[]) => {
    if (!permData || !roleName) return;
    setCurrentGrid((prev) => {
      const next = { ...prev };
      for (const priv of permData.applicablePrivileges) {
        next[`${roleName}:${priv}`] = presetPrivs.includes(priv);
      }
      return next;
    });
  };

  // Reset grid back to initial
  const handleReset = () => {
    setCurrentGrid(initialGrid);
  };

  // Submit and execute permissions
  const handleApplyPermissions = async () => {
    if (!server?.id || pendingDeltas.length === 0) return;
    setApplying(true);
    setFeedback(null);

    try {
      const res = await applyRemoteServerPostgresPermissions(server.id, {
        scope,
        database,
        schema: scope !== 'database' ? schema : undefined,
        objectName,
        deltas: pendingDeltas,
        cascade: cascadeRevoke,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Permissions updated successfully.',
          messageFa: res.messageFa || 'سطوح دسترسی با موفقیت اعمال گردید.',
        });
        setIsPreviewOpen(false);
        await loadPermissions();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to apply permissions.',
          messageFa: res.errorFa || res.messageFa || 'خطا در ثبت تغییرات دسترسی.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error applying permissions.',
        messageFa: 'خطای شبکه در اعمال تغییرات دسترسی.',
      });
    } finally {
      setApplying(false);
    }
  };

  // Filtered Roles in the matrix
  const filteredRoleGrants = useMemo(() => {
    if (!permData) return [];
    return permData.roleGrants.filter((rg) =>
      rg.roleName.toLowerCase().includes(roleSearch.toLowerCase())
    );
  }, [permData, roleSearch]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Banner and Quick Object Scope Selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Permissions & Access Management' : 'مدیریت سطوح دسترسی و مجوزها (GRANT / REVOKE)'}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEn
              ? 'Inspect ownership, visualize effective ACLs, and visually assign or revoke privileges without writing manual SQL.'
              : 'مشاهده مالکیت، ماتریس دسترسی‌ها و تخصیص یا سلب مجوزها (GRANT/REVOKE) بدون نیاز به کدنویسی دستی SQL.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadPermissions}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? (isEn ? 'Loading...' : 'در حال دریافت...') : isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>

          <FieldInfoTooltip
            fieldName="PostgreSQL Object Permissions"
            infoWhatEn="Controls database object privileges (SELECT, INSERT, UPDATE, DELETE, USAGE, EXECUTE) for users, groups, and PUBLIC pseudo-role."
            infoWhatFa="کنترل دقیق سطوح دسترسی (خواندن، نوشتن، اجرا و استفاده) اشیای دیتابیس برای کاربران، گروه‌ها و نقش عمومی PUBLIC."
            infoWhyEn="Enforces least-privilege security principle across production databases."
            infoWhyFa="پیاده‌سازی اصل حداقل دسترسی مجاز (Least Privilege) برای حفظ امنیت اطلاعات سازمانی."
            infoExampleEn="GRANT SELECT, INSERT ON TABLE orders TO app_user;"
            infoExampleFa="اعطای دسترسی خواندن و درج به کاربر سفارشات"
            isEn={isEn}
            isLightMode={isLightMode}
          />
        </div>
      </div>

      {/* Target Selector Bar */}
      <div
        className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Scope Selector */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-bold">{isEn ? 'Scope:' : 'محدوده:'}</span>
            <select
              value={scope}
              onChange={(e) => {
                const s = e.target.value as PostgresObjectScope;
                setScope(s);
                if (s === 'database') setObjectName(database);
                else if (s === 'schema') setObjectName('public');
                else setObjectName('');
              }}
              className={`px-2.5 py-1 rounded-lg border outline-none font-semibold ${
                isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950 text-slate-200'
              }`}
            >
              <option value="database">Database</option>
              <option value="schema">Schema</option>
              <option value="table">Table</option>
              <option value="sequence">Sequence</option>
              <option value="function">Function / Routine</option>
            </select>
          </div>

          {/* Database Selector */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-bold">{isEn ? 'DB:' : 'دیتابیس:'}</span>
            <select
              value={database}
              onChange={(e) => {
                setDatabase(e.target.value);
                if (scope === 'database') setObjectName(e.target.value);
              }}
              className={`px-2.5 py-1 rounded-lg border outline-none font-mono ${
                isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950 text-slate-200'
              }`}
            >
              {dbList.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Schema Selector (if not database scope) */}
          {scope !== 'database' && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400 font-bold">{isEn ? 'Schema:' : 'اسکیما:'}</span>
              <input
                type="text"
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                placeholder="public"
                className={`w-24 px-2 py-1 rounded-lg border outline-none font-mono ${
                  isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950 text-slate-200'
                }`}
              />
            </div>
          )}

          {/* Object Name Input */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-bold">{isEn ? 'Object:' : 'شیء:'}</span>
            <input
              type="text"
              value={objectName}
              onChange={(e) => setObjectName(e.target.value)}
              placeholder={scope === 'database' ? database : 'object_name'}
              className={`w-36 px-2.5 py-1 rounded-lg border outline-none font-mono ${
                isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950 text-slate-200'
              }`}
            />
          </div>

          <button
            type="button"
            onClick={loadPermissions}
            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition cursor-pointer"
          >
            {isEn ? 'Inspect' : 'بررسی'}
          </button>
        </div>

        {/* Ownership badge */}
        {permData && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">{isEn ? 'Owner:' : 'مالک شیء:'}</span>
            <span className="px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              {permData.owner}
            </span>
          </div>
        )}
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

      {/* Preset Templates and Role Search */}
      <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
        {/* Preset quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 font-semibold">{isEn ? 'Quick Template:' : 'قالب‌های سریع:'}</span>
          <select
            value={selectedRoleForTemplate}
            onChange={(e) => setSelectedRoleForTemplate(e.target.value)}
            className={`px-2 py-1 rounded-lg border outline-none font-mono ${
              isLightMode ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950 text-slate-200'
            }`}
          >
            <option value="">{isEn ? '-- Select Role --' : '-- انتخاب نقش --'}</option>
            {permData?.roleGrants.map((r) => (
              <option key={r.roleName} value={r.roleName}>
                {r.roleName}
              </option>
            ))}
          </select>

          {TEMPLATE_PRESETS[scope]?.map((tpl, i) => (
            <button
              key={i}
              type="button"
              disabled={!selectedRoleForTemplate}
              onClick={() => applyPresetTemplate(selectedRoleForTemplate, tpl.privs)}
              className={`px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer disabled:opacity-40 ${
                isLightMode
                  ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                  : 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              {isEn ? tpl.labelEn : tpl.labelFa}
            </button>
          ))}
        </div>

        {/* Search Role */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={roleSearch}
            onChange={(e) => setRoleSearch(e.target.value)}
            placeholder={isEn ? 'Search roles in grid...' : 'جستجوی نقش در ماتریس...'}
            className={`w-full pl-8 pr-3 py-1 text-xs rounded-lg border outline-none font-mono ${
              isLightMode
                ? 'border-slate-300 bg-white focus:border-blue-500'
                : 'border-slate-800 bg-slate-950 focus:border-blue-500 text-slate-200'
            }`}
          />
        </div>
      </div>

      {/* Visual Permissions Grid Matrix */}
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
                <th className="p-3 sticky left-0 z-10 bg-inherit min-w-[180px]">
                  {isEn ? 'Role / Grantee' : 'نقش / کاربر'}
                </th>
                <th className="p-3 text-center min-w-[100px]">{isEn ? 'All / None' : 'انتخاب کل'}</th>
                {permData?.applicablePrivileges.map((priv) => (
                  <th key={priv} className="p-3 text-center min-w-[90px]">
                    <div className="flex flex-col items-center">
                      <span className="text-cyan-400">{priv}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading && !permData ? (
                <tr>
                  <td
                    colSpan={(permData?.applicablePrivileges.length || 0) + 2}
                    className="p-8 text-center text-slate-400"
                  >
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    <span>{isEn ? 'Loading object permissions...' : 'در حال بارگذاری دسترسی‌ها...'}</span>
                  </td>
                </tr>
              ) : !permData ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <span>{isEn ? 'Select an object and click Inspect.' : 'شیء مورد نظر را انتخاب و دکمه بررسی را بزنید.'}</span>
                  </td>
                </tr>
              ) : filteredRoleGrants.length === 0 ? (
                <tr>
                  <td
                    colSpan={permData.applicablePrivileges.length + 2}
                    className="p-8 text-center text-slate-400"
                  >
                    <span>{isEn ? 'No roles found matching search.' : 'نقشی با این عبارت یافت نشد.'}</span>
                  </td>
                </tr>
              ) : (
                filteredRoleGrants.map((rg) => {
                  const isPublic = rg.roleName.toUpperCase() === 'PUBLIC';
                  const isOwner = rg.isOwner;
                  const isSuper = rg.isSuperuser;

                  return (
                    <tr
                      key={rg.roleName}
                      className={`transition ${
                        isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Role Name & Type Tag */}
                      <td className="p-3 font-mono sticky left-0 z-10 bg-inherit">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-400 shrink-0" />
                          <div>
                            <span className="font-bold text-slate-200">{rg.roleName}</span>
                            <div className="flex items-center gap-1 mt-0.5">
                              {isSuper && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  SUPERUSER
                                </span>
                              )}
                              {isOwner && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  OWNER
                                </span>
                              )}
                              {isPublic && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  PUBLIC
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* All / None Buttons */}
                      <td className="p-3 text-center">
                        {!isSuper && !isOwner && (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleAllForRole(rg.roleName, true)}
                              title={isEn ? 'Grant All Privileges' : 'اعطای همه دسترسی‌ها'}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-pointer"
                            >
                              ALL
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleAllForRole(rg.roleName, false)}
                              title={isEn ? 'Revoke All Privileges' : 'سلب همه دسترسی‌ها'}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-pointer"
                            >
                              NONE
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Privilege Checkboxes */}
                      {permData.applicablePrivileges.map((priv) => {
                        const key = `${rg.roleName}:${priv}`;
                        const isGranted = Boolean(currentGrid[key]);
                        const initialVal = Boolean(initialGrid[key]);
                        const isModified = isGranted !== initialVal;

                        return (
                          <td key={priv} className="p-3 text-center">
                            {isSuper || isOwner ? (
                              <span
                                title={isEn ? 'Implicit rights via Superuser/Ownership' : 'حقوق ذاتی از طریق سوپریوزر یا مالکیت'}
                                className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-500/10 text-emerald-400"
                              >
                                <Lock className="w-3 h-3 text-emerald-500" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => togglePrivilege(rg.roleName, priv)}
                                className={`w-5 h-5 rounded flex items-center justify-center transition cursor-pointer border ${
                                  isGranted
                                    ? isModified
                                      ? 'bg-blue-600 border-blue-400 text-white shadow-sm ring-2 ring-blue-500/30'
                                      : 'bg-emerald-600 border-emerald-500 text-white'
                                    : isModified
                                    ? 'bg-rose-950/60 border-rose-600 text-rose-400'
                                    : 'border-slate-700 bg-slate-950/40 text-transparent hover:border-slate-500'
                                }`}
                              >
                                {isGranted && <CheckCircle2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
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

      {/* Bottom Action Footer */}
      <div
        className={`p-3 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={cascadeRevoke}
              onChange={(e) => setCascadeRevoke(e.target.checked)}
              className="rounded text-rose-600 focus:ring-0"
            />
            <span className="text-slate-300">
              {isEn ? 'Cascade Revokes (CASCADE)' : 'سلب زنجیره‌ای مجوزها (CASCADE)'}
            </span>
          </label>

          {pendingDeltas.length > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingDeltas.length} {isEn ? 'pending changes' : 'تغییر در انتظار اعمال'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pendingDeltas.length > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isEn ? 'Discard Changes' : 'لغو تغییرات'}</span>
            </button>
          )}

          <button
            type="button"
            disabled={pendingDeltas.length === 0}
            onClick={() => setIsPreviewOpen(true)}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isEn ? 'Review & Apply Changes' : 'بازبینی و اعمال تغییرات'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* REVIEW & PREVIEW SQL MODAL                                                */}
      {/* ========================================================================= */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 max-h-[90vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span>{isEn ? 'Review SQL Permissions Changes' : 'پیش‌نمایش دستورات تغییر دسترسی'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'The following transactional SQL statements will be executed on the PostgreSQL server:'
                : 'دستورات تراکنشی زیر بر روی سرور PostgreSQL اجرا خواهند شد:'}
            </p>

            <pre className="p-3 rounded-xl border border-slate-800 bg-slate-950 text-cyan-300 font-mono text-xs overflow-x-auto max-h-[300px]">
              {previewSql}
            </pre>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                disabled={applying}
                onClick={handleApplyPermissions}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {applying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEn ? 'Execute & Apply' : 'تایید و اجرای تغییرات'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
