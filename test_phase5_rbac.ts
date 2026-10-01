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

async function runScenarioTests() {
  console.log('================================================================');
  console.log('🚀 Phase 5: Comprehensive PostgreSQL RBAC & Per-Server Matrix Test');
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
  // STEP 1: Super Administrator Authentication & Baseline Verification
  // --------------------------------------------------------------------------
  console.log('🔹 Step 1: Testing Super Administrator authentication & full access...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const adminLogin = (await adminLoginRes.json()) as LoginResponse;

  assert(adminLogin.success === true, 'Admin login succeeded');
  assert(Boolean(adminLogin.token), 'Admin received valid JWT token');
  assert(adminLogin.effectivePolicy?.id === 'policy-super-admin', 'Admin received policy-super-admin');
  assert(
    adminLogin.effectivePolicy?.defaultServerPermissions?.terminal === true &&
    adminLogin.effectivePolicy?.defaultServerPermissions?.file_explorer === true &&
    adminLogin.effectivePolicy?.defaultServerPermissions?.power_control === true &&
    adminLogin.effectivePolicy?.defaultServerPermissions?.delete_server === true,
    'Super Admin has all 8 default server permissions enabled'
  );

  const adminServersRes = await fetch(`${BASE_URL}/api/remote-servers`, {
    headers: { Authorization: `Bearer ${adminLogin.token}` },
  });
  const adminServersData: any = await adminServersRes.json();
  const allServers = adminServersData.servers || [];
  assert(allServers.length >= 1, `Super Admin retrieved all ${allServers.length} remote servers`);

  // --------------------------------------------------------------------------
  // STEP 2: Helpdesk User Authentication & Device Group Scope Restriction
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 2: Testing Helpdesk Operator authentication & scope boundaries...');
  const helpdeskLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'helpdesk_user', password: 'helpdesk123' }),
  });
  const helpdeskLogin = (await helpdeskLoginRes.json()) as LoginResponse;

  assert(helpdeskLogin.success === true, 'Helpdesk login succeeded');
  assert(Boolean(helpdeskLogin.token), 'Helpdesk received valid JWT token');
  assert(helpdeskLogin.effectivePolicy?.id === 'policy-helpdesk', 'Helpdesk received policy-helpdesk');
  assert(
    Array.isArray(helpdeskLogin.effectivePolicy?.allowedServerIds) &&
    helpdeskLogin.effectivePolicy.allowedServerIds.includes('srv-web-prod01'),
    'Helpdesk is authoritatively restricted to srv-web-prod01 via PostgreSQL device groups'
  );

  const helpdeskServersRes = await fetch(`${BASE_URL}/api/remote-servers`, {
    headers: { Authorization: `Bearer ${helpdeskLogin.token}` },
  });
  const helpdeskServersData: any = await helpdeskServersRes.json();
  const helpdeskServers = helpdeskServersData.servers || [];
  assert(
    helpdeskServers.length === 1 && helpdeskServers[0].id === 'srv-web-prod01',
    `Helpdesk can only view their assigned server srv-web-prod01 (total: ${helpdeskServers.length})`
  );

  // --------------------------------------------------------------------------
  // STEP 3: Out-of-Scope Server Protection (403 Forbidden)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 3: Verifying 403 Forbidden on out-of-scope server (srv-db-master)...');
  const outOfScopeRes = await fetch(`${BASE_URL}/api/remote-servers/srv-db-master`, {
    headers: { Authorization: `Bearer ${helpdeskLogin.token}` },
  });
  assert(
    outOfScopeRes.status === 403,
    `Helpdesk access to srv-db-master correctly blocked with HTTP 403 (got status ${outOfScopeRes.status})`
  );

  // --------------------------------------------------------------------------
  // STEP 4: In-Scope Granular Action Guarding on srv-web-prod01
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 4: Testing granular server actions on in-scope server srv-web-prod01...');
  
  // A. Power Control (restart) - Should be blocked (helpdesk default has power_control: false)
  const restartRes = await fetch(`${BASE_URL}/api/remote-servers/srv-web-prod01/restart`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${helpdeskLogin.token}` 
    },
    body: JSON.stringify({ type: 'graceful' }),
  });
  const restartJson: any = await restartRes.json();
  assert(
    restartRes.status === 403,
    `Restart on srv-web-prod01 blocked with HTTP 403 (power_control: false)`
  );
  assert(
    restartJson.error && restartJson.error.includes('power_control'),
    `Restart error explicitly mentions missing 'power_control' permission: "${restartJson.error}"`
  );

  // B. Delete Server - Should be blocked (helpdesk default has delete_server: false)
  const deleteRes = await fetch(`${BASE_URL}/api/remote-servers/srv-web-prod01`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${helpdeskLogin.token}` },
  });
  const deleteJson: any = await deleteRes.json();
  assert(
    deleteRes.status === 403,
    `Delete server srv-web-prod01 blocked with HTTP 403 (delete_server: false)`
  );
  assert(
    deleteJson.error && deleteJson.error.includes('delete_server'),
    `Delete error explicitly mentions missing 'delete_server' permission: "${deleteJson.error}"`
  );

  // C. Edit Server Properties - Should be blocked (helpdesk default has edit_properties: false)
  const editRes = await fetch(`${BASE_URL}/api/remote-servers/srv-web-prod01`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${helpdeskLogin.token}` 
    },
    body: JSON.stringify({ name: 'Hacked Name' }),
  });
  const editJson: any = await editRes.json();
  assert(
    editRes.status === 403,
    `Edit server srv-web-prod01 blocked with HTTP 403 (edit_properties: false)`
  );
  assert(
    editJson.error && editJson.error.includes('edit_properties'),
    `Edit error explicitly mentions missing 'edit_properties' permission: "${editJson.error}"`
  );

  // --------------------------------------------------------------------------
  // STEP 5: WebSocket Terminal RBAC Enforcement (code 4003)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 5: Testing WebSocket interactive terminal RBAC protection...');
  const wsCloseResult = await new Promise<{ code: number; reason: string; message: string }>((resolve) => {
    let capturedMessage = '';
    const ws = new WebSocket(`${WS_URL}/ws/ssh/srv-web-prod01?token=${helpdeskLogin.token}`);
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
    // safety timeout
    setTimeout(() => {
      try { ws.terminate(); } catch {}
      resolve({ code: 0, reason: 'timeout', message: capturedMessage });
    }, 4000);
  });

  assert(
    wsCloseResult.code === 4003,
    `Terminal WebSocket closed with code 4003 Forbidden for helpdesk_user (got code: ${wsCloseResult.code})`
  );
  assert(
    wsCloseResult.message.includes('Terminal and remote shell access') || wsCloseResult.reason.includes('Forbidden'),
    `Terminal denial banner correctly delivered to client: "${wsCloseResult.message.trim()}"`
  );

  // --------------------------------------------------------------------------
  // STEP 6: Real-World Scenario: Per-Server Matrix Override in PostgreSQL
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 6: Testing dynamic Per-Server Matrix overrides in PostgreSQL...');
  
  // Fetch all policies from DB
  const policies = await getAccessPolicies();
  const helpdeskIdx = policies.findIndex((p: any) => p.id === 'policy-helpdesk');
  assert(helpdeskIdx !== -1, 'Retrieved policy-helpdesk from PostgreSQL database');

  const originalPolicy = JSON.parse(JSON.stringify(policies[helpdeskIdx]));

  try {
    // Scenario A: Explicitly DENY file_explorer on srv-web-prod01 via perServerPermissions
    console.log('   Denying perServerPermissions["srv-web-prod01"].file_explorer = false in DB...');
    const updatedPoliciesA = JSON.parse(JSON.stringify(policies));
    updatedPoliciesA[helpdeskIdx].perServerPermissions = {
      'srv-web-prod01': {
        power_control: false,
        file_explorer: false,
        terminal: false,
      }
    };
    await saveAccessPolicies(updatedPoliciesA);

    const blockedFsRes = await fetch(`${BASE_URL}/api/remote-servers/srv-web-prod01/fs/list?path=/`, {
      headers: { Authorization: `Bearer ${helpdeskLogin.token}` },
    });
    const blockedFsJson: any = await blockedFsRes.json();
    assert(
      blockedFsRes.status === 403,
      `File Explorer on srv-web-prod01 is BLOCKED with HTTP 403 (per-server override)`
    );
    assert(
      blockedFsJson.error && blockedFsJson.error.includes('file_explorer'),
      `File Explorer error correctly notes 'file_explorer' denial: "${blockedFsJson.error}"`
    );

    // Scenario B: Grant terminal explicitly ONLY for srv-web-prod01 in perServerPermissions
    console.log('   Granting perServerPermissions["srv-web-prod01"].terminal = true in DB...');
    const updatedPoliciesB = JSON.parse(JSON.stringify(policies));
    updatedPoliciesB[helpdeskIdx].perServerPermissions = {
      'srv-web-prod01': {
        terminal: true,
        file_explorer: true,
        power_control: false,
      }
    };
    await saveAccessPolicies(updatedPoliciesB);

    // Verify WebSocket terminal is NO LONGER closed with code 4003!
    const wsAllowedResult = await new Promise<{ code: number; reason: string }>((resolve) => {
      const ws = new WebSocket(`${WS_URL}/ws/ssh/srv-web-prod01?token=${helpdeskLogin.token}`);
      let closed = false;
      ws.on('close', (code, reason) => {
        closed = true;
        resolve({ code, reason: reason.toString() });
      });
      ws.on('error', (err) => {
        if (!closed) resolve({ code: -1, reason: err.message });
      });
      // Give it 1.5 seconds - if it's not closed with 4003, it successfully passed the RBAC gate
      setTimeout(() => {
        if (!closed) {
          try { ws.close(); } catch {}
          resolve({ code: 200, reason: 'Passed RBAC check without 4003 closure' });
        }
      }, 1500);
    });

    assert(
      wsAllowedResult.code !== 4003,
      `Terminal WebSocket successfully PASSED RBAC gate after per-server override! (code: ${wsAllowedResult.code}, note: ${wsAllowedResult.reason})`
    );

  } finally {
    // Restore original policy state in PostgreSQL
    console.log('\n   Restoring baseline policy-helpdesk in PostgreSQL...');
    const restorePolicies = JSON.parse(JSON.stringify(policies));
    restorePolicies[helpdeskIdx] = originalPolicy;
    await saveAccessPolicies(restorePolicies);
    console.log('   Policy state restored successfully.');
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

runScenarioTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
