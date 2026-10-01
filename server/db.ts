import { Pool, PoolConfig, PoolClient } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { hashPassword } from './auth';
import { encryptServerSecret } from './vaultCrypto';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Load environment variables from candidate paths
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(currentDir, '.env'),
  path.resolve(currentDir, '..', '.env'),
  '/opt/nettopology/.env',
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}
dotenv.config();

export interface DbStatus {
  connected: boolean;
  engine: 'postgresql' | 'fallback_json';
  host: string;
  port: number;
  database: string;
  user: string;
  tablesCount?: number;
  usersCount?: number;
  devicesCount?: number;
  customMapsCount?: number;
  error?: string | null;
  lastChecked: string;
}

export function getDbConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 20,
    };
  }

  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const database = process.env.DB_NAME || 'nettopology_db';
  const user = process.env.DB_USER || 'nettopology_user';
  const password = process.env.DB_PASSWORD || '';

  return {
    host,
    port,
    database,
    user,
    password,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 20,
  };
}

let pool: Pool | null = null;
let isPostgresReady = false;
let lastError: string | null = null;

export async function ensurePostgresConnection(): Promise<boolean> {
  if (isPostgresReady && pool) {
    try {
      const pingClient = await pool.connect();
      pingClient.release();
      return true;
    } catch {
      isPostgresReady = false;
    }
  }

  try {
    const config = getDbConfig();
    if (!pool) {
      pool = new Pool(config);
      pool.on('error', (err) => {
        console.error('[PostgreSQL Pool Unexpected Error]', err);
        isPostgresReady = false;
      });
    }

    const client = await pool.connect();
    client.release();
    isPostgresReady = true;
    lastError = null;
    return true;
  } catch (err: any) {
    isPostgresReady = false;
    lastError = err.message || 'PostgreSQL not reachable';
    return false;
  }
}

// Local persistent file fallback (used if PostgreSQL is offline or unprovisioned)
const FALLBACK_FILE = path.join(process.cwd(), 'backend', 'database_store.json');

export interface RemoteServer {
  id: string;
  name: string;
  hostname?: string;
  ip: string;
  os_type: 'linux' | 'windows';
  os_distro?: string;
  environment: 'Production' | 'Staging' | 'Development' | 'Testing' | 'DMZ' | 'DR';
  category: string;
  role: string;
  tags: string[];
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  ssh_key_path?: string;
  ssh_key?: string;
  default_shell?: 'bash' | 'zsh' | 'sh';
  win_protocol?: 'rdp' | 'powershell' | 'winrm' | 'ssh';
  win_port?: number;
  win_username?: string;
  win_password?: string;
  win_domain?: string;
  vnc_port?: number;
  vnc_username?: string;
  vnc_password?: string;
  prompt_password_on_connect?: boolean;
  server_type?: 'linux' | 'windows' | 'nginx' | 'apache' | 'postgresql' | 'mysql';
  installed_web_servers?: ('apache' | 'nginx' | string)[];
  installed_databases?: ('postgresql' | 'mysql' | string)[];
  has_apache?: boolean;
  has_nginx?: boolean;
  has_postgresql?: boolean;
  has_mysql?: boolean;
  web_http_port?: number;
  web_https_port?: number;
  postgres_port?: number;
  postgres_user?: string;
  postgres_password?: string;
  postgres_password_set?: boolean;
  postgres_database?: string;
  mysql_port?: number;
  mysql_user?: string;
  mysql_password?: string;
  mysql_password_set?: boolean;
  mysql_database?: string;
  status: 'online' | 'offline' | 'unreachable' | 'maintenance' | 'untested';
  cpu_cores?: number;
  ram_gb?: number;
  disk_gb?: number;
  uptime_str?: string;
  location?: string;
  notes?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface FallbackStore {
  users: any[];
  user_groups: any[];
  access_policies: any[];
  devices: any[];
  device_groups: any[];
  custom_maps: any[];
  topology_hierarchy: any[];
  node_positions: Record<string, Record<string, { x: number; y: number }>>;
  audit_logs: any[];
  ad_config: any;
  device_sticky_notes?: any[];
  remote_servers?: RemoteServer[];
  server_categories?: ServerCategory[];
  user_password_vault?: UserVaultItem[];
  bulk_server_reports?: any[];
}

export interface UserVaultItem {
  id: string;
  user_id: string;
  name: string;
  username?: string;
  encrypted_password: string;
  iv: string;
  tag: string;
  password_hash?: string;
  password_salt?: string;
  category?: string;
  target_host?: string;
  notes?: string;
  tags?: string[];
  strength?: string;
  created_at: string;
  updated_at: string;
}

export interface ServerCategory {
  id: string;
  name: string;
  name_fa?: string;
  description?: string;
  color?: string;
  is_default?: boolean;
  serverCount?: number;
  created_at?: string;
  updated_at?: string;
}

function loadInitialDevices(): any[] {
  try {
    const netPath = path.join(process.cwd(), 'backend', 'network_data.json');
    if (fs.existsSync(netPath)) {
      const parsed = JSON.parse(fs.readFileSync(netPath, 'utf-8'));
      if (Array.isArray(parsed.devices) && parsed.devices.length > 0) {
        return parsed.devices;
      }
    }
  } catch (e) {
    console.error('[DB] Failed to load devices from network_data.json', e);
  }
  return [];
}

const DEFAULT_USER_GROUPS = [
  {
    id: 'group-admin',
    name: 'مدیران ارشد شبکه (Super Administrators)',
    description: 'دسترسی نامحدود به تمامی منابع، نقشه‌ها، پیکربندی تجهیزات و احراز هویت',
    color: 'indigo',
    member_user_ids: ['user-admin'],
    is_builtin: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'group-noc',
    name: 'تیم پایش و عملیات NOC (NOC Operations)',
    description: 'پایش برخط وضعیت لینک‌ها، اجرای ابزارهای عیب‌یابی و مشاهده نقشه‌ها',
    color: 'cyan',
    member_user_ids: ['user-noc'],
    is_builtin: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'group-helpdesk-ops',
    name: 'کارشناسان پشتیبانی و هلپ‌دسک (Helpdesk Support)',
    description: 'پشتیبانی کاربران محلی، بررسی پورت‌ها و خطایابی کلاینت‌های شبکه',
    color: 'emerald',
    member_user_ids: ['user-helpdesk'],
    is_builtin: false,
    created_at: new Date().toISOString()
  },
  {
    id: 'group-readonly',
    name: 'ناظران و مانیتورینگ فقط-خواندنی (Read-Only Auditors)',
    description: 'مشاهده گزارشات، نقشه‌های عمومی و ممیزی سیستم بدون امکان اعمال تغییرات',
    color: 'amber',
    member_user_ids: [],
    is_builtin: false,
    created_at: new Date().toISOString()
  }
];

export const DEFAULT_ACCESS_POLICIES = [
  {
    id: 'policy-helpdesk',
    name: 'سطح دسترسی تیم هلپ‌دسک (Helpdesk Operator Policy)',
    description: 'دسترسی محدود به سوئیچ‌های لایه دسترسی جهت تغییر ویلن، دیسکریپشن و بازنشانی پورت‌ها بدون دسترسی به کنسول CLI یا خاموش کردن پورت‌های حساس',
    is_builtin: true,
    isBuiltin: true,
    priority: 10,
    subjectType: 'local_group',
    subjectId: 'group-helpdesk-ops',
    subjectName: 'Helpdesk Operators (تیم هلپ‌دسک و پشتیبانی)',
    targetScope: 'groups',
    targetGroupIds: ['devgroup-access'],
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
    // Device & Port Actions
    terminalAccess: 'none',
    canToggleAdminStatus: false,
    canChangeVlan: true,
    canEditDescription: true,
    canTogglePortSecurity: true,
    canWriteMemory: false,
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
    canExportBackup: false,
    canImportBackup: false,
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
    created_at: new Date().toISOString(),
  },
  {
    id: 'policy-noc-observer',
    name: 'تیم پایش و مانیتورینگ NOC (Read-Only Observer)',
    description: 'دسترسی فقط خواندنی به تمام تجهیزات، توپولوژی، تلمتری پورت‌ها و اسکنر همسایگی همراه با دسترسی کنسول فقط خواندنی',
    is_builtin: true,
    isBuiltin: true,
    priority: 20,
    subjectType: 'local_group',
    subjectId: 'group-noc',
    subjectName: 'NOC Monitoring (مرکز عملیات شبکه)',
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
    // Device & Port Actions
    terminalAccess: 'view_only',
    canToggleAdminStatus: false,
    canChangeVlan: false,
    canEditDescription: false,
    canTogglePortSecurity: false,
    canWriteMemory: false,
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
    canExportBackup: false,
    canImportBackup: false,
    defaultServerPermissions: {
      terminal: false,
      file_explorer: false,
      server_management: true,
      web_management: true,
      database_management: true,
      power_control: false,
      edit_properties: false,
      delete_server: false,
    },
    perServerPermissions: {},
    created_at: new Date().toISOString(),
  },
  {
    id: 'policy-super-admin',
    name: 'مدیر ارشد زیرساخت شبکه (Super Administrator)',
    description: 'دسترسی نامحدود به تمامی تجهیزات، کنسول‌های تعاملی SSH، رایت مموری، اعمال تمپلیت و تنظیمات امنیتی',
    is_builtin: true,
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
    // Device & Port Actions
    terminalAccess: 'full',
    canToggleAdminStatus: true,
    canChangeVlan: true,
    canEditDescription: true,
    canTogglePortSecurity: true,
    canWriteMemory: true,
    canManageDevices: true,
    canApplyTemplates: true,
    canBatchOperate: true,
    canExportBackup: true,
    canImportBackup: true,
    defaultServerPermissions: {
      terminal: true,
      file_explorer: true,
      server_management: true,
      web_management: true,
      database_management: true,
      power_control: true,
      edit_properties: true,
      delete_server: true,
    },
    perServerPermissions: {},
    created_at: new Date().toISOString(),
  },
];

const DEFAULT_DEVICE_GROUPS = [
  {
    id: 'devgroup-core',
    name: 'سوییچ‌های لایه هسته و توزیع (Core & Distribution)',
    description: 'سوییچ‌های پرسرعت Catalyst و Nexus مسئول ترافیک اصلی ستون‌فقرات',
    color: 'indigo',
    icon: 'Layers',
    device_ids: ['dev-core-01', 'dev-dist-bldg-a', 'dev-dist-bldg-b', 'dev-mikrotik-ccr2004', 'dev-dist-01', 'dev-core-02'],
    created_at: new Date().toISOString()
  },
  {
    id: 'devgroup-access',
    name: 'سوییچ‌های لایه دسترسی (Access Layer Switches)',
    description: 'سوییچ‌های ارتباط دهنده کلاینت‌ها، ایستگاه‌های کاری و اکسس‌پوینت‌ها',
    color: 'emerald',
    icon: 'Server',
    device_ids: ['dev-acc-bldg-a-f3', 'dev-acc-bldg-b-f2', 'dev-ap-bldg-a-f1', 'dev-ap-bldg-a-f3', 'dev-ap-bldg-b-f1', 'dev-acc-01', 'dev-acc-02', 'dev-acc-03'],
    created_at: new Date().toISOString()
  },
  {
    id: 'devgroup-routers',
    name: 'روترها و لبه شبکه WAN (Edge & Gateways)',
    description: 'تجهیزات مرزی مسیریابی، گیت‌وی اینترنت و تانل‌های VPN',
    color: 'cyan',
    icon: 'Radio',
    device_ids: ['dev-router-gw', 'dev-mikrotik-ccr2004', 'dev-wan-gw'],
    created_at: new Date().toISOString()
  }
];

const DEFAULT_HIERARCHY = [
  {
    id: 'bldg-central',
    type: 'building',
    name: 'ساختمان مرکزی (Central Bldg)',
    description: 'ساختمان اداری مرکزی و دیتاسنتر اصلی سازمان',
    parentId: null,
    metadata: { address: 'تهران، خیابان ولیعصر', floorsCount: 4 }
  },
  {
    id: 'bldg-west',
    type: 'building',
    name: 'شعبه غرب (West Branch)',
    description: 'ساختمان پشتیبان و شعبه توسعه نرم‌افزار',
    parentId: null,
    metadata: { address: 'شعبه غرب، پارک فناوری', floorsCount: 2 }
  },
  {
    id: 'floor-dc',
    type: 'floor',
    name: 'مرکز داده (DC Floor)',
    description: 'طبقه زیرهمکف اختصاصی مرکز داده و رک‌های سرور',
    parentId: 'bldg-central',
    metadata: { securityLevel: 'High', cooling: 'Precision AC' }
  },
  {
    id: 'floor-1',
    type: 'floor',
    name: 'طبقه ۱ (Floor 1)',
    description: 'طبقه اداری و اتاق کارشناسان شبکه',
    parentId: 'bldg-central',
    metadata: { usersCount: 45 }
  },
  {
    id: 'unit-server-room',
    type: 'unit',
    name: 'اتاق سرور اصلی (Main Server Room)',
    description: 'اتاق سرور مرکزی مجهز به سیستم اطفا حریق و کنترل تردد',
    parentId: 'floor-dc',
    metadata: { doorAccess: 'Biometric' }
  },
  {
    id: 'unit-idf-1',
    type: 'unit',
    name: 'اتاق رک طبقه ۱ (IDF-1)',
    description: 'رک‌های توزیع طبقه اول برای کلاینت‌ها',
    parentId: 'floor-1',
    metadata: {}
  },
  {
    id: 'rack-a01',
    type: 'rack',
    name: 'Rack-A01 (Core & WAN)',
    description: 'رک اختصاصی تجهیزات Core و Edge سازمان',
    parentId: 'unit-server-room',
    metadata: { totalU: 42, usedU: 14 }
  },
  {
    id: 'rack-a02',
    type: 'rack',
    name: 'Rack-A02 (Distribution)',
    description: 'رک سوییچ‌های لایه توزیع و ارتباطی شعب',
    parentId: 'unit-server-room',
    metadata: { totalU: 42, usedU: 10 }
  },
  {
    id: 'rack-b01',
    type: 'rack',
    name: 'Rack-B01 (Access Floor 1)',
    description: 'رک توزیع کابلی طبقه ۱',
    parentId: 'unit-idf-1',
    metadata: { totalU: 24, usedU: 8 }
  }
];

const DEFAULT_CUSTOM_MAPS = [
  {
    id: 'map-enterprise-core',
    name: 'شبکه ستون‌فقرات و دیتاسنتر (Backbone & Datacenter)',
    description: 'نقشه توپولوژی ارتباطی سوییچ‌های Core، روتر مرزی و سوییچ‌های توزیع',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deviceIds: ['dev-router-gw', 'dev-core-01', 'dev-dist-01', 'dev-acc-01', 'dev-acc-02'],
    devicePositions: {
      'dev-router-gw': { x: 480, y: 80 },
      'dev-core-01': { x: 480, y: 240 },
      'dev-dist-01': { x: 240, y: 420 },
      'dev-acc-01': { x: 120, y: 620 },
      'dev-acc-02': { x: 360, y: 620 }
    },
    links: [
      {
        id: 'link-gw-core',
        sourceDeviceId: 'dev-router-gw',
        targetDeviceId: 'dev-core-01',
        sourceInterface: 'GigabitEthernet0/0/0',
        targetInterface: 'FortyGigE1/0/1',
        color: '#3b82f6',
        type: 'fiber',
        speed: '40Gbps',
        status: 'connected'
      },
      {
        id: 'link-core-dist',
        sourceDeviceId: 'dev-core-01',
        targetDeviceId: 'dev-dist-01',
        sourceInterface: 'TenGigE1/0/1',
        targetInterface: 'TenGigE1/1/1',
        color: '#10b981',
        type: 'fiber',
        speed: '10Gbps',
        status: 'connected'
      },
      {
        id: 'link-dist-acc1',
        sourceDeviceId: 'dev-dist-01',
        targetDeviceId: 'dev-acc-01',
        sourceInterface: 'GigabitEthernet1/0/1',
        targetInterface: 'GigabitEthernet0/1',
        color: '#6366f1',
        type: 'copper',
        speed: '1Gbps',
        status: 'connected'
      },
      {
        id: 'link-dist-acc2',
        sourceDeviceId: 'dev-dist-01',
        targetDeviceId: 'dev-acc-02',
        sourceInterface: 'GigabitEthernet1/0/2',
        targetInterface: 'GigabitEthernet0/1',
        color: '#6366f1',
        type: 'copper',
        speed: '1Gbps',
        status: 'connected'
      }
    ],
    visibility: 'public',
    ownerId: 'user-admin',
    ownerName: 'admin',
    allowedUsers: []
  }
];

const DEFAULT_NODE_POSITIONS: Record<string, Record<string, { x: number; y: number }>> = {
  default: {
    'dev-router-gw': { x: 480, y: 80 },
    'dev-core-01': { x: 480, y: 240 },
    'dev-dist-01': { x: 240, y: 420 },
    'dev-core-02': { x: 720, y: 420 },
    'dev-acc-01': { x: 120, y: 620 },
    'dev-acc-02': { x: 360, y: 620 },
    'dev-acc-03': { x: 600, y: 620 },
    'dev-wan-gw': { x: 840, y: 620 }
  }
};

const DEFAULT_AD_CONFIG = {
  domain: 'corp.internal',
  server: '192.168.1.10',
  port: 389,
  use_ssl: false,
  base_dn: 'DC=corp,DC=internal',
  bind_user: 'CN=ldap_service,OU=ServiceAccounts,DC=corp,DC=internal',
  bind_password: 'encrypted_service_pass_2026',
  sync_interval_min: 15,
  auto_sync: true,
  role_mappings: {
    'Domain Admins': 'Super Administrator',
    'Network Engineers': 'NOC Analyst',
    'Helpdesk Staff': 'Helpdesk Specialist'
  },
  last_sync: new Date().toISOString(),
  status: 'configured'
};

export const DEFAULT_SERVER_CATEGORIES: ServerCategory[] = [
  {
    id: 'cat-infrastructure',
    name: 'Infrastructure',
    name_fa: 'زیرساخت و شبکه',
    description: 'Core infrastructure, hypervisors, firewalls, and network appliances',
    color: 'blue',
    is_default: true,
  },
  {
    id: 'cat-database',
    name: 'Database',
    name_fa: 'پایگاه داده',
    description: 'Relational databases, SQL clusters, NoSQL datastores, and caching servers',
    color: 'emerald',
    is_default: true,
  },
  {
    id: 'cat-kubernetes',
    name: 'Kubernetes',
    name_fa: 'کوبرنتیز و کلاسترها',
    description: 'Kubernetes control plane, worker nodes, and containerized clusters',
    color: 'cyan',
    is_default: true,
  },
  {
    id: 'cat-web-app',
    name: 'Web / App',
    name_fa: 'وب و اپلیکیشن',
    description: 'Web applications, backend microservices, and reverse proxies',
    color: 'purple',
    is_default: true,
  },
  {
    id: 'cat-monitoring',
    name: 'Monitoring',
    name_fa: 'مانیتورینگ و لاگ',
    description: 'Observability, Prometheus, Grafana, logging, and APM systems',
    color: 'amber',
    is_default: true,
  },
  {
    id: 'cat-active-directory',
    name: 'Active Directory',
    name_fa: 'اکتیو دایرکتوری و هویت',
    description: 'Windows domain controllers, Kerberos, DNS, and identity servers',
    color: 'rose',
    is_default: true,
  },
  {
    id: 'cat-devops',
    name: 'DevOps & Automation',
    name_fa: 'دواپس و اتوماسیون',
    description: 'CI/CD runners, Ansible, Terraform, and automated deployment engines',
    color: 'indigo',
    is_default: true,
  },
  {
    id: 'cat-general',
    name: 'General',
    name_fa: 'عمومی',
    description: 'General purpose utility servers and multipurpose instances',
    color: 'teal',
    is_default: true,
  },
  {
    id: 'cat-uncategorized',
    name: 'Uncategorized',
    name_fa: 'دسته‌بندی‌نشده',
    description: 'System fallback category for newly added or unclassified servers',
    color: 'slate',
    is_default: true,
  },
];

export const DEFAULT_REMOTE_SERVERS: RemoteServer[] = [
  {
    id: 'srv-web-prod01',
    name: 'Web & API Gateway (Prod-01)',
    hostname: 'web-prod01.internal',
    ip: '192.168.10.15',
    os_type: 'linux',
    os_distro: 'Ubuntu 24.04 LTS',
    environment: 'Production',
    category: 'Web Server',
    role: 'Nginx Reverse Proxy & Node API',
    tags: ['web', 'nginx', 'production', 'automation-tier1', 'k8s-ingress'],
    ssh_port: 22,
    ssh_username: 'root',
    ssh_password: '',
    default_shell: 'bash',
    installed_web_servers: ['nginx'],
    installed_databases: [],
    has_apache: false,
    has_nginx: true,
    has_postgresql: false,
    has_mysql: false,
    status: 'untested',
    cpu_cores: 8,
    ram_gb: 32,
    disk_gb: 500,
    uptime_str: '72 days, 14 hours',
    location: 'Datacenter A (Rack R-04)',
    notes: 'Main customer-facing HTTPS gateway and SSL termination point',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'srv-db-master',
    name: 'PostgreSQL DB Master (Cluster-01)',
    hostname: 'db-master01.internal',
    ip: '192.168.10.20',
    os_type: 'linux',
    os_distro: 'Debian 12 Bookworm',
    environment: 'Production',
    category: 'Database Server',
    role: 'Primary Relational Database',
    tags: ['database', 'postgresql', 'production', 'high-priority', 'backup-daily', 'ansible-target'],
    ssh_port: 22,
    ssh_username: 'root',
    ssh_password: '',
    default_shell: 'zsh',
    installed_web_servers: [],
    installed_databases: ['postgresql'],
    has_apache: false,
    has_nginx: false,
    has_postgresql: true,
    has_mysql: false,
    status: 'untested',
    cpu_cores: 16,
    ram_gb: 64,
    disk_gb: 1200,
    uptime_str: '115 days, 6 hours',
    location: 'Datacenter A (Rack R-05)',
    notes: 'High-availability replication leader with WAL archive',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'srv-ci-runner',
    name: 'DevOps CI/CD Automation Worker',
    hostname: 'runner-devops.internal',
    ip: '192.168.10.35',
    os_type: 'linux',
    os_distro: 'Rocky Linux 9.4',
    environment: 'Staging',
    category: 'DevOps & Automation',
    role: 'Ansible & Docker Build Engine',
    tags: ['devops', 'ansible', 'docker', 'ci-cd', 'automation-tier1', 'staging'],
    ssh_port: 22,
    ssh_username: 'devops',
    ssh_password: '',
    default_shell: 'zsh',
    status: 'untested',
    cpu_cores: 8,
    ram_gb: 32,
    disk_gb: 400,
    uptime_str: '28 days, 9 hours',
    location: 'Datacenter B (Rack R-02)',
    notes: 'Automated deployment engine with Ansible playbooks and Docker daemon',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'srv-dc-corp01',
    name: 'Active Directory Domain Controller (DC-01)',
    hostname: 'dc01.corp.internal',
    ip: '192.168.10.10',
    os_type: 'windows',
    os_distro: 'Windows Server 2022 Datacenter',
    environment: 'Production',
    category: 'Directory Services',
    role: 'Primary Domain Controller & DNS',
    tags: ['active-directory', 'domain-controller', 'dns', 'critical', 'corp-infra'],
    win_protocol: 'rdp',
    win_port: 3389,
    win_username: 'Administrator',
    win_domain: 'CORP.INTERNAL',
    status: 'untested',
    cpu_cores: 8,
    ram_gb: 32,
    disk_gb: 300,
    uptime_str: '142 days, 18 hours',
    location: 'Datacenter A (Rack R-03)',
    notes: 'FSMO role holder, Kerberos KDC, and root Active Directory authority',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'srv-app-win01',
    name: 'Enterprise ERP & File Services',
    hostname: 'app-win01.corp.internal',
    ip: '192.168.10.25',
    os_type: 'windows',
    os_distro: 'Windows Server 2022 Standard',
    environment: 'Production',
    category: 'Application Server',
    role: 'IIS Web Server & SMB Shares',
    tags: ['iis', 'storage', 'smb', 'windows-infra', 'erp-backend'],
    win_protocol: 'powershell',
    win_port: 5985,
    win_username: 'Administrator',
    win_domain: 'CORP.INTERNAL',
    status: 'untested',
    cpu_cores: 12,
    ram_gb: 48,
    disk_gb: 2000,
    uptime_str: '63 days, 4 hours',
    location: 'Datacenter A (Rack R-04)',
    notes: 'Internal IIS business applications and high-throughput network shares',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

function loadFallbackStore(): FallbackStore {
  let store: any = null;
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, 'utf-8');
      store = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[DB Fallback] Error reading fallback store:', err);
  }

  const defaultAdminHash = hashPassword('admin123', 'seed_salt_admin_2026');
  const defaultHelpdeskHash = hashPassword('helpdesk123', 'seed_salt_helpdesk_2026');
  const defaultNocHash = hashPassword('noc123', 'seed_salt_noc_2026');

  const defaultUsers = [
    {
      id: 'user-admin',
      username: 'admin',
      password_hash: defaultAdminHash.hash,
      password_salt: defaultAdminHash.salt,
      full_name: 'مدیر ارشد شبکه (Network Administrator)',
      email: 'admin@nettopology.internal',
      role: 'Super Administrator',
      user_type: 'local',
      status: 'active',
      group_ids: ['group-admin'],
      is_builtin: true,
      created_at: '2026-09-14T00:00:00.000Z',
      last_login: new Date().toISOString()
    },
    {
      id: 'user-helpdesk',
      username: 'helpdesk_user',
      password_hash: defaultHelpdeskHash.hash,
      password_salt: defaultHelpdeskHash.salt,
      full_name: 'کاربر هلپ‌دسک محلی (Helpdesk Local)',
      email: 'helpdesk@nettopology.internal',
      role: 'Helpdesk Specialist',
      user_type: 'local',
      status: 'active',
      group_ids: ['group-helpdesk-ops'],
      is_builtin: false,
      created_at: '2026-09-14T00:00:00.000Z',
      last_login: null
    },
    {
      id: 'user-noc',
      username: 'noc_operator',
      password_hash: defaultNocHash.hash,
      password_salt: defaultNocHash.salt,
      full_name: 'اپراتور محلی NOC (Local NOC)',
      email: 'noc@nettopology.internal',
      role: 'NOC Analyst',
      user_type: 'local',
      status: 'active',
      group_ids: ['group-noc'],
      is_builtin: false,
      created_at: '2026-09-14T00:00:00.000Z',
      last_login: null
    }
  ];

  if (!store || typeof store !== 'object') {
    store = {};
  }

  if (Array.isArray(store.users)) {
    // Sanitize and filter out invalid/corrupted records that lack username
    store.users = store.users.filter(
      (u) => u && typeof u.username === 'string' && u.username.trim().length > 0
    );
  }
  if (!Array.isArray(store.users) || store.users.length === 0) {
    store.users = defaultUsers;
  }
  if (!Array.isArray(store.user_groups) || store.user_groups.length === 0) {
    store.user_groups = DEFAULT_USER_GROUPS;
  }
  if (!Array.isArray(store.access_policies) || store.access_policies.length === 0) {
    store.access_policies = DEFAULT_ACCESS_POLICIES;
  }
  if (!Array.isArray(store.devices) || store.devices.length === 0) {
    store.devices = loadInitialDevices();
  }
  if (!Array.isArray(store.device_groups) || store.device_groups.length === 0) {
    store.device_groups = DEFAULT_DEVICE_GROUPS;
  }
  if (!Array.isArray(store.custom_maps) || store.custom_maps.length === 0) {
    store.custom_maps = DEFAULT_CUSTOM_MAPS;
  }
  if (!Array.isArray(store.topology_hierarchy) || store.topology_hierarchy.length === 0) {
    store.topology_hierarchy = DEFAULT_HIERARCHY;
  }
  if (!store.node_positions || Object.keys(store.node_positions).length === 0) {
    store.node_positions = DEFAULT_NODE_POSITIONS;
  }
  if (!store.ad_config) {
    store.ad_config = DEFAULT_AD_CONFIG;
  }
  if (!Array.isArray(store.device_sticky_notes)) {
    store.device_sticky_notes = [];
  }
  if (!Array.isArray(store.remote_servers) || store.remote_servers.length === 0) {
    store.remote_servers = DEFAULT_REMOTE_SERVERS;
  }
  if (!Array.isArray(store.server_categories) || store.server_categories.length === 0) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }
  if (!Array.isArray(store.user_password_vault)) {
    store.user_password_vault = [];
  }
  if (!Array.isArray(store.bulk_server_reports)) {
    store.bulk_server_reports = [];
  }
  if (!Array.isArray(store.audit_logs)) {
    store.audit_logs = [
      {
        id: `audit-init-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user_name: 'System',
        action: 'Database Initialization',
        category: 'system',
        target: 'PostgreSQL Core',
        status: 'success',
        details: 'Enterprise PostgreSQL schemas & fallback tables initialized successfully.',
        ip_address: '127.0.0.1',
        user_agent: 'NetTopology Backend Service'
      }
    ];
  }

  return store;
}

function saveFallbackStore(data: FallbackStore): void {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB Fallback] Error saving fallback store:', err);
  }
}

/**
 * Synchronize all entities from fallback store to PostgreSQL if PostgreSQL is missing records
 */
async function syncFallbackToPostgres(client: PoolClient, initialData: FallbackStore): Promise<void> {
  // 1. Sync Users
  try {
    const existingUsersRes = await client.query('SELECT id, username FROM users');
    const existingUsernames = new Set(existingUsersRes.rows.map((r: any) => (r.username || '').toLowerCase()));
    const existingIds = new Set(existingUsersRes.rows.map((r: any) => r.id));

    for (const u of initialData.users) {
      if (!u || !u.username) continue;
      const cleanUser = u.username.toLowerCase();
      if (!existingUsernames.has(cleanUser) && !existingIds.has(u.id)) {
        await client.query(
          `INSERT INTO users (id, username, password_hash, password_salt, full_name, email, role, user_type, status, group_ids, is_builtin, created_at, last_login)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             full_name = EXCLUDED.full_name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             user_type = EXCLUDED.user_type,
             status = EXCLUDED.status,
             group_ids = EXCLUDED.group_ids,
             is_builtin = EXCLUDED.is_builtin`,
          [
            u.id || `user-sync-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            u.username,
            u.password_hash || '',
            u.password_salt || '',
            (u.full_name || u.fullName || u.username).trim(),
            (u.email || `${cleanUser}@nettopology.internal`).trim(),
            u.role || 'Super Administrator',
            u.user_type || u.userType || 'local',
            u.status || 'active',
            JSON.stringify(u.group_ids || u.groupIds || []),
            Boolean(u.is_builtin ?? u.isBuiltin),
            u.created_at || u.createdAt || new Date().toISOString(),
            u.last_login || u.lastLogin || null,
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Users sync notice:', err.message);
  }

  // 2. Sync Custom Maps
  try {
    const existingMapsRes = await client.query('SELECT id FROM custom_maps');
    const existingMapIds = new Set(existingMapsRes.rows.map((r: any) => r.id));
    const mapsToSync = (initialData.custom_maps && initialData.custom_maps.length > 0)
      ? initialData.custom_maps
      : DEFAULT_CUSTOM_MAPS;

    for (const m of mapsToSync) {
      if (!m || !m.id) continue;
      if (!existingMapIds.has(m.id)) {
        await client.query(
          `INSERT INTO custom_maps (
             id, name, description, map_type, nodes, connections, viewport, metadata, visibility, owner_id, owner_name, allowed_users, map_data, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             map_type = EXCLUDED.map_type,
             nodes = EXCLUDED.nodes,
             connections = EXCLUDED.connections,
             viewport = EXCLUDED.viewport,
             metadata = EXCLUDED.metadata,
             visibility = EXCLUDED.visibility,
             owner_id = EXCLUDED.owner_id,
             owner_name = EXCLUDED.owner_name,
             allowed_users = EXCLUDED.allowed_users,
             map_data = EXCLUDED.map_data,
             updated_at = EXCLUDED.updated_at`,
          [
            m.id,
            m.name || 'Untitled Map',
            m.description || '',
            m.type || m.map_type || 'schematic',
            JSON.stringify(m.devicePositions || m.nodes || {}),
            JSON.stringify(m.links || m.connections || []),
            JSON.stringify(m.viewport || { zoom: 1, pan: { x: 0, y: 0 } }),
            JSON.stringify(m.metadata || {}),
            m.visibility || 'public',
            m.ownerId || m.owner_id || 'user-admin',
            m.ownerName || m.owner_name || 'admin',
            JSON.stringify(m.allowedUsers || m.allowed_users || []),
            JSON.stringify(m),
            m.createdAt || m.created_at ? new Date(m.createdAt || m.created_at) : new Date(),
            new Date(),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Custom Maps sync notice:', err.message);
  }

  // 3. Sync User Groups
  try {
    const groupCountRes = await client.query('SELECT count(*) as count FROM user_groups');
    if (parseInt(groupCountRes.rows[0]?.count || '0', 10) === 0) {
      const groupsToSeed = (initialData.user_groups && initialData.user_groups.length > 0)
        ? initialData.user_groups
        : DEFAULT_USER_GROUPS;
      for (const g of groupsToSeed) {
        await client.query(
          `INSERT INTO user_groups (id, name, description, color, member_user_ids, is_builtin, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [g.id, g.name, g.description, g.color, JSON.stringify(g.memberUserIds || g.member_user_ids || []), g.isBuiltin ?? g.is_builtin ?? false, g.created_at || new Date().toISOString()]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] User Groups sync notice:', err.message);
  }

  // 4. Sync Access Policies
  try {
    const policyCountRes = await client.query('SELECT count(*) as count FROM access_policies');
    if (parseInt(policyCountRes.rows[0]?.count || '0', 10) === 0) {
      const policiesToSeed = (initialData.access_policies && initialData.access_policies.length > 0)
        ? initialData.access_policies
        : DEFAULT_ACCESS_POLICIES;
      for (const p of policiesToSeed) {
        await client.query(
          `INSERT INTO access_policies (id, name, description, priority, is_builtin, policy_data, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [p.id, p.name, p.description, p.priority || 100, p.isBuiltin ?? p.is_builtin ?? false, JSON.stringify(p.policyData || p.policy_data || {}), p.created_at || new Date().toISOString()]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Access Policies sync notice:', err.message);
  }

  // 5. Sync Devices
  try {
    const devCountRes = await client.query('SELECT count(*) as count FROM devices');
    if (parseInt(devCountRes.rows[0]?.count || '0', 10) === 0) {
      const devicesToSeed = (initialData.devices && initialData.devices.length > 0)
        ? initialData.devices
        : loadInitialDevices();
      for (const d of devicesToSeed) {
        await client.query(
          `INSERT INTO devices (id, name, ip, type, model, platform, role, connection_mode, ssh_host, ssh_port, ssh_username, is_online, latency_ms, mac_address, uptime_str, ports)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO NOTHING`,
          [
            d.id,
            d.name,
            d.ip,
            d.type || 'switch',
            d.model || '',
            d.platform || 'cisco_ios_xe',
            d.role || '',
            d.connection_mode || 'simulator',
            d.ssh_host || d.ip,
            d.ssh_port || 22,
            d.ssh_username || 'admin',
            d.is_online !== undefined ? d.is_online : true,
            d.latency_ms || 1.5,
            d.mac || d.mac_address || '',
            d.uptime || '',
            JSON.stringify(d.ports || []),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Devices sync notice:', err.message);
  }

  // 6. Sync Device Groups
  try {
    const devGroupCountRes = await client.query('SELECT count(*) as count FROM device_groups');
    if (parseInt(devGroupCountRes.rows[0]?.count || '0', 10) === 0) {
      const devGroupsToSeed = (initialData.device_groups && initialData.device_groups.length > 0)
        ? initialData.device_groups
        : DEFAULT_DEVICE_GROUPS;
      for (const dg of devGroupsToSeed) {
        await client.query(
          `INSERT INTO device_groups (id, name, description, color, icon, device_ids)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [dg.id, dg.name, dg.description, dg.color, dg.icon, JSON.stringify(dg.deviceIds || dg.device_ids || [])]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Device Groups sync notice:', err.message);
  }

  // 7. Sync Topology Hierarchy
  try {
    const hierCountRes = await client.query('SELECT count(*) as count FROM topology_hierarchy');
    if (parseInt(hierCountRes.rows[0]?.count || '0', 10) === 0) {
      const hierToSeed = (initialData.topology_hierarchy && initialData.topology_hierarchy.length > 0)
        ? initialData.topology_hierarchy
        : DEFAULT_HIERARCHY;
      for (const h of hierToSeed) {
        await client.query(
          `INSERT INTO topology_hierarchy (id, type, parent_id, name, description, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [h.id, h.type, h.parentId || h.parent_id || null, h.name, h.description, JSON.stringify(h.metadata || {})]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Topology Hierarchy sync notice:', err.message);
  }

  // 8. Sync Node Positions
  try {
    const nodePosCountRes = await client.query('SELECT count(*) as count FROM node_positions');
    if (parseInt(nodePosCountRes.rows[0]?.count || '0', 10) === 0) {
      const defaultPositions = (initialData.node_positions && initialData.node_positions['default']) || DEFAULT_NODE_POSITIONS['default'];
      for (const [nodeId, coords] of Object.entries(defaultPositions)) {
        await client.query(
          `INSERT INTO node_positions (map_id, node_id, x, y)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (map_id, node_id) DO NOTHING`,
          ['default', nodeId, (coords as any).x, (coords as any).y]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Node Positions sync notice:', err.message);
  }

  // 9. Sync Active Directory Config
  try {
    const adRes = await client.query('SELECT count(*) as count FROM ad_config');
    if (parseInt(adRes.rows[0]?.count || '0', 10) === 0) {
      const adToSeed = initialData.ad_config || DEFAULT_AD_CONFIG;
      await client.query(
        `INSERT INTO ad_config (id, config_data) VALUES ('primary', $1) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(adToSeed)]
      );
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] AD Config sync notice:', err.message);
  }

  // 10. Sync Device Sticky Notes
  try {
    if (Array.isArray(initialData.device_sticky_notes) && initialData.device_sticky_notes.length > 0) {
      for (const n of initialData.device_sticky_notes) {
        if (!n || !n.id || (!n.linkedDeviceId && !n.device_id)) continue;
        await client.query(
          `INSERT INTO device_sticky_notes (id, device_id, title, content, color, x, y, width, view_mode, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            n.id,
            n.linkedDeviceId || n.device_id,
            n.title || '',
            n.content || '',
            n.color || 'yellow',
            Number(n.x) || 100,
            Number(n.y) || 100,
            Number(n.width) || 230,
            n.viewMode || n.view_mode || 'card',
            n.createdAt || n.created_at || new Date().toISOString(),
            n.updatedAt || n.updated_at || new Date().toISOString(),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Device Sticky Notes sync notice:', err.message);
  }

  // 11. Sync Remote Servers Fleet
  try {
    const srvCountRes = await client.query('SELECT count(*) as count FROM remote_servers');
    if (parseInt(srvCountRes.rows[0]?.count || '0', 10) === 0) {
      const serversToSeed = (Array.isArray(initialData.remote_servers) && initialData.remote_servers.length > 0)
        ? initialData.remote_servers
        : DEFAULT_REMOTE_SERVERS;
      for (const s of serversToSeed) {
        if (!s || !s.id || !s.ip) continue;
        await client.query(
          `INSERT INTO remote_servers (
            id, name, hostname, ip, os_type, os_distro, environment, category, role, tags,
            ssh_port, ssh_username, ssh_password, ssh_key_path, default_shell,
            win_protocol, win_port, win_username, win_domain,
            status, cpu_cores, ram_gb, disk_gb, uptime_str, location, notes,
            prompt_password_on_connect,
            installed_web_servers, installed_databases, has_apache, has_nginx, has_postgresql, has_mysql,
            created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
           ON CONFLICT (id) DO NOTHING`,
          [
            s.id,
            s.name || s.id,
            s.hostname || '',
            s.ip,
            s.os_type || 'linux',
            s.os_distro || (s.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'),
            s.environment || 'Production',
            s.category || 'Application Server',
            s.role || 'General Server',
            JSON.stringify(s.tags || []),
            s.ssh_port || 22,
            s.ssh_username || 'root',
            s.ssh_password || '',
            s.ssh_key_path || '',
            s.default_shell || 'bash',
            s.win_protocol || 'rdp',
            s.win_port || 3389,
            s.win_username || 'Administrator',
            s.win_domain || 'CORP.INTERNAL',
            s.status || 'online',
            s.cpu_cores ?? null,
            s.ram_gb ?? null,
            s.disk_gb ?? null,
            s.uptime_str || '',
            s.location || 'Datacenter A',
            s.notes || '',
            Boolean(s.prompt_password_on_connect),
            JSON.stringify(s.installed_web_servers || []),
            JSON.stringify(s.installed_databases || []),
            Boolean(s.has_apache),
            Boolean(s.has_nginx),
            Boolean(s.has_postgresql),
            Boolean(s.has_mysql),
            s.created_at || new Date().toISOString(),
            s.updated_at || new Date().toISOString()
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Remote Servers sync notice:', err.message);
  }

  // 12. Sync Server Categories
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_categories (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        name_fa VARCHAR(150),
        description TEXT,
        color VARCHAR(50) DEFAULT 'indigo',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const catCountRes = await client.query('SELECT count(*) as count FROM server_categories');
    if (parseInt(catCountRes.rows[0]?.count || '0', 10) === 0) {
      const catsToSeed = (Array.isArray(initialData.server_categories) && initialData.server_categories.length > 0)
        ? initialData.server_categories
        : DEFAULT_SERVER_CATEGORIES;
      for (const c of catsToSeed) {
        if (!c || !c.id || !c.name) continue;
        await client.query(
          `INSERT INTO server_categories (
            id, name, name_fa, description, color, is_default, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            c.id,
            c.name,
            c.name_fa || c.name,
            c.description || '',
            c.color || 'indigo',
            Boolean(c.is_default),
            c.created_at || new Date().toISOString(),
            c.updated_at || new Date().toISOString()
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Server Categories sync notice:', err.message);
  }

  // 13. Sync User Password Vault
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_password_vault (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        name VARCHAR(150) NOT NULL,
        username VARCHAR(128),
        encrypted_password TEXT NOT NULL,
        iv VARCHAR(64) NOT NULL,
        tag VARCHAR(64) NOT NULL,
        password_hash VARCHAR(128),
        password_salt VARCHAR(64),
        category VARCHAR(64) DEFAULT 'general',
        target_host VARCHAR(150),
        notes TEXT,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        strength VARCHAR(32) DEFAULT 'strong',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure columns exist on existing table
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_hash VARCHAR(128);
        ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_salt VARCHAR(64);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);

    if (Array.isArray(initialData.user_password_vault) && initialData.user_password_vault.length > 0) {
      for (const v of initialData.user_password_vault) {
        if (!v || !v.id || !v.user_id) continue;
        await client.query(
          `INSERT INTO user_password_vault (
            id, user_id, name, username, encrypted_password, iv, tag, password_hash, password_salt, category, target_host, notes, tags, strength, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO NOTHING`,
          [
            v.id,
            v.user_id,
            v.name,
            v.username || '',
            v.encrypted_password,
            v.iv,
            v.tag,
            v.password_hash || '',
            v.password_salt || '',
            v.category || 'general',
            v.target_host || '',
            v.notes || '',
            JSON.stringify(v.tags || []),
            v.strength || 'strong',
            v.created_at || new Date().toISOString(),
            v.updated_at || new Date().toISOString(),
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] User Password Vault sync notice:', err.message);
  }

  // 14. Sync Bulk Server Execution Reports & Fleet Audit History
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bulk_server_reports (
        id VARCHAR(128) PRIMARY KEY,
        job_id VARCHAR(128) NOT NULL,
        template_id VARCHAR(128) NOT NULL,
        template_title VARCHAR(255) NOT NULL,
        template_title_en VARCHAR(255),
        category VARCHAR(100),
        icon VARCHAR(50),
        status VARCHAR(50) NOT NULL,
        operator_user VARCHAR(128) DEFAULT 'Administrator',
        duration_ms INTEGER DEFAULT 0,
        total_servers INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        server_summaries JSONB NOT NULL DEFAULT '[]'::jsonb,
        impact_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
        parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
        results JSONB NOT NULL DEFAULT '{}'::jsonb,
        logs JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at BIGINT NOT NULL,
        finished_at BIGINT NOT NULL,
        created_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_created ON bulk_server_reports(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_template ON bulk_server_reports(template_id);
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_status ON bulk_server_reports(status);
      CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_job_id ON bulk_server_reports(job_id);
    `);

    const countRes = await client.query('SELECT count(*) as count FROM bulk_server_reports');
    if (parseInt(countRes.rows[0]?.count || '0', 10) === 0) {
      const reportsToSeed = (Array.isArray(initialData.bulk_server_reports) && initialData.bulk_server_reports.length > 0)
        ? initialData.bulk_server_reports
        : [];
      for (const r of reportsToSeed) {
        if (!r || !r.id) continue;
        await client.query(
          `INSERT INTO bulk_server_reports (
            id, job_id, template_id, template_title, template_title_en, category, icon,
            status, operator_user, duration_ms, total_servers, success_count, failed_count, skipped_count,
            server_summaries, impact_analysis, parameters, results, logs, created_at, finished_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
           ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.jobId || r.id,
            r.templateId || 'custom',
            r.templateTitle || 'Bulk Configuration',
            r.templateTitleEn || r.templateTitle || 'Bulk Configuration',
            r.category || 'general',
            r.icon || 'Server',
            r.status || 'completed',
            r.operatorUser || 'Administrator',
            r.durationMs || 0,
            r.totalServers || 0,
            r.successCount || 0,
            r.failedCount || 0,
            r.skippedCount || 0,
            JSON.stringify(r.serverSummaries || []),
            JSON.stringify(r.impactAnalysis || {}),
            JSON.stringify(r.parameters || {}),
            JSON.stringify(r.results || {}),
            JSON.stringify(r.logs || []),
            r.createdAt || Date.now(),
            r.finishedAt || Date.now()
          ]
        );
      }
    }
  } catch (err: any) {
    console.warn('[Database Sync Notice] Bulk Server Reports sync notice:', err.message);
  }
}

/**
 * Initialize PostgreSQL connection pool and run migration if needed
 */
export async function initDatabase(): Promise<void> {
  // Ensure fallback store exists and is thoroughly populated first
  const initialData = loadFallbackStore();
  saveFallbackStore(initialData);

  // Attempt PostgreSQL initialization
  try {
    const config = getDbConfig();
    pool = new Pool(config);
    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Unexpected Error]', err);
      isPostgresReady = false;
    });

    const client = await pool.connect();
    console.log(`[Database] Successfully connected to PostgreSQL server on ${(config as any).host}:${(config as any).port}/${(config as any).database}`);

    // Read and run schema.sql statement by statement safely
    try {
      const schemaPath = path.join(process.cwd(), 'backend', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf-8');
        const statements = sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
          try {
            await client.query(statement);
          } catch (stmtErr: any) {
            // Ignore benign notices (e.g. relation already exists, extension privileges)
            if (
              !stmtErr.message.includes('already exists') &&
              !stmtErr.message.includes('extension') &&
              !stmtErr.message.includes('duplicate')
            ) {
              console.warn('[Database Schema Notice]', stmtErr.message);
            }
          }
        }
        console.log('[Database] PostgreSQL schema verification and migration completed.');
      }
    } catch (schemaErr: any) {
      console.warn('[Database Schema Warning]', schemaErr.message);
    }

    try {
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS prompt_password_on_connect BOOLEAN DEFAULT FALSE');
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_web_servers JSONB NOT NULL DEFAULT '[]'::jsonb");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_databases JSONB NOT NULL DEFAULT '[]'::jsonb");
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_apache BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_nginx BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_postgresql BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_mysql BOOLEAN DEFAULT FALSE');
      await client.query('ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_port INT DEFAULT 5432');
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_user VARCHAR(64) DEFAULT 'postgres'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_password TEXT DEFAULT ''");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_database VARCHAR(64) DEFAULT 'postgres'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS server_type VARCHAR(32) DEFAULT 'linux'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_port INT DEFAULT 3306");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_user VARCHAR(64) DEFAULT 'root'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_password TEXT DEFAULT ''");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS mysql_database VARCHAR(64) DEFAULT 'mysql'");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS web_http_port INT DEFAULT 80");
      await client.query("ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS web_https_port INT DEFAULT 443");
      await client.query("ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS server_ids JSONB DEFAULT '[]'::jsonb");
      await client.query("ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
      await client.query("ALTER TABLE device_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    } catch {}

    // Synchronize all fallback records into PostgreSQL
    await syncFallbackToPostgres(client, initialData);
    console.log('[Database] Fallback store synchronization to PostgreSQL completed successfully.');

    client.release();
    isPostgresReady = true;
    lastError = null;
  } catch (err: any) {
    isPostgresReady = false;
    lastError = err.message || 'PostgreSQL not available';
    console.warn(`[Database Notice] PostgreSQL is not reachable (${lastError}). Using robust file-backed store for persistence.`);
  }
}

/**
 * Manually trigger bidirectional database sync
 */
export async function syncDatabase(): Promise<DbStatus> {
  const connected = await ensurePostgresConnection();
  if (connected && pool) {
    const client = await pool.connect();
    try {
      const store = loadFallbackStore();
      await syncFallbackToPostgres(client, store);
    } finally {
      client.release();
    }
  }
  return getDbStatus();
}

/**
 * Get current database status and metrics
 */
export async function getDbStatus(): Promise<DbStatus> {
  const cfg = getDbConfig();
  const status: DbStatus = {
    connected: isPostgresReady,
    engine: isPostgresReady ? 'postgresql' : 'fallback_json',
    host: (cfg as any).host || '127.0.0.1',
    port: (cfg as any).port || 5432,
    database: (cfg as any).database || 'nettopology_db',
    user: (cfg as any).user || 'nettopology_user',
    lastChecked: new Date().toISOString(),
    error: lastError,
  };

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      const tablesRes = await client.query(`
        SELECT count(*) as count FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      const usersRes = await client.query('SELECT count(*) as count FROM users');
      const devicesRes = await client.query('SELECT count(*) as count FROM devices');
      const mapsRes = await client.query('SELECT count(*) as count FROM custom_maps');
      client.release();

      status.tablesCount = parseInt(tablesRes.rows[0]?.count || '0', 10);
      status.usersCount = parseInt(usersRes.rows[0]?.count || '0', 10);
      status.devicesCount = parseInt(devicesRes.rows[0]?.count || '0', 10);
      status.customMapsCount = parseInt(mapsRes.rows[0]?.count || '0', 10);
    } catch (e: any) {
      status.connected = false;
      status.error = e.message;
    }
  } else {
    const store = loadFallbackStore();
    status.tablesCount = 11;
    status.usersCount = store.users.length;
    status.devicesCount = (store.devices || []).length;
    status.customMapsCount = store.custom_maps.length;
  }

  return status;
}

// -------------------------------------------------------------
// Users CRUD
// -------------------------------------------------------------
export async function findUserByUsername(username: string): Promise<any | null> {
  const cleanUser = (username || '').trim().toLowerCase();
  if (!cleanUser) return null;

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = $1 LIMIT 1', [cleanUser]);
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.error('[DB Query Error in findUserByUsername]', e);
    }
  }

  const store = loadFallbackStore();
  return (
    store.users.find(
      (u) => u && typeof u.username === 'string' && u.username.toLowerCase() === cleanUser
    ) || null
  );
}

export async function findUserById(id: string): Promise<any | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [cleanId]);
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.error('[DB Query Error in findUserById]', e);
    }
  }

  const store = loadFallbackStore();
  return (
    store.users.find(
      (u) => u && typeof u.id === 'string' && u.id === cleanId
    ) || null
  );
}

export async function getAllUsers(): Promise<any[]> {
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT id, username, full_name, email, role, user_type, status, group_ids, is_builtin, last_login, created_at FROM users ORDER BY created_at ASC');
      if (res.rows.length > 0) {
        return res.rows.map((r) => ({
          id: r.id,
          username: r.username,
          fullName: r.full_name,
          email: r.email,
          role: r.role,
          userType: r.user_type,
          status: r.status,
          groupIds: typeof r.group_ids === 'string' ? JSON.parse(r.group_ids) : r.group_ids,
          isBuiltin: r.is_builtin,
          lastLogin: r.last_login,
          createdAt: r.created_at,
        }));
      } else {
        // If PostgreSQL is connected but users table is empty, auto-sync from fallback store!
        const client = await pool.connect();
        try {
          const store = loadFallbackStore();
          await syncFallbackToPostgres(client, store);
          const secondRes = await client.query('SELECT id, username, full_name, email, role, user_type, status, group_ids, is_builtin, last_login, created_at FROM users ORDER BY created_at ASC');
          if (secondRes.rows.length > 0) {
            return secondRes.rows.map((r) => ({
              id: r.id,
              username: r.username,
              fullName: r.full_name,
              email: r.email,
              role: r.role,
              userType: r.user_type,
              status: r.status,
              groupIds: typeof r.group_ids === 'string' ? JSON.parse(r.group_ids) : r.group_ids,
              isBuiltin: r.is_builtin,
              lastLogin: r.last_login,
              createdAt: r.created_at,
            }));
          }
        } finally {
          client.release();
        }
      }
    } catch (e) {
      console.error('[DB Query Error in getAllUsers]', e);
    }
  }

  const store = loadFallbackStore();
  return store.users
    .filter((u) => u && typeof u.username === 'string' && u.username.trim().length > 0)
    .map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      userType: u.user_type,
      status: u.status,
      groupIds: u.group_ids || [],
      isBuiltin: u.is_builtin,
      lastLogin: u.last_login,
      createdAt: u.created_at,
    }));
}

export async function saveUser(userData: any): Promise<any> {
  if (!userData || typeof userData !== 'object') {
    throw new Error('Invalid user payload: Expected an object');
  }

  const rawUsername = (userData.username || '').trim();
  if (!rawUsername) {
    throw new Error('Username is required and cannot be empty');
  }

  const store = loadFallbackStore();
  const cleanUser = rawUsername.toLowerCase();
  const existingIndex = store.users.findIndex(
    (u) =>
      u &&
      typeof u.username === 'string' &&
      ((userData.id && u.id === userData.id) || u.username.toLowerCase() === cleanUser)
  );

  let userRecord: any;
  if (existingIndex >= 0) {
    const prev = store.users[existingIndex];
    let pwdHash = prev.password_hash;
    let pwdSalt = prev.password_salt;
    if (userData.password && String(userData.password).trim().length > 0) {
      const p = hashPassword(String(userData.password).trim());
      pwdHash = p.hash;
      pwdSalt = p.salt;
    }
    userRecord = {
      ...prev,
      username: rawUsername,
      password_hash: pwdHash,
      password_salt: pwdSalt,
      full_name: (userData.fullName || prev.full_name || rawUsername).trim(),
      email: (userData.email || prev.email || `${cleanUser}@nettopology.internal`).trim(),
      role: userData.role || prev.role || 'NOC Analyst',
      user_type: userData.userType || prev.user_type || 'local',
      status: userData.status || prev.status || 'active',
      group_ids: Array.isArray(userData.groupIds) ? userData.groupIds : (prev.group_ids || []),
      is_builtin: prev.is_builtin ?? Boolean(userData.isBuiltin),
      updated_at: new Date().toISOString(),
    };
  } else {
    // New user creation
    const plainPassword =
      userData.password && String(userData.password).trim().length > 0
        ? String(userData.password).trim()
        : 'welcome123';
    const p = hashPassword(plainPassword);
    userRecord = {
      id: userData.id || `user-${Date.now()}`,
      username: rawUsername,
      password_hash: p.hash,
      password_salt: p.salt,
      full_name: (userData.fullName || rawUsername).trim(),
      email: (userData.email || `${cleanUser}@nettopology.internal`).trim(),
      role: userData.role || 'NOC Analyst',
      user_type: userData.userType || 'local',
      status: userData.status || 'active',
      group_ids: Array.isArray(userData.groupIds) ? userData.groupIds : [],
      is_builtin: Boolean(userData.isBuiltin),
      last_login: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Update fallback store immediately
  if (existingIndex >= 0) {
    store.users[existingIndex] = { ...store.users[existingIndex], ...userRecord };
  } else {
    store.users.push(userRecord);
  }
  saveFallbackStore(store);

  // Persist to PostgreSQL with robust UPSERT
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const checkRes = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR id = $2 LIMIT 1',
        [userRecord.username, userRecord.id]
      );

      if (checkRes.rows.length > 0) {
        const matchedId = checkRes.rows[0].id;
        userRecord.id = matchedId;
        await pool.query(
          `UPDATE users SET
             username = $1,
             password_hash = COALESCE($2, password_hash),
             password_salt = COALESCE($3, password_salt),
             full_name = $4,
             email = $5,
             role = $6,
             user_type = $7,
             status = $8,
             group_ids = $9,
             is_builtin = $10,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $11`,
          [
            userRecord.username,
            userRecord.password_hash,
            userRecord.password_salt,
            userRecord.full_name,
            userRecord.email,
            userRecord.role,
            userRecord.user_type,
            userRecord.status,
            JSON.stringify(userRecord.group_ids),
            userRecord.is_builtin,
            matchedId,
          ]
        );
        console.log(`[Database] Successfully updated user "${userRecord.username}" (ID: ${matchedId}) in PostgreSQL.`);
      } else {
        await pool.query(
          `INSERT INTO users (id, username, password_hash, password_salt, full_name, email, role, user_type, status, group_ids, is_builtin, last_login, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             username = EXCLUDED.username,
             password_hash = EXCLUDED.password_hash,
             password_salt = EXCLUDED.password_salt,
             full_name = EXCLUDED.full_name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             user_type = EXCLUDED.user_type,
             status = EXCLUDED.status,
             group_ids = EXCLUDED.group_ids,
             updated_at = EXCLUDED.updated_at`,
          [
            userRecord.id,
            userRecord.username,
            userRecord.password_hash,
            userRecord.password_salt,
            userRecord.full_name,
            userRecord.email,
            userRecord.role,
            userRecord.user_type,
            userRecord.status,
            JSON.stringify(userRecord.group_ids),
            userRecord.is_builtin,
            userRecord.last_login,
            userRecord.created_at,
            userRecord.updated_at,
          ]
        );
        console.log(`[Database] Successfully created new user "${userRecord.username}" in PostgreSQL users table.`);
      }
    } catch (e) {
      console.error('[DB Query Error in saveUser]', e);
    }
  }

  return {
    id: userRecord.id,
    username: userRecord.username,
    fullName: userRecord.full_name,
    email: userRecord.email,
    role: userRecord.role,
    userType: userRecord.user_type,
    status: userRecord.status,
    groupIds: userRecord.group_ids,
    isBuiltin: userRecord.is_builtin,
    lastLogin: userRecord.last_login,
    createdAt: userRecord.created_at,
    updatedAt: userRecord.updated_at,
  };
}

export async function saveUsersBatch(usersList: any[]): Promise<any[]> {
  if (!Array.isArray(usersList)) return [];
  const results: any[] = [];
  for (const item of usersList) {
    if (!item || typeof item !== 'object' || !item.username) continue;
    try {
      const saved = await saveUser(item);
      results.push(saved);
    } catch (err) {
      console.error('[DB saveUsersBatch item error]', err);
    }
  }
  return results;
}

export async function deleteUser(userIdOrUsername: string): Promise<boolean> {
  const target = (userIdOrUsername || '').trim().toLowerCase();
  if (!target || target === 'user-admin' || target === 'admin') {
    return false; // Root administrator cannot be deleted
  }

  const store = loadFallbackStore();
  const index = store.users.findIndex(
    (u) =>
      u &&
      typeof u.username === 'string' &&
      (u.id.toLowerCase() === target || u.username.toLowerCase() === target)
  );

  let deleted = false;
  if (index >= 0) {
    const deletedUser = store.users[index];
    if (deletedUser.is_builtin || deletedUser.username.toLowerCase() === 'admin') {
      return false;
    }
    store.users.splice(index, 1);
    saveFallbackStore(store);
    deleted = true;
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM users WHERE LOWER(id) = $1 OR LOWER(username) = $1', [target]);
      console.log(`[Database] Successfully deleted user "${target}" from PostgreSQL.`);
      deleted = true;
    } catch (e) {
      console.error('[DB Query Error in deleteUser]', e);
    }
  }

  return deleted;
}

export async function updateLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('UPDATE users SET last_login = $1 WHERE id = $2', [now, userId]);
    } catch (e) {
      console.error('[DB Query Error in updateLastLogin]', e);
    }
  }
  const store = loadFallbackStore();
  const user = store.users.find((u) => u.id === userId);
  if (user) {
    user.last_login = now;
    saveFallbackStore(store);
  }
}

// -------------------------------------------------------------
// Custom Maps with Granular Access Control (Public, Private, Restricted)
// -------------------------------------------------------------
export interface MapUserFilter {
  userId?: string;
  username?: string;
  role?: string;
}

export async function getCustomMaps(userFilter?: MapUserFilter): Promise<any[]> {
  let allMaps: any[] = [];
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM custom_maps ORDER BY created_at ASC');
      if (res.rows.length === 0) {
        // If connected but table is empty, auto-sync from fallback store
        const client = await pool.connect();
        try {
          const store = loadFallbackStore();
          await syncFallbackToPostgres(client, store);
          const secondRes = await client.query('SELECT * FROM custom_maps ORDER BY created_at ASC');
          res.rows = secondRes.rows;
        } finally {
          client.release();
        }
      }

      allMaps = res.rows.map((r) => {
        const rawMapData = typeof r.map_data === 'string' ? JSON.parse(r.map_data) : (r.map_data || {});
        const allowedUsers = Array.isArray(r.allowed_users)
          ? r.allowed_users
          : (typeof r.allowed_users === 'string' ? JSON.parse(r.allowed_users) : (rawMapData.allowedUsers || []));

        return {
          devicePositions: rawMapData.devicePositions || (typeof r.nodes === 'string' ? JSON.parse(r.nodes) : r.nodes) || {},
          physicalPositions: rawMapData.physicalPositions || {},
          deviceIds: rawMapData.deviceIds || [],
          links: rawMapData.links || (typeof r.connections === 'string' ? JSON.parse(r.connections) : r.connections) || [],
          racks: rawMapData.racks || [],
          towers: rawMapData.towers || [],
          stickyNotes: rawMapData.stickyNotes || [],
          deviceDisplayModes: rawMapData.deviceDisplayModes || {},
          ...rawMapData,
          id: r.id,
          name: r.name,
          description: r.description,
          type: r.map_type || rawMapData.type || 'schematic',
          createdAt: r.created_at ? new Date(r.created_at).toISOString() : (rawMapData.createdAt || new Date().toISOString()),
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : (rawMapData.updatedAt || new Date().toISOString()),
          visibility: r.visibility || rawMapData.visibility || 'public',
          ownerId: r.owner_id || rawMapData.ownerId || 'user-admin',
          ownerName: r.owner_name || rawMapData.ownerName || 'admin',
          allowedUsers,
        };
      });
    } catch (e) {
      console.error('[DB Query Error in getCustomMaps]', e);
      allMaps = loadFallbackStore().custom_maps || [];
    }
  } else {
    allMaps = loadFallbackStore().custom_maps || [];
  }

  // Synchronize sticky notes from device_sticky_notes table into custom maps
  try {
    const dbNotes = await getDeviceStickyNotes();
    if (Array.isArray(dbNotes) && dbNotes.length > 0) {
      const notesByDev = new Map<string, any>();
      for (const dn of dbNotes) {
        if (dn.linkedDeviceId) {
          notesByDev.set(dn.linkedDeviceId, dn);
          notesByDev.set(dn.linkedDeviceId.replace(/^hw-/, ''), dn);
          notesByDev.set('hw-' + dn.linkedDeviceId.replace(/^hw-/, ''), dn);
        }
        if (dn.id) notesByDev.set(dn.id, dn);
      }

      for (const m of allMaps) {
        const currentNotes = Array.isArray(m.stickyNotes) ? m.stickyNotes : [];
        const existingNoteIds = new Set<string>();

        const mergedNotes = currentNotes.map((sn: any) => {
          const match =
            (sn.linkedDeviceId && notesByDev.get(sn.linkedDeviceId)) ||
            notesByDev.get(sn.id);
          if (match) {
            existingNoteIds.add(match.id);
            if (match.linkedDeviceId) existingNoteIds.add(match.linkedDeviceId);
            return {
              ...sn,
              id: match.id || sn.id,
              title: match.title,
              content: match.content,
              color: match.color || sn.color,
              updatedAt: match.updatedAt || sn.updatedAt,
            };
          }
          return sn;
        });

        // If map contains a device that has a sticky note in DB, ensure it is attached
        const devIds: string[] = Array.isArray(m.deviceIds) ? m.deviceIds : Object.keys(m.devicePositions || {});
        for (const dId of devIds) {
          const match = notesByDev.get(dId);
          if (match && !existingNoteIds.has(match.id) && !existingNoteIds.has(dId)) {
            const devPos = m.devicePositions?.[dId] || { x: 200, y: 150 };
            mergedNotes.push({
              ...match,
              x: (devPos.x || 200) + 80,
              y: (devPos.y || 150) + 40,
            });
            existingNoteIds.add(match.id);
            existingNoteIds.add(dId);
          }
        }

        m.stickyNotes = mergedNotes;
      }
    }
  } catch (syncErr) {
    console.warn('[Custom Maps Note Sync Notice]', syncErr);
  }

  // If no user filter supplied, return all maps
  if (!userFilter || !userFilter.username) {
    return allMaps;
  }

  const currentRole = (userFilter.role || '').toLowerCase();
  const currentUsername = (userFilter.username || '').toLowerCase();
  const currentUserId = userFilter.userId || '';

  // Super Admin can view all maps
  if (currentRole.includes('super admin') || currentRole.includes('admin') || currentUsername === 'admin') {
    return allMaps;
  }

  // Filter based on map privacy
  return allMaps.filter((map) => {
    const visibility = map.visibility || 'public';
    // 1. Public map: visible to all authenticated users
    if (visibility === 'public') {
      return true;
    }

    // 2. Private map: visible only to creator/owner
    const isOwner =
      (currentUserId && map.ownerId === currentUserId) ||
      (currentUsername && (map.ownerName || '').toLowerCase() === currentUsername);
    if (visibility === 'private') {
      return isOwner;
    }

    // 3. Restricted map: visible to owner + specified users
    if (visibility === 'restricted') {
      if (isOwner) return true;
      const allowed = Array.isArray(map.allowedUsers) ? map.allowedUsers : [];
      return allowed.some(
        (u: string) =>
          u.toLowerCase() === currentUsername || (currentUserId && u === currentUserId)
      );
    }

    return true;
  });
}

export async function saveCustomMaps(maps: any[], currentUser?: any): Promise<void> {
  // Normalize each map with required fields
  const normalizedMaps = maps.map((m) => {
    const ownerId = m.ownerId || (currentUser?.userId ? currentUser.userId : 'user-admin');
    const ownerName = m.ownerName || (currentUser?.username ? currentUser.username : 'admin');
    const visibility = m.visibility || 'public';
    const allowedUsers = Array.isArray(m.allowedUsers) ? m.allowedUsers : [];

    return {
      ...m,
      ownerId,
      ownerName,
      visibility,
      allowedUsers,
      updatedAt: new Date().toISOString(),
    };
  });

  const store = loadFallbackStore();
  store.custom_maps = normalizedMaps;
  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const m of normalizedMaps) {
        await client.query(
          `INSERT INTO custom_maps (
             id, name, description, map_type, building_id, floor_id, unit_id, rack_id,
             nodes, connections, viewport, metadata, visibility, owner_id, owner_name, allowed_users, map_data, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             map_type = EXCLUDED.map_type,
             building_id = EXCLUDED.building_id,
             floor_id = EXCLUDED.floor_id,
             unit_id = EXCLUDED.unit_id,
             rack_id = EXCLUDED.rack_id,
             nodes = EXCLUDED.nodes,
             connections = EXCLUDED.connections,
             viewport = EXCLUDED.viewport,
             metadata = EXCLUDED.metadata,
             visibility = EXCLUDED.visibility,
             owner_id = EXCLUDED.owner_id,
             owner_name = EXCLUDED.owner_name,
             allowed_users = EXCLUDED.allowed_users,
             map_data = EXCLUDED.map_data,
             updated_at = EXCLUDED.updated_at`,
          [
            m.id,
            m.name || 'Untitled Map',
            m.description || '',
            m.type || m.map_type || 'schematic',
            m.buildingId || m.building_id || null,
            m.floorId || m.floor_id || null,
            m.unitId || m.unit_id || null,
            m.rackId || m.rack_id || null,
            JSON.stringify(m.devicePositions || m.nodes || {}),
            JSON.stringify(m.links || m.connections || []),
            JSON.stringify(m.viewport || { zoom: 1, pan: { x: 0, y: 0 } }),
            JSON.stringify(m.metadata || {}),
            m.visibility || 'public',
            m.ownerId || m.owner_id || 'user-admin',
            m.ownerName || m.owner_name || 'admin',
            JSON.stringify(m.allowedUsers || m.allowed_users || []),
            JSON.stringify(m),
            m.createdAt || m.created_at ? new Date(m.createdAt || m.created_at) : new Date(),
            new Date(),
          ]
        );
      }
      await client.query('COMMIT');
      console.log(`[Database] Successfully persisted ${normalizedMaps.length} custom maps to PostgreSQL.`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[DB Query Error in saveCustomMaps]', e);
    } finally {
      client.release();
    }
  }
}

export async function deleteCustomMap(mapId: string): Promise<boolean> {
  if (!mapId) return false;
  const store = loadFallbackStore();
  let deleted = false;
  const idx = (store.custom_maps || []).findIndex((m) => m.id === mapId);
  if (idx >= 0) {
    store.custom_maps.splice(idx, 1);
    saveFallbackStore(store);
    deleted = true;
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM custom_maps WHERE id = $1', [mapId]);
      console.log(`[Database] Successfully deleted custom map "${mapId}" from PostgreSQL.`);
      deleted = true;
    } catch (e) {
      console.error('[DB Query Error in deleteCustomMap]', e);
    }
  }
  return deleted;
}

// -------------------------------------------------------------
// Node Canvas Coordinates (Default & Custom Maps)
// -------------------------------------------------------------
export async function getNodePositions(mapId: string = 'default'): Promise<Record<string, { x: number; y: number }>> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT node_id, x, y FROM node_positions WHERE map_id = $1', [mapId]);
      const mapPos: Record<string, { x: number; y: number }> = {};
      for (const row of res.rows) {
        mapPos[row.node_id] = { x: parseFloat(row.x), y: parseFloat(row.y) };
      }
      if (Object.keys(mapPos).length > 0) {
        return mapPos;
      }
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }

  const store = loadFallbackStore();
  return (store.node_positions && store.node_positions[mapId]) || {};
}

export async function saveNodePositions(
  mapId: string = 'default',
  positions: Record<string, { x: number; y: number }>
): Promise<void> {
  const store = loadFallbackStore();
  if (!store.node_positions) store.node_positions = {};
  store.node_positions[mapId] = { ...(store.node_positions[mapId] || {}), ...positions };
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      for (const [nodeId, coords] of Object.entries(positions)) {
        await client.query(
          `INSERT INTO node_positions (map_id, node_id, x, y)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (map_id, node_id) DO UPDATE SET
             x = EXCLUDED.x,
             y = EXCLUDED.y`,
          [mapId, nodeId, coords.x, coords.y]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

export async function deleteNodePositions(mapId: string = 'default'): Promise<void> {
  const store = loadFallbackStore();
  if (store.node_positions && store.node_positions[mapId]) {
    delete store.node_positions[mapId];
    saveFallbackStore(store);
  }

  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM node_positions WHERE map_id = $1', [mapId]);
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// Hierarchy Storage (Buildings, Floors, Units, Racks)
// -------------------------------------------------------------
export async function getHierarchy(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM topology_hierarchy ORDER BY created_at ASC');
      return res.rows.map((r) => ({
        id: r.id,
        type: r.type,
        parentId: r.parent_id,
        name: r.name,
        description: r.description,
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      }));
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  return loadFallbackStore().topology_hierarchy;
}

export async function saveHierarchy(items: any[]): Promise<void> {
  const store = loadFallbackStore();
  store.topology_hierarchy = items;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM topology_hierarchy');
      for (const item of items) {
        await client.query(
          `INSERT INTO topology_hierarchy (id, type, parent_id, name, description, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            item.id,
            item.type,
            item.parentId || item.parent_id || null,
            item.name,
            item.description || '',
            JSON.stringify(item.metadata || {}),
          ]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// User Groups
// -------------------------------------------------------------
export async function getUserGroups(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM user_groups ORDER BY created_at ASC');
      return res.rows.map((r) => {
        const rawMembers = typeof r.member_user_ids === 'string'
          ? JSON.parse(r.member_user_ids || '[]')
          : (r.member_user_ids || []);
        return {
          id: r.id,
          name: r.name,
          description: r.description || '',
          color: r.color || 'indigo',
          memberUserIds: rawMembers,
          member_user_ids: rawMembers,
          isBuiltin: Boolean(r.is_builtin),
          createdAt: r.created_at,
          updatedAt: r.updated_at || r.created_at,
        };
      });
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  const fallback = loadFallbackStore().user_groups || [];
  return fallback.map((r: any) => {
    const rawMembers = Array.isArray(r.memberUserIds)
      ? r.memberUserIds
      : (Array.isArray(r.member_user_ids) ? r.member_user_ids : []);
    return {
      id: r.id,
      name: r.name,
      description: r.description || '',
      color: r.color || 'indigo',
      memberUserIds: rawMembers,
      member_user_ids: rawMembers,
      isBuiltin: Boolean(r.is_builtin || r.isBuiltin),
      createdAt: r.created_at || r.createdAt,
      updatedAt: r.updated_at || r.updatedAt,
    };
  });
}

export async function saveUserGroups(groups: any[]): Promise<void> {
  const normalized = (groups || []).map((g: any) => {
    const rawMembers = Array.isArray(g.memberUserIds)
      ? g.memberUserIds
      : (Array.isArray(g.member_user_ids) ? g.member_user_ids : []);
    return {
      id: g.id,
      name: g.name,
      description: g.description || '',
      color: g.color || 'indigo',
      memberUserIds: rawMembers,
      member_user_ids: rawMembers,
      isBuiltin: Boolean(g.isBuiltin ?? g.is_builtin ?? false),
      createdAt: g.createdAt || g.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const store = loadFallbackStore();
  store.user_groups = normalized;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM user_groups');
      for (const g of normalized) {
        await client.query(
          `INSERT INTO user_groups (id, name, description, color, member_user_ids, is_builtin, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            g.id,
            g.name,
            g.description,
            g.color,
            JSON.stringify(g.memberUserIds),
            g.isBuiltin,
            g.createdAt,
            g.updatedAt,
          ]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// Access Policies (RBAC)
// -------------------------------------------------------------
export async function getAccessPolicies(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM access_policies ORDER BY priority ASC, created_at ASC');
      return res.rows.map((r) => {
        const pData = typeof r.policy_data === 'string' ? JSON.parse(r.policy_data) : (r.policy_data || {});
        const defaultPerms = pData.defaultServerPermissions || (
          r.id === 'policy-super-admin' || (r.priority || 0) >= 100
            ? { terminal: true, file_explorer: true, server_management: true, web_management: true, database_management: true, power_control: true, edit_properties: true, delete_server: true }
            : r.id === 'policy-noc-observer'
            ? { terminal: false, file_explorer: false, server_management: true, web_management: true, database_management: true, power_control: false, edit_properties: false, delete_server: false }
            : { terminal: false, file_explorer: true, server_management: true, web_management: false, database_management: false, power_control: false, edit_properties: false, delete_server: false }
        );
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          priority: r.priority,
          isBuiltin: r.is_builtin,
          ...pData,
          defaultServerPermissions: defaultPerms,
          perServerPermissions: pData.perServerPermissions || {},
        };
      });
    } catch (e) {
      console.error('[DB Query Error in getAccessPolicies]', e);
    }
  }
  const fallback = loadFallbackStore().access_policies || [];
  return fallback.map((p: any) => {
    const pData = p.policy_data && typeof p.policy_data === 'object' ? p.policy_data : {};
    const defaultPerms = p.defaultServerPermissions || pData.defaultServerPermissions || (
      p.id === 'policy-super-admin' || (p.priority || 0) >= 100
        ? { terminal: true, file_explorer: true, server_management: true, web_management: true, database_management: true, power_control: true, edit_properties: true, delete_server: true }
        : p.id === 'policy-noc-observer'
        ? { terminal: false, file_explorer: false, server_management: true, web_management: true, database_management: true, power_control: false, edit_properties: false, delete_server: false }
        : { terminal: false, file_explorer: true, server_management: true, web_management: false, database_management: false, power_control: false, edit_properties: false, delete_server: false }
    );
    return {
      ...p,
      ...pData,
      defaultServerPermissions: defaultPerms,
      perServerPermissions: p.perServerPermissions || pData.perServerPermissions || {},
    };
  });
}

export async function saveAccessPolicies(policies: any[]): Promise<void> {
  const store = loadFallbackStore();
  store.access_policies = policies;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM access_policies');
      for (const p of policies) {
        const { id, name, description, priority, isBuiltin, is_builtin, ...rest } = p;
        await client.query(
          `INSERT INTO access_policies (id, name, description, priority, is_builtin, policy_data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, name, description, priority || 100, isBuiltin ?? is_builtin ?? false, JSON.stringify(rest)]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error in saveAccessPolicies]', e);
    }
  }
}

/**
 * Compute the authentic, database-authoritative effective access policy for a user
 * based on PostgreSQL access_policies, user_groups, and role assignments.
 */
export async function getEffectivePolicyForUser(userOrId: any): Promise<any> {
  let user = userOrId;
  if (typeof userOrId === 'string') {
    user = (await findUserById(userOrId)) || (await findUserByUsername(userOrId));
  }

  if (!user) {
    return {
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
      targetServerIds: [],
      allowedDeviceIds: [],
      allowedServerIds: [],
      canViewDashboard: false,
      canViewTopology: false,
      canViewDevices: false,
      canViewPorts: false,
      canViewScanner: false,
      canViewTemplates: false,
      canViewSettings: false,
      canViewServers: false,
      canViewLogs: false,
      terminalAccess: 'none',
      canToggleAdminStatus: false,
      canChangeVlan: false,
      canEditDescription: false,
      canTogglePortSecurity: false,
      canWriteMemory: false,
      canManageDevices: false,
      canApplyTemplates: false,
      canBatchOperate: false,
      canExportBackup: false,
      canImportBackup: false,
    };
  }

  const cleanUsername = (user.username || '').trim().toLowerCase();
  const userId = (user.id || '').trim();
  const roleName = (user.role || '').trim().toLowerCase();
  const isSuperAdmin = cleanUsername === 'admin' || roleName.includes('super admin') || roleName.includes('administrator');

  // Load policies from PostgreSQL (or fallback store)
  const policies = await getAccessPolicies();
  // Load user groups from PostgreSQL (or fallback store)
  const userGroups = await getUserGroups();

  const matchingPolicies: any[] = [];
  const userGroupIds: string[] = Array.isArray(user.groupIds)
    ? user.groupIds
    : Array.isArray(user.group_ids)
    ? user.group_ids
    : typeof user.group_ids === 'string'
    ? JSON.parse(user.group_ids || '[]')
    : [];

  const userGroupSet = new Set(userGroupIds.map((g) => (g || '').toLowerCase()));

  for (const p of policies) {
    // 1. Direct user match by subjectId
    if (
      (p.subjectType === 'local_user' || p.subjectType === 'ad_user') &&
      p.subjectId &&
      (
        p.subjectId === userId ||
        p.subjectId.toLowerCase() === cleanUsername ||
        cleanUsername.startsWith(p.subjectId.toLowerCase())
      )
    ) {
      matchingPolicies.push(p);
      continue;
    }

    // 2. Direct user group match
    if (p.subjectType === 'local_group' || p.subjectType === 'ad_group') {
      if (p.subjectId && userGroupSet.has(p.subjectId.toLowerCase())) {
        matchingPolicies.push(p);
        continue;
      }

      // Check membership in userGroups
      const matchingGroup = userGroups.find(
        (g: any) =>
          g.id === p.subjectId ||
          (g.name && g.name.toLowerCase() === (p.subjectName || '').toLowerCase())
      );
      if (matchingGroup) {
        const members: string[] = Array.isArray(matchingGroup.memberUserIds)
          ? matchingGroup.memberUserIds
          : Array.isArray(matchingGroup.member_user_ids)
          ? matchingGroup.member_user_ids
          : typeof matchingGroup.member_user_ids === 'string'
          ? JSON.parse(matchingGroup.member_user_ids || '[]')
          : [];
        const lowerMembers = members.map((m) => (m || '').toLowerCase());
        if (lowerMembers.includes(userId.toLowerCase()) || lowerMembers.includes(cleanUsername)) {
          matchingPolicies.push(p);
          continue;
        }
      }
    }

    // 3. Match by user role name if policy subjectName or id matches role
    if (
      roleName &&
      (
        (p.name && p.name.toLowerCase().includes(roleName)) ||
        (p.subjectName && p.subjectName.toLowerCase().includes(roleName)) ||
        (p.id && p.id.toLowerCase().includes(roleName))
      )
    ) {
      matchingPolicies.push(p);
      continue;
    }
  }

  // Helper to calculate database-authoritative allowed device and server IDs
  const enrichWithScope = async (pol: any) => {
    if (!pol) return pol;
    let allowedDeviceIds: string[] | null = null;
    let allowedServerIds: string[] | null = null;

    if (isSuperAdmin || pol.id === 'policy-super-admin' || pol.targetScope === 'all') {
      allowedDeviceIds = null;
      allowedServerIds = null;
    } else if (pol.targetScope === 'groups') {
      const allDeviceGroups = await getDeviceGroups();
      const targetGroupSet = new Set(
        (pol.targetGroupIds || []).map((id: string) => (id || '').trim().toLowerCase())
      );
      const devSet = new Set<string>();
      const srvSet = new Set<string>();

      for (const g of allDeviceGroups) {
        const gid = (g.id || '').trim().toLowerCase();
        const gname = (g.name || '').trim().toLowerCase();
        if (targetGroupSet.has(gid) || targetGroupSet.has(gname)) {
          const dIds: string[] = Array.isArray(g.deviceIds)
            ? g.deviceIds
            : Array.isArray(g.device_ids)
            ? g.device_ids
            : [];
          const sIds: string[] = Array.isArray(g.serverIds)
            ? g.serverIds
            : Array.isArray(g.server_ids)
            ? g.server_ids
            : [];
          dIds.forEach((d) => devSet.add(d));
          sIds.forEach((s) => srvSet.add(s));
        }
      }
      allowedDeviceIds = Array.from(devSet);
      allowedServerIds = Array.from(srvSet);
    } else if (pol.targetScope === 'specific') {
      allowedDeviceIds = Array.isArray(pol.targetDeviceIds) ? pol.targetDeviceIds : [];
      allowedServerIds = Array.isArray(pol.targetServerIds) ? pol.targetServerIds : [];
    } else {
      allowedDeviceIds = [];
      allowedServerIds = [];
    }

    return {
      ...pol,
      allowedDeviceIds,
      allowedServerIds,
    };
  };

  // If specific matching policies found, highest priority wins
  if (matchingPolicies.length > 0) {
    matchingPolicies.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return await enrichWithScope(matchingPolicies[0]);
  }

  // Super Administrator fallback
  if (isSuperAdmin) {
    const adminPolicy = policies.find((p) => p.id === 'policy-super-admin' || p.id === 'policy-full');
    if (adminPolicy) return await enrichWithScope(adminPolicy);
    return await enrichWithScope({
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
      terminalAccess: 'full',
      canToggleAdminStatus: true,
      canChangeVlan: true,
      canEditDescription: true,
      canTogglePortSecurity: true,
      canWriteMemory: true,
      canManageDevices: true,
      canApplyTemplates: true,
      canBatchOperate: true,
      canExportBackup: true,
      canImportBackup: true,
      defaultServerPermissions: {
        terminal: true,
        file_explorer: true,
        server_management: true,
        web_management: true,
        database_management: true,
        power_control: true,
        edit_properties: true,
        delete_server: true,
      },
      perServerPermissions: {},
    });
  }

  // Check if role is Helpdesk or Operator
  if (roleName.includes('helpdesk')) {
    const hdPolicy = policies.find((p) => p.id === 'policy-helpdesk');
    if (hdPolicy) return await enrichWithScope(hdPolicy);
  }
  if (roleName.includes('noc') || roleName.includes('operator') || roleName.includes('monitoring')) {
    const nocPolicy = policies.find((p) => p.id === 'policy-noc-observer');
    if (nocPolicy) return await enrichWithScope(nocPolicy);
  }

  // Default non-admin restricted fallback
  return await enrichWithScope({
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
    targetServerIds: [],
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: false,
    canViewScanner: false,
    canViewTemplates: false,
    canViewSettings: false,
    canViewServers: false,
    canViewLogs: false,
    terminalAccess: 'none',
    canToggleAdminStatus: false,
    canChangeVlan: false,
    canEditDescription: false,
    canTogglePortSecurity: false,
    canWriteMemory: false,
    canManageDevices: false,
    canApplyTemplates: false,
    canBatchOperate: false,
    canExportBackup: false,
    canImportBackup: false,
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
    perServerPermissions: {},
  });
}

/**
 * Universally evaluates whether a specific server action is permitted
 * under a database-authoritative AccessPolicy for a given server.
 */
export function isServerActionPermitted(
  policy: any | null | undefined,
  serverId: string,
  action: string
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

  return true;
}

// -------------------------------------------------------------
// Database Devices (PostgreSQL-Authoritative Equipment Catalog)
// -------------------------------------------------------------
export async function getAllDevices(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM devices ORDER BY name ASC');
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r) => {
          let ports = [];
          try {
            ports = typeof r.ports === 'string' ? JSON.parse(r.ports) : (r.ports || []);
          } catch {}
          return {
            id: r.id,
            name: r.name,
            ip: r.ip,
            type: r.type || 'switch',
            model: r.model || '',
            platform: r.platform || 'cisco_ios_xe',
            role: r.role || '',
            connection_mode: r.connection_mode || 'simulator',
            ssh_host: r.ssh_host || r.ip,
            ssh_port: r.ssh_port || 22,
            ssh_username: r.ssh_username || 'admin',
            is_online: r.is_online !== undefined ? Boolean(r.is_online) : true,
            latency_ms: Number(r.latency_ms) || 1.5,
            mac: r.mac_address || '',
            mac_address: r.mac_address || '',
            uptime: r.uptime_str || '',
            uptime_str: r.uptime_str || '',
            ports,
          };
        });
      }
    } catch (e) {
      console.error('[DB Query Error in getAllDevices]', e);
    }
  }

  const store = loadFallbackStore();
  if (Array.isArray(store.devices) && store.devices.length > 0) {
    return store.devices;
  }
  return loadInitialDevices();
}

export async function getDeviceById(id: string): Promise<any | null> {
  const all = await getAllDevices();
  return all.find((d) => d.id === id || d.name === id) || null;
}

// -------------------------------------------------------------
// Device Groups
// -------------------------------------------------------------
export async function getDeviceGroups(): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM device_groups ORDER BY created_at ASC');
      return res.rows.map((r) => {
        const devIds = typeof r.device_ids === 'string' ? JSON.parse(r.device_ids) : (r.device_ids || []);
        const srvIds = typeof r.server_ids === 'string' ? JSON.parse(r.server_ids) : (r.server_ids || []);
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          color: r.color,
          icon: r.icon,
          deviceIds: devIds,
          device_ids: devIds,
          serverIds: srvIds,
          server_ids: srvIds,
          tags: Array.isArray(r.tags) ? r.tags : (typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : []),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });
    } catch (e) {
      console.error('[DB Query Error in getDeviceGroups]', e);
    }
  }
  return (loadFallbackStore().device_groups || []).map((g: any) => {
    const devIds = g.deviceIds || g.device_ids || [];
    const srvIds = g.serverIds || g.server_ids || [];
    return {
      ...g,
      deviceIds: devIds,
      device_ids: devIds,
      serverIds: srvIds,
      server_ids: srvIds,
      tags: Array.isArray(g.tags) ? g.tags : [],
    };
  });
}

export async function saveDeviceGroups(groups: any[]): Promise<void> {
  const normalized = (groups || []).map((g: any) => {
    const devIds = g.deviceIds || g.device_ids || [];
    const srvIds = g.serverIds || g.server_ids || [];
    return {
      id: g.id,
      name: g.name,
      description: g.description || '',
      color: g.color || 'indigo',
      icon: g.icon || 'FolderTree',
      deviceIds: devIds,
      device_ids: devIds,
      serverIds: srvIds,
      server_ids: srvIds,
      tags: Array.isArray(g.tags) ? g.tags : [],
      createdAt: g.createdAt || g.created_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  const store = loadFallbackStore();
  store.device_groups = normalized;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query('DELETE FROM device_groups');
      for (const g of normalized) {
        await client.query(
          `INSERT INTO device_groups (id, name, description, color, icon, device_ids, server_ids, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            g.id,
            g.name,
            g.description,
            g.color,
            g.icon,
            JSON.stringify(g.deviceIds),
            JSON.stringify(g.serverIds),
            g.createdAt,
            g.updatedAt,
          ]
        );
      }
      await client.query('COMMIT');
      client.release();
    } catch (e) {
      console.error('[DB Query Error in saveDeviceGroups]', e);
    }
  }
}

// -------------------------------------------------------------
// Active Directory Config
// -------------------------------------------------------------
export async function getActiveDirectoryConfig(): Promise<any> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query("SELECT config_data FROM ad_config WHERE id = 'primary' LIMIT 1");
      if (res.rows.length > 0) {
        const raw = res.rows[0].config_data;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  return loadFallbackStore().ad_config || DEFAULT_AD_CONFIG;
}

export async function saveActiveDirectoryConfig(config: any): Promise<void> {
  const store = loadFallbackStore();
  store.ad_config = config;
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO ad_config (id, config_data, updated_at)
         VALUES ('primary', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           config_data = EXCLUDED.config_data,
           updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(config)]
      );
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// Audit Logs Storage
// -------------------------------------------------------------
export async function getAuditLogs(limit: number = 100): Promise<any[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1', [limit]);
      return res.rows;
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
  const store = loadFallbackStore();
  return store.audit_logs.slice(-limit).reverse();
}

export async function addAuditLog(log: any): Promise<void> {
  const record = {
    id: log.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: log.timestamp || new Date().toISOString(),
    user_name: log.userName || log.user_name || 'System',
    action: log.action || 'Event',
    category: log.category || 'general',
    target: log.target || '',
    status: log.status || 'info',
    details: typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || ''),
    ip_address: log.ipAddress || log.ip_address || '127.0.0.1',
    user_agent: log.userAgent || log.user_agent || '',
  };

  const store = loadFallbackStore();
  store.audit_logs.push(record);
  if (store.audit_logs.length > 500) {
    store.audit_logs = store.audit_logs.slice(-500);
  }
  saveFallbackStore(store);

  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (id, timestamp, user_name, action, category, target, status, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          record.id,
          record.timestamp,
          record.user_name,
          record.action,
          record.category,
          record.target,
          record.status,
          record.details,
          record.ip_address,
          record.user_agent,
        ]
      );
    } catch (e) {
      console.error('[DB Query Error]', e);
    }
  }
}

// -------------------------------------------------------------
// 12. Device Sticky Notes & Canvas Map Linking
// -------------------------------------------------------------
export async function getDeviceStickyNotes(): Promise<any[]> {
  let pgNotes: any[] = [];
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM device_sticky_notes ORDER BY updated_at DESC');
      pgNotes = res.rows.map((r: any) => ({
        id: r.id,
        linkedDeviceId: r.device_id,
        title: r.title || '',
        content: r.content || '',
        color: r.color || 'yellow',
        x: Number(r.x) || 100,
        y: Number(r.y) || 100,
        width: Number(r.width) || 230,
        viewMode: r.view_mode || 'card',
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      }));
    } catch (e) {
      console.error('[DB Query Error in getDeviceStickyNotes]', e);
    }
  }

  const store = loadFallbackStore();
  const fallbackNotes = Array.isArray(store.device_sticky_notes) ? store.device_sticky_notes : [];

  // Also collect any sticky notes in custom maps that have a linkedDeviceId
  const maps = Array.isArray(store.custom_maps) ? store.custom_maps : [];
  const mapNotes: any[] = [];
  for (const m of maps) {
    if (Array.isArray(m.stickyNotes)) {
      for (const sn of m.stickyNotes) {
        if (sn && sn.linkedDeviceId) {
          mapNotes.push({
            id: sn.id,
            linkedDeviceId: sn.linkedDeviceId,
            title: sn.title || '',
            content: sn.content || '',
            color: sn.color || 'yellow',
            x: Number(sn.x) || 100,
            y: Number(sn.y) || 100,
            width: Number(sn.width) || 230,
            viewMode: sn.viewMode || 'card',
            createdAt: sn.createdAt || new Date().toISOString(),
            updatedAt: sn.updatedAt || new Date().toISOString(),
          });
        }
      }
    }
  }

  // Deduplicate and prioritize most recent
  const noteMap = new Map<string, any>();
  for (const n of mapNotes) {
    if (n && (n.linkedDeviceId || n.id)) {
      noteMap.set(n.linkedDeviceId || n.id, n);
    }
  }
  for (const n of fallbackNotes) {
    if (n && (n.linkedDeviceId || n.id)) {
      noteMap.set(n.linkedDeviceId || n.id, n);
    }
  }
  for (const n of pgNotes) {
    if (n && (n.linkedDeviceId || n.id)) {
      noteMap.set(n.linkedDeviceId || n.id, n);
    }
  }

  return Array.from(noteMap.values());
}

export async function saveDeviceStickyNote(note: any, previousDeviceId?: string): Promise<any> {
  if (!note) throw new Error('Invalid note data');
  const id = note.id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const deviceId = note.linkedDeviceId || note.deviceId;
  if (!deviceId) throw new Error('Device ID is required for device sticky note');

  const cleanDeviceId = deviceId.replace(/^hw-/, '');
  const hwDeviceId = 'hw-' + cleanDeviceId;

  const cleanPrev = previousDeviceId ? previousDeviceId.replace(/^hw-/, '') : undefined;
  const hwPrev = cleanPrev ? 'hw-' + cleanPrev : undefined;

  const normalizedNote = {
    id,
    linkedDeviceId: deviceId,
    title: note.title || '',
    content: note.content || '',
    color: note.color || 'yellow',
    x: Number(note.x) || 100,
    y: Number(note.y) || 100,
    width: Number(note.width) || 230,
    viewMode: note.viewMode || 'card',
    createdAt: note.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const store = loadFallbackStore();
  if (!Array.isArray(store.device_sticky_notes)) {
    store.device_sticky_notes = [];
  }

  // If reassigning from another device, clean up old device record in fallback store
  if (previousDeviceId && previousDeviceId !== deviceId) {
    store.device_sticky_notes = store.device_sticky_notes.filter(
      (n: any) =>
        n &&
        n.linkedDeviceId !== previousDeviceId &&
        n.linkedDeviceId !== cleanPrev &&
        n.linkedDeviceId !== hwPrev
    );
  }

  const existingIdx = store.device_sticky_notes.findIndex(
    (n: any) =>
      n.id === id ||
      n.linkedDeviceId === deviceId ||
      n.linkedDeviceId === cleanDeviceId ||
      n.linkedDeviceId === hwDeviceId
  );
  if (existingIdx >= 0) {
    normalizedNote.id = store.device_sticky_notes[existingIdx].id || normalizedNote.id;
    store.device_sticky_notes[existingIdx] = normalizedNote;
  } else {
    store.device_sticky_notes.push(normalizedNote);
  }

  // Update or attach in custom maps in fallback store
  if (Array.isArray(store.custom_maps)) {
    for (const m of store.custom_maps) {
      if (!Array.isArray(m.stickyNotes)) m.stickyNotes = [];
      const snIdx = m.stickyNotes.findIndex(
        (sn: any) =>
          sn.id === normalizedNote.id ||
          sn.linkedDeviceId === deviceId ||
          sn.linkedDeviceId === cleanDeviceId ||
          sn.linkedDeviceId === hwDeviceId
      );
      if (snIdx >= 0) {
        m.stickyNotes[snIdx] = {
          ...m.stickyNotes[snIdx],
          id: normalizedNote.id,
          title: normalizedNote.title,
          content: normalizedNote.content,
          color: normalizedNote.color,
          linkedDeviceId: normalizedNote.linkedDeviceId,
          updatedAt: normalizedNote.updatedAt,
        };
      } else {
        const hasDevice =
          (Array.isArray(m.deviceIds) &&
            (m.deviceIds.includes(deviceId) || m.deviceIds.includes(cleanDeviceId) || m.deviceIds.includes(hwDeviceId))) ||
          (m.devicePositions &&
            (m.devicePositions[deviceId] || m.devicePositions[cleanDeviceId] || m.devicePositions[hwDeviceId]));

        if (hasDevice) {
          const devPos =
            (m.devicePositions &&
              (m.devicePositions[deviceId] || m.devicePositions[cleanDeviceId] || m.devicePositions[hwDeviceId])) ||
            { x: 200, y: 150 };
          m.stickyNotes.push({
            ...normalizedNote,
            x: (devPos.x || 200) + 80,
            y: (devPos.y || 150) + 40,
          });
        }
      }
    }
  }

  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      // If reassigning from another device, clean up old device record in PostgreSQL
      if (previousDeviceId && previousDeviceId !== deviceId) {
        await pool.query(
          'DELETE FROM device_sticky_notes WHERE device_id = $1 OR device_id = $2',
          [previousDeviceId, cleanPrev]
        );
      }

      // Find if this device or id already has a record in device_sticky_notes table
      const existingRes = await pool.query(
        'SELECT id FROM device_sticky_notes WHERE id = $1 OR device_id = $2 OR device_id = $3 LIMIT 1',
        [id, deviceId, cleanDeviceId]
      );
      const targetId = existingRes.rows.length > 0 ? existingRes.rows[0].id : normalizedNote.id;
      normalizedNote.id = targetId;

      await pool.query(
        `INSERT INTO device_sticky_notes (id, device_id, title, content, color, x, y, width, view_mode, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           device_id = EXCLUDED.device_id,
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           color = EXCLUDED.color,
           x = EXCLUDED.x,
           y = EXCLUDED.y,
           width = EXCLUDED.width,
           view_mode = EXCLUDED.view_mode,
           updated_at = EXCLUDED.updated_at`,
        [
          targetId,
          normalizedNote.linkedDeviceId,
          normalizedNote.title,
          normalizedNote.content,
          normalizedNote.color,
          normalizedNote.x,
          normalizedNote.y,
          normalizedNote.width,
          normalizedNote.viewMode,
          normalizedNote.createdAt,
          normalizedNote.updatedAt,
        ]
      );

      // Also synchronize PostgreSQL custom_maps table
      try {
        const mapsRes = await pool.query('SELECT id, map_data FROM custom_maps');
        for (const row of mapsRes.rows) {
          const mapData = typeof row.map_data === 'string' ? JSON.parse(row.map_data) : (row.map_data || {});
          let stickyNotes = Array.isArray(mapData.stickyNotes) ? mapData.stickyNotes : [];
          const snIdx = stickyNotes.findIndex(
            (sn: any) =>
              sn.id === normalizedNote.id ||
              sn.linkedDeviceId === deviceId ||
              sn.linkedDeviceId === cleanDeviceId ||
              sn.linkedDeviceId === hwDeviceId
          );

          let updated = false;
          if (snIdx >= 0) {
            stickyNotes[snIdx] = {
              ...stickyNotes[snIdx],
              id: normalizedNote.id,
              title: normalizedNote.title,
              content: normalizedNote.content,
              color: normalizedNote.color,
              linkedDeviceId: normalizedNote.linkedDeviceId,
              updatedAt: normalizedNote.updatedAt,
            };
            updated = true;
          } else {
            const hasDev =
              (Array.isArray(mapData.deviceIds) &&
                (mapData.deviceIds.includes(deviceId) || mapData.deviceIds.includes(cleanDeviceId) || mapData.deviceIds.includes(hwDeviceId))) ||
              (mapData.devicePositions &&
                (mapData.devicePositions[deviceId] || mapData.devicePositions[cleanDeviceId] || mapData.devicePositions[hwDeviceId]));
            if (hasDev) {
              const devPos =
                (mapData.devicePositions &&
                  (mapData.devicePositions[deviceId] || mapData.devicePositions[cleanDeviceId] || mapData.devicePositions[hwDeviceId])) ||
                { x: 200, y: 150 };
              stickyNotes.push({
                ...normalizedNote,
                x: (devPos.x || 200) + 80,
                y: (devPos.y || 150) + 40,
              });
              updated = true;
            }
          }

          if (updated) {
            mapData.stickyNotes = stickyNotes;
            mapData.updatedAt = new Date().toISOString();
            await pool.query(
              'UPDATE custom_maps SET map_data = $1, updated_at = NOW() WHERE id = $2',
              [JSON.stringify(mapData), row.id]
            );
          }
        }
      } catch (mapSyncErr) {
        console.warn('[PostgreSQL custom_maps sync warning in saveDeviceStickyNote]', mapSyncErr);
      }
    } catch (e) {
      console.error('[DB Save Error in saveDeviceStickyNote]', e);
    }
  }

  return normalizedNote;
}

export async function deleteDeviceStickyNote(noteId: string, deviceId?: string, keepInMap: boolean = false): Promise<void> {
  const store = loadFallbackStore();
  let effectiveDeviceId = deviceId;

  // If effectiveDeviceId not provided, check fallbackStore and DB for matching note
  if (!effectiveDeviceId && Array.isArray(store.device_sticky_notes)) {
    const found = store.device_sticky_notes.find((n: any) => n.id === noteId);
    if (found?.linkedDeviceId) {
      effectiveDeviceId = found.linkedDeviceId;
    }
  }

  const cleanDeviceId = effectiveDeviceId ? effectiveDeviceId.replace(/^hw-/, '') : undefined;
  const hwDeviceId = cleanDeviceId ? 'hw-' + cleanDeviceId : undefined;

  const matchesTarget = (sn: any) => {
    if (!sn) return false;
    if (noteId && sn.id === noteId) return true;
    if (effectiveDeviceId && (sn.linkedDeviceId === effectiveDeviceId || sn.linkedDeviceId === cleanDeviceId || sn.linkedDeviceId === hwDeviceId)) return true;
    if (noteId && sn.linkedDeviceId === noteId) return true;
    return false;
  };

  if (Array.isArray(store.device_sticky_notes)) {
    store.device_sticky_notes = store.device_sticky_notes.filter((n: any) => !matchesTarget(n));
  }

  if (Array.isArray(store.custom_maps)) {
    for (const m of store.custom_maps) {
      if (Array.isArray(m.stickyNotes)) {
        if (keepInMap) {
          // Only unlink the note from device, retain the sticky note on the canvas
          m.stickyNotes = m.stickyNotes.map((sn: any) => {
            if (matchesTarget(sn)) {
              const updated = { ...sn };
              delete updated.linkedDeviceId;
              delete updated.device_id;
              return updated;
            }
            return sn;
          });
        } else {
          // Permanently remove the sticky note from the map
          m.stickyNotes = m.stickyNotes.filter((sn: any) => !matchesTarget(sn));
        }
      }
    }
  }
  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      if (!effectiveDeviceId) {
        try {
          const lookup = await pool.query('SELECT device_id FROM device_sticky_notes WHERE id = $1 LIMIT 1', [noteId]);
          if (lookup.rows.length > 0 && lookup.rows[0].device_id) {
            effectiveDeviceId = lookup.rows[0].device_id;
          }
        } catch {}
      }

      const cleanDev = effectiveDeviceId ? effectiveDeviceId.replace(/^hw-/, '') : null;
      const hwDev = cleanDev ? 'hw-' + cleanDev : null;

      await pool.query(
        `DELETE FROM device_sticky_notes 
         WHERE id = $1 
            OR device_id = $1 
            OR ($2::text IS NOT NULL AND (device_id = $2 OR device_id = $3 OR device_id = $4))`,
        [noteId, effectiveDeviceId || null, cleanDev || null, hwDev || null]
      );

      // Also synchronize PostgreSQL custom_maps table
      try {
        const mapsRes = await pool.query('SELECT id, map_data FROM custom_maps');
        for (const row of mapsRes.rows) {
          const mapData = typeof row.map_data === 'string' ? JSON.parse(row.map_data) : (row.map_data || {});
          if (Array.isArray(mapData.stickyNotes)) {
            let changed = false;
            if (keepInMap) {
              mapData.stickyNotes = mapData.stickyNotes.map((sn: any) => {
                if (matchesTarget(sn)) {
                  changed = true;
                  const updated = { ...sn };
                  delete updated.linkedDeviceId;
                  delete updated.device_id;
                  return updated;
                }
                return sn;
              });
            } else {
              const origLen = mapData.stickyNotes.length;
              mapData.stickyNotes = mapData.stickyNotes.filter((sn: any) => !matchesTarget(sn));
              if (mapData.stickyNotes.length !== origLen) changed = true;
            }

            if (changed) {
              mapData.updatedAt = new Date().toISOString();
              await pool.query(
                'UPDATE custom_maps SET map_data = $1, updated_at = NOW() WHERE id = $2',
                [JSON.stringify(mapData), row.id]
              );
            }
          }
        }
      } catch (mapErr) {
        console.warn('[PostgreSQL custom_maps cleanup warning in deleteDeviceStickyNote]', mapErr);
      }
    } catch (e) {
      console.error('[DB Delete Error in deleteDeviceStickyNote]', e);
    }
  }
}

// ==========================================
// REMOTE SERVERS FLEET CRUD & TAG OPERATIONS
// ==========================================

function rowToRemoteServer(r: any): RemoteServer {
  return {
    id: r.id,
    name: r.name || r.id,
    hostname: r.hostname || '',
    ip: r.ip || '',
    os_type: (r.os_type || 'linux').toLowerCase() as 'linux' | 'windows',
    os_distro: r.os_distro || (r.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'),
    environment: r.environment || 'Production',
    category: r.category || 'Application Server',
    role: r.role || 'General Server',
    tags: Array.isArray(r.tags) ? r.tags : (typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : []),
    ssh_port: Number(r.ssh_port) || 22,
    ssh_username: r.ssh_username || 'root',
    ssh_password: r.ssh_password || '',
    ssh_key_path: r.ssh_key_path || '',
    default_shell: (r.default_shell || 'bash') as 'bash' | 'zsh' | 'sh',
    win_protocol: (r.win_protocol || 'rdp') as 'rdp' | 'powershell' | 'winrm',
    win_port: Number(r.win_port) || 3389,
    win_username: r.win_username || 'Administrator',
    win_domain: r.win_domain || 'CORP.INTERNAL',
    prompt_password_on_connect: Boolean(r.prompt_password_on_connect),
    installed_web_servers: Array.isArray(r.installed_web_servers)
      ? r.installed_web_servers
      : (typeof r.installed_web_servers === 'string' ? JSON.parse(r.installed_web_servers || '[]') : []),
    installed_databases: Array.isArray(r.installed_databases)
      ? r.installed_databases
      : (typeof r.installed_databases === 'string' ? JSON.parse(r.installed_databases || '[]') : []),
    has_apache: Boolean(r.has_apache ?? (Array.isArray(r.installed_web_servers) ? r.installed_web_servers.includes('apache') : false)),
    has_nginx: Boolean(r.has_nginx ?? (Array.isArray(r.installed_web_servers) ? r.installed_web_servers.includes('nginx') : false)),
    has_postgresql: Boolean(r.has_postgresql ?? (Array.isArray(r.installed_databases) ? r.installed_databases.includes('postgresql') : false)),
    has_mysql: Boolean(r.has_mysql ?? (Array.isArray(r.installed_databases) ? r.installed_databases.includes('mysql') : false)),
    server_type: r.server_type || (r.has_postgresql && !r.has_nginx && !r.has_apache ? 'postgresql' : r.has_mysql && !r.has_nginx && !r.has_apache ? 'mysql' : r.has_nginx && !r.has_apache ? 'nginx' : r.has_apache && !r.has_nginx ? 'apache' : r.os_type || 'linux'),
    web_http_port: r.web_http_port ? Number(r.web_http_port) : 80,
    web_https_port: r.web_https_port ? Number(r.web_https_port) : 443,
    postgres_port: r.postgres_port ? Number(r.postgres_port) : 5432,
    postgres_user: r.postgres_user || 'postgres',
    postgres_password: r.postgres_password || '',
    postgres_password_set: Boolean(r.postgres_password && String(r.postgres_password).trim().length > 0),
    postgres_database: r.postgres_database || 'postgres',
    mysql_port: r.mysql_port ? Number(r.mysql_port) : 3306,
    mysql_user: r.mysql_user || 'root',
    mysql_password: r.mysql_password || '',
    mysql_password_set: Boolean(r.mysql_password && String(r.mysql_password).trim().length > 0),
    mysql_database: r.mysql_database || 'mysql',
    status: (r.status || 'untested') as 'online' | 'offline' | 'unreachable' | 'untested',
    cpu_cores: r.cpu_cores !== undefined && r.cpu_cores !== null && Number(r.cpu_cores) > 0 ? Number(r.cpu_cores) : undefined,
    ram_gb: r.ram_gb !== undefined && r.ram_gb !== null && Number(r.ram_gb) > 0 ? Number(r.ram_gb) : undefined,
    disk_gb: r.disk_gb !== undefined && r.disk_gb !== null && Number(r.disk_gb) > 0 ? Number(r.disk_gb) : undefined,
    uptime_str: r.uptime_str || '',
    location: r.location || 'Datacenter A',
    notes: r.notes || '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * Scrubs sensitive PostgreSQL passwords and credentials before sending server objects to frontend API consumers.
 * Indicates `postgres_password_set: true` so UI knows a password is saved on server.
 */
export function sanitizeRemoteServerForClient(s: RemoteServer): RemoteServer {
  return {
    ...s,
    postgres_password_set: Boolean(
      s.postgres_password_set || (s.postgres_password && String(s.postgres_password).trim().length > 0)
    ),
    postgres_password: '', // Stripped to ensure zero-leak credential confidentiality
    mysql_password_set: Boolean(
      s.mysql_password_set || (s.mysql_password && String(s.mysql_password).trim().length > 0)
    ),
    mysql_password: '', // Stripped to ensure zero-leak credential confidentiality
  };
}

export async function getAllRemoteServers(): Promise<RemoteServer[]> {
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM remote_servers ORDER BY created_at DESC');
      if (res.rows && res.rows.length > 0) {
        const list = res.rows.map(rowToRemoteServer);
        // Keep fallback store synchronized with PostgreSQL
        try {
          const store = loadFallbackStore();
          store.remote_servers = list;
          saveFallbackStore(store);
        } catch {
          // ignore fallback sync error
        }
        return list;
      }
    } catch (e) {
      console.warn('[DB Error getAllRemoteServers, falling back to local store]', e);
    }
  }

  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers) || store.remote_servers.length === 0) {
    store.remote_servers = [...DEFAULT_REMOTE_SERVERS];
    saveFallbackStore(store);
  }
  return store.remote_servers;
}

export async function getRemoteServerById(id: string): Promise<RemoteServer | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM remote_servers WHERE id = $1 OR LOWER(id) = LOWER($1) OR ip = $1 LIMIT 1',
        [cleanId]
      );
      if (res.rows && res.rows.length > 0) {
        const srv = rowToRemoteServer(res.rows[0]);
        // Also ensure fallback store is populated with this server
        try {
          const store = loadFallbackStore();
          if (!Array.isArray(store.remote_servers)) {
            store.remote_servers = [];
          }
          const fIdx = store.remote_servers.findIndex(
            (s) => s.id === srv.id || s.id.toLowerCase() === srv.id.toLowerCase()
          );
          if (fIdx >= 0) {
            store.remote_servers[fIdx] = srv;
          } else {
            store.remote_servers.push(srv);
          }
          saveFallbackStore(store);
        } catch {
          // ignore
        }
        return srv;
      }
    } catch (e) {
      console.warn('[DB Error getRemoteServerById, falling back to local store]', e);
    }
  }

  const store = loadFallbackStore();
  const found = (store.remote_servers || []).find(
    (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || s.ip === cleanId
  );
  if (found) return found;

  const defaultFound = DEFAULT_REMOTE_SERVERS.find(
    (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || s.ip === cleanId
  );
  return defaultFound ? { ...defaultFound } : null;
}

export async function createRemoteServer(data: Partial<RemoteServer>): Promise<RemoteServer> {
  const newServer: RemoteServer = {
    id: data.id || `srv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name?.trim() || 'New Server',
    hostname: data.hostname?.trim() || '',
    ip: data.ip?.trim() || '127.0.0.1',
    os_type: data.os_type || 'linux',
    os_distro: data.os_distro || (data.os_type === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'),
    environment: data.environment || 'Production',
    category: data.category || 'Application Server',
    role: data.role || 'General Server',
    tags: Array.isArray(data.tags) ? data.tags.map((t) => t.trim()).filter(Boolean) : [],
    ssh_port: Number(data.ssh_port) || 22,
    ssh_username: data.ssh_username?.trim() || 'root',
    ssh_password: data.prompt_password_on_connect ? '' : (data.ssh_password || ''),
    ssh_key_path: data.ssh_key_path || '',
    default_shell: data.default_shell || 'bash',
    win_protocol: data.win_protocol || 'rdp',
    win_port: Number(data.win_port) || 3389,
    win_username: data.win_username?.trim() || 'Administrator',
    win_password: data.prompt_password_on_connect ? '' : (data.win_password || ''),
    win_domain: data.win_domain?.trim() || 'CORP.INTERNAL',
    vnc_port: Number(data.vnc_port) || 5900,
    vnc_username: data.vnc_username?.trim() || '',
    vnc_password: data.prompt_password_on_connect ? '' : (data.vnc_password || ''),
    prompt_password_on_connect: Boolean(data.prompt_password_on_connect),
    installed_web_servers: Array.isArray(data.installed_web_servers) ? data.installed_web_servers : (
      [
        ...(data.has_apache ? ['apache'] : []),
        ...(data.has_nginx ? ['nginx'] : [])
      ]
    ),
    installed_databases: Array.isArray(data.installed_databases) ? data.installed_databases : (
      [
        ...(data.has_postgresql ? ['postgresql'] : []),
        ...(data.has_mysql ? ['mysql'] : [])
      ]
    ),
    has_apache: Boolean(data.has_apache ?? (Array.isArray(data.installed_web_servers) ? data.installed_web_servers.includes('apache') : false)),
    has_nginx: Boolean(data.has_nginx ?? (Array.isArray(data.installed_web_servers) ? data.installed_web_servers.includes('nginx') : false)),
    has_postgresql: Boolean(data.has_postgresql ?? (Array.isArray(data.installed_databases) ? data.installed_databases.includes('postgresql') : false)),
    has_mysql: Boolean(data.has_mysql ?? (Array.isArray(data.installed_databases) ? data.installed_databases.includes('mysql') : false)),
    server_type: data.server_type || (data.has_postgresql && !data.has_nginx && !data.has_apache ? 'postgresql' : data.has_mysql && !data.has_nginx && !data.has_apache ? 'mysql' : data.has_nginx && !data.has_apache ? 'nginx' : data.has_apache && !data.has_nginx ? 'apache' : data.os_type || 'linux'),
    web_http_port: data.web_http_port ? Number(data.web_http_port) : 80,
    web_https_port: data.web_https_port ? Number(data.web_https_port) : 443,
    postgres_port: data.postgres_port ? Number(data.postgres_port) : 5432,
    postgres_user: data.postgres_user?.trim() || 'postgres',
    postgres_password: data.postgres_password ? encryptServerSecret(data.postgres_password.trim()) : '',
    postgres_password_set: Boolean(data.postgres_password && data.postgres_password.trim().length > 0),
    postgres_database: data.postgres_database?.trim() || 'postgres',
    mysql_port: data.mysql_port ? Number(data.mysql_port) : 3306,
    mysql_user: data.mysql_user?.trim() || 'root',
    mysql_password: data.mysql_password ? encryptServerSecret(data.mysql_password.trim()) : '',
    mysql_password_set: Boolean(data.mysql_password && data.mysql_password.trim().length > 0),
    mysql_database: data.mysql_database?.trim() || 'mysql',
    status: data.status || 'untested',
    cpu_cores: data.cpu_cores !== undefined && data.cpu_cores !== null && Number(data.cpu_cores) > 0 ? Number(data.cpu_cores) : undefined,
    ram_gb: data.ram_gb !== undefined && data.ram_gb !== null && Number(data.ram_gb) > 0 ? Number(data.ram_gb) : undefined,
    disk_gb: data.disk_gb !== undefined && data.disk_gb !== null && Number(data.disk_gb) > 0 ? Number(data.disk_gb) : undefined,
    uptime_str: data.uptime_str || '',
    location: data.location?.trim() || 'Datacenter A',
    notes: data.notes?.trim() || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Always update JSON fallback store
  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
  }
  store.remote_servers.push(newServer);
  saveFallbackStore(store);

  // PostgreSQL write
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO remote_servers (
          id, name, hostname, ip, os_type, os_distro, environment, category, role, tags,
          ssh_port, ssh_username, ssh_password, ssh_key_path, default_shell,
          win_protocol, win_port, win_username, win_domain,
          status, cpu_cores, ram_gb, disk_gb, uptime_str, location, notes,
          prompt_password_on_connect,
          installed_web_servers, installed_databases, has_apache, has_nginx, has_postgresql, has_mysql,
          postgres_port, postgres_user, postgres_password, postgres_database,
          server_type, mysql_port, mysql_user, mysql_password, mysql_database, web_http_port, web_https_port,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          hostname = EXCLUDED.hostname,
          ip = EXCLUDED.ip,
          os_type = EXCLUDED.os_type,
          os_distro = EXCLUDED.os_distro,
          environment = EXCLUDED.environment,
          category = EXCLUDED.category,
          role = EXCLUDED.role,
          tags = EXCLUDED.tags,
          ssh_port = EXCLUDED.ssh_port,
          ssh_username = EXCLUDED.ssh_username,
          ssh_password = EXCLUDED.ssh_password,
          ssh_key_path = EXCLUDED.ssh_key_path,
          default_shell = EXCLUDED.default_shell,
          win_protocol = EXCLUDED.win_protocol,
          win_port = EXCLUDED.win_port,
          win_username = EXCLUDED.win_username,
          win_domain = EXCLUDED.win_domain,
          status = EXCLUDED.status,
          cpu_cores = EXCLUDED.cpu_cores,
          ram_gb = EXCLUDED.ram_gb,
          disk_gb = EXCLUDED.disk_gb,
          uptime_str = EXCLUDED.uptime_str,
          location = EXCLUDED.location,
          notes = EXCLUDED.notes,
          prompt_password_on_connect = EXCLUDED.prompt_password_on_connect,
          installed_web_servers = EXCLUDED.installed_web_servers,
          installed_databases = EXCLUDED.installed_databases,
          has_apache = EXCLUDED.has_apache,
          has_nginx = EXCLUDED.has_nginx,
          has_postgresql = EXCLUDED.has_postgresql,
          has_mysql = EXCLUDED.has_mysql,
          postgres_port = EXCLUDED.postgres_port,
          postgres_user = EXCLUDED.postgres_user,
          postgres_password = EXCLUDED.postgres_password,
          postgres_database = EXCLUDED.postgres_database,
          server_type = EXCLUDED.server_type,
          mysql_port = EXCLUDED.mysql_port,
          mysql_user = EXCLUDED.mysql_user,
          mysql_password = EXCLUDED.mysql_password,
          mysql_database = EXCLUDED.mysql_database,
          web_http_port = EXCLUDED.web_http_port,
          web_https_port = EXCLUDED.web_https_port,
          updated_at = NOW()`,
        [
          newServer.id,
          newServer.name,
          newServer.hostname || '',
          newServer.ip,
          newServer.os_type,
          newServer.os_distro || '',
          newServer.environment,
          newServer.category,
          newServer.role,
          JSON.stringify(newServer.tags),
          newServer.ssh_port || 22,
          newServer.ssh_username || 'root',
          newServer.ssh_password || '',
          newServer.ssh_key_path || '',
          newServer.default_shell || 'bash',
          newServer.win_protocol || 'rdp',
          newServer.win_port || 3389,
          newServer.win_username || 'Administrator',
          newServer.win_domain || '',
          newServer.status,
          newServer.cpu_cores ?? null,
          newServer.ram_gb ?? null,
          newServer.disk_gb ?? null,
          newServer.uptime_str || null,
          newServer.location || '',
          newServer.notes || '',
          Boolean(newServer.prompt_password_on_connect),
          JSON.stringify(newServer.installed_web_servers || []),
          JSON.stringify(newServer.installed_databases || []),
          Boolean(newServer.has_apache),
          Boolean(newServer.has_nginx),
          Boolean(newServer.has_postgresql),
          Boolean(newServer.has_mysql),
          newServer.postgres_port || 5432,
          newServer.postgres_user || 'postgres',
          newServer.postgres_password || '',
          newServer.postgres_database || 'postgres',
          newServer.server_type || 'linux',
          newServer.mysql_port || 3306,
          newServer.mysql_user || 'root',
          newServer.mysql_password || '',
          newServer.mysql_database || 'mysql',
          newServer.web_http_port || 80,
          newServer.web_https_port || 443,
          newServer.created_at,
          newServer.updated_at,
        ]
      );
    } catch (e) {
      console.error('[DB Error createRemoteServer in PostgreSQL]', e);
    }
  }

  return newServer;
}

export async function updateRemoteServer(id: string, updates: Partial<RemoteServer>): Promise<RemoteServer | null> {
  const cleanId = (id || updates.id || '').trim();
  if (!cleanId) return null;

  // 1. Fetch current existing server from PostgreSQL, fallback store, or defaults
  let current = await getRemoteServerById(cleanId);
  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
  }
  let storeIdx = store.remote_servers.findIndex(
    (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || (updates.ip && s.ip === updates.ip)
  );
  if (!current && storeIdx >= 0) {
    current = store.remote_servers[storeIdx];
  }
  if (!current) {
    const defaultFound = DEFAULT_REMOTE_SERVERS.find(
      (s) => s.id === cleanId || s.id.toLowerCase() === cleanId.toLowerCase() || (updates.ip && s.ip === updates.ip)
    );
    if (defaultFound) {
      current = { ...defaultFound };
    }
  }

  if (!current) {
    console.warn(`[updateRemoteServer] Server not found for ID "${cleanId}"`);
    return null;
  }

  const targetId = current.id || cleanId;
  const updated: RemoteServer = {
    ...current,
    ...updates,
    id: targetId,
    name: updates.name !== undefined ? updates.name.trim() : current.name,
    hostname: updates.hostname !== undefined ? updates.hostname.trim() : (current.hostname || ''),
    ip: updates.ip !== undefined ? updates.ip.trim() : current.ip,
    os_type: updates.os_type !== undefined ? updates.os_type : current.os_type,
    os_distro: updates.os_distro !== undefined ? updates.os_distro.trim() : current.os_distro,
    environment: updates.environment !== undefined ? updates.environment : current.environment,
    category: updates.category !== undefined ? updates.category : current.category,
    role: updates.role !== undefined ? updates.role : current.role,
    tags: Array.isArray(updates.tags) ? updates.tags : (current.tags || []),
    ssh_port: updates.ssh_port !== undefined ? Number(updates.ssh_port) : current.ssh_port,
    ssh_username: updates.ssh_username !== undefined ? updates.ssh_username.trim() : current.ssh_username,
    ssh_password: updates.prompt_password_on_connect
      ? ''
      : (updates.ssh_password !== undefined ? updates.ssh_password : current.ssh_password),
    ssh_key_path: updates.ssh_key_path !== undefined ? updates.ssh_key_path : current.ssh_key_path,
    default_shell: updates.default_shell !== undefined ? updates.default_shell : current.default_shell,
    win_protocol: updates.win_protocol !== undefined ? updates.win_protocol : current.win_protocol,
    win_port: updates.win_port !== undefined ? Number(updates.win_port) : current.win_port,
    win_username: updates.win_username !== undefined ? updates.win_username.trim() : current.win_username,
    win_password: updates.prompt_password_on_connect
      ? ''
      : (updates.win_password !== undefined ? updates.win_password : (current as any).win_password || ''),
    win_domain: updates.win_domain !== undefined ? updates.win_domain.trim() : current.win_domain,
    vnc_port: updates.vnc_port !== undefined ? Number(updates.vnc_port) : (current as any).vnc_port,
    vnc_username: updates.vnc_username !== undefined ? updates.vnc_username.trim() : (current as any).vnc_username,
    vnc_password: updates.prompt_password_on_connect
      ? ''
      : (updates.vnc_password !== undefined ? updates.vnc_password : (current as any).vnc_password || ''),
    prompt_password_on_connect: updates.prompt_password_on_connect !== undefined
      ? Boolean(updates.prompt_password_on_connect)
      : (current.prompt_password_on_connect ?? false),
    installed_web_servers: updates.installed_web_servers !== undefined
      ? updates.installed_web_servers
      : (updates.has_apache !== undefined || updates.has_nginx !== undefined
          ? [
              ...((updates.has_apache ?? current.has_apache) ? ['apache'] : []),
              ...((updates.has_nginx ?? current.has_nginx) ? ['nginx'] : [])
            ]
          : (current.installed_web_servers || [])),
    installed_databases: updates.installed_databases !== undefined
      ? updates.installed_databases
      : (updates.has_postgresql !== undefined || updates.has_mysql !== undefined
          ? [
              ...((updates.has_postgresql ?? current.has_postgresql) ? ['postgresql'] : []),
              ...((updates.has_mysql ?? current.has_mysql) ? ['mysql'] : [])
            ]
          : (current.installed_databases || [])),
    has_apache: updates.has_apache !== undefined
      ? Boolean(updates.has_apache)
      : (Array.isArray(updates.installed_web_servers) ? updates.installed_web_servers.includes('apache') : (current.has_apache ?? false)),
    has_nginx: updates.has_nginx !== undefined
      ? Boolean(updates.has_nginx)
      : (Array.isArray(updates.installed_web_servers) ? updates.installed_web_servers.includes('nginx') : (current.has_nginx ?? false)),
    has_postgresql: updates.has_postgresql !== undefined
      ? Boolean(updates.has_postgresql)
      : (Array.isArray(updates.installed_databases) ? updates.installed_databases.includes('postgresql') : (current.has_postgresql ?? false)),
    has_mysql: updates.has_mysql !== undefined
      ? Boolean(updates.has_mysql)
      : (Array.isArray(updates.installed_databases) ? updates.installed_databases.includes('mysql') : (current.has_mysql ?? false)),
    postgres_port: updates.postgres_port !== undefined ? (Number(updates.postgres_port) || 5432) : (current.postgres_port || 5432),
    postgres_user: updates.postgres_user !== undefined ? updates.postgres_user.trim() : (current.postgres_user || 'postgres'),
    postgres_password: updates.postgres_password !== undefined && updates.postgres_password.trim() !== ''
      ? encryptServerSecret(updates.postgres_password.trim())
      : (current.postgres_password || ''),
    postgres_password_set: Boolean(
      (updates.postgres_password !== undefined && updates.postgres_password.trim().length > 0) ||
      (current.postgres_password && current.postgres_password.length > 0)
    ),
    postgres_database: updates.postgres_database !== undefined ? updates.postgres_database.trim() : (current.postgres_database || 'postgres'),
    server_type: updates.server_type !== undefined
      ? updates.server_type
      : current.server_type,
    web_http_port: updates.web_http_port !== undefined ? Number(updates.web_http_port) : current.web_http_port,
    web_https_port: updates.web_https_port !== undefined ? Number(updates.web_https_port) : current.web_https_port,
    mysql_port: updates.mysql_port !== undefined ? (Number(updates.mysql_port) || 3306) : (current.mysql_port || 3306),
    mysql_user: updates.mysql_user !== undefined ? updates.mysql_user.trim() : (current.mysql_user || 'root'),
    mysql_password: updates.mysql_password !== undefined && updates.mysql_password.trim() !== ''
      ? encryptServerSecret(updates.mysql_password.trim())
      : (current.mysql_password || ''),
    mysql_password_set: Boolean(
      (updates.mysql_password !== undefined && updates.mysql_password.trim().length > 0) ||
      (current.mysql_password && current.mysql_password.length > 0)
    ),
    mysql_database: updates.mysql_database !== undefined ? updates.mysql_database.trim() : (current.mysql_database || 'mysql'),
    status: updates.status !== undefined ? updates.status : (current.status || 'untested'),
    cpu_cores: updates.cpu_cores !== undefined ? (updates.cpu_cores !== null && Number(updates.cpu_cores) > 0 ? Number(updates.cpu_cores) : undefined) : current.cpu_cores,
    ram_gb: updates.ram_gb !== undefined ? (updates.ram_gb !== null && Number(updates.ram_gb) > 0 ? Number(updates.ram_gb) : undefined) : current.ram_gb,
    disk_gb: updates.disk_gb !== undefined ? (updates.disk_gb !== null && Number(updates.disk_gb) > 0 ? Number(updates.disk_gb) : undefined) : current.disk_gb,
    uptime_str: updates.uptime_str !== undefined ? updates.uptime_str : current.uptime_str,
    location: updates.location !== undefined ? updates.location.trim() : current.location,
    notes: updates.notes !== undefined ? updates.notes.trim() : (updates.description !== undefined ? updates.description.trim() : (current.notes || current.description || '')),
    description: updates.description !== undefined ? updates.description.trim() : (updates.notes !== undefined ? updates.notes.trim() : (current.description || current.notes || '')),
    updated_at: new Date().toISOString(),
  };

  // 2. Persist in fallback store
  if (storeIdx >= 0) {
    store.remote_servers[storeIdx] = updated;
  } else {
    const existingIdx = store.remote_servers.findIndex((s) => s.id === targetId);
    if (existingIdx >= 0) {
      store.remote_servers[existingIdx] = updated;
    } else {
      store.remote_servers.push(updated);
    }
  }
  saveFallbackStore(store);

  // 3. Upsert / Update in PostgreSQL
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO remote_servers (
          id, name, hostname, ip, os_type, os_distro, environment, category, role, tags,
          ssh_port, ssh_username, ssh_password, ssh_key_path, default_shell,
          win_protocol, win_port, win_username, win_domain,
          status, cpu_cores, ram_gb, disk_gb, uptime_str, location, notes,
          prompt_password_on_connect,
          installed_web_servers, installed_databases, has_apache, has_nginx, has_postgresql, has_mysql,
          postgres_port, postgres_user, postgres_password, postgres_database,
          server_type, mysql_port, mysql_user, mysql_password, mysql_database, web_http_port, web_https_port,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          hostname = EXCLUDED.hostname,
          ip = EXCLUDED.ip,
          os_type = EXCLUDED.os_type,
          os_distro = EXCLUDED.os_distro,
          environment = EXCLUDED.environment,
          category = EXCLUDED.category,
          role = EXCLUDED.role,
          tags = EXCLUDED.tags,
          ssh_port = EXCLUDED.ssh_port,
          ssh_username = EXCLUDED.ssh_username,
          ssh_password = EXCLUDED.ssh_password,
          ssh_key_path = EXCLUDED.ssh_key_path,
          default_shell = EXCLUDED.default_shell,
          win_protocol = EXCLUDED.win_protocol,
          win_port = EXCLUDED.win_port,
          win_username = EXCLUDED.win_username,
          win_domain = EXCLUDED.win_domain,
          status = EXCLUDED.status,
          cpu_cores = EXCLUDED.cpu_cores,
          ram_gb = EXCLUDED.ram_gb,
          disk_gb = EXCLUDED.disk_gb,
          uptime_str = EXCLUDED.uptime_str,
          location = EXCLUDED.location,
          notes = EXCLUDED.notes,
          prompt_password_on_connect = EXCLUDED.prompt_password_on_connect,
          installed_web_servers = EXCLUDED.installed_web_servers,
          installed_databases = EXCLUDED.installed_databases,
          has_apache = EXCLUDED.has_apache,
          has_nginx = EXCLUDED.has_nginx,
          has_postgresql = EXCLUDED.has_postgresql,
          has_mysql = EXCLUDED.has_mysql,
          postgres_port = EXCLUDED.postgres_port,
          postgres_user = EXCLUDED.postgres_user,
          postgres_password = EXCLUDED.postgres_password,
          postgres_database = EXCLUDED.postgres_database,
          server_type = EXCLUDED.server_type,
          mysql_port = EXCLUDED.mysql_port,
          mysql_user = EXCLUDED.mysql_user,
          mysql_password = EXCLUDED.mysql_password,
          mysql_database = EXCLUDED.mysql_database,
          web_http_port = EXCLUDED.web_http_port,
          web_https_port = EXCLUDED.web_https_port,
          updated_at = NOW()`,
        [
          updated.id,
          updated.name,
          updated.hostname || '',
          updated.ip,
          updated.os_type,
          updated.os_distro || '',
          updated.environment,
          updated.category,
          updated.role || 'General Server',
          JSON.stringify(updated.tags || []),
          updated.ssh_port,
          updated.ssh_username,
          updated.ssh_password,
          updated.ssh_key_path,
          updated.default_shell,
          updated.win_protocol,
          updated.win_port,
          updated.win_username,
          updated.win_domain,
          updated.status,
          updated.cpu_cores,
          updated.ram_gb,
          updated.disk_gb,
          updated.uptime_str,
          updated.location,
          updated.notes,
          Boolean(updated.prompt_password_on_connect),
          JSON.stringify(updated.installed_web_servers || []),
          JSON.stringify(updated.installed_databases || []),
          Boolean(updated.has_apache),
          Boolean(updated.has_nginx),
          Boolean(updated.has_postgresql),
          Boolean(updated.has_mysql),
          updated.postgres_port || 5432,
          updated.postgres_user || 'postgres',
          updated.postgres_password || '',
          updated.postgres_database || 'postgres',
          updated.server_type || 'linux',
          updated.mysql_port || 3306,
          updated.mysql_user || 'root',
          updated.mysql_password || '',
          updated.mysql_database || 'mysql',
          updated.web_http_port || 80,
          updated.web_https_port || 443,
          updated.created_at || new Date().toISOString(),
          updated.updated_at,
        ]
      );
    } catch (e) {
      console.error('[DB Error updateRemoteServer in PostgreSQL]', e);
    }
  }

  return updated;
}

export async function deleteRemoteServer(id: string): Promise<boolean> {
  const cleanId = (id || '').trim();
  if (!cleanId) return false;

  const store = loadFallbackStore();
  if (!Array.isArray(store.remote_servers)) {
    store.remote_servers = [];
  }
  const prevLen = store.remote_servers.length;
  store.remote_servers = store.remote_servers.filter(
    (s) => s.id !== cleanId && s.id.toLowerCase() !== cleanId.toLowerCase()
  );
  if (store.remote_servers.length !== prevLen) {
    saveFallbackStore(store);
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query('DELETE FROM remote_servers WHERE id = $1 OR LOWER(id) = LOWER($1)', [cleanId]);
    } catch (e) {
      console.error('[DB Error deleteRemoteServer in PostgreSQL]', e);
    }
  }
  return true;
}

export async function updateRemoteServerTags(id: string, tags: string[]): Promise<RemoteServer | null> {
  const cleanTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  return updateRemoteServer(id, { tags: cleanTags });
}

export async function getRemoteServerTagsSummary(): Promise<{ tag: string; count: number }[]> {
  const servers = await getAllRemoteServers();
  const counts: Record<string, number> = {};
  for (const s of servers) {
    if (Array.isArray(s.tags)) {
      for (const t of s.tags) {
        if (t) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// ==========================================
// SERVER CATEGORIES CRUD & REASSIGN OPERATIONS
// ==========================================

export async function getAllServerCategories(): Promise<ServerCategory[]> {
  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories) || store.server_categories.length === 0) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
    saveFallbackStore(store);
  }

  // Live count calculation
  const allServers = await getAllRemoteServers();
  const countsByName: Record<string, number> = {};
  for (const s of allServers) {
    const cat = (s.category || 'Uncategorized').trim().toLowerCase();
    countsByName[cat] = (countsByName[cat] || 0) + 1;
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT * FROM server_categories ORDER BY is_default DESC, name ASC');
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          name_fa: r.name_fa || r.name,
          description: r.description || '',
          color: r.color || 'indigo',
          is_default: Boolean(r.is_default),
          serverCount: countsByName[r.name.trim().toLowerCase()] || 0,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        }));
      }
    } catch (e) {
      console.warn('[DB Error getAllServerCategories, falling back to local store]', e);
    }
  }

  return store.server_categories.map((c) => ({
    ...c,
    serverCount: countsByName[c.name.trim().toLowerCase()] || 0,
  }));
}

export async function getServerCategoryById(id: string): Promise<ServerCategory | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  const cats = await getAllServerCategories();
  return cats.find((c) => c.id === cleanId || c.name.toLowerCase() === cleanId.toLowerCase()) || null;
}

export async function createServerCategory(data: Partial<ServerCategory>): Promise<ServerCategory> {
  const rawName = (data.name || '').trim();
  if (!rawName) {
    throw new Error('Category name is required');
  }

  const existing = await getAllServerCategories();
  const duplicate = existing.find((c) => c.name.toLowerCase() === rawName.toLowerCase());
  if (duplicate) {
    throw new Error(`Category "${rawName}" already exists`);
  }

  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || Date.now().toString(36);
  const id = `cat-${slug}-${Date.now().toString(36).slice(-4)}`;
  const now = new Date().toISOString();

  const newCat: ServerCategory = {
    id,
    name: rawName,
    name_fa: data.name_fa?.trim() || rawName,
    description: data.description?.trim() || '',
    color: data.color?.trim() || 'indigo',
    is_default: false,
    serverCount: 0,
    created_at: now,
    updated_at: now,
  };

  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories)) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }
  store.server_categories.push(newCat);
  saveFallbackStore(store);

  // PostgreSQL write
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO server_categories (id, name, name_fa, description, color, is_default, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           name_fa = EXCLUDED.name_fa,
           description = EXCLUDED.description,
           color = EXCLUDED.color,
           updated_at = EXCLUDED.updated_at`,
        [newCat.id, newCat.name, newCat.name_fa, newCat.description, newCat.color, newCat.is_default, newCat.created_at, newCat.updated_at]
      );
    } catch (e) {
      console.error('[DB Error createServerCategory in PostgreSQL]', e);
    }
  }

  return newCat;
}

export async function updateServerCategory(id: string, updates: Partial<ServerCategory>): Promise<ServerCategory | null> {
  const cleanId = (id || '').trim();
  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories)) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }

  const idx = store.server_categories.findIndex((c) => c.id === cleanId || c.name.toLowerCase() === cleanId.toLowerCase());
  if (idx < 0) {
    return null;
  }

  const current = store.server_categories[idx];
  const oldName = current.name;
  const newName = updates.name !== undefined ? updates.name.trim() : current.name;

  if (!newName) {
    throw new Error('Category name cannot be empty');
  }

  // If renaming, check for name collision
  if (newName.toLowerCase() !== oldName.toLowerCase()) {
    const duplicate = store.server_categories.find(
      (c) => c.id !== current.id && c.name.toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Category name "${newName}" is already in use`);
    }
  }

  const now = new Date().toISOString();
  const updated: ServerCategory = {
    ...current,
    name: newName,
    name_fa: updates.name_fa !== undefined ? updates.name_fa.trim() : current.name_fa,
    description: updates.description !== undefined ? updates.description.trim() : current.description,
    color: updates.color !== undefined ? updates.color.trim() : current.color,
    updated_at: now,
  };

  store.server_categories[idx] = updated;

  // CASCADE: If the category was renamed, update all servers using the old name!
  let serversUpdated = 0;
  if (newName !== oldName && Array.isArray(store.remote_servers)) {
    for (const s of store.remote_servers) {
      if (s.category && s.category.toLowerCase() === oldName.toLowerCase()) {
        s.category = newName;
        s.updated_at = now;
        serversUpdated++;
      }
    }
  }

  saveFallbackStore(store);

  // PostgreSQL update
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `UPDATE server_categories SET
           name = $1, name_fa = $2, description = $3, color = $4, updated_at = $5
         WHERE id = $6`,
        [updated.name, updated.name_fa, updated.description, updated.color, updated.updated_at, updated.id]
      );
      if (newName !== oldName && serversUpdated > 0) {
        await pool.query('UPDATE remote_servers SET category = $1 WHERE LOWER(category) = LOWER($2)', [newName, oldName]);
      }
    } catch (e) {
      console.error('[DB Error updateServerCategory in PostgreSQL]', e);
    }
  }

  const count = (await getAllRemoteServers()).filter((s) => s.category?.toLowerCase() === updated.name.toLowerCase()).length;
  return { ...updated, serverCount: count };
}

export async function deleteServerCategory(
  id: string,
  reassignTo?: string
): Promise<{ success: boolean; reassignedCount: number; targetCategory: string }> {
  const cleanId = (id || '').trim();
  const store = loadFallbackStore();
  if (!Array.isArray(store.server_categories)) {
    store.server_categories = [...DEFAULT_SERVER_CATEGORIES];
  }

  const catToDelete = store.server_categories.find(
    (c) => c.id === cleanId || c.name.toLowerCase() === cleanId.toLowerCase()
  );
  if (!catToDelete) {
    throw new Error('Category not found');
  }

  // Protection: Do not allow deleting "Uncategorized" as it's the core system fallback!
  if (catToDelete.name.toLowerCase() === 'uncategorized') {
    throw new Error('The default "Uncategorized" system category cannot be deleted.');
  }

  // Determine target category for reassigning any assigned servers
  let targetCatName = (reassignTo || '').trim();
  if (!targetCatName) {
    targetCatName = 'Uncategorized';
  }

  // Check if target category exists, if not ensure Uncategorized is available
  let targetCat = store.server_categories.find(
    (c) => c.name.toLowerCase() === targetCatName.toLowerCase()
  );
  if (!targetCat) {
    targetCat = store.server_categories.find((c) => c.name.toLowerCase() === 'uncategorized');
    if (!targetCat) {
      targetCat = {
        id: 'cat-uncategorized',
        name: 'Uncategorized',
        name_fa: 'دسته‌بندی‌نشده',
        description: 'Default fallback category',
        color: 'slate',
        is_default: true,
      };
      store.server_categories.push(targetCat);
    }
    targetCatName = targetCat.name;
  }

  // Reassign all servers that belonged to the deleted category
  const now = new Date().toISOString();
  let reassignedCount = 0;
  if (Array.isArray(store.remote_servers)) {
    for (const s of store.remote_servers) {
      if (s.category && s.category.toLowerCase() === catToDelete.name.toLowerCase()) {
        s.category = targetCatName;
        s.updated_at = now;
        reassignedCount++;
      }
    }
  }

  // Remove category from store
  store.server_categories = store.server_categories.filter((c) => c.id !== catToDelete.id);
  saveFallbackStore(store);

  // PostgreSQL operations
  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      if (reassignedCount > 0) {
        await pool.query(
          'UPDATE remote_servers SET category = $1 WHERE LOWER(category) = LOWER($2)',
          [targetCatName, catToDelete.name]
        );
      }
      await pool.query('DELETE FROM server_categories WHERE id = $1', [catToDelete.id]);
    } catch (e) {
      console.error('[DB Error deleteServerCategory in PostgreSQL]', e);
    }
  }

  return { success: true, reassignedCount, targetCategory: targetCatName };
}

// =============================================================================
// USER PASSWORD VAULT CRUD (PER-USER ISOLATED)
// =============================================================================

export async function getUserVaultItems(userId: string): Promise<UserVaultItem[]> {
  if (!userId) return [];
  await ensurePostgresConnection();

  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM user_password_vault WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
      );
      if (res && Array.isArray(res.rows)) {
        return res.rows.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          name: r.name,
          username: r.username || '',
          encrypted_password: r.encrypted_password,
          iv: r.iv,
          tag: r.tag,
          password_hash: r.password_hash || undefined,
          password_salt: r.password_salt || undefined,
          category: r.category || 'general',
          target_host: r.target_host || '',
          notes: r.notes || '',
          tags: Array.isArray(r.tags) ? r.tags : typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : [],
          strength: r.strength || 'strong',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        }));
      }
    } catch (e: any) {
      console.warn('[DB Error getUserVaultItems from PostgreSQL, fallback used]:', e.message);
    }
  }

  const store = loadFallbackStore();
  const list = Array.isArray(store.user_password_vault) ? store.user_password_vault : [];
  return list.filter((item) => item.user_id === userId);
}

export async function getUserVaultItemById(id: string, userId: string): Promise<UserVaultItem | null> {
  if (!id || !userId) return null;
  await ensurePostgresConnection();

  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM user_password_vault WHERE id = $1 AND user_id = $2 LIMIT 1',
        [id, userId]
      );
      if (res && res.rows.length > 0) {
        const r = res.rows[0];
        return {
          id: r.id,
          user_id: r.user_id,
          name: r.name,
          username: r.username || '',
          encrypted_password: r.encrypted_password,
          iv: r.iv,
          tag: r.tag,
          password_hash: r.password_hash || undefined,
          password_salt: r.password_salt || undefined,
          category: r.category || 'general',
          target_host: r.target_host || '',
          notes: r.notes || '',
          tags: Array.isArray(r.tags) ? r.tags : typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : [],
          strength: r.strength || 'strong',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
        };
      }
      return null;
    } catch (e: any) {
      console.warn('[DB Error getUserVaultItemById from PostgreSQL, fallback used]:', e.message);
    }
  }

  const store = loadFallbackStore();
  const list = Array.isArray(store.user_password_vault) ? store.user_password_vault : [];
  const found = list.find((item) => item.id === id && item.user_id === userId);
  return found || null;
}

export async function saveUserVaultItem(item: UserVaultItem): Promise<UserVaultItem> {
  const store = loadFallbackStore();
  if (!Array.isArray(store.user_password_vault)) {
    store.user_password_vault = [];
  }

  const now = new Date().toISOString();
  const normalized: UserVaultItem = {
    id: item.id || `vault_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: item.user_id,
    name: item.name.trim(),
    username: (item.username || '').trim(),
    encrypted_password: item.encrypted_password,
    iv: item.iv,
    tag: item.tag,
    password_hash: item.password_hash || undefined,
    password_salt: item.password_salt || undefined,
    category: item.category || 'general',
    target_host: (item.target_host || '').trim(),
    notes: (item.notes || '').trim(),
    tags: Array.isArray(item.tags) ? item.tags : [],
    strength: item.strength || 'strong',
    created_at: item.created_at || now,
    updated_at: now,
  };

  const existingIdx = store.user_password_vault.findIndex(
    (x) => x.id === normalized.id && x.user_id === normalized.user_id
  );

  if (existingIdx >= 0) {
    store.user_password_vault[existingIdx] = normalized;
  } else {
    store.user_password_vault.unshift(normalized);
  }

  saveFallbackStore(store);

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      await pool.query(
        `INSERT INTO user_password_vault (
          id, user_id, name, username, encrypted_password, iv, tag, password_hash, password_salt, category, target_host, notes, tags, strength, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          username = EXCLUDED.username,
          encrypted_password = EXCLUDED.encrypted_password,
          iv = EXCLUDED.iv,
          tag = EXCLUDED.tag,
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          category = EXCLUDED.category,
          target_host = EXCLUDED.target_host,
          notes = EXCLUDED.notes,
          tags = EXCLUDED.tags,
          strength = EXCLUDED.strength,
          updated_at = EXCLUDED.updated_at`,
        [
          normalized.id,
          normalized.user_id,
          normalized.name,
          normalized.username,
          normalized.encrypted_password,
          normalized.iv,
          normalized.tag,
          normalized.password_hash || '',
          normalized.password_salt || '',
          normalized.category,
          normalized.target_host,
          normalized.notes,
          JSON.stringify(normalized.tags),
          normalized.strength,
          normalized.created_at,
          normalized.updated_at,
        ]
      );
    } catch (e: any) {
      console.error('[DB Error saveUserVaultItem in PostgreSQL]', e.message);
    }
  }

  return normalized;
}

export async function deleteUserVaultItem(id: string, userId: string): Promise<boolean> {
  const store = loadFallbackStore();
  if (!Array.isArray(store.user_password_vault)) {
    store.user_password_vault = [];
  }

  const initialLen = store.user_password_vault.length;
  store.user_password_vault = store.user_password_vault.filter(
    (x) => !(x.id === id && x.user_id === userId)
  );

  const deletedInFallback = store.user_password_vault.length < initialLen;
  if (deletedInFallback) {
    saveFallbackStore(store);
  }

  await ensurePostgresConnection();
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        'DELETE FROM user_password_vault WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      return (res && (res.rowCount || 0) > 0) || deletedInFallback;
    } catch (e: any) {
      console.error('[DB Error deleteUserVaultItem in PostgreSQL]', e.message);
    }
  }

  return deletedInFallback;
}

export async function getBulkServerReports(): Promise<any[]> {
  const store = loadFallbackStore();
  const fallbackReports = Array.isArray(store.bulk_server_reports) ? store.bulk_server_reports : [];

  if (pool) {
    try {
      const res = await pool.query(`
        SELECT 
          id,
          job_id as "jobId",
          template_id as "templateId",
          template_title as "templateTitle",
          template_title_en as "templateTitleEn",
          category,
          icon,
          status,
          operator_user as "operatorUser",
          duration_ms as "durationMs",
          total_servers as "totalServers",
          success_count as "successCount",
          failed_count as "failedCount",
          skipped_count as "skippedCount",
          server_summaries as "serverSummaries",
          impact_analysis as "impactAnalysis",
          parameters,
          results,
          logs,
          created_at as "createdAt",
          finished_at as "finishedAt"
        FROM bulk_server_reports
        ORDER BY created_at DESC
        LIMIT 300
      `);

      if (res && res.rows && res.rows.length > 0) {
        return res.rows;
      }
    } catch (e: any) {
      console.error('[DB Error getBulkServerReports in PostgreSQL]', e.message);
    }
  }

  return [...fallbackReports].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getBulkServerReportById(id: string): Promise<any | null> {
  if (pool) {
    try {
      const res = await pool.query(`
        SELECT 
          id,
          job_id as "jobId",
          template_id as "templateId",
          template_title as "templateTitle",
          template_title_en as "templateTitleEn",
          category,
          icon,
          status,
          operator_user as "operatorUser",
          duration_ms as "durationMs",
          total_servers as "totalServers",
          success_count as "successCount",
          failed_count as "failedCount",
          skipped_count as "skippedCount",
          server_summaries as "serverSummaries",
          impact_analysis as "impactAnalysis",
          parameters,
          results,
          logs,
          created_at as "createdAt",
          finished_at as "finishedAt"
        FROM bulk_server_reports
        WHERE id = $1 OR job_id = $1
        LIMIT 1
      `, [id]);

      if (res && res.rows && res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (e: any) {
      console.error('[DB Error getBulkServerReportById in PostgreSQL]', e.message);
    }
  }

  const store = loadFallbackStore();
  const reports = Array.isArray(store.bulk_server_reports) ? store.bulk_server_reports : [];
  return reports.find((r: any) => r.id === id || r.jobId === id) || null;
}

export async function saveBulkServerReport(report: any): Promise<void> {
  if (!report || (!report.id && !report.jobId)) return;
  const reportId = report.id || `report-${report.jobId || Date.now()}`;
  const normalizedReport = {
    ...report,
    id: reportId,
    jobId: report.jobId || reportId,
    createdAt: report.createdAt || Date.now(),
    finishedAt: report.finishedAt || Date.now(),
  };

  // 1. Persist to Fallback JSON store (backend/database_store.json)
  const store = loadFallbackStore();
  if (!Array.isArray(store.bulk_server_reports)) {
    store.bulk_server_reports = [];
  }
  const idx = store.bulk_server_reports.findIndex((r: any) => r.id === reportId || r.jobId === normalizedReport.jobId);
  if (idx >= 0) {
    store.bulk_server_reports[idx] = normalizedReport;
  } else {
    store.bulk_server_reports.unshift(normalizedReport);
  }
  if (store.bulk_server_reports.length > 300) {
    store.bulk_server_reports = store.bulk_server_reports.slice(0, 300);
  }
  saveFallbackStore(store);

  // 2. Persist to relational PostgreSQL table if available
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO bulk_server_reports (
          id, job_id, template_id, template_title, template_title_en, category, icon,
          status, operator_user, duration_ms, total_servers, success_count, failed_count, skipped_count,
          server_summaries, impact_analysis, parameters, results, logs, created_at, finished_at, updated_at_dt
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          job_id = EXCLUDED.job_id,
          template_id = EXCLUDED.template_id,
          template_title = EXCLUDED.template_title,
          template_title_en = EXCLUDED.template_title_en,
          category = EXCLUDED.category,
          icon = EXCLUDED.icon,
          status = EXCLUDED.status,
          operator_user = EXCLUDED.operator_user,
          duration_ms = EXCLUDED.duration_ms,
          total_servers = EXCLUDED.total_servers,
          success_count = EXCLUDED.success_count,
          failed_count = EXCLUDED.failed_count,
          skipped_count = EXCLUDED.skipped_count,
          server_summaries = EXCLUDED.server_summaries,
          impact_analysis = EXCLUDED.impact_analysis,
          parameters = EXCLUDED.parameters,
          results = EXCLUDED.results,
          logs = EXCLUDED.logs,
          created_at = EXCLUDED.created_at,
          finished_at = EXCLUDED.finished_at,
          updated_at_dt = CURRENT_TIMESTAMP`,
        [
          reportId,
          normalizedReport.jobId,
          normalizedReport.templateId || 'custom',
          normalizedReport.templateTitle || 'Bulk Configuration',
          normalizedReport.templateTitleEn || normalizedReport.templateTitle || 'Bulk Configuration',
          normalizedReport.category || 'general',
          normalizedReport.icon || 'Server',
          normalizedReport.status || 'completed',
          normalizedReport.operatorUser || 'Administrator',
          normalizedReport.durationMs || 0,
          normalizedReport.totalServers || 0,
          normalizedReport.successCount || 0,
          normalizedReport.failedCount || 0,
          normalizedReport.skippedCount || 0,
          JSON.stringify(normalizedReport.serverSummaries || []),
          JSON.stringify(normalizedReport.impactAnalysis || {}),
          JSON.stringify(normalizedReport.parameters || {}),
          JSON.stringify(normalizedReport.results || {}),
          JSON.stringify(normalizedReport.logs || []),
          normalizedReport.createdAt,
          normalizedReport.finishedAt
        ]
      );
    } catch (e: any) {
      console.error('[DB Error saveBulkServerReport in PostgreSQL]', e.message);
    }
  }
}

export async function deleteBulkServerReport(id: string): Promise<boolean> {
  const store = loadFallbackStore();
  let deletedInFallback = false;
  if (Array.isArray(store.bulk_server_reports)) {
    const initialLen = store.bulk_server_reports.length;
    store.bulk_server_reports = store.bulk_server_reports.filter((r: any) => r.id !== id && r.jobId !== id);
    if (store.bulk_server_reports.length < initialLen) {
      saveFallbackStore(store);
      deletedInFallback = true;
    }
  }

  if (pool) {
    try {
      const res = await pool.query(
        'DELETE FROM bulk_server_reports WHERE id = $1 OR job_id = $1',
        [id]
      );
      return (res && (res.rowCount || 0) > 0) || deletedInFallback;
    } catch (e: any) {
      console.error('[DB Error deleteBulkServerReport in PostgreSQL]', e.message);
    }
  }

  return deletedInFallback;
}

export async function clearAllBulkServerReports(): Promise<boolean> {
  const store = loadFallbackStore();
  store.bulk_server_reports = [];
  saveFallbackStore(store);

  if (pool) {
    try {
      await pool.query('DELETE FROM bulk_server_reports');
      return true;
    } catch (e: any) {
      console.error('[DB Error clearAllBulkServerReports in PostgreSQL]', e.message);
    }
  }

  return true;
}

export async function getBulkServerReportsStorageStats(): Promise<{
  storageType: 'postgresql' | 'json_store';
  totalReports: number;
  isPostgresReady: boolean;
}> {
  if (pool) {
    try {
      const res = await pool.query('SELECT count(*) as count FROM bulk_server_reports');
      const count = parseInt(res.rows[0]?.count || '0', 10);
      return {
        storageType: 'postgresql',
        totalReports: count,
        isPostgresReady: true,
      };
    } catch (e: any) {
      console.error('[DB Error getBulkServerReportsStorageStats]', e.message);
    }
  }

  const store = loadFallbackStore();
  const reports = Array.isArray(store.bulk_server_reports) ? store.bulk_server_reports : [];
  return {
    storageType: 'json_store',
    totalReports: reports.length,
    isPostgresReady: false,
  };
}


