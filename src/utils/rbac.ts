import { AccessPolicy, ServerActionKey, ServerActionPermissions } from '../types';

export interface ServerActionDescriptor {
  key: ServerActionKey;
  labelEn: string;
  labelFa: string;
  descriptionEn: string;
  descriptionFa: string;
  category: 'remote' | 'management' | 'power' | 'config';
  danger?: boolean;
}

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
  if (!policy) return false;

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
