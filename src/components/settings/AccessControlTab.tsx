import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Users,
  User,
  FolderTree,
  Plus,
  Trash2,
  Edit,
  Check,
  CheckCircle,
  X,
  Lock,
  Unlock,
  Terminal,
  Power,
  FileText,
  Sliders,
  CheckSquare,
  Square,
  Sparkles,
  HelpCircle,
  Eye,
  Activity,
  Layers,
  Save,
  Radio,
  Server,
  Cpu,
  Router as RouterIcon,
  Globe,
  Wrench,
  HardDrive,
  Archive,
  DownloadCloud,
  UploadCloud,
  LayoutDashboard,
  Network,
  RefreshCw,
  Database,
  RotateCcw,
  Edit2,
  Monitor,
  Search,
  AlertTriangle,
  Flame,
  Info
} from 'lucide-react';
import {
  AccessPolicy,
  DeviceGroup,
  Device,
  ActiveDirectoryConfig,
  LocalUser,
  LocalGroup,
  RemoteServer,
  ServerActionKey,
  ServerActionPermissions,
  NetworkDeviceActionKey,
  NetworkDeviceActionPermissions,
} from '../../types';
import {
  SERVER_ACTIONS_CATALOG,
  FULL_SERVER_PERMISSIONS,
  RESTRICTED_SERVER_PERMISSIONS,
  isServerActionPermitted,
  DEVICE_ACTIONS_CATALOG,
  FULL_DEVICE_PERMISSIONS,
  RESTRICTED_DEVICE_PERMISSIONS,
  EMPTY_DEVICE_PERMISSIONS,
  FULL_PORT_PERMISSIONS,
  EMPTY_PORT_PERMISSIONS,
  FULL_EQUIPMENT_PERMISSIONS,
  EMPTY_EQUIPMENT_PERMISSIONS,
  isDeviceActionPermitted,
} from '../../utils/rbac';
import { fetchRemoteServers } from '../../services/api';
import { FieldInfoTooltip } from '../vpn/FieldInfoTooltip';
import {
  loadLocalUsers,
  loadLocalGroups,
  loadSimulatedRoleId,
  saveSimulatedRoleId,
  syncLocalUsersFromDatabase,
  syncLocalGroupsFromDatabase,
  syncDeviceGroupsFromDatabase,
  syncActiveDirectoryConfigFromDatabase,
} from '../../services/settingsStorage';
import { logPortalEvent } from '../../services/auditLogger';
import { useLanguage } from '../../i18n';

interface AccessControlTabProps {
  policies: AccessPolicy[];
  groups: DeviceGroup[];
  devices: Device[];
  adConfig: ActiveDirectoryConfig;
  onSavePolicies: (policies: AccessPolicy[]) => void;
  activeSimulatedPolicyId: string;
  onSelectSimulatedPolicy: (id: string) => void;
  localUsers?: LocalUser[];
  localGroups?: LocalGroup[];
  isLightMode?: boolean;
}

export const AccessControlTab: React.FC<AccessControlTabProps> = ({
  policies,
  groups,
  devices,
  adConfig,
  onSavePolicies,
  activeSimulatedPolicyId,
  onSelectSimulatedPolicy,
  localUsers = loadLocalUsers(),
  localGroups = loadLocalGroups(),
  isLightMode: propIsLightMode,
}) => {
  const { isRtl, isEn } = useLanguage();
  const isLight = Boolean(
    propIsLightMode ||
    (typeof document !== 'undefined' && document.documentElement.classList.contains('light'))
  );
  const [editingPolicy, setEditingPolicy] = useState<AccessPolicy | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<'all' | 'cisco' | 'mikrotik' | 'generic' | 'servers' | 'devices'>('all');

  // Live database-backed states for subjects and scopes
  const [liveLocalUsers, setLiveLocalUsers] = useState<LocalUser[]>(localUsers);
  const [liveLocalGroups, setLiveLocalGroups] = useState<LocalGroup[]>(localGroups);
  const [liveDeviceGroups, setLiveDeviceGroups] = useState<DeviceGroup[]>(groups);
  const [liveAdConfig, setLiveAdConfig] = useState<ActiveDirectoryConfig>(adConfig);
  const [liveServers, setLiveServers] = useState<RemoteServer[]>([]);
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  const [serverMatrixFilter, setServerMatrixFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [deviceMatrixFilter, setDeviceMatrixFilter] = useState<'all' | 'custom_only' | 'default_only'>('all');
  const [deviceTypeMatrixFilter, setDeviceTypeMatrixFilter] = useState<'all' | 'switch' | 'router' | 'firewall' | 'other'>('all');
  const [isSyncingDb, setIsSyncingDb] = useState<boolean>(false);

  // Synchronize authentic database entities
  const refreshDatabaseData = useCallback(async () => {
    setIsSyncingDb(true);
    try {
      const [dbUsers, dbGroups, dbDevGroups, dbAd, dbServers] = await Promise.all([
        syncLocalUsersFromDatabase().catch(() => localUsers),
        syncLocalGroupsFromDatabase().catch(() => localGroups),
        syncDeviceGroupsFromDatabase().catch(() => groups),
        syncActiveDirectoryConfigFromDatabase().catch(() => adConfig),
        fetchRemoteServers().catch(() => null),
      ]);
      if (Array.isArray(dbUsers) && dbUsers.length > 0) setLiveLocalUsers(dbUsers);
      if (Array.isArray(dbGroups) && dbGroups.length > 0) setLiveLocalGroups(dbGroups);
      if (Array.isArray(dbDevGroups) && dbDevGroups.length > 0) setLiveDeviceGroups(dbDevGroups);
      if (dbAd && typeof dbAd === 'object') setLiveAdConfig(dbAd);

      // fetchRemoteServers() returns { success: boolean; count: number; servers: RemoteServer[] }
      const parsedServers: RemoteServer[] = Array.isArray(dbServers)
        ? dbServers
        : Array.isArray((dbServers as any)?.servers)
        ? (dbServers as any).servers
        : [];

      if (parsedServers.length > 0) {
        setLiveServers(parsedServers);
      } else {
        // Fallback: direct fetch from /api/remote-servers
        try {
          const directRes = await fetch('/api/remote-servers');
          if (directRes.ok) {
            const data = await directRes.json();
            const list = Array.isArray(data?.servers)
              ? data.servers
              : Array.isArray(data)
              ? data
              : [];
            if (list.length > 0) setLiveServers(list);
          }
        } catch {
          // ignore
        }
      }
    } finally {
      setIsSyncingDb(false);
    }
  }, [localUsers, localGroups, groups, adConfig]);

  useEffect(() => {
    refreshDatabaseData();
  }, [refreshDatabaseData]);

  // Initial template for new policy
  const getBlankPolicy = (): AccessPolicy => {
    const firstGroup = liveLocalGroups[0];
    const firstDevGroup = liveDeviceGroups[0];
    return {
      id: `policy-${Date.now().toString(36)}`,
      name: isEn ? 'New Custom Access Policy' : 'پالیسی جدید سطح دسترسی',
      description: isEn ? 'Custom multi-vendor access control rule' : 'قانون دسترسی سفارشی برای تجهیزات چند وندوری شبکه',
      priority: 50,
      subjectType: 'local_group',
      subjectId: firstGroup?.id || 'group-helpdesk-ops',
      subjectName: firstGroup?.name || (isEn ? 'Helpdesk Operators' : 'تیم هلپ‌دسک و پشتیبانی'),
      targetScope: 'groups',
      targetGroupIds: firstDevGroup ? [firstDevGroup.id] : [],
      targetDeviceIds: [],
      // Page modules
      canViewDashboard: true,
      canViewTopology: true,
      canViewDevices: true,
      canViewServers: true,
      canViewPorts: true,
      canViewScanner: false,
      canViewTemplates: false,
      canViewLogs: false,
      canViewSettings: false,
      canCheckUpdate: false,
      canPerformUpdate: false,
      // Cisco capabilities
      terminalAccess: 'none',
      canToggleAdminStatus: false,
      canChangeVlan: true,
      canEditDescription: true,
      canTogglePortSecurity: true,
      canWriteMemory: false,
      // MikroTik capabilities
      mikrotikTerminalAccess: 'none',
      canMikrotikToggleInterface: false,
      canMikrotikBridgeVlan: true,
      canMikrotikComment: true,
      canMikrotikIpPool: false,
      canMikrotikFirewall: false,
      canMikrotikBackup: false,
      canMikrotikSafeMode: true,
      // Generic / Linux capabilities
      genericTerminalAccess: 'none',
      canGenericToggleLink: false,
      canGenericDiagnostics: true,
      canGenericConfigBackup: false,
      // Global capabilities
      canManageDevices: false,
      canApplyTemplates: false,
      canBatchOperate: false,
      // Backup & Disaster Recovery
      canExportBackup: false,
      canImportBackup: false,
      // Server Fleet & 3-Dots Action Permissions
      defaultServerPermissions: {
        terminal: false,
        file_explorer: true,
        server_management: true,
        web_management: false,
        database_management: false,
        power_control: false,
        edit_properties: false,
        delete_server: false,
      },
      perServerPermissions: {},
      // Network Equipment & 3-Dots Action Permissions
      defaultDevicePermissions: {
        web_configs: true,
        terminal: false,
        apply_template: false,
        device_note: true,
        edit_properties: false,
        ping_keepalive: true,
        inspect_ports: true,
        write_memory: false,
        delete_device: false,
      },
      perDevicePermissions: {},
    };
  };

  const handleStartCreate = async () => {
    await refreshDatabaseData();
    setEditingPolicy(getBlankPolicy());
    setIsCreating(true);
    setVendorFilter('all');
    setServerSearchQuery('');
    setDeviceSearchQuery('');
    setDeviceMatrixFilter('all');
    setDeviceTypeMatrixFilter('all');
  };

  const handleStartEdit = (policy: AccessPolicy) => {
    refreshDatabaseData();
    setEditingPolicy({
      ...policy,
      defaultServerPermissions: policy.defaultServerPermissions || (
        policy.id === 'policy-super-admin'
          ? { ...FULL_SERVER_PERMISSIONS }
          : { ...RESTRICTED_SERVER_PERMISSIONS }
      ),
      perServerPermissions: policy.perServerPermissions || {},
      defaultDevicePermissions: policy.defaultDevicePermissions || (
        policy.id === 'policy-super-admin'
          ? { ...FULL_DEVICE_PERMISSIONS }
          : { ...RESTRICTED_DEVICE_PERMISSIONS }
      ),
      perDevicePermissions: policy.perDevicePermissions || {},
    });
    setIsCreating(false);
    setVendorFilter('all');
    setServerSearchQuery('');
    setDeviceSearchQuery('');
    setDeviceMatrixFilter('all');
    setDeviceTypeMatrixFilter('all');
  };

  // Real-time calculation of permitted devices based on current targetScope selection
  const permittedScopeDevices = useMemo(() => {
    if (!editingPolicy) return [];
    if (editingPolicy.targetScope === 'all') return devices;
    if (editingPolicy.targetScope === 'groups') {
      const selectedGroupSet = new Set(
        (editingPolicy.targetGroupIds || []).map((id) => (id || '').trim().toLowerCase())
      );
      const devIdSet = new Set<string>();
      for (const g of liveDeviceGroups) {
        const gid = (g.id || '').trim().toLowerCase();
        const gname = (g.name || '').trim().toLowerCase();
        if (selectedGroupSet.has(gid) || selectedGroupSet.has(gname)) {
          const ids = g.deviceIds || (g as any).device_ids || [];
          ids.forEach((id: string) => devIdSet.add(id));
        }
      }
      return devices.filter((d) => devIdSet.has(d.id));
    }
    if (editingPolicy.targetScope === 'specific') {
      const specificSet = new Set(editingPolicy.targetDeviceIds || []);
      return devices.filter((d) => specificSet.has(d.id));
    }
    return [];
  }, [editingPolicy, liveDeviceGroups, devices]);

  // Real-time calculation of permitted servers based on current targetScope selection
  const permittedScopeServers = useMemo(() => {
    if (!editingPolicy) return [];
    if (editingPolicy.canViewServers === false) return [];
    if (editingPolicy.targetScope === 'all') return liveServers;

    if (editingPolicy.targetScope === 'groups') {
      const targetGroupIds: string[] = [
        ...(Array.isArray(editingPolicy.targetGroupIds) ? editingPolicy.targetGroupIds : []),
        ...(Array.isArray((editingPolicy as any).target_group_ids) ? (editingPolicy as any).target_group_ids : []),
      ];
      const selectedGroupSet = new Set(
        targetGroupIds.map((id) => (id || '').trim().toLowerCase())
      );

      const srvIdSet = new Set<string>();
      for (const g of liveDeviceGroups) {
        const gid = (g.id || '').trim().toLowerCase();
        const gname = (g.name || '').trim().toLowerCase();
        if (selectedGroupSet.has(gid) || selectedGroupSet.has(gname)) {
          const sIds: string[] = Array.isArray((g as any).serverIds)
            ? (g as any).serverIds
            : Array.isArray((g as any).server_ids)
            ? (g as any).server_ids
            : [];
          const dIds: string[] = Array.isArray(g.deviceIds)
            ? g.deviceIds
            : Array.isArray((g as any).device_ids)
            ? (g as any).device_ids
            : [];

          sIds.forEach((id: string) => {
            if (id) srvIdSet.add(id.trim().toLowerCase());
          });
          dIds.forEach((id: string) => {
            if (id) srvIdSet.add(id.trim().toLowerCase());
          });
        }
      }

      return liveServers.filter((s) => {
        const sid = (s.id || '').trim().toLowerCase();
        const sname = (s.name || '').trim().toLowerCase();
        const shost = (s.hostname || '').trim().toLowerCase();
        const sip = ((s.ip || (s as any).ip_address || '')).trim().toLowerCase();

        // 1. Direct match by ID, name, hostname, or IP in srvIdSet
        if (srvIdSet.has(sid) || srvIdSet.has(sname) || srvIdSet.has(shost) || srvIdSet.has(sip)) {
          return true;
        }

        // 2. Server group associations
        const sGroupIds: string[] = [
          ...(Array.isArray((s as any).groupIds) ? (s as any).groupIds : []),
          ...(Array.isArray((s as any).group_ids) ? (s as any).group_ids : []),
          ...(Array.isArray((s as any).deviceGroupIds) ? (s as any).deviceGroupIds : []),
          ...(Array.isArray((s as any).device_group_ids) ? (s as any).device_group_ids : []),
        ].map((gid) => (gid || '').trim().toLowerCase());

        if (sGroupIds.some((gid) => selectedGroupSet.has(gid))) {
          return true;
        }

        return false;
      });
    }

    if (editingPolicy.targetScope === 'specific') {
      const specificIds: string[] = [
        ...(Array.isArray((editingPolicy as any).targetServerIds) ? (editingPolicy as any).targetServerIds : []),
        ...(Array.isArray((editingPolicy as any).target_server_ids) ? (editingPolicy as any).target_server_ids : []),
        ...(Array.isArray(editingPolicy.targetDeviceIds) ? editingPolicy.targetDeviceIds : []),
        ...(Array.isArray((editingPolicy as any).target_device_ids) ? (editingPolicy as any).target_device_ids : []),
      ];
      const specificSet = new Set(specificIds.map((id: string) => (id || '').trim().toLowerCase()));

      return liveServers.filter((s) => {
        const sid = (s.id || '').trim().toLowerCase();
        const sname = (s.name || '').trim().toLowerCase();
        const shost = (s.hostname || '').trim().toLowerCase();
        const sip = ((s.ip || (s as any).ip_address || '')).trim().toLowerCase();
        return specificSet.has(sid) || specificSet.has(sname) || specificSet.has(shost) || specificSet.has(sip);
      });
    }

    return [];
  }, [editingPolicy, liveDeviceGroups, liveServers]);

  const handleDeletePolicy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (policies.length <= 1) {
      alert(isEn ? 'At least one policy must remain.' : 'حداقل یک سطح دسترسی باید وجود داشته باشد.');
      return;
    }
    const confirmed = window.confirm(
      isEn ? 'Are you sure you want to delete this access policy?' : 'آیا از حذف این پالیسی دسترسی اطمینان دارید؟'
    );
    if (!confirmed) return;

    const targetPolicy = policies.find((p) => p.id === id);
    const updated = policies.filter((p) => p.id !== id);
    onSavePolicies(updated);
    if (activeSimulatedPolicyId === id) {
      onSelectSimulatedPolicy(updated[0]?.id || '');
    }

    if (targetPolicy) {
      try {
        logPortalEvent({
          category: 'rbac_policy',
          action: 'RBAC_POLICY_DELETED',
          title: `حذف پالیسی دسترسی «${targetPolicy.name}»`,
          title_en: `Access policy deleted: ${targetPolicy.name}`,
          target: {
            type: 'policy',
            id: targetPolicy.id,
            name: targetPolicy.name,
            metadata: { subjectName: targetPolicy.subjectName, subjectType: targetPolicy.subjectType }
          },
          severity: 'warning',
          status: 'success',
          details: `پالیسی دسترسی ${targetPolicy.name} با شناسه ${targetPolicy.id} حذف شد.`,
          details_en: `Access policy ${targetPolicy.name} was removed.`,
        });
      } catch (err) {
        // ignore
      }
    }
  };

  const handleSavePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPolicy) return;

    let updated: AccessPolicy[];
    if (isCreating) {
      updated = [...policies, editingPolicy];
    } else {
      updated = policies.map((p) => (p.id === editingPolicy.id ? editingPolicy : p));
    }
    onSavePolicies(updated);

    try {
      logPortalEvent({
        category: 'rbac_policy',
        action: isCreating ? 'RBAC_POLICY_CREATED' : 'RBAC_POLICY_UPDATED',
        title: isCreating
          ? `ایجاد پالیسی دسترسی جدید «${editingPolicy.name}»`
          : `تغییر سطح دسترسی و اختیارات در پالیسی «${editingPolicy.name}»`,
        title_en: isCreating
          ? `New access policy created: ${editingPolicy.name}`
          : `Access policy updated: ${editingPolicy.name}`,
        target: {
          type: 'policy',
          id: editingPolicy.id,
          name: editingPolicy.name,
          metadata: {
            subjectName: editingPolicy.subjectName,
            subjectType: editingPolicy.subjectType,
            canExportBackup: editingPolicy.permissions?.canExportBackup,
            canImportBackup: editingPolicy.permissions?.canImportBackup,
            terminalAccess: editingPolicy.permissions?.terminalAccess,
          }
        },
        severity: 'notice',
        status: 'success',
        details: `پالیسی ${editingPolicy.name} برای ${editingPolicy.subjectType} ${editingPolicy.subjectName} ذخیره شد.`,
        details_en: `Access policy ${editingPolicy.name} saved.`,
      });
    } catch (err) {
      // ignore
    }

    setEditingPolicy(null);
    setIsCreating(false);
  };

  const activePolicyObj = policies.find((p) => p.id === activeSimulatedPolicyId) || policies[0];

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Role Simulator Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-cyan-900/30 border border-indigo-500/30 shadow-lg backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-inner">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">
                {isEn ? 'Multi-Vendor Granular RBAC Engine' : 'موتور کنترل دسترسی مبتنی بر نقش (RBAC چند وندوری)'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {isEn ? 'Cisco • MikroTik • Linux' : 'سیسکو • میکروتیک • لینوکس'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {isEn
                ? 'Control exact CLI commands, port states, and modal privileges per vendor across network nodes.'
                : 'مدیریت تفکیک‌شده اختیارات ترمینال، تغییرات پورت، ویلن و کانفیگ برای تجهیزات سیسکو، میکروتیک و لینوکس'}
            </p>
          </div>
        </div>

        {/* Live Simulator Role Selector */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900/80 border border-white/10 self-start md:self-auto">
          <span className="text-[11px] font-semibold text-amber-300 pl-2 rtl:pr-2 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Active Test Role:' : 'نقش تستی فعال:'}</span>
          </span>
          <select
            value={activeSimulatedPolicyId}
            onChange={(e) => onSelectSimulatedPolicy(e.target.value)}
            className="px-3 py-1 rounded-lg bg-slate-800 border border-white/15 text-white text-xs font-semibold focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="actual-user">
              {isEn ? '🔒 Authentic Database Policy (Live Token Session)' : '🔒 سطح دسترسی واقعی از دیتابیس (سشن معتبر توکن)'}
            </option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.subjectName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Policies List Header & New Policy Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>{isEn ? 'Configured Access Policies' : 'پالیسی‌های دسترسی تعریف‌شده'}</span>
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-800 border border-white/10 text-slate-300 font-mono">
            {policies.length}
          </span>
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>
              {isEn
                ? `DB: ${liveLocalUsers.length} Users • ${liveLocalGroups.length} Groups • ${liveDeviceGroups.length} Device Groups`
                : `دیتابیس: ${liveLocalUsers.length} کاربر • ${liveLocalGroups.length} گروه • ${liveDeviceGroups.length} گروه تجهیزات`}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshDatabaseData}
            disabled={isSyncingDb}
            title={isEn ? 'Reload live users, groups, and device scopes from database' : 'بارگذاری مجدد کاربران، گروه‌ها و تجهیزات از دیتابیس'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncingDb ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isEn ? 'Sync DB' : 'همگام‌سازی دیتابیس'}</span>
          </button>

          <button
            onClick={handleStartCreate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Create Access Policy' : 'تعریف پالیسی جدید'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Policies */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {policies.map((policy) => {
          const isCurrent = policy.id === activeSimulatedPolicyId;

          return (
            <div
              key={policy.id}
              className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                isCurrent
                  ? 'bg-slate-900/90 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-900/60 border-white/10 hover:border-white/20'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
                      {policy.subjectType === 'ad_group' ? (
                        <Users className="w-4 h-4 text-cyan-400" />
                      ) : policy.subjectType === 'ad_user' ? (
                        <User className="w-4 h-4 text-emerald-400" />
                      ) : policy.subjectType === 'local_group' ? (
                        <FolderTree className="w-4 h-4 text-purple-400" />
                      ) : (
                        <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-white">{policy.name}</h4>
                      <span className="text-[10px] text-cyan-300 font-mono">
                        {policy.subjectName}
                      </span>
                    </div>
                  </div>

                  {isCurrent && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 font-bold">
                      {isEn ? 'ACTIVE' : 'فعال'}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{policy.description}</p>

                {/* Target Scope Pill */}
                <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono text-slate-300">
                  <FolderTree className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isEn ? 'Target:' : 'محدوده:'}</span>
                  {policy.targetScope === 'all' && (
                    <span className="text-emerald-400 font-semibold">{isEn ? 'All Network Devices' : 'تمام تجهیزات شبکه'}</span>
                  )}
                  {policy.targetScope === 'groups' && (
                    <span className="text-amber-300 font-semibold truncate max-w-[180px]">
                      {policy.targetGroupIds.map((gid) => groups.find((g) => g.id === gid)?.name || gid).join(', ')}
                    </span>
                  )}
                  {policy.targetScope === 'specific' && (
                    <span className="text-cyan-300 font-semibold">
                      {policy.targetDeviceIds.length} {isEn ? 'Devices' : 'دستگاه مشخص'}
                    </span>
                  )}
                </div>

                {/* Multi-Vendor Badges */}
                <div className="flex flex-wrap gap-1 mt-2.5 pt-2 border-t border-white/5">
                  {/* Cisco Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>Cisco:</span>
                    <span className="font-mono">
                      {policy.canChangeVlan ? 'VLAN ' : ''}
                      {policy.canTogglePortSecurity ? 'Sec ' : ''}
                      {policy.canToggleAdminStatus ? 'Shut ' : ''}
                      {policy.terminalAccess !== 'none' ? 'CLI' : ''}
                      {!policy.canChangeVlan && !policy.canTogglePortSecurity && !policy.canToggleAdminStatus && policy.terminalAccess === 'none' ? 'Restricted' : ''}
                    </span>
                  </span>

                  {/* MikroTik Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                    <span>MikroTik:</span>
                    <span className="font-mono">
                      {policy.canMikrotikBridgeVlan ? 'Bridge ' : ''}
                      {policy.canMikrotikToggleInterface ? 'Port ' : ''}
                      {policy.canMikrotikBackup ? 'Backup ' : ''}
                      {policy.mikrotikTerminalAccess && policy.mikrotikTerminalAccess !== 'none' ? 'ROS-CLI' : ''}
                      {!policy.canMikrotikBridgeVlan && !policy.canMikrotikToggleInterface && (!policy.mikrotikTerminalAccess || policy.mikrotikTerminalAccess === 'none') ? 'Restricted' : ''}
                    </span>
                  </span>

                  {/* Generic Badge */}
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Linux:</span>
                    <span className="font-mono">
                      {policy.canGenericDiagnostics ? 'Diag ' : ''}
                      {policy.canGenericToggleLink ? 'Link ' : ''}
                      {policy.genericTerminalAccess && policy.genericTerminalAccess !== 'none' ? 'Shell' : ''}
                    </span>
                  </span>

                  {/* Backup & DR Badge */}
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-1 border ${
                    policy.canImportBackup
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : policy.canExportBackup
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-800 text-slate-500 border-white/5'
                  }`}>
                    <Archive className="w-2.5 h-2.5" />
                    <span>Backup:</span>
                    <span className="font-mono">
                      {policy.canImportBackup ? 'Full (Exp+Imp)' : policy.canExportBackup ? 'Export' : 'Locked'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-2 mt-3 border-t border-white/10 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectSimulatedPolicy(policy.id)}
                  className={`text-[11px] font-semibold cursor-pointer transition ${
                    isCurrent ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isCurrent ? (isEn ? '● Current Test Role' : '● نقش جاری در حال اجرا') : (isEn ? 'Select for Simulation' : 'انتخاب جهت شبیه‌سازی')}
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(policy)}
                    className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/10 transition cursor-pointer"
                    title={isEn ? 'Edit Policy' : 'ویرایش پالیسی'}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  {policies.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleDeletePolicy(policy.id, e)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title={isEn ? 'Delete Policy' : 'حذف پالیسی'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comprehensive Policy Editor Drawer / Form Modal */}
      {editingPolicy && (
        <div className="p-5 rounded-2xl bg-slate-900/95 border border-indigo-500/40 shadow-2xl space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  {isCreating ? (isEn ? 'Create Access Policy' : 'تعریف پالیسی سطح دسترسی جدید') : (isEn ? 'Edit Access Policy' : 'ویرایش پالیسی سطح دسترسی')}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isEn
                    ? 'Configure permissions across Cisco, MikroTik RouterOS, and Linux systems.'
                    : 'تنظیم جامع اختیارات و محدودیت‌های عملیاتی برای تجهیزات سیسکو، میکروتیک و لینوکس'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingPolicy(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSavePolicy} className="space-y-5">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEn ? 'Policy Name' : 'عنوان پالیسی دسترسی (مثال: دسترسی تیم هلپ‌دسک)'}
                </label>
                <input
                  type="text"
                  required
                  value={editingPolicy.name}
                  onChange={(e) => setEditingPolicy({ ...editingPolicy, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEn ? 'Description' : 'توضیحات و دامنه اختیارات'}
                </label>
                <input
                  type="text"
                  value={editingPolicy.description}
                  onChange={(e) => setEditingPolicy({ ...editingPolicy, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Section 1: Subject (Who) */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-cyan-300 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{isEn ? '1. Subject: Who does this policy apply to?' : '۱. هویت و کاربر: این پالیسی به چه کسی یا گروهی اعمال شود؟'}</span>
                </h4>
                <span className="text-[10px] font-mono text-cyan-400/80 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                  {isEn ? 'Live Database Loaded' : 'بارگذاری‌شده از پایگاه داده'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">{isEn ? 'Subject Type' : 'نوع هویت'}</label>
                  <select
                    value={editingPolicy.subjectType}
                    onChange={(e) => {
                      const type = e.target.value as any;
                      let defaultId = '';
                      let defaultName = '';
                      if (type === 'ad_group') {
                        defaultId = liveAdConfig.syncedGroups[0]?.dn || '';
                        defaultName = liveAdConfig.syncedGroups[0]?.cn
                          ? `${liveAdConfig.syncedGroups[0].cn} (${isEn ? 'Active Directory' : 'اکتیو دایرکتوری'})`
                          : '';
                      } else if (type === 'ad_user') {
                        defaultId = liveAdConfig.syncedUsers[0]?.samAccountName || '';
                        defaultName = liveAdConfig.syncedUsers[0]?.displayName || liveAdConfig.syncedUsers[0]?.samAccountName || '';
                      } else if (type === 'local_group') {
                        defaultId = liveLocalGroups[0]?.id || '';
                        defaultName = liveLocalGroups[0]?.name
                          ? `${liveLocalGroups[0].name} (${isEn ? 'Local Group' : 'گروه محلی'})`
                          : '';
                      } else {
                        defaultId = liveLocalUsers[0]?.id || '';
                        defaultName = liveLocalUsers[0]?.fullName
                          ? `${liveLocalUsers[0].fullName} (${isEn ? 'Local User' : 'کاربر محلی'})`
                          : (liveLocalUsers[0]?.username || '');
                      }
                      setEditingPolicy({
                        ...editingPolicy,
                        subjectType: type,
                        subjectId: defaultId,
                        subjectName: defaultName,
                      });
                    }}
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                  >
                    <option value="local_user">{isEn ? 'Local User Account (Database)' : 'کاربر محلی سیستم (دیتابیس)'}</option>
                    <option value="local_group">{isEn ? 'Local User Group (Database)' : 'گروه کاربری محلی سیستم (دیتابیس)'}</option>
                    <option value="ad_user">{isEn ? 'Active Directory User (AD Sync)' : 'کاربر خاص اکتیو دایرکتوری (AD)'}</option>
                    <option value="ad_group">{isEn ? 'Active Directory Group (AD Sync)' : 'گروه امنیتی اکتیو دایرکتوری (AD)'}</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">{isEn ? 'Target Identity (From Database)' : 'انتخاب هویت دقیق (بارگذاری از دیتابیس)'}</label>
                  {editingPolicy.subjectType === 'ad_group' && (
                    <select
                      value={editingPolicy.subjectId}
                      onChange={(e) => {
                        const grp = liveAdConfig.syncedGroups.find((g) => g.dn === e.target.value);
                        setEditingPolicy({
                          ...editingPolicy,
                          subjectId: e.target.value,
                          subjectName: grp ? `${grp.cn} (${isEn ? 'Active Directory' : 'اکتیو دایرکتوری'})` : e.target.value,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                    >
                      {liveAdConfig.syncedGroups.length === 0 ? (
                        <option value="" disabled>
                          {isEn ? 'No AD groups synced from database' : 'هیچ گروهی از اکتیو دایرکتوری در پایگاه‌داده یافت نشد'}
                        </option>
                      ) : (
                        liveAdConfig.syncedGroups.map((g) => (
                          <option key={g.dn} value={g.dn}>
                            {g.cn} — {g.description || (isEn ? 'AD Security Group' : 'گروه امنیتی AD')} ({g.memberCount || 0} {isEn ? 'members' : 'عضو'})
                          </option>
                        ))
                      )}
                    </select>
                  )}

                  {editingPolicy.subjectType === 'ad_user' && (
                    <select
                      value={editingPolicy.subjectId}
                      onChange={(e) => {
                        const usr = liveAdConfig.syncedUsers.find((u) => u.samAccountName === e.target.value);
                        setEditingPolicy({
                          ...editingPolicy,
                          subjectId: e.target.value,
                          subjectName: usr ? `${usr.displayName}` : e.target.value,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                    >
                      {liveAdConfig.syncedUsers.length === 0 ? (
                        <option value="" disabled>
                          {isEn ? 'No AD users synced from database' : 'هیچ کاربری از اکتیو دایرکتوری در پایگاه‌داده یافت نشد'}
                        </option>
                      ) : (
                        liveAdConfig.syncedUsers.map((u) => (
                          <option key={u.samAccountName} value={u.samAccountName}>
                            {u.displayName} ({u.samAccountName}) {u.department ? `- ${u.department}` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  )}

                  {editingPolicy.subjectType === 'local_group' && (
                    <select
                      value={editingPolicy.subjectId}
                      onChange={(e) => {
                        const grp = liveLocalGroups.find((g) => g.id === e.target.value);
                        setEditingPolicy({
                          ...editingPolicy,
                          subjectId: e.target.value,
                          subjectName: grp ? `${grp.name} (${isEn ? 'Local Group' : 'گروه محلی'})` : e.target.value,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                    >
                      {liveLocalGroups.length === 0 ? (
                        <option value="" disabled>
                          {isEn ? 'No local user groups found in database' : 'هیچ گروه کاربری در پایگاه‌داده یافت نشد'}
                        </option>
                      ) : (
                        liveLocalGroups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} — ({g.memberUserIds?.length || 0} {isEn ? 'members' : 'عضو محلی'})
                          </option>
                        ))
                      )}
                    </select>
                  )}

                  {editingPolicy.subjectType === 'local_user' && (
                    <select
                      value={editingPolicy.subjectId}
                      onChange={(e) => {
                        const loc = liveLocalUsers.find((l) => l.id === e.target.value || l.username === e.target.value);
                        setEditingPolicy({
                          ...editingPolicy,
                          subjectId: loc?.id || e.target.value,
                          subjectName: loc ? `${loc.fullName} (${isEn ? 'Local User' : 'کاربر محلی'})` : e.target.value,
                        });
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                    >
                      {liveLocalUsers.length === 0 ? (
                        <option value="" disabled>
                          {isEn ? 'No local users found in database' : 'هیچ کاربر محلی در پایگاه‌داده یافت نشد'}
                        </option>
                      ) : (
                        liveLocalUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} (@{u.username}) — {u.role || 'User'}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Target Scope (Which Devices) */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-amber-300 flex items-center gap-2">
                  <FolderTree className="w-4 h-4" />
                  <span>{isEn ? '2. Device Target Scope: Which devices can they manage?' : '۲. محدوده تجهیزات: این کاربر/گروه به چه دیوایس‌هایی دسترسی دارند؟'}</span>
                </h4>
                <span className="text-[10px] font-mono text-amber-400/80 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                  {isEn ? `${liveDeviceGroups.length} Groups in Database` : `${liveDeviceGroups.length} گروه در پایگاه داده`}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="radio"
                    name="scope"
                    checked={editingPolicy.targetScope === 'all'}
                    onChange={() => setEditingPolicy({ ...editingPolicy, targetScope: 'all' })}
                    className="accent-amber-400"
                  />
                  <span>{isEn ? 'All Network Devices' : 'تمام تجهیزات کل شبکه'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="radio"
                    name="scope"
                    checked={editingPolicy.targetScope === 'groups'}
                    onChange={() => setEditingPolicy({ ...editingPolicy, targetScope: 'groups' })}
                    className="accent-amber-400"
                  />
                  <span>{isEn ? 'Specific Device Groups (From Database)' : 'گروه‌های تجهیزات ساخته‌شده در دیتابیس'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                  <input
                    type="radio"
                    name="scope"
                    checked={editingPolicy.targetScope === 'specific'}
                    onChange={() => setEditingPolicy({ ...editingPolicy, targetScope: 'specific' })}
                    className="accent-amber-400"
                  />
                  <span>{isEn ? 'Specific Individual Devices' : 'دیوایس‌های تک به تک'}</span>
                </label>
              </div>

              {/* Group Checkboxes Loaded from Database */}
              {editingPolicy.targetScope === 'groups' && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">
                      {isEn ? 'Select Authorized Device Groups:' : 'انتخاب گروه‌های تجهیزات مجاز:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPolicy({
                            ...editingPolicy,
                            targetGroupIds: liveDeviceGroups.map((g) => g.id),
                          })
                        }
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer"
                      >
                        {isEn ? 'Select All Groups' : 'انتخاب همه گروه‌ها'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPolicy({
                            ...editingPolicy,
                            targetGroupIds: [],
                          })
                        }
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white cursor-pointer"
                      >
                        {isEn ? 'Deselect All' : 'لغو انتخاب'}
                      </button>
                    </div>
                  </div>

                  {liveDeviceGroups.length === 0 ? (
                    <div className="text-xs text-amber-400/90 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 w-full">
                      {isEn
                        ? 'No device groups found in database. Please create device groups first.'
                        : 'هیچ گروه تجهیزاتی در پایگاه داده یافت نشد. لطفاً ابتدا در بخش گروه‌های تجهیزات اقدام به ساخت گروه نمایید.'}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {liveDeviceGroups.map((grp) => {
                        const checked = editingPolicy.targetGroupIds.includes(grp.id);
                        return (
                          <button
                            key={grp.id}
                            type="button"
                            onClick={() => {
                              const newIds = checked
                                ? editingPolicy.targetGroupIds.filter((id) => id !== grp.id)
                                : [...editingPolicy.targetGroupIds, grp.id];
                              setEditingPolicy({ ...editingPolicy, targetGroupIds: newIds });
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                              checked
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-xs'
                                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            {checked ? <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
                            <span>{grp.name}</span>
                            <span className="text-[10px] font-mono opacity-80">
                              ({grp.deviceIds?.length || 0} {isEn ? 'devices' : 'دیوایس'}
                              {grp.serverIds && grp.serverIds.length > 0 ? ` • ${grp.serverIds.length} ${isEn ? 'servers' : 'سرور'}` : ''})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Specific Devices Checkboxes */}
              {editingPolicy.targetScope === 'specific' && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">
                      {isEn ? 'Select Individual Devices:' : 'انتخاب تجهیزات تک به تک:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPolicy({
                            ...editingPolicy,
                            targetDeviceIds: devices.map((d) => d.id),
                          })
                        }
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 cursor-pointer"
                      >
                        {isEn ? 'Select All Devices' : 'انتخاب همه دیوایس‌ها'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingPolicy({
                            ...editingPolicy,
                            targetDeviceIds: [],
                          })
                        }
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white cursor-pointer"
                      >
                        {isEn ? 'Deselect All' : 'لغو انتخاب'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {devices.map((dev) => {
                      const checked = editingPolicy.targetDeviceIds.includes(dev.id);
                      return (
                        <button
                          key={dev.id}
                          type="button"
                          onClick={() => {
                            const newIds = checked
                              ? editingPolicy.targetDeviceIds.filter((id) => id !== dev.id)
                              : [...editingPolicy.targetDeviceIds, dev.id];
                            setEditingPolicy({ ...editingPolicy, targetDeviceIds: newIds });
                          }}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs font-mono cursor-pointer text-left rtl:text-right ${
                            checked
                              ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {checked ? <CheckSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
                            <span className="truncate">{dev.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500">{dev.ip}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Real-time Database Authorization Scope Summary Card */}
              <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-emerald-300">
                      {isEn ? 'PostgreSQL Authoritative Scope Summary' : 'خلاصه دسترسی تجهیزات (تثبیت‌شده در پایگاه‌داده پستگرس)'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    {editingPolicy.targetScope === 'all'
                      ? (isEn ? `All ${devices.length} Devices Permitted` : `دسترسی به تمامی ${devices.length} تجهیز`)
                      : (isEn ? `${permittedScopeDevices.length} Authorized Devices` : `${permittedScopeDevices.length} تجهیز مجاز به مشاهده`)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {isEn
                    ? 'Security Guarantee: This policy is persisted directly in PostgreSQL on the panel server. When an assigned user logs in, backend API endpoints (/api/devices, /api/topology) automatically restrict device visibility exclusively to this authorized scope.'
                    : 'تضمین امنیتی: این سطح دسترسی مستقیماً در پایگاه‌داده PostgreSQL سرور پنل ذخیره می‌شود. به محض لاگین کاربر یا گروه منتسب، تمامی اندپوینت‌ها و نقشه‌های پنل به گونه‌ای فیلتر می‌شوند که کاربر فقط و فقط این تجهیزات مجاز را مشاهده و مدیریت کند.'}
                </p>
                {editingPolicy.targetScope !== 'all' && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {permittedScopeDevices.length === 0 ? (
                      <span className="text-[11px] text-rose-400 italic">
                        {isEn ? 'No devices in current group scope. User will see 0 devices upon login.' : 'هیچ دیوایسی در محدوده انتخابی قرار ندارد. کاربر پس از لاگین هیچ تجهیزاتی را مشاهده نخواهد کرد.'}
                      </span>
                    ) : (
                      permittedScopeDevices.map((d) => (
                        <span
                          key={d.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-200"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${d.is_online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {d.name} ({d.ip})
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Allowed Pages / Views (Sidebar Modules Control) */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-indigo-300 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  <span>{isEn ? '3. Page Access: Which modules can they view in the sidebar?' : '۳. دسترسی به صفحات: این کاربر چه بخش‌هایی از سایدبار را ببیند؟'}</span>
                </h4>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const isSuper = editingPolicy.id === 'policy-super-admin' || (editingPolicy.priority || 0) >= 100;
                      setEditingPolicy({
                        ...editingPolicy,
                        canViewDashboard: true,
                        canViewTopology: true,
                        canViewDevices: true,
                        canViewServers: true,
                        canViewPorts: true,
                        canViewScanner: true,
                        canViewTemplates: true,
                        canViewLogs: true,
                        canViewSettings: true,
                        canCheckUpdate: isSuper,
                        canPerformUpdate: isSuper,
                      });
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 cursor-pointer"
                  >
                    {isEn ? 'Select All' : 'انتخاب همه'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPolicy({
                        ...editingPolicy,
                        canViewDashboard: false,
                        canViewTopology: false,
                        canViewDevices: false,
                        canViewServers: false,
                        canViewPorts: false,
                        canViewScanner: false,
                        canViewTemplates: false,
                        canViewLogs: false,
                        canViewSettings: false,
                        canCheckUpdate: false,
                        canPerformUpdate: false,
                      });
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10 hover:text-white cursor-pointer"
                  >
                    {isEn ? 'Deselect All' : 'لغو همه'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                {[
                  { key: 'canViewDashboard', label: isEn ? 'Dashboard' : 'داشبورد شبکه', icon: LayoutDashboard },
                  { key: 'canViewTopology', label: isEn ? 'Topology Map' : 'نقشه توپولوژی', icon: Globe },
                  { key: 'canViewDevices', label: isEn ? 'Devices Inventory' : 'لیست تجهیزات', icon: Network },
                  { key: 'canViewServers', label: isEn ? 'Remote Servers' : 'سرورهای ریموت', icon: Server },
                  { key: 'canViewPorts', label: isEn ? 'Ports & VLANs' : 'پورت‌ها و ویلن‌ها', icon: Activity },
                  { key: 'canViewScanner', label: isEn ? 'Discovery Scanner' : 'اسکنر همسایگی', icon: Radio },
                  { key: 'canViewTemplates', label: isEn ? 'Templates' : 'الگوهای کانفیگ', icon: FileText },
                  { key: 'canViewLogs', label: isEn ? 'Audit & System Logs' : 'لاگ‌ها و رویدادها', icon: FileText },
                  { key: 'canViewSettings', label: isEn ? 'Settings & Security' : 'تنظیمات و دسترسی', icon: Lock },
                  { key: 'canCheckUpdate', label: isEn ? 'Check Updates (Super Admin Only)' : 'بررسی آپدیت (فقط سوپر ادمین)', icon: RefreshCw, isSuperAdminRestricted: true },
                  { key: 'canPerformUpdate', label: isEn ? 'Apply Updates (Super Admin Only)' : 'اعمال آپدیت (فقط سوپر ادمین)', icon: DownloadCloud, isSuperAdminRestricted: true },
                ].map(({ key, label, icon: ModuleIcon, isSuperAdminRestricted }: any) => {
                  const isPolicySuperAdmin = editingPolicy.id === 'policy-super-admin' || (editingPolicy.priority || 0) >= 100;
                  const isLocked = isSuperAdminRestricted && !isPolicySuperAdmin;
                  const checked = isLocked ? false : Boolean((editingPolicy as any)[key]);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border select-none ${
                        isLocked
                          ? 'opacity-60 bg-slate-900/40 border-white/5 cursor-not-allowed text-slate-500'
                          : checked
                          ? 'bg-indigo-500/15 border-indigo-500/40 text-white shadow-xs cursor-pointer'
                          : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer'
                      }`}
                      title={isLocked ? (isEn ? 'This capability is strictly reserved for the Super Administrator profile only.' : 'این دسترسی منحصراً مختص پروفایل مدیر ارشد سیستم (Super Admin) است.') : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isLocked}
                        onChange={(e) => {
                          if (isLocked) return;
                          setEditingPolicy({ ...editingPolicy, [key]: e.target.checked });
                        }}
                        className="w-4 h-4 accent-indigo-500 rounded cursor-pointer disabled:cursor-not-allowed"
                      />
                      <ModuleIcon className={`w-3.5 h-3.5 shrink-0 ${isLocked ? 'text-slate-600' : checked ? 'text-indigo-400' : 'text-slate-500'}`} />
                      <span className="text-[11px] font-semibold truncate">{label}</span>
                      {isLocked && <Lock className="w-3 h-3 text-amber-500/80 ml-auto shrink-0" />}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Granular Device Operations (Multi-Vendor Aware) */}
            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                <h4 className="font-bold text-xs text-emerald-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  <span>
                    {isEn
                      ? '4. Granular Device Capabilities (Multi-Vendor Operations)'
                      : '۴. دسترسی‌های ریز عملیاتی: اختیارات تفکیک‌شده بر اساس وندور (سیسکو، میکروتیک، لینوکس)'}
                  </span>
                </h4>

                {/* Vendor Filter Bar */}
                <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-white/10 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setVendorFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      vendorFilter === 'all'
                        ? 'bg-slate-700 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isEn ? 'All Vendors' : 'تمامی وندورها'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorFilter('cisco')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      vendorFilter === 'cisco'
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-blue-400 hover:bg-blue-500/10'
                    }`}
                  >
                    <Server className="w-3 h-3" />
                    <span>{isEn ? 'Cisco IOS' : 'سیسکو (Cisco)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorFilter('mikrotik')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      vendorFilter === 'mikrotik'
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-rose-400 hover:bg-rose-500/10'
                    }`}
                  >
                    <RouterIcon className="w-3 h-3" />
                    <span>{isEn ? 'MikroTik RouterOS' : 'میکروتیک (MikroTik)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorFilter('generic')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      vendorFilter === 'generic'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                  >
                    <Globe className="w-3 h-3" />
                    <span>{isEn ? 'Linux / Generic' : 'لینوکس و سرور'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorFilter('servers')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      vendorFilter === 'servers'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-amber-400 hover:bg-amber-500/10'
                    }`}
                  >
                    <HardDrive className="w-3 h-3" />
                    <span>{isEn ? 'Server Fleet & 3-Dots' : 'ناوگان سرورها و منوی ۳ نقطه'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorFilter('devices')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      vendorFilter === 'devices'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-indigo-400 hover:bg-indigo-500/10'
                    }`}
                  >
                    <Network className="w-3 h-3" />
                    <span>{isEn ? 'Equipment & 3-Dots' : 'تجهیزات شبکه و منوی ۳ نقطه'}</span>
                  </button>
                </div>
              </div>

              {/* VENDOR 1: CISCO IOS / IOS-XE */}
              {(vendorFilter === 'all' || vendorFilter === 'cisco') && (
                <div className="p-3 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-300">
                        <Server className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-blue-300">
                        {isEn ? 'Cisco IOS / IOS-XE Operations' : 'عملیات و اختیارات تخصصی سوئیچ و روترهای سیسکو'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                      Catalyst / Nexus
                    </span>
                  </div>

                  {/* Cisco Terminal Selector */}
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      {isEn ? 'Cisco CLI & Terminal Access:' : 'سطح دسترسی به کنسول و ترمینال سیسکو (CLI Terminal):'}
                    </label>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_cisco"
                          checked={editingPolicy.terminalAccess === 'none'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, terminalAccess: 'none' })}
                          className="accent-rose-500"
                        />
                        <span className="text-rose-300 font-semibold">{isEn ? 'No Access (Hidden)' : 'عدم دسترسی (ترمینال کاملاً مخفی)'}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_cisco"
                          checked={editingPolicy.terminalAccess === 'view_only'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, terminalAccess: 'view_only' })}
                          className="accent-amber-400"
                        />
                        <span className="text-amber-300 font-semibold">{isEn ? 'View-Only (Read Logs)' : 'فقط مشاهده لاگ‌ها (Read-Only)'}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_cisco"
                          checked={editingPolicy.terminalAccess === 'full'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, terminalAccess: 'full' })}
                          className="accent-emerald-400"
                        />
                        <span className="text-emerald-300 font-semibold">{isEn ? 'Full Interactive CLI' : 'ترمینال تعاملی کامل (Full Interactive)'}</span>
                      </label>
                    </div>
                  </div>

                  {/* Cisco Granular Checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      { key: 'canChangeVlan', label: isEn ? 'Assign & Change VLAN' : 'تغییر و تخصیص ویلن (Assign VLAN)', desc: isEn ? 'switchport access vlan' : 'جابجایی پورت بین ویلن‌های دسترسی' },
                      { key: 'canEditDescription', label: isEn ? 'Port Description' : 'تنظیم دیسکریپشن پورت (Description)', desc: isEn ? 'description <text>' : 'ثبت برچسب و توضیحات پورت' },
                      { key: 'canTogglePortSecurity', label: isEn ? 'Port Security & MAC' : 'کنترل پورت‌سکیوریتی (Port Security)', desc: isEn ? 'switchport port-security' : 'تنظیم محدودیت مک و رفتارهای Violation' },
                      { key: 'canToggleAdminStatus', label: isEn ? 'Shutdown / No Shutdown' : 'خاموش/روشن کردن پورت فیزیکی', desc: isEn ? 'shutdown / no shutdown' : 'قطع فیزیکی سیگنال پورت سوئیچ' },
                      { key: 'canWriteMemory', label: isEn ? 'Write Memory (NVRAM)' : 'ذخیره پایدار (copy run start)', desc: isEn ? 'write memory / NVRAM' : 'ذخیره کانفیگ در استارتاپ دیوایس' },
                      { key: 'canBatchOperate', label: isEn ? 'Batch Multi-Port Ops' : 'عملیات دسته‌جمعی پورت‌ها (Batch Range)', desc: isEn ? 'interface range ...' : 'اعمال همزمان تغییر روی چندین پورت' },
                    ].map(({ key, label, desc }) => {
                      const checked = (editingPolicy as any)[key];
                      return (
                        <label
                          key={key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                            checked
                              ? 'bg-blue-500/15 border-blue-500/40 text-blue-200'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setEditingPolicy({ ...editingPolicy, [key]: e.target.checked })}
                            className="w-4 h-4 mt-0.5 accent-blue-500 rounded"
                          />
                          <div>
                            <div className="font-bold text-xs text-white">{label}</div>
                            <div className="text-[10px] text-slate-400">{desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* VENDOR 2: MIKROTIK ROUTEROS */}
              {(vendorFilter === 'all' || vendorFilter === 'mikrotik') && (
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300">
                        <RouterIcon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-rose-300">
                        {isEn ? 'MikroTik RouterOS Operations' : 'عملیات و اختیارات تخصصی روتربورد و سوئیچ‌های میکروتیک'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      CCR / CRS / RouterBOARD
                    </span>
                  </div>

                  {/* MikroTik Terminal Selector */}
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      {isEn ? 'MikroTik RouterOS Terminal Access:' : 'سطح دسترسی به کنسول و خط فرمان RouterOS:'}
                    </label>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_mikrotik"
                          checked={(editingPolicy.mikrotikTerminalAccess || 'none') === 'none'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, mikrotikTerminalAccess: 'none' })}
                          className="accent-rose-500"
                        />
                        <span className="text-rose-300 font-semibold">{isEn ? 'No Access' : 'عدم دسترسی (مخفی)'}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_mikrotik"
                          checked={editingPolicy.mikrotikTerminalAccess === 'view_only'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, mikrotikTerminalAccess: 'view_only' })}
                          className="accent-amber-400"
                        />
                        <span className="text-amber-300 font-semibold">{isEn ? 'View-Only (Read Logs)' : 'فقط مشاهده لاگ و وضعیت'}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_mikrotik"
                          checked={editingPolicy.mikrotikTerminalAccess === 'full'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, mikrotikTerminalAccess: 'full' })}
                          className="accent-rose-400"
                        />
                        <span className="text-rose-300 font-semibold">{isEn ? 'Full Interactive RouterOS' : 'ترمینال کامل RouterOS'}</span>
                      </label>
                    </div>
                  </div>

                  {/* MikroTik Granular Checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      {
                        key: 'canMikrotikToggleInterface',
                        label: isEn ? 'Enable / Disable Interface' : 'فعال/غیرفعال کردن اینترفیس میکروتیک',
                        desc: isEn ? '/interface/set disabled=yes|no' : 'قطع و وصل پورت‌های ether, sfp, bonding',
                      },
                      {
                        key: 'canMikrotikBridgeVlan',
                        label: isEn ? 'Bridge VLAN & PVID' : 'مدیریت Bridge VLAN Filtering و PVID',
                        desc: isEn ? '/interface/bridge/vlan' : 'تغییر پورت‌های Tagged / Untagged در بریج',
                      },
                      {
                        key: 'canMikrotikComment',
                        label: isEn ? 'Interface Comment' : 'تنظیم کامنت روی پورت‌ها و رول‌ها',
                        desc: isEn ? '/interface/set comment=...' : 'درج توضیحات روی اجزای RouterOS',
                      },
                      {
                        key: 'canMikrotikIpPool',
                        label: isEn ? 'IP Address & Pools' : 'مدیریت آدرس‌های IP و DHCP Pool',
                        desc: isEn ? '/ip/address & /ip/pool' : 'تخصیص IP به پورت‌ها و تنظیم رنج‌های کلاینت',
                      },
                      {
                        key: 'canMikrotikFirewall',
                        label: isEn ? 'Firewall & NAT Rules' : 'بازرسی و تغییر رول‌های Firewall / NAT',
                        desc: isEn ? '/ip/firewall/filter & nat' : 'مشاهده و ویرایش قوانین امنیت و مسکرید',
                      },
                      {
                        key: 'canMikrotikBackup',
                        label: isEn ? 'System Backup & Export' : 'تهیه فایل پشتیبان و اکسپورت کانفیگ',
                        desc: isEn ? '/export & /system/backup' : 'دریافت خروجی اسکریپت .rsc و بکاپ باینری',
                      },
                      {
                        key: 'canMikrotikSafeMode',
                        label: isEn ? 'Safe Mode Protection' : 'پشتیبانی از Safe-Mode در تغییرات',
                        desc: isEn ? 'Auto-rollback on disconnect' : 'بازگشت خودکار تنظیمات در صورت قطعی اتصال',
                      },
                    ].map(({ key, label, desc }) => {
                      const checked = (editingPolicy as any)[key] || false;
                      return (
                        <label
                          key={key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                            checked
                              ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setEditingPolicy({ ...editingPolicy, [key]: e.target.checked })}
                            className="w-4 h-4 mt-0.5 accent-rose-500 rounded"
                          />
                          <div>
                            <div className="font-bold text-xs text-white">{label}</div>
                            <div className="text-[10px] text-slate-400">{desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* VENDOR 3: LINUX & GENERIC */}
              {(vendorFilter === 'all' || vendorFilter === 'generic') && (
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                        <Globe className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-emerald-300">
                        {isEn ? 'Linux Servers & Generic Appliances' : 'اختیارات سرورهای لینوکسی و تجهیزات جنریک'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      VyOS / Ubuntu / OpenWrt
                    </span>
                  </div>

                  {/* Generic Terminal Selector */}
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      {isEn ? 'SSH & Shell Terminal Access:' : 'سطح دسترسی به شل و ترمینال SSH:'}
                    </label>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_generic"
                          checked={(editingPolicy.genericTerminalAccess || 'none') === 'none'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, genericTerminalAccess: 'none' })}
                          className="accent-rose-500"
                        />
                        <span className="text-rose-300 font-semibold">{isEn ? 'No Access' : 'عدم دسترسی'}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_generic"
                          checked={editingPolicy.genericTerminalAccess === 'view_only'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, genericTerminalAccess: 'view_only' })}
                          className="accent-amber-400"
                        />
                        <span className="text-amber-300 font-semibold">{isEn ? 'View-Only (Logs & Status)' : 'مشاهده لاگ‌ها'}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                        <input
                          type="radio"
                          name="term_generic"
                          checked={editingPolicy.genericTerminalAccess === 'full'}
                          onChange={() => setEditingPolicy({ ...editingPolicy, genericTerminalAccess: 'full' })}
                          className="accent-emerald-400"
                        />
                        <span className="text-emerald-300 font-semibold">{isEn ? 'Full Interactive Shell' : 'شل کامل تعاملی'}</span>
                      </label>
                    </div>
                  </div>

                  {/* Generic Checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {[
                      {
                        key: 'canGenericToggleLink',
                        label: isEn ? 'Toggle Interface State' : 'تغییر وضعیت اینترفیس (Link Up/Down)',
                        desc: isEn ? 'ip link set dev up/down' : 'فعال یا خاموش کردن کارت‌های شبکه لینوکس',
                      },
                      {
                        key: 'canGenericDiagnostics',
                        label: isEn ? 'Diagnostics & Packet Probe' : 'ابزارهای عیب‌یابی (Ping / Trace / Capture)',
                        desc: isEn ? 'ping, traceroute, mtr' : 'تست ارتباط، مسیر و مانیتور بسته‌ها',
                      },
                      {
                        key: 'canGenericConfigBackup',
                        label: isEn ? 'Config Snapshot & Archive' : 'تهیه اسنپ‌شات و بکاپ از فایل‌های کانفیگ',
                        desc: isEn ? 'Archive system config files' : 'پشتیبان‌گیری از تنظیمات سرور و سرویس‌ها',
                      },
                    ].map(({ key, label, desc }) => {
                      const checked = (editingPolicy as any)[key] || false;
                      return (
                        <label
                          key={key}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                            checked
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                              : 'bg-slate-900/60 border-white/10 text-slate-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setEditingPolicy({ ...editingPolicy, [key]: e.target.checked })}
                            className="w-4 h-4 mt-0.5 accent-emerald-500 rounded"
                          />
                          <div>
                            <div className="font-bold text-xs text-white">{label}</div>
                            <div className="text-[10px] text-slate-400">{desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GLOBAL PLATFORM CAPABILITIES */}
              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-xs text-purple-300">
                      {isEn ? 'Global Platform Management' : 'مدیریت کلان تجهیزات و الگوهای سیستمی'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      key: 'canManageDevices',
                      label: isEn ? 'Add / Edit / Delete Devices' : 'تعریف، ویرایش و حذف فیزیکی تجهیزات (CRUD)',
                      desc: isEn ? 'Manage network inventory topology' : 'امکان افزودن یا حذف سوئیچ و روتر در سامانه',
                    },
                    {
                      key: 'canApplyTemplates',
                      label: isEn ? 'Apply Configuration Templates' : 'اعمال الگوها و اسکریپت‌های کانفیگ (Templates)',
                      desc: isEn ? 'Push templated CLI batches to devices' : 'امکان اعمال اسکریپت‌های گروهی سیسکو و میکروتیک',
                    },
                  ].map(({ key, label, desc }) => {
                    const checked = (editingPolicy as any)[key];
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          checked
                            ? 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                            : 'bg-slate-900/60 border-white/10 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setEditingPolicy({ ...editingPolicy, [key]: e.target.checked })}
                          className="w-4 h-4 mt-0.5 accent-purple-500 rounded"
                        />
                        <div>
                          <div className="font-bold text-xs text-white">{label}</div>
                          <div className="text-[10px] text-slate-400">{desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 5. Backup Portal & Disaster Recovery Governance */}
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300">
                      <Archive className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-cyan-300">
                        {isEn ? '5. Backup & Disaster Recovery Portal Operations' : '۵. پشتیبان‌گیری، استخراج و بازیابی کلان شبکه (Backup Portal)'}
                      </span>
                      <p className="text-[10px] text-slate-400">
                        {isEn
                          ? 'Control access to generating snapshots, exporting encrypted backups, and overwriting network state.'
                          : 'تعیین سطح دسترسی کاربر یا گروه به دانلود فایل‌های پشتیبان و بازیابی و بازنویسی پایگاه داده'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      key: 'canExportBackup',
                      label: isEn ? 'Export Network Backup Package' : 'تولید و دانلود فایل پشتیبان (Export Backup)',
                      desc: isEn ? 'Generate and export full/partial network state packages' : 'امکان تولید و دانلود پکیج پشتیبان شامل نقشه‌ها، دیوایس‌ها و RBAC',
                      risk: 'normal',
                      icon: DownloadCloud
                    },
                    {
                      key: 'canImportBackup',
                      label: isEn ? 'Import & Restore Network Data' : 'بازیابی و بازنویسی دیتابیس (Restore / Import)',
                      desc: isEn ? 'High Risk: Overwrite or merge devices, topology maps, and policies' : '⚠️ عملیات فوق بحرانی: بازنویسی، ایمپورت و جایگزینی کامل اطلاعات سامانه',
                      risk: 'high',
                      icon: UploadCloud
                    },
                  ].map(({ key, label, desc, risk, icon: Icon }) => {
                    const checked = (editingPolicy as any)[key];
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          checked
                            ? risk === 'high'
                              ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                            : 'bg-slate-900/60 border-white/10 text-slate-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setEditingPolicy({ ...editingPolicy, [key]: e.target.checked })}
                          className={`w-4 h-4 mt-0.5 rounded ${risk === 'high' ? 'accent-amber-500' : 'accent-cyan-500'}`}
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-xs text-white flex items-center gap-1.5">
                              <Icon className="w-3 h-3 text-slate-400" />
                              <span>{label}</span>
                            </div>
                            {risk === 'high' && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                                {isEn ? 'HIGH RISK' : 'بحرانی'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 6. SERVER FLEET & AUTOMATION (3-DOTS ACTION MENU PERMISSIONS) */}
              {(vendorFilter === 'all' || vendorFilter === 'servers') && (
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-4">
                  {/* Section Title & Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-amber-300">
                            {isEn
                              ? '6. Server Fleet & Automation Granular Permissions'
                              : '۶. اختیارات تفکیک‌شده ناوگان سرورها و منوی ۳ نقطه'}
                          </span>
                          <FieldInfoTooltip
                            title={isEn ? 'Server Action Permissions' : 'دسترسی‌های منوی ۳ نقطه سرور'}
                            infoWhatEn="Controls granular permissions for each item inside the 3-dots action menu on the Remote Servers & Automation Fleet page (Terminal/SSH, SFTP File Explorer, System Management, Web Servers, Database Engines, Restart/Shutdown, Edit, and Delete)."
                            infoWhatFa="تعیین و کنترل اختیارات برای تک‌تک گزینه‌های موجود در منوی سه‌نقطه سرورها در صفحه ناوگان سرورها و اتوماسیون (شامل ترمینال SSH، کاوشگر فایل SFTP، مانیتورینگ سیستم، وب‌سرورها، دیتابیس‌ها، ری‌استارت/خاموشی، ویرایش و حذف)."
                            infoWhyEn="Ensures least-privilege security by allowing operators to access logs or file browsers without granting dangerous root command execution or disruptive server reboot capabilities."
                            infoWhyFa="تضمین اصل حداقل دسترسی با مجاز کردن پرسنل به مشاهده فایل‌ها یا مانیتورینگ بدون اعطای دسترسی خطرناک شل روت یا ری‌استارت ناخواسته سرورهای حیاتی."
                            infoExampleEn="Grant File Explorer & Web Management on web servers (srv-web-prod01) while disabling SSH Terminal and Power Control, and totally blocking database servers (srv-db-master)."
                            infoExampleFa="اعطای دسترسی مرورگر فایل و وب‌سرور روی سرورهای وب (srv-web-prod01) در عین مسدود بودن ترمینال و کنترل توان، و مسدودسازی کامل دسترسی به سرورهای پایگاه داده (srv-db-master)."
                            isEn={isEn}
                            isLightMode={isLight}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {isEn
                            ? 'Configure baseline defaults for all servers plus granular per-server overrides for 3-dots menu actions.'
                            : 'تنظیم مجوزهای پیش‌فرض و تعریف ماتریس استثناها و اختیارات اختصاصی به ازای هر سرور برای منوی سه‌نقطه.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold">
                        {isEn
                          ? `${permittedScopeServers.length} Servers in Scope`
                          : `${permittedScopeServers.length} سرور در محدوده`}
                      </span>
                    </div>
                  </div>

                  {/* PART A: Baseline Default Permissions */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-amber-500/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                      <div>
                        <span className="font-bold text-xs text-amber-200">
                          {isEn ? 'A. Global Baseline Server Permissions' : 'الف) مجوزهای پیش‌فرض سراسری ناوگان سرورها'}
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {isEn
                            ? 'These default permissions apply to all servers unless explicitly overridden in the matrix below.'
                            : 'این دسترسی‌ها به صورت پیش‌فرض روی تمامی سرورهای مجاز اعمال می‌شوند، مگر اینکه در جدول پایین برای سروری استثنا تعریف شود.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPolicy({
                              ...editingPolicy,
                              defaultServerPermissions: { ...FULL_SERVER_PERMISSIONS },
                            });
                          }}
                          className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 transition cursor-pointer"
                        >
                          {isEn ? 'Grant All Defaults' : 'اعطای همه پیش‌فرض‌ها'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPolicy({
                              ...editingPolicy,
                              defaultServerPermissions: {
                                terminal: false,
                                file_explorer: false,
                                server_management: false,
                                web_management: false,
                                database_management: false,
                                power_control: false,
                                edit_properties: false,
                                delete_server: false,
                              },
                            });
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/30 transition cursor-pointer"
                        >
                          {isEn ? 'Revoke All Defaults' : 'مسدودسازی همه پیش‌فرض‌ها'}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {SERVER_ACTIONS_CATALOG.map((action) => {
                        const isGranted = Boolean(editingPolicy.defaultServerPermissions?.[action.key]);
                        return (
                          <label
                            key={action.key}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                              isGranted
                                ? action.danger
                                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                  : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                                : 'bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isGranted}
                              onChange={(e) => {
                                setEditingPolicy({
                                  ...editingPolicy,
                                  defaultServerPermissions: {
                                    ...(editingPolicy.defaultServerPermissions || {}),
                                    [action.key]: e.target.checked,
                                  },
                                });
                              }}
                              className={`w-4 h-4 mt-0.5 rounded cursor-pointer ${
                                action.danger ? 'accent-amber-500' : 'accent-indigo-500'
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-[11px] text-white truncate">
                                  {isEn ? action.labelEn : action.labelFa}
                                </span>
                                {action.danger && (
                                  <span className="px-1 py-0.2 rounded text-[8px] bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0 font-bold">
                                    {isEn ? 'HIGH RISK' : 'حساس'}
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                                {isEn ? action.descriptionEn : action.descriptionFa}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* PART B: Per-Server Action Matrix */}
                  <div className="p-3 rounded-xl bg-slate-900/60 border border-amber-500/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-amber-200">
                            {isEn ? 'B. Per-Server Permission Matrix' : 'ب) ماتریس دسترسی به تفکیک هر سرور'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                            {isEn ? 'Granular Overrides' : 'تنظیمات اختصاصی'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {isEn
                            ? 'Configure server-specific action overrides. An override set here takes priority over baseline defaults.'
                            : 'تنظیم اختیارات اختصاصی برای هر سرور. دسترسی‌های تنظیم‌شده در اینجا اولویت قطعی بر مجوزهای پیش‌فرض دارند.'}
                        </p>
                      </div>

                      {/* Matrix Toolbar: Search & Filter */}
                      <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
                        <div className="relative flex-1 sm:w-48">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={serverSearchQuery}
                            onChange={(e) => setServerSearchQuery(e.target.value)}
                            placeholder={isEn ? 'Search server name / IP...' : 'جستجوی نام یا IP سرور...'}
                            className="w-full pl-8 pr-2.5 py-1 text-[11px] rounded-lg bg-slate-950/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                          />
                        </div>

                        <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-white/10">
                          <button
                            type="button"
                            onClick={() => setServerMatrixFilter('all')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                              serverMatrixFilter === 'all'
                                ? 'bg-amber-600 text-white shadow'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? 'All' : 'همه'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setServerMatrixFilter('custom_only')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                              serverMatrixFilter === 'custom_only'
                                ? 'bg-amber-600 text-white shadow'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? 'Customized' : 'دارای استثنا'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setServerMatrixFilter('default_only')}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                              serverMatrixFilter === 'default_only'
                                ? 'bg-amber-600 text-white shadow'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isEn ? 'Defaults' : 'پیروی از پیش‌فرض'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Servers List */}
                    {permittedScopeServers.length === 0 ? (
                      <div className="p-6 rounded-xl bg-slate-950/40 border border-dashed border-white/10 text-center space-y-2">
                        <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                        <div className="text-xs font-bold text-slate-300">
                          {isEn ? 'No Servers in Current Scope' : 'هیچ سروری در محدوده انتخابی فعلی قرار ندارد'}
                        </div>
                        <p className="text-[10px] text-slate-500 max-w-md mx-auto">
                          {editingPolicy.canViewServers === false
                            ? (isEn
                                ? 'Remote Servers module is disabled in Section 1 above (Remote Servers checkbox is unchecked).'
                                : 'ماژول سرورهای ریموت در بخش ۱ بالا غیرفعال است (تیک سرورهای ریموت برداشته شده است).')
                            : editingPolicy.targetScope === 'groups' && (!editingPolicy.targetGroupIds || editingPolicy.targetGroupIds.length === 0)
                            ? (isEn
                                ? 'No device groups selected. Please select at least one device group in Section 2 above.'
                                : 'هیچ گروه تجهیزاتی انتخاب نشده است. لطفاً در بخش ۲ بالا حداقل یک گروه تجهیزات را انتخاب کنید.')
                            : (isEn
                                ? 'Either assign Device Groups that contain servers to this policy, or set Target Scope to "All Equipment" above to configure server permissions.'
                                : 'جهت تعریف دسترسی سرورها، در بخش بالا محدوده پالیسی را روی «تمام تجهیزات» قرار دهید یا گروه‌های تجهیزاتی دارای سرور را انتخاب کنید.')}
                        </p>
                      </div>
                    ) : (() => {
                      const filteredServers = permittedScopeServers.filter((srv) => {
                        if (serverSearchQuery.trim()) {
                          const q = serverSearchQuery.trim().toLowerCase();
                          const nameMatch = (srv.name || '').toLowerCase().includes(q);
                          const ipMatch = ((srv.ip || (srv as any).ip_address || '')).toLowerCase().includes(q);
                          const hostMatch = (srv.hostname || '').toLowerCase().includes(q);
                          if (!nameMatch && !ipMatch && !hostMatch) return false;
                        }
                        const hasCustom = Boolean(
                          editingPolicy.perServerPermissions?.[srv.id] &&
                          Object.keys(editingPolicy.perServerPermissions[srv.id]).length > 0
                        );
                        if (serverMatrixFilter === 'custom_only' && !hasCustom) return false;
                        if (serverMatrixFilter === 'default_only' && hasCustom) return false;
                        return true;
                      });

                      if (filteredServers.length === 0) {
                        return (
                          <div className="p-6 rounded-xl bg-slate-950/40 border border-dashed border-white/10 text-center space-y-1">
                            <div className="text-xs font-semibold text-slate-300">
                              {isEn ? 'No Matching Servers Found' : 'هیچ سروری با این فیلتر یا جستجو یافت نشد'}
                            </div>
                            <p className="text-[10px] text-slate-500">
                              {isEn
                                ? 'No servers in the current scope match your search query or filter selection.'
                                : 'سروری در محدوده فعلی با عبارت جستجو یا فیلتر انتخابی مطابقت ندارد.'}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                          {filteredServers.map((srv) => {
                            const customPerms = editingPolicy.perServerPermissions?.[srv.id];
                            const hasCustomOverrides = Boolean(
                              customPerms && Object.keys(customPerms).length > 0
                            );

                            return (
                              <div
                                key={srv.id}
                                className={`p-3 rounded-xl border transition ${
                                  hasCustomOverrides
                                    ? 'bg-slate-950/90 border-amber-500/40 shadow-sm'
                                    : 'bg-slate-950/50 border-white/5 hover:border-white/10'
                                }`}
                              >
                                {/* Server Item Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2.5 mb-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <div
                                      className={`p-1.5 rounded-lg shrink-0 ${
                                        srv.os_type === 'windows'
                                          ? 'bg-cyan-500/20 text-cyan-300'
                                          : 'bg-emerald-500/20 text-emerald-300'
                                      }`}
                                    >
                                      <Server className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs text-white">
                                          {srv.name}
                                        </span>
                                        <span
                                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold ${
                                            srv.os_type === 'windows'
                                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                          }`}
                                        >
                                          {srv.os_type || 'linux'}
                                        </span>
                                        {hasCustomOverrides ? (
                                          <span className="px-1.5 py-0.2 rounded text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                                            {isEn ? 'Custom Overrides' : 'تنظیمات اختصاصی فعال'}
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.2 rounded text-[8px] bg-slate-800 text-slate-400 border border-white/5">
                                            {isEn ? 'Inheriting Baseline' : 'پیروی از پیش‌فرض'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                        <span>IP: {srv.ip}</span>
                                        {srv.category && <span>• {srv.category}</span>}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Row Quick Actions */}
                                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                    {hasCustomOverrides && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = { ...(editingPolicy.perServerPermissions || {}) };
                                          delete next[srv.id];
                                          setEditingPolicy({
                                            ...editingPolicy,
                                            perServerPermissions: next,
                                          });
                                        }}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-white/10 transition cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3 text-slate-400" />
                                        <span>{isEn ? 'Reset to Default' : 'حذف استثناها'}</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPolicy({
                                          ...editingPolicy,
                                          perServerPermissions: {
                                            ...(editingPolicy.perServerPermissions || {}),
                                            [srv.id]: { ...FULL_SERVER_PERMISSIONS },
                                          },
                                        });
                                      }}
                                      className="px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 transition cursor-pointer"
                                    >
                                      {isEn ? 'Allow All' : 'اعطای همه'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPolicy({
                                          ...editingPolicy,
                                          perServerPermissions: {
                                            ...(editingPolicy.perServerPermissions || {}),
                                            [srv.id]: {
                                              terminal: false,
                                              file_explorer: false,
                                              server_management: false,
                                              web_management: false,
                                              database_management: false,
                                              power_control: false,
                                              edit_properties: false,
                                              delete_server: false,
                                            },
                                          },
                                        });
                                      }}
                                      className="px-2 py-0.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[10px] font-bold border border-rose-500/30 transition cursor-pointer"
                                    >
                                      {isEn ? 'Deny All' : 'مسدودسازی همه'}
                                    </button>
                                  </div>
                                </div>

                                {/* Action Matrix Checkboxes for this Server */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
                                  {SERVER_ACTIONS_CATALOG.map((action) => {
                                    const hasSpecificOverride =
                                      customPerms && typeof customPerms[action.key] === 'boolean';
                                    const isPermitted = hasSpecificOverride
                                      ? customPerms[action.key]
                                      : Boolean(editingPolicy.defaultServerPermissions?.[action.key]);

                                    return (
                                      <button
                                        key={action.key}
                                        type="button"
                                        onClick={() => {
                                          const currentCustom = editingPolicy.perServerPermissions?.[srv.id] || {};
                                          const nextServerPerms = {
                                            ...currentCustom,
                                            [action.key]: !isPermitted,
                                          };
                                          setEditingPolicy({
                                            ...editingPolicy,
                                            perServerPermissions: {
                                              ...(editingPolicy.perServerPermissions || {}),
                                              [srv.id]: nextServerPerms,
                                            },
                                          });
                                        }}
                                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition cursor-pointer select-none ${
                                          isPermitted
                                            ? hasSpecificOverride
                                              ? 'bg-amber-500/20 border-amber-500/50 text-white shadow-xs'
                                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                            : hasSpecificOverride
                                            ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                            : 'bg-slate-900/60 border-white/5 text-slate-500 hover:text-slate-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1 mb-1">
                                          {isPermitted ? (
                                            <Check className={`w-3.5 h-3.5 ${hasSpecificOverride ? 'text-amber-300' : 'text-emerald-400'}`} />
                                          ) : (
                                            <X className={`w-3.5 h-3.5 ${hasSpecificOverride ? 'text-rose-400' : 'text-slate-600'}`} />
                                          )}
                                          <span className="text-[10px] font-bold">
                                            {action.key === 'terminal'
                                              ? (isEn ? 'Terminal' : 'ترمینال')
                                              : action.key === 'file_explorer'
                                              ? (isEn ? 'Files' : 'فایل‌ها')
                                              : action.key === 'server_management'
                                              ? (isEn ? 'System' : 'سیستم')
                                              : action.key === 'web_management'
                                              ? (isEn ? 'Web' : 'وب')
                                              : action.key === 'database_management'
                                              ? (isEn ? 'Database' : 'دیتابیس')
                                              : action.key === 'power_control'
                                              ? (isEn ? 'Power' : 'توان')
                                              : action.key === 'edit_properties'
                                              ? (isEn ? 'Edit' : 'ویرایش')
                                              : (isEn ? 'Delete' : 'حذف')}
                                          </span>
                                        </div>
                                        <span className={`text-[8px] font-mono px-1 py-0.2 rounded ${
                                          hasSpecificOverride
                                            ? 'bg-amber-500/20 text-amber-300 font-bold'
                                            : 'text-slate-500'
                                        }`}>
                                          {hasSpecificOverride
                                            ? (isEn ? 'Custom' : 'اختصاصی')
                                            : (isEn ? 'Default' : 'پیش‌فرض')}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 7. NETWORK EQUIPMENT INVENTORY & PORT GRANULAR PERMISSIONS */}
              {(vendorFilter === 'all' || vendorFilter === 'devices') && (() => {
                const renderPlatformBadge = (platform?: 'all' | 'cisco' | 'mikrotik' | 'common', isCompact = false) => {
                  if (platform === 'cisco') {
                    return (
                      <span className={`rounded font-mono border font-bold shrink-0 ${
                        isCompact ? 'px-1 py-0.2 text-[7.5px]' : 'px-1.5 py-0.5 text-[8.5px]'
                      } ${
                        isLight
                          ? 'bg-sky-100 text-sky-800 border-sky-300'
                          : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                      }`}>
                        {isEn ? (isCompact ? 'Cisco' : 'Cisco IOS') : (isCompact ? 'سیسکو' : 'اختصاصی سیسکو')}
                      </span>
                    );
                  }
                  if (platform === 'mikrotik') {
                    return (
                      <span className={`rounded font-mono border font-bold shrink-0 ${
                        isCompact ? 'px-1 py-0.2 text-[7.5px]' : 'px-1.5 py-0.5 text-[8.5px]'
                      } ${
                        isLight
                          ? 'bg-purple-100 text-purple-800 border-purple-300'
                          : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      }`}>
                        {isEn ? (isCompact ? 'MikroTik' : 'MikroTik RouterOS') : (isCompact ? 'میکروتیک' : 'اختصاصی میکروتیک')}
                      </span>
                    );
                  }
                  return (
                    <span className={`rounded font-mono border font-bold shrink-0 ${
                      isCompact ? 'px-1 py-0.2 text-[7.5px]' : 'px-1.5 py-0.5 text-[8.5px]'
                    } ${
                      isLight
                        ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
                        : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                    }`}>
                      {isEn ? (isCompact ? 'Common' : 'Common') : (isCompact ? 'مشترک' : 'مشترک')}
                    </span>
                  );
                };

                const generalEquipmentActions = DEVICE_ACTIONS_CATALOG.filter((a) => a.category !== 'port');
                const portInterfaceActions = DEVICE_ACTIONS_CATALOG.filter((a) => a.category === 'port');

                return (
                  <div className={`p-3.5 rounded-xl border space-y-4 ${
                    isLight
                      ? 'bg-indigo-50/50 border-indigo-200'
                      : 'bg-indigo-950/20 border-indigo-500/30'
                  }`}>
                    {/* Section Title & Info */}
                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 ${
                      isLight ? 'border-indigo-100' : 'border-indigo-500/20'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'}`}>
                          <Network className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-xs ${isLight ? 'text-indigo-900' : 'text-indigo-300'}`}>
                              {isEn
                                ? '7. Network Equipment & Port Granular Permissions'
                                : '۷. اختیارات تفکیک‌شده تجهیزات شبکه و پورت‌ها'}
                            </span>
                            <FieldInfoTooltip
                              title={isEn ? 'Equipment & Port Action Permissions' : 'دسترسی‌های تجهیزات و پورت‌های شبکه'}
                              infoWhatEn="Controls granular permissions for both 3-dots equipment actions (SSH Terminal, Web Consoles, Config Templates, Notes, Edit Properties, Ping, NVRAM Write, Delete) and individual port-level operations (Shutdown/Enable power, Trunk/Access mode, VLAN/PVID assignment, Port Security, Description, Bridge membership, Speed/Duplex, and TDR cable diagnostics)."
                              infoWhatFa="تعیین و کنترل اختیارات تفکیک‌شده برای عملیات سطح تجهیز (کنسول‌های وب، ترمینال SSH، اعمال تمپلیت، یادداشت، ویرایش مشخصات، تست پینگ، ذخیره در NVRAM و حذف) و تک‌تک عملیات پورت‌ها در راست‌کلیک و فرم ویرایش (روشن/خاموش اداری، تغییر مود ترانک/اکسس، تخصیص VLAN و PVID، امنیت پورت، توضیحات، بریج، سرعت/دوبلکس و تست کابل TDR)."
                              infoWhyEn="Enforces least-privilege security by allowing operators to inspect ports, edit comments, and run cable diagnostics without granting dangerous full CLI terminal access, NVRAM writes, or port shutdown authority on production switches."
                              infoWhyFa="تضمین اصل حداقل دسترسی با مجاز کردن پرسنل به مشاهده پورت‌ها، ویرایش توضیحات و تست عیب‌یابی کابل بدون اعطای دسترسی خطرناک شل تعاملی، رایت مموری یا خاموش کردن پورت‌های حیاتی شبکه."
                              infoExampleEn="Grant Helpdesk staff permission to inspect ports, update descriptions, and test cables while disabling port shutdown, VLAN reconfiguration, and terminal access on Core Switches."
                              infoExampleFa="اعطای دسترسی مشاهده پورت، تغییر توضیحات و تست کابل به پشتیبانی در عین مسدودسازی خاموش‌سازی پورت، تغییر VLAN و ترمینال روی سوییچ‌های توزیع و کور."
                              isEn={isEn}
                              isLightMode={isLight}
                            />
                          </div>
                          <p className={`text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            {isEn
                              ? 'Configure baseline defaults for all network equipment plus granular per-device overrides for equipment and port actions.'
                              : 'تنظیم مجوزهای پیش‌فرض سراسری و تعریف ماتریس استثناها و اختیارات اختصاصی به ازای هر تجهیز برای منوی ۳ نقطه و عملیات پورت‌ها.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-bold ${
                          isLight
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                            : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                        }`}>
                          {isEn
                            ? `${permittedScopeDevices.length} Equipment in Scope`
                            : `${permittedScopeDevices.length} تجهیز در محدوده`}
                        </span>
                      </div>
                    </div>

                    {/* PART A: Baseline Default Device & Port Permissions */}
                    <div className={`p-3.5 rounded-xl border space-y-4 ${
                      isLight
                        ? 'bg-white border-slate-200 shadow-xs'
                        : 'bg-slate-900/60 border-indigo-500/20'
                    }`}>
                      {/* Part A Header & Global Bulk Actions */}
                      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5 ${
                        isLight ? 'border-slate-100' : 'border-white/5'
                      }`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-xs ${isLight ? 'text-indigo-900' : 'text-indigo-200'}`}>
                              {isEn ? 'A. Global Baseline Default Permissions' : 'الف) مجوزهای پیش‌فرض سراسری تجهیزات و پورت‌ها'}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[8.5px] border font-mono font-bold ${
                              isLight
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            }`}>
                              {isEn ? '17 Capabilities' : '۱۷ اختیار'}
                            </span>
                          </div>
                          <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            {isEn
                              ? 'These default permissions apply across all scoped devices unless an explicit override is configured in the matrix below.'
                              : 'این دسترسی‌ها به صورت پیش‌فرض روی تمامی تجهیزات مجاز اعمال می‌شوند، مگر اینکه در ماتریس پایین برای تجهیزی استثنا تعریف شود.'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPolicy({
                                ...editingPolicy,
                                defaultDevicePermissions: { ...FULL_DEVICE_PERMISSIONS },
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                              isLight
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {isEn ? 'Grant All Defaults' : 'اعطای همه پیش‌فرض‌ها'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPolicy({
                                ...editingPolicy,
                                defaultDevicePermissions: { ...EMPTY_DEVICE_PERMISSIONS },
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                              isLight
                                ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                                : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {isEn ? 'Revoke All Defaults' : 'مسدودسازی همه پیش‌فرض‌ها'}
                          </button>
                        </div>
                      </div>

                      {/* SUB-SECTION A.1: General Equipment Capabilities (3-Dots Menu) */}
                      <div className={`space-y-2.5 rounded-xl p-3 border ${
                        isLight
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-950/40 border-white/5'
                      }`}>
                        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 ${
                          isLight ? 'border-slate-200' : 'border-white/5'
                        }`}>
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md ${isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'}`}>
                              <RouterIcon className="w-3.5 h-3.5" />
                            </div>
                            <span className={`font-bold text-[11px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {isEn ? 'A.1 General Equipment Capabilities (3-Dots Action Menu)' : 'الف-۱) اختیارات کلی تجهیزات شبکه (منوی ۳ نقطه)'}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[8px] border font-mono ${
                              isLight
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                            }`}>
                              {generalEquipmentActions.length} {isEn ? 'Actions' : 'اختیار'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPolicy({
                                  ...editingPolicy,
                                  defaultDevicePermissions: {
                                    ...(editingPolicy.defaultDevicePermissions || {}),
                                    ...FULL_EQUIPMENT_PERMISSIONS,
                                  },
                                });
                              }}
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-medium border transition cursor-pointer ${
                                isLight
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/20'
                              }`}
                            >
                              {isEn ? 'Grant Equipment Defaults' : 'اعطای پیش‌فرض‌های تجهیز'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPolicy({
                                  ...editingPolicy,
                                  defaultDevicePermissions: {
                                    ...(editingPolicy.defaultDevicePermissions || {}),
                                    ...EMPTY_EQUIPMENT_PERMISSIONS,
                                  },
                                });
                              }}
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-medium border transition cursor-pointer ${
                                isLight
                                  ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                                  : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/20'
                              }`}
                            >
                              {isEn ? 'Revoke Equipment Defaults' : 'مسدودسازی تجهیز'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {generalEquipmentActions.map((action) => {
                            const isGranted = Boolean(editingPolicy.defaultDevicePermissions?.[action.key]);
                            return (
                              <label
                                key={action.key}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                                  isGranted
                                    ? action.danger
                                      ? isLight
                                        ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-xs'
                                        : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                                      : isLight
                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-xs'
                                      : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                                    : isLight
                                    ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                    : 'bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isGranted}
                                  onChange={(e) => {
                                    setEditingPolicy({
                                      ...editingPolicy,
                                      defaultDevicePermissions: {
                                        ...(editingPolicy.defaultDevicePermissions || {}),
                                        [action.key]: e.target.checked,
                                      },
                                    });
                                  }}
                                  className={`w-4 h-4 mt-0.5 rounded cursor-pointer ${
                                    action.danger ? 'accent-rose-500' : 'accent-indigo-500'
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`font-bold text-[11px] truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                        {isEn ? action.labelEn : action.labelFa}
                                      </span>
                                      <FieldInfoTooltip
                                        title={isEn ? action.labelEn : action.labelFa}
                                        infoWhatEn={action.tooltipWhatEn || action.descriptionEn}
                                        infoWhatFa={action.tooltipWhatFa || action.descriptionFa}
                                        infoWhyEn={action.tooltipWhyEn || action.descriptionEn}
                                        infoWhyFa={action.tooltipWhyFa || action.descriptionFa}
                                        infoExampleEn={action.tooltipExampleEn || 'Configurable via RBAC matrix.'}
                                        infoExampleFa={action.tooltipExampleFa || 'قابل تنظیم در ماتریس دسترسی.'}
                                        isEn={isEn}
                                        isLightMode={isLight}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {renderPlatformBadge(action.platform, true)}
                                      {action.danger && (
                                        <span className={`px-1 py-0.2 rounded text-[7.5px] border shrink-0 font-bold ${
                                          isLight
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                        }`}>
                                          {isEn ? 'HIGH RISK' : 'حساس'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className={`text-[9px] mt-1 line-clamp-2 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                    {isEn ? action.descriptionEn : action.descriptionFa}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* SUB-SECTION A.2: Port & Interface Capabilities (Port Context Menu & Inspector) */}
                      <div className={`space-y-2.5 rounded-xl p-3 border ${
                        isLight
                          ? 'bg-cyan-50/70 border-cyan-200'
                          : 'bg-cyan-950/20 border-cyan-500/20'
                      }`}>
                        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 ${
                          isLight ? 'border-cyan-200' : 'border-cyan-500/20'
                        }`}>
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md ${isLight ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-500/20 text-cyan-300'}`}>
                              <Sliders className="w-3.5 h-3.5" />
                            </div>
                            <span className={`font-bold text-[11px] ${isLight ? 'text-cyan-950' : 'text-cyan-200'}`}>
                              {isEn ? 'A.2 Port & Interface Capabilities (Port Context Menu & Inspector)' : 'الف-۲) اختیارات پورت‌ها و اینترفیس‌ها (منوی راست‌کلیک و فرم ویرایش پورت)'}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[8px] border font-mono ${
                              isLight
                                ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
                                : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                            }`}>
                              {portInterfaceActions.length} {isEn ? 'Port Actions' : 'اختیار پورت'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 self-end sm:self-auto">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPolicy({
                                  ...editingPolicy,
                                  defaultDevicePermissions: {
                                    ...(editingPolicy.defaultDevicePermissions || {}),
                                    ...FULL_PORT_PERMISSIONS,
                                  },
                                });
                              }}
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-medium border transition cursor-pointer ${
                                isLight
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/20'
                              }`}
                            >
                              {isEn ? 'Grant Port Defaults' : 'اعطای همه پورت‌ها'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPolicy({
                                  ...editingPolicy,
                                  defaultDevicePermissions: {
                                    ...(editingPolicy.defaultDevicePermissions || {}),
                                    ...EMPTY_PORT_PERMISSIONS,
                                  },
                                });
                              }}
                              className={`px-2 py-0.5 rounded-md text-[9.5px] font-medium border transition cursor-pointer ${
                                isLight
                                  ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                                  : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/20'
                              }`}
                            >
                              {isEn ? 'Revoke Port Defaults' : 'مسدودسازی همه پورت‌ها'}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          {portInterfaceActions.map((action) => {
                            const isGranted = Boolean(editingPolicy.defaultDevicePermissions?.[action.key]);
                            return (
                              <label
                                key={action.key}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                                  isGranted
                                    ? action.danger
                                      ? isLight
                                        ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-xs'
                                        : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                                      : isLight
                                      ? 'bg-cyan-50 border-cyan-300 text-cyan-950 shadow-xs'
                                      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                                    : isLight
                                    ? 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                    : 'bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isGranted}
                                  onChange={(e) => {
                                    setEditingPolicy({
                                      ...editingPolicy,
                                      defaultDevicePermissions: {
                                        ...(editingPolicy.defaultDevicePermissions || {}),
                                        [action.key]: e.target.checked,
                                      },
                                    });
                                  }}
                                  className={`w-4 h-4 mt-0.5 rounded cursor-pointer ${
                                    action.danger ? 'accent-rose-500' : 'accent-cyan-500'
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className={`font-bold text-[11px] truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                        {isEn ? action.labelEn : action.labelFa}
                                      </span>
                                      <FieldInfoTooltip
                                        title={isEn ? action.labelEn : action.labelFa}
                                        infoWhatEn={action.tooltipWhatEn || action.descriptionEn}
                                        infoWhatFa={action.tooltipWhatFa || action.descriptionFa}
                                        infoWhyEn={action.tooltipWhyEn || action.descriptionEn}
                                        infoWhyFa={action.tooltipWhyFa || action.descriptionFa}
                                        infoExampleEn={action.tooltipExampleEn || 'Configurable via RBAC matrix.'}
                                        infoExampleFa={action.tooltipExampleFa || 'قابل تنظیم در ماتریس دسترسی.'}
                                        isEn={isEn}
                                        isLightMode={isLight}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {renderPlatformBadge(action.platform, true)}
                                      {action.danger && (
                                        <span className={`px-1 py-0.2 rounded text-[7.5px] border shrink-0 font-bold ${
                                          isLight
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                        }`}>
                                          {isEn ? 'HIGH RISK' : 'حساس'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className={`text-[9px] mt-1 line-clamp-2 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                    {isEn ? action.descriptionEn : action.descriptionFa}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* PART B: Per-Device Permissions Override Matrix */}
                    <div className={`p-3 rounded-xl border space-y-3 ${
                      isLight
                        ? 'bg-white border-slate-200 shadow-xs'
                        : 'bg-slate-900/60 border-indigo-500/20'
                    }`}>
                      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 ${
                        isLight ? 'border-slate-100' : 'border-white/5'
                      }`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-xs ${isLight ? 'text-indigo-900' : 'text-indigo-200'}`}>
                              {isEn ? 'B. Per-Device Permission Matrix' : 'ب) ماتریس دسترسی به تفکیک هر تجهیز شبکه'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] border font-mono font-bold ${
                              isLight
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            }`}>
                              {isEn ? 'Granular Overrides' : 'تنظیمات اختصاصی'}
                            </span>
                          </div>
                          <p className={`text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            {isEn
                              ? 'Configure device-specific action overrides. An override set here takes priority over baseline defaults.'
                              : 'تنظیم اختیارات اختصاصی برای هر تجهیز. دسترسی‌های تنظیم‌شده در اینجا اولویت قطعی بر مجوزهای پیش‌فرض دارند.'}
                          </p>
                        </div>

                        {/* Matrix Toolbar: Search & Filter */}
                        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
                          <div className="relative flex-1 sm:w-48">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={deviceSearchQuery}
                              onChange={(e) => setDeviceSearchQuery(e.target.value)}
                              placeholder={isEn ? 'Search name / IP / model...' : 'جستجوی نام، IP یا مدل...'}
                              className={`w-full pl-8 pr-2.5 py-1 text-[11px] rounded-lg border transition outline-none ${
                                isLight
                                  ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                                  : 'bg-slate-950/80 border-white/10 text-white placeholder-slate-500 focus:border-indigo-500/50'
                              }`}
                            />
                          </div>

                          {/* Status Filter */}
                          <div className={`flex items-center gap-1 p-0.5 rounded-lg border ${
                            isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950/80 border-white/10'
                          }`}>
                            <button
                              type="button"
                              onClick={() => setDeviceMatrixFilter('all')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                deviceMatrixFilter === 'all'
                                  ? 'bg-indigo-600 text-white shadow'
                                  : isLight
                                  ? 'text-slate-600 hover:text-slate-900'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isEn ? 'All' : 'همه'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeviceMatrixFilter('custom_only')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                deviceMatrixFilter === 'custom_only'
                                  ? 'bg-indigo-600 text-white shadow'
                                  : isLight
                                  ? 'text-slate-600 hover:text-slate-900'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isEn ? 'Customized' : 'دارای استثنا'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeviceMatrixFilter('default_only')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                deviceMatrixFilter === 'default_only'
                                  ? 'bg-indigo-600 text-white shadow'
                                  : isLight
                                  ? 'text-slate-600 hover:text-slate-900'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isEn ? 'Defaults' : 'پیروی از پیش‌فرض'}
                            </button>
                          </div>

                          {/* Device Type Filter */}
                          <div className={`flex items-center gap-1 p-0.5 rounded-lg border ${
                            isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-950/80 border-white/10'
                          }`}>
                            <button
                              type="button"
                              onClick={() => setDeviceTypeMatrixFilter('all')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                deviceTypeMatrixFilter === 'all'
                                  ? 'bg-indigo-600 text-white shadow'
                                  : isLight
                                  ? 'text-slate-600 hover:text-slate-900'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isEn ? 'All Types' : 'انواع'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeviceTypeMatrixFilter('switch')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                deviceTypeMatrixFilter === 'switch'
                                  ? 'bg-indigo-600 text-white shadow'
                                  : isLight
                                  ? 'text-slate-600 hover:text-slate-900'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isEn ? 'Switches' : 'سوئیچ'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeviceTypeMatrixFilter('router')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                deviceTypeMatrixFilter === 'router'
                                  ? 'bg-indigo-600 text-white shadow'
                                  : isLight
                                  ? 'text-slate-600 hover:text-slate-900'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isEn ? 'Routers' : 'روتر'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeviceTypeMatrixFilter('firewall')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                deviceTypeMatrixFilter === 'firewall'
                                  ? 'bg-indigo-600 text-white shadow'
                                  : isLight
                                  ? 'text-slate-600 hover:text-slate-900'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {isEn ? 'Firewalls' : 'فایروال'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Devices List */}
                      {permittedScopeDevices.length === 0 ? (
                        <div className={`p-6 rounded-xl border border-dashed text-center space-y-2 ${
                          isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/40 border-white/10'
                        }`}>
                          <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                          <div className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                            {isEn ? 'No Network Equipment in Current Scope' : 'هیچ تجهیزی در محدوده انتخابی فعلی قرار ندارد'}
                          </div>
                          <p className={`text-[10px] max-w-md mx-auto ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                            {editingPolicy.canViewDevices === false
                              ? (isEn
                                  ? 'Network Equipment module is disabled in Section 1 above (Network Devices checkbox is unchecked).'
                                  : 'ماژول تجهیزات شبکه در بخش ۱ بالا غیرفعال است (تیک تجهیزات شبکه برداشته شده است).')
                              : editingPolicy.targetScope === 'groups' && (!editingPolicy.targetGroupIds || editingPolicy.targetGroupIds.length === 0)
                              ? (isEn
                                  ? 'No device groups selected. Please select at least one device group in Section 2 above.'
                                  : 'هیچ گروه تجهیزاتی انتخاب نشده است. لطفاً در بخش ۲ بالا حداقل یک گروه تجهیزات را انتخاب کنید.')
                              : (isEn
                                  ? 'Either assign Device Groups that contain equipment to this policy, or set Target Scope to "All Equipment" above to configure equipment permissions.'
                                  : 'جهت تعریف دسترسی تجهیزات، در بخش بالا محدوده پالیسی را روی «تمام تجهیزات» قرار دهید یا گروه‌های تجهیزاتی دارای دیوایس را انتخاب کنید.')}
                          </p>
                        </div>
                      ) : (() => {
                        const filteredDevices = permittedScopeDevices.filter((dev) => {
                          if (deviceTypeMatrixFilter !== 'all') {
                            const dType = (dev.type || '').toLowerCase();
                            if (deviceTypeMatrixFilter === 'switch' && dType !== 'switch') return false;
                            if (deviceTypeMatrixFilter === 'router' && dType !== 'router') return false;
                            if (deviceTypeMatrixFilter === 'firewall' && dType !== 'firewall') return false;
                            if (deviceTypeMatrixFilter === 'other' && ['switch', 'router', 'firewall'].includes(dType)) return false;
                          }

                          if (deviceSearchQuery.trim()) {
                            const q = deviceSearchQuery.trim().toLowerCase();
                            const nameMatch = (dev.name || '').toLowerCase().includes(q);
                            const ipMatch = (dev.ip || '').toLowerCase().includes(q);
                            const modelMatch = (dev.model || '').toLowerCase().includes(q);
                            const roleMatch = (dev.role || '').toLowerCase().includes(q);
                            if (!nameMatch && !ipMatch && !modelMatch && !roleMatch) return false;
                          }

                          const hasCustom = Boolean(
                            editingPolicy.perDevicePermissions?.[dev.id] &&
                            Object.keys(editingPolicy.perDevicePermissions[dev.id]).length > 0
                          );
                          if (deviceMatrixFilter === 'custom_only' && !hasCustom) return false;
                          if (deviceMatrixFilter === 'default_only' && hasCustom) return false;
                          return true;
                        });

                        if (filteredDevices.length === 0) {
                          return (
                            <div className={`p-6 rounded-xl border border-dashed text-center space-y-1 ${
                              isLight ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/40 border-white/10'
                            }`}>
                              <div className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                                {isEn ? 'No Matching Network Equipment Found' : 'هیچ تجهیزی با این فیلتر یا جستجو یافت نشد'}
                              </div>
                              <p className={`text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                                {isEn
                                  ? 'No network devices in the current scope match your search query or filter selection.'
                                  : 'تجهیزی در محدوده فعلی با عبارت جستجو یا فیلتر انتخابی مطابقت ندارد.'}
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                            {filteredDevices.map((dev) => {
                              const customPerms = editingPolicy.perDevicePermissions?.[dev.id];
                              const hasCustomOverrides = Boolean(
                                customPerms && Object.keys(customPerms).length > 0
                              );
                              const customOverrideCount = customPerms ? Object.keys(customPerms).length : 0;

                              return (
                                <div
                                  key={dev.id}
                                  className={`p-3 rounded-xl border transition ${
                                    hasCustomOverrides
                                      ? isLight
                                        ? 'bg-amber-50/40 border-amber-300 shadow-xs'
                                        : 'bg-slate-950/90 border-indigo-500/40 shadow-sm'
                                      : isLight
                                      ? 'bg-slate-50/70 border-slate-200'
                                      : 'bg-slate-950/50 border-white/5 hover:border-white/10'
                                  }`}
                                >
                                  {/* Device Item Header */}
                                  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5 mb-2.5 ${
                                    isLight ? 'border-slate-200' : 'border-white/5'
                                  }`}>
                                    <div className="flex items-center gap-2.5">
                                      <div
                                        className={`p-1.5 rounded-lg shrink-0 ${
                                          dev.type === 'router'
                                            ? isLight ? 'bg-rose-100 text-rose-700' : 'bg-rose-500/20 text-rose-300'
                                            : dev.type === 'firewall'
                                            ? isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-300'
                                            : isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/20 text-indigo-300'
                                        }`}
                                      >
                                        {dev.type === 'router' ? (
                                          <RouterIcon className="w-4 h-4" />
                                        ) : dev.type === 'firewall' ? (
                                          <Shield className="w-4 h-4" />
                                        ) : (
                                          <Network className="w-4 h-4" />
                                        )}
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                            {dev.name}
                                          </span>
                                          <span
                                            className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold border ${
                                              dev.type === 'router'
                                                ? isLight ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                                : dev.type === 'firewall'
                                                ? isLight ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                                : isLight ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                            }`}
                                          >
                                            {dev.type || 'switch'}
                                          </span>
                                          {hasCustomOverrides ? (
                                            <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${
                                              isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                            }`}>
                                              {isEn ? `${customOverrideCount} Custom Overrides` : `${customOverrideCount} تنظیمات اختصاصی`}
                                            </span>
                                          ) : (
                                            <span className={`px-1.5 py-0.2 rounded text-[8px] border ${
                                              isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-800 text-slate-400 border border-white/5'
                                            }`}>
                                              {isEn ? 'Inheriting Baseline' : 'پیروی از پیش‌فرض'}
                                            </span>
                                          )}
                                        </div>
                                        <div className={`flex items-center gap-2 text-[10px] font-mono mt-0.5 ${
                                          isLight ? 'text-slate-600' : 'text-slate-400'
                                        }`}>
                                          <span>IP: {dev.ip}</span>
                                          {dev.model && <span>• {dev.model}</span>}
                                          {dev.role && <span>• {dev.role}</span>}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Row Quick Actions */}
                                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                      {hasCustomOverrides && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = { ...(editingPolicy.perDevicePermissions || {}) };
                                            delete next[dev.id];
                                            setEditingPolicy({
                                              ...editingPolicy,
                                              perDevicePermissions: next,
                                            });
                                          }}
                                          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] border transition cursor-pointer ${
                                            isLight
                                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
                                          }`}
                                        >
                                          <RotateCcw className="w-3 h-3 text-slate-400" />
                                          <span>{isEn ? 'Reset to Default' : 'حذف استثناها'}</span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPolicy({
                                            ...editingPolicy,
                                            perDevicePermissions: {
                                              ...(editingPolicy.perDevicePermissions || {}),
                                              [dev.id]: { ...FULL_DEVICE_PERMISSIONS },
                                            },
                                          });
                                        }}
                                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                          isLight
                                            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-300'
                                            : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                                        }`}
                                      >
                                        {isEn ? 'Grant All' : 'اعطای همه'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPolicy({
                                            ...editingPolicy,
                                            perDevicePermissions: {
                                              ...(editingPolicy.perDevicePermissions || {}),
                                              [dev.id]: { ...EMPTY_DEVICE_PERMISSIONS },
                                            },
                                          });
                                        }}
                                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                          isLight
                                            ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                                            : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                                        }`}
                                      >
                                        {isEn ? 'Deny All' : 'مسدودسازی همه'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Action Matrix Panels for this Device */}
                                  {(() => {
                                    const devVendor = (dev.vendor || dev.type || '').toLowerCase();
                                    const isCisco = devVendor.includes('cisco') || (dev.model || '').toLowerCase().includes('catalyst') || (dev.model || '').toLowerCase().includes('nexus');
                                    const isMikrotik = devVendor.includes('mikrotik') || (dev.model || '').toLowerCase().includes('routerboard') || (dev.model || '').toLowerCase().includes('ccr');

                                    return (
                                      <div className="space-y-3">
                                        {/* BLOCK B.1: Equipment Actions (3-Dots Menu) */}
                                        <div className="space-y-1.5">
                                          <div className={`flex items-center justify-between text-[10px] ${
                                            isLight ? 'text-slate-600' : 'text-slate-400'
                                          }`}>
                                            <div className="flex items-center gap-1.5">
                                              <RouterIcon className="w-3 h-3 text-indigo-400" />
                                              <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                                                {isEn ? 'Equipment Actions (3-Dots Menu)' : 'عملیات کلی تجهیز (منوی ۳ نقطه)'}
                                              </span>
                                            </div>
                                            <span className={`font-mono text-[9px] ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                                              {generalEquipmentActions.length} {isEn ? 'actions' : 'اختیار'}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5">
                                            {generalEquipmentActions.map((action) => {
                                              const hasSpecificOverride =
                                                customPerms && typeof customPerms[action.key] === 'boolean';
                                              const isPermitted = hasSpecificOverride
                                                ? customPerms[action.key]
                                                : Boolean(editingPolicy.defaultDevicePermissions?.[action.key]);

                                              return (
                                                <div
                                                  key={action.key}
                                                  className={`relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition cursor-pointer select-none ${
                                                    isPermitted
                                                      ? hasSpecificOverride
                                                        ? isLight
                                                          ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-xs'
                                                          : 'bg-amber-500/20 border-amber-500/50 text-white shadow-xs'
                                                        : isLight
                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                                                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                                      : hasSpecificOverride
                                                      ? isLight
                                                        ? 'bg-rose-100 border-rose-400 text-rose-950'
                                                        : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                                      : isLight
                                                      ? 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                                                      : 'bg-slate-900/60 border-white/5 text-slate-500 hover:text-slate-300'
                                                  }`}
                                                  onClick={() => {
                                                    const currentCustom = editingPolicy.perDevicePermissions?.[dev.id] || {};
                                                    const nextDevicePerms = {
                                                      ...currentCustom,
                                                      [action.key]: !isPermitted,
                                                    };
                                                    setEditingPolicy({
                                                      ...editingPolicy,
                                                      perDevicePermissions: {
                                                        ...(editingPolicy.perDevicePermissions || {}),
                                                        [dev.id]: nextDevicePerms,
                                                      },
                                                    });
                                                  }}
                                                >
                                                  <div className="flex items-center gap-1 mb-1">
                                                    {isPermitted ? (
                                                      <Check className={`w-3.5 h-3.5 ${hasSpecificOverride ? 'text-amber-500' : 'text-emerald-500'}`} />
                                                    ) : (
                                                      <X className={`w-3.5 h-3.5 ${hasSpecificOverride ? 'text-rose-500' : isLight ? 'text-slate-400' : 'text-slate-600'}`} />
                                                    )}
                                                    <span className={`text-[10px] font-bold truncate max-w-[70px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                                      {isEn ? action.shortLabelEn || action.labelEn : action.shortLabelFa || action.labelFa}
                                                    </span>
                                                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                                      <FieldInfoTooltip
                                                        title={isEn ? action.labelEn : action.labelFa}
                                                        infoWhatEn={action.tooltipWhatEn || action.descriptionEn}
                                                        infoWhatFa={action.tooltipWhatFa || action.descriptionFa}
                                                        infoWhyEn={action.tooltipWhyEn || action.descriptionEn}
                                                        infoWhyFa={action.tooltipWhyFa || action.descriptionFa}
                                                        infoExampleEn={action.tooltipExampleEn || 'Configure override per device.'}
                                                        infoExampleFa={action.tooltipExampleFa || 'تنظیم استثنا به ازای هر تجهیز.'}
                                                        isEn={isEn}
                                                        isLightMode={isLight}
                                                      />
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-1">
                                                    {renderPlatformBadge(action.platform, true)}
                                                    <span className={`text-[7.5px] font-mono px-1 py-0.2 rounded ${
                                                      hasSpecificOverride
                                                        ? isLight
                                                          ? 'bg-amber-200/70 text-amber-900 font-bold'
                                                          : 'bg-amber-500/20 text-amber-300 font-bold'
                                                        : isLight
                                                        ? 'text-slate-600'
                                                        : 'text-slate-500'
                                                    }`}>
                                                      {hasSpecificOverride
                                                        ? (isEn ? 'Custom' : 'اختصاصی')
                                                        : (isEn ? 'Default' : 'پیش‌فرض')}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        {/* BLOCK B.2: Port & Interface Actions (Context Menu & Inspector) */}
                                        <div className={`p-2.5 rounded-xl border space-y-2 ${
                                          isLight
                                            ? 'bg-cyan-50/50 border-cyan-200'
                                            : 'bg-slate-950/70 border-cyan-500/25'
                                        }`}>
                                          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b pb-1.5 ${
                                            isLight ? 'border-cyan-200' : 'border-cyan-500/20'
                                          }`}>
                                            <div className="flex items-center gap-1.5">
                                              <div className={`p-0.5 rounded ${isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20 text-cyan-300'}`}>
                                                <Sliders className="w-3 h-3" />
                                              </div>
                                              <span className={`font-bold text-[10.5px] ${isLight ? 'text-cyan-950' : 'text-cyan-200'}`}>
                                                {isEn ? 'Port & Interface Actions (Context Menu & Inspector)' : 'عملیات پورت‌ها و اینترفیس‌ها (منوی راست‌کلیک و فرم ویرایش)'}
                                              </span>
                                            </div>
                                            <div className={`text-[9px] font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                              {isCisco
                                                ? (isEn ? 'Target: Cisco IOS (Common + Cisco Exclusive)' : 'تجهیز هدف: سیسکو (عملیات مشترک و اختصاصی سیسکو)')
                                                : isMikrotik
                                                ? (isEn ? 'Target: MikroTik (Common + MikroTik Exclusive)' : 'تجهیز هدف: میکروتیک (عملیات مشترک و اختصاصی میکروتیک)')
                                                : (isEn ? 'Target: Network Equipment (Common actions apply)' : 'تجهیز هدف: تجهیز شبکه (عملیات مشترک اعمال می‌شوند)')}
                                            </div>
                                          </div>

                                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
                                            {portInterfaceActions.map((action) => {
                                              const hasSpecificOverride =
                                                customPerms && typeof customPerms[action.key] === 'boolean';
                                              const isPermitted = hasSpecificOverride
                                                ? customPerms[action.key]
                                                : Boolean(editingPolicy.defaultDevicePermissions?.[action.key]);

                                              return (
                                                <div
                                                  key={action.key}
                                                  className={`relative flex flex-col items-center justify-center p-2 rounded-xl border text-center transition cursor-pointer select-none ${
                                                    isPermitted
                                                      ? hasSpecificOverride
                                                        ? isLight
                                                          ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-xs'
                                                          : 'bg-amber-500/20 border-amber-500/50 text-white shadow-xs'
                                                        : isLight
                                                        ? 'bg-cyan-100/70 border-cyan-300 text-cyan-950'
                                                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                                                      : hasSpecificOverride
                                                      ? isLight
                                                        ? 'bg-rose-100 border-rose-400 text-rose-950'
                                                        : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                                      : isLight
                                                      ? 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
                                                      : 'bg-slate-900/60 border-white/5 text-slate-500 hover:text-slate-300'
                                                  }`}
                                                  onClick={() => {
                                                    const currentCustom = editingPolicy.perDevicePermissions?.[dev.id] || {};
                                                    const nextDevicePerms = {
                                                      ...currentCustom,
                                                      [action.key]: !isPermitted,
                                                    };
                                                    setEditingPolicy({
                                                      ...editingPolicy,
                                                      perDevicePermissions: {
                                                        ...(editingPolicy.perDevicePermissions || {}),
                                                        [dev.id]: nextDevicePerms,
                                                      },
                                                    });
                                                  }}
                                                >
                                                  <div className="flex items-center gap-1 mb-1">
                                                    {isPermitted ? (
                                                      <Check className={`w-3.5 h-3.5 ${hasSpecificOverride ? 'text-amber-500' : 'text-cyan-500'}`} />
                                                    ) : (
                                                      <X className={`w-3.5 h-3.5 ${hasSpecificOverride ? 'text-rose-500' : isLight ? 'text-slate-400' : 'text-slate-600'}`} />
                                                    )}
                                                    <span className={`text-[10px] font-bold truncate max-w-[75px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                                      {isEn ? action.shortLabelEn || action.labelEn : action.shortLabelFa || action.labelFa}
                                                    </span>
                                                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                                                      <FieldInfoTooltip
                                                        title={isEn ? action.labelEn : action.labelFa}
                                                        infoWhatEn={action.tooltipWhatEn || action.descriptionEn}
                                                        infoWhatFa={action.tooltipWhatFa || action.descriptionFa}
                                                        infoWhyEn={action.tooltipWhyEn || action.descriptionEn}
                                                        infoWhyFa={action.tooltipWhyFa || action.descriptionFa}
                                                        infoExampleEn={action.tooltipExampleEn || 'Configure port override per device.'}
                                                        infoExampleFa={action.tooltipExampleFa || 'تنظیم استثنای پورت به ازای هر تجهیز.'}
                                                        isEn={isEn}
                                                        isLightMode={isLight}
                                                      />
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center gap-1">
                                                    {renderPlatformBadge(action.platform, true)}
                                                    <span className={`text-[7.5px] font-mono px-1 py-0.2 rounded ${
                                                      hasSpecificOverride
                                                        ? isLight
                                                          ? 'bg-amber-200/70 text-amber-900 font-bold'
                                                          : 'bg-amber-500/20 text-amber-300 font-bold'
                                                        : isLight
                                                        ? 'text-slate-600'
                                                        : 'text-slate-500'
                                                    }`}>
                                                      {hasSpecificOverride
                                                        ? (isEn ? 'Custom' : 'اختصاصی')
                                                        : (isEn ? 'Default' : 'پیش‌فرض')}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}
          </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingPolicy(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isEn ? 'Save Access Policy' : 'ذخیره پالیسی سطح دسترسی'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
