import fetch from 'node-fetch';
import WebSocket from 'ws';
import { getAccessPolicies, saveAccessPolicies } from './server/db';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

interface LoginResponse {
  success: boolean;
  token: string;
  user: any;
  effectivePolicy: any;
  error?: string;
}

async function runNetworkEquipmentRbacTests() {
  console.log('================================================================');
  console.log('🚀 Phase 5: Empirical Verification - Network Equipment Granular RBAC');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // STEP 1: Super Administrator Authentication & Baseline 9-Action Verification
  // --------------------------------------------------------------------------
  console.log('🔹 Step 1: Testing Super Administrator authentication & full 9-action permissions...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const adminLogin = (await adminLoginRes.json()) as LoginResponse;

  assert(adminLogin.success === true, 'Super Admin login succeeded');
  assert(Boolean(adminLogin.token), 'Super Admin received valid JWT token');
  assert(adminLogin.effectivePolicy?.id === 'policy-super-admin', 'Super Admin received policy-super-admin');

  const adminDevPerms = adminLogin.effectivePolicy?.defaultDevicePermissions || {};
  assert(
    adminDevPerms.web_configs === true &&
    adminDevPerms.terminal === true &&
    adminDevPerms.apply_template === true &&
    adminDevPerms.device_note === true &&
    adminDevPerms.edit_properties === true &&
    adminDevPerms.ping_keepalive === true &&
    adminDevPerms.inspect_ports === true &&
    adminDevPerms.write_memory === true &&
    adminDevPerms.delete_device === true,
    'Super Admin has all 9 default network device permissions enabled (web_configs, terminal, apply_template, device_note, edit_properties, ping_keepalive, inspect_ports, write_memory, delete_device)'
  );

  const adminDevicesRes = await fetch(`${BASE_URL}/api/devices`, {
    headers: { Authorization: `Bearer ${adminLogin.token}` },
  });
  const adminDevicesData: any = await adminDevicesRes.json();
  const allDevices = adminDevicesData.devices || [];
  assert(allDevices.length >= 1, `Super Admin retrieved all ${allDevices.length} network devices without scope restriction`);

  // --------------------------------------------------------------------------
  // STEP 2: Helpdesk Operator Authentication & Default Device Permissions Check
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 2: Testing Helpdesk Operator authentication & device permissions baseline...');
  const helpdeskLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'helpdesk_user', password: 'helpdesk123' }),
  });
  const helpdeskLogin = (await helpdeskLoginRes.json()) as LoginResponse;

  assert(helpdeskLogin.success === true, 'Helpdesk user login succeeded');
  assert(Boolean(helpdeskLogin.token), 'Helpdesk user received valid JWT token');
  assert(helpdeskLogin.effectivePolicy?.id === 'policy-helpdesk', 'Helpdesk user received policy-helpdesk');

  const helpdeskDevPerms = helpdeskLogin.effectivePolicy?.defaultDevicePermissions || {};
  assert(
    helpdeskDevPerms.delete_device === false &&
    helpdeskDevPerms.edit_properties === false &&
    helpdeskDevPerms.write_memory === false &&
    helpdeskDevPerms.apply_template === false &&
    helpdeskDevPerms.terminal === false,
    'Helpdesk Operator has restricted default device actions (delete_device, edit_properties, write_memory, apply_template, terminal = false)'
  );

  // --------------------------------------------------------------------------
  // STEP 3: Out-of-Scope Network Equipment Protection (HTTP 403 Forbidden)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 3: Verifying 403 Forbidden on out-of-scope network device...');
  const outOfScopeRes = await fetch(`${BASE_URL}/api/devices/dev-core-01`, {
    headers: { Authorization: `Bearer ${helpdeskLogin.token}` },
  });
  assert(
    outOfScopeRes.status === 403,
    `Helpdesk access to out-of-scope device dev-core-01 correctly blocked with HTTP 403 (got status ${outOfScopeRes.status})`
  );
  const outOfScopeJson: any = await outOfScopeRes.json().catch(() => ({}));
  assert(
    outOfScopeJson.error && outOfScopeJson.error.includes('Access denied'),
    `Out-of-scope error details explicit refusal: "${outOfScopeJson.error}"`
  );

  // --------------------------------------------------------------------------
  // STEP 4: In-Scope Granular Action Guarding (delete_device, edit_properties, etc.)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 4: Testing granular equipment actions on in-scope device...');
  
  // We temporarily assign dev-core-01 to policy-helpdesk scope to test granular action guarding:
  const policies = await getAccessPolicies();
  const helpdeskIdx = policies.findIndex((p: any) => p.id === 'policy-helpdesk');
  assert(helpdeskIdx !== -1, 'Loaded policy-helpdesk from database');
  const originalPolicy = JSON.parse(JSON.stringify(policies[helpdeskIdx]));

  try {
    // Give helpdesk access to dev-core-01 in scope, but keeping defaultDevicePermissions restricted
    const scopedPolicies = JSON.parse(JSON.stringify(policies));
    scopedPolicies[helpdeskIdx].targetScope = 'specific';
    scopedPolicies[helpdeskIdx].targetDeviceIds = ['dev-core-01'];
    scopedPolicies[helpdeskIdx].allowedDeviceIds = ['dev-core-01'];
    scopedPolicies[helpdeskIdx].defaultDevicePermissions = {
      web_configs: true,
      terminal: false,
      apply_template: false,
      device_note: true,
      edit_properties: false,
      ping_keepalive: true,
      inspect_ports: true,
      write_memory: false,
      delete_device: false,
    };
    await saveAccessPolicies(scopedPolicies);

    // Re-login to get updated token and effective policy
    const freshHelpdeskRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'helpdesk_user', password: 'helpdesk123' }),
    });
    const freshHelpdesk = (await freshHelpdeskRes.json()) as LoginResponse;

    // A. Delete Device (DELETE /api/devices/dev-core-01) -> Expected 403
    const deleteDevRes = await fetch(`${BASE_URL}/api/devices/dev-core-01`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${freshHelpdesk.token}` },
    });
    const deleteDevJson: any = await deleteDevRes.json();
    assert(
      deleteDevRes.status === 403,
      `DELETE /api/devices/dev-core-01 blocked with HTTP 403 for delete_device: false`
    );
    assert(
      deleteDevJson.error && deleteDevJson.error.includes('delete_device'),
      `Delete device error explicitly references 'delete_device' action: "${deleteDevJson.error}"`
    );

    // B. Edit Properties (PUT /api/devices/dev-core-01) -> Expected 403
    const editDevRes = await fetch(`${BASE_URL}/api/devices/dev-core-01`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshHelpdesk.token}` 
      },
      body: JSON.stringify({ name: 'Unauthorized Name Change' }),
    });
    const editDevJson: any = await editDevRes.json();
    assert(
      editDevRes.status === 403,
      `PUT /api/devices/dev-core-01 blocked with HTTP 403 for edit_properties: false`
    );
    assert(
      editDevJson.error && editDevJson.error.includes('edit_properties'),
      `Edit properties error explicitly references 'edit_properties' action: "${editDevJson.error}"`
    );

    // C. Write Memory (POST /api/devices/dev-core-01/write-memory) -> Expected 403
    const writeMemRes = await fetch(`${BASE_URL}/api/devices/dev-core-01/write-memory`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshHelpdesk.token}` },
    });
    const writeMemJson: any = await writeMemRes.json();
    assert(
      writeMemRes.status === 403,
      `POST /api/devices/dev-core-01/write-memory blocked with HTTP 403 for write_memory: false`
    );
    assert(
      writeMemJson.error && writeMemJson.error.includes('write_memory'),
      `Write memory error explicitly references 'write_memory' action: "${writeMemJson.error}"`
    );

    // D. Apply Template (POST /api/devices/dev-core-01/template) -> Expected 403
    const templateRes = await fetch(`${BASE_URL}/api/devices/dev-core-01/template`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshHelpdesk.token}` 
      },
      body: JSON.stringify({ templateId: 'tpl-snmp' }),
    });
    const templateJson: any = await templateRes.json();
    assert(
      templateRes.status === 403,
      `POST /api/devices/dev-core-01/template blocked with HTTP 403 for apply_template: false`
    );
    assert(
      templateJson.error && templateJson.error.includes('apply_template'),
      `Apply template error explicitly references 'apply_template' action: "${templateJson.error}"`
    );

    // ------------------------------------------------------------------------
    // STEP 5: WebSocket Interactive CLI / Terminal Protection (Code 4003)
    // ------------------------------------------------------------------------
    console.log('\n🔹 Step 5: Testing WebSocket interactive CLI/terminal RBAC gate...');
    const wsCloseResult = await new Promise<{ code: number; reason: string; message: string }>((resolve) => {
      let capturedMessage = '';
      const ws = new WebSocket(`${WS_URL}/ws/terminal/dev-core-01?token=${freshHelpdesk.token}`);
      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.data) capturedMessage += parsed.data;
        } catch {
          capturedMessage += data.toString();
        }
      });
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString(), message: capturedMessage });
      });
      ws.on('error', (err) => {
        resolve({ code: -1, reason: err.message, message: capturedMessage });
      });
      // Safety timeout
      setTimeout(() => {
        try { ws.terminate(); } catch {}
        resolve({ code: 0, reason: 'timeout', message: capturedMessage });
      }, 4000);
    });

    assert(
      wsCloseResult.code === 4003,
      `Terminal WebSocket closed with code 4003 Forbidden for user lacking 'terminal' permission (got code: ${wsCloseResult.code})`
    );
    assert(
      wsCloseResult.message.includes('Terminal and interactive CLI access') || wsCloseResult.reason.includes('Forbidden'),
      `Terminal denial banner delivered to client: "${wsCloseResult.message.trim()}"`
    );

    // ------------------------------------------------------------------------
    // STEP 6: Dynamic Per-Device Matrix Override in Database (perDevicePermissions)
    // ------------------------------------------------------------------------
    console.log('\n🔹 Step 6: Testing dynamic Per-Device Matrix Override in database...');
    
    // Scenario A: Explicitly grant 'terminal' and 'edit_properties' on dev-core-01 only
    console.log('   Granting perDevicePermissions["dev-core-01"].terminal = true and edit_properties = true in DB...');
    const updatedPoliciesA = JSON.parse(JSON.stringify(scopedPolicies));
    updatedPoliciesA[helpdeskIdx].perDevicePermissions = {
      'dev-core-01': {
        terminal: true,
        edit_properties: true,
        delete_device: false,
        write_memory: false,
      }
    };
    await saveAccessPolicies(updatedPoliciesA);

    // Test WebSocket CLI after per-device override
    const wsAllowedResult = await new Promise<{ code: number; reason: string }>((resolve) => {
      const ws = new WebSocket(`${WS_URL}/ws/terminal/dev-core-01?token=${freshHelpdesk.token}`);
      let closed = false;
      ws.on('close', (code, reason) => {
        closed = true;
        resolve({ code, reason: reason.toString() });
      });
      ws.on('error', (err) => {
        if (!closed) resolve({ code: -1, reason: err.message });
      });
      // Give it 1.5 seconds - if it's not closed with 4003, it passed the gate
      setTimeout(() => {
        if (!closed) {
          try { ws.close(); } catch {}
          resolve({ code: 200, reason: 'Passed RBAC check without 4003 closure' });
        }
      }, 1500);
    });

    assert(
      wsAllowedResult.code !== 4003,
      `Terminal WebSocket successfully PASSED RBAC gate after per-device matrix override! (code: ${wsAllowedResult.code})`
    );

    // Scenario B: Verify edit_properties is now allowed on dev-core-01
    const allowedEditRes = await fetch(`${BASE_URL}/api/devices/dev-core-01`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshHelpdesk.token}` 
      },
      body: JSON.stringify({ location: 'Rack 01 - Shelf B' }),
    });
    assert(
      allowedEditRes.status === 200,
      `PUT /api/devices/dev-core-01 succeeded with HTTP 200 after perDevicePermissions.edit_properties = true granted!`
    );

  } finally {
    // Restore baseline policy state in database
    console.log('\n   Restoring baseline policy-helpdesk in database...');
    const restorePolicies = JSON.parse(JSON.stringify(policies));
    restorePolicies[helpdeskIdx] = originalPolicy;
    await saveAccessPolicies(restorePolicies);
    console.log('   Baseline policy state restored successfully.');
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 Test Summary: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runNetworkEquipmentRbacTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
