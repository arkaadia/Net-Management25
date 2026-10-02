/**
 * Empirical Proof Test Suite for Phase 3.2:
 * Cisco Port Inspector Single & Batch Edit Granular RBAC Enforcement
 */
import { isDeviceActionPermitted } from './src/utils/rbac';
import { AccessPolicy, NetworkDeviceActionKey } from './src/types';

// Mock test policies matching real database RBAC states
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

// Helpdesk operator policy: only allowed to toggle port power & change description, but NOT vlan, mode, or port security
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
    port_vlan: false,        // Denied
    port_description: true,  // Permitted
    port_mode: false,        // Denied
    port_security: false,    // Denied
    port_bridge: false,
    port_speed: false,
    port_cable_test: false,
  },
  perDevicePermissions: {
    // Override for critical core switch dev-core-01: read-only, power denied
    'dev-core-01': {
      port_power: false,
      port_description: false,
    },
  },
} as unknown as AccessPolicy;

// Read-only audit policy: no edit permissions at all
const readOnlyPolicy: AccessPolicy = {
  id: 'policy-readonly',
  name: 'Auditor Read-Only Policy',
  description: 'Auditor read-only access',
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
    port_vlan: false,
    port_description: false,
    port_mode: false,
    port_security: false,
    port_bridge: false,
    port_speed: false,
    port_cable_test: false,
  },
  perDevicePermissions: {},
} as unknown as AccessPolicy;

function runTests() {
  console.log('================================================================');
  console.log('   EMPIRICAL VERIFICATION SUITE: PHASE 3.2 CISCO PORT INSPECTOR RBAC');
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

  // 1. Super Admin Full Permissions
  console.log('--- Test Group 1: Super Admin Full Capabilities ---');
  const ciscoSwId = 'dev-acc-bldg-a-f3';
  const actions: NetworkDeviceActionKey[] = ['port_power', 'port_vlan', 'port_description', 'port_mode', 'port_security'];
  for (const act of actions) {
    assert(isDeviceActionPermitted(superAdminPolicy, ciscoSwId, act) === true, `SuperAdmin can execute ${act}`);
  }

  // 2. Helpdesk Permissions on Access Switch
  console.log('\n--- Test Group 2: Helpdesk Granular Permissions on Access Switch ---');
  assert(isDeviceActionPermitted(helpdeskPolicy, ciscoSwId, 'port_power') === true, 'Helpdesk CAN toggle port power on access switch');
  assert(isDeviceActionPermitted(helpdeskPolicy, ciscoSwId, 'port_description') === true, 'Helpdesk CAN edit port description on access switch');
  assert(isDeviceActionPermitted(helpdeskPolicy, ciscoSwId, 'port_vlan') === false, 'Helpdesk CANNOT modify VLAN assignment');
  assert(isDeviceActionPermitted(helpdeskPolicy, ciscoSwId, 'port_mode') === false, 'Helpdesk CANNOT modify switchport mode (trunk/access)');
  assert(isDeviceActionPermitted(helpdeskPolicy, ciscoSwId, 'port_security') === false, 'Helpdesk CANNOT toggle or modify port security');

  // 3. Per-Device Override for Helpdesk on Core Switch (dev-core-01)
  console.log('\n--- Test Group 3: Helpdesk Per-Device Override on Core Switch ---');
  assert(isDeviceActionPermitted(helpdeskPolicy, 'dev-core-01', 'port_power') === false, 'Helpdesk CANNOT toggle port power on dev-core-01 (Override)');
  assert(isDeviceActionPermitted(helpdeskPolicy, 'dev-core-01', 'port_description') === false, 'Helpdesk CANNOT edit description on dev-core-01 (Override)');

  // 4. Batch Edit Validation Logic Simulation (Same logic as PortInspectorModal)
  console.log('\n--- Test Group 4: Batch Edit RBAC Pre-Flight Validation ---');
  function validateBatchEdit(
    policy: AccessPolicy,
    deviceId: string,
    batchChanges: {
      adminStatus?: string;
      mode?: string;
      vlan?: string;
      allowedVlans?: string;
      portSec?: string;
    }
  ): { allowed: boolean; unauthorized: string[] } {
    const canPower = isDeviceActionPermitted(policy, deviceId, 'port_power');
    const canVlan = isDeviceActionPermitted(policy, deviceId, 'port_vlan');
    const canMode = isDeviceActionPermitted(policy, deviceId, 'port_mode');
    const canPortSec = isDeviceActionPermitted(policy, deviceId, 'port_security');
    const canAny = canPower || canVlan || canMode || canPortSec;

    if (!canAny) {
      return { allowed: false, unauthorized: ['ALL_PORT_PERMISSIONS'] };
    }

    const unauthorized: string[] = [];
    if (batchChanges.adminStatus && batchChanges.adminStatus !== 'no_change' && !canPower) {
      unauthorized.push('port_power');
    }
    if ((batchChanges.mode && batchChanges.mode !== 'no_change') || (batchChanges.allowedVlans && batchChanges.allowedVlans.trim() !== '')) {
      if (!canMode) unauthorized.push('port_mode');
    }
    if (batchChanges.vlan && batchChanges.vlan.trim() !== '' && !canVlan) {
      unauthorized.push('port_vlan');
    }
    if (batchChanges.portSec && batchChanges.portSec !== 'no_change' && !canPortSec) {
      unauthorized.push('port_security');
    }

    return { allowed: unauthorized.length === 0, unauthorized };
  }

  // Helpdesk tries batch admin power change only -> should PASS
  const helpdeskBatchPower = validateBatchEdit(helpdeskPolicy, ciscoSwId, { adminStatus: 'enabled' });
  assert(helpdeskBatchPower.allowed === true, 'Helpdesk batch power change passes validation');

  // Helpdesk tries batch VLAN change -> should FAIL with port_vlan unauthorized
  const helpdeskBatchVlan = validateBatchEdit(helpdeskPolicy, ciscoSwId, { vlan: '100' });
  assert(helpdeskBatchVlan.allowed === false && helpdeskBatchVlan.unauthorized.includes('port_vlan'), 'Helpdesk batch VLAN change rejected');

  // Helpdesk tries batch Mode change -> should FAIL with port_mode unauthorized
  const helpdeskBatchMode = validateBatchEdit(helpdeskPolicy, ciscoSwId, { mode: 'trunk' });
  assert(helpdeskBatchMode.allowed === false && helpdeskBatchMode.unauthorized.includes('port_mode'), 'Helpdesk batch Mode change rejected');

  // Helpdesk tries batch Port Security enable -> should FAIL with port_security unauthorized
  const helpdeskBatchSec = validateBatchEdit(helpdeskPolicy, ciscoSwId, { portSec: 'enabled' });
  assert(helpdeskBatchSec.allowed === false && helpdeskBatchSec.unauthorized.includes('port_security'), 'Helpdesk batch Port Security change rejected');

  // Read-only auditor tries batch anything -> should be completely rejected
  const auditorBatch = validateBatchEdit(readOnlyPolicy, ciscoSwId, { adminStatus: 'enabled' });
  assert(auditorBatch.allowed === false && auditorBatch.unauthorized.includes('ALL_PORT_PERMISSIONS'), 'Auditor batch rejected completely as read-only');

  // 5. Single Port Edit Pre-flight Validation
  console.log('\n--- Test Group 5: Single Port Edit RBAC Validation ---');
  function validateSingleEdit(
    policy: AccessPolicy,
    deviceId: string,
    original: { adminStatus: string; mode: string; vlan: number; desc: string; portSec: boolean },
    edited: { adminStatus: string; mode: string; vlan: number; desc: string; portSec: boolean }
  ): { allowed: boolean; unauthorized: string[] } {
    const canPower = isDeviceActionPermitted(policy, deviceId, 'port_power');
    const canVlan = isDeviceActionPermitted(policy, deviceId, 'port_vlan');
    const canDesc = isDeviceActionPermitted(policy, deviceId, 'port_description');
    const canMode = isDeviceActionPermitted(policy, deviceId, 'port_mode');
    const canPortSec = isDeviceActionPermitted(policy, deviceId, 'port_security');

    const unauthorized: string[] = [];
    if (edited.adminStatus !== original.adminStatus && !canPower) unauthorized.push('port_power');
    if (edited.vlan !== original.vlan && !canVlan) unauthorized.push('port_vlan');
    if (edited.desc !== original.desc && !canDesc) unauthorized.push('port_description');
    if (edited.mode !== original.mode && !canMode) unauthorized.push('port_mode');
    if (edited.portSec !== original.portSec && !canPortSec) unauthorized.push('port_security');

    return { allowed: unauthorized.length === 0, unauthorized };
  }

  const orig = { adminStatus: 'disabled', mode: 'access', vlan: 10, desc: 'Old Desc', portSec: false };

  // Helpdesk modifies description & power -> PASS
  const helpdeskSinglePermitted = validateSingleEdit(
    helpdeskPolicy,
    ciscoSwId,
    orig,
    { adminStatus: 'enabled', mode: 'access', vlan: 10, desc: 'New Desc', portSec: false }
  );
  assert(helpdeskSinglePermitted.allowed === true, 'Helpdesk single edit of power and desc passes');

  // Helpdesk modifies VLAN -> FAIL
  const helpdeskSingleVlan = validateSingleEdit(
    helpdeskPolicy,
    ciscoSwId,
    orig,
    { adminStatus: 'disabled', mode: 'access', vlan: 20, desc: 'Old Desc', portSec: false }
  );
  assert(helpdeskSingleVlan.allowed === false && helpdeskSingleVlan.unauthorized.includes('port_vlan'), 'Helpdesk single edit of VLAN rejected');

  // Helpdesk modifies Port Security -> FAIL
  const helpdeskSingleSec = validateSingleEdit(
    helpdeskPolicy,
    ciscoSwId,
    orig,
    { adminStatus: 'disabled', mode: 'access', vlan: 10, desc: 'Old Desc', portSec: true }
  );
  assert(helpdeskSingleSec.allowed === false && helpdeskSingleSec.unauthorized.includes('port_security'), 'Helpdesk single edit of Port Security rejected');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
