/**
 * Empirical Verification Test Suite for Phase 4:
 * MikroTik RouterOS Granular Port RBAC Enforcement in Context Menu & Manage Modal
 */
import { isDeviceActionPermitted } from './src/utils/rbac';
import { AccessPolicy, NetworkDeviceActionKey } from './src/types';

// Super Admin policy: full capabilities on all network devices
const superAdminPolicy: AccessPolicy = {
  id: 'policy-superadmin',
  name: 'Super Admin Full Policy',
  description: 'Full Super Admin access',
  priority: 100,
  subjectType: 'local_group',
  subjectId: 'group-superadmin',
  subjectName: 'Super Administrators',
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
  terminalAccess: 'full',
  canToggleAdminStatus: true,
  canChangeVlan: true,
  canEditDescription: true,
  canTogglePortSecurity: true,
  canWriteMemory: true,
  defaultDevicePermissions: {
    terminal: true,
    inspect_ports: true,
    web_configs: true,
    port_power: true,
    port_vlan: true,
    port_description: true,
    port_mode: true,
    port_security: true,
    port_bridge: true,
    port_speed: true,
    port_cable_test: true,
  },
  perDevicePermissions: {},
} as unknown as AccessPolicy;

// Helpdesk operator policy: limited to port power & comment editing, denied bridge, vlan, speed & cable test
const helpdeskPolicy: AccessPolicy = {
  id: 'policy-helpdesk',
  name: 'Helpdesk Port Triage Policy',
  description: 'Helpdesk limited access',
  priority: 50,
  subjectType: 'local_user',
  subjectId: 'user-helpdesk',
  subjectName: 'Helpdesk Operator',
  targetScope: 'all',
  targetGroupIds: [],
  targetDeviceIds: [],
  canViewDashboard: true,
  canViewTopology: true,
  canViewDevices: true,
  canViewPorts: true,
  canViewScanner: false,
  canViewTemplates: false,
  canViewSettings: false,
  terminalAccess: 'none',
  canToggleAdminStatus: true,
  canChangeVlan: false,
  canEditDescription: true,
  canTogglePortSecurity: false,
  canWriteMemory: false,
  defaultDevicePermissions: {
    terminal: false,
    inspect_ports: true,
    web_configs: false,
    port_power: true,         // Permitted
    port_bridge: false,       // Denied
    port_vlan: false,         // Denied
    port_speed: false,        // Denied
    port_description: true,   // Permitted
    port_cable_test: false,   // Denied
    port_mode: false,
    port_security: false,
  },
  perDevicePermissions: {
    // Specific override on core MikroTik router CCR2004: completely read-only
    'dev-mikrotik-ccr2004': {
      port_power: false,
      port_description: false,
    },
  },
} as unknown as AccessPolicy;

// Read-only auditor policy: all modification permissions false
const auditorPolicy: AccessPolicy = {
  id: 'policy-auditor',
  name: 'Auditor Policy',
  description: 'Auditor read-only',
  priority: 10,
  subjectType: 'local_group',
  subjectId: 'group-auditor',
  subjectName: 'Auditors',
  targetScope: 'all',
  targetGroupIds: [],
  targetDeviceIds: [],
  canViewDashboard: true,
  canViewTopology: true,
  canViewDevices: true,
  canViewPorts: true,
  canViewScanner: false,
  canViewTemplates: false,
  canViewSettings: false,
  terminalAccess: 'view_only',
  canToggleAdminStatus: false,
  canChangeVlan: false,
  canEditDescription: false,
  canTogglePortSecurity: false,
  canWriteMemory: false,
  defaultDevicePermissions: {
    terminal: false,
    inspect_ports: true,
    web_configs: false,
    port_power: false,
    port_bridge: false,
    port_vlan: false,
    port_speed: false,
    port_description: false,
    port_cable_test: false,
    port_mode: false,
    port_security: false,
  },
  perDevicePermissions: {},
} as unknown as AccessPolicy;

function runEmpiricalTests() {
  console.log('================================================================');
  console.log('   EMPIRICAL VERIFICATION SUITE: PHASE 4 MIKROTIK PORT RBAC');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}`);
      failed++;
    }
  }

  const mikrotikDevId = 'dev-mikrotik-edge-01';
  const mikrotikCoreId = 'dev-mikrotik-ccr2004';

  // 1. Super Admin Full MikroTik Capabilities
  console.log('--- Test Group 1: Super Admin Full MikroTik Capabilities ---');
  const mikrotikActions: NetworkDeviceActionKey[] = [
    'port_power',
    'port_bridge',
    'port_vlan',
    'port_speed',
    'port_description',
    'port_cable_test',
  ];
  for (const act of mikrotikActions) {
    assert(isDeviceActionPermitted(superAdminPolicy, mikrotikDevId, act) === true, `SuperAdmin can execute MikroTik action: ${act}`);
  }

  // 2. Helpdesk Granular Evaluation on Edge MikroTik
  console.log('\n--- Test Group 2: Helpdesk Granular RBAC on Edge MikroTik ---');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikDevId, 'port_power') === true, 'Helpdesk CAN toggle MikroTik port power');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikDevId, 'port_description') === true, 'Helpdesk CAN edit MikroTik port comment');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikDevId, 'port_bridge') === false, 'Helpdesk CANNOT modify bridge membership');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikDevId, 'port_vlan') === false, 'Helpdesk CANNOT modify bridge PVID / VLAN');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikDevId, 'port_speed') === false, 'Helpdesk CANNOT set port speed / auto-negotiation');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikDevId, 'port_cable_test') === false, 'Helpdesk CANNOT trigger TDR cable test');

  // 3. Per-Device Override for Helpdesk on Core MikroTik CCR2004
  console.log('\n--- Test Group 3: Helpdesk Per-Device Override on Core Router ---');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikCoreId, 'port_power') === false, 'Helpdesk CANNOT toggle port power on CCR2004 (Override locked)');
  assert(isDeviceActionPermitted(helpdeskPolicy, mikrotikCoreId, 'port_description') === false, 'Helpdesk CANNOT edit comment on CCR2004 (Override locked)');

  // 4. MikroTik Context Menu Action Dispatch Guards Simulation
  console.log('\n--- Test Group 4: Context Menu Action Dispatch RBAC Protection ---');
  function simulateContextMenuAction(
    policy: AccessPolicy,
    deviceId: string,
    action: string
  ): { permitted: boolean; requiredPermission: string } {
    const actionPermMap: Record<string, NetworkDeviceActionKey> = {
      enable: 'port_power',
      disable: 'port_power',
      bridge_add: 'port_bridge',
      bridge_remove: 'port_bridge',
      change_vlan: 'port_vlan',
      set_speed: 'port_speed',
      edit_comment: 'port_description',
      cable_test: 'port_cable_test',
    };

    const reqPerm = actionPermMap[action];
    const permitted = reqPerm ? isDeviceActionPermitted(policy, deviceId, reqPerm) : false;
    return { permitted, requiredPermission: reqPerm };
  }

  assert(simulateContextMenuAction(helpdeskPolicy, mikrotikDevId, 'enable').permitted === true, 'Helpdesk context menu enable permitted');
  assert(simulateContextMenuAction(helpdeskPolicy, mikrotikDevId, 'disable').permitted === true, 'Helpdesk context menu disable permitted');
  assert(simulateContextMenuAction(helpdeskPolicy, mikrotikDevId, 'edit_comment').permitted === true, 'Helpdesk context menu edit_comment permitted');
  assert(simulateContextMenuAction(helpdeskPolicy, mikrotikDevId, 'bridge_add').permitted === false, 'Helpdesk context menu bridge_add blocked');
  assert(simulateContextMenuAction(helpdeskPolicy, mikrotikDevId, 'change_vlan').permitted === false, 'Helpdesk context menu change_vlan blocked');
  assert(simulateContextMenuAction(helpdeskPolicy, mikrotikDevId, 'set_speed').permitted === false, 'Helpdesk context menu set_speed blocked');
  assert(simulateContextMenuAction(helpdeskPolicy, mikrotikDevId, 'cable_test').permitted === false, 'Helpdesk context menu cable_test blocked');

  // 5. MikroTik Edit Form Pre-Flight Validation Simulation
  console.log('\n--- Test Group 5: MikroTik Single Edit Form Pre-Flight Validation ---');
  function validateMikroTikEditForm(
    policy: AccessPolicy,
    deviceId: string,
    original: { adminStatus: string; vlan: number; comment: string; speed: string },
    edited: { adminStatus: string; vlan: number; comment: string; speed: string }
  ): { allowed: boolean; unauthorized: string[] } {
    const canPower = isDeviceActionPermitted(policy, deviceId, 'port_power');
    const canVlan = isDeviceActionPermitted(policy, deviceId, 'port_vlan');
    const canDesc = isDeviceActionPermitted(policy, deviceId, 'port_description');
    const canSpeed = isDeviceActionPermitted(policy, deviceId, 'port_speed');

    const unauthorized: string[] = [];
    if (edited.adminStatus !== original.adminStatus && !canPower) unauthorized.push('port_power');
    if (edited.vlan !== original.vlan && !canVlan) unauthorized.push('port_vlan');
    if (edited.comment !== original.comment && !canDesc) unauthorized.push('port_description');
    if (edited.speed !== original.speed && !canSpeed) unauthorized.push('port_speed');

    return { allowed: unauthorized.length === 0, unauthorized };
  }

  const origPort = { adminStatus: 'disabled', vlan: 1, comment: 'Access Point', speed: 'auto' };

  // Helpdesk modifies comment and admin power -> PASS
  const validHelpdeskEdit = validateMikroTikEditForm(
    helpdeskPolicy,
    mikrotikDevId,
    origPort,
    { adminStatus: 'enabled', vlan: 1, comment: 'Updated Access Point', speed: 'auto' }
  );
  assert(validHelpdeskEdit.allowed === true, 'Helpdesk permitted changes (power & comment) pass validation');

  // Helpdesk tries to change VLAN -> FAIL
  const invalidVlanEdit = validateMikroTikEditForm(
    helpdeskPolicy,
    mikrotikDevId,
    origPort,
    { adminStatus: 'disabled', vlan: 100, comment: 'Access Point', speed: 'auto' }
  );
  assert(invalidVlanEdit.allowed === false && invalidVlanEdit.unauthorized.includes('port_vlan'), 'Helpdesk unauthorized VLAN change rejected');

  // Helpdesk tries to change Speed -> FAIL
  const invalidSpeedEdit = validateMikroTikEditForm(
    helpdeskPolicy,
    mikrotikDevId,
    origPort,
    { adminStatus: 'disabled', vlan: 1, comment: 'Access Point', speed: '1G-full' }
  );
  assert(invalidSpeedEdit.allowed === false && invalidSpeedEdit.unauthorized.includes('port_speed'), 'Helpdesk unauthorized Speed change rejected');

  // Auditor tries to modify anything -> FAIL
  const auditorEdit = validateMikroTikEditForm(
    auditorPolicy,
    mikrotikDevId,
    origPort,
    { adminStatus: 'enabled', vlan: 1, comment: 'Access Point', speed: 'auto' }
  );
  assert(auditorEdit.allowed === false && auditorEdit.unauthorized.includes('port_power'), 'Auditor edit completely rejected');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalTests();
