import {
  AccessPolicy,
  ServerActionKey,
  ServerActionPermissions,
  NetworkDeviceActionKey,
  NetworkDeviceActionPermissions,
} from '../types';

export interface ServerActionDescriptor {
  key: ServerActionKey;
  labelEn: string;
  labelFa: string;
  descriptionEn: string;
  descriptionFa: string;
  category: 'remote' | 'management' | 'power' | 'config';
  danger?: boolean;
}

export interface NetworkDeviceActionDescriptor {
  key: NetworkDeviceActionKey;
  labelEn: string;
  labelFa: string;
  descriptionEn: string;
  descriptionFa: string;
  category: 'remote' | 'management' | 'config' | 'port' | 'danger';
  platform?: 'all' | 'cisco' | 'mikrotik';
  danger?: boolean;
}

export const DEVICE_ACTIONS_CATALOG: NetworkDeviceActionDescriptor[] = [
  {
    key: 'web_configs',
    labelEn: 'Web Consoles & GUI Management',
    labelFa: 'کنسول‌های وب و مدیریت (WebFig, iLO, Web GUI)',
    descriptionEn: 'Access external and in-browser HTTP/HTTPS device web consoles and out-of-band management.',
    descriptionFa: 'دسترسی به کنسول‌ها و رابط‌های وب مدیریتی تجهیزات نظیر WebFig میکروتیک، iLO، ESXi و پنل وب سوییچ‌ها.',
    category: 'remote',
    platform: 'all',
    danger: false,
  },
  {
    key: 'terminal',
    labelEn: 'SSH Direct Console (CLI Terminal)',
    labelFa: 'ترمینال شل تعاملی (کنسول مستقیم SSH)',
    descriptionEn: 'Interactive direct SSH terminal console session into Cisco IOS, MikroTik, or network appliances.',
    descriptionFa: 'برقراری اتصال مستقیم و تعاملی خط فرمان (CLI Terminal) به تجهیز جهت مدیریت مستقیم و صدور دستورات.',
    category: 'remote',
    platform: 'all',
    danger: true,
  },
  {
    key: 'apply_template',
    labelEn: 'Apply Config Template',
    labelFa: 'اعمال تمپلیت و الگوی کانفیگ',
    descriptionEn: 'Deploy structured configuration templates with dynamic variable substitutions to the device.',
    descriptionFa: 'اجرا و اعمال الگوهای پیکربندی، جایگذاری متغیرها و استقرار خودکار دستورات بر روی تجهیز شبکه.',
    category: 'config',
    platform: 'all',
    danger: true,
  },
  {
    key: 'device_note',
    labelEn: 'Sticky Notes & Operational Memos',
    labelFa: 'یادداشت‌های چسبان و نکات عملیاتی',
    descriptionEn: 'Create, view, and modify persistent operational notes and handover comments attached to this device.',
    descriptionFa: 'ثبت، مشاهده و ویرایش یادداشت‌های چسبان و نکات فنی پیوست‌شده به این تجهیز در سیستم.',
    category: 'management',
    platform: 'all',
    danger: false,
  },
  {
    key: 'edit_properties',
    labelEn: 'Edit Device Properties',
    labelFa: 'ویرایش مشخصات و اطلاعات تجهیز',
    descriptionEn: 'Update device hostname, management IP address, role, physical location, credentials, and tags.',
    descriptionFa: 'ویرایش نام میزبان، آدرس IP مدیریتی، نقش، مکان فیزیکی، اطلاعات کاربری اتصال و برچسب‌های دستگاه.',
    category: 'config',
    platform: 'all',
    danger: true,
  },
  {
    key: 'ping_keepalive',
    labelEn: 'Ping & Keepalive Telemetry',
    labelFa: 'تست پینگ و تاخیر لحظه‌ای (ICMP)',
    descriptionEn: 'Trigger real-time ICMP ping echo, round-trip latency measurement, and reachability validation.',
    descriptionFa: 'ارسال درخواست‌های تست پینگ ICMP، سنجش تاخیر رفت و برگشت (Latency) و پایش سلامت اتصال آنلاین تجهیز.',
    category: 'management',
    platform: 'all',
    danger: false,
  },
  {
    key: 'inspect_ports',
    labelEn: 'Inspect Interfaces & VLANs',
    labelFa: 'مشاهده وضعیت پورت‌ها و VLAN',
    descriptionEn: 'Inspect port interface telemetry, operational link states, duplex, and assigned VLAN memberships.',
    descriptionFa: 'مشاهده و بررسی وضعیت پورت‌های فیزیکی، لینک‌های فعال، تخصیص VLAN و مشخصات تلمتری اینترفیس‌ها.',
    category: 'management',
    platform: 'all',
    danger: false,
  },
  {
    key: 'write_memory',
    labelEn: 'Save to NVRAM (Write Memory)',
    labelFa: 'ذخیره در حافظه پایدار (Write Memory)',
    descriptionEn: 'Commit running configuration to non-volatile startup storage (copy running-config startup-config).',
    descriptionFa: 'ذخیره‌سازی و تثبیت پیکربندی جاری در حافظه پایدار تجهیز جهت حفظ تنظیمات پس از راه‌اندازی مجدد.',
    category: 'config',
    platform: 'all',
    danger: true,
  },
  {
    key: 'delete_device',
    labelEn: 'Delete Device from System',
    labelFa: 'حذف تجهیز از سیستم و شبکه',
    descriptionEn: 'Permanently remove this device, linked port connections, and topology map references from the system.',
    descriptionFa: 'حذف کامل و دائمی این تجهیز، اتصالات پورت‌ها و رکوردهای پایگاه داده از کل پنل مدیریت شبکه.',
    category: 'danger',
    platform: 'all',
    danger: true,
  },

  // -------------------------------------------------------------
  // Granular Port & Interface Operations (Cisco & MikroTik)
  // -------------------------------------------------------------
  {
    key: 'port_power',
    labelEn: 'Port Power (Shutdown / Enable)',
    labelFa: 'روشن/خاموش کردن پورت (Shutdown / Enable)',
    descriptionEn: 'Administratively enable or shutdown interfaces (Cisco shutdown / no shutdown, MikroTik disabled=yes/no).',
    descriptionFa: 'تغییر وضعیت اداری اینترفیس‌ها، خاموش کردن (Shutdown) یا فعال‌سازی (No Shutdown / Enable) پورت‌ها.',
    category: 'port',
    platform: 'all',
    danger: true,
  },
  {
    key: 'port_mode',
    labelEn: 'Switchport Mode (Trunk / Access)',
    labelFa: 'تغییر مود پورت سیسکو (Trunk / Access)',
    descriptionEn: 'Switch interface operation mode between Access port (untagged end-host) and 802.1Q Trunk.',
    descriptionFa: 'تغییر حالت کاری پورت سوئیچ سیسکو بین حالت دسترسی (Access) و ترانک (802.1Q Trunk).',
    category: 'port',
    platform: 'cisco',
    danger: true,
  },
  {
    key: 'port_vlan',
    labelEn: 'VLAN & Bridge PVID Assignment',
    labelFa: 'تخصیص و تغییر VLAN و PVID',
    descriptionEn: 'Assign access VLAN IDs, configure native VLANs, and update MikroTik bridge PVID memberships.',
    descriptionFa: 'تخصیص VLANهای دسترسی و تغییر شناسه‌های PVID در بریج میکروتیک و سوییچ‌های سیسکو.',
    category: 'port',
    platform: 'all',
    danger: true,
  },
  {
    key: 'port_security',
    labelEn: 'Port Security (Cisco IOS)',
    labelFa: 'امنیت پورت سیسکو (Port Security)',
    descriptionEn: 'Enable or disable MAC address limits, sticky MAC learning, and violation shutdown policies.',
    descriptionFa: 'فعال‌سازی یا غیرفعال‌سازی محدودیت آدرس‌های MAC، قابلیت Sticky MAC و پالیسی‌های مسدودسازی پورت در سیسکو.',
    category: 'port',
    platform: 'cisco',
    danger: false,
  },
  {
    key: 'port_description',
    labelEn: 'Port Description & Comments',
    labelFa: 'توضیحات و یادداشت پورت (Description / Comment)',
    descriptionEn: 'Update descriptive interface labels, connected endpoint names, and RouterOS port comments.',
    descriptionFa: 'تنظیم توضیحات پورت (Cisco Description) و یادداشت‌های اینترفیس میکروتیک (RouterOS Comment).',
    category: 'port',
    platform: 'all',
    danger: false,
  },
  {
    key: 'port_bridge',
    labelEn: 'Bridge Membership (MikroTik)',
    labelFa: 'عضویت در بریج میکروتیک (Bridge Port)',
    descriptionEn: 'Add or remove Ethernet interfaces to/from RouterOS bridge domains (bridge port add/remove).',
    descriptionFa: 'افزودن یا خارج کردن پورت‌های اترنت از بریج میکروتیک (RouterOS Bridge Port).',
    category: 'port',
    platform: 'mikrotik',
    danger: true,
  },
  {
    key: 'port_speed',
    labelEn: 'Speed, Duplex & Auto-Negotiation',
    labelFa: 'سرعت، دوبلکس و Auto-Negotiation',
    descriptionEn: 'Configure interface transmission speed (100M, 1G, 10G), full/half duplex, or auto-negotiation.',
    descriptionFa: 'پیکربندی نرخ انتقال داده، حالت Full/Half Duplex و تطبیق خودکار (Auto-Negotiation) پورت.',
    category: 'port',
    platform: 'mikrotik',
    danger: true,
  },
  {
    key: 'port_cable_test',
    labelEn: 'TDR Cable Diagnostic Test',
    labelFa: 'تست و عیب‌یابی کابل شبکه (TDR Test)',
    descriptionEn: 'Execute Time Domain Reflectometry (TDR) diagnostics to measure cable pair health, length, and faults.',
    descriptionFa: 'اجرای تست عیب‌یابی فیزیکی کابل شبکه (TDR) جهت سنجش طول کابل، سلامت زوج‌سیم‌ها و قطعی یا اتصال کوتاه.',
    category: 'port',
    platform: 'mikrotik',
    danger: false,
  },
];

export const FULL_DEVICE_PERMISSIONS: NetworkDeviceActionPermissions = {
  web_configs: true,
  terminal: true,
  apply_template: true,
  device_note: true,
  edit_properties: true,
  ping_keepalive: true,
  inspect_ports: true,
  write_memory: true,
  delete_device: true,
  port_power: true,
  port_mode: true,
  port_vlan: true,
  port_security: true,
  port_description: true,
  port_bridge: true,
  port_speed: true,
  port_cable_test: true,
};

export const RESTRICTED_DEVICE_PERMISSIONS: NetworkDeviceActionPermissions = {
  web_configs: true,
  terminal: false,
  apply_template: false,
  device_note: true,
  edit_properties: false,
  ping_keepalive: true,
  inspect_ports: true,
  write_memory: false,
  delete_device: false,
  port_power: false,
  port_mode: false,
  port_vlan: false,
  port_security: false,
  port_description: false,
  port_bridge: false,
  port_speed: false,
  port_cable_test: true,
};

export const EMPTY_DEVICE_PERMISSIONS: NetworkDeviceActionPermissions = {
  web_configs: false,
  terminal: false,
  apply_template: false,
  device_note: false,
  edit_properties: false,
  ping_keepalive: false,
  inspect_ports: false,
  write_memory: false,
  delete_device: false,
  port_power: false,
  port_mode: false,
  port_vlan: false,
  port_security: false,
  port_description: false,
  port_bridge: false,
  port_speed: false,
  port_cable_test: false,
};

export const SERVER_ACTIONS_CATALOG: ServerActionDescriptor[] = [
  {
    key: 'terminal',
    labelEn: 'Interactive Terminal & Remote Desktop',
    labelFa: 'ترمینال تعاملی و ریموت دسکتاپ (SSH, RDP, VNC)',
    descriptionEn: 'Interactive command shell (SSH /bin/bash, PowerShell) and graphical desktop streams (HTML5 RDP, VNC).',
    descriptionFa: 'کنسول تعاملی خط فرمان (ترمینال لینوکس و پاورشل) و استریم دسکتاپ گرافیکی (ریموت دسکتاپ و VNC).',
    category: 'remote',
    danger: true,
  },
  {
    key: 'file_explorer',
    labelEn: 'File Explorer & SFTP Browser',
    labelFa: 'کاوشگر فایل و مرورگر SFTP',
    descriptionEn: 'Browse filesystem, upload/download files, edit configuration files, and manage directory permissions.',
    descriptionFa: 'مرور دایرکتوری‌ها، ویرایش فایل‌های متنی و کانفیگ، آپلود و دانلود فایل‌ها از طریق پروتکل امن SFTP.',
    category: 'remote',
  },
  {
    key: 'server_management',
    labelEn: 'System Telemetry & Service Management',
    labelFa: 'پایش سیستم و مدیریت سرویس‌ها',
    descriptionEn: 'System resource graphs, process lists, systemd services, cron jobs, log viewer, and packages.',
    descriptionFa: 'مشاهده شاخص‌های مصرف CPU/RAM، لیست پروسه‌ها، سرویس‌های سیستم، کران‌جاب‌ها، پکیج‌ها و لاگ‌ها.',
    category: 'management',
  },
  {
    key: 'web_management',
    labelEn: 'Web Servers (Nginx & Apache)',
    labelFa: 'مدیریت وب‌سرورها (Nginx و Apache)',
    descriptionEn: 'Inspect virtual hosts, reverse proxies, HTTP configurations, and web server service state.',
    descriptionFa: 'بررسی و مدیریت هاست‌های مجازی (VirtualHosts)، پروکسی معکوس، لاگ‌ها و وضعیت سرویس وب‌سرور.',
    category: 'management',
  },
  {
    key: 'database_management',
    labelEn: 'Databases (PostgreSQL & MySQL)',
    labelFa: 'مدیریت پایگاه داده (PostgreSQL و MySQL)',
    descriptionEn: 'Inspect database cluster status, connection pools, running queries, tables, and server telemetry.',
    descriptionFa: 'پایش کلاسترهای پایگاه داده، اتصالات فعال، کوئری‌های در حال اجرا و تلمتری دیتابیس.',
    category: 'management',
  },
  {
    key: 'power_control',
    labelEn: 'Power Control (Restart & Shutdown)',
    labelFa: 'کنترل توان (راه‌اندازی مجدد و خاموش کردن)',
    descriptionEn: 'Execute graceful or forced reboot and system shutdown operations on the target server.',
    descriptionFa: 'صدور دستور ری‌استارت (Reboot) یا خاموش‌سازی کامل سیستم (Shutdown / Power Off) روی سرور.',
    category: 'power',
    danger: true,
  },
  {
    key: 'edit_properties',
    labelEn: 'Edit Server Properties',
    labelFa: 'ویرایش مشخصات و اطلاعات سرور',
    descriptionEn: 'Update hostname, IP address, management ports, credentials, category, and automation tags.',
    descriptionFa: 'ویرایش نام میزبان، آدرس IP، پورت‌های مدیریتی، پسورد یا کلید SSH، دسته‌بندی و تگ‌های سرور.',
    category: 'config',
  },
  {
    key: 'delete_server',
    labelEn: 'Delete Server from Fleet',
    labelFa: 'حذف سرور از ناوگان تجهیزات',
    descriptionEn: 'Permanently remove the server record, credentials, and topology attachments from the fleet.',
    descriptionFa: 'حذف دائم رکورد سرور، اطلاعات اتصال و برچسب‌های اتوماسیون آن از پایگاه داده و پنل مدیریت.',
    category: 'config',
    danger: true,
  },
];

export const FULL_SERVER_PERMISSIONS: ServerActionPermissions = {
  terminal: true,
  file_explorer: true,
  server_management: true,
  web_management: true,
  database_management: true,
  power_control: true,
  edit_properties: true,
  delete_server: true,
};

export const RESTRICTED_SERVER_PERMISSIONS: ServerActionPermissions = {
  terminal: false,
  file_explorer: false,
  server_management: true,
  web_management: false,
  database_management: false,
  power_control: false,
  edit_properties: false,
  delete_server: false,
};

/**
 * Universally evaluates whether a specific server action is permitted
 * under a database-authoritative AccessPolicy for a given server.
 */
export function isServerActionPermitted(
  policy: AccessPolicy | any | null | undefined,
  serverId: string,
  action: ServerActionKey
): boolean {
  // If no policy is provided (unauthenticated/standalone fallback), permit action
  if (!policy) return true;

  // 1. If user has no permission to view/manage servers at all
  if (policy.canViewServers === false) {
    return false;
  }

  // 2. If policy targets specific groups/servers, ensure target server is in allowed fleet scope
  if (Array.isArray(policy.allowedServerIds) && !policy.allowedServerIds.includes(serverId)) {
    return false;
  }

  // 3. Highest Priority: Granular Per-Server Override Matrix
  if (policy.perServerPermissions && typeof policy.perServerPermissions === 'object') {
    const serverOverrides = policy.perServerPermissions[serverId];
    if (serverOverrides && typeof serverOverrides === 'object') {
      if (typeof serverOverrides[action] === 'boolean') {
        return serverOverrides[action];
      }
    }
  }

  // 4. Default Server Permissions defined in the policy
  if (policy.defaultServerPermissions && typeof policy.defaultServerPermissions === 'object') {
    if (typeof policy.defaultServerPermissions[action] === 'boolean') {
      return policy.defaultServerPermissions[action];
    }
  }

  // 5. Global Policy Scope Fallback (Super Administrator unconstrained access)
  const isSuperAdmin =
    policy.id === 'policy-super-admin' ||
    (policy.targetScope === 'all' && (policy.priority || 0) >= 100);
  if (isSuperAdmin) {
    return true;
  }

  // Safe defaults for non-superadmin policies without explicit grants:
  // Dangerous / sensitive actions are blocked by default
  if (
    action === 'delete_server' ||
    action === 'power_control' ||
    action === 'terminal' ||
    action === 'edit_properties'
  ) {
    return false;
  }

  // Safe monitoring & inspection actions default to true if the server is in scope
  return true;
}

/**
 * Client-side evaluation helper to test whether a given action is permitted on a target server.
 * Accepts either the RemoteServer object or its string ID, along with the action key and effective policy.
 */
export function isServerActionAllowed(
  server: { id: string } | string | null | undefined,
  actionKey: ServerActionKey,
  policy: AccessPolicy | any | null | undefined
): boolean {
  if (!server) return false;
  const serverId = typeof server === 'string' ? server : server.id;
  return isServerActionPermitted(policy, serverId, actionKey);
}

/**
 * Universally evaluates whether a specific network equipment action is permitted
 * under a database-authoritative AccessPolicy for a given network device.
 */
export function isDeviceActionPermitted(
  policy: AccessPolicy | any | null | undefined,
  deviceId: string,
  action: NetworkDeviceActionKey
): boolean {
  // If no policy is provided (unauthenticated/standalone fallback), permit action
  if (!policy) return true;

  // 1. If user has no permission to view/manage devices at all
  if (policy.canViewDevices === false) {
    return false;
  }

  // 2. If policy targets specific groups or devices, ensure target device is in allowed scope
  if (Array.isArray(policy.allowedDeviceIds) && !policy.allowedDeviceIds.includes(deviceId)) {
    return false;
  }

  // 3. Highest Priority: Granular Per-Device Override Matrix
  if (policy.perDevicePermissions && typeof policy.perDevicePermissions === 'object') {
    const deviceOverrides = policy.perDevicePermissions[deviceId];
    if (deviceOverrides && typeof deviceOverrides === 'object') {
      if (typeof deviceOverrides[action] === 'boolean') {
        return deviceOverrides[action];
      }
    }
  }

  // 4. Default Device Permissions defined in the policy
  if (policy.defaultDevicePermissions && typeof policy.defaultDevicePermissions === 'object') {
    if (typeof policy.defaultDevicePermissions[action] === 'boolean') {
      return policy.defaultDevicePermissions[action];
    }
  }

  // 5. Global Policy Scope Fallback (Super Administrator unconstrained access)
  const isSuperAdmin =
    policy.id === 'policy-super-admin' ||
    (policy.targetScope === 'all' && (policy.priority || 0) >= 100);
  if (isSuperAdmin) {
    return true;
  }

  // 6. Safe backward-compatible fallback mapping from general policy flags:
  if (action === 'terminal') {
    return policy.terminalAccess === 'full' || policy.terminalAccess === 'view_only';
  }
  if (action === 'apply_template') {
    return Boolean(policy.canApplyTemplates);
  }
  if (action === 'write_memory') {
    return Boolean(policy.canWriteMemory);
  }
  if (action === 'delete_device' || action === 'edit_properties') {
    return Boolean(policy.canManageDevices);
  }

  // Fallback mappings for granular port & interface capabilities:
  if (action === 'port_power') {
    return policy.canToggleAdminStatus !== false && policy.canMikrotikToggleInterface !== false;
  }
  if (action === 'port_mode') {
    return policy.canToggleAdminStatus !== false && policy.canChangeVlan !== false;
  }
  if (action === 'port_vlan') {
    return policy.canChangeVlan !== false && policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'port_security') {
    return Boolean(policy.canTogglePortSecurity);
  }
  if (action === 'port_description') {
    return policy.canEditDescription !== false && policy.canMikrotikComment !== false;
  }
  if (action === 'port_bridge') {
    return policy.canMikrotikBridgeVlan !== false;
  }
  if (action === 'port_speed') {
    return policy.canMikrotikToggleInterface !== false;
  }
  if (action === 'port_cable_test') {
    return policy.canGenericDiagnostics !== false;
  }

  // Operational telemetry and memos are enabled by default for authorized equipment
  return true;
}

/**
 * Client-side evaluation helper to test whether a given action is permitted on a target network device.
 * Accepts either the device object or its string ID, along with the action key and effective policy.
 */
export function isDeviceActionAllowed(
  device: { id: string } | string | null | undefined,
  actionKey: NetworkDeviceActionKey,
  policy: AccessPolicy | any | null | undefined
): boolean {
  if (!device) return false;
  const deviceId = typeof device === 'string' ? device : device.id;
  return isDeviceActionPermitted(policy, deviceId, actionKey);
}

/**
 * Universally evaluates whether a user or active policy is authorized to perform a specific action on a network device.
 * Conforms to both (policy, deviceId, action) and (user, policy, deviceId, action) calling signatures.
 */
export function canUserPerformDeviceAction(
  policy: AccessPolicy | any | null | undefined,
  deviceId: string,
  action: NetworkDeviceActionKey
): boolean;
export function canUserPerformDeviceAction(
  user: any,
  policy: AccessPolicy | any | null | undefined,
  deviceId: string,
  action: NetworkDeviceActionKey
): boolean;
export function canUserPerformDeviceAction(
  arg1: any,
  arg2: any,
  arg3: any,
  arg4?: any
): boolean {
  if (arg4 !== undefined) {
    // Called as (user, policy, deviceId, action)
    const policy = arg2;
    const deviceId = arg3;
    const action = arg4 as NetworkDeviceActionKey;
    return isDeviceActionPermitted(policy, deviceId, action);
  } else {
    // Called as (policy, deviceId, action)
    const policy = arg1;
    const deviceId = arg2;
    const action = arg3 as NetworkDeviceActionKey;
    return isDeviceActionPermitted(policy, deviceId, action);
  }
}

/**
 * Checks whether at least one operational action is permitted on the target network equipment
 * under the active AccessPolicy. Used to determine visibility of the 3-dots actions menu.
 */
export function hasAnyDeviceActionPermitted(
  policy: AccessPolicy | any | null | undefined,
  device: { id: string } | string | null | undefined
): boolean {
  if (!device) return false;
  const deviceId = typeof device === 'string' ? device : device.id;
  const actions: NetworkDeviceActionKey[] = [
    'web_configs',
    'terminal',
    'apply_template',
    'device_note',
    'edit_properties',
    'ping_keepalive',
    'inspect_ports',
    'write_memory',
    'delete_device',
    'port_power',
    'port_mode',
    'port_vlan',
    'port_security',
    'port_description',
    'port_bridge',
    'port_speed',
    'port_cable_test',
  ];
  return actions.some((act) => isDeviceActionPermitted(policy, deviceId, act));
}

/**
 * Evaluates whether a user or active policy is authorized to check for software updates.
 * Strict RBAC rule: ONLY Super Administrator profiles possess the authority to check for software updates.
 * Access is authoritative and linked to the Super Admin policy in the database.
 */
export function canUserCheckUpdate(
  user: { username?: string; role?: string } | null | undefined,
  policy: AccessPolicy | any | null | undefined
): boolean {
  if (!user && !policy) return false;
  const username = (user?.username || '').toLowerCase();
  const role = (user?.role || '').toLowerCase();
  const isSuperAdmin =
    username === 'admin' ||
    role.includes('super admin') ||
    role.includes('administrator') ||
    policy?.id === 'policy-super-admin' ||
    ((policy?.priority || 0) >= 100 && policy?.targetScope === 'all');
  if (!isSuperAdmin) return false;
  return policy?.canCheckUpdate !== false;
}

/**
 * Evaluates whether a user or active policy is authorized to trigger software updates.
 * Strict RBAC rule: ONLY Super Administrator profiles possess the authority to execute system upgrades or rebuilds.
 * Access is authoritative and linked to the Super Admin policy in the database.
 */
export function canUserPerformUpdate(
  user: { username?: string; role?: string } | null | undefined,
  policy: AccessPolicy | any | null | undefined
): boolean {
  if (!user && !policy) return false;
  const username = (user?.username || '').toLowerCase();
  const role = (user?.role || '').toLowerCase();
  const isSuperAdmin =
    username === 'admin' ||
    role.includes('super admin') ||
    role.includes('administrator') ||
    policy?.id === 'policy-super-admin' ||
    ((policy?.priority || 0) >= 100 && policy?.targetScope === 'all');
  if (!isSuperAdmin) return false;
  return policy?.canPerformUpdate !== false;
}
