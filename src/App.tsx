import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navbar, ThemeType } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { DeviceListView } from './components/DeviceListView';
import { SchematicTopologyView } from './components/SchematicTopologyView';
import { PortManagementView } from './components/PortManagementView';
import { CdpLldpScannerView } from './components/CdpLldpScannerView';
import { TemplateManagementView } from './components/TemplateManagementView';
import { AddDeviceModal } from './components/AddDeviceModal';
import { EditDeviceModal } from './components/EditDeviceModal';
import { PortInspectorModal } from './components/PortInspectorModal';
import { CiscoTerminalModal } from './components/CiscoTerminalModal';
import { MikroTikTerminalModal } from './components/MikroTikTerminalModal';
import { MikroTikDeviceManageModal } from './components/MikroTikDeviceManageModal';
import { MultiTerminalWorkspace } from './components/terminal/MultiTerminalWorkspace';
import { ApplyTemplateModal } from './components/ApplyTemplateModal';
import { ReleaseNotesModal } from './components/ReleaseNotesModal';
import { TopologyDiscoveryModal } from './components/TopologyDiscoveryModal';
import { BulkDeviceConfigModal } from './components/BulkDeviceConfigModal';
import { SettingsView } from './components/settings/SettingsView';
import { AuditLogsView } from './components/logs/AuditLogsView';
import { RemoteServersView } from './components/servers/RemoteServersView';
import { NetworkToolsMenu } from './components/tools/NetworkToolsMenu';
import { ToolsDock, StandardModalId, MinimizedStandardModal } from './components/tools/ToolsDock';
import { NetworkToolId, ActiveToolState } from './components/tools/types';
import { IpSubnetModal } from './components/tools/IpSubnetModal';
import { PasswordGeneratorModal } from './components/tools/PasswordGeneratorModal';
import { PortScannerModal } from './components/tools/PortScannerModal';
import { DnsUtilitiesModal } from './components/tools/DnsUtilitiesModal';
import { TracerouteModal } from './components/tools/TracerouteModal';
import { CertLookupModal } from './components/tools/CertLookupModal';
import { HeaderAnalyzerModal } from './components/tools/HeaderAnalyzerModal';
import { UpsCalculatorModal } from './components/tools/UpsCalculatorModal';
import { HostCheckerModal } from './components/tools/HostCheckerModal';
import { PasswordVaultModal } from './components/vault/PasswordVaultModal';
import { Wrench, ChevronUp } from 'lucide-react';
import { APP_VERSION } from './version';
import { Device, TopologyData, isMikroTikDevice } from './types';
import {
  fetchDevices,
  fetchTopology,
  addDevice,
  updateDevice,
  deleteDevice,
  pingAllDevices,
  pingDevice,
  runCdpLldpScan,
  resetDemoData,
  writeMemory
} from './services/api';
import {
  logDeviceAddition,
  logDeviceDeletion,
  logDeviceUpdate,
  logDeviceCommand
} from './services/auditLogger';
import { useLanguage } from './i18n';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './components/login/LoginPage';
import { NetworkSocketLoader } from './components/common/NetworkSocketLoader';
import {
  getEffectiveUserPolicy,
  isTabAllowed,
  syncAccessPoliciesFromDatabase,
  syncLocalGroupsFromDatabase,
  syncDeviceGroupsFromDatabase,
  loadAccessPolicies,
  loadLocalGroups,
  loadDeviceGroups,
  loadSimulatedRoleId,
} from './services/settingsStorage';
import { AccessPolicy, LocalGroup, DeviceGroup } from './types';
import { isDeviceActionPermitted } from './utils/rbac';

export default function App() {
  const { t, isRtl, isEn } = useLanguage();
  const { isAuthenticated, isLoading: isAuthLoading, user, effectivePolicy: authEffectivePolicy } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [devices, setDevices] = useState<Device[]>([]);
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // RBAC Access Control States (Synchronized directly with PostgreSQL database via Bearer Token)
  const [policies, setPolicies] = useState<AccessPolicy[]>([]);
  const [localGroups, setLocalGroups] = useState<LocalGroup[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([]);
  const [simulatedRoleId, setSimulatedRoleId] = useState<string>('actual-user');

  // Synchronize policies & groups from database
  useEffect(() => {
    if (isAuthenticated) {
      syncAccessPoliciesFromDatabase().then((p) => {
        if (Array.isArray(p) && p.length > 0) setPolicies(p);
      }).catch(() => {});
      syncLocalGroupsFromDatabase().then((g) => {
        if (Array.isArray(g) && g.length > 0) setLocalGroups(g);
      }).catch(() => {});
      syncDeviceGroupsFromDatabase().then((dg) => {
        if (Array.isArray(dg) && dg.length > 0) setDeviceGroups(dg);
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  // Listen for real-time RBAC policy and simulated role events
  useEffect(() => {
    const handlePoliciesChanged = (e: any) => {
      if (e.detail?.policies) {
        setPolicies(e.detail.policies);
      } else {
        setPolicies(loadAccessPolicies());
      }
    };
    const handleSimRoleChanged = (e: any) => {
      setSimulatedRoleId(loadSimulatedRoleId());
    };
    const handleDeviceGroupsChanged = (e: any) => {
      if (e.detail?.groups) {
        setDeviceGroups(e.detail.groups);
      } else {
        setDeviceGroups(loadDeviceGroups());
      }
    };
    window.addEventListener('nettopology_access_policies_changed', handlePoliciesChanged);
    window.addEventListener('nettopology_simulated_role_changed', handleSimRoleChanged);
    window.addEventListener('nettopology_device_groups_changed', handleDeviceGroupsChanged);
    return () => {
      window.removeEventListener('nettopology_access_policies_changed', handlePoliciesChanged);
      window.removeEventListener('nettopology_simulated_role_changed', handleSimRoleChanged);
      window.removeEventListener('nettopology_device_groups_changed', handleDeviceGroupsChanged);
    };
  }, []);

  // Compute live effective policy for logged-in user:
  // Primary authority is PostgreSQL database returned via Bearer Token (authEffectivePolicy).
  // Only an authorized Administrator can temporarily preview simulated policies in the simulator.
  const effectivePolicy = useMemo(() => {
    const isSuperAdmin =
      user &&
      ((user.username || '').toLowerCase() === 'admin' ||
        (user.role || '').toLowerCase().includes('super admin'));

    if (isSuperAdmin && simulatedRoleId && simulatedRoleId !== 'actual-user') {
      const simPolicy = policies.find((p) => p.id === simulatedRoleId);
      if (simPolicy) return simPolicy;
    }

    // Default to the authoritative policy verified and provided by PostgreSQL
    if (authEffectivePolicy) return authEffectivePolicy;

    // In-memory calculation if server policy is pending
    return getEffectiveUserPolicy(user, policies, localGroups, simulatedRoleId);
  }, [authEffectivePolicy, user, policies, localGroups, simulatedRoleId]);

  // Database-authoritative authorized devices for current user session
  const authorizedDevices = useMemo(() => {
    if (!effectivePolicy || effectivePolicy.targetScope === 'all') {
      return devices;
    }

    // 1. Authoritative IDs calculated by PostgreSQL backend in effectivePolicy
    if (Array.isArray(effectivePolicy.allowedDeviceIds)) {
      const allowedSet = new Set(effectivePolicy.allowedDeviceIds);
      return devices.filter((d) => allowedSet.has(d.id));
    }

    // 2. Client-side evaluation fallback based on database-loaded groups
    if (effectivePolicy.targetScope === 'groups') {
      const targetGroupSet = new Set(
        (effectivePolicy.targetGroupIds || []).map((id) => (id || '').trim().toLowerCase())
      );
      const allowedDevIds = new Set<string>();
      for (const g of deviceGroups) {
        const gid = (g.id || '').trim().toLowerCase();
        const gname = (g.name || '').trim().toLowerCase();
        if (targetGroupSet.has(gid) || targetGroupSet.has(gname)) {
          const ids = g.deviceIds || (g as any).device_ids || [];
          ids.forEach((id: string) => allowedDevIds.add(id));
        }
      }
      return devices.filter((d) => allowedDevIds.has(d.id));
    }

    if (effectivePolicy.targetScope === 'specific') {
      const targetDevIds = new Set(effectivePolicy.targetDeviceIds || []);
      return devices.filter((d) => targetDevIds.has(d.id));
    }

    return devices;
  }, [devices, effectivePolicy, deviceGroups]);

  // Database-authoritative authorized topology graph
  const authorizedTopology = useMemo(() => {
    if (!topology) return null;
    if (!effectivePolicy || effectivePolicy.targetScope === 'all') {
      return topology;
    }
    const allowedSet = new Set(authorizedDevices.map((d) => d.id));
    const filteredNodes = (topology.nodes || []).filter((n) => allowedSet.has(n.id));
    const filteredLinks = (topology.links || []).filter(
      (l) => allowedSet.has(l.source) && allowedSet.has(l.target)
    );
    return {
      ...topology,
      nodes: filteredNodes,
      links: filteredLinks,
      summary: {
        ...topology.summary,
        total_nodes: filteredNodes.length,
        total_links: filteredLinks.length,
        core_switches: filteredNodes.filter((d: any) => d.type === 'switch' && (d.role || '').includes('Core')).length,
        access_switches: filteredNodes.filter((d: any) => d.type === 'switch' && (d.role || '').includes('Access')).length,
        routers: filteredNodes.filter((d: any) => d.type === 'router').length,
        access_points: filteredNodes.filter((d: any) => d.type === 'access_point').length,
      },
    };
  }, [topology, authorizedDevices, effectivePolicy]);

  // Enforce access control: Automatically route user to an accessible tab if current tab is denied
  useEffect(() => {
    if (effectivePolicy && !isTabAllowed(activeTab, effectivePolicy)) {
      const candidateTabs: ActiveTab[] = [
        'dashboard',
        'schematic',
        'devices',
        'remote-servers',
        'ports',
        'scanner',
        'templates',
        'logs',
        'settings-groups',
      ];
      const firstAllowed = candidateTabs.find((t) => isTabAllowed(t, effectivePolicy)) || 'dashboard';
      if (firstAllowed !== activeTab) {
        setActiveTab(firstAllowed);
      }
    }
  }, [effectivePolicy, activeTab]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  }, []);

  // Theme State (Default to obsidian cyber spatial glass)
  const [panelTheme, setPanelTheme] = useState<ThemeType>(() => {
    const saved = (localStorage.getItem('panel_theme') as ThemeType) || 'obsidian';
    if (typeof document !== 'undefined') {
      if (saved === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }
    return saved;
  });

  const changeTheme = (newTheme: ThemeType) => {
    setPanelTheme(newTheme);
    localStorage.setItem('panel_theme', newTheme);
    localStorage.setItem('theme_mode', newTheme === 'light' ? 'light' : 'dark');
    if (typeof document !== 'undefined') {
      if (newTheme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }
  };

  // Collapsible sidebar state with local storage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch (e) {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [portInspectorDevice, setPortInspectorDevice] = useState<Device | null>(null);
  const [activeTerminals, setActiveTerminals] = useState<(Device | null)[]>([]);
  const [applyTemplateDevice, setApplyTemplateDevice] = useState<Device | null>(null);
  const [applyPreselectedTemplateId, setApplyPreselectedTemplateId] = useState<string | undefined>(undefined);
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);
  const [isBulkConfigOpen, setIsBulkConfigOpen] = useState(false);
  const [bulkConfigDevices, setBulkConfigDevices] = useState<Device[]>([]);

  // Network Tools Suite State
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [activeTools, setActiveTools] = useState<ActiveToolState[]>([]);

  const handleOpenTool = (id: NetworkToolId) => {
    setActiveTools((prev) => {
      const existing = prev.find((t) => t.id === id);
      if (existing) {
        return prev.map((t) => (t.id === id ? { ...t, isMinimized: false } : t));
      }
      const labelMap: Record<NetworkToolId, { en: string; fa: string; badge?: string }> = {
        ip_subnetting: { en: 'IP Subnetting', fa: 'ساب‌نتینگ آی‌پی', badge: 'IPv4/v6' },
        password_gen: { en: 'Password Gen', fa: 'تولید پسورد', badge: 'Crypto' },
        port_scanner: { en: 'Port Scanner', fa: 'اسکنر پورت', badge: 'TCP' },
        net_utils: { en: 'DNS & Ping', fa: 'ابزارهای DNS و پینگ', badge: 'DNS' },
        trace_tools: { en: 'Traceroute', fa: 'ردیابی مسیر', badge: 'Trace' },
        cert_lookup: { en: 'SSL Inspector', fa: 'بررسی گواهی', badge: 'TLS' },
        header_analyzer: { en: 'Header Analyzer', fa: 'تحلیل هدرها', badge: 'HTTP' },
        ups_calculator: { en: 'UPS & Battery Sizing', fa: 'محاسبه‌گر باتری یوپی‌اس', badge: 'Power' },
        host_checker: { en: 'Global Host Checker', fa: 'هاست چکر بین‌المللی', badge: 'Multi-Country' },
        password_vault: { en: 'Password Vault', fa: 'کیف امن گذرواژه', badge: 'AES-256' }
      };
      const meta = labelMap[id];
      return [
        ...prev,
        {
          id,
          isMinimized: false,
          labelEn: meta.en,
          labelFa: meta.fa,
          badge: meta.badge
        }
      ];
    });
  };

  const handleMinimizeTool = (id: NetworkToolId) => {
    setActiveTools((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isMinimized: true } : t))
    );
  };

  const handleCloseTool = (id: NetworkToolId) => {
    setActiveTools((prev) => prev.filter((t) => t.id !== id));
  };

  const isToolOpen = (id: NetworkToolId) => {
    const tool = activeTools.find((t) => t.id === id);
    return !!tool && !tool.isMinimized;
  };

  // Standard Modals Minimized State
  const [minimizedModals, setMinimizedModals] = useState<MinimizedStandardModal[]>([]);
  const [attentionModalId, setAttentionModalId] = useState<string | null>(null);
  const attentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDockAttention = useCallback((modalId: string, messageEn: string, messageFa: string) => {
    setAttentionModalId(modalId);
    showToast(isEn ? messageEn : messageFa);
    if (attentionTimerRef.current) {
      clearTimeout(attentionTimerRef.current);
    }
    attentionTimerRef.current = setTimeout(() => {
      setAttentionModalId(null);
    }, 4500);
  }, [isEn, showToast]);

  const handleClearAttention = useCallback(() => {
    setAttentionModalId(null);
    if (attentionTimerRef.current) {
      clearTimeout(attentionTimerRef.current);
    }
  }, []);

  const handleMinimizeStandardModal = (modal: MinimizedStandardModal) => {
    setMinimizedModals((prev) => {
      if (prev.some((m) => m.id === modal.id)) return prev;
      return [...prev, modal];
    });
  };

  const handleRestoreStandardModal = (id: StandardModalId) => {
    setMinimizedModals((prev) => prev.filter((m) => m.id !== id));
    if (id === 'add_device') setIsAddModalOpen(true);
    if (id === 'release_notes') setIsReleaseNotesOpen(true);
    if (id === 'topology_discovery') setIsDiscoveryModalOpen(true);
    if (id === 'bulk_device_config') setIsBulkConfigOpen(true);
    handleClearAttention();
  };

  const handleCloseStandardModal = (id: StandardModalId) => {
    setMinimizedModals((prev) => prev.filter((m) => m.id !== id));
    if (id === 'add_device') setIsAddModalOpen(false);
    if (id === 'edit_device') setEditingDevice(null);
    if (id === 'port_inspector') setPortInspectorDevice(null);
    if (id === 'terminal') setActiveTerminals([]);
    if (id === 'apply_template') {
      setApplyTemplateDevice(null);
      setApplyPreselectedTemplateId(undefined);
    }
    if (id === 'release_notes') setIsReleaseNotesOpen(false);
    if (id === 'topology_discovery') setIsDiscoveryModalOpen(false);
    if (id === 'bulk_device_config') {
      setIsBulkConfigOpen(false);
      setBulkConfigDevices([]);
    }
    handleClearAttention();
  };

  const handleCloseAllMinimized = useCallback(() => {
    setMinimizedModals([]);
    setActiveTools((prev) => prev.filter((t) => !t.isMinimized));
    setIsAddModalOpen(false);
    setEditingDevice(null);
    setPortInspectorDevice(null);
    setActiveTerminals([]);
    setApplyTemplateDevice(null);
    setApplyPreselectedTemplateId(undefined);
    setIsReleaseNotesOpen(false);
    setIsDiscoveryModalOpen(false);
    setIsBulkConfigOpen(false);
    setBulkConfigDevices([]);
    handleClearAttention();
  }, [handleClearAttention]);

  const handleRestoreAllMinimized = useCallback(() => {
    const modalIds = minimizedModals.map((m) => m.id);
    setMinimizedModals([]);
    if (modalIds.includes('add_device')) setIsAddModalOpen(true);
    if (modalIds.includes('release_notes')) setIsReleaseNotesOpen(true);
    if (modalIds.includes('topology_discovery')) setIsDiscoveryModalOpen(true);
    if (modalIds.includes('bulk_device_config')) setIsBulkConfigOpen(true);
    setActiveTools((prev) => prev.map((t) => ({ ...t, isMinimized: false })));
    handleClearAttention();
  }, [minimizedModals, handleClearAttention]);

  const isModalMinimized = useCallback(
    (id: StandardModalId) => minimizedModals.some((m) => m.id === id),
    [minimizedModals]
  );

  // Safe Modal Opening Handlers with Attention Trigger when modal already exists (Issue 5)
  const handleOpenAddModal = useCallback(() => {
    if (isModalMinimized('add_device')) {
      triggerDockAttention(
        'add_device',
        'Add Device window is already minimized in the dock. Click to restore.',
        'پنجره افزودن تجهیز در نوار پایین باز است. جهت بازگشت روی آن کلیک کنید.'
      );
      return;
    }
    setIsAddModalOpen(true);
  }, [isModalMinimized, triggerDockAttention]);

  const handleOpenEditDevice = useCallback((dev: Device) => {
    if (isModalMinimized('edit_device')) {
      const name = editingDevice?.name || (isEn ? 'Device' : 'تجهیز');
      triggerDockAttention(
        'edit_device',
        `Edit modal for ${name} is already open in the dock.`,
        `پنجره ویرایش برای ${name} در نوار پایین باز است.`
      );
      return;
    }
    setEditingDevice(dev);
  }, [isModalMinimized, editingDevice, isEn, triggerDockAttention]);

  const handleInspectPorts = useCallback((dev: Device) => {
    if (isModalMinimized('port_inspector')) {
      const currentName = portInspectorDevice ? portInspectorDevice.name : (isEn ? 'Device' : 'تجهیز');
      triggerDockAttention(
        'port_inspector',
        `Port Inspector for ${currentName} is already minimized in the dock. Click to restore or close it.`,
        `پنجره مدیریت پورت (${currentName}) در نوار پایین باز است. لطفاً ابتدا روی آن کلیک کنید یا آن را ببندید.`
      );
      return;
    }
    setPortInspectorDevice(dev);
  }, [isModalMinimized, portInspectorDevice, isEn, triggerDockAttention]);

  const openTerminal = useCallback((dev: Device | null) => {
    if (!dev) {
      setActiveTerminals([]);
      return;
    }
    // Strict RBAC check: verify whether user is permitted to open CLI terminal on this device
    const canTerminal = isDeviceActionPermitted(authEffectivePolicy, dev.id, 'terminal');
    if (!canTerminal) {
      showToast(
        isEn
          ? `Access Denied: You do not have permission to access terminal on ${dev.name || dev.ip || 'this device'}.`
          : `عدم دسترسی: شما مجوز دسترسی به ترمینال خط فرمان در تجهیز ${dev.name || dev.ip || 'این دستگاه'} را ندارید.`
      );
      return;
    }
    if (isModalMinimized('terminal')) {
      triggerDockAttention(
        'terminal',
        'A Terminal workspace is already minimized in the dock. Click to restore or close it.',
        'محیط ترمینال در نوار پایین باز است. لطفاً ابتدا روی آن کلیک کنید یا آن را ببندید.'
      );
      return;
    }
    setActiveTerminals([dev]);
  }, [isModalMinimized, triggerDockAttention, authEffectivePolicy, isEn, showToast]);

  const handleOpenApplyTemplate = useCallback((dev: Device, templateId?: string) => {
    if (isModalMinimized('apply_template')) {
      triggerDockAttention(
        'apply_template',
        'Apply Template modal is already open in the dock.',
        'پنجره اعمال تمپلت در نوار پایین باز است.'
      );
      return;
    }
    setApplyTemplateDevice(dev);
    setApplyPreselectedTemplateId(templateId);
  }, [isModalMinimized, triggerDockAttention]);

  const handleOpenReleaseNotes = useCallback(() => {
    if (isModalMinimized('release_notes')) {
      triggerDockAttention(
        'release_notes',
        'Release Notes modal is already open in the dock.',
        'پنجره گزارش تغییرات در نوار پایین باز است.'
      );
      return;
    }
    setIsReleaseNotesOpen(true);
  }, [isModalMinimized, triggerDockAttention]);

  const handleOpenDiscoveryModal = useCallback(() => {
    if (isModalMinimized('topology_discovery')) {
      triggerDockAttention(
        'topology_discovery',
        'CDP & LLDP Discovery window is already open in the dock.',
        'پنجره کشف توپولوژی در نوار پایین باز است.'
      );
      return;
    }
    setIsDiscoveryModalOpen(true);
  }, [isModalMinimized, triggerDockAttention]);

  // Fullscreen Topology Mode (Hides Navbar header, sidebar, and footer for 100% canvas view)
  const [isTopologyFullscreen, setIsTopologyFullscreen] = useState(false);

  const toggleTopologyFullscreen = useCallback(() => {
    setIsTopologyFullscreen((prev) => {
      const next = !prev;
      if (next) {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  // Listen for Escape key and browser fullscreen changes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopologyFullscreen) {
        setIsTopologyFullscreen(false);
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isTopologyFullscreen) {
        setIsTopologyFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isTopologyFullscreen]);

  // Initial load
  const loadData = useCallback(async () => {
    try {
      const [devRes, topoRes] = await Promise.all([
        fetchDevices(),
        fetchTopology(),
      ]);
      setDevices(devRes.devices);
      setTopology(topoRes);
    } catch (err) {
      console.warn('[Initial Load] Backend starting up, retrying initial data fetch in 800ms...', err);
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const [devRes, topoRes] = await Promise.all([
          fetchDevices(),
          fetchTopology(),
        ]);
        setDevices(devRes.devices);
        setTopology(topoRes);
      } catch (retryErr) {
        console.warn('Initial data load retry deferred to background polling:', retryErr);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic reachability polling every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      refreshStatusesQuietly();
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const refreshStatusesQuietly = async () => {
    try {
      const devRes = await fetchDevices();
      setDevices(devRes.devices);
    } catch (e) {
      // Quiet fail on periodic ping
    }
  };

  // Full manual refresh
  const handleRefreshAll = async () => {
    try {
      setIsRefreshing(true);
      await pingAllDevices();
      await loadData();
      showToast(t('toast_refresh_success'));
    } catch (err: any) {
      showToast(t('toast_refresh_error', { error: err.message }));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Ping single device
  const handlePingDevice = async (id: string) => {
    try {
      const res = await pingDevice(id);
      setDevices((prev) => prev.map((d) => (d.id === id ? res.device : d)));
      const statusLabel = res.device.is_online ? (isEn ? 'Online' : 'آنلاین') : (isEn ? 'Offline' : 'آفلاین');
      showToast(
        t('toast_ping_result', {
          name: res.device.name,
          status: statusLabel,
          latency: res.device.latency_ms ?? 0,
        })
      );
    } catch (err: any) {
      showToast(t('toast_ping_error', { error: err.message }));
    }
  };

  // Run CDP/LLDP scan
  const handleRunScan = async () => {
    try {
      setIsScanning(true);
      const res = await runCdpLldpScan();
      await loadData();
      showToast(isEn ? ((res as any).message_en || t('toast_scan_done')) : (res.message || t('toast_scan_done')));
    } catch (err: any) {
      showToast(t('toast_scan_error', { error: err.message }));
    } finally {
      setIsScanning(false);
    }
  };

  // Add new device
  const handleAddDevice = async (newDev: Partial<Device>) => {
    const res = await addDevice(newDev);
    await loadData();
    if (res.device) {
      logDeviceAddition(res.device);
    }
    showToast(t('toast_device_added', { name: newDev.name || '' }));
    return res.device;
  };

  // Update existing device
  const handleUpdateDevice = async (id: string, updates: Partial<Device>) => {
    try {
      const oldDev = devices.find((d) => d.id === id);
      const res = await updateDevice(id, updates);
      await loadData();
      if (res.device) {
        logDeviceUpdate(id, oldDev, res.device);
      }
      showToast(isEn ? `Device "${res.device.name}" updated successfully.` : `مشخصات تجهیز «${res.device.name}» با موفقیت ویرایش و ذخیره شد.`);
      return res.device;
    } catch (err: any) {
      showToast(isEn ? `Error updating device: ${err.message}` : `خطا در به‌روزرسانی مشخصات تجهیز: ${err.message}`);
      throw err;
    }
  };

  // Delete device
  const handleDeleteDevice = async (id: string) => {
    try {
      const targetDev = devices.find((d) => d.id === id);
      if (targetDev) {
        logDeviceDeletion(targetDev);
      }
      await deleteDevice(id);
      await loadData();
      showToast(t('toast_device_deleted'));
    } catch (err: any) {
      showToast(t('toast_device_delete_error', { error: err.message }));
    }
  };

  // Reset to corporate seed
  const handleResetDemo = async () => {
    if (window.confirm(t('toast_reset_confirm'))) {
      try {
        await resetDemoData();
        await loadData();
        showToast(t('toast_reset_done'));
      } catch (err: any) {
        showToast(t('toast_reset_error', { error: err.message }));
      }
    }
  };

  // Write running-config to startup-config (NVRAM)
  const handleWriteMemory = async (deviceId: string) => {
    try {
      const dev = devices.find((d) => d.id === deviceId);
      const res = await writeMemory(deviceId);
      await loadData();
      if (dev) {
        logDeviceCommand({
          deviceId: dev.id,
          deviceName: dev.name,
          deviceIp: dev.ip,
          deviceVendor: dev.model.toLowerCase().includes('mikrotik') ? 'mikrotik' : 'cisco',
          deviceModel: dev.model,
          deviceLocation: [dev.building, dev.floor, dev.unit, dev.rack ? `رک ${dev.rack}` : ''].filter(Boolean).join(' > '),
          channel: 'port_context_menu',
          command: 'write memory',
          riskLevel: 'medium',
          status: 'success',
          outputSummary: 'Building configuration...\n[OK]',
          notes: 'ذخیره Running-Config در Startup-Config از طریق کنترل پنل پورتال',
        });
      }
      showToast(isEn ? ((res as any).message_en || t('toast_write_mem_success')) : (res.message || t('toast_write_mem_success')));
    } catch (err: any) {
      showToast(t('toast_write_mem_error', { error: err.message }));
    }
  };

  const onlineCount = devices.filter((d) => d.is_online).length;
  const offlineCount = devices.filter((d) => !d.is_online).length;

  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen bg-[#060911] flex flex-col items-center justify-center text-slate-300 font-sans select-none overflow-hidden">
        <NetworkSocketLoader
          isEn={isEn}
          message={isEn ? 'Loading Page...' : 'در حال بارگذاری صفحه...'}
          subMessage={isEn ? 'Please wait, checking session and loading workspace' : 'لطفاً شکیبا باشید، در حال بررسی نشست و بارگذاری سامانه'}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage currentTheme={panelTheme} onThemeChange={changeTheme} />;
  }

  return (
    <div
      className={`h-screen min-h-screen max-h-screen relative flex flex-col justify-between theme-${panelTheme} ${
        isRtl ? 'dir-rtl text-right' : 'dir-ltr text-left'
      } font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-300 overflow-hidden`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Dynamic Ambient Glow Background */}
      <div className="ambient-glow-background" />

      {/* Navbar Header (Hidden in Full Mode) */}
      {!isTopologyFullscreen && (
        <Navbar
          onRefreshAll={handleRefreshAll}
          isRefreshing={isRefreshing}
          onQuickScan={handleRunScan}
          isScanning={isScanning}
          onResetDemo={handleResetDemo}
          onlineCount={onlineCount}
          totalDevices={devices.length}
          panelTheme={panelTheme}
          onChangeTheme={changeTheme}
          onOpenReleaseNotes={handleOpenReleaseNotes}
          onOpenSettings={() => setActiveTab('settings')}
          onOpenPasswordVault={() => handleOpenTool('password_vault')}
        />
      )}

      {/* Main Layout (Sidebar + Content View) */}
      <div className={`flex-1 flex flex-col lg:flex-row overflow-hidden relative min-h-0 ${isTopologyFullscreen ? 'z-50 h-full w-full p-0 m-0' : 'z-10'}`}>
        {/* Sidebar (Hidden in Full Mode) */}
        {!isTopologyFullscreen && (
          <Sidebar
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setIsTopologyFullscreen(false);
              setActiveTab(tab);
            }}
            devicesCount={authorizedDevices.length}
            offlineCount={authorizedDevices.filter((d) => !d.is_online).length}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
            onOpenReleaseNotes={handleOpenReleaseNotes}
            effectivePolicy={effectivePolicy}
          />
        )}

        {/* View Port */}
        <main className={`flex-1 min-h-0 min-w-0 ${isTopologyFullscreen ? 'overflow-hidden h-full w-full p-0 m-0' : 'overflow-y-auto'}`}>
          {activeTab === 'dashboard' && (
            <DashboardView
              devices={authorizedDevices}
              topology={authorizedTopology || topology}
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenAddModal={handleOpenAddModal}
              onScanCdpLldp={handleRunScan}
              isScanning={isScanning}
              onInspectPorts={handleInspectPorts}
              onRefreshAll={handleRefreshAll}
              isRefreshing={isRefreshing}
            />
          )}

          {activeTab === 'devices' && (
            <DeviceListView
              devices={authorizedDevices}
              onOpenAddModal={handleOpenAddModal}
              onPingDevice={handlePingDevice}
              onDeleteDevice={handleDeleteDevice}
              onEditDevice={handleOpenEditDevice}
              onInspectPorts={handleInspectPorts}
              onConnectTerminal={openTerminal}
              onApplyTemplate={handleOpenApplyTemplate}
              onWriteMemory={handleWriteMemory}
              onRefreshAll={handleRefreshAll}
              isRefreshing={isRefreshing}
              isLightMode={panelTheme === 'light'}
              onOpenBulkConfig={(selected) => {
                setBulkConfigDevices(selected);
                setIsBulkConfigOpen(true);
              }}
            />
          )}

          {activeTab === 'templates' && (
            <TemplateManagementView
              devices={authorizedDevices}
              onDeviceUpdated={loadData}
              onOpenTerminal={openTerminal}
            />
          )}

          {activeTab === 'schematic' && (
            <SchematicTopologyView
              topology={authorizedTopology || topology}
              inventoryDevices={authorizedDevices}
              loading={loading}
              onRefresh={loadData}
              onScanCdpLldp={handleRunScan}
              onOpenDiscoveryModal={handleOpenDiscoveryModal}
              isScanning={isScanning}
              onInspectDevice={handleInspectPorts}
              onInspectPorts={handleInspectPorts}
              onConnectTerminal={openTerminal}
              isFullMode={isTopologyFullscreen}
              onToggleFullMode={toggleTopologyFullscreen}
              panelTheme={panelTheme}
            />
          )}

          {activeTab === 'ports' && <PortManagementView devices={authorizedDevices} />}

          {activeTab === 'scanner' && (
            <CdpLldpScannerView onNavigateToTopology={() => setActiveTab('schematic')} />
          )}

          {activeTab === 'logs' && <AuditLogsView />}

          {(activeTab === 'remote-servers' ||
            activeTab === 'remote-linux' ||
            activeTab === 'remote-windows' ||
            activeTab === 'remote-tags') && (
            <RemoteServersView
              initialFilter={
                activeTab === 'remote-linux'
                  ? 'linux'
                  : activeTab === 'remote-windows'
                  ? 'windows'
                  : activeTab === 'remote-tags'
                  ? 'tags'
                  : 'all'
              }
              isLightMode={panelTheme === 'light'}
              isEn={isEn}
              effectivePolicy={effectivePolicy}
            />
          )}

          {(activeTab === 'settings' ||
            activeTab === 'settings-groups' ||
            activeTab === 'settings-users' ||
            activeTab === 'settings-ad' ||
            activeTab === 'settings-rbac' ||
            activeTab === 'settings-backup') && (
            <SettingsView
              devices={devices}
              isLightMode={panelTheme === 'light'}
              activeSubTab={
                activeTab === 'settings-users'
                  ? 'users'
                  : activeTab === 'settings-ad'
                  ? 'ad'
                  : activeTab === 'settings-rbac'
                  ? 'rbac'
                  : activeTab === 'settings-backup'
                  ? 'backup'
                  : 'groups'
              }
              onSelectSubTab={(sub) => {
                setActiveTab(
                  sub === 'users'
                    ? 'settings-users'
                    : sub === 'ad'
                    ? 'settings-ad'
                    : sub === 'rbac'
                    ? 'settings-rbac'
                    : sub === 'backup'
                    ? 'settings-backup'
                    : 'settings-groups'
                );
              }}
              onRefreshAllData={loadData}
            />
          )}
        </main>
      </div>

      {/* High Density Cyber Spatial Footer Status Bar (Hidden in Full Mode) */}
      {!isTopologyFullscreen && (
        <footer className="h-8 spatial-glass text-slate-300 flex items-center px-4 lg:px-6 shrink-0 justify-between text-[11px] border-t border-white/10 select-none relative z-[10000] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"></span>
              {t('footer_network_status')} <b className="text-emerald-400 font-mono font-bold">{t('footer_status_nominal')}</b>
            </span>
            <span className="hidden sm:inline text-slate-400">
              {t('footer_core_latency')} <b className="text-cyan-400 font-mono">1.2ms</b>
            </span>
            <span>
              {t('footer_connected_devices')} <b className="text-indigo-400 font-mono font-bold">{onlineCount}</b>/{devices.length}
            </span>
            <span className="hidden md:inline text-slate-400">
              {t('footer_neighbor_engine')} <b className="text-purple-400 font-mono">CDP v2 / LLDP Matrix</b>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Tools Menu Button */}
            <div className="relative">
              <button
                id="footer-tools-menu-button"
                onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                className={`px-2 py-0.5 rounded flex items-center gap-1.5 font-mono text-[11px] transition cursor-pointer border ${
                  isToolsMenuOpen
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-cyan-300 border-white/10'
                }`}
                title={isEn ? 'Network Engineering Tools Suite' : 'مجموعه ابزارهای کمکی شبکه'}
              >
                <Wrench className="w-3 h-3 text-cyan-400" />
                <span className="font-bold tracking-wide">tools</span>
                <ChevronUp className={`w-3 h-3 transition-transform duration-200 ${isToolsMenuOpen ? 'rotate-180 text-cyan-300' : 'text-slate-400'}`} />
              </button>

              <NetworkToolsMenu
                isOpen={isToolsMenuOpen}
                onClose={() => setIsToolsMenuOpen(false)}
                onSelectTool={handleOpenTool}
                isEn={isEn}
                isLightMode={panelTheme === 'light'}
              />
            </div>

            <button
              onClick={() => setIsReleaseNotesOpen(true)}
              className="font-mono text-slate-400 hover:text-cyan-300 text-[10px] hidden sm:flex items-center gap-1.5 transition cursor-pointer"
              title={t('footer_view_release')}
            >
              <span>NetTopology OS</span>
              <span className="text-cyan-400 font-bold bg-white/5 hover:bg-white/10 px-1.5 py-0.2 rounded border border-white/10">
                v{APP_VERSION}
              </span>
            </button>
          </div>
        </footer>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-10 ${isRtl ? 'left-6' : 'right-6'} z-50 spatial-glass border border-indigo-500/50 text-indigo-100 px-4 py-2.5 rounded-xl shadow-[0_0_30px_rgba(99,102,241,0.4)] text-xs flex items-center gap-3 backdrop-blur-2xl animate-fadeIn`}>
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white mr-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Add Device Modal */}
      <AddDeviceModal
        isOpen={isAddModalOpen && !isModalMinimized('add_device')}
        onClose={() => handleCloseStandardModal('add_device')}
        onMinimize={() =>
          handleMinimizeStandardModal({
            id: 'add_device',
            labelEn: 'Add Device',
            labelFa: 'افزودن تجهیز جدید',
            badge: 'Hardware',
            category: 'device',
          })
        }
        onAdd={handleAddDevice}
        onOpenTerminal={(dev) => openTerminal(dev as any)}
        onDeviceCreatedWithTemplate={(createdDevice, templateId) => {
          setApplyTemplateDevice(createdDevice);
          setApplyPreselectedTemplateId(templateId);
        }}
      />

      {/* Edit Device Modal */}
      {editingDevice && (
        <EditDeviceModal
          isOpen={!!editingDevice && !isModalMinimized('edit_device')}
          device={editingDevice}
          onClose={() => handleCloseStandardModal('edit_device')}
          onMinimize={() =>
            handleMinimizeStandardModal({
              id: 'edit_device',
              labelEn: `Edit ${editingDevice.name}`,
              labelFa: `ویرایش ${editingDevice.name}`,
              badge: editingDevice.ip || 'Config',
              category: 'device',
            })
          }
          onSave={async (deviceId, updates) => {
            await handleUpdateDevice(deviceId, updates);
            setEditingDevice(null);
          }}
        />
      )}

      {/* Apply Template Interactive Modal */}
      <ApplyTemplateModal
        isOpen={!!applyTemplateDevice && !isModalMinimized('apply_template')}
        onClose={() => handleCloseStandardModal('apply_template')}
        onMinimize={() =>
          handleMinimizeStandardModal({
            id: 'apply_template',
            labelEn: applyTemplateDevice ? `Template (${applyTemplateDevice.name})` : 'Apply Template',
            labelFa: applyTemplateDevice ? `تمپلت (${applyTemplateDevice.name})` : 'اعمال تمپلت',
            badge: 'CLI',
            category: 'config',
          })
        }
        targetDevice={applyTemplateDevice}
        allDevices={devices}
        preselectedTemplateId={applyPreselectedTemplateId}
        onApplied={(updatedDevice) => {
          loadData();
          showToast(t('toast_template_applied', { name: updatedDevice.name }));
        }}
      />

      {/* Port Inspector Modal (Cisco & Generic devices) */}
      <PortInspectorModal
        device={portInspectorDevice}
        isOpen={!!portInspectorDevice && !isMikroTikDevice(portInspectorDevice) && !isModalMinimized('port_inspector')}
        onClose={() => handleCloseStandardModal('port_inspector')}
        onMinimize={() =>
          handleMinimizeStandardModal({
            id: 'port_inspector',
            labelEn: portInspectorDevice ? `Ports (${portInspectorDevice.name})` : 'Port Inspector',
            labelFa: portInspectorDevice ? `پورت‌های ${portInspectorDevice.name}` : 'مدیریت پورت‌ها',
            badge: portInspectorDevice?.ip || 'Ports',
            category: 'device',
          })
        }
        onPortUpdated={loadData}
        onConnectTerminal={
          portInspectorDevice && isDeviceActionPermitted(authEffectivePolicy, portInspectorDevice.id, 'terminal')
            ? (dev) => openTerminal(dev)
            : undefined
        }
        onWriteMemory={handleWriteMemory}
      />

      {/* MikroTik Device & Port Inspector Modal */}
      <MikroTikDeviceManageModal
        device={portInspectorDevice}
        isOpen={!!portInspectorDevice && isMikroTikDevice(portInspectorDevice) && !isModalMinimized('port_inspector')}
        onClose={() => handleCloseStandardModal('port_inspector')}
        onMinimize={() =>
          handleMinimizeStandardModal({
            id: 'port_inspector',
            labelEn: portInspectorDevice ? `RouterOS (${portInspectorDevice.name})` : 'RouterOS Port Inspector',
            labelFa: portInspectorDevice ? `میکروتیک (${portInspectorDevice.name})` : 'مدیریت روتربورد',
            badge: 'RouterOS',
            category: 'device',
          })
        }
        onPortUpdated={loadData}
        onConnectTerminal={
          portInspectorDevice && isDeviceActionPermitted(authEffectivePolicy, portInspectorDevice.id, 'terminal')
            ? (dev) => openTerminal(dev)
            : undefined
        }
        onDeviceUpdated={loadData}
        isLightMode={panelTheme === 'light'}
      />

      {/* Multi-Terminal Workspace & Split CLI System (Cisco & MikroTik) */}
      <MultiTerminalWorkspace
        activeTerminalDevices={activeTerminals}
        isOpen={activeTerminals.length > 0 && !isModalMinimized('terminal')}
        onClose={() => handleCloseStandardModal('terminal')}
        onMinimize={() => {
          const firstDev = activeTerminals.find((d) => d !== null);
          const devName = firstDev ? firstDev.name : 'Device';
          handleMinimizeStandardModal({
            id: 'terminal',
            labelEn: activeTerminals.length > 1 ? `Terminal (${activeTerminals.length} panes)` : `CLI (${devName})`,
            labelFa: activeTerminals.length > 1 ? `ترمینال (${activeTerminals.length} پنل)` : `ترمینال (${devName})`,
            badge: firstDev?.ip || 'CLI',
            category: 'terminal',
          });
        }}
        onDevicesChange={setActiveTerminals}
        allDevices={topology?.devices || devices}
        onDeviceUpdated={loadData}
        isLightMode={panelTheme === 'light'}
      />

      {/* Release Notes & Version History Modal */}
      <ReleaseNotesModal
        isOpen={isReleaseNotesOpen && !isModalMinimized('release_notes')}
        onClose={() => handleCloseStandardModal('release_notes')}
        onMinimize={() =>
          handleMinimizeStandardModal({
            id: 'release_notes',
            labelEn: `Release Notes v${APP_VERSION}`,
            labelFa: `گزارش تغییرات v${APP_VERSION}`,
            badge: `v${APP_VERSION}`,
            category: 'system',
          })
        }
      />

      {/* CDP & LLDP Topology Discovery Modal */}
      <TopologyDiscoveryModal
        isOpen={isDiscoveryModalOpen && !isModalMinimized('topology_discovery')}
        onClose={() => handleCloseStandardModal('topology_discovery')}
        onMinimize={() =>
          handleMinimizeStandardModal({
            id: 'topology_discovery',
            labelEn: 'CDP/LLDP Discovery',
            labelFa: 'کشف هوشمند توپولوژی',
            badge: 'CDP/LLDP',
            category: 'config',
          })
        }
        devices={topology?.devices || authorizedDevices}
        onApplyToMap={() => {
          loadData();
        }}
        isLightMode={panelTheme === 'light'}
      />

      {/* Bulk Device Configuration Modal (Cisco & MikroTik Real Execution) */}
      <BulkDeviceConfigModal
        isOpen={isBulkConfigOpen && !isModalMinimized('bulk_device_config')}
        devices={bulkConfigDevices}
        allDevices={devices}
        onClose={() => handleCloseStandardModal('bulk_device_config')}
        onMinimize={() =>
          handleMinimizeStandardModal({
            id: 'bulk_device_config',
            labelEn: `Bulk Config (${bulkConfigDevices.length})`,
            labelFa: `پیکربندی گروهی (${bulkConfigDevices.length})`,
            badge: `${bulkConfigDevices.length}`,
            category: 'config',
          })
        }
        onDeviceUpdated={loadData}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />

      {/* Minimized Tools & Modals Dock (Shows all minimized tool & modal pills at bottom) */}
      <ToolsDock
        activeTools={activeTools}
        onRestoreTool={handleOpenTool}
        onCloseTool={handleCloseTool}
        minimizedModals={minimizedModals}
        onRestoreModal={handleRestoreStandardModal}
        onCloseModal={handleCloseStandardModal}
        onRestoreAll={handleRestoreAllMinimized}
        onCloseAll={handleCloseAllMinimized}
        attentionModalId={attentionModalId}
        onClearAttention={handleClearAttention}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
        isRtl={isRtl}
      />

      {/* 1. IP Subnetting & VLSM Calculator Modal */}
      <IpSubnetModal
        isOpen={isToolOpen('ip_subnetting')}
        onClose={() => handleCloseTool('ip_subnetting')}
        onMinimize={() => handleMinimizeTool('ip_subnetting')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />

      {/* 2. Device Password Generator Modal */}
      <PasswordGeneratorModal
        isOpen={isToolOpen('password_gen')}
        onClose={() => handleCloseTool('password_gen')}
        onMinimize={() => handleMinimizeTool('password_gen')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
        onOpenVault={() => handleOpenTool('password_vault')}
      />

      {/* 3. TCP Port Scanner Modal */}
      <PortScannerModal
        isOpen={isToolOpen('port_scanner')}
        onClose={() => handleCloseTool('port_scanner')}
        onMinimize={() => handleMinimizeTool('port_scanner')}
        allDevices={devices}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />

      {/* 4. DNS & Ping Utilities Modal */}
      <DnsUtilitiesModal
        isOpen={isToolOpen('net_utils')}
        onClose={() => handleCloseTool('net_utils')}
        onMinimize={() => handleMinimizeTool('net_utils')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />

      {/* 5. Traceroute & Hop Analysis Modal */}
      <TracerouteModal
        isOpen={isToolOpen('trace_tools')}
        onClose={() => handleCloseTool('trace_tools')}
        onMinimize={() => handleMinimizeTool('trace_tools')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />

      {/* 6. SSL / TLS Certificate Inspector Modal */}
      <CertLookupModal
        isOpen={isToolOpen('cert_lookup')}
        onClose={() => handleCloseTool('cert_lookup')}
        onMinimize={() => handleMinimizeTool('cert_lookup')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />

      {/* 7. HTTP Header & Security Analyzer Modal */}
      <HeaderAnalyzerModal
        isOpen={isToolOpen('header_analyzer')}
        onClose={() => handleCloseTool('header_analyzer')}
        onMinimize={() => handleMinimizeTool('header_analyzer')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />

      {/* 8. UPS Capacity & Battery Bank Sizing Modal */}
      <UpsCalculatorModal
        isOpen={isToolOpen('ups_calculator')}
        onClose={() => handleCloseTool('ups_calculator')}
        onMinimize={() => handleMinimizeTool('ups_calculator')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
        devices={devices}
      />

      {/* 9. Global Host Checker Modal */}
      <HostCheckerModal
        isOpen={isToolOpen('host_checker')}
        onClose={() => handleCloseTool('host_checker')}
        onMinimize={() => handleMinimizeTool('host_checker')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
        devices={devices}
      />

      {/* 10. Personal Encrypted Password Vault Modal */}
      <PasswordVaultModal
        isOpen={isToolOpen('password_vault')}
        onClose={() => handleCloseTool('password_vault')}
        onMinimize={() => handleMinimizeTool('password_vault')}
        isEn={isEn}
        isLightMode={panelTheme === 'light'}
      />
    </div>
  );
}
