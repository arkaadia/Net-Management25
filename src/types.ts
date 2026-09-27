export type DeviceType = 'switch' | 'router' | 'access_point' | 'firewall';

export type DevicePlatform =
  | 'cisco_ios_xe'
  | 'cisco_ios'
  | 'mikrotik_routeros'
  | 'generic_linux';

export type ConnectionMode = 'ssh' | 'simulator';

export interface DeviceConnection {
  protocol: 'ssh' | 'telnet';
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key?: string;
  connection_timeout?: number;
}

export interface PlatformCapabilities {
  vlan: boolean;
  interface_enable_disable: boolean;
  port_security: boolean;
  switchport_mode: boolean;
  trunk: boolean;
  save_config: boolean;
  interface_description: boolean;
  speed_duplex: boolean;
  poe: boolean;
  lldp_cdp: boolean;
}

export interface CommandGuideItem {
  cmd: string;
  desc: string;
  descEn?: string;
  category: 'show' | 'config' | 'action';
  mode: string;
}

export interface DevicePlatformInfo {
  platform: DevicePlatform;
  platform_name: string;
  capabilities: PlatformCapabilities;
  command_guide: CommandGuideItem[];
}

export function isMikroTikDevice(device?: Partial<Device> | null): boolean {
  if (!device) return false;
  if (device.platform === 'mikrotik_routeros') return true;
  const m = (device.model || '').toLowerCase();
  const n = (device.name || '').toLowerCase();
  const f = (device.firmware || '').toLowerCase();
  return (
    m.includes('mikrotik') ||
    m.includes('routerboard') ||
    m.includes('crs') ||
    m.includes('ccr') ||
    m.includes('hex') ||
    m.includes('hap') ||
    m.includes('rb') ||
    n.includes('mikrotik') ||
    n.includes('routerboard') ||
    f.includes('routeros')
  );
}

export function isGenericLinuxDevice(device?: Partial<Device> | null): boolean {
  if (!device) return false;
  return device.platform === 'generic_linux';
}

export interface Device {
  id: string;
  name: string;
  ip: string;
  type: DeviceType;
  role: string;
  model: string;
  platform?: DevicePlatform;
  connection_mode?: ConnectionMode;
  connection_protocol?: 'ssh' | 'telnet';
  connection?: DeviceConnection;
  mac: string;
  building: string;
  floor: string;
  unit: string;
  rack?: string;
  is_online: boolean;
  latency_ms?: number | null;
  packet_loss?: number;
  uptime?: string;
  cdp_enabled: boolean;
  lldp_enabled: boolean;
  snmp_community?: string;
  firmware?: string;
  last_seen?: string;
  total_ports: number;
  has_unsaved_changes?: boolean;
  last_modified_time?: string;
  last_write_memory_time?: string;
  pending_changes?: Array<{
    port_id?: string;
    type?: string;
    description?: string;
    command?: string;
    timestamp?: string;
  }>;
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  enable_password?: string;
  ssh_status?: 'connected' | 'authenticated' | 'disconnected' | 'failed';
  ssh_connected?: boolean;
  power_supplies?: number;
  power_watts?: number;
  serial_number?: string;
  vendor?: string;
  master_session_id?: string;
  detected_ports?: SwitchPort[];
  web_configs?: DeviceWebConfig[];
  winbox_port?: number;
}

export interface DeviceWebConfig {
  id?: string;
  title: string;
  url: string;
}

export interface SwitchPort {
  id?: string;
  port?: string;
  port_id: string;
  name: string;
  mac_address?: string;
  status: 'up' | 'down';
  admin_status: 'enabled' | 'disabled';
  mode: 'trunk' | 'access';
  vlan: number;
  allowed_vlans: string;
  speed: string;
  duplex: string;
  connected_device: string;
  connected_type?: 'Switch' | 'Router' | 'Access Point' | 'Server' | 'Workstation' | 'Printer' | 'VoIP Phone' | 'Host' | 'None';
  poe_status?: 'delivering' | 'off' | 'disabled' | 'n/a';
  poe_power?: number;
  description?: string;
  // Cisco Port Security
  port_security_enabled?: boolean;
  port_security_max_mac?: number;
  port_security_mode?: 'sticky' | 'configured' | 'dynamic';
  port_security_configured_mac?: string;
  port_security_violation?: 'shutdown' | 'restrict' | 'protect';
  port_security_status?: 'secure-up' | 'secure-down' | 'secure-shutdown' | 'disabled';
  port_security_learned_macs?: string[];
}

export interface CdpLldpNeighbor {
  local_device_id: string;
  local_port: string;
  neighbor_name: string;
  neighbor_ip: string;
  neighbor_port: string;
  neighbor_model: string;
  protocol: 'CDP' | 'LLDP';
  capabilities: string;
  vlan: number;
  holdtime: number;
  timestamp?: string;
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  source_port: string;
  target_port: string;
  type: 'trunk' | 'access';
  vlan?: number;
  speed?: string;
  protocol?: 'CDP' | 'LLDP';
  status: 'active' | 'down';
}

export interface CustomTopologyLink {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourcePort: string;
  targetPort: string;
  sourceIp?: string;
  targetIp?: string;
  sourceMode: 'trunk' | 'access';
  targetMode: 'trunk' | 'access';
  sourceVlan?: number;
  targetVlan?: number;
  speed?: string;
  cableType?: 'copper' | 'fiber' | 'serial' | 'direct';
  notes?: string;
  status: 'active' | 'down' | 'testing';
}

export type RackUnitSize = 12 | 16 | 21 | 24 | 28 | 32 | 36 | 40 | 42 | 44 | 48 | number;
export type RackDepth = 60 | 80 | 100 | 120;
export type RackViewMode = 'front' | 'rear';

export type NetworkPortType =
  | '1GbE RJ45'
  | '2.5GbE RJ45'
  | '10GbE RJ45'
  | '1GbE SFP'
  | '10G SFP+'
  | '25G SFP28'
  | '40G QSFP+'
  | '100G QSFP28'
  | '8G FC'
  | '16G FC'
  | '32G FC';

export interface NetworkCardConfig {
  id: string;
  name: string;
  portCount: number;
  portType: NetworkPortType;
  slot?: string;
}

export type HardwareCategory =
  | 'server_rack'
  | 'telecom_tower'
  | 'hpe_server'
  | 'asus_server'
  | 'cisco_server'
  | 'patch_panel'
  | 'cable_management'
  | 'cisco_switch'
  | 'cisco_router'
  | 'hpe_storage'
  | 'emc_storage'
  | 'qnap_storage'
  | 'rackmount_case'
  | 'mikrotik_router'
  | 'firewall_fortigate'
  | 'firewall_sophos'
  | 'pdu'
  | 'ups_rackmount'
  | 'kvm_console'
  | 'fan_unit'
  | 'blank_panel'
  | 'rack_shelf'
  | 'fiber_odf'
  | 'wireless_radio'
  | 'dish_antenna'
  | 'telecom_tower';

export type TowerType = 'guyed_g35' | 'guyed_g45' | 'self_supporting_3leg' | 'self_supporting_4leg' | 'monopole';

export interface MountedTowerDevice {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: 'wireless_radio' | 'dish_antenna';
  heightMeters: number; // Elevation height on tower, e.g. 36, 30, 24, 18, 12, 6
  azimuthDegrees?: number; // Compass heading in degrees 0° - 360°
  azimuthLabel?: string; // e.g. "North 0°", "East 90°", "South 180°", "West 270°"
  frequency?: string; // e.g. "5 GHz", "60 GHz", "24 GHz", "11 GHz"
  ip?: string;
  deviceId?: string;
  isOnline?: boolean;
  targetLink?: string; // e.g. "PTP to Central Branch", "Factory CCTV Link"
  powerWatts?: number;
  notes?: string;
}

export interface CustomTopologyTower {
  id: string;
  name: string;
  location?: string;
  type: TowerType;
  heightMeters: number; // e.g. 18, 24, 30, 36, 42, 48, 60
  x: number;
  y: number;
  devices: MountedTowerDevice[];
  color?: string;
}

export interface MountedHardwareDevice {
  id: string;
  name: string;
  label?: string;
  category: HardwareCategory;
  brand: string;
  model: string;
  generation?: string;
  heightU: number;
  startU: number; // 1-indexed bottom U position
  networkCards: NetworkCardConfig[];
  ip?: string;
  serialNumber?: string;
  powerWatts?: number;
  powerSupplyCount?: number;
  pduOutletsCount?: number;
  pduOutletType?: string;
  pduAmperage?: number;
  notes?: string;
}

export interface CustomTopologyRack {
  id: string;
  name: string;
  units: RackUnitSize;
  depth: RackDepth;
  viewMode: RackViewMode;
  x: number;
  y: number;
  devices: MountedHardwareDevice[];
  color?: string;
  widthPx?: number;
}

export type StickyNoteColor = 'yellow' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';

export interface CustomTopologyStickyNote {
  id: string;
  x: number;
  y: number;
  width?: number;
  title?: string;
  content: string;
  color: StickyNoteColor;
  linkedDeviceId?: string;
  createdAt: string;
  updatedAt: string;
  viewMode?: DeviceCanvasDisplayMode;
}

export type DeviceCanvasDisplayMode = 'card' | 'physical';

export type MapVisibility = 'public' | 'private' | 'restricted';

export interface CustomTopologyMap {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  nodes?: any[];
  devicePositions: Record<string, { x: number; y: number }>;
  physicalPositions?: Record<string, { x: number; y: number }>;
  deviceIds: string[];
  links: CustomTopologyLink[];
  racks?: CustomTopologyRack[];
  towers?: CustomTopologyTower[];
  stickyNotes?: CustomTopologyStickyNote[];
  deviceDisplayModes?: Record<string, DeviceCanvasDisplayMode>;
  visibility?: MapVisibility;
  ownerId?: string;
  ownerName?: string;
  allowedUsers?: string[];
}

export interface TopologyNode extends Device {}

export interface TopologyData {
  nodes: TopologyNode[];
  devices?: Device[];
  links: TopologyLink[];
  buildings: string[];
  floors: string[];
  summary: {
    total_nodes: number;
    total_links: number;
    core_switches: number;
    access_switches: number;
    routers: number;
    access_points: number;
  };
}

export interface VlanInfo {
  id: number;
  name: string;
  subnet?: string;
  color?: string;
  status?: string;
  ports_count?: number;
}

export type ThemeType = 'obsidian' | 'emerald' | 'cobalt' | 'rose' | 'amber' | 'light';

export type TemplateVendor = 'cisco' | 'mikrotik' | 'generic';
export type TemplateTargetType = 'switch' | 'router' | 'access_point' | 'all';

export interface TemplateVariable {
  name: string;
  label: string;
  description: string;
  default_value?: string;
  required: boolean;
  type: 'ip' | 'subnet' | 'gateway' | 'text' | 'number' | 'vlan' | 'password';
}

export interface ConfigTemplate {
  id: string;
  name: string;
  vendor: TemplateVendor;
  target_type: TemplateTargetType;
  target_platform?: string;
  category?: string;
  role: string;
  description: string;
  default_cli_mode?: string;
  commands: string;
  variables: TemplateVariable[];
  author?: string;
  created_at?: string;
  updated_at?: string;
  is_builtin?: boolean;
}

export interface TemplateExecutionLog {
  timestamp: string;
  command: string;
  prompt: string;
  output: string;
  status: 'ok' | 'info' | 'warn' | 'error';
}

export interface TemplateApplyResult {
  success: boolean;
  message: string;
  device: Device;
  rendered_script: string;
  logs: TemplateExecutionLog[];
}

export interface DeviceConfigExtractOptions {
  auto_parameterize?: boolean;
  sanitize_secrets?: boolean;
  strip_ephemeral?: boolean;
  mikrotik_compact?: boolean;
}

export interface DeviceConfigExtractRequest {
  device_id?: string;
  ip: string;
  port?: number;
  protocol?: 'ssh' | 'telnet';
  vendor: TemplateVendor;
  target_type: TemplateTargetType;
  username?: string;
  password?: string;
  enable_password?: string;
  options?: DeviceConfigExtractOptions;
}

export interface DeviceConfigExtractResult {
  success: boolean;
  message?: string;
  raw_config: string;
  parameterized_commands: string;
  detected_variables: TemplateVariable[];
  detected_device_name: string;
  suggested_template_name: string;
  vendor: TemplateVendor;
  target_type: TemplateTargetType;
  role: string;
  description: string;
  logs: string[];
}

// ==========================================
// Settings: Device Grouping & Tagging
// ==========================================
export type GroupColor = 'amber' | 'indigo' | 'emerald' | 'cyan' | 'rose' | 'purple' | 'blue' | 'slate';

export interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  color: GroupColor;
  icon?: string;
  deviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Settings: Active Directory / LDAP Integration
// ==========================================
export interface ADSecurityGroup {
  dn: string;
  cn: string;
  description: string;
  memberCount: number;
}

export interface ADUser {
  dn: string;
  samAccountName: string;
  displayName: string;
  email: string;
  department: string;
  title: string;
  groups: string[];
  enabled: boolean;
}

export interface ActiveDirectoryConfig {
  enabled: boolean;
  server: string;
  port: number;
  useSsl: boolean;
  domain: string;
  baseDn: string;
  bindUser: string;
  bindPassword?: string;
  userSearchBase: string;
  groupSearchBase: string;
  lastSyncStatus: 'idle' | 'testing' | 'success' | 'failed';
  lastSyncMessage?: string;
  lastSyncTime?: string | null;
  syncedGroups: ADSecurityGroup[];
  syncedUsers: ADUser[];
}

export interface ADTestResult {
  success: boolean;
  latency_ms: number;
  message: string;
  serverBanner?: string;
  sslValid?: boolean;
  bindSuccess?: boolean;
  logs: string[];
}

// ==========================================
// Settings: Role-Based Access Control (RBAC) & Local Identity
// ==========================================
export interface LocalGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  memberUserIds: string[];
  createdAt: string;
  updatedAt: string;
  isBuiltin?: boolean;
}

export interface LocalUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  status: 'active' | 'disabled';
  role?: string;
  groupIds?: string[];
  passwordHash?: string;
  createdAt?: string;
  lastLogin?: string;
  isBuiltin?: boolean;
}

export interface AccessPolicy {
  id: string;
  name: string;
  description: string;
  isBuiltin?: boolean;
  priority: number;
  // Subject: Who does this policy apply to?
  subjectType: 'local_user' | 'local_group' | 'ad_group' | 'ad_user';
  subjectId: string;
  subjectName: string;
  // Target: Which devices does this cover?
  targetScope: 'all' | 'groups' | 'specific';
  targetGroupIds: string[];
  targetDeviceIds: string[];
  // Page / Module Access: Where can they go?
  canViewDashboard: boolean;
  canViewTopology: boolean;
  canViewDevices: boolean;
  canViewPorts: boolean;
  canViewScanner: boolean;
  canViewTemplates: boolean;
  canViewSettings: boolean;

  // 1. Cisco IOS / IOS-XE Granular Capabilities
  terminalAccess: 'none' | 'view_only' | 'full';
  canToggleAdminStatus: boolean;      // shutdown / no shutdown
  canChangeVlan: boolean;             // assign VLAN
  canEditDescription: boolean;        // set port description
  canTogglePortSecurity: boolean;     // port security enable/disable
  canWriteMemory: boolean;            // copy run start / write memory

  // 2. MikroTik RouterOS Granular Capabilities
  mikrotikTerminalAccess?: 'none' | 'view_only' | 'full';
  canMikrotikToggleInterface?: boolean; // /interface/set disabled=yes/no
  canMikrotikBridgeVlan?: boolean;       // /interface/bridge/vlan & PVID
  canMikrotikComment?: boolean;          // /interface/set comment=...
  canMikrotikIpPool?: boolean;           // /ip/address & /ip/pool
  canMikrotikFirewall?: boolean;         // /ip/firewall filter/nat
  canMikrotikBackup?: boolean;           // /system/backup & /export
  canMikrotikSafeMode?: boolean;         // RouterOS Safe Mode Protection

  // 3. Generic & Linux Network Appliances
  genericTerminalAccess?: 'none' | 'view_only' | 'full';
  canGenericToggleLink?: boolean;        // ip link set dev up/down
  canGenericDiagnostics?: boolean;       // ping, traceroute, mtr
  canGenericConfigBackup?: boolean;      // system config snapshot

  // 4. Global Infrastructure Operations
  canManageDevices: boolean;          // add, edit, delete device
  canApplyTemplates: boolean;         // apply config template
  canBatchOperate: boolean;           // batch port configuration

  // 5. Backup & Disaster Recovery Operations
  canExportBackup?: boolean;          // Export full or partial network backup package
  canImportBackup?: boolean;          // Import and restore network backup package
  permissions?: any;
}

export type BackupScope = 'full' | 'devices_topology' | 'security_rbac' | 'templates_only';

export interface BackupMetadata {
  version: string;
  appVersion: string;
  timestamp: string;
  createdAt: string;
  createdBy: string;
  createdRole: string;
  scope: BackupScope;
  scopeLabel: string;
  isEncrypted: boolean;
  isSanitized: boolean; // Passwords & secrets removed/masked
  checksumSha256: string;
  counts: {
    devices: number;
    customMaps: number;
    deviceGroups: number;
    localUsers: number;
    localGroups: number;
    accessPolicies: number;
    templates: number;
    hasActiveDirectory: boolean;
    hasCustomHierarchy: boolean;
  };
  environment?: {
    hostname?: string;
    userAgent?: string;
  };
}

export interface NetworkBackupPackage {
  format: 'nettopology-backup-v1';
  metadata: BackupMetadata;
  // Payload items (optionally omitted depending on scope)
  devices?: Device[];
  topologyData?: TopologyData;
  customMaps?: any[];
  nodePositions?: Record<string, { x: number; y: number }>;
  viewport?: { zoom: number; pan: { x: number; y: number } };
  physicalHierarchy?: {
    buildings: string[];
    floors: Record<string, string[]>;
    units: Record<string, string[]>;
    racks: Record<string, string[]>;
  };
  deviceGroups?: DeviceGroup[];
  localUsers?: LocalUser[];
  localGroups?: LocalGroup[];
  activeDirectory?: ActiveDirectoryConfig;
  accessPolicies?: AccessPolicy[];
  templates?: ConfigTemplate[];
  // If encrypted, the encrypted payload blob
  encryptedData?: string;
  salt?: string;
  iv?: string;
}

export interface BackupAuditEntry {
  id: string;
  timestamp: string;
  action: 'export' | 'export_blocked' | 'import_success' | 'import_failed' | 'import_blocked' | 'rollback';
  username: string;
  role: string;
  fileName?: string;
  fileSizeKb?: number;
  scope: string;
  itemCount: number;
  status: 'success' | 'warning' | 'error';
  details: string;
  checksum?: string;
}

// ==========================================
// Centralized Enterprise Audit & Activity Logs System
// ==========================================

export type AuditLogCategory = 
  | 'user_management'
  | 'rbac_policy'
  | 'device_inventory'
  | 'backup_recovery'
  | 'topology_network'
  | 'port_interface'
  | 'system_auth';

export type AuditLogSeverity = 'info' | 'notice' | 'warning' | 'critical';
export type AuditLogStatus = 'success' | 'failed' | 'denied';

export interface AuditActor {
  username: string;
  role: string;
  ipAddress?: string;
}

export interface AuditTarget {
  type: 'user' | 'group' | 'policy' | 'device' | 'backup' | 'map' | 'port' | 'template';
  id?: string;
  name: string;
  ip?: string;
  model?: string;
  vendor?: string;
  location?: string; // e.g. "ساختمان مرکزی > طبقه ۲ > اتاق IT > رک B02"
  portsCount?: number;
  metadata?: Record<string, any>;
}

export interface PortalAuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  category: AuditLogCategory;
  action: string;
  title: string;
  title_en: string;
  actor: AuditActor;
  target: AuditTarget;
  severity: AuditLogSeverity;
  status: AuditLogStatus;
  details: string;
  details_en: string;
  changesDiff?: {
    field: string;
    before?: any;
    after?: any;
  }[];
}

export type CommandRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type CommandChannel = 
  | 'terminal_interactive'
  | 'template_push'
  | 'port_context_menu'
  | 'batch_config'
  | 'api_script';

export interface DeviceCommandLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  actor: AuditActor;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  deviceVendor: 'cisco' | 'mikrotik' | 'linux' | 'generic';
  deviceModel?: string;
  deviceLocation: string;
  channel: CommandChannel;
  command: string;
  riskLevel: CommandRiskLevel;
  status: 'success' | 'failed' | 'denied';
  outputSummary?: string;
  durationMs?: number;
  notes?: string;
}

// -------------------------------------------------------------
// MikroTik VPN Types & Protocols Suite
// -------------------------------------------------------------

export type VPNType =
  | 'l2tp_ipsec'
  | 'gre'
  | 'wireguard'
  | 'openvpn'
  | 'sstp'
  | 'pptp'
  | 'ipsec'
  | 'ipsec_site_to_site'
  | 'eoip'
  | 'vxlan';

export type VPNMode = 'remote_access' | 'site_to_site' | 'tunnel' | 'client' | 'overlay';

export interface VPNUserConfig {
  username: string;
  password?: string;
  comment?: string;
  disabled?: boolean;
}

export interface VPNRouteConfig {
  dst: string;
  gateway?: string;
  distance?: number;
  comment?: string;
}

export interface WireGuardPeerConfig {
  public_key: string;
  allowed_address?: string;
  allowed_ips?: string;
  endpoint_address?: string;
  endpoint_port?: number;
  preshared_key?: string;
  comment?: string;
}

export interface VXLANVtepConfig {
  remote_ip: string;
  port?: number;
}

export interface RouterCertificate {
  name: string;
  common_name: string;
  ca: boolean;
  expired: boolean;
}

export interface VPNConfigPayload {
  name?: string;
  role?: 'server' | 'client';
  pool_name?: string;
  pool_ranges?: string;
  pool_start?: string;
  pool_end?: string;
  local_address?: string;
  remote_address?: string;
  connect_to?: string;
  tunnel_ip?: string;
  mtu?: number;
  port?: number;
  listen_port?: number;
  keepalive?: string;
  ipsec_secret?: string;
  secret?: string;
  profile_name?: string;
  dns_servers?: string[];
  users?: VPNUserConfig[];
  routes?: VPNRouteConfig[];
  comment?: string;
  user?: string;
  password?: string;
  // Certificate & SSL
  certificate?: string;
  require_client_certificate?: boolean;
  protocol?: 'tcp' | 'udp';
  auth?: string;
  cipher?: string;
  // WireGuard
  private_key?: string;
  public_key?: string;
  peers?: WireGuardPeerConfig[];
  // IPsec Site-to-Site
  peer_address?: string;
  preshared_key?: string;
  local_subnet?: string;
  remote_subnet?: string;
  exchange_mode?: string;
  ike_version?: string;
  auth_algorithm?: string;
  enc_algorithm?: string;
  proposal_enc_algorithms?: string[];
  proposal_auth_algorithms?: string[];
  proposal_pfs_group?: string;
  nat_traversal?: boolean;
  // EoIP & L2
  tunnel_id?: number;
  bridge?: string;
  mac_address?: string;
  // VXLAN
  vni?: number;
  vteps?: VXLANVtepConfig[];
}

export interface VPNItem {
  id: string;
  name: string;
  type: VPNType;
  mode: VPNMode;
  status: 'up' | 'standby' | 'down' | 'disabled';
  interface: string;
  profile?: string;
  ipsec_enabled?: boolean;
  active_sessions?: number;
  details?: Record<string, any>;
}

export interface VPNCapabilitiesResponse {
  platform: string;
  platform_name: string;
  firmware: string;
  routeros_major_version: number;
  phase: number;
  available_vpns: Array<{
    vpn_type: string;
    name: string;
    description: string;
    supported_modes: Array<{
      mode: string;
      label: string;
      description: string;
      default_port?: number;
      default_mtu?: number;
    }>;
    ipsec_profiles?: string[];
    supported_ciphers?: string[];
    supports_keepalive?: boolean;
    supports_ipsec_secret?: boolean;
    default_mtu?: number;
  }>;
  supported_catalog: Array<{
    type: string;
    name: string;
    description: string;
    status: 'available' | 'coming_soon' | 'disabled';
    modes: string[];
    phase: number;
    recommended_for?: string[];
    note?: string;
  }>;
}

export interface VPNValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface VPNPreviewResult {
  vpn_type: string;
  mode: string;
  commands: string[];
  script?: string;
  count: number;
}

export interface VPNAppliedStep {
  step: number;
  command: string;
  status: 'success' | 'failed';
}

export interface VPNVerificationDetails {
  vpn_id: string;
  vpn_type: string;
  operational_status: 'up' | 'standby' | 'down' | 'disabled';
  server_enabled?: boolean;
  active_users_count?: number;
  active_users?: Array<{ name: string; service: string; caller_id: string }>;
  ipsec_phase2_up?: boolean;
  raw_server_output?: string;
  verified_at?: string;
  interface_exists?: boolean;
  is_running?: boolean;
  is_disabled?: boolean;
  actual_mtu?: number;
  assigned_ip?: string;
  routes_count?: number;
}

export interface VPNApplyResult {
  success: boolean;
  vpn_id?: string;
  vpn_type?: string;
  mode?: string;
  applied_steps?: VPNAppliedStep[];
  verification?: VPNVerificationDetails;
  message?: string;
  error?: string;
  failed_step?: {
    step_index: number;
    command: string;
    error: string;
  };
  rollback?: {
    attempted: boolean;
    success: boolean;
    steps: Array<{ action: string; success: boolean; error?: string }>;
  };
}

export interface MikroTikVPNItem {
  id: string;
  name: string;
  type: 'wireguard' | 'l2tp_ipsec' | 'ipsec_site_to_site' | 'gre' | 'eoip' | 'sstp' | 'openvpn' | 'vxlan' | 'pptp' | string;
  mode: 'remote_access' | 'site_to_site' | 'tunnel' | 'overlay' | string;
  status: 'up' | 'standby' | 'down' | 'disabled' | string;
  interface?: string;
  profile?: string;
  ipsec_enabled?: boolean;
  active_sessions?: number;
  details?: Record<string, any>;
}

export interface MikroTikVPNCapabilities {
  platform: string;
  platform_name: string;
  firmware: string;
  routeros_major_version: number;
  vpn: {
    wireguard: boolean;
    l2tp_ipsec: boolean;
    ipsec_site_to_site: boolean;
    gre: boolean;
    eoip: boolean;
    sstp: boolean;
    openvpn: boolean;
    vxlan: boolean;
    pptp: boolean;
    [key: string]: boolean;
  };
  available_vpns: Array<{
    type: string;
    name: string;
    description: string;
    supported_modes: string[];
    [key: string]: any;
  }>;
  supported_catalog: Array<{
    type: string;
    name: string;
    description: string;
    status: 'available' | 'unsupported' | string;
    unsupported_reason?: string | null;
    modes: string[];
    recommended?: boolean;
    recommended_for?: string[];
  }>;
}

export interface VPNDeleteResult {
  success: boolean;
  vpn_id: string;
  message: string;
  steps?: Array<{ command: string; success: boolean }>;
}

// -------------------------------------------------------------
// Bulk Device Configuration Interfaces
// -------------------------------------------------------------
export interface BulkConfigParameter {
  name: string;
  labelFa: string;
  labelEn: string;
  type: 'string' | 'number' | 'password' | 'select' | 'textarea' | 'boolean';
  required: boolean;
  placeholder?: string;
  default?: any;
  options?: Array<{ value: string; labelFa: string; labelEn: string }>;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkConfigTemplate {
  id: string;
  category: string;
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  icon: string;
  parameters: BulkConfigParameter[];
  is_dangerous: boolean;
  confirmation_keyword: string;
  supports_backup: boolean;
  supports_idempotency: boolean;
  default_timeout_sec: number;
  requires_save_step: boolean;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkDevicePreviewStep {
  name: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  mode: string;
}

export interface BulkDevicePreviewItem {
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  platform: string;
  mapperName: string;
  preCheckCommand: string | null;
  backupCommand: string | null;
  steps: BulkDevicePreviewStep[];
  saveCommand: string | null;
  isDangerous: boolean;
  confirmationKeyword: string;
  estimatedTimeoutSec: number;
}

export interface BulkDeviceStepDetail {
  stepIndex: number;
  stepName: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  status: 'running' | 'success' | 'failed';
  output?: string;
  errorType?: string;
  errorMessageFa?: string;
  errorMessageEn?: string;
  durationMs?: number;
}

export interface BulkDeviceExecutionResult {
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  platform: string;
  status: 'success' | 'failed' | 'partial' | 'skipped';
  errorType?: string;
  errorMessageFa?: string;
  errorMessageEn?: string;
  stepsTotal: number;
  stepsCompleted: number;
  stepsDetail: BulkDeviceStepDetail[];
  rawOutput?: string;
  backupId?: string;
  backupSuccess?: boolean;
  backupPreview?: string;
  durationMs: number;
  retryCount: number;
  executedAt: number;
}

export interface BulkJobLog {
  timestamp: number;
  timeStr: string;
  level: 'info' | 'warning' | 'error' | 'success';
  messageFa: string;
  messageEn: string;
  deviceId?: string;
}

export interface BulkJobStatus {
  jobId: string;
  templateId: string;
  templateTitle: string;
  templateTitleEn: string;
  parameters: Record<string, any>;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalDevices: number;
  completedDevices: number;
  percentage: number;
  currentDeviceIndex: number;
  currentDeviceName: string;
  currentStepName: string;
  successCount: number;
  failedCount: number;
  partialCount: number;
  skippedCount: number;
  options: {
    timeoutSec: number;
    delayMs: number;
    autoBackup: boolean;
    saveAfterApply: boolean;
  };
  results: Record<string, BulkDeviceExecutionResult>;
  logs: BulkJobLog[];
}

// -------------------------------------------------------------
// Bulk Linux Server Configuration Interfaces
// -------------------------------------------------------------
export interface BulkServerParameter {
  name: string;
  labelFa: string;
  labelEn: string;
  type: 'string' | 'number' | 'password' | 'select' | 'textarea' | 'boolean';
  required: boolean;
  placeholder?: string;
  default?: any;
  options?: Array<{ value: string; labelFa: string; labelEn: string }>;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkServerTemplate {
  id: string;
  category: 'maintenance' | 'security' | 'network' | 'users' | 'cron' | 'storage' | 'firewall' | 'services' | 'docker' | 'custom' | string;
  title: string;
  title_en: string;
  description: string;
  description_en: string;
  icon: string;
  parameters: BulkServerParameter[];
  is_dangerous: boolean;
  confirmation_keyword: string;
  default_timeout_sec: number;
  supported_distros?: string[];
  idempotent?: boolean;
  requires_sudo?: boolean;
  info_what_fa?: string;
  info_what_en?: string;
  info_why_fa?: string;
  info_why_en?: string;
  info_example_fa?: string;
  info_example_en?: string;
}

export interface BulkServerPreviewStep {
  name: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  distro: string;
  requiresSudo?: boolean;
}

export interface BulkServerPreviewItem {
  serverId: string;
  serverName: string;
  serverIp: string;
  osType: string;
  osDistro: string;
  distroFamily: string;
  steps: BulkServerPreviewStep[];
  isDangerous: boolean;
  confirmationKeyword: string;
  estimatedTimeoutSec: number;
  distroMapperName?: string;
  idempotencyCheck?: string;
  rollbackCommand?: string;
}

export interface BulkServerStepDetail {
  stepIndex: number;
  stepName: string;
  command: string;
  descriptionFa: string;
  descriptionEn: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  errorMessageFa?: string;
  errorMessageEn?: string;
}

export interface BulkServerExecutionResult {
  serverId: string;
  serverName: string;
  serverIp: string;
  osType: string;
  osDistro: string;
  distroFamily: string;
  status: 'success' | 'failed' | 'partial' | 'skipped';
  stepsTotal: number;
  stepsCompleted: number;
  stepsDetail: BulkServerStepDetail[];
  rawOutput?: string;
  durationMs: number;
  executedAt: number;
  errorType?: string;
  errorMessageFa?: string;
  errorMessageEn?: string;
}

export interface BulkServerJobLog {
  timestamp: number;
  timeStr: string;
  level: 'info' | 'warning' | 'error' | 'success';
  messageFa: string;
  messageEn: string;
  serverId?: string;
}

export interface BulkServerJobStatus {
  jobId: string;
  templateId: string;
  templateTitle: string;
  templateTitleEn: string;
  parameters: Record<string, any>;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  totalServers: number;
  completedServers: number;
  percentage: number;
  currentServerIndex: number;
  currentServerName: string;
  currentStepName: string;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  partialCount?: number;
  options: {
    timeoutSec: number;
    delayMs: number;
    dangerConfirmation?: string;
  };
  results: Record<string, BulkServerExecutionResult>;
  logs: BulkServerJobLog[];
}

export interface BulkServerImpactAnalysis {
  actionsSummaryFa: string;
  actionsSummaryEn: string;
  affectedPaths: string[];
  createdFiles: string[];
  modifiedConfigs: string[];
  securityImplicationsFa?: string[];
  securityImplicationsEn?: string[];
}

export interface BulkServerReportServerSummary {
  serverId: string;
  serverName: string;
  serverIp: string;
  osDistro: string;
  distroFamily: string;
  status: 'success' | 'failed' | 'partial' | 'skipped';
  durationMs: number;
  error?: string;
}

export interface BulkServerExecutionReport {
  id: string;
  jobId: string;
  templateId: string;
  templateTitle: string;
  templateTitleEn: string;
  category: string;
  icon: string;
  operatorUser: string;
  createdAt: number;
  finishedAt: number;
  durationMs: number;
  status: 'completed' | 'failed' | 'cancelled' | 'partial';
  totalServers: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  parameters: Record<string, any>;
  impactAnalysis: BulkServerImpactAnalysis;
  serverSummaries: BulkServerReportServerSummary[];
  results: Record<string, BulkServerExecutionResult>;
  logs: BulkServerJobLog[];
}

export interface RemoteServer {
  id: string;
  name: string;
  hostname?: string;
  ip: string;
  os_type: 'linux' | 'windows';
  os_distro?: string;
  category: 'Infrastructure' | 'Database' | 'Kubernetes' | 'Web / App' | 'Monitoring' | 'Active Directory' | 'General' | string;
  environment: 'Production' | 'Staging' | 'Development' | 'DMZ' | string;
  tags: string[];
  role?: string;
  description?: string;
  status: 'online' | 'offline' | 'unreachable' | 'maintenance' | 'untested';
  ssh_port?: number;
  ssh_username?: string;
  ssh_password?: string;
  default_shell?: 'bash' | 'zsh' | 'sh';
  win_protocol?: 'rdp' | 'powershell' | 'winrm' | 'ssh';
  win_port?: number;
  win_domain?: string;
  win_username?: string;
  win_password?: string;
  vnc_port?: number;
  vnc_username?: string;
  vnc_password?: string;
  prompt_password_on_connect?: boolean;
  cpu_cores?: number;
  ram_gb?: number;
  disk_gb?: number;
  uptime_str?: string;
  location?: string;
  notes?: string;
  watchdogs?: LinuxServiceWatchdogRule[];
  installed_web_servers?: ('apache' | 'nginx' | string)[];
  installed_databases?: ('postgresql' | 'mysql' | string)[];
  has_apache?: boolean;
  has_nginx?: boolean;
  has_postgresql?: boolean;
  has_mysql?: boolean;
  postgres_port?: number;
  postgres_user?: string;
  postgres_password?: string;
  postgres_password_set?: boolean;
  postgres_database?: string;
  created_at?: string;
  updated_at?: string;
}

export type PostgresConnectionStatus =
  | 'connected'
  | 'connection_failed'
  | 'authentication_failed'
  | 'connection_refused'
  | 'timeout'
  | 'permission_denied'
  | 'database_unavailable'
  | 'unknown_error';

export interface PostgresConnectionTestResult {
  success: boolean;
  status: PostgresConnectionStatus;
  message: string;
  messageFa?: string;
  serverAddress: string;
  port: number;
  username: string;
  database?: string;
  version?: string;
  inRecovery?: boolean;
  latencyMs?: number;
  testedAt: string;
  errorDetail?: string;
}

export interface PostgresEngineOverview {
  serverAddress: string;
  port: number;
  connectedUser: string;
  connectedDatabase: string;
  version: string;
  versionShort: string;
  uptimeSeconds: number;
  uptimePretty: string;
  startTime: string;
  dataDirectory: string;
  walLevel: string;
  inRecovery: boolean;
  clusterRole: 'primary' | 'standby';
  maxConnections: number;
  sharedBuffers: string;
  workMem: string;
  connections: {
    total: number;
    active: number;
    idle: number;
    idleInTransaction: number;
    waiting: number;
    usedPercentage: number;
  };
  telemetry: {
    totalDatabases: number;
    totalCommits: number;
    totalRollbacks: number;
    totalBlocksRead: number;
    totalBlocksHit: number;
    cacheHitRatio: number;
  };
  fetchedAt: string;
}

export interface PostgresDatabaseItem {
  oid: string;
  name: string;
  owner: string;
  encoding: string;
  collation: string;
  ctype: string;
  isTemplate: boolean;
  allowConnections: boolean;
  connectionLimit: number;
  tablespace: string;
  sizeBytes: number | null;
  sizePretty: string;
  activeConnections: number;
}

// Phase 3: PostgreSQL Database Browser & Object Tree Types
export interface PostgresRoleItem {
  rolname: string;
  isSuperuser: boolean;
  canLogin: boolean;
  createDb: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  connectionLimit: number;
  validUntil: string | null;
  memberOf?: string[];
  members?: string[];
  comment?: string | null;
}

export interface PostgresTableItem {
  name: string;
  schema: string;
  owner: string;
  estimatedRows: number;
  sizePretty: string;
  sizeBytes: number | null;
  tableSizePretty?: string;
  indexSizePretty?: string;
  toastSizePretty?: string;
  columnCount?: number;
  hasPrimaryKey?: boolean;
  isPartitioned?: boolean;
  hasIndexes: boolean;
  hasTriggers: boolean;
  persistence: 'permanent' | 'temporary' | 'unlogged';
}

export interface PostgresViewItem {
  name: string;
  schema: string;
  owner: string;
  isMaterialized: boolean;
  sizePretty?: string;
  definition?: string;
  columnCount?: number;
  checkOption?: string;
  isUpdatable?: boolean;
}

export interface PostgresRoutineItem {
  name: string;
  schema: string;
  owner: string;
  type: 'function' | 'procedure';
  language: string;
  returnType: string;
  argumentTypes: string;
  isAggregate: boolean;
  volatility?: 'IMMUTABLE' | 'STABLE' | 'VOLATILE';
  isSecurityDefiner?: boolean;
  sourceCode?: string;
}

export interface PostgresSequenceItem {
  name: string;
  schema: string;
  owner: string;
  dataType?: string;
  startValue?: string;
  minValue?: string;
  maxValue?: string;
  increment?: string;
  isCycled?: boolean;
  lastValue?: string;
  cacheSize?: string;
}

export interface PostgresTypeItem {
  name: string;
  schema: string;
  owner: string;
  kind: 'enum' | 'composite' | 'domain' | 'base' | 'range' | 'other';
  enumLabels?: string[];
  baseType?: string;
  description?: string;
}

export interface PostgresExtensionItem {
  name: string;
  version: string;
  schema: string;
  description: string;
  relocatable: boolean;
}

export interface PostgresSchemaObjects {
  name: string;
  owner: string;
  sizePretty?: string;
  description?: string;
  tables: PostgresTableItem[];
  views: PostgresViewItem[];
  materializedViews: PostgresViewItem[];
  functions: PostgresRoutineItem[];
  procedures: PostgresRoutineItem[];
  sequences: PostgresSequenceItem[];
  types: PostgresTypeItem[];
}

export interface PostgresDatabaseTree {
  databaseName: string;
  schemas: PostgresSchemaObjects[];
  extensions: PostgresExtensionItem[];
  totalTables: number;
  totalViews: number;
  totalMaterializedViews: number;
  totalFunctions: number;
  totalProcedures: number;
  totalSequences: number;
  totalTypes: number;
  totalExtensions: number;
  fetchedAt: string;
}

// ==========================================
// Phase 5: Table Structure & Metadata Types
// ==========================================

export interface PostgresColumnStructure {
  attnum: number;
  name: string;
  dataType: string;
  formattedType: string;
  isNullable: boolean;
  defaultValue: string | null;
  isIdentity: boolean;
  identityGeneration?: string;
  isGenerated: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  hasCheckConstraint: boolean;
  comment?: string;
  collation?: string;
}

export interface PostgresPrimaryKeyConstraint {
  name: string;
  columns: string[];
  definition?: string;
}

export interface PostgresForeignKeyConstraint {
  name: string;
  columns: string[];
  foreignSchema: string;
  foreignTable: string;
  foreignColumns: string[];
  onUpdate: string;
  onDelete: string;
  matchType?: string;
  definition?: string;
}

export interface PostgresUniqueConstraint {
  name: string;
  columns: string[];
  definition?: string;
}

export interface PostgresCheckConstraint {
  name: string;
  columns?: string[];
  clause: string;
  noInherit?: boolean;
  isValidated?: boolean;
}

export interface PostgresIndexDetail {
  name: string;
  definition: string;
  isPrimary: boolean;
  isUnique: boolean;
  isValid: boolean;
  accessMethod: string;
  columns: string[];
  sizePretty: string;
  sizeBytes: number | null;
  scansCount: number;
  tuplesRead: number;
  tuplesFetched: number;
  comment?: string;
}

export interface PostgresTableMetadataStats {
  schemaName: string;
  tableName: string;
  owner: string;
  persistence: 'permanent' | 'temporary' | 'unlogged';
  isPartitioned: boolean;
  partitionKey?: string;
  tablespace?: string;
  estimatedRows: number;
  totalSizePretty: string;
  totalSizeBytes: number;
  tableSizePretty: string;
  tableSizeBytes: number;
  indexSizePretty: string;
  indexSizeBytes: number;
  toastSizePretty: string;
  toastSizeBytes: number;
  columnsCount: number;
  primaryKeyCount: number;
  foreignKeyCount: number;
  uniqueConstraintCount: number;
  checkConstraintCount: number;
  indexCount: number;
  seqScans: number;
  seqTuplesRead: number;
  idxScans: number;
  idxTuplesFetched: number;
  nTuplesIns: number;
  nTuplesUpd: number;
  nTuplesDel: number;
  nTuplesHotUpd: number;
  nLiveTuples: number;
  nDeadTuples: number;
  lastVacuum?: string;
  lastAutoVacuum?: string;
  lastAnalyze?: string;
  lastAutoAnalyze?: string;
  comment?: string;
}

export interface PostgresTableStructure {
  databaseName: string;
  schemaName: string;
  tableName: string;
  metadata: PostgresTableMetadataStats;
  columns: PostgresColumnStructure[];
  primaryKey: PostgresPrimaryKeyConstraint | null;
  foreignKeys: PostgresForeignKeyConstraint[];
  uniqueConstraints: PostgresUniqueConstraint[];
  checkConstraints: PostgresCheckConstraint[];
  indexes: PostgresIndexDetail[];
  fetchedAt: string;
}

// ==========================================
// Phase 6: Table Data Viewer Types
// ==========================================

export type PostgresFilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'isNull'
  | 'isNotNull';

export interface PostgresTableDataFilter {
  column: string;
  operator: PostgresFilterOperator;
  value?: string;
}

export interface PostgresTableDataRequest {
  database: string;
  schema: string;
  table: string;
  page?: number;
  pageSize?: number;
  sortColumn?: string;
  sortDirection?: 'ASC' | 'DESC';
  search?: string;
  filters?: PostgresTableDataFilter[];
  countExact?: boolean;
}

export interface PostgresTableDataColumnInfo {
  name: string;
  dataType: string;
  formattedType: string;
  isPrimaryKey: boolean;
}

export interface PostgresTableDataResult {
  databaseName: string;
  schemaName: string;
  tableName: string;
  columns: PostgresTableDataColumnInfo[];
  rows: Record<string, any>[];
  totalRows: number;
  isExactCount: boolean;
  page: number;
  pageSize: number;
  totalPages: number;
  executionTimeMs: number;
  fetchedAt: string;
}

// Phase 7: Table Data Editing Types
export interface PostgresRowColumnValue {
  value: any;
  isNull?: boolean;
  isDefault?: boolean;
}

export interface PostgresRowInsertRequest {
  database: string;
  schema: string;
  table: string;
  values: Record<string, PostgresRowColumnValue>;
  port?: number;
  user?: string;
  password?: string;
}

export interface PostgresRowUpdateRequest {
  database: string;
  schema: string;
  table: string;
  primaryKeyValues?: Record<string, any>;
  ctid?: string;
  originalRow?: Record<string, any>;
  updatedValues: Record<string, PostgresRowColumnValue>;
  port?: number;
  user?: string;
  password?: string;
}

export interface PostgresRowDeleteRequest {
  database: string;
  schema: string;
  table: string;
  primaryKeyValues?: Record<string, any>;
  ctid?: string;
  originalRow?: Record<string, any>;
  port?: number;
  user?: string;
  password?: string;
}

export interface PostgresRowMutationResult {
  success: boolean;
  operation: 'insert' | 'update' | 'delete';
  affectedRows: number;
  data?: Record<string, any>;
  executionTimeMs?: number;
  message?: string;
  messageFa?: string;
  error?: string;
  errorFa?: string;
}

// ==========================================
// Phase 8: SQL Query Editor & Workspace Types
// ==========================================

export interface PostgresQueryExecutionRequest {
  database: string;
  schema?: string;
  query: string;
  maxRows?: number;
  explain?: boolean;
  confirmedDestructive?: boolean;
  auditNotes?: string;
  port?: number;
  user?: string;
  password?: string;
}

export interface PostgresQueryColumnField {
  name: string;
  dataTypeId?: number;
  dataTypeName?: string;
  tableId?: number;
  columnId?: number;
}

export interface PostgresQueryStatementResult {
  command: string;
  rowCount: number;
  fields: PostgresQueryColumnField[];
  rows: Record<string, any>[];
  durationMs: number;
  isTruncated?: boolean;
  totalRowsReturned?: number;
}

export interface PostgresQueryExecutionError {
  message: string;
  code?: string;
  position?: number;
  line?: number;
  column?: number;
  detail?: string;
  hint?: string;
  where?: string;
  schema?: string;
  table?: string;
  internalQuery?: string;
}

// ==========================================
// Phase 9: SQL Safety & Query Execution Controls
// ==========================================

export type PostgresSqlClassificationType =
  | 'read_only'
  | 'write'
  | 'ddl'
  | 'administrative'
  | 'destructive';

export type PostgresSqlRiskLevel =
  | 'safe'
  | 'low'
  | 'moderate'
  | 'high'
  | 'critical';

export interface PostgresSqlStatementAnalysis {
  sql: string;
  command: string;
  type: PostgresSqlClassificationType;
  riskLevel: PostgresSqlRiskLevel;
  isDestructive: boolean;
  targetObject?: string;
  reasons: string[];
  reasonsFa: string[];
}

export interface PostgresSqlQuerySafetyReport {
  overallType: PostgresSqlClassificationType;
  overallRiskLevel: PostgresSqlRiskLevel;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  statementCount: number;
  destructiveReasons: string[];
  destructiveReasonsFa: string[];
  statements: PostgresSqlStatementAnalysis[];
}

export interface PostgresQueryExecutionResponse {
  success: boolean;
  results?: PostgresQueryStatementResult[];
  totalDurationMs?: number;
  executedAt?: string;
  safetyReport?: PostgresSqlQuerySafetyReport;
  requiresConfirmation?: boolean;
  error?: PostgresQueryExecutionError;
  errorFa?: string;
}

export interface PostgresQueryTab {
  id: string;
  title: string;
  query: string;
  database: string;
  schema?: string;
  isExecuting?: boolean;
  lastResult?: PostgresQueryExecutionResponse | null;
  createdAt: number;
  updatedAt: number;
}

export interface PostgresQueryHistoryItem {
  id: string;
  query: string;
  database: string;
  schema?: string;
  timestamp: string;
  success: boolean;
  durationMs: number;
  rowCount: number;
  command?: string;
  classificationType?: PostgresSqlClassificationType;
  riskLevel?: PostgresSqlRiskLevel;
  errorMessage?: string;
}

// ==========================================
// Phase 10: PostgreSQL Users & Roles Management
// ==========================================

export interface PostgresRoleCreateRequest {
  rolname: string;
  canLogin: boolean;
  isSuperuser?: boolean;
  createDb?: boolean;
  createRole?: boolean;
  replication?: boolean;
  bypassRls?: boolean;
  connectionLimit?: number;
  validUntil?: string | null;
  password?: string;
  memberOf?: string[];
  comment?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresRoleUpdateRequest {
  rolname: string;
  canLogin?: boolean;
  isSuperuser?: boolean;
  createDb?: boolean;
  createRole?: boolean;
  replication?: boolean;
  bypassRls?: boolean;
  connectionLimit?: number;
  validUntil?: string | null;
  comment?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresRolePasswordChangeRequest {
  rolname: string;
  newPassword: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresRoleMembershipRequest {
  roleName: string;
  memberRole: string;
  action: 'grant' | 'revoke';
  adminOption?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresRoleDropRequest {
  rolname: string;
  reassignOwnedTo?: string;
  dropOwned?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresRoleOperationResult {
  success: boolean;
  operation: 'create' | 'update' | 'password' | 'membership' | 'drop';
  message: string;
  messageFa: string;
  roleName?: string;
  error?: string;
  errorFa?: string;
}

// ==========================================
// Phase 11: Permissions & Access Management
// ==========================================

export type PostgresObjectScope = 'database' | 'schema' | 'table' | 'sequence' | 'function';

export type PostgresPrivilegeType =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'TRUNCATE'
  | 'REFERENCES'
  | 'TRIGGER'
  | 'USAGE'
  | 'CREATE'
  | 'CONNECT'
  | 'TEMPORARY'
  | 'EXECUTE';

export interface PostgresRoleGrantPrivilege {
  privilege: PostgresPrivilegeType;
  isGrantable: boolean;
}

export interface PostgresRolePermissionsEntry {
  roleName: string;
  isSuperuser?: boolean;
  isOwner?: boolean;
  privileges: PostgresRoleGrantPrivilege[];
}

export interface PostgresObjectPermissionsInfo {
  scope: PostgresObjectScope;
  database: string;
  schema?: string;
  objectName: string;
  owner: string;
  allRoles: string[];
  roleGrants: PostgresRolePermissionsEntry[];
  applicablePrivileges: PostgresPrivilegeType[];
  fetchedAt: string;
}

export interface PostgresPermissionDelta {
  roleName: string;
  privilege: PostgresPrivilegeType;
  action: 'grant' | 'revoke';
  withGrantOption?: boolean;
}

export interface PostgresApplyPermissionsRequest {
  scope: PostgresObjectScope;
  database: string;
  schema?: string;
  objectName: string;
  deltas: PostgresPermissionDelta[];
  cascade?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresApplyPermissionsResult {
  success: boolean;
  executedQueries: string[];
  message: string;
  messageFa: string;
  error?: string;
  errorFa?: string;
}

// ==========================================
// Phase 12: Database & Schema Lifecycle Management
// ==========================================

export interface PostgresCreateDatabaseRequest {
  name: string;
  owner?: string;
  template?: string;
  encoding?: string;
  lcCollate?: string;
  lcCtype?: string;
  tablespace?: string;
  connectionLimit?: number;
  isTemplate?: boolean;
  allowConnections?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresUpdateDatabaseRequest {
  name: string;
  newName?: string;
  owner?: string;
  connectionLimit?: number;
  allowConnections?: boolean;
  isTemplate?: boolean;
  tablespace?: string;
  comment?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresDropDatabaseRequest {
  name: string;
  forceWithDisconnect?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresCreateSchemaRequest {
  database: string;
  name: string;
  owner?: string;
  comment?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresUpdateSchemaRequest {
  database: string;
  name: string;
  newName?: string;
  owner?: string;
  comment?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresDropSchemaRequest {
  database: string;
  name: string;
  cascade?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresSchemaItem {
  name: string;
  owner: string;
  tableCount: number;
  viewCount: number;
  routineCount: number;
  sizePretty: string;
  comment: string | null;
}

export interface PostgresDbLifecycleResult {
  success: boolean;
  message: string;
  messageFa: string;
  databaseName?: string;
  schemaName?: string;
  error?: string;
  errorFa?: string;
}

// ==========================================
// Phase 13: Backup & Restore / Dump & Export
// ==========================================

export type PostgresBackupMode = 'full' | 'schema_only' | 'data_only';
export type PostgresBackupFormat = 'plain' | 'custom' | 'tar';

export interface PostgresBackupItem {
  id: string;
  filename: string;
  database: string;
  sizeBytes: number;
  sizePretty: string;
  mode: PostgresBackupMode;
  format: PostgresBackupFormat;
  createdAt: string;
  tablesCount?: number;
  schemasCount?: number;
  schemas?: string[];
  tables?: string[];
  compressionLevel?: number;
  downloadUrl?: string;
  engineUsed: 'native_pg_dump' | 'logical_sql_dumper';
}

export interface PostgresCreateBackupRequest {
  database: string;
  mode: PostgresBackupMode;
  format: PostgresBackupFormat;
  schemas?: string[];
  tables?: string[];
  includeDrop?: boolean;
  useInserts?: boolean;
  compressionLevel?: number;
  customFilename?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresCreateBackupResult {
  success: boolean;
  backup?: PostgresBackupItem;
  message: string;
  messageFa: string;
  error?: string;
  errorFa?: string;
  durationMs?: number;
  sqlDumpPreview?: string;
}

export interface PostgresRestoreBackupRequest {
  database: string;
  filename: string;
  cleanFirst?: boolean;
  singleTransaction?: boolean;
  exitOnError?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresRestoreBackupResult {
  success: boolean;
  message: string;
  messageFa: string;
  executedStatementsCount?: number;
  durationMs?: number;
  error?: string;
  errorFa?: string;
  outputLog?: string;
}

// ==========================================
// Phase 14: PostgreSQL Extensions Management
// ==========================================

export interface PostgresExtensionItem {
  name: string;
  defaultVersion: string;
  installedVersion: string | null;
  comment: string;
  schemaName: string | null;
  isInstalled: boolean;
  isUpdatable: boolean;
  relocatable: boolean;
}

export interface PostgresInstallExtensionRequest {
  database: string;
  extensionName: string;
  schemaName?: string;
  version?: string;
  cascade?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresUpdateExtensionRequest {
  database: string;
  extensionName: string;
  targetVersion?: string;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresDropExtensionRequest {
  database: string;
  extensionName: string;
  cascade?: boolean;
  port?: number;
  user?: string;
  sessionPassword?: string;
}

export interface PostgresExtensionOperationResult {
  success: boolean;
  message: string;
  messageFa: string;
  error?: string;
  errorFa?: string;
  executedSql?: string;
}

// ==========================================
// Phase 15: PostgreSQL Health Check & Security Audit
// ==========================================

export type PostgresAuditSeverity = 'critical' | 'warning' | 'good' | 'info';
export type PostgresAuditCategory = 'security' | 'performance' | 'maintenance' | 'configuration';

export interface PostgresHealthCheckItem {
  id: string;
  title: string;
  titleFa: string;
  category: PostgresAuditCategory;
  severity: PostgresAuditSeverity;
  description: string;
  descriptionFa: string;
  metricValue: string;
  recommendation: string;
  recommendationFa: string;
  remediationSql?: string;
}

export interface PostgresHealthAuditSummary {
  cacheHitRatio: number;
  indexHitRatio: number;
  activeConnections: number;
  maxConnections: number;
  connectionUsagePercent: number;
  superusersCount: number;
  sslEnabled: boolean;
  bloatedTablesCount: number;
  unusedIndexesCount: number;
  idleInTxCount: number;
}

export interface PostgresHealthAuditReport {
  overallScore: number;
  generatedAt: string;
  database: string;
  serverVersion: string;
  uptime: string;
  totalChecks: number;
  passedCount: number;
  warningCount: number;
  criticalCount: number;
  summary: PostgresHealthAuditSummary;
  items: PostgresHealthCheckItem[];
}

// ============================================================================
// PHASE 16: pg_hba.conf / Client Authentication Management
// ============================================================================

export type PostgresHbaType = 'local' | 'host' | 'hostssl' | 'hostnossl' | 'hostgssenc' | 'hostnogssenc';

export type PostgresHbaAuthMethod =
  | 'scram-sha-256'
  | 'md5'
  | 'trust'
  | 'reject'
  | 'password'
  | 'peer'
  | 'cert'
  | 'gss'
  | 'sspi'
  | 'pam'
  | 'ldap'
  | 'radius';

export interface PostgresHbaRule {
  id: string;
  lineNumber: number;
  rawLine: string;
  type: PostgresHbaType;
  database: string;
  databaseList: string[];
  user: string;
  userList: string[];
  address?: string;
  netmask?: string;
  method: string;
  options?: string;
  comment?: string;
  enabled: boolean;
  error?: string;
}

export interface PostgresHbaBackupItem {
  name: string;
  path: string;
  sizeBytes: number;
  sizeHuman: string;
  createdAt: string;
}

export interface PostgresHbaFileMetadata {
  hbaFilePath: string;
  fileSize: number;
  fileSizeHuman: string;
  lastModified: string;
  readable: boolean;
  writable: boolean;
  totalRules: number;
  enabledRules: number;
  syntaxErrors: number;
  backups: PostgresHbaBackupItem[];
}

export interface PostgresHbaConfigData {
  metadata: PostgresHbaFileMetadata;
  rules: PostgresHbaRule[];
  rawContent: string;
}

export interface PostgresHbaSaveRequest {
  rules: PostgresHbaRule[];
  createBackup?: boolean;
  reloadPostgres?: boolean;
  sessionPassword?: string;
  database?: string;
  port?: number;
  user?: string;
}

export interface PostgresHbaSaveResult {
  success: boolean;
  message: string;
  messageFa?: string;
  backupPath?: string;
  diffText?: string;
  reloaded?: boolean;
  syntaxValid?: boolean;
  errors?: string[];
  rules?: PostgresHbaRule[];
}

export interface PostgresHbaRestoreRequest {
  backupFileName: string;
  reloadPostgres?: boolean;
  sessionPassword?: string;
  database?: string;
  port?: number;
  user?: string;
}

export interface NginxInstanceInfo {
  id: string;
  name: string;
  binaryPath: string;
  confPath?: string;
  prefixPath?: string;
  masterPid?: number;
  workerCount: number;
  user?: string;
  serviceName?: string;
  isPrimary: boolean;
  version?: string;
  status: 'active' | 'inactive' | 'unknown';
  commandLine?: string;
}

export interface NginxInstallationDetails {
  isInstalled: boolean;
  version?: string;
  binaryPath?: string;
  prefixPath?: string;
  confPath?: string;
  pidPath?: string;
  errorLogPath?: string;
  accessLogPath?: string;
  modulesPath?: string;
  serviceName?: string;
  serviceManager: 'systemd' | 'openrc' | 'init.d' | 'manual' | 'unknown';
  serviceActive: 'active' | 'inactive' | 'failed' | 'unknown';
  serviceEnabled: 'enabled' | 'disabled' | 'unknown';
  masterPid?: number;
  workerPids: number[];
  workerCount: number;
  compiledModules: string[];
  buildArguments: string[];
  osDistro?: string;
  osRelease?: string;
  osFamily: 'debian' | 'rhel' | 'alpine' | 'suse' | 'arch' | 'generic';
  packageManager?: 'apt' | 'dnf' | 'yum' | 'apk' | 'zypper' | 'source' | 'unknown';
  testedAt: string;
  configTestOk: boolean;
  configTestOutput?: string;
  instances?: NginxInstanceInfo[];
}

export interface ApacheInstanceInfo {
  id: string;
  name: string;
  binaryPath: string;
  confPath?: string;
  serverRoot?: string;
  masterPid?: number;
  workerCount: number;
  user?: string;
  serviceName?: string;
  isPrimary: boolean;
  version?: string;
  status: 'active' | 'inactive' | 'unknown';
  commandLine?: string;
}

export interface ApacheInstallationDetails {
  isInstalled: boolean;
  version?: string;
  binaryPath?: string;
  controlBinaryPath?: string;
  serverRoot?: string;
  confPath?: string;
  pidPath?: string;
  errorLogPath?: string;
  accessLogPath?: string;
  modulesPath?: string;
  serviceName?: string;
  serviceManager: 'systemd' | 'openrc' | 'init.d' | 'manual' | 'unknown';
  serviceActive: 'active' | 'inactive' | 'failed' | 'unknown';
  serviceEnabled: 'enabled' | 'disabled' | 'unknown';
  masterPid?: number;
  workerPids: number[];
  workerCount: number;
  activeMpm?: string;
  compiledModules: string[];
  loadedModules: string[];
  buildArguments: string[];
  osDistro?: string;
  osRelease?: string;
  osFamily: 'debian' | 'rhel' | 'alpine' | 'suse' | 'arch' | 'generic';
  packageManager?: 'apt' | 'dnf' | 'yum' | 'apk' | 'zypper' | 'source' | 'unknown';
  testedAt: string;
  configTestOk: boolean;
  configTestOutput?: string;
  instances?: ApacheInstanceInfo[];
}

export interface ApacheConfigTopologyTree {
  mainConfigPath: string;
  serverRoot: string;
  totalFiles: number;
  totalLines: number;
  files: ApacheConfigFileNode[];
  detectedContexts: {
    totalVirtualHosts: number;
    totalDirectories: number;
    totalLocations: number;
    totalProxyDirectives: number;
    totalSslBlocks: number;
    totalLoadedModules: number;
    listenPorts: number[];
  };
  warnings: string[];
}

export interface ApacheConfigFileNode {
  filePath: string;
  relativePath: string;
  sizeBytes: number;
  lineCount: number;
  permissions?: string;
  owner?: string;
  includedFrom?: string;
  level: number;
  includesCount: number;
  virtualHostsCount: number;
  directoriesCount: number;
  locationsCount: number;
  proxyPassCount: number;
  sslEnabled: boolean;
  hasCustomLog: boolean;
  hasErrorLog: boolean;
  loadModulesCount: number;
  contentSnippet?: string;
  fullContent?: string;
  error?: string;
}

export interface ApacheVirtualHost {
  id: string;
  serverName: string;
  serverAliases: string[];
  ipPort: string;
  port: number;
  isSsl: boolean;
  documentRoot?: string;
  proxyPassTargets: {
    path: string;
    target: string;
  }[];
  customLog?: string;
  errorLog?: string;
  serverAdmin?: string;
  definedInFile: string;
  fileRelativePath: string;
  lineStart?: number;
  lineEnd?: number;
  isEnabled: boolean;
  siteName: string;
  rawBlockSnippet: string;
}

export interface ApacheVirtualHostsSummary {
  totalVHosts: number;
  activeVHosts: number;
  disabledVHosts: number;
  sslVHosts: number;
  proxyVHosts: number;
  staticVHosts: number;
  vhosts: ApacheVirtualHost[];
  warnings: string[];
}

export interface CreateApacheVirtualHostParams {
  siteType: 'static' | 'proxy';
  siteName: string;
  serverName: string;
  serverAliases?: string;
  port?: number;
  serverAdmin?: string;
  documentRoot?: string;
  proxyTarget?: string;
  enableSsl?: boolean;
  sslCertFile?: string;
  sslKeyFile?: string;
  autoEnable?: boolean;
}

export interface ApacheProxyRoute {
  id: string;
  path: string;
  target: string;
  reverseTarget?: string;
  protocol: 'http' | 'https' | 'ws' | 'wss' | 'balancer' | 'unix';
  isBalancer: boolean;
  balancerName?: string;
  websocketEnabled: boolean;
  preserveHost: boolean;
  timeout?: number;
  connectTimeout?: number;
  sslBackend: boolean;
  sslVerify?: boolean;
  headers: { [key: string]: string };
  vhostId?: string;
  serverName?: string;
  definedInFile: string;
  fileRelativePath: string;
  lineStart?: number;
  rawSnippet?: string;
}

export interface ApacheBalancerMember {
  url: string;
  loadfactor?: number;
  status?: string;
  route?: string;
  isBackup?: boolean;
  isDrain?: boolean;
}

export interface ApacheBalancerPool {
  id: string;
  name: string;
  algorithm: 'byrequests' | 'bytraffic' | 'bybusyness' | 'heartbeat' | 'unknown';
  members: ApacheBalancerMember[];
  definedInFile: string;
  fileRelativePath: string;
  rawSnippet: string;
}

export interface ApacheProxyModuleRequirement {
  name: string;
  moduleName: string;
  isLoaded: boolean;
  isAvailable: boolean;
  purpose: string;
  purpose_fa: string;
  requiredFor: string;
}

export interface ApacheProxySummary {
  totalRoutes: number;
  totalBalancers: number;
  totalBalancerMembers: number;
  websocketRoutesCount: number;
  sslBackendCount: number;
  routes: ApacheProxyRoute[];
  balancers: ApacheBalancerPool[];
  moduleStatus: ApacheProxyModuleRequirement[];
  allRequiredModulesLoaded: boolean;
  missingModules: string[];
  warnings: string[];
}

export interface CreateApacheProxyRouteParams {
  vhostId?: string;
  siteName?: string;
  targetConfFile?: string;
  path: string;
  backendUrl: string;
  preserveHost: boolean;
  websocketSupport: boolean;
  timeout?: number;
  connectTimeout?: number;
  sslBackend: boolean;
  sslVerify?: boolean;
  customHeaders?: { name: string; value: string }[];
  isBalancer?: boolean;
  balancerName?: string;
  balancerAlgorithm?: 'byrequests' | 'bytraffic' | 'bybusyness';
  balancerMembers?: { url: string; loadfactor?: number }[];
  autoEnableModules?: boolean;
}

export interface ApacheModuleItem {
  name: string;
  rawName: string;
  moduleSymbol?: string;
  filename?: string;
  type: 'shared' | 'static';
  status: 'loaded' | 'enabled' | 'available' | 'disabled';
  isRequiredByConfig: boolean;
  requiredByDirectives: string[];
  category: 'core' | 'proxy' | 'security' | 'performance' | 'auth' | 'rewrite' | 'mpm' | 'other';
  descriptionEn: string;
  descriptionFa: string;
  sourceConfigPath?: string;
}

export interface ApacheMpmDetails {
  activeMpm: string;
  availableMpms: string[];
  isThreaded: boolean;
  mpmConfigPath?: string;
  workers: number;
  threadsPerChild?: number;
  maxRequestWorkers?: number;
  compatibilityWarning?: string;
  compatibilityWarning_fa?: string;
}

export interface ApacheModulesSummary {
  activeMpm: ApacheMpmDetails;
  totalModules: number;
  loadedCount: number;
  availableCount: number;
  disabledCount: number;
  staticCount: number;
  requiredCount: number;
  modules: ApacheModuleItem[];
  categories: string[];
  syntaxValid: boolean;
  syntaxOutput?: string;
}

export interface SwitchApacheMpmParams {
  targetMpm: 'event' | 'worker' | 'prefork' | string;
}

export interface ApacheCertificateAssociatedVHost {
  vhostId: string;
  serverName: string;
  definedInFile: string;
  port: number;
  sslEngine: boolean;
  h2Enabled: boolean;
  hstsEnabled: boolean;
  sslProtocol?: string;
  cipherSuite?: string;
}

export interface ApacheCertificateDetails {
  id: string;
  primaryDomain: string;
  allDomains: string[];
  certPath: string;
  keyPath?: string;
  chainPath?: string;
  caPath?: string;
  keyExists: boolean;
  certExists: boolean;
  certReadable: boolean;
  keyReadable: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  status: 'valid' | 'expiring_soon' | 'expired' | 'unreadable' | 'missing';
  isSelfSigned: boolean;
  isWildcard: boolean;
  signatureAlgorithm?: string;
  serialNumber?: string;
  fingerprintSha256?: string;
  associatedVHosts: ApacheCertificateAssociatedVHost[];
  sourceType: 'configured_vhost' | 'configured_global' | 'letsencrypt_storage' | 'system_cert';
}

export interface ApacheSslSummary {
  totalCertificates: number;
  validCertificates: number;
  expiringSoonCertificates: number;
  expiredCertificates: number;
  selfSignedCertificates: number;
  missingOrUnreadableCertificates: number;
  modSslLoaded: boolean;
  modSocacheLoaded: boolean;
  http2Loaded: boolean;
  vhostsWithSslCount: number;
  vhostsWithoutSslCount: number;
  certificates: ApacheCertificateDetails[];
  warnings: string[];
}

export interface GenerateApacheSelfSignedCertParams {
  domain: string;
  days?: number;
  country?: string;
  organization?: string;
  vhostId?: string;
}

export interface AttachApacheSslCertParams {
  vhostId: string;
  certPath: string;
  keyPath: string;
  chainPath?: string;
  enableHttp2?: boolean;
  enableHsts?: boolean;
}

// ==========================================
// APACHE MANAGEMENT PHASE 8: LOGS & LIVE TAIL
// ==========================================

export type ApacheLogType = 'access' | 'error' | 'transfer' | 'custom';

export interface ApacheDiscoveredLogFile {
  id: string;
  filePath: string;
  type: ApacheLogType;
  scope: 'global' | 'virtualhost' | 'directory';
  associatedServerName?: string;
  associatedVHostId?: string;
  definedInFile?: string;
  exists: boolean;
  isReadable: boolean;
  sizeBytes: number;
  sizeHuman: string;
  lastModified?: string;
  lineCount?: number;
  format?: string;
  logLevel?: string;
  isPiped?: boolean;
  pipedCommand?: string;
}

export interface ApacheParsedAccessLogEntry {
  id: string;
  raw: string;
  type: 'access';
  clientIp?: string;
  remoteUser?: string;
  timestamp?: string;
  method?: string;
  uri?: string;
  protocol?: string;
  statusCode?: number;
  statusCategory?: '2xx' | '3xx' | '4xx' | '5xx' | 'other';
  bytesSent?: number;
  referer?: string;
  userAgent?: string;
  virtualHost?: string;
}

export interface ApacheParsedErrorLogEntry {
  id: string;
  raw: string;
  type: 'error';
  timestamp?: string;
  module?: string;
  level: string;
  pid?: number;
  tid?: string;
  clientIp?: string;
  clientPort?: number;
  errorCode?: string;
  message: string;
}

export type ApacheLogEntry = ApacheParsedAccessLogEntry | ApacheParsedErrorLogEntry;

export interface ApacheLogStreamResponse {
  filePath: string;
  logType: 'access' | 'error' | 'custom';
  totalLinesScanned: number;
  returnedLines: number;
  entries: ApacheLogEntry[];
  stats: {
    totalEntries: number;
    count2xx: number;
    count3xx: number;
    count4xx: number;
    count5xx: number;
    countErrors: number;
    countWarns: number;
    uniqueIpsCount: number;
    topIps: { ip: string; count: number }[];
    topUris: { uri: string; count: number }[];
    topStatusCodes: { code: number; count: number }[];
    topErrorModules?: { module: string; count: number }[];
    topErrorCodes?: { code: string; count: number }[];
  };
  fileMetadata: {
    exists: boolean;
    sizeBytes: number;
    sizeHuman: string;
    lastModified?: string;
  };
}

export interface ApacheLogsDiscoverySummary {
  totalLogFiles: number;
  accessLogFilesCount: number;
  errorLogFilesCount: number;
  availableLogFiles: ApacheDiscoveredLogFile[];
  warnings: string[];
  envVars: Record<string, string>;
}

// ==========================================
// APACHE MANAGEMENT PHASE 9: SAFE CONFIG EDITOR, SYNTAX TEST, BACKUPS & SERVICE MANAGEMENT
// ==========================================

export interface ApacheConfigFileBackup {
  id: string;
  backupPath: string;
  originalPath: string;
  timestamp: string;
  sizeBytes: number;
  sizeHuman: string;
}

export interface ApacheEditorSaveResult {
  success: boolean;
  filePath: string;
  backupCreated?: string;
  syntaxTestPassed: boolean;
  syntaxOutput: string;
  serviceReloaded: boolean;
  reloadOutput?: string;
  error?: string;
}

export interface ApacheEditorTestResult {
  isValid: boolean;
  output: string;
  error?: string;
  warnings?: string[];
}

export type ApacheServiceAction =
  | 'start'
  | 'stop'
  | 'restart'
  | 'reload'
  | 'graceful'
  | 'enable'
  | 'disable'
  | 'status';

export interface ApacheServiceActionResult {
  success: boolean;
  action: ApacheServiceAction;
  serviceName: string;
  serviceManager: string;
  output: string;
  activeState?: string;
  error?: string;
}

// ==========================================
// APACHE MANAGEMENT PHASE 10: ADVANCED SECURITY AUDIT, HARDENING GENERATOR & BENCHMARK COMPLIANCE
// ==========================================

export type ApacheSecurityCategory =
  | 'information_disclosure'
  | 'headers'
  | 'ssl'
  | 'dos_limits'
  | 'access_control'
  | 'permissions';

export type ApacheSecuritySeverity = 'critical' | 'warning' | 'info';

export interface ApacheSecurityAuditItem {
  id: string;
  category: ApacheSecurityCategory;
  title: string;
  title_en: string;
  severity: ApacheSecuritySeverity;
  passed: boolean;
  currentValue: string;
  recommendedValue: string;
  description: string;
  description_en: string;
  impact: string;
  impact_en: string;
  remediationSnippet: string;
  affectedFiles: string[];
}

export interface ApacheSecurityAuditReport {
  testedAt: string;
  totalChecks: number;
  passedCount: number;
  warningCount: number;
  criticalCount: number;
  infoCount: number;
  overallScore: number;
  runtimeWorkerUser: string;
  runtimeMasterUser: string;
  discoveredInstances: ApacheInstanceInfo[];
  activeInstanceConf: string;
  items: ApacheSecurityAuditItem[];
  suggestedHardeningSnippet: string;
}

export interface ApacheSecurityApplyFixResult {
  success: boolean;
  filePath: string;
  backupCreated?: string;
  syntaxTestPassed: boolean;
  syntaxOutput: string;
  serviceReloaded: boolean;
  reloadOutput?: string;
  error?: string;
}

// ==========================================
// APACHE MANAGEMENT PHASE 11: PERFORMANCE & TELEMETRY
// ==========================================
export interface ApacheScoreboardStats {
  raw: string;
  totalSlots: number;
  waitingForConnection: number;
  startingUp: number;
  readingRequest: number;
  sendingReply: number;
  keepalive: number;
  dnsLookup: number;
  closingConnection: number;
  logging: number;
  gracefullyFinishing: number;
  idleCleanup: number;
  openSlot: number;
  activeWorkersCount: number;
  utilizationPercent: number;
}

export interface ApacheModStatusTelemetry {
  isStatusAvailable: boolean;
  totalAccesses: number;
  totalKBytes: number;
  totalMBytes: number;
  uptime: number;
  uptimeHuman: string;
  reqPerSec: number;
  bytesPerSec: number;
  bytesPerReq: number;
  busyWorkers: number;
  idleWorkers: number;
  cpuLoad: number;
  connsTotal: number;
  connsAsyncWriting: number;
  connsAsyncKeepAlive: number;
  connsAsyncClosing: number;
  testedAt: string;
}

export interface ApacheCompressionStatus {
  deflateEnabled: boolean;
  brotliEnabled: boolean;
  compressionLevel: number;
  compressedMimeTypes: string[];
  recommendedSnippet: string;
}

export interface ApacheCacheStatus {
  expiresEnabled: boolean;
  headersEnabled: boolean;
  diskCacheEnabled: boolean;
  defaultExpiresHuman: string;
  recommendedSnippet: string;
}

export interface ApacheMpmTuningConfig {
  activeMpm: string;
  hardware: {
    totalRamMb: number;
    availRamMb: number;
    cpuCores: number;
    averageWorkerRssMb: number;
    currentActiveWorkers: number;
  };
  currentDirectives: {
    startServers: number;
    threadsPerChild: number;
    maxRequestWorkers: number;
    serverLimit: number;
    maxConnectionsPerChild: number;
  };
  recommendedDirectives: {
    startServers: number;
    minSpareThreads: number;
    maxSpareThreads: number;
    threadsPerChild: number;
    maxRequestWorkers: number;
    serverLimit: number;
    maxConnectionsPerChild: number;
  };
  recommendedSnippet: string;
}

export interface ApachePerformanceReport {
  testedAt: string;
  isStatusModuleLoaded: boolean;
  isStatusAvailable: boolean;
  telemetry: ApacheModStatusTelemetry | null;
  scoreboard: ApacheScoreboardStats | null;
  compression: ApacheCompressionStatus;
  cache: ApacheCacheStatus;
  mpmTuning: ApacheMpmTuningConfig;
  error?: string;
}

export interface ApachePerformanceTuneResult {
  success: boolean;
  filePath: string;
  syntaxTestPassed: boolean;
  syntaxOutput: string;
  serviceReloaded: boolean;
  error?: string;
}

// ==========================================
// APACHE MANAGEMENT PHASE 12: REWRITE, .HTACCESS & ACCESS CONTROL
// ==========================================
export interface ApacheHtaccessFile {
  filePath: string;
  directory: string;
  sizeBytes: number;
  lineCount: number;
  permissions?: string;
  owner?: string;
  allowOverrideSetting?: string;
  isEffective: boolean;
  contentSnippet?: string;
  fullContent?: string;
  hasRewriteEngine: boolean;
  hasAuthBasic: boolean;
  hasErrorDocument: boolean;
  hasRequireDirectives: boolean;
  error?: string;
}

export interface ApacheRewriteRuleItem {
  id: string;
  name: string;
  description: string;
  category: 'https_redirect' | 'canonical_domain' | 'custom_redirect' | 'spa_routing' | 'hotlink_protection' | 'bad_bot_block' | 'custom';
  enabled: boolean;
  conditions: string[];
  rule: string;
  flags: string;
  rawSnippet: string;
}

export interface ApacheBasicAuthProtectedArea {
  id: string;
  targetPath: string;
  targetType: 'directory' | 'location';
  authName: string;
  authType: string;
  authUserFile: string;
  requireDirective: string;
  users: string[];
  configuredInFile: string;
}

export interface ApacheCustomErrorDoc {
  statusCode: number;
  reason: string;
  actionType: 'path' | 'url' | 'message';
  target: string;
  configuredInFile?: string;
}

export interface ApacheIpAccessRule {
  id: string;
  targetPath: string;
  type: 'allow' | 'deny';
  ipOrSubnet: string;
  comment?: string;
}

export interface ApacheRewriteHtaccessSummary {
  testedAt: string;
  isRewriteModuleLoaded: boolean;
  isAuthBasicLoaded: boolean;
  globalAllowOverride: string;
  htaccessFiles: ApacheHtaccessFile[];
  protectedAreas: ApacheBasicAuthProtectedArea[];
  configuredErrorDocs: ApacheCustomErrorDoc[];
  defaultRewritePresets: ApacheRewriteRuleItem[];
  error?: string;
}

export interface ApacheDeployRewriteResult {
  success: boolean;
  filePath: string;
  backupCreated?: string;
  syntaxTestPassed: boolean;
  syntaxOutput: string;
  serviceReloaded: boolean;
  error?: string;
}

export interface NginxConfigFileNode {
  filePath: string;
  relativePath: string;
  sizeBytes: number;
  lineCount: number;
  permissions?: string;
  owner?: string;
  includedFrom?: string;
  level: number;
  includesCount: number;
  serverBlocksCount: number;
  upstreamsCount: number;
  hasHttpBlock: boolean;
  hasStreamBlock: boolean;
  hasEventsBlock: boolean;
  contentSnippet?: string;
  fullContent?: string;
  error?: string;
}

export interface NginxConfigTopologyTree {
  mainConfigPath: string;
  prefixPath: string;
  totalFiles: number;
  totalLines: number;
  files: NginxConfigFileNode[];
  detectedContexts: {
    hasEvents: boolean;
    hasHttp: boolean;
    hasStream: boolean;
    totalServerBlocks: number;
    totalUpstreams: number;
    totalLocations: number;
  };
  warnings: string[];
}

export interface NginxServerBlockLocation {
  path: string;
  proxyPass?: string;
  root?: string;
  alias?: string;
  tryFiles?: string;
  websocketSupport?: boolean;
  fastcgiPass?: string;
  returnDirective?: string;
}

export interface NginxServerBlock {
  id: string;
  context: 'http' | 'stream';
  serverNames: string[];
  primaryDomain: string;
  listens: {
    raw: string;
    port: number;
    isSsl: boolean;
    isHttp2: boolean;
    isHttp3: boolean;
    isDefaultServer: boolean;
    isIpv6: boolean;
    ip?: string;
  }[];
  rootPath?: string;
  indexFiles?: string[];
  sslCertificate?: string;
  sslCertificateKey?: string;
  sslEnabled: boolean;
  locations: NginxServerBlockLocation[];
  definedInFile: string;
  fileRelativePath: string;
  lineStart?: number;
  lineEnd?: number;
  isEnabled: boolean;
  rawBlockSnippet: string;
}

export interface NginxSitesSummary {
  totalSites: number;
  activeSites: number;
  disabledSites: number;
  sslSites: number;
  proxySites: number;
  staticSites: number;
  streamSites: number;
  sites: NginxServerBlock[];
  warnings: string[];
}

export interface NginxUpstreamServer {
  address: string;
  port?: number;
  weight?: number;
  maxFails?: number;
  failTimeout?: string;
  isBackup?: boolean;
  isDown?: boolean;
  isUnixSocket?: boolean;
  isResolvingDomain?: boolean;
}

export interface NginxUpstreamPool {
  id: string;
  name: string;
  context: 'http' | 'stream';
  algorithm: 'round-robin' | 'least_conn' | 'ip_hash' | 'hash' | 'random' | 'unknown';
  hashKey?: string;
  keepalive?: number;
  servers: NginxUpstreamServer[];
  definedInFile: string;
  fileRelativePath: string;
  rawSnippet: string;
}

export interface NginxReverseProxyRoute {
  id: string;
  sitePrimaryDomain: string;
  siteFileRelativePath: string;
  locationPath: string;
  proxyPassTarget: string;
  matchedUpstreamName?: string;
  isUpstream: boolean;
  websocketEnabled: boolean;
  proxySetHeaders: { [key: string]: string };
  proxyReadTimeout?: string;
  proxyConnectTimeout?: string;
  sslVerify: boolean;
}

export interface NginxProxySummary {
  totalUpstreams: number;
  totalUpstreamServers: number;
  totalProxyRoutes: number;
  websocketRoutesCount: number;
  upstreams: NginxUpstreamPool[];
  proxyRoutes: NginxReverseProxyRoute[];
  warnings: string[];
}

export interface NginxCertificateAssociatedSite {
  siteId: string;
  serverName: string;
  definedInFile: string;
  ports: number[];
}

export interface NginxCertificateDetails {
  id: string;
  primaryDomain: string;
  allDomains: string[];
  certPath: string;
  keyPath?: string;
  keyExists: boolean;
  certExists: boolean;
  certReadable: boolean;
  keyReadable: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  status: 'valid' | 'expiring_soon' | 'expired' | 'unreadable' | 'missing';
  isSelfSigned: boolean;
  isWildcard: boolean;
  signatureAlgorithm?: string;
  serialNumber?: string;
  fingerprintSha256?: string;
  associatedSites: NginxCertificateAssociatedSite[];
}

export interface NginxSslSummary {
  totalCertificates: number;
  validCertificates: number;
  expiringSoonCertificates: number;
  expiredCertificates: number;
  selfSignedCertificates: number;
  missingOrUnreadableCertificates: number;
  certificates: NginxCertificateDetails[];
  warnings: string[];
}

export type NginxLogType = 'access' | 'error' | 'combined' | 'stream' | 'custom';

export interface NginxDiscoveredLogFile {
  id: string;
  filePath: string;
  type: 'access' | 'error' | 'stream';
  scope: 'global' | 'server_block';
  associatedServerName?: string;
  associatedSiteId?: string;
  definedInFile?: string;
  exists: boolean;
  isReadable: boolean;
  sizeBytes: number;
  sizeHuman: string;
  lastModified?: string;
  lineCount?: number;
  format?: string;
}

export interface NginxParsedAccessLogEntry {
  id: string;
  raw: string;
  type: 'access';
  clientIp?: string;
  timestamp?: string;
  method?: string;
  uri?: string;
  protocol?: string;
  statusCode?: number;
  statusCategory?: '2xx' | '3xx' | '4xx' | '5xx' | 'other';
  bytesSent?: number;
  referer?: string;
  userAgent?: string;
  requestTimeSec?: number;
  upstreamResponseTimeSec?: number;
  upstreamAddr?: string;
  pipe?: string;
}

export interface NginxParsedErrorLogEntry {
  id: string;
  raw: string;
  type: 'error';
  timestamp?: string;
  level: 'emerg' | 'alert' | 'crit' | 'error' | 'warn' | 'notice' | 'info' | 'debug';
  pid?: number;
  tid?: number;
  clientIp?: string;
  serverDomain?: string;
  requestUri?: string;
  upstream?: string;
  host?: string;
  message: string;
}

export type NginxLogEntry = NginxParsedAccessLogEntry | NginxParsedErrorLogEntry;

export interface NginxLogStreamResponse {
  filePath: string;
  logType: 'access' | 'error' | 'stream';
  totalLinesScanned: number;
  returnedLines: number;
  entries: NginxLogEntry[];
  stats: {
    totalEntries: number;
    count2xx: number;
    count3xx: number;
    count4xx: number;
    count5xx: number;
    countErrors: number;
    countWarns: number;
    uniqueIpsCount: number;
    topIps: { ip: string; count: number }[];
    topUris: { uri: string; count: number }[];
    topStatusCodes: { code: number; count: number }[];
  };
  fileMetadata: {
    exists: boolean;
    sizeBytes: number;
    sizeHuman: string;
    lastModified?: string;
  };
}

export interface NginxLogsDiscoverySummary {
  totalLogFiles: number;
  accessLogFilesCount: number;
  errorLogFilesCount: number;
  availableLogFiles: NginxDiscoveredLogFile[];
  warnings: string[];
}

export interface NginxNewSiteConfig {
  domain: string;
  serverNames?: string[];
  port: number;
  isDefaultServer?: boolean;
  enableSsl?: boolean;
  sslCertPath?: string;
  sslKeyPath?: string;
  forceHttpsRedirect?: boolean;
  siteType: 'proxy' | 'static' | 'custom';
  // Reverse Proxy options
  proxyPassUrl?: string;
  enableWebSocket?: boolean;
  standardHeaders?: boolean;
  proxyTimeoutSec?: number;
  proxyBuffering?: boolean;
  // Static options
  documentRoot?: string;
  indexFiles?: string;
  enableSpaFallback?: boolean;
  enableAutoindex?: boolean;
  // Security & Performance
  clientMaxBodySize?: string;
  enableGzip?: boolean;
  enableSecurityHeaders?: boolean;
  customDirectives?: string;
  customConfigSnippet?: string;
  autoReloadService?: boolean;
}

export interface NginxSiteTestResult {
  success: boolean;
  isValid: boolean;
  testOutput: string;
  generatedConfig: string;
  targetFilePath: string;
  error?: string;
}

export interface NginxSiteDeployResult {
  success: boolean;
  deployedFilePath: string;
  symlinkPath?: string;
  syntaxTestPassed: boolean;
  syntaxOutput: string;
  serviceReloaded: boolean;
  reloadOutput?: string;
  error?: string;
}

export interface NginxConfigFileBackup {
  id: string;
  backupPath: string;
  originalPath: string;
  timestamp: string;
  sizeBytes: number;
  sizeHuman: string;
}

export interface NginxEditorSaveResult {
  success: boolean;
  filePath: string;
  backupCreated?: string;
  syntaxTestPassed: boolean;
  syntaxOutput: string;
  serviceReloaded: boolean;
  reloadOutput?: string;
  error?: string;
}

export interface NginxEditorTestResult {
  isValid: boolean;
  output: string;
  error?: string;
}

export type NginxSecurityCategory =
  | 'headers'
  | 'ssl'
  | 'information_disclosure'
  | 'dos_limits'
  | 'access_control'
  | 'permissions';

export type NginxSecuritySeverity = 'critical' | 'warning' | 'info' | 'pass';

export interface NginxSecurityAuditItem {
  id: string;
  category: NginxSecurityCategory;
  title: string;
  title_en: string;
  severity: NginxSecuritySeverity;
  passed: boolean;
  currentValue?: string;
  recommendedValue: string;
  description: string;
  description_en: string;
  impact: string;
  impact_en: string;
  remediationSnippet: string;
  affectedFiles?: string[];
}

export interface NginxSecurityAuditReport {
  testedAt: string;
  overallScore: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  totalChecks: number;
  passedChecks: number;
  warningChecks: number;
  criticalChecks: number;
  infoChecks: number;
  serverUser?: string;
  workerUser?: string;
  isWorkerRoot: boolean;
  targetConfPath?: string;
  items: NginxSecurityAuditItem[];
  hardeningSnippet: string;
}

export interface NginxSecurityApplyFixResult {
  success: boolean;
  filePath: string;
  backupCreated?: string;
  syntaxTestPassed: boolean;
  syntaxOutput: string;
  serviceReloaded: boolean;
  reloadOutput?: string;
  error?: string;
}

export interface RemoteServerTagSummary {
  tag: string;
  count: number;
}

export interface ServerCategory {
  id: string;
  name: string;
  name_fa?: string;
  description?: string;
  color?: string;
  serverCount?: number;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LinuxServerDiskMetric {
  filesystem: string;
  mount: string;
  sizeBytes: number;
  usedBytes: number;
  availBytes: number;
  usagePercent: number;
  sizeHuman: string;
  usedHuman: string;
  availHuman: string;
}

export interface LinuxServerNetMetric {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxHuman: string;
  txHuman: string;
}

export interface LinuxServerProcessMetric {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  command: string;
}

export interface LinuxServerLiveMetrics {
  timestamp: number;
  host: string;
  port: number;
  hostname: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  os: {
    system: string;
    kernel: string;
    arch: string;
    distro: string;
  };
  cpu: {
    usagePercent: number;
    cores: number;
    model: string;
    loadAvg: [number, number, number];
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    availableBytes: number;
    usagePercent: number;
    totalHuman: string;
    usedHuman: string;
    freeHuman: string;
    swapTotalBytes: number;
    swapUsedBytes: number;
    swapUsagePercent: number;
    swapTotalHuman: string;
    swapUsedHuman: string;
  };
  disks: LinuxServerDiskMetric[];
  networks: LinuxServerNetMetric[];
  processes: LinuxServerProcessMetric[];
}

export interface LinuxServiceWatchdogRule {
  id: string;
  serviceName: string;
  enabled: boolean;
  checkIntervalSeconds: number;
  maxRestartAttempts: number;
  cooldownPeriodSeconds: number;
  rebootOnPersistentFailure: boolean;
  rebootCooldownMinutes: number;
  minUptimeBeforeRebootMinutes: number;
  maxRebootsPerDay?: number;
  customPreRestartCommand?: string;
  createdAt: string;
  updatedAt: string;
  // Live state returned from destination Linux host
  status?: 'active' | 'inactive' | 'recovering' | 'anti_loop_halted' | 'failed' | 'unknown';
  consecutiveFailures?: number;
  lastCheckTimestamp?: number;
  lastRestartTimestamp?: number;
  lastRebootTimestamp?: number;
  lastActionMessage?: string;
  systemdUnitActive?: boolean;
}

export type LinuxDirectoryActionType = 'cleanup' | 'backup' | 'size_cap' | 'sync';

export interface LinuxDirectoryPolicyRule {
  id: string;
  name: string;
  targetPath: string;
  actionType: LinuxDirectoryActionType;
  enabled: boolean;
  schedulePreset: 'hourly' | 'every_6h' | 'daily' | 'weekly' | 'monthly' | 'custom';
  scheduleCron: string;
  // Retention & Cleanup options
  cleanupAgeDays?: number;
  cleanupFilePattern?: string;
  cleanupRemoveEmptyDirs?: boolean;
  // Backup & Archive options
  backupFormat?: 'tar.gz' | 'tar.bz2' | 'tar.xz' | 'zip';
  backupDestinationPath?: string;
  backupKeepSourceFiles?: boolean;
  backupPreserveAll?: boolean;
  backupMaxRetainedCount?: number;
  // Size-Capped Pruning options
  sizeCapMb?: number;
  // Directory Sync / Mirror options
  syncDestinationPath?: string;
  syncDeleteExtraneous?: boolean;
  // Live Status & Audit
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'failed' | 'running' | 'never';
  lastRunMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinuxSystemService {
  name: string;
  loadState: string;
  activeState: string;
  subState: string;
  unitFileState?: string;
  description: string;
  hasWatchdog?: boolean;
  watchdogStatus?: 'active' | 'inactive' | 'recovering' | 'anti_loop_halted' | 'failed' | 'unknown';
}

export interface LinuxSystemGroup {
  name: string;
  gid: number;
  members: string[];
}

export interface LinuxSystemUser {
  username: string;
  uid: number;
  gid: number;
  comment: string;
  homeDir: string;
  shell: string;
  isSystem: boolean;
  primaryGroup?: string;
  groups?: string[];
  isLocked?: boolean;
  expireDate?: string;
  isExpired?: boolean;
  daysUntilExpire?: number | null;
  mustChangePassword?: boolean;
}

export interface LinuxUserSecurityInfo {
  username: string;
  uid?: number;
  gid?: number;
  comment?: string;
  shell?: string;
  homeDir?: string;
  groups?: string[];
  isLocked: boolean;
  status: 'active' | 'locked' | 'password_expired' | 'no_password';
  lastPasswordChange: string;
  mustChangePassword: boolean;
  passwordExpires: string;
  passwordInactive: string;
  accountExpires: string;
  isExpired: boolean;
  daysUntilExpire: number | null;
  expiryStatusText: string;
  minDaysBetweenChange: number;
  maxDaysBetweenChange: number;
  warnDaysBeforeExpire: number;
  lastLogin: {
    ip: string;
    port?: string;
    time: string;
    tty: string;
  } | null;
  loginHistory: Array<{
    tty: string;
    ip: string;
    loginTime: string;
    logoutTime: string;
    duration: string;
    stillLoggedIn: boolean;
  }>;
  uniqueIps: string[];
  activeSessions: Array<{
    tty: string;
    from: string;
    loginTime: string;
    idleTime: string;
    what: string;
  }>;
}

export interface LinuxLoggedInUser {
  user: string;
  tty: string;
  from: string;
  loginTime: string;
  idleTime: string;
  what: string;
}

export type LinuxNetworkStackType =
  | 'networkmanager'
  | 'netplan'
  | 'systemd-networkd'
  | 'ifupdown'
  | 'network-scripts'
  | 'wicked'
  | 'ip-fallback'
  | 'unknown';

export type LinuxDnsManagerType =
  | 'systemd-resolved'
  | 'resolvconf'
  | 'networkmanager'
  | 'static-resolv-conf'
  | 'unknown';

export type LinuxNetworkInterfaceType =
  | 'physical'
  | 'virtual'
  | 'bridge'
  | 'bond'
  | 'vlan'
  | 'tunnel'
  | 'loopback'
  | 'other';

export interface LinuxNetworkAddressEntry {
  ip: string;
  cidr: number;
  scope?: string;
  broadcast?: string;
  dynamic?: boolean;
}

export interface LinuxNetworkInterfaceDetail {
  name: string;
  state: 'UP' | 'DOWN' | 'UNKNOWN';
  linkState?: 'carrier' | 'no-carrier' | 'dormant' | 'unknown';
  type?: LinuxNetworkInterfaceType;
  mac: string;
  ipv4: string;
  ipv4List?: LinuxNetworkAddressEntry[];
  netmask: string;
  cidr: number;
  ipv6: string;
  ipv6List?: LinuxNetworkAddressEntry[];
  gateway: string;
  dns?: string[];
  ipMode?: 'dhcp' | 'static' | 'unconfigured';
  mtu: number;
  speed?: string;
  duplex?: string;
  rxBytes: number;
  txBytes: number;
  rxPackets?: number;
  txPackets?: number;
  rxErrors?: number;
  txErrors?: number;
  rxDropped?: number;
  txDropped?: number;
  isManagement?: boolean;
  isDefaultRoute?: boolean;
  driver?: string;
}

export interface LinuxNetworkStackInfo {
  distroId: string;
  distroName: string;
  distroVersion: string;
  initSystem: string;
  activeStack: LinuxNetworkStackType;
  availableStacks: LinuxNetworkStackType[];
  activeService: string;
  dnsManager: LinuxDnsManagerType;
  configuredDns: string[];
  effectiveDns: string[];
  defaultGateway: string;
  defaultInterface: string;
  managementInterface: string;
  managementClientIp: string;
  configFiles: string[];
}

export interface LinuxInterfaceConfigPayload {
  state?: 'UP' | 'DOWN';
  ipMode?: 'dhcp' | 'static';
  ipv4Mode?: 'dhcp' | 'static';
  ipv4?: string;
  cidr?: number;
  gateway?: string;
  dns?: string[];
  mtu?: number;
  ipv6Mode?: 'disabled' | 'auto' | 'static';
  ipv6?: string;
  ipv6Prefix?: number;
}

export interface LinuxSystemDetailedInfo {
  distro: string;
  distroVersion: string;
  distroId: string;
  kernelRelease: string;
  kernelVersion: string;
  arch: string;
  hostname: string;
  fqdn: string;
  bootTime: string;
  uptime: string;
  currentSshPort: number;
  proxy: {
    httpProxy: string;
    httpsProxy: string;
    ftpProxy: string;
    noProxy: string;
    enabled: boolean;
  };
}

export interface LinuxProxyConfig {
  httpProxy: string;
  httpsProxy: string;
  ftpProxy: string;
  noProxy: string;
  enabled: boolean;
}

export interface LinuxBlockDevice {
  name: string;
  size: string;
  type: string;
  mountpoint: string | null;
  fstype: string | null;
  label?: string | null;
}

export interface LinuxMountedFilesystem {
  mountPoint: string;
  device: string;
  fsType: string;
  totalSize: string;
  usedSize: string;
  freeSize: string;
  usagePercent: number;
  status: 'Mounted' | 'Unmounted';
  isReadOnly: boolean;
  isLvm: boolean;
  lvName: string | null;
  vgName: string | null;
  options?: string;
}

export interface LinuxPartition {
  name: string;
  size: string;
  fsType: string | null;
  mountPoint: string | null;
  uuid: string | null;
  partLabel: string | null;
  isInLvm: boolean;
}

export interface LinuxPhysicalDisk {
  name: string;
  model: string | null;
  serial: string | null;
  size: string;
  type: string; // 'disk'
  mediaType: 'SSD' | 'HDD' | 'NVMe' | 'Unknown';
  transport: string | null; // 'sata' | 'nvme' | 'scsi' | 'virtio' | 'usb'
  health: string | null;
  partitionCount: number;
  isUsed: boolean;
  isInLvm: boolean;
  isAvailable: boolean; // "New / Available" (no partitions, no mounts, not in LVM)
  partitions: LinuxPartition[];
}

export interface LinuxPhysicalVolume {
  name: string;
  device: string;
  parentDisk: string;
  size: string;
  allocated: string;
  free: string;
  vgName: string;
  format?: string;
  status: string;
}

export interface LinuxVolumeGroup {
  name: string;
  totalSize: string;
  allocatedSize: string;
  freeSize: string;
  pvCount: number;
  lvCount: number;
  pvs: string[];
  lvs: string[];
}

export interface LinuxLogicalVolume {
  name: string;
  vgName: string;
  path: string;
  size: string;
  fsType: string | null;
  mountPoint: string | null;
  usedSize?: string;
  freeSize?: string;
  usagePercent?: number;
  isMounted: boolean;
  isReadOnly?: boolean;
  status: string;
}

export interface LinuxStorageSummary {
  totalDiskCount: number;
  availableDiskCount: number;
  totalMountedCount: number;
  totalVgCount: number;
  totalLvCount: number;
  totalStorageHuman?: string;
  usedStorageHuman?: string;
}

export interface LinuxStorageOverview {
  filesystems: LinuxMountedFilesystem[];
  physicalDisks: LinuxPhysicalDisk[];
  physicalVolumes: LinuxPhysicalVolume[];
  volumeGroups: LinuxVolumeGroup[];
  logicalVolumes: LinuxLogicalVolume[];
  lvmInstalled: boolean;
  summary: LinuxStorageSummary;
  // Backward compatibility fields
  pvs: LinuxLvmPv[];
  vgs: LinuxLvmVg[];
  lvs: LinuxLvmLv[];
  availableDisks: LinuxRawDisk[];
}

export interface LinuxLvmPv {
  name: string;
  vgName: string;
  size: string;
  free: string;
  used: string;
  format?: string;
  device?: string;
  parentDisk?: string;
}

export interface LinuxLvmVg {
  name: string;
  pvCount: number;
  lvCount: number;
  size: string;
  free: string;
  allocatedSize?: string;
  pvs?: string[];
  lvs?: string[];
}

export interface LinuxLvmLv {
  name: string;
  vgName: string;
  path: string;
  size: string;
  mountPoint?: string | null;
  fsType?: string | null;
  usagePercent?: number;
  isMounted?: boolean;
  isReadOnly?: boolean;
  usedSize?: string;
  freeSize?: string;
}

export interface LinuxRawDisk {
  name: string;
  size: string;
  type: string;
  fstype?: string | null;
  mountpoint?: string | null;
  model?: string;
  isInLvm?: boolean;
  isAvailable?: boolean;
}

export type LinuxLvmOverview = LinuxStorageOverview;

export interface LinuxDiskFormatMountPayload {
  diskPath: string; // e.g. "/dev/sdb"
  partition?: boolean; // true to create GPT partition
  fsType: 'ext4' | 'xfs' | 'btrfs';
  mountPath: string; // e.g. "/data" or "/backup"
  label?: string;
  persistInFstab?: boolean;
}

export interface LinuxLvmExtendPayload {
  lvPath: string;
  vgName: string;
  addSize: string; // e.g. "10G" or "100%FREE"
  diskToAddToVg?: string; // Optional raw disk e.g. "/dev/sdb" to pvcreate & vgextend
  fsType?: string;
  mountPoint?: string;
}

export interface LinuxLvmCreatePayload {
  isNewVg: boolean;
  vgName: string;
  selectedDisks?: string[]; // raw disks to pvcreate and use for VG
  lvName: string;
  size: string; // e.g. "20G" or "100%FREE"
  fsType: 'ext4' | 'xfs' | 'btrfs';
  mountPath?: string;
  persistInFstab?: boolean;
}

export interface LinuxLvmCreateVgPayload {
  vgName: string;
  selectedDisks: string[]; // block devices e.g. ["/dev/sdb", "/dev/sdc"]
  peSize?: string; // e.g. "4M", "8M", "16M"
  force?: boolean;
}

export interface LinuxLvmShrinkPayload {
  lvPath: string;
  vgName: string;
  reduceAmount: string; // e.g. "5G"
  mountPoint?: string;
  fsType?: string;
}

export interface LinuxMountPayload {
  device: string;
  mountPoint: string;
  fsType?: string;
  options?: string;
  persistInFstab?: boolean;
  createDirectory?: boolean;
}

export interface LinuxSshConfig {
  port: number;
  permitRootLogin: 'yes' | 'no' | 'prohibit-password' | 'without-password';
  passwordAuthentication: 'yes' | 'no';
  maxAuthTries: number;
  clientAliveInterval: number;
  clientAliveCountMax: number;
  x11Forwarding: 'yes' | 'no';
  allowedIps: string[];
}

export interface LinuxDnsConfig {
  nameservers: string[];
  searchDomains?: string[];
  source?: string;
  status?: string;
}

export interface LinuxFail2banJailInfo {
  name: string;
  currentlyBanned?: number;
  totalBanned?: number;
  currentlyFailed?: number;
  bannedIps?: string[];
}

export interface LinuxFail2banStatus {
  installed: boolean;
  running: boolean;
  active?: boolean;
  version?: string;
  jails: LinuxFail2banJailInfo[];
  bannedIps?: { jail: string; ip: string; timestamp?: string }[];
  totalBanned?: number;
}

export interface LinuxHostEntry {
  ip: string;
  hostname?: string;
  hostnames?: string[];
  aliases?: string[];
  comment?: string;
  id?: string;
}

export interface LinuxHostnameInfo {
  currentHostname: string;
  staticHostname?: string;
  transientHostname?: string;
  fqdn?: string;
  prettyHostname?: string;
  iconName?: string;
  chassis?: string;
  deployment?: string;
}

export interface LinuxTimeInfo {
  localTime: string;
  utcTime: string;
  universalTime?: string;
  timezone: string;
  tzIdentifier?: string;
  timeZone?: string;
  ntpActive: boolean;
  ntpSynchronized: boolean;
  ntpEnabled?: boolean;
  rtcTime?: string;
}

export interface LinuxTcpWrapperRule {
  id: string;
  daemon: string;
  clients: string[];
  options?: string;
  comment?: string;
  raw?: string;
  lineIndex?: number;
}

export interface LinuxTcpWrappersData {
  allowRules: LinuxTcpWrapperRule[];
  denyRules: LinuxTcpWrapperRule[];
  rawAllow: string;
  rawDeny: string;
}

export type LinuxLogCategory =
  | 'journal'
  | 'auth'
  | 'syslog'
  | 'dmesg'
  | 'nginx'
  | 'apache'
  | 'dpkg'
  | 'cron'
  | 'fail2ban'
  | 'boot'
  | 'custom';

export interface LinuxLogEntry {
  id: string;
  raw: string;
  timestamp?: string;
  hostname?: string;
  service?: string;
  level?: 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';
  message: string;
}

export interface LinuxLogFileMetadata {
  path: string;
  exists: boolean;
  sizeHuman?: string;
  sizeBytes?: number;
  lastModified?: string;
  lineCount?: number;
}

export interface LinuxSystemLogsResponse {
  success: boolean;
  category: LinuxLogCategory;
  filePath: string;
  logs: LinuxLogEntry[];
  rawText: string;
  lineCount: number;
  errorCount: number;
  warnCount: number;
  fileMetadata?: LinuxLogFileMetadata;
  availableLogFiles?: LinuxLogFileMetadata[];
  error?: string;
}

export interface LinuxLogCategoryDetail {
  id: LinuxLogCategory;
  name: string;
  name_en: string;
  shortDesc: string;
  shortDesc_en: string;
  defaultPaths: string[];
  whatSitsHere: string;
  whatSitsHere_en: string;
  whyNeeded: string;
  whyNeeded_en: string;
  practicalExamples: string[];
  practicalExamples_en: string[];
  commandsUsed: string[];
}

// ========================================================
// LINUX PACKAGE MANAGEMENT & SYSTEM UPGRADE INTERFACES
// ========================================================

export type LinuxPackageManagerType = 'apt' | 'dnf' | 'yum' | 'pacman' | 'zypper' | 'apk' | 'generic';

export interface LinuxPackageItem {
  name: string;
  currentVersion: string;
  candidateVersion?: string;
  architecture?: string;
  summary?: string;
  status: 'up_to_date' | 'update_available' | 'security_update';
  isSecurityUpdate?: boolean;
  packageManager: LinuxPackageManagerType;
}

export interface LinuxPackageUpdateOverview {
  osInfo: {
    prettyName: string;
    kernel: string;
    arch: string;
    hostname: string;
    packageManager: LinuxPackageManagerType;
    lastUpdated?: string;
    uptime?: string;
  };
  totalInstalled: number;
  upgradableCount: number;
  securityCount: number;
  packages: LinuxPackageItem[];
  upgradablePackages: LinuxPackageItem[];
}

export interface PackageUpdateJobStep {
  packageName: string;
  currentVersion: string;
  targetVersion: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  startTime?: number;
  endTime?: number;
  durationSec?: number;
  output?: string;
  error?: string;
}

export interface PackageUpdateJobStatus {
  jobId: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  mode: 'single' | 'selected' | 'all' | 'dist-upgrade' | 'repo-update' | 'autoremove';
  totalPackages: number;
  completedPackages: number;
  successCount: number;
  failedCount: number;
  percentage: number;
  currentPackageName?: string;
  currentStepDescription?: string;
  steps: PackageUpdateJobStep[];
  startedAt: number;
  finishedAt?: number;
  fullLog?: string;
}

// ========================================================
// LINUX FIREWALL ENGINE INTERFACES (UFW, FIREWALLD, NFTABLES, IPTABLES)
// ========================================================

export type LinuxFirewallBackend = 'ufw' | 'firewalld' | 'nftables' | 'iptables' | 'none' | 'unknown';
export type LinuxFirewallStatus = 'active' | 'inactive' | 'disabled' | 'not_installed' | 'unknown';
export type LinuxFirewallAction = 'ALLOW' | 'DENY' | 'REJECT' | 'LIMIT';
export type LinuxFirewallDirection = 'IN' | 'OUT' | 'FORWARD';
export type LinuxFirewallProtocol = 'tcp' | 'udp' | 'icmp' | 'any' | 'all';

export interface LinuxFirewallRule {
  id: string;
  ruleNumber?: number;
  backend: LinuxFirewallBackend;
  action: LinuxFirewallAction;
  direction: LinuxFirewallDirection;
  protocol: LinuxFirewallProtocol;
  port?: string;
  source?: string;
  destination?: string;
  interface?: string;
  ipVersion: 'v4' | 'v6' | 'both';
  enabled: boolean;
  comment?: string;
  logging?: boolean;
  rawRule?: string;
}

export interface LinuxFirewallPolicies {
  incoming: 'ALLOW' | 'DENY' | 'DROP' | 'REJECT' | string;
  outgoing: 'ALLOW' | 'DENY' | 'DROP' | 'REJECT' | string;
  forward?: 'ALLOW' | 'DENY' | 'DROP' | 'REJECT' | string;
}

export interface LinuxFirewallCapabilities {
  supportsRuleOrdering: boolean;
  supportsComments: boolean;
  supportsZones: boolean;
  supportsIPv6: boolean;
  supportsLogging: boolean;
  supportsPortRanges: boolean;
  supportsInterfaces: boolean;
  supportsDefaultPolicies: boolean;
  supportsToggleState: boolean;
}

export interface LinuxListeningPortSummary {
  port: number;
  proto: string;
  process?: string;
  pid?: number;
  address?: string;
  allowedInFirewall: boolean;
}

export interface LinuxFirewallInfo {
  backend: LinuxFirewallBackend;
  status: LinuxFirewallStatus;
  serviceName: string;
  installed: boolean;
  enabled: boolean;
  active: boolean;
  version?: string;
  defaultPolicies: LinuxFirewallPolicies;
  rulesCount: number;
  rules: LinuxFirewallRule[];
  capabilities: LinuxFirewallCapabilities;
  activeZone?: string;
  rawStatusOutput?: string;
  listeningPortsSummary?: LinuxListeningPortSummary[];
}

export interface LinuxFirewallRulePayload {
  action: LinuxFirewallAction;
  direction: LinuxFirewallDirection;
  protocol: LinuxFirewallProtocol;
  port?: string;
  source?: string;
  destination?: string;
  interface?: string;
  ipVersion?: 'v4' | 'v6' | 'both';
  comment?: string;
  logging?: boolean;
}

// ============================================================================
// LINUX FILE EXPLORER & SFTP TYPES
// ============================================================================

export type LinuxFsItemType = 'directory' | 'file' | 'symlink' | 'other';

export interface LinuxFsItem {
  name: string;
  path: string;
  type: LinuxFsItemType;
  size: number;
  sizeHuman: string;
  permissions: string;
  octalPermissions: string;
  owner: number | string;
  group: number | string;
  modifiedTime: string;
  extension: string;
  target?: string;
}

export interface LinuxFsListResult {
  currentPath: string;
  parentPath: string | null;
  items: LinuxFsItem[];
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  totalSizeHuman: string;
  freeSpaceHuman?: string;
  totalSpaceHuman?: string;
  usedPercent?: number;
}

export interface LinuxQuickDir {
  path: string;
  name: string;
  name_fa: string;
  description: string;
  description_fa: string;
  icon: string;
  isImportant?: boolean;
}

export interface LinuxFileContentResult {
  content: string;
  size: number;
  isTruncated: boolean;
  path: string;
}

export interface LinuxItemProperties {
  name: string;
  path: string;
  parentPath: string;
  type: LinuxFsItemType;
  typeHuman: string;
  size: number;
  sizeHuman: string;
  permissions: string;
  octalPermissions: string;
  ownerUser: string;
  ownerUid: number;
  groupName: string;
  groupGid: number;
  modifiedTime: string;
  accessTime: string;
  createdTime?: string;
  statusChangeTime?: string;
  symlinkTarget?: string;
  itemCount?: number;
  suid?: boolean;
  sgid?: boolean;
  sticky?: boolean;
}

// ========================================================
// LINUX CRON JOBS MANAGEMENT INTERFACES
// ========================================================

export type LinuxCronSpecialSchedule = '@reboot' | '@yearly' | '@annually' | '@monthly' | '@weekly' | '@daily' | '@midnight' | '@hourly';

export interface LinuxCronJob {
  id: string;
  user: string;
  schedule: string;
  command: string;
  comment?: string;
  isEnabled: boolean;
  source: 'user_crontab' | 'etc_crontab' | 'cron_d' | 'cron_daily' | 'cron_hourly' | 'cron_weekly' | 'cron_monthly';
  sourceFile?: string;
  rawLine: string;
  lineNumber?: number;
  environmentVars?: Record<string, string>;
}

export interface LinuxCronJobPayload {
  id?: string;
  originalSchedule?: string;
  originalCommand?: string;
  user: string;
  schedule: string;
  command: string;
  comment?: string;
  isEnabled: boolean;
  environmentVars?: Record<string, string>;
}

export interface LinuxCronOverview {
  jobs: LinuxCronJob[];
  systemUsers: string[];
  cronDaemonStatus: {
    serviceName: string;
    active: boolean;
    running: boolean;
    enabled: boolean;
  };
  currentUser: string;
}

export interface LinuxCronExecutionResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  success: boolean;
}

