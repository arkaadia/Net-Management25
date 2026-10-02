/**
 * Phase 1 Empirical Verification: Port-Level Granular RBAC Architecture & Database Storage
 */

import { isDeviceActionPermitted as clientIsDeviceActionPermitted, DEVICE_ACTIONS_CATALOG } from './src/utils/rbac';
import { isDeviceActionPermitted as serverIsDeviceActionPermitted } from './server/db';
import * as fs from 'fs';
import * as path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failCount++;
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Phase 1 Verification: Port Actions RBAC Catalog, Database & Evaluators');
  console.log('='.repeat(80));

  // 1. Verify Catalog
  const portKeys = [
    'port_power',
    'port_mode',
    'port_vlan',
    'port_security',
    'port_description',
    'port_bridge',
    'port_speed',
    'port_cable_test',
  ];

  console.log('\n--- Group A: DEVICE_ACTIONS_CATALOG Completeness ---');
  for (const pk of portKeys) {
    const item = DEVICE_ACTIONS_CATALOG.find((a) => a.key === pk);
    assert(Boolean(item), `Port action '${pk}' exists in DEVICE_ACTIONS_CATALOG`);
    assert(item?.category === 'port', `Port action '${pk}' has category 'port'`);
    assert(Boolean(item?.labelEn && item?.labelFa), `Port action '${pk}' has bilingual labels`);
  }

  // 2. Verify database_store.json policies
  console.log('\n--- Group B: database_store.json Policies Storage ---');
  const storePath = path.join(process.cwd(), 'backend', 'database_store.json');
  const storeData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const superAdminPolicy = storeData.access_policies.find((p: any) => p.id === 'policy-super-admin');
  const helpdeskPolicy = storeData.access_policies.find((p: any) => p.id === 'policy-helpdesk');

  assert(Boolean(superAdminPolicy), 'policy-super-admin loaded from database_store.json');
  assert(Boolean(helpdeskPolicy), 'policy-helpdesk loaded from database_store.json');

  for (const pk of portKeys) {
    assert(
      superAdminPolicy.defaultDevicePermissions?.[pk] === true,
      `Super Admin defaultDevicePermissions.${pk} is true`
    );
  }

  assert(helpdeskPolicy.defaultDevicePermissions?.port_power === false, 'Helpdesk port_power is false');
  assert(helpdeskPolicy.defaultDevicePermissions?.port_mode === false, 'Helpdesk port_mode is false');
  assert(helpdeskPolicy.defaultDevicePermissions?.port_vlan === false, 'Helpdesk port_vlan is false');
  assert(helpdeskPolicy.defaultDevicePermissions?.port_security === false, 'Helpdesk port_security is false');
  assert(helpdeskPolicy.defaultDevicePermissions?.port_description === false, 'Helpdesk port_description is false');
  assert(helpdeskPolicy.defaultDevicePermissions?.port_bridge === false, 'Helpdesk port_bridge is false');
  assert(helpdeskPolicy.defaultDevicePermissions?.port_speed === false, 'Helpdesk port_speed is false');
  assert(helpdeskPolicy.defaultDevicePermissions?.port_cable_test === true, 'Helpdesk port_cable_test is true');

  // 3. Test client and server evaluators on Super Admin
  console.log('\n--- Group C: Evaluator Verification on Super Admin ---');
  for (const pk of portKeys) {
    const clientAllowed = clientIsDeviceActionPermitted(superAdminPolicy, 'dev-cisco-core', pk as any);
    const serverAllowed = serverIsDeviceActionPermitted(superAdminPolicy, 'dev-cisco-core', pk);
    assert(clientAllowed && serverAllowed, `Super Admin has '${pk}' allowed on client and server`);
  }

  // 4. Test client and server evaluators on Helpdesk (in-scope device)
  console.log('\n--- Group D: Evaluator Verification on Helpdesk Operator ---');
  const inScopeDevice = 'dev-cisco-edge';
  helpdeskPolicy.allowedDeviceIds = [inScopeDevice];

  assert(!clientIsDeviceActionPermitted(helpdeskPolicy, inScopeDevice, 'port_power' as any), 'Helpdesk client port_power prohibited');
  assert(!serverIsDeviceActionPermitted(helpdeskPolicy, inScopeDevice, 'port_power'), 'Helpdesk server port_power prohibited');
  assert(!clientIsDeviceActionPermitted(helpdeskPolicy, inScopeDevice, 'port_mode' as any), 'Helpdesk client port_mode prohibited');
  assert(!serverIsDeviceActionPermitted(helpdeskPolicy, inScopeDevice, 'port_vlan'), 'Helpdesk server port_vlan prohibited');
  assert(!serverIsDeviceActionPermitted(helpdeskPolicy, inScopeDevice, 'port_description'), 'Helpdesk server port_description prohibited');
  assert(clientIsDeviceActionPermitted(helpdeskPolicy, inScopeDevice, 'port_cable_test' as any), 'Helpdesk client port_cable_test allowed');
  assert(serverIsDeviceActionPermitted(helpdeskPolicy, inScopeDevice, 'port_cable_test'), 'Helpdesk server port_cable_test allowed');

  // 5. Test perDevicePermissions overrides
  console.log('\n--- Group E: Per-Device Granular Override Matrix ---');
  const overriddenPolicy = {
    ...helpdeskPolicy,
    perDevicePermissions: {
      [inScopeDevice]: {
        port_vlan: true,
        port_description: true,
      },
    },
  };

  assert(
    clientIsDeviceActionPermitted(overriddenPolicy, inScopeDevice, 'port_vlan' as any) === true,
    'Client override permits port_vlan on dev-cisco-edge'
  );
  assert(
    serverIsDeviceActionPermitted(overriddenPolicy, inScopeDevice, 'port_vlan') === true,
    'Server override permits port_vlan on dev-cisco-edge'
  );
  assert(
    clientIsDeviceActionPermitted(overriddenPolicy, inScopeDevice, 'port_description' as any) === true,
    'Client override permits port_description on dev-cisco-edge'
  );
  assert(
    serverIsDeviceActionPermitted(overriddenPolicy, inScopeDevice, 'port_power') === false,
    'Server override still strictly prohibits un-overridden port_power'
  );

  console.log('\n' + '='.repeat(80));
  console.log(`Phase 1 Test Summary: Passed: ${passCount} | Failed: ${failCount}`);
  console.log('='.repeat(80));

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
