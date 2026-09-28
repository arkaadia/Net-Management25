import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Server,
  Terminal,
  Monitor,
  Plus,
  Search,
  RefreshCw,
  Tags,
  MoreVertical,
  Edit2,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Activity,
  Layers,
  LayoutGrid,
  List,
  Table as TableIcon,
  Columns3,
  Clock,
  Cpu,
  Zap,
  Sliders,
  Sparkles,
  ChevronDown,
  Globe,
  AlertCircle,
  Key,
  FolderTree,
  RotateCcw,
  Power,
  X,
  Database,
  Flame,
} from 'lucide-react';
import { RemoteServer, RemoteServerTagSummary, ServerCategory } from '../../types';
import {
  fetchRemoteServers,
  fetchRemoteServerTags,
  createRemoteServer,
  updateRemoteServer,
  deleteRemoteServer,
  testRemoteServerConnection,
} from '../../services/api';
import { AddEditServerModal } from './AddEditServerModal';
import { LinuxTerminalModal } from './LinuxTerminalModal';
import { LinuxServerMonitorModal } from './LinuxServerMonitorModal';
import { LinuxFileExplorerModal } from './LinuxFileExplorerModal';
import { NginxManagementModal } from './NginxManagementModal';
import { ApacheManagementModal } from './ApacheManagementModal';
import { PostgreSQLManagementModal } from './PostgreSQLManagementModal';
import { MySQLManagementModal } from './MySQLManagementModal';
import { WindowsRemoteConnectModal } from './WindowsRemoteConnectModal';
import { InBrowserRemoteDesktopModal } from './InBrowserRemoteDesktopModal';
import { OnDemandPasswordModal } from './OnDemandPasswordModal';
import { ManageServerCategoriesModal } from './ManageServerCategoriesModal';
import { BulkServerConfigModal } from './BulkServerConfigModal';
import { RestartServerModal } from './RestartServerModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';

export interface RemoteServersViewProps {
  initialFilter?: 'all' | 'linux' | 'windows' | 'tags';
  isLightMode?: boolean;
  isEn?: boolean;
}

export const formatServerHardwareSpecs = (server: RemoteServer, isEn: boolean = true) => {
  const cpuText = server.cpu_cores
    ? (isEn ? `${server.cpu_cores} vCPU` : `${server.cpu_cores} هسته vCPU`)
    : (isEn ? '— vCPU' : '— پردازنده');

  const ramText = server.ram_gb !== undefined && server.ram_gb !== null && server.ram_gb > 0
    ? (isEn ? `${server.ram_gb} GB RAM` : `${server.ram_gb} گیگابایت رم`)
    : (isEn ? '— RAM' : '— رم');

  const diskText = server.disk_gb !== undefined && server.disk_gb !== null && server.disk_gb > 0
    ? (isEn ? `${server.disk_gb} GB Disk` : `${server.disk_gb} گیگابایت هارد`)
    : (isEn ? '— Disk' : '— هارد');

  return `${cpuText} • ${ramText} • ${diskText}`;
};

interface MenuAnchor {
  id: string;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight?: number;
  server: RemoteServer;
}

export interface ServerColumnDef {
  key: string;
  labelEn: string;
  labelFa: string;
  required?: boolean;
}

export const SERVER_COLUMNS: ServerColumnDef[] = [
  { key: 'select', labelEn: 'Selection Checkbox', labelFa: 'چک‌باکس انتخاب' },
  { key: 'node', labelEn: 'Server Node & Hostname', labelFa: 'نام و هاست‌نیم سرور', required: true },
  { key: 'os', labelEn: 'OS & Distro', labelFa: 'سیستم‌عامل و توزیع' },
  { key: 'ip', labelEn: 'IP Address & Port', labelFa: 'آدرس IP و پورت' },
  { key: 'role', labelEn: 'Role & Environment', labelFa: 'محیط و دسته‌بندی' },
  { key: 'status', labelEn: 'Live Status / Ping', labelFa: 'وضعیت لحظه‌ای و پینگ' },
  { key: 'uptime', labelEn: 'Server Uptime', labelFa: 'مدت کارکرد (Uptime)' },
  { key: 'tags', labelEn: 'Automation Tags', labelFa: 'تگ‌های اتوماسیون' },
  { key: 'actions', labelEn: 'Actions', labelFa: 'عملیات' },
];

export const RemoteServersView: React.FC<RemoteServersViewProps> = ({
  initialFilter = 'all',
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();

  const [servers, setServers] = useState<RemoteServer[]>([]);
  const [tagsSummary, setTagsSummary] = useState<RemoteServerTagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states - DEFAULT viewMode is 'list' per user requirement!
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'linux' | 'windows' | 'tags'>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEnv, setSelectedEnv] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'table' | 'grid'>('list');

  // Column Visibility customization (persisted in localStorage)
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('remote_servers_visible_columns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.uptime === undefined) {
          parsed.uptime = true;
        }
        return parsed;
      }
    } catch {
      // fallback
    }
    return {
      select: true,
      node: true,
      os: true,
      ip: true,
      role: true,
      status: true,
      uptime: true,
      tags: true,
      actions: true,
    };
  });

  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const columnPickerBtnRef = useRef<HTMLButtonElement>(null);
  const columnDropdownRef = useRef<HTMLDivElement>(null);
  const [columnPickerCoords, setColumnPickerCoords] = useState<{ top: number; left: number } | null>(null);

  const updateColumnPickerPosition = useCallback(() => {
    if (!columnPickerBtnRef.current || typeof window === 'undefined') return;
    const rect = columnPickerBtnRef.current.getBoundingClientRect();
    const dropdownWidth = 264; // ~16.5rem
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + 6;
    // If not enough room below (e.g. within 320px of bottom), open above
    if (top + 320 > viewportHeight && rect.top > 320) {
      top = Math.max(10, rect.top - 320);
    }

    let left: number;
    if (isEn) {
      // In LTR: try to align right edge of dropdown with right edge of button
      const desiredLeft = rect.right - dropdownWidth;
      if (desiredLeft >= 10 && desiredLeft + dropdownWidth <= viewportWidth - 10) {
        left = desiredLeft;
      } else if (rect.left + dropdownWidth <= viewportWidth - 10) {
        left = Math.max(10, rect.left);
      } else {
        left = Math.max(10, viewportWidth - dropdownWidth - 10);
      }
    } else {
      // In RTL: try to align left edge of dropdown with left edge of button
      const desiredLeft = rect.left;
      if (desiredLeft + dropdownWidth <= viewportWidth - 10 && desiredLeft >= 10) {
        left = desiredLeft;
      } else if (rect.right - dropdownWidth >= 10) {
        left = rect.right - dropdownWidth;
      } else {
        left = Math.max(10, Math.min(rect.left, viewportWidth - dropdownWidth - 10));
      }
    }

    setColumnPickerCoords({ top, left });
  }, [isEn]);

  const handleToggleColumnPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isColumnPickerOpen) {
      updateColumnPickerPosition();
      setIsColumnPickerOpen(true);
    } else {
      setIsColumnPickerOpen(false);
    }
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('remote_servers_visible_columns', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetColumns = () => {
    const defaults = {
      select: true,
      node: true,
      os: true,
      ip: true,
      role: true,
      status: true,
      uptime: true,
      tags: true,
      actions: true,
    };
    setVisibleColumns(defaults);
    try {
      localStorage.setItem('remote_servers_visible_columns', JSON.stringify(defaults));
    } catch {}
  };

  useEffect(() => {
    if (!isColumnPickerOpen) return;

    const handleScrollOrResize = () => {
      updateColumnPickerPosition();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        columnPickerBtnRef.current &&
        columnPickerBtnRef.current.contains(target)
      ) {
        return;
      }
      if (
        columnDropdownRef.current &&
        columnDropdownRef.current.contains(target)
      ) {
        return;
      }
      setIsColumnPickerOpen(false);
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColumnPickerOpen, updateColumnPickerPosition]);

  // Multi-server Selection state
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(new Set());

  // 3-Dot Action Menu Anchor (Floating Portal)
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  // Modal states
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<RemoteServer | null>(null);

  // Category Management Modal State
  const [categories, setCategories] = useState<ServerCategory[]>([]);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);

  // Terminal & Remote Connect Modals
  const [terminalServer, setTerminalServer] = useState<RemoteServer | null>(null);
  const [terminalShell, setTerminalShell] = useState<'bash' | 'zsh'>('bash');
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);

  // Linux Resource & Telemetry Monitoring Modal
  const [monitorServer, setMonitorServer] = useState<RemoteServer | null>(null);
  const [isMonitorModalOpen, setIsMonitorModalOpen] = useState(false);

  // Linux SFTP File Explorer Modal
  const [fileExplorerServer, setFileExplorerServer] = useState<RemoteServer | null>(null);
  const [isFileExplorerModalOpen, setIsFileExplorerModalOpen] = useState(false);

  // Linux Nginx Web Server Management Modal
  const [nginxModalServer, setNginxModalServer] = useState<RemoteServer | null>(null);
  const [isNginxModalOpen, setIsNginxModalOpen] = useState(false);

  // Linux Apache Web Server Management Modal (Phase 1 Entry Point)
  const [apacheModalServer, setApacheModalServer] = useState<RemoteServer | null>(null);
  const [isApacheModalOpen, setIsApacheModalOpen] = useState(false);

  // Linux PostgreSQL Database Management Modal (Phase 1 Entry Point)
  const [postgresModalServer, setPostgresModalServer] = useState<RemoteServer | null>(null);
  const [isPostgresModalOpen, setIsPostgresModalOpen] = useState(false);

  // Linux MySQL / MariaDB Database Management Modal
  const [mysqlModalServer, setMysqlModalServer] = useState<RemoteServer | null>(null);
  const [isMysqlModalOpen, setIsMysqlModalOpen] = useState(false);

  // Add Server / Service Submenu Dropdown State (Portal-rendered with fixed coords & z-[9999] to prevent falling underneath tables)
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [addServiceMode, setAddServiceMode] = useState<
    'standard' | 'linux' | 'windows' | 'nginx' | 'apache' | 'postgresql' | 'mysql'
  >('standard');
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const addDropdownRef = useRef<HTMLDivElement | null>(null);
  const [addMenuCoords, setAddMenuCoords] = useState<{ top: number; left: number } | null>(null);

  const updateAddMenuPosition = useCallback(() => {
    if (!addBtnRef.current || typeof window === 'undefined') return;
    const rect = addBtnRef.current.getBoundingClientRect();
    const dropdownWidth = 320; // 20rem (w-80)
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + 8;
    const estimatedHeight = 390;
    // If not enough room below (within 390px of viewport bottom) and more room above, flip above
    if (top + estimatedHeight > viewportHeight && rect.top > estimatedHeight) {
      top = Math.max(10, rect.top - estimatedHeight - 6);
    }

    let left: number;
    if (isEn) {
      // In LTR: try to align right edge of dropdown with right edge of button
      const desiredLeft = rect.right - dropdownWidth;
      if (desiredLeft >= 10 && desiredLeft + dropdownWidth <= viewportWidth - 10) {
        left = desiredLeft;
      } else if (rect.left + dropdownWidth <= viewportWidth - 10) {
        left = Math.max(10, rect.left);
      } else {
        left = Math.max(10, viewportWidth - dropdownWidth - 10);
      }
    } else {
      // In RTL: try to align left edge of dropdown with left edge of button
      const desiredLeft = rect.left;
      if (desiredLeft + dropdownWidth <= viewportWidth - 10 && desiredLeft >= 10) {
        left = desiredLeft;
      } else if (rect.right - dropdownWidth >= 10) {
        left = rect.right - dropdownWidth;
      } else {
        left = Math.max(10, Math.min(rect.left, viewportWidth - dropdownWidth - 10));
      }
    }

    setAddMenuCoords({ top, left });
  }, [isEn]);

  const handleToggleAddMenu = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAddMenuOpen) {
      updateAddMenuPosition();
      setIsAddMenuOpen(true);
    } else {
      setIsAddMenuOpen(false);
    }
  };

  const [windowsModalServer, setWindowsModalServer] = useState<RemoteServer | null>(null);
  const [isWindowsModalOpen, setIsWindowsModalOpen] = useState(false);

  const [inBrowserRemoteServer, setInBrowserRemoteServer] = useState<RemoteServer | null>(null);
  const [inBrowserProtocol, setInBrowserProtocol] = useState<'rdp' | 'vnc'>('rdp');
  const [isInBrowserModalOpen, setIsInBrowserModalOpen] = useState(false);

  // On-Demand Password Prompt State (Zero-Storage Ephemeral Auth)
  const [isOnDemandModalOpen, setIsOnDemandModalOpen] = useState(false);
  const [onDemandServer, setOnDemandServer] = useState<RemoteServer | null>(null);
  const [onDemandTarget, setOnDemandTarget] = useState<'rdp' | 'vnc' | 'terminal'>('rdp');
  const [onDemandShell, setOnDemandShell] = useState<'bash' | 'zsh'>('bash');
  const [ephemeralRdpPassword, setEphemeralRdpPassword] = useState<string | undefined>(undefined);
  const [ephemeralTerminalPassword, setEphemeralTerminalPassword] = useState<string | undefined>(undefined);

  // Quick Ping / Test status cache
  const [reachabilityCache, setReachabilityCache] = useState<
    Record<string, { reachable: boolean; latency: number; testing: boolean }>
  >({});
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [isPingingAll, setIsPingingAll] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<RemoteServer | null>(null);
  const [powerModalConfig, setPowerModalConfig] = useState<{
    server?: RemoteServer;
    servers?: RemoteServer[];
    action: 'restart' | 'poweroff';
  } | null>(null);
  const [successNotification, setSuccessNotification] = useState<string | null>(null);

  useEffect(() => {
    if (!successNotification) return;
    const timer = setTimeout(() => setSuccessNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [successNotification]);

  // Bulk Linux Server Configuration Modal State
  const [isBulkConfigOpen, setIsBulkConfigOpen] = useState(false);

  // Ref to the floating 3-dots action menu dropdown container
  const menuDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close Add Server / Service dropdown on click outside or reposition on scroll/resize
  useEffect(() => {
    if (!isAddMenuOpen) return;

    const handleScrollOrResize = () => {
      updateAddMenuPosition();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (addBtnRef.current && addBtnRef.current.contains(target)) {
        return;
      }
      if (addDropdownRef.current && addDropdownRef.current.contains(target)) {
        return;
      }
      setIsAddMenuOpen(false);
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAddMenuOpen, updateAddMenuPosition]);

  // Close floating action menu on outside scroll or window resize
  useEffect(() => {
    if (!menuAnchor) return;
    const handleClose = (e: Event) => {
      const target = e.target as Node | null;
      // If the scroll event occurred inside the action dropdown menu itself, ignore and do not close
      if (
        menuDropdownRef.current &&
        target &&
        (menuDropdownRef.current === target || menuDropdownRef.current.contains(target))
      ) {
        return;
      }
      setMenuAnchor(null);
    };
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [menuAnchor]);

  // Sync initial filter prop
  useEffect(() => {
    setActiveTabFilter(initialFilter);
  }, [initialFilter]);

  // Helper to sync updated server hardware metrics into state
  const syncServerKeepaliveMetrics = (serverId: string, res: any) => {
    if (!res) return;
    setServers((prev) =>
      prev.map((srv) => {
        if (srv.id !== serverId) return srv;
        const hw = res.hardware || {};
        return {
          ...srv,
          status: res.reachable ? 'online' : (res.reachable === false ? 'offline' : srv.status),
          ...(res.server || {}),
          cpu_cores: hw.cpu_cores ?? res.server?.cpu_cores ?? srv.cpu_cores,
          ram_gb: hw.ram_gb ?? res.server?.ram_gb ?? srv.ram_gb,
          disk_gb: hw.disk_gb ?? res.server?.disk_gb ?? srv.disk_gb,
          uptime_str: hw.uptime_str ?? res.server?.uptime_str ?? srv.uptime_str,
        };
      })
    );
  };

  // Trigger genuine live fleet ping
  const triggerLiveFleetPing = (fleetServers: RemoteServer[]) => {
    const allIds = fleetServers.map((s) => s.id);
    setReachabilityCache((prev) => {
      const next = { ...prev };
      allIds.forEach((id) => {
        next[id] = { reachable: false, latency: 0, testing: true };
      });
      return next;
    });

    Promise.allSettled(
      fleetServers.map(async (s) => {
        try {
          const res = await testRemoteServerConnection(s.id);
          setReachabilityCache((prev) => ({
            ...prev,
            [s.id]: {
              reachable: Boolean(res.reachable),
              latency: res.reachable ? (res.latency_ms || 0) : 0,
              testing: false,
            },
          }));
          syncServerKeepaliveMetrics(s.id, res);
        } catch {
          setReachabilityCache((prev) => ({
            ...prev,
            [s.id]: {
              reachable: false,
              latency: 0,
              testing: false,
            },
          }));
        }
      })
    );
  };

  // Load server fleet
  const loadFleet = async (autoPing = true) => {
    setLoading(true);
    setError(null);
    try {
      const [srvRes, tagRes] = await Promise.all([
        fetchRemoteServers(),
        fetchRemoteServerTags(),
      ]);
      const loaded = srvRes.servers || [];
      setServers(loaded);
      setTagsSummary(tagRes.tags || []);

      // Auto-trigger live authentic keepalive ping check on initial load
      if (autoPing && loaded.length > 0) {
        triggerLiveFleetPing(loaded);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load remote servers fleet');
    } finally {
      setLoading(false);
    }
  };

  // Load server categories
  const loadCategories = async () => {
    try {
      const res = await fetch('/api/server-categories');
      const data = await res.json();
      if (data.success && Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.warn('Failed to load server categories:', err);
    }
  };

  const handleCategoriesChanged = () => {
    loadCategories();
    loadFleet(true);
  };

  useEffect(() => {
    loadFleet(true);
    loadCategories();
  }, []);

  // Filtered servers calculation
  const filteredServers = useMemo(() => {
    return servers.filter((server) => {
      // OS / Tab Filter
      if (activeTabFilter === 'linux' && server.os_type !== 'linux') return false;
      if (activeTabFilter === 'windows' && server.os_type !== 'windows') return false;

      // Environment Filter
      if (selectedEnv !== 'all' && server.environment.toLowerCase() !== selectedEnv.toLowerCase()) {
        return false;
      }

      // Category Filter
      if (selectedCategory !== 'all' && server.category.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }

      // Tag Filter
      if (selectedTag && (!Array.isArray(server.tags) || !server.tags.includes(selectedTag))) {
        return false;
      }

      // Text Query Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = server.name.toLowerCase().includes(q);
        const matchesHost = server.hostname?.toLowerCase().includes(q);
        const matchesIp = server.ip.includes(q);
        const matchesDistro = server.os_distro?.toLowerCase().includes(q);
        const matchesRole = server.role?.toLowerCase().includes(q);
        const matchesTags = Array.isArray(server.tags) && server.tags.some((t) => t.toLowerCase().includes(q));

        if (!matchesName && !matchesHost && !matchesIp && !matchesDistro && !matchesRole && !matchesTags) {
          return false;
        }
      }

      return true;
    });
  }, [servers, activeTabFilter, selectedEnv, selectedCategory, selectedTag, searchQuery]);

  // Quick statistics
  const stats = useMemo(() => {
    const total = servers.length;
    const linuxCount = servers.filter((s) => s.os_type === 'linux').length;
    const winCount = servers.filter((s) => s.os_type === 'windows').length;
    const prodCount = servers.filter((s) => s.environment === 'Production').length;

    let reachableCount = 0;
    let unreachableCount = 0;
    let untestedCount = 0;
    servers.forEach((s) => {
      const cached = reachabilityCache[s.id];
      if (cached) {
        if (cached.testing) {
          untestedCount++;
        } else if (cached.reachable) {
          reachableCount++;
        } else {
          unreachableCount++;
        }
      } else {
        if (s.status === 'online') reachableCount++;
        else if (s.status === 'offline' || s.status === 'unreachable') unreachableCount++;
        else untestedCount++;
      }
    });

    return { total, linuxCount, winCount, prodCount, reachableCount, unreachableCount, untestedCount };
  }, [servers, reachabilityCache]);

  // Handle open Add Modal with optional service mode
  const handleOpenAdd = (
    serviceMode: 'standard' | 'linux' | 'windows' | 'nginx' | 'apache' | 'postgresql' | 'mysql' = 'standard'
  ) => {
    setServerToEdit(null);
    setAddServiceMode(serviceMode);
    setIsAddEditModalOpen(true);
    setIsAddMenuOpen(false);
    undockModal('add_edit_remote_server');
  };

  // Handle open Edit Modal
  const handleOpenEdit = (server: RemoteServer) => {
    setServerToEdit(server);
    setIsAddEditModalOpen(true);
    setMenuAnchor(null);
    undockModal('add_edit_remote_server');
  };

  // Handle Save Server (create or update)
  const handleSaveServer = async (serverData: Partial<RemoteServer>) => {
    if (serverToEdit) {
      await updateRemoteServer(serverToEdit.id, { ...serverData, id: serverToEdit.id });
    } else {
      await createRemoteServer(serverData);
    }
    await loadFleet();
    setIsAddEditModalOpen(false);
    undockModal('add_edit_remote_server');
  };

  // Handle Delete Server with safety confirmation
  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;
    try {
      await deleteRemoteServer(serverToDelete.id);
      await loadFleet();
      setSelectedServerIds((prev) => {
        const next = new Set(prev);
        next.delete(serverToDelete.id);
        return next;
      });
      setServerToDelete(null);
    } catch (err: any) {
      alert(err.message || (isEn ? 'Failed to delete server.' : 'خطا در حذف سرور.'));
    }
  };

  // Handle Open Linux Terminal
  const handleOpenLinuxTerminal = (server: RemoteServer, shell: 'bash' | 'zsh' = 'bash') => {
    setMenuAnchor(null);
    if (server.prompt_password_on_connect) {
      setOnDemandServer(server);
      setOnDemandTarget('terminal');
      setOnDemandShell(shell);
      setIsOnDemandModalOpen(true);
      return;
    }
    setEphemeralTerminalPassword(undefined);
    setTerminalServer(server);
    setTerminalShell(shell);
    setIsTerminalModalOpen(true);
    undockModal(`linux_term_${server.id}`);
  };

  // Handle Open Linux Live Telemetry & Resource Monitor
  const handleOpenLinuxMonitor = (server: RemoteServer) => {
    setMenuAnchor(null);
    setMonitorServer(server);
    setIsMonitorModalOpen(true);
    undockModal(`linux_mon_${server.id}`);
  };

  // Handle Open Linux File Explorer
  const handleOpenLinuxFileExplorer = (server: RemoteServer) => {
    setMenuAnchor(null);
    setFileExplorerServer(server);
    setIsFileExplorerModalOpen(true);
    undockModal(`linux_fs_${server.id}`);
  };

  // Handle Open Nginx Management
  const handleOpenNginxManagement = (server: RemoteServer) => {
    setMenuAnchor(null);
    setNginxModalServer(server);
    setIsNginxModalOpen(true);
    undockModal(`nginx_mgmt_${server.id}`);
  };

  // Handle Open Apache Management (Phase 1 Entry Point)
  const handleOpenApacheManagement = (server: RemoteServer) => {
    setMenuAnchor(null);
    setApacheModalServer(server);
    setIsApacheModalOpen(true);
    undockModal(`apache_mgmt_${server.id}`);
  };

  // Handle Open PostgreSQL Management (Phase 1 Entry Point)
  const handleOpenPostgresManagement = (server: RemoteServer) => {
    setMenuAnchor(null);
    setPostgresModalServer(server);
    setIsPostgresModalOpen(true);
    undockModal(`postgres_mgmt_${server.id}`);
  };

  // Handle Open MySQL / MariaDB Management
  const handleOpenMysqlManagement = (server: RemoteServer) => {
    setMenuAnchor(null);
    setMysqlModalServer(server);
    setIsMysqlModalOpen(true);
    undockModal(`mysql_mgmt_${server.id}`);
  };

  // Handle Primary Server Action (smart routing based on server_type and installed services)
  const handleOpenPrimaryServerAction = (server: RemoteServer) => {
    if (server.server_type === 'apache' || (server.has_apache && !server.has_nginx && !server.has_postgresql && !server.has_mysql)) {
      handleOpenApacheManagement(server);
    } else if (server.server_type === 'nginx' || (server.has_nginx && !server.has_apache && !server.has_postgresql && !server.has_mysql)) {
      handleOpenNginxManagement(server);
    } else if (server.server_type === 'postgresql' || (server.has_postgresql && !server.has_nginx && !server.has_apache && !server.has_mysql)) {
      handleOpenPostgresManagement(server);
    } else if (server.server_type === 'mysql' || (server.has_mysql && !server.has_nginx && !server.has_apache && !server.has_postgresql)) {
      handleOpenMysqlManagement(server);
    } else if (server.os_type === 'linux') {
      handleOpenLinuxMonitor(server);
    } else {
      handleOpenWindowsRemote(server);
    }
  };

  // Handle Open Windows Remote
  const handleOpenWindowsRemote = (server: RemoteServer) => {
    setWindowsModalServer(server);
    setIsWindowsModalOpen(true);
    setMenuAnchor(null);
    undockModal(`win_remote_${server.id}`);
  };

  // Handle Open In-Browser Remote Desktop (RDP / VNC via Guacamole Gateway)
  const handleOpenInBrowserRemote = (server: RemoteServer, protocol: 'rdp' | 'vnc' = 'rdp') => {
    setMenuAnchor(null);
    if (server.prompt_password_on_connect) {
      setOnDemandServer(server);
      setOnDemandTarget(protocol);
      setIsOnDemandModalOpen(true);
      return;
    }
    setEphemeralRdpPassword(undefined);
    setInBrowserRemoteServer(server);
    setInBrowserProtocol(protocol);
    setIsInBrowserModalOpen(true);
    undockModal(`inbrowser_remote_${server.id}`);
  };

  // Handle Confirm On-Demand Password Entry
  const handleConfirmOnDemandConnect = (sessionPassword: string) => {
    setIsOnDemandModalOpen(false);
    if (!onDemandServer) return;

    if (onDemandTarget === 'terminal') {
      setEphemeralTerminalPassword(sessionPassword);
      setTerminalServer(onDemandServer);
      setTerminalShell(onDemandShell);
      setIsTerminalModalOpen(true);
      undockModal(`linux_term_${onDemandServer.id}`);
    } else {
      setEphemeralRdpPassword(sessionPassword);
      setInBrowserRemoteServer(onDemandServer);
      setInBrowserProtocol(onDemandTarget);
      setIsInBrowserModalOpen(true);
      undockModal(`inbrowser_remote_${onDemandServer.id}`);
    }
  };

  // Handle Copy IP
  const handleCopyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    setCopiedIp(ip);
    setTimeout(() => setCopiedIp(null), 1500);
    setMenuAnchor(null);
  };

  // Handle Test Ping on a single server
  const handleTestPing = async (serverId: string) => {
    setMenuAnchor(null);
    setReachabilityCache((prev) => ({
      ...prev,
      [serverId]: { reachable: false, latency: 0, testing: true },
    }));

    try {
      const res = await testRemoteServerConnection(serverId);
      setReachabilityCache((prev) => ({
        ...prev,
        [serverId]: {
          reachable: Boolean(res.reachable),
          latency: res.reachable ? (res.latency_ms || 0) : 0,
          testing: false,
        },
      }));
      syncServerKeepaliveMetrics(serverId, res);
    } catch {
      setReachabilityCache((prev) => ({
        ...prev,
        [serverId]: {
          reachable: false,
          latency: 0,
          testing: false,
        },
      }));
    }
  };

  // Handle Bulk Ping on all selected servers
  const handleBulkPing = async () => {
    if (selectedServerIds.size === 0) return;
    const targetIds = Array.from(selectedServerIds);

    setReachabilityCache((prev) => {
      const next = { ...prev };
      targetIds.forEach((id) => {
        next[id] = { reachable: false, latency: 0, testing: true };
      });
      return next;
    });

    await Promise.allSettled(
      targetIds.map(async (id) => {
        try {
          const res = await testRemoteServerConnection(id);
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: {
              reachable: Boolean(res.reachable),
              latency: res.reachable ? (res.latency_ms || 0) : 0,
              testing: false,
            },
          }));
          syncServerKeepaliveMetrics(id, res);
        } catch {
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: { reachable: false, latency: 0, testing: false },
          }));
        }
      })
    );
  };

  // Handle Ping All Fleet
  const handlePingAllFleet = async () => {
    if (servers.length === 0 || isPingingAll) return;
    setIsPingingAll(true);

    const allIds = servers.map((s) => s.id);
    setReachabilityCache((prev) => {
      const next = { ...prev };
      allIds.forEach((id) => {
        next[id] = { reachable: false, latency: 0, testing: true };
      });
      return next;
    });

    await Promise.allSettled(
      allIds.map(async (id) => {
        try {
          const res = await testRemoteServerConnection(id);
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: {
              reachable: Boolean(res.reachable),
              latency: res.reachable ? (res.latency_ms || 0) : 0,
              testing: false,
            },
          }));
          syncServerKeepaliveMetrics(id, res);
        } catch {
          setReachabilityCache((prev) => ({
            ...prev,
            [id]: { reachable: false, latency: 0, testing: false },
          }));
        }
      })
    );
    setIsPingingAll(false);
  };

  // Toggle Action Menu Dropdown with Precise 4-Way Boundary Clamping
  const handleToggleActionMenu = (e: React.MouseEvent<HTMLButtonElement>, server: RemoteServer) => {
    e.stopPropagation();
    if (menuAnchor?.id === server.id) {
      setMenuAnchor(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 256; // 16rem
    const estimatedMenuHeight = server.os_type === 'linux' ? 425 : 385;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    const spaceBelow = viewportHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;

    let top: number;
    let maxHeight: number;

    // Determine vertical placement: open downwards if ample room or if space below is larger
    if (spaceBelow >= Math.min(estimatedMenuHeight, 300) || spaceBelow >= spaceAbove) {
      top = rect.bottom + 6;
      maxHeight = Math.max(160, viewportHeight - top - margin);
    } else {
      // Open upwards
      const allowedHeight = Math.max(160, Math.min(estimatedMenuHeight, spaceAbove - 6));
      top = Math.max(margin, rect.top - 6 - allowedHeight);
      maxHeight = allowedHeight;
    }

    // Determine horizontal placement with boundary clamping
    let desiredLeft: number;
    if (isEn) {
      // In LTR: align right edge of menu with right edge of button
      desiredLeft = rect.right - menuWidth;
      if (desiredLeft < margin && rect.left + menuWidth <= viewportWidth - margin) {
        desiredLeft = rect.left;
      }
    } else {
      // In RTL: align left edge of menu with left edge of button
      desiredLeft = rect.left;
      if (desiredLeft + menuWidth > viewportWidth - margin && rect.right - menuWidth >= margin) {
        desiredLeft = rect.right - menuWidth;
      }
    }

    const left = Math.max(margin, Math.min(desiredLeft, viewportWidth - menuWidth - margin));

    setMenuAnchor({
      id: server.id,
      top,
      left,
      maxHeight,
      server,
    });
  };

  // Minimization Handlers with ModalDockContext
  const handleMinimizeLinuxTerminal = () => {
    setIsTerminalModalOpen(false);
    if (terminalServer) {
      dockModal({
        id: `linux_term_${terminalServer.id}`,
        labelEn: `${terminalServer.name} Terminal`,
        labelFa: `ترمینال ${terminalServer.name}`,
        badge: terminalShell.toUpperCase(),
        category: 'terminal',
        onRestore: () => setIsTerminalModalOpen(true),
        onClose: () => {
          setIsTerminalModalOpen(false);
          undockModal(`linux_term_${terminalServer.id}`);
        },
      });
    }
  };

  const handleMinimizeMonitor = () => {
    setIsMonitorModalOpen(false);
    if (monitorServer) {
      dockModal({
        id: `linux_mon_${monitorServer.id}`,
        labelEn: `${monitorServer.name} - Server Management`,
        labelFa: `مدیریت سرور ${monitorServer.name}`,
        badge: 'LIVE',
        category: 'tools',
        onRestore: () => setIsMonitorModalOpen(true),
        onClose: () => {
          setIsMonitorModalOpen(false);
          undockModal(`linux_mon_${monitorServer.id}`);
        },
      });
    }
  };

  const handleMinimizeFileExplorer = () => {
    setIsFileExplorerModalOpen(false);
    if (fileExplorerServer) {
      dockModal({
        id: `linux_fs_${fileExplorerServer.id}`,
        labelEn: `${fileExplorerServer.name} - File Explorer`,
        labelFa: `کاوشگر فایل ${fileExplorerServer.name}`,
        badge: 'SFTP',
        category: 'tools',
        onRestore: () => setIsFileExplorerModalOpen(true),
        onClose: () => {
          setIsFileExplorerModalOpen(false);
          undockModal(`linux_fs_${fileExplorerServer.id}`);
        },
      });
    }
  };

  const handleMinimizeNginxManagement = () => {
    setIsNginxModalOpen(false);
    if (nginxModalServer) {
      dockModal({
        id: `nginx_mgmt_${nginxModalServer.id}`,
        labelEn: `${nginxModalServer.name} - Nginx Management`,
        labelFa: `مدیریت Nginx ${nginxModalServer.name}`,
        badge: 'NGINX',
        category: 'tools',
        onRestore: () => setIsNginxModalOpen(true),
        onClose: () => {
          setIsNginxModalOpen(false);
          undockModal(`nginx_mgmt_${nginxModalServer.id}`);
        },
      });
    }
  };

  const handleMinimizeApacheManagement = () => {
    setIsApacheModalOpen(false);
    if (apacheModalServer) {
      dockModal({
        id: `apache_mgmt_${apacheModalServer.id}`,
        labelEn: `${apacheModalServer.name} - Apache Management`,
        labelFa: `مدیریت Apache ${apacheModalServer.name}`,
        badge: 'HTTPD',
        category: 'tools',
        onRestore: () => setIsApacheModalOpen(true),
        onClose: () => {
          setIsApacheModalOpen(false);
          undockModal(`apache_mgmt_${apacheModalServer.id}`);
        },
      });
    }
  };

  const handleMinimizePostgresManagement = () => {
    setIsPostgresModalOpen(false);
    if (postgresModalServer) {
      dockModal({
        id: `postgres_mgmt_${postgresModalServer.id}`,
        labelEn: `${postgresModalServer.name} - PostgreSQL Management`,
        labelFa: `مدیریت PostgreSQL ${postgresModalServer.name}`,
        badge: 'PGSQL',
        category: 'tools',
        onRestore: () => setIsPostgresModalOpen(true),
        onClose: () => {
          setIsPostgresModalOpen(false);
          undockModal(`postgres_mgmt_${postgresModalServer.id}`);
        },
      });
    }
  };

  const handleMinimizeMysqlManagement = () => {
    setIsMysqlModalOpen(false);
    if (mysqlModalServer) {
      dockModal({
        id: `mysql_mgmt_${mysqlModalServer.id}`,
        labelEn: `${mysqlModalServer.name} - MySQL Management`,
        labelFa: `مدیریت MySQL ${mysqlModalServer.name}`,
        badge: 'MYSQL',
        category: 'tools',
        onRestore: () => setIsMysqlModalOpen(true),
        onClose: () => {
          setIsMysqlModalOpen(false);
          undockModal(`mysql_mgmt_${mysqlModalServer.id}`);
        },
      });
    }
  };

  const handleMinimizeWindowsRemote = () => {
    setIsWindowsModalOpen(false);
    if (windowsModalServer) {
      dockModal({
        id: `win_remote_${windowsModalServer.id}`,
        labelEn: `${windowsModalServer.name} Remote`,
        labelFa: `ریموت ${windowsModalServer.name}`,
        badge: 'RDP',
        category: 'device',
        onRestore: () => setIsWindowsModalOpen(true),
        onClose: () => {
          setIsWindowsModalOpen(false);
          undockModal(`win_remote_${windowsModalServer.id}`);
        },
      });
    }
  };

  const handleMinimizeInBrowserRemote = () => {
    setIsInBrowserModalOpen(false);
    if (inBrowserRemoteServer) {
      dockModal({
        id: `inbrowser_remote_${inBrowserRemoteServer.id}`,
        labelEn: `${inBrowserRemoteServer.name} ${inBrowserProtocol.toUpperCase()}`,
        labelFa: `ریموت ${inBrowserRemoteServer.name} (${inBrowserProtocol.toUpperCase()})`,
        badge: inBrowserProtocol.toUpperCase(),
        category: 'device',
        onRestore: () => setIsInBrowserModalOpen(true),
        onClose: () => {
          setIsInBrowserModalOpen(false);
          undockModal(`inbrowser_remote_${inBrowserRemoteServer.id}`);
        },
      });
    }
  };

  const handleMinimizeAddEdit = () => {
    setIsAddEditModalOpen(false);
    dockModal({
      id: 'add_edit_remote_server',
      labelEn: serverToEdit ? `Edit ${serverToEdit.name}` : 'Add Server',
      labelFa: serverToEdit ? `ویرایش ${serverToEdit.name}` : 'افزودن سرور',
      category: 'config',
      onRestore: () => setIsAddEditModalOpen(true),
      onClose: () => {
        setIsAddEditModalOpen(false);
        undockModal('add_edit_remote_server');
      },
    });
  };

  const handleMinimizeCategories = () => {
    setIsCategoriesModalOpen(false);
    dockModal({
      id: 'manage_server_categories',
      labelEn: isEn ? 'Categories' : 'دسته‌بندی‌ها',
      labelFa: 'دسته‌بندی‌های سرور',
      badge: 'CATEGORIES',
      category: 'config',
      onRestore: () => setIsCategoriesModalOpen(true),
      onClose: () => {
        setIsCategoriesModalOpen(false);
        undockModal('manage_server_categories');
      },
    });
  };

  const handleMinimizeOnDemand = () => {
    setIsOnDemandModalOpen(false);
    if (onDemandServer) {
      dockModal({
        id: `ondemand_auth_${onDemandServer.id}`,
        labelEn: `${onDemandServer.name} Auth`,
        labelFa: `احراز ${onDemandServer.name}`,
        badge: 'AUTH',
        category: 'system',
        onRestore: () => setIsOnDemandModalOpen(true),
        onClose: () => {
          setIsOnDemandModalOpen(false);
          setOnDemandServer(null);
          undockModal(`ondemand_auth_${onDemandServer.id}`);
        },
      });
    }
  };

  const handleMinimizeBulkConfig = () => {
    setIsBulkConfigOpen(false);
    dockModal({
      id: 'bulk_server_config_modal',
      labelEn: isEn ? 'Bulk Linux Config' : 'پیکربندی گروهی لینوکس',
      labelFa: 'پیکربندی گروهی سرورهای لینوکس',
      badge: 'BULK',
      category: 'tools',
      onRestore: () => setIsBulkConfigOpen(true),
      onClose: () => {
        setIsBulkConfigOpen(false);
        undockModal('bulk_server_config_modal');
      },
    });
  };

  return (
    <div
      className={`p-4 sm:p-6 space-y-4 max-w-7xl mx-auto transition-colors duration-200 ${
        isEn ? 'text-left' : 'text-right'
      } ${isLightMode ? 'text-slate-800' : 'text-slate-100'}`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* 1. Sticky Top Bar (Matching DeviceListView spatial-glass styling) */}
      <div className="sticky top-0 z-30 -mt-2 pt-2 pb-2 bg-transparent -mx-4 sm:-mx-6 px-4 sm:px-6 transition-all">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl border shadow-xl backdrop-blur-xl ${
            isLightMode
              ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-200/50'
              : 'spatial-glass border-white/10 text-white'
          }`}
        >
          <div>
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl border ${
                  isLightMode
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-700'
                    : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                }`}
              >
                <Server className="w-5 h-5" />
              </div>
              <h2 className="text-base sm:text-lg font-bold glow-text-cyan tracking-tight">
                {isEn ? 'Remote Servers & Automation Fleet' : 'مدیریت سرورهای ریموت و ناوگان اتوماسیون'}
              </h2>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-lg border font-bold ${
                  isLightMode
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                }`}
              >
                {servers.length} {isEn ? 'Nodes' : 'سرور'}
              </span>

              <FieldInfoTooltip
                title={isEn ? 'Remote Compute Fleet' : 'ناوگان سرورهای ریموت'}
                whatIsIt={
                  isEn
                    ? 'Unified enterprise inventory of Linux and Windows remote compute nodes with terminal and RDP access.'
                    : 'مدیریت متمرکز سرورهای لینوکسی و ویندوزی همراه با دسترسی مستقیم شل و ریموت دسکتاپ.'
                }
                whyNeeded={
                  isEn
                    ? 'Enables automated configuration management, instant SSH access, and centralized host inventory.'
                    : 'امکان مدیریت دسته‌جمعی، اجرای دستورات و اسنیپت‌ها و دسترسی مستقیم بدون نیاز به کلاینت مجزا.'
                }
                example={
                  isEn
                    ? 'Ubuntu 24.04 Web Gateway, Debian DB Cluster, Windows AD Server.'
                    : 'گیت‌وی وب اوبونتو، کلاستر دیتابیس دبیان، سرور دامین ویندوز.'
                }
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>
            <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn
                ? 'Centralized remote compute nodes, interactive SSH/Zsh shells, in-browser Guacamole RDP/VNC sessions, and automation fleet management.'
                : 'مدیریت متمرکز سرورهای لینوکسی و ویندوزی، دسترسی تعاملی SSH، ریموت دسکتاپ RDP/VNC در مرورگر و اتوماسیون ناوگان.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Bulk Action Button (When servers selected) */}
            {selectedServerIds.size > 0 && (
              <button
                type="button"
                onClick={handleBulkPing}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.35)] transition active:scale-95 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {isEn
                    ? `Ping Selected (${selectedServerIds.size})`
                    : `تست پینگ انتخاب‌شده‌ها (${selectedServerIds.size})`}
                </span>
              </button>
            )}

            {/* Ping / Refresh All Button */}
            <button
              type="button"
              onClick={handlePingAllFleet}
              disabled={isPingingAll || loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10 shadow-xs'
              }`}
              title={isEn ? 'Ping and check latency across all fleet nodes' : 'تست پینگ و وضعیت تاخیر تمام ناوگان'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPingingAll || loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isEn ? 'Ping All Fleet' : 'تست پینگ همه'}</span>
            </button>

            {/* Bulk Server Config Button */}
            <button
              id="btn-bulk-server-config"
              type="button"
              onClick={() => setIsBulkConfigOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-xs'
              }`}
              title={isEn ? 'Bulk configure remote Linux servers' : 'پیکربندی گروهی سرورهای لینوکس'}
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isEn ? 'Bulk Server Config' : 'پیکربندی گروهی'}</span>
            </button>

            {/* Add Server & Standalone Services Dropdown Button */}
            <div className="relative">
              <button
                ref={addBtnRef}
                id="btn-add-server"
                type="button"
                onClick={handleToggleAddMenu}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-medium shadow-[0_0_15px_rgba(99,102,241,0.35)] transition border border-white/10 active:scale-95 cursor-pointer"
                title={isEn ? 'Add remote server or standalone service' : 'ثبت سرور جدید یا سرویس مستقل'}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isEn ? 'Add Remote Server' : 'ثبت سرور و سرویس'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isAddMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Submenu Dropdown (Portal-rendered with z-[9999] so it never falls under tables or filters) */}
              {isAddMenuOpen &&
                addMenuCoords &&
                createPortal(
                  <>
                    {/* Transparent Click-catcher Backdrop */}
                    <div
                      className="fixed inset-0 z-[9998] bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAddMenuOpen(false);
                      }}
                    />

                    <div
                      ref={addDropdownRef}
                      style={{
                        position: 'fixed',
                        top: `${addMenuCoords.top}px`,
                        left: `${addMenuCoords.left}px`,
                        width: '20rem',
                      }}
                      className={`z-[9999] rounded-2xl border shadow-2xl p-1.5 font-sans transition-all animate-in fade-in zoom-in-95 ${
                        isEn ? 'text-left' : 'text-right'
                      } ${
                        isLightMode
                          ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-900/20'
                          : 'bg-slate-950/95 border-white/15 backdrop-blur-2xl text-slate-100 shadow-black/80'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b ${
                          isLightMode ? 'text-slate-500 border-slate-200' : 'text-slate-400 border-white/10'
                        }`}
                      >
                        {isEn ? 'Select Server / Service Type' : 'نوع سرور یا سرویس مورد نظر را انتخاب کنید'}
                      </div>

                      <div className="py-1 space-y-1">
                        {/* Option 1: Standard Full Compute Node */}
                        <button
                          type="button"
                          onClick={() => handleOpenAdd('standard')}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                            isEn ? 'text-left' : 'text-right'
                          } ${isLightMode ? 'hover:bg-slate-100 text-slate-800' : 'hover:bg-white/10 text-slate-200'}`}
                        >
                          <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
                            <Server className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold">{isEn ? 'Compute Node (Linux / Windows)' : 'سرور محاسباتی لینوکس / ویندوز'}</span>
                            <span className={`text-[10px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {isEn ? 'SSH, WinRM, RDP & Full OS Fleet' : 'مدیریت کامل سیستم‌عامل، ترمینال و فایل‌ها'}
                            </span>
                          </div>
                        </button>

                        {/* Option 2: Nginx Web Server */}
                        <button
                          type="button"
                          onClick={() => handleOpenAdd('nginx')}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                            isEn ? 'text-left' : 'text-right'
                          } ${isLightMode ? 'hover:bg-emerald-50 text-emerald-800' : 'hover:bg-emerald-950/40 text-emerald-200'}`}
                        >
                          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                            <Globe className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-emerald-400">{isEn ? 'Nginx Web Server / Proxy' : 'وب‌سرور انجین‌ایکس (Nginx)'}</span>
                            <span className={`text-[10px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {isEn ? 'HTTP/HTTPS, Reverse Proxy & Virtual Hosts' : 'پروکسی معکوس، پورت‌های وب و هاست مجازی'}
                            </span>
                          </div>
                        </button>

                        {/* Option 3: Apache HTTP Server */}
                        <button
                          type="button"
                          onClick={() => handleOpenAdd('apache')}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                            isEn ? 'text-left' : 'text-right'
                          } ${isLightMode ? 'hover:bg-rose-50 text-rose-800' : 'hover:bg-rose-950/40 text-rose-200'}`}
                        >
                          <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                            <Flame className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-rose-400">{isEn ? 'Apache HTTP Server' : 'وب‌سرور آپاچی (Apache)'}</span>
                            <span className={`text-[10px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {isEn ? 'VirtualHosts, Modules, .htaccess & Ports' : 'هاست‌های مجازی، پورت‌ها و ماژول‌های وب'}
                            </span>
                          </div>
                        </button>

                        {/* Option 4: PostgreSQL Database */}
                        <button
                          type="button"
                          onClick={() => handleOpenAdd('postgresql')}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                            isEn ? 'text-left' : 'text-right'
                          } ${isLightMode ? 'hover:bg-blue-50 text-blue-800' : 'hover:bg-blue-950/40 text-blue-200'}`}
                        >
                          <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                            <Database className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-blue-400">{isEn ? 'PostgreSQL Database' : 'پایگاه داده پستگرس (PostgreSQL)'}</span>
                            <span className={`text-[10px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {isEn ? 'Port 5432, Schemas, SQL Runner & Roles' : 'ارتباط پورت ۵۴۳۲، اسکیماها و کوئری‌رانر'}
                            </span>
                          </div>
                        </button>

                        {/* Option 5: MySQL / MariaDB Database */}
                        <button
                          type="button"
                          onClick={() => handleOpenAdd('mysql')}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                            isEn ? 'text-left' : 'text-right'
                          } ${isLightMode ? 'hover:bg-amber-50 text-amber-800' : 'hover:bg-amber-950/40 text-amber-200'}`}
                        >
                          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                            <Database className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-amber-400">{isEn ? 'MySQL / MariaDB Database' : 'پایگاه داده مای‌اس‌کیوال (MySQL / MariaDB)'}</span>
                            <span className={`text-[10px] truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {isEn ? 'Port 3306, Processlist, Query Runner & Tuning' : 'ارتباط پورت ۳۳۰۶، کوئری‌رانر و تلمتری'}
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>
                  </>,
                  document.body
                )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Quick Summary Cards (4 stats - matching DeviceListView) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* Linux Nodes Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Linux Compute Nodes' : 'سرورهای لینوکس'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-emerald-400">
              {stats.linuxCount}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Terminal className="w-4 h-4" />
          </div>
        </div>

        {/* Windows Nodes Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Windows Server Nodes' : 'سرورهای ویندوز'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-blue-400">
              {stats.winCount}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            <Monitor className="w-4 h-4" />
          </div>
        </div>

        {/* Reachability Status Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Reachability Status' : 'وضعیت آنلاین / آفلاین'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 flex items-baseline">
              <span className="text-emerald-400" title={isEn ? 'Reachable / Online' : 'آنلاین و در دسترس'}>
                {stats.reachableCount}
              </span>
              <span className={`mx-1 text-xs font-normal ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>/</span>
              <span className="text-rose-400" title={isEn ? 'Unreachable / Down' : 'آفلاین و خارج از دسترس'}>
                {stats.unreachableCount}
              </span>
              {stats.untestedCount > 0 && (
                <>
                  <span className={`mx-1 text-xs font-normal ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>/</span>
                  <span className="text-slate-400 text-xs font-mono font-normal" title={isEn ? 'Untested / Testing' : 'تست‌نشده / در حال تست'}>
                    {stats.untestedCount} <span className="text-[10px] font-sans">({isEn ? 'untested' : 'تست‌نشده'})</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <div
            className={`p-2.5 rounded-xl border ${
              isLightMode ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white/5 text-slate-300 border-white/10'
            }`}
          >
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
        </div>

        {/* Fleet Capacity Card */}
        <div
          className={`p-3.5 rounded-xl border shadow-lg flex items-center justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 text-slate-800'
              : 'spatial-glass spatial-glass-hover spatial-depth-card border-white/10'
          }`}
        >
          <div>
            <div className={`text-[10px] uppercase font-bold tracking-wider ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Fleet Capacity' : 'مجموع ناوگان'}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 glow-text-cyan">
              {stats.total}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Cpu className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Search and Filter Bar */}
      <div
        className={`relative z-20 p-3.5 rounded-xl border shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs backdrop-blur-xl ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800'
            : 'spatial-glass border-white/10 text-slate-200'
        }`}
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder={
              isEn
                ? 'Search by name, IP, hostname, distro, tags...'
                : 'جستجوی نام، آدرس IP، هاست‌نیم، توزیع، تگ‌ها...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full px-3.5 py-2 ${
              isEn ? 'pl-9 pr-3.5' : 'pr-9 pl-3.5'
            } rounded-xl border text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 shadow-inner transition-colors ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                : 'bg-slate-900/70 border-white/15 text-slate-100 placeholder-slate-500'
            }`}
          />
          <Search className={`w-4 h-4 text-slate-400 absolute ${isEn ? 'left-3' : 'right-3'} top-2.5`} />
        </div>

        {/* Dropdown Filters & Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* OS Type Filter */}
          <select
            value={activeTabFilter}
            onChange={(e) => setActiveTabFilter(e.target.value as any)}
            className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-900/70 border-white/15 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Server Types' : 'همه انواع سرورها'}</option>
            <option value="linux">{isEn ? 'Linux Nodes Only' : 'فقط سرورهای لینوکس'}</option>
            <option value="windows">{isEn ? 'Windows Nodes Only' : 'فقط سرورهای ویندوز'}</option>
          </select>

          {/* Environment Filter */}
          <select
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-900/70 border-white/15 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Environments' : 'همه محیط‌ها'}</option>
            <option value="Production">Production</option>
            <option value="Staging">Staging</option>
            <option value="Development">Development</option>
            <option value="DMZ">DMZ</option>
          </select>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <select
              id="server-category-filter-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-slate-900/70 border-white/15 text-slate-200'
              }`}
            >
              <option value="all">{isEn ? 'All Categories' : 'همه دسته‌ها'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {isEn ? c.name : (c.name_fa || c.name)} ({c.serverCount || 0})
                </option>
              ))}
            </select>

            <button
              id="open-manage-categories-btn"
              onClick={() => setIsCategoriesModalOpen(true)}
              title={isEn ? 'Manage Server Categories' : 'مدیریت دسته‌بندی‌های سرور'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400'
                  : 'bg-slate-900/70 border-white/15 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">{isEn ? 'Categories' : 'دسته‌ها'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold">
                {categories.length}
              </span>
            </button>
          </div>

          {/* Tags Filter */}
          <select
            value={selectedTag || 'all'}
            onChange={(e) => setSelectedTag(e.target.value === 'all' ? null : e.target.value)}
            className={`px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 cursor-pointer ${
              selectedTag
                ? 'bg-purple-950/60 border-purple-500/50 text-purple-300 font-bold'
                : isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-700'
                : 'bg-slate-900/70 border-white/15 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? '🏷️ All Tags' : '🏷️ همه تگ‌ها'}</option>
            {tagsSummary.map((ts) => (
              <option key={ts.tag} value={ts.tag}>
                #{ts.tag} ({ts.count})
              </option>
            ))}
          </select>

          {/* View Mode Switcher (List DEFAULT!) */}
          <div
            className={`flex items-center p-0.5 rounded-xl border ${
              isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900/80 border-white/15'
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title={isEn ? 'List View (Default)' : 'نمایش لیستی (پیش‌فرض)'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title={isEn ? 'Dense Table View' : 'نمایش جدولی متراکم'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title={isEn ? 'Grid Cards View' : 'نمایش کارت‌ها'}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Column Visibility Selector (Persisted in localStorage) */}
          <div className="relative">
            <button
              ref={columnPickerBtnRef}
              type="button"
              onClick={handleToggleColumnPicker}
              title={isEn ? 'Customize Visible Columns' : 'سفارشی‌سازی ستون‌های جدول'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                isColumnPickerOpen
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                  : isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-slate-900/80 border-white/15 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Columns3 className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">{isEn ? 'Columns' : 'ستون‌ها'}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                {Object.values(visibleColumns).filter(Boolean).length}/{SERVER_COLUMNS.length}
              </span>
            </button>

            {isColumnPickerOpen &&
              columnPickerCoords &&
              createPortal(
                <div
                  ref={columnDropdownRef}
                  style={{
                    position: 'fixed',
                    top: `${columnPickerCoords.top}px`,
                    left: `${columnPickerCoords.left}px`,
                    width: '16.5rem',
                  }}
                  className={`z-[9999] rounded-2xl shadow-2xl p-3 border font-sans backdrop-blur-2xl animate-in fade-in zoom-in-95 ${
                    isEn ? 'text-left' : 'text-right'
                  } ${
                    isLightMode
                      ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-900/25'
                      : 'bg-slate-950/95 border-white/15 text-slate-100 shadow-black/80'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Columns3 className="w-3.5 h-3.5 text-cyan-400" />
                      {isEn ? 'Table Columns' : 'ستون‌های جدول'}
                    </span>
                    <button
                      type="button"
                      onClick={resetColumns}
                      className="text-[11px] text-cyan-400 hover:underline cursor-pointer font-mono"
                    >
                      {isEn ? 'Reset Default' : 'پیش‌فرض'}
                    </button>
                  </div>

                  <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                    {SERVER_COLUMNS.map((col) => {
                      const isVisible = visibleColumns[col.key] !== false;
                      return (
                        <label
                          key={col.key}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs select-none transition ${
                            col.required
                              ? 'opacity-70 cursor-not-allowed'
                              : 'cursor-pointer ' + (isLightMode ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              disabled={col.required}
                              onChange={() => !col.required && toggleColumn(col.key)}
                              className="w-3.5 h-3.5 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-cyan-500 accent-cyan-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <span className="text-xs">{isEn ? col.labelEn : col.labelFa}</span>
                          </span>
                          {col.required && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {isEn ? 'Required' : 'الزامی'}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>,
                document.body
              )}
          </div>
        </div>
      </div>

      {/* 4. Multi-Server Selection Action Bar (Matching DeviceListView) */}
      {selectedServerIds.size > 0 && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border shadow-lg text-xs font-mono animate-in fade-in slide-in-from-top-2 ${
            isLightMode
              ? 'bg-cyan-50 border-cyan-300 text-cyan-900'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold border ${
                isLightMode
                  ? 'bg-cyan-100 text-cyan-800 border-cyan-300'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? `${selectedServerIds.size} of ${servers.length} servers selected`
                  : `${selectedServerIds.size} از ${servers.length} سرور انتخاب شده است`}
              </span>
            </span>

            {/* Quick Selection Shortcuts */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const linuxIds = servers.filter((s) => s.os_type === 'linux').map((s) => s.id);
                  setSelectedServerIds(new Set(linuxIds));
                }}
                className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 cursor-pointer"
              >
                {isEn ? 'Only Linux' : 'فقط لینوکس'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const winIds = servers.filter((s) => s.os_type === 'windows').map((s) => s.id);
                  setSelectedServerIds(new Set(winIds));
                }}
                className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 cursor-pointer"
              >
                {isEn ? 'Only Windows' : 'فقط ویندوز'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const prodIds = servers.filter((s) => s.environment === 'Production').map((s) => s.id);
                  setSelectedServerIds(new Set(prodIds));
                }}
                className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 cursor-pointer"
              >
                {isEn ? 'Only Production' : 'فقط پروداکشن'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedServerIds(new Set())}
              className={`px-2.5 py-1 transition cursor-pointer ${
                isLightMode ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isEn ? 'Clear Selection' : 'لغو انتخاب‌ها'}
            </button>

            <button
              type="button"
              onClick={handleBulkPing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold shadow-md shadow-cyan-500/20 cursor-pointer active:scale-95 transition"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isEn ? 'Test Reachability' : 'تست وضعیت پینگ'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const targetList = servers.filter((s) => selectedServerIds.has(s.id));
                setPowerModalConfig({ servers: targetList, action: 'restart' });
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold shadow-md shadow-amber-500/20 cursor-pointer active:scale-95 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? `Restart Selected (${selectedServerIds.size})`
                  : `ری‌استارت انتخاب‌شده‌ها (${selectedServerIds.size})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const targetList = servers.filter((s) => selectedServerIds.has(s.id));
                setPowerModalConfig({ servers: targetList, action: 'poweroff' });
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-bold shadow-md shadow-rose-500/20 cursor-pointer active:scale-95 transition"
            >
              <Power className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? `Shutdown Selected (${selectedServerIds.size})`
                  : `خاموش کردن انتخاب‌شده‌ها (${selectedServerIds.size})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsBulkConfigOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95 transition"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isEn ? 'Bulk Linux Config' : 'پیکربندی گروهی لینوکس'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. Active Tag Filter Indicator */}
      {selectedTag && (
        <div className="flex items-center gap-2 p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs">
          <Tags className="w-4 h-4 shrink-0 text-purple-400" />
          <span>
            {isEn ? 'Filtered by Tag:' : 'فیلتر بر اساس تگ:'} <strong>#{selectedTag}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className="ms-auto text-xs px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 cursor-pointer"
          >
            {isEn ? 'Clear Filter' : 'حذف فیلتر'}
          </button>
        </div>
      )}

      {/* 6. Main List View (DEFAULT VIEW - Styled with DeviceListView spatial-glass table) */}
      {viewMode === 'list' && (
        <div
          className={`rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl border ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-slate-200/50'
              : 'spatial-glass border-white/10'
          }`}
        >
          <div className="overflow-x-auto min-h-[380px]">
            <table className={`w-full ${isEn ? 'text-left' : 'text-right'} text-xs device-table`}>
              <thead>
                <tr
                  className={`border-b-2 text-[11px] font-bold uppercase tracking-wider font-mono ${
                    isLightMode
                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                      : 'bg-slate-950/80 text-slate-300 border-white/15'
                  }`}
                >
                  {visibleColumns.select && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'} w-10 text-center`}
                    >
                      <input
                        type="checkbox"
                        checked={filteredServers.length > 0 && selectedServerIds.size === filteredServers.length}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate =
                              selectedServerIds.size > 0 && selectedServerIds.size < filteredServers.length;
                          }
                        }}
                        onChange={() => {
                          if (selectedServerIds.size === filteredServers.length && filteredServers.length > 0) {
                            setSelectedServerIds(new Set());
                          } else {
                            setSelectedServerIds(new Set(filteredServers.map((s) => s.id)));
                          }
                        }}
                        className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-cyan-500 accent-cyan-500 cursor-pointer"
                      />
                    </th>
                  )}
                  {visibleColumns.node && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Server Node & Hostname' : 'نام و هاست‌نیم سرور'}
                    </th>
                  )}
                  {visibleColumns.os && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'OS & Distro' : 'سیستم‌عامل و توزیع'}
                    </th>
                  )}
                  {visibleColumns.ip && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'IP Address & Port' : 'آدرس IP و پورت'}
                    </th>
                  )}
                  {visibleColumns.role && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Role & Environment' : 'محیط و دسته‌بندی'}
                    </th>
                  )}
                  {visibleColumns.status && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Live Status' : 'وضعیت لحظه‌ای'}
                    </th>
                  )}
                  {visibleColumns.uptime && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isEn ? 'Uptime' : 'مدت کارکرد (Uptime)'}</span>
                      </div>
                    </th>
                  )}
                  {visibleColumns.tags && (
                    <th
                      className={`p-3.5 ${
                        isEn ? 'border-r' : 'border-l'
                      } ${isLightMode ? 'border-slate-200' : 'border-white/15'}`}
                    >
                      {isEn ? 'Automation Tags' : 'تگ‌های اتوماسیون'}
                    </th>
                  )}
                  {visibleColumns.actions && (
                    <th className="p-3.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                  )}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-white/10'}`}>
                {filteredServers.length === 0 ? (
                  <tr>
                    <td colSpan={Object.values(visibleColumns).filter(Boolean).length || 8} className="p-8 text-center text-slate-400">
                      {isEn ? 'No remote servers found matching filters.' : 'هیچ سروری منطبق با فیلترها یافت نشد.'}
                    </td>
                  </tr>
                ) : (
                  filteredServers.map((server) => {
                    const isLinux = server.os_type === 'linux';
                    const reach = reachabilityCache[server.id];
                    const isSelected = selectedServerIds.has(server.id);

                    return (
                      <tr
                        key={server.id}
                        className={`group transition-colors duration-150 ${
                          isSelected
                            ? isLightMode
                              ? 'bg-cyan-50/60'
                              : 'bg-cyan-950/30'
                            : isLightMode
                            ? 'hover:bg-slate-50'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        {/* Checkbox Column */}
                        {visibleColumns.select && (
                          <td
                            className={`p-3.5 text-center ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedServerIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(server.id)) next.delete(server.id);
                                  else next.add(server.id);
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-white/20 focus:ring-cyan-500 accent-cyan-500 cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Server Node & Hostname */}
                        {visibleColumns.node && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`p-2 rounded-xl border shrink-0 ${
                                  isLinux
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                    : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                                }`}
                              >
                                {isLinux ? <Terminal className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                {isLinux ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenLinuxMonitor(server)}
                                    className="text-left rtl:text-right group/lst block cursor-pointer focus:outline-none"
                                    title={isEn ? `Open Server Management for ${server.name}` : `باز کردن مدیریت سرور برای ${server.name}`}
                                  >
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span
                                        className={`text-xs font-bold tracking-tight transition-colors group-hover/lst:text-cyan-400 group-hover/lst:underline ${
                                          isLightMode
                                            ? 'text-slate-900 group-hover:text-cyan-700'
                                            : 'text-white group-hover:text-cyan-300'
                                        }`}
                                      >
                                        {server.name}
                                      </span>
                                      {server.hostname && server.hostname !== server.name && (
                                        <span className={`text-[10px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                          ({server.hostname})
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`text-xs font-bold tracking-tight ${
                                        isLightMode ? 'text-slate-900' : 'text-white'
                                      }`}
                                    >
                                      {server.name}
                                    </span>
                                    {server.hostname && server.hostname !== server.name && (
                                      <span className={`text-[10px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                        ({server.hostname})
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Line 2: Server Hardware Resources (خط بعد از اسم سرور) */}
                                <div
                                  className={`flex items-center gap-1.5 text-[11px] font-mono mt-1 ${
                                    isLightMode ? 'text-slate-600' : 'text-slate-300'
                                  }`}
                                  title={isEn ? 'Hardware Specifications (CPU • RAM • Disk)' : 'مشخصات سخت‌افزاری (پردازنده • رم • هارد)'}
                                >
                                  <Cpu className="w-3 h-3 text-cyan-400/80 shrink-0" />
                                  <span>{formatServerHardwareSpecs(server, isEn)}</span>
                                </div>

                                {/* Line 3: System Uptime (زیر خط ریسورس) */}
                                {server.uptime_str && (
                                  <div
                                    className={`flex items-center gap-1.5 text-[10px] font-mono mt-0.5 ${
                                      isLightMode ? 'text-cyan-700' : 'text-cyan-400/90'
                                    }`}
                                    title={isEn ? `Server Uptime: ${server.uptime_str}` : `مدت زمان کارکرد سرور: ${server.uptime_str}`}
                                  >
                                    <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                                    <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                                      {isEn ? 'Uptime:' : 'آپ‌تایم:'}
                                    </span>
                                    <span className="font-semibold">{server.uptime_str}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        {/* OS & Distro */}
                        {visibleColumns.os && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                                    isLinux
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                  }`}
                                >
                                  {server.os_type.toUpperCase()}
                                </span>
                                <span className="text-xs font-medium truncate max-w-[140px]">
                                  {server.os_distro || (isLinux ? 'Linux' : 'Windows Server')}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono flex-wrap">
                                <span>
                                  {isLinux
                                    ? `Shell: /bin/${server.default_shell || 'bash'}`
                                    : `Protocol: ${(server.win_protocol || 'rdp').toUpperCase()}`}
                                </span>
                                {(server.has_apache || server.server_type === 'apache' || (Array.isArray(server.installed_web_servers) && server.installed_web_servers.includes('apache'))) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenApacheManagement(server);
                                    }}
                                    title={isEn ? 'Open Apache Management' : 'مدیریت وب‌سرور آپاچی'}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-500/15 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 transition cursor-pointer"
                                  >
                                    Apache
                                  </button>
                                )}
                                {(server.has_nginx || server.server_type === 'nginx' || (Array.isArray(server.installed_web_servers) && server.installed_web_servers.includes('nginx'))) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenNginxManagement(server);
                                    }}
                                    title={isEn ? 'Open Nginx Management' : 'مدیریت انجین‌ایکس'}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition cursor-pointer"
                                  >
                                    Nginx
                                  </button>
                                )}
                                {(server.has_postgresql || server.server_type === 'postgresql' || (Array.isArray(server.installed_databases) && server.installed_databases.includes('postgresql'))) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenPostgresManagement(server);
                                    }}
                                    title={isEn ? 'Open PostgreSQL Management' : 'مدیریت پایگاه داده PostgreSQL'}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/15 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 transition cursor-pointer"
                                  >
                                    PostgreSQL
                                  </button>
                                )}
                                {server.os_type !== 'windows' && (server.has_mysql || server.server_type === 'mysql' || (Array.isArray(server.installed_databases) && (server.installed_databases.includes('mysql') || server.installed_databases.includes('mariadb')))) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenMysqlManagement(server);
                                    }}
                                    title={isEn ? 'Open MySQL Management' : 'مدیریت پایگاه داده MySQL'}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition cursor-pointer"
                                  >
                                    MySQL
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        {/* IP Address & Port */}
                        {visibleColumns.ip && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-cyan-400">{server.ip}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                :{isLinux ? server.ssh_port || 22 : server.win_port || 3389}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyIp(server.ip)}
                                title={isEn ? 'Copy IP address' : 'کپی آدرس آی‌پی'}
                                className={`p-1 rounded-md transition cursor-pointer ${
                                  copiedIp === server.ip
                                    ? 'text-emerald-400'
                                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                                }`}
                              >
                                {copiedIp === server.ip ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        )}

                        {/* Role & Environment */}
                        {visibleColumns.role && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                                    server.environment === 'Production'
                                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                      : server.environment === 'Staging'
                                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                      : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                  }`}
                                >
                                  {server.environment}
                                </span>
                                <span className="text-[11px] text-slate-300 truncate">{server.category}</span>
                              </div>
                              {server.prompt_password_on_connect && (
                                <span
                                  title={isEn ? 'Zero-storage credential policy (Prompt on connect)' : 'عدم ذخیره پسورد (درخواست در زمان اتصال)'}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 w-fit"
                                >
                                  <Key className="w-2.5 h-2.5" />
                                  <span>{isEn ? 'No-Store' : 'بدون‌ذخیره'}</span>
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Live Status */}
                        {visibleColumns.status && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex items-center gap-2">
                              {reach?.testing ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>{isEn ? 'Pinging...' : 'در حال تست...'}</span>
                                </span>
                              ) : reach ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                                    reach.reachable
                                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      reach.reachable ? 'bg-emerald-400' : 'bg-rose-400'
                                    }`}
                                  />
                                  {reach.reachable ? `${reach.latency}ms` : (isEn ? 'Down' : 'آفلاین')}
                                </span>
                              ) : server.status === 'offline' || server.status === 'unreachable' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border bg-rose-500/15 text-rose-400 border-rose-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                  {isEn ? 'Offline' : 'آفلاین'}
                                </span>
                              ) : server.status === 'online' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  {isEn ? 'Online' : 'آنلاین'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border bg-slate-500/15 text-slate-400 border-slate-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  {isEn ? 'Untested' : 'تست‌نشده'}
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => handleTestPing(server.id)}
                                title={isEn ? 'Test keepalive ping' : 'تست پینگ لحظه‌ای'}
                                className={`p-1 rounded-md border transition cursor-pointer ${
                                  isLightMode
                                    ? 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-cyan-700'
                                    : 'border-white/10 text-slate-400 hover:text-cyan-300 hover:bg-white/10'
                                }`}
                              >
                                <Zap className="w-3 h-3" />
                              </button>
                            </div>
                            {server.uptime_str && (
                              <div
                                className={`flex items-center gap-1 text-[10px] font-mono mt-1 ${
                                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                                }`}
                                title={isEn ? `Server Uptime: ${server.uptime_str}` : `مدت زمان کارکرد: ${server.uptime_str}`}
                              >
                                <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span className="text-cyan-400/80 font-medium">{isEn ? 'Up:' : 'آپ‌تایم:'}</span>
                                <span className="truncate">{server.uptime_str}</span>
                              </div>
                            )}
                          </td>
                        )}

                        {/* Server Uptime Column */}
                        {visibleColumns.uptime && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            {server.uptime_str ? (
                              <div className="flex items-center gap-1.5 font-mono text-xs">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                                    isLightMode
                                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                                      : 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30 shadow-xs'
                                  }`}
                                  title={isEn ? `Server Uptime: ${server.uptime_str}` : `مدت زمان کارکرد سرور: ${server.uptime_str}`}
                                >
                                  <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span>{server.uptime_str}</span>
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 font-mono text-[11px]">—</span>
                            )}
                          </td>
                        )}

                        {/* Automation Tags */}
                        {visibleColumns.tags && (
                          <td
                            className={`p-3.5 ${
                              isEn ? 'border-r' : 'border-l'
                            } ${isLightMode ? 'border-slate-200' : 'border-white/10'}`}
                          >
                            <div className="flex flex-wrap items-center gap-1 max-w-[200px]">
                              {Array.isArray(server.tags) && server.tags.length > 0 ? (
                                server.tags.slice(0, 3).map((t) => (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => setSelectedTag(t)}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/25 text-purple-300 border border-purple-500/20 transition cursor-pointer"
                                  >
                                    #{t}
                                  </button>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-500">—</span>
                              )}
                              {Array.isArray(server.tags) && server.tags.length > 3 && (
                                <span className="text-[10px] text-slate-500 font-mono">+{server.tags.length - 3}</span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Actions (3-Dot Options Trigger) */}
                        {visibleColumns.actions && (
                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center">
                              {/* 3-Dot Options Trigger */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleActionMenu(e, server)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  menuAnchor?.id === server.id
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : isLightMode
                                    ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200'
                                    : 'text-slate-400 hover:bg-white/10 hover:text-white border border-white/10'
                                }`}
                                title={isEn ? 'Actions & Options' : 'عملیات و گزینه‌ها'}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Grid Cards View (Compact & Sleek) */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredServers.map((server) => {
            const isLinux = server.os_type === 'linux';
            const reach = reachabilityCache[server.id];

            return (
              <div
                key={server.id}
                className={`group flex flex-col justify-between p-4 rounded-xl border transition-all duration-200 hover:shadow-xl relative ${
                  isLightMode
                    ? 'bg-white border-slate-200 hover:border-cyan-400 shadow-sm'
                    : 'spatial-glass spatial-glass-hover border-white/10 shadow-lg'
                }`}
              >
                <div>
                  {/* Card Header: OS Icon, Name, Status, 3-Dot Menu */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-xl border shrink-0 ${
                          isLinux
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                        }`}
                      >
                        {isLinux ? <Terminal className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        {isLinux ? (
                          <button
                            type="button"
                            onClick={() => handleOpenLinuxMonitor(server)}
                            className="text-left rtl:text-right cursor-pointer group/name block max-w-full"
                            title={isEn ? `Open Server Management for ${server.name}` : `باز کردن مدیریت سرور برای ${server.name}`}
                          >
                            <h3
                              className={`text-sm font-bold tracking-tight truncate transition-colors ${
                                isLightMode ? 'text-slate-900 group-hover/name:text-cyan-700' : 'text-white group-hover/name:text-cyan-300'
                              }`}
                            >
                              {server.name}
                            </h3>
                          </button>
                        ) : (
                          <h3
                            className={`text-sm font-bold tracking-tight truncate transition-colors ${
                              isLightMode ? 'text-slate-900 group-hover:text-cyan-700' : 'text-white group-hover:text-cyan-300'
                            }`}
                          >
                            {server.name}
                          </h3>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate flex-wrap">
                          <span>{server.os_distro || (isLinux ? 'Linux' : 'Windows Server')}</span>
                          <span>•</span>
                          <span className="font-mono">{server.category}</span>
                          {(server.has_apache || (Array.isArray(server.installed_web_servers) && server.installed_web_servers.includes('apache'))) && (
                            <span
                              title={isEn ? 'Apache HTTP Server installed' : 'وب‌سرور آپاچی نصب‌شده'}
                              className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0"
                            >
                              Apache
                            </span>
                          )}
                          {(server.has_nginx || (Array.isArray(server.installed_web_servers) && server.installed_web_servers.includes('nginx'))) && (
                            <span
                              title={isEn ? 'Nginx Web Server / Proxy installed' : 'وب‌سرور و پروکسی انجین‌ایکس نصب‌شده'}
                              className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0"
                            >
                              Nginx
                            </span>
                          )}
                          {(server.has_postgresql || (Array.isArray(server.installed_databases) && server.installed_databases.includes('postgresql'))) && (
                            <span
                              title={isEn ? 'PostgreSQL Database installed' : 'پایگاه داده پستگرس نصب‌شده'}
                              className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0"
                            >
                              Postgres
                            </span>
                          )}
                          {(server.has_mysql || (Array.isArray(server.installed_databases) && (server.installed_databases.includes('mysql') || server.installed_databases.includes('mariadb')))) && (
                            <span
                              title={isEn ? 'MySQL / MariaDB Database installed' : 'پایگاه داده مای‌اس‌کیوال نصب‌شده'}
                              className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30 shrink-0"
                            >
                              MySQL
                            </span>
                          )}
                          {server.prompt_password_on_connect && (
                            <span
                              title={isEn ? 'Zero-storage credential policy' : 'عدم ذخیره پسورد'}
                              className="inline-flex items-center gap-1 px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0"
                            >
                              <Key className="w-2.5 h-2.5" />
                              <span>{isEn ? 'No-Store' : 'بدون‌ذخیره'}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                          server.environment === 'Production'
                            ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            : server.environment === 'Staging'
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                        }`}
                      >
                        {server.environment}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleToggleActionMenu(e, server)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          menuAnchor?.id === server.id
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : isLightMode
                            ? 'text-slate-500 hover:bg-slate-100'
                            : 'text-slate-400 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* IP Address & Reachability Bar */}
                  <div
                    className={`flex items-center justify-between mt-3 p-2 rounded-xl font-mono text-xs border ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-cyan-400 font-bold">{server.ip}</span>
                      {server.hostname && (
                        <span className="text-[11px] text-slate-400 truncate">({server.hostname})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {reach?.testing ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-cyan-500/15 text-cyan-400 border-cyan-500/30 animate-pulse">
                          {isEn ? 'Pinging...' : 'در حال تست...'}
                        </span>
                      ) : reach ? (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                            reach.reachable
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {reach.reachable ? `${reach.latency}ms` : (isEn ? 'Down' : 'آفلاین')}
                        </span>
                      ) : server.status === 'offline' || server.status === 'unreachable' ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-rose-500/15 text-rose-400 border-rose-500/30">
                          {isEn ? 'Offline' : 'آفلاین'}
                        </span>
                      ) : server.status === 'online' ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                          {isEn ? 'Online' : 'آنلاین'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md border bg-slate-500/15 text-slate-400 border-slate-500/30">
                          {isEn ? 'Untested' : 'تست‌نشده'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {Array.isArray(server.tags) && server.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                      {server.tags.slice(0, 3).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSelectedTag(tag)}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 transition-colors cursor-pointer"
                        >
                          #{tag}
                        </button>
                      ))}
                      {server.tags.length > 3 && (
                        <span className="text-[10px] text-slate-500 font-mono">+{server.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Action Section */}
                <div
                  className={`pt-3 mt-3 border-t flex items-center justify-between gap-2 ${
                    isLightMode ? 'border-slate-200' : 'border-white/10'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 text-[11px] text-slate-300 font-mono">
                    <div>{formatServerHardwareSpecs(server, isEn)}</div>
                    {server.uptime_str && (
                      <div
                        className="flex items-center gap-1 text-[10px] text-cyan-400 font-medium"
                        title={isEn ? `Server Uptime: ${server.uptime_str}` : `مدت زمان کارکرد: ${server.uptime_str}`}
                      >
                        <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                        <span>{isEn ? `Up: ${server.uptime_str}` : `آپ‌تایم: ${server.uptime_str}`}</span>
                      </div>
                    )}
                  </div>

                  {server.server_type === 'apache' || (server.has_apache && !server.has_nginx && !server.has_postgresql && !server.has_mysql) ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenApacheManagement(server)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md transition-all cursor-pointer"
                        title={isEn ? 'Open Apache Management' : 'مدیریت وب‌سرور آپاچی'}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Apache' : 'آپاچی'}</span>
                      </button>
                      {isLinux && (
                        <button
                          type="button"
                          onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                          className="p-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md transition-all cursor-pointer"
                          title={isEn ? 'Terminal' : 'ترمینال'}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : server.server_type === 'nginx' || (server.has_nginx && !server.has_apache && !server.has_postgresql && !server.has_mysql) ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenNginxManagement(server)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md transition-all cursor-pointer"
                        title={isEn ? 'Open Nginx Management' : 'مدیریت انجین‌ایکس'}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Nginx' : 'انجین‌ایکس'}</span>
                      </button>
                      {isLinux && (
                        <button
                          type="button"
                          onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                          className="p-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md transition-all cursor-pointer"
                          title={isEn ? 'Terminal' : 'ترمینال'}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : server.server_type === 'postgresql' || (server.has_postgresql && !server.has_nginx && !server.has_apache && !server.has_mysql) ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenPostgresManagement(server)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md transition-all cursor-pointer"
                        title={isEn ? 'Open PostgreSQL Management' : 'مدیریت پایگاه داده PostgreSQL'}
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>{isEn ? 'PostgreSQL' : 'پستگرس'}</span>
                      </button>
                      {isLinux && (
                        <button
                          type="button"
                          onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                          className="p-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md transition-all cursor-pointer"
                          title={isEn ? 'Terminal' : 'ترمینال'}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : server.server_type === 'mysql' || (server.has_mysql && !server.has_nginx && !server.has_apache && !server.has_postgresql) ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenMysqlManagement(server)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-md transition-all cursor-pointer"
                        title={isEn ? 'Open MySQL Management' : 'مدیریت پایگاه داده MySQL'}
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>{isEn ? 'MySQL' : 'مای‌اس‌کیوال'}</span>
                      </button>
                      {isLinux && (
                        <button
                          type="button"
                          onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                          className="p-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md transition-all cursor-pointer"
                          title={isEn ? 'Terminal' : 'ترمینال'}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : isLinux ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenLinuxMonitor(server)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-md transition-all cursor-pointer"
                        title={isEn ? 'Open Server Management' : 'مشاهده و مدیریت کامل سرور'}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Management' : 'مدیریت'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLinuxFileExplorer(server)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-md transition-all cursor-pointer"
                        title={isEn ? 'Open File Explorer' : 'کاوشگر فایل و دایرکتوری‌ها'}
                      >
                        <FolderTree className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Files' : 'فایل‌ها'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenLinuxTerminal(server, 'bash')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-md transition-all cursor-pointer"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Terminal' : 'ترمینال'}</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md transition-all cursor-pointer"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>{isEn ? 'In-Browser RDP' : 'ریموت'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 8. Dense Table View */}
      {viewMode === 'table' && (
        <div
          className={`rounded-2xl border overflow-hidden shadow-xl backdrop-blur-xl ${
            isLightMode ? 'bg-white border-slate-200' : 'spatial-glass border-white/10'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr
                  className={`border-b text-[10px] font-mono uppercase ${
                    isLightMode
                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                      : 'border-white/10 bg-slate-950/80 text-slate-400'
                  }`}
                >
                  {visibleColumns.os && <th className="p-3">OS</th>}
                  {visibleColumns.node && <th className="p-3">{isEn ? 'Server Name' : 'نام سرور'}</th>}
                  {visibleColumns.ip && <th className="p-3">IP / Port</th>}
                  {visibleColumns.role && <th className="p-3">{isEn ? 'Category' : 'دسته'}</th>}
                  {visibleColumns.role && <th className="p-3">{isEn ? 'Env' : 'محیط'}</th>}
                  {visibleColumns.uptime && <th className="p-3">{isEn ? 'Uptime' : 'آپ‌تایم'}</th>}
                  {visibleColumns.tags && <th className="p-3">{isEn ? 'Tags' : 'تگ‌ها'}</th>}
                  {visibleColumns.actions && <th className="p-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>}
                </tr>
              </thead>
              <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-white/10'} font-sans`}>
                {filteredServers.map((server) => {
                  const isLinux = server.os_type === 'linux';

                  return (
                    <tr
                      key={server.id}
                      className={`transition-colors ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'
                      }`}
                    >
                      {visibleColumns.os && (
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                              isLinux
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {isLinux ? <Terminal className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                            {server.os_type.toUpperCase()}
                          </span>
                        </td>
                      )}
                      {visibleColumns.node && (
                        <td className={`p-3 font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isLinux ? (
                            <button
                              type="button"
                              onClick={() => handleOpenLinuxMonitor(server)}
                              className="text-left rtl:text-right group/tblname block cursor-pointer focus:outline-none"
                              title={isEn ? `Open Server Management for ${server.name}` : `باز کردن مدیریت سرور برای ${server.name}`}
                            >
                              <div className="group-hover/tblname:text-cyan-400 group-hover/tblname:underline transition-colors">
                                {server.name}
                              </div>
                              <div className="text-[10px] font-normal font-mono flex items-center gap-1.5 mt-0.5">
                                {server.os_distro && <span className="text-slate-400">{server.os_distro} •</span>}
                                <span className={isLightMode ? 'text-slate-600' : 'text-slate-300'}>
                                  {formatServerHardwareSpecs(server, isEn)}
                                </span>
                              </div>
                              {server.uptime_str && (
                                <div className="text-[10px] text-cyan-400 font-mono mt-0.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                                    {isEn ? 'Up:' : 'آپ‌تایم:'}
                                  </span>
                                  <span className="font-medium">{server.uptime_str}</span>
                                </div>
                              )}
                            </button>
                          ) : (
                            <div>
                              <div>{server.name}</div>
                              <div className="text-[10px] font-normal font-mono flex items-center gap-1.5 mt-0.5">
                                {server.os_distro && <span className="text-slate-400">{server.os_distro} •</span>}
                                <span className={isLightMode ? 'text-slate-600' : 'text-slate-300'}>
                                  {formatServerHardwareSpecs(server, isEn)}
                                </span>
                              </div>
                              {server.uptime_str && (
                                <div className="text-[10px] text-cyan-400 font-mono mt-0.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                                    {isEn ? 'Up:' : 'آپ‌تایم:'}
                                  </span>
                                  <span className="font-medium">{server.uptime_str}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.ip && (
                        <td className="p-3 font-mono text-cyan-400 font-semibold">
                          {server.ip}:{isLinux ? server.ssh_port || 22 : server.win_port || 3389}
                        </td>
                      )}
                      {visibleColumns.role && <td className="p-3 text-slate-400">{server.category}</td>}
                      {visibleColumns.role && (
                        <td className="p-3">
                          <span
                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                              server.environment === 'Production'
                                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                            }`}
                          >
                            {server.environment}
                          </span>
                        </td>
                      )}
                      {visibleColumns.uptime && (
                        <td className="p-3 font-mono text-cyan-300 text-xs">
                          {server.uptime_str ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px]"
                              title={isEn ? `Server Uptime: ${server.uptime_str}` : `مدت کارکرد: ${server.uptime_str}`}
                            >
                              <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                              <span>{server.uptime_str}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.tags && (
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {server.tags?.map((t) => (
                              <span
                                key={t}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isLinux ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLinuxMonitor(server)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-400 text-slate-950 hover:bg-cyan-300 cursor-pointer shadow-sm"
                                  title={isEn ? 'Open Server Management' : 'مشاهده و مدیریت کامل سرور'}
                                >
                                  {isEn ? 'Manage' : 'مدیریت'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLinuxFileExplorer(server)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 cursor-pointer shadow-sm"
                                  title={isEn ? 'Open File Explorer' : 'کاوشگر فایل'}
                                >
                                  {isEn ? 'Files' : 'فایل‌ها'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenLinuxTerminal(server, 'bash')
                                  }
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
                                >
                                  {isEn ? 'Terminal' : 'ترمینال'}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenInBrowserRemote(server, 'rdp')}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-500 cursor-pointer shadow-sm"
                              >
                                Web RDP
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => handleToggleActionMenu(e, server)}
                              className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. Floating 3-Dots Action Dropdown Menu (Portal, matching DeviceListView) */}
      {menuAnchor &&
        createPortal(
          <>
            {/* Transparent backdrop */}
            <div
              className="fixed inset-0 z-[9998] bg-black/10"
              onClick={(e) => {
                e.stopPropagation();
                setMenuAnchor(null);
              }}
            />

            <div
              ref={menuDropdownRef}
              style={{
                position: 'fixed',
                top: `${menuAnchor.top}px`,
                left: `${menuAnchor.left}px`,
                maxHeight: menuAnchor.maxHeight ? `${menuAnchor.maxHeight}px` : 'calc(100vh - 24px)',
                width: '16rem',
              }}
              className={`z-[9999] rounded-2xl shadow-2xl p-1.5 border font-sans animate-in fade-in zoom-in-95 overflow-y-auto overscroll-contain custom-scrollbar ${
                isEn ? 'text-left' : 'text-right'
              } ${
                isLightMode
                  ? 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-900/25'
                  : 'bg-slate-950/95 border-white/15 backdrop-blur-2xl text-slate-100 shadow-black/80'
              }`}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              {/* Menu Header: Name & IP */}
              <div
                className={`px-3 py-2 border-b flex items-center justify-between text-[11px] font-mono ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}
              >
                <span className="font-bold truncate max-w-[120px]">{menuAnchor.server.name}</span>
                <span className="text-cyan-400 font-semibold">{menuAnchor.server.ip}</span>
              </div>

              <div className="py-1 space-y-0.5">
                {/* Ping / Keepalive Test */}
                <button
                  type="button"
                  onClick={() => handleTestPing(menuAnchor.server.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${
                    isLightMode ? 'text-slate-700 hover:bg-slate-100 hover:text-cyan-700' : 'text-slate-200 hover:bg-white/10 hover:text-cyan-300'
                  }`}
                >
                  <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Test Reachability / Ping' : 'تست وضعیت پینگ و تاخیر'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">ICMP Keepalive Check</span>
                  </div>
                </button>

                {/* Copy IP Address */}
                <button
                  type="button"
                  onClick={() => handleCopyIp(menuAnchor.server.ip)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${
                    isLightMode ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Copy className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Copy IP Address' : 'کپی آدرس آی‌پی'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{menuAnchor.server.ip}</span>
                  </div>
                </button>

                {/* Linux Specific Remote Options */}
                {menuAnchor.server.os_type === 'linux' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenLinuxMonitor(s);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-cyan-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-cyan-50' : 'hover:bg-cyan-500/15'}`}
                    >
                      <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'Server Management' : 'مدیریت سرور'}</span>
                        <span className="text-[10px] text-cyan-400/80 font-mono">Overview, Storage, Services & Config</span>
                      </div>
                    </button>

                    {/* Nginx Management (shown if server has_nginx is true, server_type === 'nginx', or installed_web_servers includes 'nginx') */}
                    {(menuAnchor.server.has_nginx || menuAnchor.server.server_type === 'nginx' || (Array.isArray(menuAnchor.server.installed_web_servers) && menuAnchor.server.installed_web_servers.includes('nginx'))) && (
                      <button
                        type="button"
                        onClick={() => {
                          const s = menuAnchor.server;
                          handleOpenNginxManagement(s);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-emerald-300 transition cursor-pointer ${
                          isEn ? 'text-left' : 'text-right'
                        } ${isLightMode ? 'hover:bg-emerald-50 text-emerald-700' : 'hover:bg-emerald-500/15 text-emerald-300'}`}
                      >
                        <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="flex flex-col">
                          <span>{isEn ? 'Nginx Management' : 'مدیریت Nginx'}</span>
                          <span className={`text-[10px] font-mono ${isLightMode ? 'text-emerald-600/80' : 'text-emerald-400/80'}`}>
                            {isEn ? 'Web Server, Virtual Hosts & Proxy' : 'وب‌سرور، هاست‌های مجازی و پروکسی معکوس'}
                          </span>
                        </div>
                      </button>
                    )}

                    {/* Apache Management (shown if server has_apache is true, server_type === 'apache', or installed_web_servers includes 'apache') */}
                    {(menuAnchor.server.has_apache || menuAnchor.server.server_type === 'apache' || (Array.isArray(menuAnchor.server.installed_web_servers) && menuAnchor.server.installed_web_servers.includes('apache'))) && (
                      <button
                        type="button"
                        onClick={() => {
                          const s = menuAnchor.server;
                          handleOpenApacheManagement(s);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-300 transition cursor-pointer ${
                          isEn ? 'text-left' : 'text-right'
                        } ${isLightMode ? 'hover:bg-amber-50 text-amber-700' : 'hover:bg-amber-500/15 text-amber-300'}`}
                      >
                        <Flame className="w-4 h-4 text-rose-400 shrink-0" />
                        <div className="flex flex-col">
                          <span>{isEn ? 'Apache Management' : 'مدیریت Apache'}</span>
                          <span className={`text-[10px] font-mono ${isLightMode ? 'text-rose-600/80' : 'text-rose-400/80'}`}>
                            {isEn ? 'HTTP Server, VirtualHosts & Modules' : 'وب‌سرور آپاچی، هاست‌های مجازی و ماژول‌ها'}
                          </span>
                        </div>
                      </button>
                    )}

                    {/* PostgreSQL Management (shown if server has_postgresql is true, server_type === 'postgresql', or installed_databases includes 'postgresql') */}
                    {(menuAnchor.server.has_postgresql || menuAnchor.server.server_type === 'postgresql' || (Array.isArray(menuAnchor.server.installed_databases) && menuAnchor.server.installed_databases.includes('postgresql'))) && (
                      <button
                        type="button"
                        onClick={() => {
                          const s = menuAnchor.server;
                          handleOpenPostgresManagement(s);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                          isEn ? 'text-left' : 'text-right'
                        } ${isLightMode ? 'hover:bg-blue-50 text-blue-700' : 'hover:bg-blue-500/15 text-blue-300'}`}
                      >
                        <Database className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="flex flex-col">
                          <span>{isEn ? 'PostgreSQL Management' : 'مدیریت PostgreSQL'}</span>
                          <span className={`text-[10px] font-mono ${isLightMode ? 'text-blue-600/80' : 'text-blue-400/80'}`}>
                            {isEn ? 'Database Engine, Telemetry & Status' : 'پایگاه داده، پایش وضعیت و تلمتری'}
                          </span>
                        </div>
                      </button>
                    )}

                    {/* MySQL Management (shown ONLY for Linux servers where MySQL is configured) */}
                    {menuAnchor.server.os_type !== 'windows' && (menuAnchor.server.has_mysql || menuAnchor.server.server_type === 'mysql' || (Array.isArray(menuAnchor.server.installed_databases) && (menuAnchor.server.installed_databases.includes('mysql') || menuAnchor.server.installed_databases.includes('mariadb')))) && (
                      <button
                        type="button"
                        onClick={() => {
                          const s = menuAnchor.server;
                          handleOpenMysqlManagement(s);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                          isEn ? 'text-left' : 'text-right'
                        } ${isLightMode ? 'hover:bg-amber-50 text-amber-700' : 'hover:bg-amber-500/15 text-amber-300'}`}
                      >
                        <Database className="w-4 h-4 text-amber-400 shrink-0" />
                        <div className="flex flex-col">
                          <span>{isEn ? 'MySQL Management' : 'مدیریت MySQL'}</span>
                          <span className={`text-[10px] font-mono ${isLightMode ? 'text-amber-600/80' : 'text-amber-400/80'}`}>
                            {isEn ? `Port ${menuAnchor.server.mysql_port || 3306} • Database Management` : `پورت ${menuAnchor.server.mysql_port || 3306} • مدیریت پایگاه داده`}
                          </span>
                        </div>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenLinuxFileExplorer(s);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/15'}`}
                    >
                      <FolderTree className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'File Explorer' : 'کاوشگر فایل'}</span>
                        <span className="text-[10px] text-amber-400/80 font-mono">SFTP, Directory Tree & Editor</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenInBrowserRemote(s, 'vnc');
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/15'}`}
                    >
                      <Monitor className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'In-Browser VNC Console' : 'کنسول گرافیکی VNC مرورگر'}</span>
                        <span className="text-[10px] text-amber-400/80 font-mono">Web Desktop Stream</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenLinuxTerminal(s, 'bash');
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-emerald-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-emerald-50' : 'hover:bg-emerald-500/15'}`}
                    >
                      <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'SSH Terminal' : 'ترمینال SSH'}</span>
                        <span className="text-[10px] text-emerald-400/80 font-mono">/bin/bash</span>
                      </div>
                    </button>
                  </>
                )}

                {/* Windows Specific Remote Options */}
                {menuAnchor.server.os_type === 'windows' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenInBrowserRemote(s, 'rdp');
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-cyan-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-cyan-50' : 'hover:bg-cyan-500/15'}`}
                    >
                      <Monitor className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'In-Browser RDP' : 'ریموت دسکتاپ در مرورگر'}</span>
                        <span className="text-[10px] text-cyan-400/80 font-mono">HTML5 Guacamole Gateway</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const s = menuAnchor.server;
                        handleOpenWindowsRemote(s);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-blue-300 transition cursor-pointer ${
                        isEn ? 'text-left' : 'text-right'
                      } ${isLightMode ? 'hover:bg-blue-50' : 'hover:bg-blue-500/15'}`}
                    >
                      <ExternalLink className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="flex flex-col">
                        <span>{isEn ? 'Native RDP / PowerShell' : 'تنظیمات mstsc و پاورشل'}</span>
                        <span className="text-[10px] text-blue-400/80 font-mono">Desktop Client & PowerShell</span>
                      </div>
                    </button>
                  </>
                )}

                <div className={`my-1 border-t ${isLightMode ? 'border-slate-200' : 'border-white/10'}`} />

                {/* Restart Server */}
                <button
                  type="button"
                  onClick={() => {
                    const s = menuAnchor.server;
                    setMenuAnchor(null);
                    setPowerModalConfig({ server: s, action: 'restart' });
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-400 hover:text-amber-300 transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/15'}`}
                >
                  <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Restart Server' : 'راه‌اندازی مجدد (ری‌استارت)'}</span>
                    <span className="text-[10px] text-amber-400/80 font-mono">
                      {menuAnchor.server.os_type === 'linux' ? 'Linux (reboot / shutdown -r)' : 'Windows (shutdown /r /t)'}
                    </span>
                  </div>
                </button>

                {/* Shutdown / Power Off Server */}
                <button
                  type="button"
                  onClick={() => {
                    const s = menuAnchor.server;
                    setMenuAnchor(null);
                    setPowerModalConfig({ server: s, action: 'poweroff' });
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/15'}`}
                >
                  <Power className="w-4 h-4 text-rose-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Shutdown / Power Off' : 'خاموش کردن سرور (Shutdown)'}</span>
                    <span className="text-[10px] text-rose-400/80 font-mono">
                      {menuAnchor.server.os_type === 'linux' ? 'Linux (poweroff / shutdown -h)' : 'Windows (shutdown /s /t)'}
                    </span>
                  </div>
                </button>

                {/* Edit Server Properties */}
                <button
                  type="button"
                  onClick={() => handleOpenEdit(menuAnchor.server)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-300 transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${isLightMode ? 'hover:bg-amber-50' : 'hover:bg-amber-500/15'}`}
                >
                  <Edit2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex flex-col">
                    <span>{isEn ? 'Edit Server Properties' : 'ویرایش مشخصات سرور'}</span>
                    <span className="text-[10px] text-amber-400/80 font-mono">Host, IP, Credentials, Tags</span>
                  </div>
                </button>

                {/* Delete Server */}
                <button
                  type="button"
                  onClick={() => {
                    const s = menuAnchor.server;
                    setMenuAnchor(null);
                    setServerToDelete(s);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 transition cursor-pointer ${
                    isEn ? 'text-left' : 'text-right'
                  } ${isLightMode ? 'hover:bg-rose-50' : 'hover:bg-rose-500/20'}`}
                >
                  <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{isEn ? 'Delete Server from Fleet' : 'حذف سرور از ناوگان'}</span>
                </button>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* 10. Delete Confirmation Dialog */}
      {serverToDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            dir={isEn ? 'ltr' : 'rtl'}
          >
            <div
              className={`w-full max-w-md rounded-2xl p-5 border shadow-2xl space-y-4 ${
                isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {isEn ? 'Confirm Server Deletion' : 'تأیید حذف سرور از ناوگان'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {serverToDelete.name} ({serverToDelete.ip})
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {isEn
                  ? 'Are you sure you want to permanently remove this server from the automation fleet? All registered credentials and telemetry associations will be discarded.'
                  : 'آیا از حذف دائمی این سرور از ناوگان اطمینان دارید؟ اطلاعات احراز هویت و ارتباطات پایش این سرور حذف خواهند شد.'}
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setServerToDelete(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                    isLightMode
                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/30 transition cursor-pointer"
                >
                  {isEn ? 'Delete Server' : 'حذف قطعی سرور'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 11. Add / Edit Server Modal */}
      <AddEditServerModal
        isOpen={isAddEditModalOpen}
        serverToEdit={serverToEdit}
        initialServiceMode={addServiceMode}
        onClose={() => {
          setIsAddEditModalOpen(false);
          undockModal('add_edit_remote_server');
        }}
        onMinimize={handleMinimizeAddEdit}
        onSave={handleSaveServer}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12. Linux Terminal Modal (Bash / Zsh) */}
      <LinuxTerminalModal
        isOpen={isTerminalModalOpen}
        server={terminalServer}
        availableServers={servers}
        initialShell={terminalShell}
        sessionPassword={ephemeralTerminalPassword}
        onClose={() => {
          setIsTerminalModalOpen(false);
          setEphemeralTerminalPassword(undefined);
          if (terminalServer) undockModal(`linux_term_${terminalServer.id}`);
          setTerminalServer(null);
        }}
        onMinimize={handleMinimizeLinuxTerminal}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12.5 Linux Live Resource & Telemetry Monitoring Modal */}
      <LinuxServerMonitorModal
        isOpen={isMonitorModalOpen}
        server={monitorServer}
        sessionPassword={ephemeralTerminalPassword}
        onClose={() => {
          setIsMonitorModalOpen(false);
          if (monitorServer) undockModal(`linux_mon_${monitorServer.id}`);
          setMonitorServer(null);
        }}
        onMinimize={handleMinimizeMonitor}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12.6 Linux Remote SFTP File Explorer Modal */}
      <LinuxFileExplorerModal
        isOpen={isFileExplorerModalOpen}
        server={fileExplorerServer}
        sessionPassword={ephemeralTerminalPassword}
        onClose={() => {
          setIsFileExplorerModalOpen(false);
          if (fileExplorerServer) undockModal(`linux_fs_${fileExplorerServer.id}`);
          setFileExplorerServer(null);
        }}
        onMinimize={handleMinimizeFileExplorer}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12.7 Linux Nginx Management Modal */}
      <NginxManagementModal
        isOpen={isNginxModalOpen}
        server={nginxModalServer}
        sessionPassword={ephemeralTerminalPassword}
        onClose={() => {
          setIsNginxModalOpen(false);
          if (nginxModalServer) undockModal(`nginx_mgmt_${nginxModalServer.id}`);
          setNginxModalServer(null);
        }}
        onMinimize={handleMinimizeNginxManagement}
        onOpenTerminal={(s) => {
          handleOpenLinuxTerminal(s, 'bash');
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12.8 Linux Apache Management Modal (Phase 1 Entry Point) */}
      <ApacheManagementModal
        isOpen={isApacheModalOpen}
        server={apacheModalServer}
        onClose={() => {
          setIsApacheModalOpen(false);
          if (apacheModalServer) undockModal(`apache_mgmt_${apacheModalServer.id}`);
          setApacheModalServer(null);
        }}
        onMinimize={handleMinimizeApacheManagement}
        onOpenTerminal={(s) => {
          handleOpenLinuxTerminal(s, 'bash');
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12.9 Linux PostgreSQL Management Modal (Phase 1 Entry Point) */}
      <PostgreSQLManagementModal
        isOpen={isPostgresModalOpen}
        server={postgresModalServer}
        onClose={() => {
          setIsPostgresModalOpen(false);
          if (postgresModalServer) undockModal(`postgres_mgmt_${postgresModalServer.id}`);
          setPostgresModalServer(null);
        }}
        onMinimize={handleMinimizePostgresManagement}
        onOpenTerminal={(s) => {
          handleOpenLinuxTerminal(s, 'bash');
        }}
        onEditServer={(s) => {
          handleOpenEdit(s);
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 12.10 Linux / Remote MySQL / MariaDB Management Modal */}
      <MySQLManagementModal
        isOpen={isMysqlModalOpen}
        server={mysqlModalServer}
        onClose={() => {
          setIsMysqlModalOpen(false);
          if (mysqlModalServer) undockModal(`mysql_mgmt_${mysqlModalServer.id}`);
          setMysqlModalServer(null);
        }}
        onMinimize={handleMinimizeMysqlManagement}
        onOpenTerminal={(s) => {
          handleOpenLinuxTerminal(s, 'bash');
        }}
        onEditServer={(s) => {
          handleOpenEdit(s);
        }}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 13. Windows Remote Connect Modal (RDP / PowerShell) */}
      <WindowsRemoteConnectModal
        isOpen={isWindowsModalOpen}
        server={windowsModalServer}
        onClose={() => {
          setIsWindowsModalOpen(false);
          if (windowsModalServer) undockModal(`win_remote_${windowsModalServer.id}`);
        }}
        onMinimize={handleMinimizeWindowsRemote}
        onLaunchInBrowserRdp={(srv) => handleOpenInBrowserRemote(srv, 'rdp')}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 14. In-Browser Remote Desktop Modal (Guacamole Gateway RDP / VNC) */}
      <InBrowserRemoteDesktopModal
        isOpen={isInBrowserModalOpen}
        server={inBrowserRemoteServer}
        protocol={inBrowserProtocol}
        sessionPassword={ephemeralRdpPassword}
        onClose={() => {
          setIsInBrowserModalOpen(false);
          setEphemeralRdpPassword(undefined);
          if (inBrowserRemoteServer) undockModal(`inbrowser_remote_${inBrowserRemoteServer.id}`);
        }}
        onMinimize={handleMinimizeInBrowserRemote}
        isLightMode={isLightMode}
        isEn={isEn}
      />

      {/* 15. On-Demand Password Prompt Modal (Zero-Storage Policy) */}
      <OnDemandPasswordModal
        isOpen={isOnDemandModalOpen}
        server={onDemandServer}
        target={onDemandTarget}
        isLightMode={isLightMode}
        isEn={isEn}
        onClose={() => {
          setIsOnDemandModalOpen(false);
          if (onDemandServer) undockModal(`ondemand_auth_${onDemandServer.id}`);
          setOnDemandServer(null);
        }}
        onMinimize={handleMinimizeOnDemand}
        onConfirmConnect={(pass) => {
          if (onDemandServer) undockModal(`ondemand_auth_${onDemandServer.id}`);
          handleConfirmOnDemandConnect(pass);
        }}
      />

      {/* 16. Manage Server Categories Modal */}
      <ManageServerCategoriesModal
        isOpen={isCategoriesModalOpen}
        isLightMode={isLightMode}
        isEn={isEn}
        onClose={() => {
          setIsCategoriesModalOpen(false);
          undockModal('manage_server_categories');
        }}
        onMinimize={handleMinimizeCategories}
        onCategoriesChanged={handleCategoriesChanged}
      />

      {/* 17. Bulk Linux Server Configuration Modal */}
      <BulkServerConfigModal
        isOpen={isBulkConfigOpen}
        onClose={() => {
          setIsBulkConfigOpen(false);
          undockModal('bulk_server_config_modal');
        }}
        onMinimize={handleMinimizeBulkConfig}
        isLightMode={isLightMode}
        isEn={isEn}
        allServers={servers}
        initialSelectedServers={servers.filter((s) => selectedServerIds.has(s.id))}
        onServersUpdated={loadFleet}
      />

      {/* 18. Server Restart & Shutdown / Power Confirmation & Scheduling Modal */}
      {powerModalConfig && (
        <RestartServerModal
          server={powerModalConfig.server}
          servers={powerModalConfig.servers}
          initialAction={powerModalConfig.action}
          isLightMode={isLightMode}
          isEn={isEn}
          onClose={() => setPowerModalConfig(null)}
          onSuccess={(msg) => {
            setSuccessNotification(msg);
            loadFleet();
          }}
        />
      )}

      {/* Floating Success Notification Toast */}
      {successNotification &&
        createPortal(
          <div className="fixed bottom-12 right-6 z-[999999] max-w-md p-4 rounded-2xl bg-emerald-950/95 border border-emerald-500/40 text-emerald-100 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs font-medium leading-relaxed">{successNotification}</div>
            <button
              type="button"
              onClick={() => setSuccessNotification(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-emerald-300 ml-auto cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
