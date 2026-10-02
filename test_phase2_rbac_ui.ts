import {
  DEVICE_ACTIONS_CATALOG,
  FULL_PORT_PERMISSIONS,
  EMPTY_PORT_PERMISSIONS,
  FULL_EQUIPMENT_PERMISSIONS,
  EMPTY_EQUIPMENT_PERMISSIONS,
  FULL_DEVICE_PERMISSIONS,
  EMPTY_DEVICE_PERMISSIONS,
  isDeviceActionPermitted,
} from './src/utils/rbac';
import type { AccessPolicy, NetworkDeviceActionKey } from './src/types';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, desc: string) {
    if (cond) {
      passed++;
      console.log(`  ✓ ${desc}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${desc}`);
    }
  }

  console.log('\n=== Test Group 1: DEVICE_ACTIONS_CATALOG Completeness & Structure ===');
  assert(DEVICE_ACTIONS_CATALOG.length === 17, `Catalog has 17 total capabilities (got ${DEVICE_ACTIONS_CATALOG.length})`);

  const generalActions = DEVICE_ACTIONS_CATALOG.filter((a) => a.category !== 'port');
  const portActions = DEVICE_ACTIONS_CATALOG.filter((a) => a.category === 'port');

  assert(generalActions.length === 9, `9 General Equipment Actions present (got ${generalActions.length})`);
  assert(portActions.length === 8, `8 Port & Interface Actions present (got ${portActions.length})`);

  for (const act of DEVICE_ACTIONS_CATALOG) {
    assert(Boolean(act.key && act.labelEn && act.labelFa), `Action ${act.key} has bilingual labels`);
    assert(Boolean(act.shortLabelEn && act.shortLabelFa), `Action ${act.key} has bilingual shortLabels`);
    assert(Boolean(act.descriptionEn && act.descriptionFa), `Action ${act.key} has bilingual descriptions`);
    assert(Boolean(act.tooltipWhatEn && act.tooltipWhatFa), `Action ${act.key} has What-Is-It 3-part tooltip`);
    assert(Boolean(act.tooltipWhyEn && act.tooltipWhyFa), `Action ${act.key} has Why-Is-It-Needed 3-part tooltip`);
    assert(Boolean(act.tooltipExampleEn && act.tooltipExampleFa), `Action ${act.key} has Example 3-part tooltip`);
    assert(['all', 'cisco', 'mikrotik', 'common'].includes(act.platform || 'all'), `Action ${act.key} has valid platform (${act.platform})`);
  }

  console.log('\n=== Test Group 2: Constant Sets & Granular Bundles ===');
  assert(Object.keys(FULL_PORT_PERMISSIONS).length === 8, 'FULL_PORT_PERMISSIONS has 8 port actions');
  assert(Object.keys(EMPTY_PORT_PERMISSIONS).length === 8, 'EMPTY_PORT_PERMISSIONS has 8 port actions');
  assert(Object.keys(FULL_EQUIPMENT_PERMISSIONS).length === 9, 'FULL_EQUIPMENT_PERMISSIONS has 9 equipment actions');
  assert(Object.keys(EMPTY_EQUIPMENT_PERMISSIONS).length === 9, 'EMPTY_EQUIPMENT_PERMISSIONS has 9 equipment actions');
  assert(Object.keys(FULL_DEVICE_PERMISSIONS).length === 17, 'FULL_DEVICE_PERMISSIONS has all 17 actions');
  assert(Object.keys(EMPTY_DEVICE_PERMISSIONS).length === 17, 'EMPTY_DEVICE_PERMISSIONS has all 17 actions');

  console.log('\n=== Test Group 3: Specific Port Capability Checks ===');
  const expectedPortKeys: NetworkDeviceActionKey[] = [
    'port_power',
    'port_mode',
    'port_vlan',
    'port_security',
    'port_description',
    'port_bridge',
    'port_speed',
    'port_cable_test',
  ];

  for (const pKey of expectedPortKeys) {
    assert(portActions.some((a) => a.key === pKey), `Port action ${pKey} is defined in port catalog`);
    assert(FULL_PORT_PERMISSIONS[pKey] === true, `FULL_PORT_PERMISSIONS has ${pKey} = true`);
    assert(EMPTY_PORT_PERMISSIONS[pKey] === false, `EMPTY_PORT_PERMISSIONS has ${pKey} = false`);
  }

  console.log('\n=== Test Group 4: Simulation of Policy UI State Evaluation ===');
  const samplePolicy = {
    id: 'policy-helpdesk',
    name: 'Helpdesk Operator',
    description: 'Level 1 support',
    targetScope: 'all',
    canViewDevices: true,
    defaultDevicePermissions: {
      inspect_ports: true,
      ping_keepalive: true,
      port_description: true,
      port_cable_test: true,
      port_power: false,
      port_vlan: false,
      terminal: false,
    },
    perDevicePermissions: {
      'sw-access-floor1': {
        port_power: true, // override to allow port power on access switch only
        port_vlan: true,  // override to allow vlan assignment on access switch
      },
      'sw-core-01': {
        port_description: false, // override to block description on core
      },
    },
  } as unknown as AccessPolicy;

  // Baseline default on generic device
  assert(isDeviceActionPermitted(samplePolicy, 'sw-dist-01', 'port_description') === true, 'Baseline: port_description is permitted');
  assert(isDeviceActionPermitted(samplePolicy, 'sw-dist-01', 'port_power') === false, 'Baseline: port_power is denied');
  assert(isDeviceActionPermitted(samplePolicy, 'sw-dist-01', 'port_vlan') === false, 'Baseline: port_vlan is denied');
  assert(isDeviceActionPermitted(samplePolicy, 'sw-dist-01', 'terminal') === false, 'Baseline: terminal is denied');

  // Override on sw-access-floor1
  assert(isDeviceActionPermitted(samplePolicy, 'sw-access-floor1', 'port_power') === true, 'Override: port_power granted on access switch');
  assert(isDeviceActionPermitted(samplePolicy, 'sw-access-floor1', 'port_vlan') === true, 'Override: port_vlan granted on access switch');
  assert(isDeviceActionPermitted(samplePolicy, 'sw-access-floor1', 'port_description') === true, 'Fallback: port_description remains inherited on access switch');

  // Override on sw-core-01
  assert(isDeviceActionPermitted(samplePolicy, 'sw-core-01', 'port_description') === false, 'Override: port_description denied on core switch');
  assert(isDeviceActionPermitted(samplePolicy, 'sw-core-01', 'port_cable_test') === true, 'Fallback: port_cable_test remains inherited on core switch');

  console.log(`\n=============================================`);
  console.log(`Phase 2 Test Summary: Passed: ${passed} | Failed: ${failed}`);
  console.log(`=============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
