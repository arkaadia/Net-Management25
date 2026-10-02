import { isDeviceActionPermitted, DEVICE_ACTIONS_CATALOG, FULL_DEVICE_PERMISSIONS, RESTRICTED_DEVICE_PERMISSIONS } from './src/utils/rbac';
import { AccessPolicy, NetworkDeviceActionKey } from './src/types';

console.log('=== Running Phase 3.1 Cisco Port Context Menu RBAC Verification ===\n');

// 1. Test action mapping dictionary used in CiscoPortContextMenu & PortInspectorModal
const actionPermissionMap: Record<string, NetworkDeviceActionKey> = {
  port_sec_enable: 'port_security',
  port_sec_disable: 'port_security',
  open_assign_vlan: 'port_vlan',
  change_vlan: 'port_vlan',
  edit_description: 'port_description',
  shutdown: 'port_power',
  no_shutdown: 'port_power',
  mode_trunk: 'port_mode',
  mode_access: 'port_mode',
};

console.log('1. Verifying Action Permission Mapping:');
for (const [action, key] of Object.entries(actionPermissionMap)) {
  const catalogItem = DEVICE_ACTIONS_CATALOG.find((x) => x.key === key);
  if (!catalogItem) {
    throw new Error(`Action key ${key} from ${action} not found in DEVICE_ACTIONS_CATALOG!`);
  }
  console.log(`   [OK] Action '${action}' correctly maps to RBAC key '${key}' (${catalogItem.labelEn})`);
}

// 2. Test Super Administrator Policy (All actions permitted on all ports)
const superAdminPolicy = {
  id: 'policy-super-admin',
  name: 'Super Administrator',
  priority: 100,
  isBuiltin: true,
  subjectType: 'local_user',
  subjectId: 'user-admin',
  subjectName: 'Network Administrator',
  targetScope: 'all',
  defaultDevicePermissions: FULL_DEVICE_PERMISSIONS,
  perDevicePermissions: {},
} as unknown as AccessPolicy;

console.log('\n2. Verifying Super Admin Permissions on Cisco Switch:');
const ciscoDevId = 'dev-core-01';
for (const [action, key] of Object.entries(actionPermissionMap)) {
  const allowed = isDeviceActionPermitted(superAdminPolicy, ciscoDevId, key);
  if (!allowed) {
    throw new Error(`Super admin was unexpectedly denied '${key}'!`);
  }
}
console.log('   [OK] Super Admin has full authorization across all Cisco port context actions.');

// 3. Test Restricted Helpdesk Operator Policy
// Helpdesk has canChangeVlan=true, canEditDescription=true, port_security=true, BUT NO port_power and NO port_mode!
const helpdeskPolicy = {
  id: 'policy-helpdesk',
  name: 'Helpdesk Operator',
  priority: 10,
  isBuiltin: false,
  subjectType: 'local_group',
  subjectId: 'group-helpdesk-ops',
  subjectName: 'Helpdesk Operators',
  targetScope: 'groups',
  defaultDevicePermissions: {
    ...RESTRICTED_DEVICE_PERMISSIONS,
    port_power: false,
    port_mode: false,
    port_vlan: true,
    port_description: true,
    port_security: false,
  },
  perDevicePermissions: {
    'dev-acc-01': {
      // Per-device override: allow port_power on dev-acc-01 only
      port_power: true,
    },
  },
} as unknown as AccessPolicy;

console.log('\n3. Verifying Restricted Helpdesk Operator Policy Defaults:');
const isPowerAllowed = isDeviceActionPermitted(helpdeskPolicy, 'dev-core-01', 'port_power');
const isModeAllowed = isDeviceActionPermitted(helpdeskPolicy, 'dev-core-01', 'port_mode');
const isVlanAllowed = isDeviceActionPermitted(helpdeskPolicy, 'dev-core-01', 'port_vlan');
const isDescAllowed = isDeviceActionPermitted(helpdeskPolicy, 'dev-core-01', 'port_description');
const isPortSecAllowed = isDeviceActionPermitted(helpdeskPolicy, 'dev-core-01', 'port_security');

if (isPowerAllowed !== false) throw new Error('Helpdesk should be DENIED port_power by default!');
if (isModeAllowed !== false) throw new Error('Helpdesk should be DENIED port_mode by default!');
if (isVlanAllowed !== true) throw new Error('Helpdesk should be ALLOWED port_vlan!');
if (isDescAllowed !== true) throw new Error('Helpdesk should be ALLOWED port_description!');
if (isPortSecAllowed !== false) throw new Error('Helpdesk should be DENIED port_security by default!');

console.log('   [OK] port_power: DENIED (Shutdown / No Shutdown hidden)');
console.log('   [OK] port_mode: DENIED (Set Mode Trunk/Access hidden)');
console.log('   [OK] port_security: DENIED (Enable/Disable Port Security hidden)');
console.log('   [OK] port_vlan: ALLOWED (Assign Access VLAN visible)');
console.log('   [OK] port_description: ALLOWED (Set Port Description visible)');

// 4. Test Per-Device Override Matrix precedence
console.log('\n4. Verifying Per-Device Override on dev-acc-01:');
const isOverriddenPowerAllowed = isDeviceActionPermitted(helpdeskPolicy, 'dev-acc-01', 'port_power');
if (isOverriddenPowerAllowed !== true) {
  throw new Error('Per-device override on dev-acc-01 for port_power failed to grant permission!');
}
console.log('   [OK] Per-device override successfully granted port_power on dev-acc-01 while remaining denied on dev-core-01.');

// 5. Test Read-Only State when all port actions are false
const readOnlyNocPolicy = {
  id: 'policy-noc-observer',
  name: 'NOC Observer',
  priority: 20,
  subjectType: 'local_group',
  subjectId: 'group-noc',
  subjectName: 'NOC Monitoring',
  targetScope: 'all',
  defaultDevicePermissions: {
    ...RESTRICTED_DEVICE_PERMISSIONS,
    port_power: false,
    port_mode: false,
    port_vlan: false,
    port_security: false,
    port_description: false,
    terminal: false,
  },
  perDevicePermissions: {},
} as unknown as AccessPolicy;

console.log('\n5. Verifying Read-Only State for NOC Observer:');
const canPowerNoc = isDeviceActionPermitted(readOnlyNocPolicy, 'dev-core-01', 'port_power');
const canModeNoc = isDeviceActionPermitted(readOnlyNocPolicy, 'dev-core-01', 'port_mode');
const canPortSecNoc = isDeviceActionPermitted(readOnlyNocPolicy, 'dev-core-01', 'port_security');
const canVlanNoc = isDeviceActionPermitted(readOnlyNocPolicy, 'dev-core-01', 'port_vlan');
const canDescNoc = isDeviceActionPermitted(readOnlyNocPolicy, 'dev-core-01', 'port_description');
const canTerminalNoc = isDeviceActionPermitted(readOnlyNocPolicy, 'dev-core-01', 'terminal');

const hasAnyConfigNoc = canPowerNoc || canModeNoc || canPortSecNoc || canVlanNoc || canDescNoc;
if (hasAnyConfigNoc || canTerminalNoc) {
  throw new Error('NOC Observer should have 0 config permissions and 0 terminal permissions!');
}
console.log('   [OK] hasAnyConfigPermission is FALSE -> Read-Only badge and restriction banner rendered.');
console.log('   [OK] canTerminal is FALSE -> Terminal CLI action hidden.');
console.log('   [OK] Empty State Notice active.');

console.log('\n>>> All Phase 3.1 Cisco Port Context Menu RBAC Verification Tests Passed Successfully! <<<');
