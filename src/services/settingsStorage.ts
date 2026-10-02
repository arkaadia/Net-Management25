import {
  DeviceGroup,
  ActiveDirectoryConfig,
  AccessPolicy,
  ADTestResult,
  LocalUser,
  LocalGroup,
  ADSecurityGroup,
  ADUser,
  CustomTopologyStickyNote
} from '../types';

export const STORAGE_KEYS = {
  DEVICE_GROUPS: 'nettopology_device_groups_v1',
  AD_CONFIG: 'nettopology_ad_config_v1',
  ACCESS_POLICIES: 'nettopology_access_policies_v1',
  ACTIVE_SIMULATED_ROLE: 'nettopology_simulated_role_v1',
  LOCAL_USERS: 'nettopology_local_users_v1',
  LOCAL_GROUPS: 'nettopology_local_groups_v1',
  DEVICE_STICKY_NOTES: 'nettopology_device_sticky_notes_v1',
};

// Initial Seed: Local Groups
export const DEFAULT_LOCAL_GROUPS: LocalGroup[] = [
  {
    id: 'group-admin',
    name: 'مدیران ارشد سیستم (Administrators)',
    description: 'دسترسی کامل و تام به تمام تجهیزات، رایت مموری و تنظیمات امنیتی',
    color: 'indigo',
    memberUserIds: ['admin'],
    createdAt: '2026-03-01 08:00:00',
    updatedAt: '2026-03-09 12:00:00',
    isBuiltin: true,
  },
  {
    id: 'group-helpdesk-ops',
    name: 'تیم هلپ‌دسک و پشتیبانی کاربر (Helpdesk Operators)',
    description: 'مدیریت پورت‌های کلاینت، تغییر ویلن‌ها، نام‌گذاری پورت و پورت‌سکیوریتی',
    color: 'amber',
    memberUserIds: ['helpdesk_local'],
    createdAt: '2026-03-01 08:30:00',
    updatedAt: '2026-03-09 14:00:00',
    isBuiltin: false,
  },
  {
    id: 'group-noc',
    name: 'مرکز عملیات شبکه (NOC Monitoring)',
    description: 'پایش مستمر وضعیت ترافیک، هشدارها، تلمتری و اسکنر همسایگی (Read-Only)',
    color: 'cyan',
    memberUserIds: ['noc_local'],
    createdAt: '2026-03-02 09:15:00',
    updatedAt: '2026-03-09 14:30:00',
    isBuiltin: false,
  },
  {
    id: 'group-field',
    name: 'تکنسین‌های میدانی (Field Technicians)',
    description: 'کارشناسان اعزام در محل جهت کابل‌کشی، بررسی پورت‌های فیزیکی و ریست سوئیچ',
    color: 'emerald',
    memberUserIds: ['field_tech'],
    createdAt: '2026-03-03 10:00:00',
    updatedAt: '2026-03-09 15:00:00',
    isBuiltin: false,
  },
];

// Initial Seed: Local Users
export const DEFAULT_LOCAL_USERS: LocalUser[] = [
  {
    id: 'admin',
    username: 'admin',
    fullName: 'مدیر ارشد شبکه (Network Administrator)',
    email: 'admin@nettopology.internal',
    status: 'active',
    role: 'Super Administrator',
    groupIds: ['group-admin'],
    createdAt: '2026-01-01 00:00:00',
    lastLogin: '2026-09-09 17:15:00',
    isBuiltin: true,
  },
  {
    id: 'helpdesk_local',
    username: 'helpdesk_user',
    fullName: 'کاربر هلپ‌دسک محلی (Helpdesk Local)',
    email: 'helpdesk@nettopology.internal',
    status: 'active',
    role: 'Helpdesk Specialist',
    groupIds: ['group-helpdesk-ops'],
    createdAt: '2026-02-10 11:20:00',
    lastLogin: '2026-09-09 15:45:00',
    isBuiltin: false,
  },
  {
    id: 'noc_local',
    username: 'noc_operator',
    fullName: 'اپراتور محلی NOC (Local NOC)',
    email: 'noc@nettopology.internal',
    status: 'active',
    role: 'NOC Analyst',
    groupIds: ['group-noc'],
    createdAt: '2026-02-15 14:00:00',
    lastLogin: '2026-09-09 16:30:00',
    isBuiltin: false,
  },
  {
    id: 'field_tech',
    username: 'field_tech',
    fullName: 'تکنسین پشتیبانی سخت‌افزار (Field Tech)',
    email: 'tech@nettopology.internal',
    status: 'active',
    role: 'Hardware Technician',
    groupIds: ['group-field'],
    createdAt: '2026-03-01 09:00:00',
    lastLogin: '2026-09-08 10:10:00',
    isBuiltin: false,
  },
];

// Backward-compatibility export
export const LOCAL_USERS: LocalUser[] = DEFAULT_LOCAL_USERS;


// Initial Seed: Device Groups (Including Helpdesk as explicitly requested)
export const DEFAULT_DEVICE_GROUPS: DeviceGroup[] = [
  {
    id: 'group-helpdesk',
    name: 'هلپ دسک (Helpdesk Support)',
    description: 'تجهیزات و سوئیچ‌های دسترسی کلاینت‌ها، تلفن‌های VoIP و استقرار روزانه تیم پشتیبانی',
    color: 'amber',
    icon: 'Headphones',
    deviceIds: ['dev-dist-bldg-a', 'dev-access-bldg-b'],
    createdAt: '2026-03-01 08:30:00',
    updatedAt: '2026-03-09 14:20:00',
  },
  {
    id: 'group-core',
    name: 'زیرساخت هسته و دیتا سنتر (Core & DC)',
    description: 'سوئیچ‌های لایه هسته و روتر گیت‌وی اصلی دیتاسنتر و پیوندهای ۱۰ گیگابیت فیبر',
    color: 'indigo',
    icon: 'Server',
    deviceIds: ['dev-core-01', 'dev-router-gw'],
    createdAt: '2026-03-01 08:30:00',
    updatedAt: '2026-03-09 14:20:00',
  },
  {
    id: 'group-branch',
    name: 'شعب و لایه دسترسی بی‌سیم (Branch & Wireless)',
    description: 'اکسس‌پوینت‌های اداری، تجهیزات وای‌فای و سوئیچ‌های ساختمانی بلوک B',
    color: 'cyan',
    icon: 'Wifi',
    deviceIds: ['dev-dist-bldg-b', 'dev-ap-bldg-a'],
    createdAt: '2026-03-02 11:00:00',
    updatedAt: '2026-03-09 15:00:00',
  },
];

// Initial Seed: Active Directory Config & Synced Objects
export const DEFAULT_AD_CONFIG: ActiveDirectoryConfig = {
  enabled: true,
  server: '192.168.1.10',
  port: 389,
  useSsl: false,
  domain: 'corp.internal',
  baseDn: 'DC=corp,DC=internal',
  bindUser: 'svc-netops@corp.internal',
  bindPassword: '••••••••••••',
  userSearchBase: 'OU=Staff,DC=corp,DC=internal',
  groupSearchBase: 'OU=SecurityGroups,DC=corp,DC=internal',
  lastSyncStatus: 'success',
  lastSyncMessage: 'همگام‌سازی با موفقیت انجام شد (4 گروه امنیتی و 6 کاربر دامین دریافت گردید)',
  lastSyncTime: '2026-09-09 16:30:00',
  syncedGroups: [
    {
      dn: 'CN=Helpdesk-Admins,OU=SecurityGroups,DC=corp,DC=internal',
      cn: 'Helpdesk-Admins',
      description: 'کارشناسان پشتیبانی و تیم هلپ‌دسک سازمان',
      memberCount: 8,
    },
    {
      dn: 'CN=NetOps-Engineers,OU=SecurityGroups,DC=corp,DC=internal',
      cn: 'NetOps-Engineers',
      description: 'مهندسان ارشد شبکه و زیرساخت ارتباطی',
      memberCount: 4,
    },
    {
      dn: 'CN=NOC-Monitoring,OU=SecurityGroups,DC=corp,DC=internal',
      cn: 'NOC-Monitoring',
      description: 'تیم پایش و مانیتورینگ مرکز عملیات شبکه (فقط مشاهده)',
      memberCount: 6,
    },
    {
      dn: 'CN=Security-Auditors,OU=SecurityGroups,DC=corp,DC=internal',
      cn: 'Security-Auditors',
      description: 'حسابرسان امنیتی و ممیزی پورت سکیوریتی و مک آدرس‌ها',
      memberCount: 3,
    },
  ],
  syncedUsers: [
    {
      dn: 'CN=Masoud Shahbazi,OU=Staff,DC=corp,DC=internal',
      samAccountName: 'm.shahbazi',
      displayName: 'مسعود شهبازی (Network Lead)',
      email: 'm.shahbazi@corp.internal',
      department: 'زیرساخت و شبکه',
      title: 'Senior Network Architect',
      groups: ['NetOps-Engineers'],
      enabled: true,
    },
    {
      dn: 'CN=Ali Rezaei,OU=Staff,DC=corp,DC=internal',
      samAccountName: 'a.rezaei',
      displayName: 'علی رضایی (Helpdesk L1)',
      email: 'a.rezaei@corp.internal',
      department: 'پشتیبانی فنی (Helpdesk)',
      title: 'Helpdesk Specialist',
      groups: ['Helpdesk-Admins'],
      enabled: true,
    },
    {
      dn: 'CN=Sara Karimi,OU=Staff,DC=corp,DC=internal',
      samAccountName: 's.karimi',
      displayName: 'سارا کریمی (NOC Operator)',
      email: 's.karimi@corp.internal',
      department: 'مرکز عملیات شبکه',
      title: 'NOC Tier-1 Analyst',
      groups: ['NOC-Monitoring'],
      enabled: true,
    },
    {
      dn: 'CN=Reza Mohammadi,OU=Staff,DC=corp,DC=internal',
      samAccountName: 'r.mohammadi',
      displayName: 'رضا محمدی (Security Auditor)',
      email: 'r.mohammadi@corp.internal',
      department: 'امنیت اطلاعات',
      title: 'Infosec Compliance Officer',
      groups: ['Security-Auditors'],
      enabled: true,
    },
  ],
};

// Initial Seed: Granular Access Policies (RBAC)
export const DEFAULT_ACCESS_POLICIES: AccessPolicy[] = [
  {
    id: 'policy-helpdesk',
    name: 'سطح دسترسی تیم هلپ‌دسک (Helpdesk Operator Policy)',
    description: 'دسترسی محدود به سوئیچ‌های گروه هلپ‌دسک جهت تغییر ویلن، دیسکریپشن و بازنشانی پورت‌ها بدون دسترسی به کنسول CLI یا خاموش کردن پورت‌های حساس',
    isBuiltin: true,
    priority: 10,
    subjectType: 'ad_group',
    subjectId: 'CN=Helpdesk-Admins,OU=SecurityGroups,DC=corp,DC=internal',
    subjectName: 'Helpdesk-Admins (اکتیو دایرکتوری)',
    targetScope: 'groups',
    targetGroupIds: ['group-helpdesk'],
    targetDeviceIds: [],
    // Page Access
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: true,
    canViewScanner: false,
    canViewTemplates: false,
    canViewSettings: false,
    canViewServers: false,
    canViewLogs: false,
    canCheckUpdate: false,
    canPerformUpdate: false,
    // Device & Port Actions (Cisco)
    terminalAccess: 'none',            // No CLI access
    canToggleAdminStatus: false,        // Cannot shutdown core ports
    canChangeVlan: true,                // CAN assign VLAN
    canEditDescription: true,           // CAN edit port description
    canTogglePortSecurity: true,        // CAN inspect/enable port security
    canWriteMemory: false,              // Cannot write NVRAM
    // MikroTik RouterOS
    mikrotikTerminalAccess: 'none',
    canMikrotikToggleInterface: false,
    canMikrotikBridgeVlan: true,
    canMikrotikComment: true,
    canMikrotikIpPool: false,
    canMikrotikFirewall: false,
    canMikrotikBackup: false,
    canMikrotikSafeMode: true,
    // Generic & Linux
    genericTerminalAccess: 'none',
    canGenericToggleLink: false,
    canGenericDiagnostics: true,
    canGenericConfigBackup: false,
    // Global
    canManageDevices: false,            // Cannot add/delete switch
    canApplyTemplates: false,           // Cannot push CLI templates
    canBatchOperate: false,             // Cannot execute mass bulk edits
    canExportBackup: false,             // Cannot export backup
    canImportBackup: false,             // Cannot import backup
  },
  {
    id: 'policy-noc-observer',
    name: 'تیم پایش و مانیتورینگ NOC (Read-Only Observer)',
    description: 'دسترسی فقط خواندنی به تمام تجهیزات، توپولوژی، تلمتری پورت‌ها و اسکنر همسایگی همراه با دسترسی کنسول فقط خواندنی',
    isBuiltin: true,
    priority: 20,
    subjectType: 'ad_group',
    subjectId: 'CN=NOC-Monitoring,OU=SecurityGroups,DC=corp,DC=internal',
    subjectName: 'NOC-Monitoring (اکتیو دایرکتوری)',
    targetScope: 'all',
    targetGroupIds: [],
    targetDeviceIds: [],
    // Page Access
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: true,
    canViewScanner: true,
    canViewTemplates: true,
    canViewSettings: false,
    canViewServers: true,
    canViewLogs: true,
    canCheckUpdate: false,
    canPerformUpdate: false,
    // Device & Port Actions (Cisco)
    terminalAccess: 'view_only',        // View logs only
    canToggleAdminStatus: false,
    canChangeVlan: false,
    canEditDescription: false,
    canTogglePortSecurity: false,
    canWriteMemory: false,
    // MikroTik RouterOS
    mikrotikTerminalAccess: 'view_only',
    canMikrotikToggleInterface: false,
    canMikrotikBridgeVlan: false,
    canMikrotikComment: false,
    canMikrotikIpPool: false,
    canMikrotikFirewall: false,
    canMikrotikBackup: false,
    canMikrotikSafeMode: false,
    // Generic & Linux
    genericTerminalAccess: 'view_only',
    canGenericToggleLink: false,
    canGenericDiagnostics: true,
    canGenericConfigBackup: false,
    // Global
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
    canExportBackup: false,
    canImportBackup: false,
  },
  {
    id: 'policy-super-admin',
    name: 'مدیر ارشد زیرساخت شبکه (Super Administrator)',
    description: 'دسترسی نامحدود به تمامی تجهیزات، کنسول‌های تعاملی SSH، رایت مموری، اعمال تمپلیت و تنظیمات امنیتی',
    isBuiltin: true,
    priority: 100,
    subjectType: 'local_user',
    subjectId: 'admin',
    subjectName: 'مدیر اصلی سیستم (Local Admin / NetOps)',
    targetScope: 'all',
    targetGroupIds: [],
    targetDeviceIds: [],
    // Page Access
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: true,
    canViewScanner: true,
    canViewTemplates: true,
    canViewSettings: true,
    canViewServers: true,
    canViewLogs: true,
    canCheckUpdate: true,
    canPerformUpdate: true,
    // Device & Port Actions (Cisco)
    terminalAccess: 'full',
    canToggleAdminStatus: true,
    canChangeVlan: true,
    canEditDescription: true,
    canTogglePortSecurity: true,
    canWriteMemory: true,
    // MikroTik RouterOS
    mikrotikTerminalAccess: 'full',
    canMikrotikToggleInterface: true,
    canMikrotikBridgeVlan: true,
    canMikrotikComment: true,
    canMikrotikIpPool: true,
    canMikrotikFirewall: true,
    canMikrotikBackup: true,
    canMikrotikSafeMode: true,
    // Generic & Linux
    genericTerminalAccess: 'full',
    canGenericToggleLink: true,
    canGenericDiagnostics: true,
    canGenericConfigBackup: true,
    // Global
    canManageDevices: true,
    canApplyTemplates: true,
    canBatchOperate: true,
    canExportBackup: true,
    canImportBackup: true,
  },
];

// ==========================================
// Persistence & Data Access Functions
// ==========================================

export function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (sessionStorage.getItem('nettopology_auth_token_v1') || localStorage.getItem('nettopology_auth_token_v1'))
      : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

let inMemoryUsers: LocalUser[] = [];

export function loadLocalUsers(): LocalUser[] {
  if (inMemoryUsers.length > 0) return inMemoryUsers;
  return DEFAULT_LOCAL_USERS;
}

export function saveLocalUsers(users: LocalUser[]): void {
  inMemoryUsers = users;
  fetch('/api/settings/users', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(users),
  }).catch(() => {});
}

export async function saveUserToDatabase(
  userPayload: Partial<LocalUser> & { password?: string }
): Promise<{ success: boolean; user?: LocalUser; error?: string }> {
  try {
    const res = await fetch('/api/settings/users', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(userPayload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.user) {
      const current = loadLocalUsers().slice();
      const idx = current.findIndex(
        (u) =>
          (data.user.id && u.id === data.user.id) ||
          u.username.toLowerCase() === data.user.username.toLowerCase()
      );
      if (idx >= 0) {
        current[idx] = { ...current[idx], ...data.user };
      } else {
        current.push(data.user);
      }
      inMemoryUsers = current;
      return { success: true, user: data.user };
    }
    return {
      success: false,
      error: data.message || data.error || 'Failed to save user in database',
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Connection error to backend database' };
  }
}

export async function deleteUserFromDatabase(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/settings/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      inMemoryUsers = loadLocalUsers().filter(
        (u) => u.id !== userId && u.username.toLowerCase() !== userId.toLowerCase()
      );
      return { success: true };
    }
    return {
      success: false,
      error: data.message || data.error || 'Failed to delete user',
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Connection error' };
  }
}

export async function syncLocalUsersFromDatabase(): Promise<LocalUser[]> {
  try {
    const res = await fetch('/api/settings/users', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.users)
        ? data.users
        : [];
      if (list.length > 0) {
        inMemoryUsers = list;
        return list;
      }
    }
  } catch (e) {
    // Offline or fallback
  }
  return loadLocalUsers();
}

export async function syncCustomMapsFromDatabase(): Promise<any[]> {
  try {
    const res = await fetch('/api/settings/maps');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        localStorage.setItem('nettopology_custom_maps_v2', JSON.stringify(data));
        return data;
      }
    }
  } catch (e) {}
  try {
    const raw = localStorage.getItem('nettopology_custom_maps_v2');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function persistCustomMapsToDatabase(maps: any[]): Promise<void> {
  try {
    localStorage.setItem('nettopology_custom_maps_v2', JSON.stringify(maps));
    await fetch('/api/settings/maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(maps),
    });
  } catch (e) {}
}

export async function syncHierarchyFromDatabase(): Promise<any | null> {
  try {
    const res = await fetch('/api/settings/hierarchy');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        localStorage.setItem('nettopology_physical_hierarchy_v2', JSON.stringify(data));
        return data;
      }
    }
  } catch (e) {}
  try {
    const raw = localStorage.getItem('nettopology_physical_hierarchy_v2');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function persistHierarchyToDatabase(hierarchy: any): Promise<void> {
  try {
    localStorage.setItem('nettopology_physical_hierarchy_v2', JSON.stringify(hierarchy));
    await fetch('/api/settings/hierarchy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hierarchy),
    });
  } catch (e) {}
}

let inMemoryGroups: LocalGroup[] = [];

export function loadLocalGroups(): LocalGroup[] {
  if (inMemoryGroups.length > 0) return inMemoryGroups;
  return DEFAULT_LOCAL_GROUPS;
}

export function saveLocalGroups(groups: LocalGroup[]): void {
  inMemoryGroups = groups;
  fetch('/api/settings/user-groups', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ groups }),
  }).catch(() => {});
}

export async function saveLocalGroupsToDatabase(
  groups: LocalGroup[]
): Promise<{ success: boolean; error?: string }> {
  try {
    inMemoryGroups = groups;
    const res = await fetch('/api/settings/user-groups', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ groups }),
    });
    if (res.ok) {
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Failed to persist groups in database' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Connection error to backend database' };
  }
}

export async function syncLocalGroupsFromDatabase(): Promise<LocalGroup[]> {
  try {
    const res = await fetch('/api/settings/user-groups', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.groups)
        ? data.groups
        : [];
      if (list.length > 0) {
        const normalized = list.map((g: any) => ({
          ...g,
          memberUserIds: Array.isArray(g.memberUserIds)
            ? g.memberUserIds
            : Array.isArray(g.member_user_ids)
            ? g.member_user_ids
            : [],
        }));
        inMemoryGroups = normalized;
        return normalized;
      }
    }
  } catch (e) {
    // Offline or fallback
  }
  return loadLocalGroups();
}

let inMemoryDeviceGroups: DeviceGroup[] = [];

export function loadDeviceGroups(): DeviceGroup[] {
  if (inMemoryDeviceGroups.length > 0) return inMemoryDeviceGroups;
  return DEFAULT_DEVICE_GROUPS;
}

export function saveDeviceGroups(groups: DeviceGroup[]): void {
  inMemoryDeviceGroups = groups;
  localStorage.removeItem(STORAGE_KEYS.DEVICE_GROUPS);
  fetch('/api/settings/device-groups', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ groups }),
  }).catch(() => {});

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nettopology_device_groups_changed', { detail: { groups } }));
  }
}

export function loadActiveDirectoryConfig(): ActiveDirectoryConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AD_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.error('Failed to parse AD config from localStorage', e);
  }
  saveActiveDirectoryConfig(DEFAULT_AD_CONFIG);
  return DEFAULT_AD_CONFIG;
}

export function saveActiveDirectoryConfig(config: ActiveDirectoryConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.AD_CONFIG, JSON.stringify(config));
    fetch('/api/settings/active-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    }).catch(() => {});
  } catch (e) {
    console.error('Failed to save AD config to localStorage', e);
  }
}

export async function syncActiveDirectoryConfigFromDatabase(): Promise<ActiveDirectoryConfig> {
  try {
    const res = await fetch('/api/settings/active-directory');
    if (res.ok) {
      const data = await res.json();
      const cfg = data?.config;
      if (cfg && typeof cfg === 'object') {
        localStorage.setItem(STORAGE_KEYS.AD_CONFIG, JSON.stringify(cfg));
        return cfg;
      }
    }
  } catch (e) {
    // Offline or fallback
  }
  return loadActiveDirectoryConfig();
}

let inMemoryPolicies: AccessPolicy[] = [];

export function loadAccessPolicies(): AccessPolicy[] {
  if (inMemoryPolicies.length > 0) return inMemoryPolicies;
  return DEFAULT_ACCESS_POLICIES;
}

export function saveAccessPolicies(policies: AccessPolicy[]): void {
  inMemoryPolicies = policies;
  fetch('/api/access-policies', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ policies }),
  }).catch(() => {});

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nettopology_access_policies_changed', { detail: { policies } }));
  }
}

export async function saveAccessPoliciesToDatabase(
  policies: AccessPolicy[]
): Promise<{ success: boolean; error?: string }> {
  try {
    inMemoryPolicies = policies;
    const res = await fetch('/api/access-policies', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ policies }),
    });
    if (res.ok) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nettopology_access_policies_changed', { detail: { policies } }));
      }
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || 'Failed to save access policies in database' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Connection error to backend database' };
  }
}

export async function syncAccessPoliciesFromDatabase(): Promise<AccessPolicy[]> {
  try {
    const res = await fetch('/api/access-policies', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.policies)
        ? data.policies
        : Array.isArray(data)
        ? data
        : [];
      if (list.length > 0) {
        inMemoryPolicies = list;
        return list;
      }
    }
  } catch (e) {
    // Offline or fallback
  }
  return loadAccessPolicies();
}

export async function syncDeviceGroupsFromDatabase(): Promise<DeviceGroup[]> {
  try {
    const res = await fetch('/api/device-groups', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data?.groups)
        ? data.groups
        : Array.isArray(data)
        ? data
        : [];
      if (list.length > 0) {
        const normalized = list.map((g: any) => ({
          ...g,
          deviceIds: Array.isArray(g.deviceIds) ? g.deviceIds : (Array.isArray(g.device_ids) ? g.device_ids : []),
          serverIds: Array.isArray(g.serverIds) ? g.serverIds : (Array.isArray(g.server_ids) ? g.server_ids : []),
        }));
        inMemoryDeviceGroups = normalized;
        localStorage.removeItem(STORAGE_KEYS.DEVICE_GROUPS);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nettopology_device_groups_changed', { detail: { groups: normalized } }));
        }
        return normalized;
      }
    }
  } catch (e) {
    // Offline or fallback
  }
  return loadDeviceGroups();
}

function enrichClientPolicyScope(pol: AccessPolicy): AccessPolicy {
  if (!pol) return pol;
  if (pol.allowedDeviceIds !== undefined && pol.allowedServerIds !== undefined) return pol;

  if (pol.id === 'policy-super-admin' || pol.targetScope === 'all') {
    return { ...pol, allowedDeviceIds: null, allowedServerIds: null };
  }
  if (pol.targetScope === 'groups') {
    const grps = loadDeviceGroups();
    const targetGroupSet = new Set((pol.targetGroupIds || []).map((id) => (id || '').trim().toLowerCase()));
    const devSet = new Set<string>();
    const srvSet = new Set<string>();
    for (const g of grps) {
      const gid = (g.id || '').trim().toLowerCase();
      const gname = (g.name || '').trim().toLowerCase();
      if (targetGroupSet.has(gid) || targetGroupSet.has(gname)) {
        const dIds: string[] = Array.isArray(g.deviceIds) ? g.deviceIds : (Array.isArray((g as any).device_ids) ? (g as any).device_ids : []);
        const sIds: string[] = Array.isArray(g.serverIds) ? g.serverIds : (Array.isArray((g as any).server_ids) ? (g as any).server_ids : []);
        dIds.forEach((d) => devSet.add(d));
        sIds.forEach((s) => srvSet.add(s));
      }
    }
    return { ...pol, allowedDeviceIds: Array.from(devSet), allowedServerIds: Array.from(srvSet) };
  }
  if (pol.targetScope === 'specific') {
    return {
      ...pol,
      allowedDeviceIds: Array.isArray(pol.targetDeviceIds) ? pol.targetDeviceIds : [],
      allowedServerIds: Array.isArray(pol.targetServerIds) ? pol.targetServerIds : [],
    };
  }
  return { ...pol, allowedDeviceIds: [], allowedServerIds: [] };
}

export function getEffectiveUserPolicy(
  user: { id?: string; username?: string; role?: string; userType?: string; groupIds?: string[] } | null,
  policies: AccessPolicy[] = loadAccessPolicies(),
  localGroups: LocalGroup[] = loadLocalGroups(),
  simulatedRoleId?: string
): AccessPolicy {
  // If simulated role is explicitly set and not 'none', use it for preview
  if (simulatedRoleId && simulatedRoleId !== 'none' && simulatedRoleId !== 'actual-user') {
    const simPolicy = policies.find((p) => p.id === simulatedRoleId);
    if (simPolicy) return enrichClientPolicyScope(simPolicy);
  }

  // If no user is logged in
  if (!user) {
    return enrichClientPolicyScope({
      id: 'policy-guest',
      name: 'Guest / Unauthenticated',
      description: 'Default guest permissions',
      priority: 0,
      subjectType: 'local_user',
      subjectId: 'guest',
      subjectName: 'Guest',
      targetScope: 'all',
      targetGroupIds: [],
      targetDeviceIds: [],
      canViewDashboard: false,
      canViewTopology: false,
      canViewDevices: false,
      canViewPorts: false,
      canViewScanner: false,
      canViewTemplates: false,
      canViewSettings: false,
      canViewServers: false,
      canViewLogs: false,
      canCheckUpdate: false,
      canPerformUpdate: false,
      terminalAccess: 'none',
      canToggleAdminStatus: false,
      canChangeVlan: false,
      canEditDescription: false,
      canTogglePortSecurity: false,
      canWriteMemory: false,
      canManageDevices: false,
      canApplyTemplates: false,
      canBatchOperate: false,
    });
  }

  const cleanUsername = (user.username || '').trim().toLowerCase();
  const userId = (user.id || '').trim();
  const isSuperAdmin = cleanUsername === 'admin' || (user.role || '').toLowerCase().includes('super admin');

  // Find candidate policies that match this user
  const matchingPolicies: AccessPolicy[] = [];

  for (const p of policies) {
    // 1. Direct user match
    if (
      (p.subjectType === 'local_user' || p.subjectType === 'ad_user') &&
      (
        p.subjectId === userId ||
        p.subjectId.toLowerCase() === cleanUsername ||
        cleanUsername.startsWith(p.subjectId.toLowerCase())
      )
    ) {
      matchingPolicies.push(p);
      continue;
    }

    // 2. Group match
    if (p.subjectType === 'local_group' || p.subjectType === 'ad_group') {
      const userGroupIds = new Set(user.groupIds || []);

      // Check if user object has this group ID
      if (userGroupIds.has(p.subjectId)) {
        matchingPolicies.push(p);
        continue;
      }

      // Check if localGroup members include this user
      const matchingGroup = localGroups.find((g) => g.id === p.subjectId);
      if (matchingGroup) {
        const members = (matchingGroup.memberUserIds || []).map((m) => m.toLowerCase());
        if (members.includes(userId.toLowerCase()) || members.includes(cleanUsername)) {
          matchingPolicies.push(p);
          continue;
        }
      }
    }
  }

  // Sort by priority descending (highest priority wins)
  if (matchingPolicies.length > 0) {
    matchingPolicies.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return enrichClientPolicyScope(matchingPolicies[0]);
  }

  // Fallback: If superadmin/admin and no explicit restrictive policy found, give full access
  if (isSuperAdmin) {
    return enrichClientPolicyScope(
      policies.find((p) => p.id === 'policy-super-admin') || {
        id: 'policy-super-admin',
        name: 'Super Administrator',
        description: 'Full unconstrained access',
        priority: 100,
        subjectType: 'local_user',
        subjectId: 'admin',
        subjectName: 'Super Admin',
        targetScope: 'all',
        targetGroupIds: [],
        targetDeviceIds: [],
        canViewDashboard: true,
        canViewTopology: true,
        canViewDevices: true,
        canViewPorts: true,
        canViewScanner: true,
        canViewTemplates: true,
        canViewSettings: true,
        canViewServers: true,
        canViewLogs: true,
        canCheckUpdate: true,
        canPerformUpdate: true,
        terminalAccess: 'full',
        canToggleAdminStatus: true,
        canChangeVlan: true,
        canEditDescription: true,
        canTogglePortSecurity: true,
        canWriteMemory: true,
        canManageDevices: true,
        canApplyTemplates: true,
        canBatchOperate: true,
      }
    );
  }

  // Default non-admin fallback
  return enrichClientPolicyScope({
    id: 'policy-default-restricted',
    name: 'Restricted User',
    description: 'Default safe view access',
    priority: 1,
    subjectType: 'local_user',
    subjectId: userId,
    subjectName: user.username || 'User',
    targetScope: 'all',
    targetGroupIds: [],
    targetDeviceIds: [],
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: false,
    canViewScanner: false,
    canViewTemplates: false,
    canViewSettings: false,
    canViewServers: false,
    canViewLogs: false,
    canCheckUpdate: false,
    canPerformUpdate: false,
    terminalAccess: 'none',
    canToggleAdminStatus: false,
    canChangeVlan: false,
    canEditDescription: false,
    canTogglePortSecurity: false,
    canWriteMemory: false,
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
  });
}

export function isTabAllowed(tabId: string, policy?: AccessPolicy): boolean {
  if (!policy) return true;
  if (policy.id === 'policy-super-admin') return true;

  switch (tabId) {
    case 'dashboard':
      return Boolean(policy.canViewDashboard);
    case 'schematic':
      return Boolean(policy.canViewTopology);
    case 'devices':
      return Boolean(policy.canViewDevices);
    case 'templates':
      return Boolean(policy.canViewTemplates);
    case 'remote-servers':
    case 'remote-linux':
    case 'remote-windows':
    case 'remote-tags':
      return policy.canViewServers !== undefined ? Boolean(policy.canViewServers) : Boolean(policy.canViewDevices);
    case 'ports':
      return Boolean(policy.canViewPorts);
    case 'scanner':
      return Boolean(policy.canViewScanner);
    case 'logs':
      return policy.canViewLogs !== undefined ? Boolean(policy.canViewLogs) : Boolean(policy.canViewSettings);
    case 'settings':
    case 'settings-groups':
    case 'settings-users':
    case 'settings-ad':
    case 'settings-rbac':
    case 'settings-backup':
      return Boolean(policy.canViewSettings);
    default:
      return true;
  }
}

let inMemorySimulatedRoleId: string = 'actual-user';

export function loadSimulatedRoleId(): string {
  return inMemorySimulatedRoleId;
}

export function saveSimulatedRoleId(policyId: string): void {
  inMemorySimulatedRoleId = policyId;
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_SIMULATED_ROLE);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nettopology_simulated_role_changed', { detail: { policyId } }));
  }
}

// ==========================================
// Simulation & Diagnostic Helpers
// ==========================================

export async function simulateTestADConnection(cfg: ActiveDirectoryConfig): Promise<ADTestResult> {
  const startTime = Date.now();
  // Simulate network probe
  await new Promise((res) => setTimeout(res, 900));
  const latency = Math.floor(Math.random() * 4) + 1.2;

  const logs = [
    `[LDAP Probe] Initiating TCP handshake to ${cfg.server}:${cfg.port}...`,
    `[LDAP Probe] Socket connection established in ${latency}ms.`,
    cfg.useSsl
      ? `[TLS/SSL] Handshake validated with Certificate Authority (Subject: CN=${cfg.server}).`
      : `[LDAP] Cleartext LDAP connection active (Port ${cfg.port}).`,
    `[Kerberos/Bind] Attempting simple bind for account "${cfg.bindUser}"...`,
    `[Kerberos/Bind] Credentials accepted. Bind status: SUCCESS (0x0).`,
    `[RootDSE] Querying Directory BaseDN "${cfg.baseDn}"...`,
    `[Search] Root container accessible: ${cfg.groupSearchBase}`,
    `[Search] User container accessible: ${cfg.userSearchBase}`,
    `[Summary] Domain Controller "${cfg.domain}" is HEALTHY & SYNCHRONIZED.`,
  ];

  return {
    success: true,
    latency_ms: latency,
    message: `ارتباط با اکتیو دایرکتوری ${cfg.domain} روی سرور ${cfg.server} با موفقیت برقرار شد.`,
    serverBanner: `Microsoft Windows Server 2022 Active Directory Domain Controller (Domain: ${cfg.domain})`,
    sslValid: cfg.useSsl,
    bindSuccess: true,
    logs,
  };
}

// ==========================================
// Device Sticky Notes Persistence (DB & Local)
// ==========================================

export async function syncDeviceNotesFromDatabase(): Promise<CustomTopologyStickyNote[]> {
  try {
    const token = localStorage.getItem('nettopology_auth_token_v1') || sessionStorage.getItem('nettopology_auth_token_v1');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/settings/device-notes', { headers });
    if (res.ok) {
      const data = await res.json();
      const notes: CustomTopologyStickyNote[] = Array.isArray(data?.notes)
        ? data.notes
        : Array.isArray(data)
        ? data
        : [];
      if (Array.isArray(notes)) {
        localStorage.setItem(STORAGE_KEYS.DEVICE_STICKY_NOTES, JSON.stringify(notes));
        return notes;
      }
    }
  } catch (e) {
    console.warn('[Sync Device Notes Error]', e);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_STICKY_NOTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function syncNoteIntoLocalMaps(note: CustomTopologyStickyNote): void {
  const mapKeys = ['nettopology_custom_maps_v2', 'net_topology_custom_maps_v2'];
  const targetDevId = note.linkedDeviceId;
  const cleanTargetDevId = targetDevId?.replace(/^hw-/, '');
  const hwTargetDevId = cleanTargetDevId ? 'hw-' + cleanTargetDevId : undefined;

  mapKeys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const maps = JSON.parse(raw);
      if (!Array.isArray(maps)) return;

      let hasChanges = false;
      const updatedMaps = maps.map((m: any) => {
        if (!m) return m;
        const currentNotes: CustomTopologyStickyNote[] = Array.isArray(m.stickyNotes) ? m.stickyNotes : [];
        const exists = currentNotes.some(
          (sn) =>
            sn.id === note.id ||
            (targetDevId &&
              (sn.linkedDeviceId === targetDevId ||
                sn.linkedDeviceId === cleanTargetDevId ||
                sn.linkedDeviceId === hwTargetDevId))
        );

        let newNotes: CustomTopologyStickyNote[];
        if (exists) {
          hasChanges = true;
          newNotes = currentNotes.map((sn) => {
            if (
              sn.id === note.id ||
              (targetDevId &&
                (sn.linkedDeviceId === targetDevId ||
                  sn.linkedDeviceId === cleanTargetDevId ||
                  sn.linkedDeviceId === hwTargetDevId))
            ) {
              return {
                ...sn,
                id: note.id,
                title: note.title,
                content: note.content,
                color: note.color || sn.color,
                updatedAt: note.updatedAt || new Date().toISOString(),
              };
            }
            return sn;
          });
        } else {
          // Check if map contains this device
          const hasDevice =
            (Array.isArray(m.deviceIds) &&
              (m.deviceIds.includes(targetDevId) ||
                (cleanTargetDevId && m.deviceIds.includes(cleanTargetDevId)) ||
                (hwTargetDevId && m.deviceIds.includes(hwTargetDevId)))) ||
            (m.devicePositions &&
              (m.devicePositions[targetDevId!] ||
                (cleanTargetDevId && m.devicePositions[cleanTargetDevId]) ||
                (hwTargetDevId && m.devicePositions[hwTargetDevId])));

          if (hasDevice) {
            hasChanges = true;
            const devPos =
              (m.devicePositions &&
                (m.devicePositions[targetDevId!] ||
                  (cleanTargetDevId && m.devicePositions[cleanTargetDevId]) ||
                  (hwTargetDevId && m.devicePositions[hwTargetDevId]))) ||
              { x: 200, y: 150 };
            newNotes = [
              ...currentNotes,
              {
                ...note,
                x: (devPos.x || 200) + 80,
                y: (devPos.y || 150) + 40,
              },
            ];
          } else {
            newNotes = currentNotes;
          }
        }

        return {
          ...m,
          stickyNotes: newNotes,
        };
      });

      if (hasChanges) {
        localStorage.setItem(key, JSON.stringify(updatedMaps));
      }
    } catch (e) {}
  });

  // Also sync default map sticky notes in localStorage
  try {
    const rawDefault = localStorage.getItem('nettopology_default_sticky_notes_v1');
    const defaultNotes: CustomTopologyStickyNote[] = rawDefault ? JSON.parse(rawDefault) : [];
    const exists = defaultNotes.some(
      (sn) =>
        sn.id === note.id ||
        (targetDevId &&
          (sn.linkedDeviceId === targetDevId ||
            sn.linkedDeviceId === cleanTargetDevId ||
            sn.linkedDeviceId === hwTargetDevId))
    );

    let updatedDefault: CustomTopologyStickyNote[];
    if (exists) {
      updatedDefault = defaultNotes.map((sn) => {
        if (
          sn.id === note.id ||
          (targetDevId &&
            (sn.linkedDeviceId === targetDevId ||
              sn.linkedDeviceId === cleanTargetDevId ||
              sn.linkedDeviceId === hwTargetDevId))
        ) {
          return {
            ...sn,
            id: note.id,
            title: note.title,
            content: note.content,
            color: note.color || sn.color,
            updatedAt: note.updatedAt || new Date().toISOString(),
          };
        }
        return sn;
      });
    } else {
      updatedDefault = [...defaultNotes, note];
    }
    localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updatedDefault));
  } catch (e) {}
}

function removeNoteFromLocalMaps(noteId: string, deviceId?: string): void {
  const mapKeys = ['nettopology_custom_maps_v2', 'net_topology_custom_maps_v2'];
  const cleanTargetDevId = deviceId?.replace(/^hw-/, '');
  const hwTargetDevId = cleanTargetDevId ? 'hw-' + cleanTargetDevId : undefined;

  mapKeys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const maps = JSON.parse(raw);
      if (!Array.isArray(maps)) return;

      const updatedMaps = maps.map((m: any) => {
        if (!m || !Array.isArray(m.stickyNotes)) return m;
        return {
          ...m,
          stickyNotes: m.stickyNotes.filter((sn: any) => {
            if (noteId && sn.id === noteId) return false;
            if (deviceId && (sn.linkedDeviceId === deviceId || sn.linkedDeviceId === cleanTargetDevId || sn.linkedDeviceId === hwTargetDevId)) return false;
            return true;
          }),
        };
      });
      localStorage.setItem(key, JSON.stringify(updatedMaps));
    } catch (e) {}
  });

  try {
    const rawDefault = localStorage.getItem('nettopology_default_sticky_notes_v1');
    if (rawDefault) {
      const defaultNotes: CustomTopologyStickyNote[] = JSON.parse(rawDefault);
      if (Array.isArray(defaultNotes)) {
        const updatedDefault = defaultNotes.filter((sn) => {
          if (noteId && sn.id === noteId) return false;
          if (deviceId && (sn.linkedDeviceId === deviceId || sn.linkedDeviceId === cleanTargetDevId || sn.linkedDeviceId === hwTargetDevId)) return false;
          return true;
        });
        localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updatedDefault));
      }
    }
  } catch (e) {}
}

/**
 * Handle unlinking or reassigning a sticky note from one device to another.
 * Ensures the previous device immediately loses the note across local storage,
 * memory, and database, and attaches it cleanly to the new device (if specified).
 */
export async function handleDeviceNoteLinkChange(
  noteId: string,
  previousDeviceId?: string,
  newDeviceId?: string,
  updatedNote?: CustomTopologyStickyNote
): Promise<void> {
  const cleanPrev = previousDeviceId ? previousDeviceId.replace(/^hw-/, '') : undefined;
  const hwPrev = cleanPrev ? 'hw-' + cleanPrev : undefined;

  const cleanNew = newDeviceId ? newDeviceId.replace(/^hw-/, '') : undefined;
  const hwNew = cleanNew ? 'hw-' + cleanNew : undefined;

  // 1. Update localStorage DEVICE_STICKY_NOTES
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_STICKY_NOTES);
    let notes: CustomTopologyStickyNote[] = raw ? JSON.parse(raw) : [];
    if (Array.isArray(notes)) {
      // Remove any existing note bound to previousDeviceId or matching this noteId
      notes = notes.filter((n) => {
        if (!n) return false;
        if (n.id === noteId && !newDeviceId) return false;
        if (n.id === noteId && newDeviceId && n.linkedDeviceId !== newDeviceId) return false;
        if (previousDeviceId && (n.linkedDeviceId === previousDeviceId || n.linkedDeviceId === cleanPrev || n.linkedDeviceId === hwPrev)) {
          return false;
        }
        return true;
      });

      // If newDeviceId is specified, add or update note for new device
      if (newDeviceId && updatedNote) {
        const fullNote: CustomTopologyStickyNote = {
          ...updatedNote,
          id: noteId,
          linkedDeviceId: newDeviceId,
          updatedAt: new Date().toISOString(),
        };
        const existingIdx = notes.findIndex(
          (n) =>
            n.id === noteId ||
            n.linkedDeviceId === newDeviceId ||
            n.linkedDeviceId === cleanNew ||
            n.linkedDeviceId === hwNew
        );
        if (existingIdx >= 0) {
          notes[existingIdx] = fullNote;
        } else {
          notes.unshift(fullNote);
        }
      }

      localStorage.setItem(STORAGE_KEYS.DEVICE_STICKY_NOTES, JSON.stringify(notes));
    }
  } catch (e) {}

  // 2. Update default notes & custom maps in localStorage so unlinked note retains note info but drops linkedDeviceId
  try {
    const defaultRaw = localStorage.getItem('nettopology_default_sticky_notes_v1');
    if (defaultRaw) {
      const defaultNotes = JSON.parse(defaultRaw);
      if (Array.isArray(defaultNotes)) {
        const updatedDefault = defaultNotes.map((n) => {
          if (n && n.id === noteId) {
            const next = { ...n, updatedAt: new Date().toISOString() };
            if (newDeviceId) {
              next.linkedDeviceId = newDeviceId;
            } else {
              delete next.linkedDeviceId;
            }
            return next;
          }
          return n;
        });
        localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updatedDefault));
      }
    }
  } catch (e) {}

  ['nettopology_custom_maps_v2', 'net_topology_custom_maps_v2'].forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const maps = JSON.parse(raw);
      if (!Array.isArray(maps)) return;
      const updatedMaps = maps.map((m: any) => {
        if (!m || !Array.isArray(m.stickyNotes)) return m;
        return {
          ...m,
          stickyNotes: m.stickyNotes.map((sn: any) => {
            if (sn && sn.id === noteId) {
              const next = { ...sn, updatedAt: new Date().toISOString() };
              if (newDeviceId) {
                next.linkedDeviceId = newDeviceId;
              } else {
                delete next.linkedDeviceId;
              }
              return next;
            }
            return sn;
          }),
        };
      });
      localStorage.setItem(key, JSON.stringify(updatedMaps));
    } catch (e) {}
  });

  // 3. Sync with backend API
  try {
    const token = localStorage.getItem('nettopology_auth_token_v1') || sessionStorage.getItem('nettopology_auth_token_v1');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (!newDeviceId) {
      // Unlink: delete note from device notes database (pass previousDeviceId to clear device binding)
      const qp = new URLSearchParams();
      if (previousDeviceId) qp.set('deviceId', previousDeviceId);
      qp.set('keepInMap', 'true');
      await fetch(`/api/settings/device-notes/${encodeURIComponent(noteId)}?${qp.toString()}`, {
        method: 'DELETE',
        headers,
      });
    } else if (updatedNote) {
      // Reassign or Link: save new note with newDeviceId and pass previousDeviceId for atomic cleanup
      await fetch('/api/settings/device-notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          note: { ...updatedNote, id: noteId, linkedDeviceId: newDeviceId },
          previousDeviceId,
        }),
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('[Sync Link Change Error]', e);
  }

  // 4. Dispatch events so DeviceListView immediately updates
  window.dispatchEvent(
    new CustomEvent('nettopology_device_notes_updated', {
      detail: {
        id: noteId,
        previousDeviceId,
        newDeviceId,
        unlinked: !newDeviceId,
        note: updatedNote && newDeviceId ? { ...updatedNote, linkedDeviceId: newDeviceId } : undefined,
      },
    })
  );
  window.dispatchEvent(new CustomEvent('nettopology_custom_maps_updated'));
}

export async function persistDeviceNoteToDatabase(note: CustomTopologyStickyNote): Promise<CustomTopologyStickyNote> {
  // Clear any tombstone for this device or note in sessionStorage so it is never suppressed
  try {
    const targetDevId = note.linkedDeviceId;
    const cleanTargetDevId = targetDevId?.replace(/^hw-/, '');
    const hwTargetDevId = cleanTargetDevId ? 'hw-' + cleanTargetDevId : undefined;

    const rawDevs = sessionStorage.getItem('nettopology_deleted_devices_tombstone');
    if (rawDevs) {
      const devs: string[] = JSON.parse(rawDevs);
      if (Array.isArray(devs)) {
        const filteredDevs = devs.filter(
          (d) => d !== targetDevId && d !== cleanTargetDevId && d !== hwTargetDevId
        );
        sessionStorage.setItem('nettopology_deleted_devices_tombstone', JSON.stringify(filteredDevs));
      }
    }

    const rawNotes = sessionStorage.getItem('nettopology_deleted_notes_tombstone');
    if (rawNotes) {
      const notes: string[] = JSON.parse(rawNotes);
      if (Array.isArray(notes)) {
        const filteredNotes = notes.filter((id) => id !== note.id);
        sessionStorage.setItem('nettopology_deleted_notes_tombstone', JSON.stringify(filteredNotes));
      }
    }

    // Ensure notes display toggle is enabled so added note is immediately visible
    localStorage.setItem('nettopology_show_sticky_notes', 'true');
  } catch (e) {}

  // Update local cache immediately
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_STICKY_NOTES);
    const existing: CustomTopologyStickyNote[] = raw ? JSON.parse(raw) : [];
    const targetDevId = note.linkedDeviceId;
    const cleanTargetDevId = targetDevId?.replace(/^hw-/, '');
    // Filter out any prior records that had this noteId or this target device to prevent stale links
    const filtered = existing.filter(
      (n) =>
        n &&
        n.id !== note.id &&
        (!targetDevId ||
          (n.linkedDeviceId !== targetDevId &&
            n.linkedDeviceId !== cleanTargetDevId &&
            n.linkedDeviceId !== 'hw-' + cleanTargetDevId))
    );
    const updated = [note, ...filtered];
    localStorage.setItem(STORAGE_KEYS.DEVICE_STICKY_NOTES, JSON.stringify(updated));
  } catch (e) {}

  // Synchronize local custom maps & default map notes
  syncNoteIntoLocalMaps(note);

  try {
    const token = localStorage.getItem('nettopology_auth_token_v1') || sessionStorage.getItem('nettopology_auth_token_v1');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/settings/device-notes', {
      method: 'POST',
      headers,
      body: JSON.stringify({ note }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.note) {
        syncNoteIntoLocalMaps(data.note);
        window.dispatchEvent(new CustomEvent('nettopology_device_notes_updated', { detail: data.note }));
        window.dispatchEvent(new CustomEvent('nettopology_custom_maps_updated'));
        return data.note;
      }
    }
  } catch (e) {
    console.warn('[Persist Device Note Error]', e);
  }

  window.dispatchEvent(new CustomEvent('nettopology_device_notes_updated', { detail: note }));
  window.dispatchEvent(new CustomEvent('nettopology_custom_maps_updated'));
  return note;
}

export async function deleteDeviceNoteFromDatabase(noteId: string, deviceId?: string): Promise<void> {
  const cleanDevId = deviceId?.replace(/^hw-/, '');
  const hwDevId = cleanDevId ? 'hw-' + cleanDevId : undefined;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_STICKY_NOTES);
    const existing: CustomTopologyStickyNote[] = raw ? JSON.parse(raw) : [];
    const updated = existing.filter((n) => {
      if (noteId && n.id === noteId) return false;
      if (deviceId && (n.linkedDeviceId === deviceId || n.linkedDeviceId === cleanDevId || n.linkedDeviceId === hwDevId)) return false;
      return true;
    });
    localStorage.setItem(STORAGE_KEYS.DEVICE_STICKY_NOTES, JSON.stringify(updated));
  } catch (e) {}

  // Clean from local maps and default notes
  removeNoteFromLocalMaps(noteId, deviceId);

  try {
    const token = localStorage.getItem('nettopology_auth_token_v1') || sessionStorage.getItem('nettopology_auth_token_v1');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const queryParams = new URLSearchParams();
    if (deviceId) queryParams.set('deviceId', deviceId);
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

    await fetch(`/api/settings/device-notes/${encodeURIComponent(noteId)}${queryString}`, {
      method: 'DELETE',
      headers,
    });
  } catch (e) {
    console.warn('[Delete Device Note Error]', e);
  }

  window.dispatchEvent(
    new CustomEvent('nettopology_device_notes_updated', {
      detail: { id: noteId, deviceId, deleted: true },
    })
  );
  window.dispatchEvent(new CustomEvent('nettopology_custom_maps_updated'));
}

export function getDeviceNote(
  deviceId: string,
  notes?: CustomTopologyStickyNote[]
): CustomTopologyStickyNote | undefined {
  if (!deviceId) return undefined;
  if (Array.isArray(notes)) {
    return notes.find((n) => n && n.linkedDeviceId === deviceId);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_STICKY_NOTES);
    if (!raw) return undefined;
    const list: CustomTopologyStickyNote[] = JSON.parse(raw);
    return Array.isArray(list) ? list.find((n) => n && n.linkedDeviceId === deviceId) : undefined;
  } catch {
    return undefined;
  }
}

