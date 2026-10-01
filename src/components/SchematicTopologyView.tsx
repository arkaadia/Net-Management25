import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  Server,
  Router as RouterIcon,
  Wifi,
  MapPin,
  Layers,
  Zap,
  Cable,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Search,
  Filter,
  Eye,
  Info,
  Terminal,
  Move,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Edit2,
  Trash2,
  Box,
  Boxes,
  Map as MapIcon,
  MousePointer,
  CreditCard,
  StickyNote,
  EyeOff,
  Activity,
  Sparkles,
  Radio,
  Globe,
  Lock,
  Users,
  Radar,
} from 'lucide-react';
import {
  TopologyData,
  Device,
  DeviceType,
  DevicePlatform,
  TopologyLink,
  TopologyNode,
  CustomTopologyMap,
  MapVisibility,
  CustomTopologyLink,
  SwitchPort,
  isMikroTikDevice,
  CustomTopologyRack,
  MountedHardwareDevice,
  RackViewMode,
  CustomTopologyStickyNote,
  DeviceCanvasDisplayMode,
  CustomTopologyTower,
  MountedTowerDevice,
  TowerType,
  ThemeType
} from '../types';
import { useLanguage } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { updateDevice } from '../services/api';
import {
  persistDeviceNoteToDatabase,
  deleteDeviceNoteFromDatabase,
  syncDeviceNotesFromDatabase,
  handleDeviceNoteLinkChange,
} from '../services/settingsStorage';
import { CustomMapPortSelectorModal } from './CustomMapPortSelectorModal';
import { CustomMapLinkConfigModal } from './CustomMapLinkConfigModal';
import { CustomMapAddDeviceModal } from './CustomMapAddDeviceModal';
import { useModalDock } from '../context/ModalDockContext';
import { CustomMapManageModal } from './CustomMapManageModal';
import { AddRackModal } from './rack/AddRackModal';
import { EditRackModal } from './rack/EditRackModal';
import { TransferDeviceModal } from './rack/TransferDeviceModal';
import { AddHardwareModal } from './rack/AddHardwareModal';
import { RackElevationInspectorModal } from './rack/RackElevationInspectorModal';
import { RackCabinetSvg } from './rack/RackCabinetSvg';
import { TopologyStickyNote } from './rack/TopologyStickyNote';
import { PhysicalNodeOnCanvas, convertNodeToHardwareDevice } from './rack/PhysicalNodeOnCanvas';
import { DeleteConfirmModal, DeleteTarget } from './DeleteConfirmModal';
import { EditDeviceModal } from './EditDeviceModal';
import { AddTowerModal } from './rack/AddTowerModal';
import { MountRadioOnTowerModal } from './rack/MountRadioOnTowerModal';
import { TowerStructureSvg } from './rack/TowerStructureSvg';
import { NetworkSocketLoader } from './common/NetworkSocketLoader';
import { TopologyDiscoveryModal } from './TopologyDiscoveryModal';

interface SchematicTopologyViewProps {
  topology: TopologyData | null;
  inventoryDevices?: Device[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  onScanCdpLldp: () => void;
  onOpenDiscoveryModal?: () => void;
  isScanning: boolean;
  onInspectDevice: (device: Device) => void;
  onInspectPorts: (device: Device) => void;
  onConnectTerminal?: (device: Device) => void;
  isFullMode?: boolean;
  onToggleFullMode?: () => void;
  panelTheme?: ThemeType;
}

// Helper to separate and curve overlapping parallel cables between devices
function getLinkCurve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  indexInGroup: number,
  totalInGroup: number,
  isReversedDirection: boolean = false
) {
  // If direction is reversed (target -> source), invert index so it matches the spatial slot
  const actualIndex = isReversedDirection ? totalInGroup - 1 - indexInGroup : indexInGroup;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  if (totalInGroup <= 1) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    return {
      pathD: `M ${x1} ${y1} L ${x2} ${y2}`,
      midX: mx,
      midY: my,
      srcTagX: x1 + (x2 - x1) * 0.22,
      srcTagY: y1 + (y2 - y1) * 0.22,
      tgtTagX: x1 + (x2 - x1) * 0.78,
      tgtTagY: y1 + (y2 - y1) * 0.78,
    };
  }

  // Spacing at device endpoints so cables connect to separate physical pins along device edge
  const endpointSpacing = Math.min(22, 120 / Math.max(2, totalInGroup));
  const endpointOffset = (actualIndex - (totalInGroup - 1) / 2) * endpointSpacing;

  const sx = x1 + nx * endpointOffset;
  const sy = y1 + ny * endpointOffset;
  const ex = x2 + nx * endpointOffset;
  const ey = y2 + ny * endpointOffset;

  // Arc spacing along the bezier curve
  const curveSpacing = Math.max(38, 26 + totalInGroup * 10);
  const curveOffset = (actualIndex - (totalInGroup - 1) / 2) * curveSpacing;
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const cx = mx + nx * curveOffset * 1.6;
  const cy = my + ny * curveOffset * 1.6;

  // Quadratic Bezier evaluation: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
  const evalBezier = (t: number) => {
    const inv = 1 - t;
    const px = inv * inv * sx + 2 * inv * t * cx + t * t * ex;
    const py = inv * inv * sy + 2 * inv * t * cy + t * t * ey;
    return { x: px, y: py };
  };

  const mid = evalBezier(0.5);
  const srcTag = evalBezier(0.24);
  const tgtTag = evalBezier(0.76);

  return {
    pathD: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,
    midX: mid.x,
    midY: mid.y,
    srcTagX: srcTag.x,
    srcTagY: srcTag.y,
    tgtTagX: tgtTag.x,
    tgtTagY: tgtTag.y,
  };
}

/**
 * Resolves all identifier aliases for a device across rack mounts, tower mounts, clean IDs, and inventory records.
 */
function getDevicePositionAliases(
  idOrCleanId: string,
  map?: CustomTopologyMap | null,
  availableDevices?: Device[]
): string[] {
  if (!idOrCleanId) return [];
  const cleanId = idOrCleanId.replace(/^hw-/, '').replace(/^radio-/, '');
  const baseCleanId = cleanId.replace(/-\d{10,}$/, '');
  const aliases = new Set<string>([
    idOrCleanId,
    cleanId,
    `hw-${cleanId}`,
    `radio-${cleanId}`,
  ]);
  if (baseCleanId && baseCleanId !== cleanId) {
    aliases.add(baseCleanId);
    aliases.add(`hw-${baseCleanId}`);
    aliases.add(`radio-${baseCleanId}`);
  }

  // Check available devices (by ID, IP, or exact name)
  let targetDevName: string | undefined;
  let targetDevIp: string | undefined;
  if (availableDevices) {
    const matched = availableDevices.find(
      (d) =>
        d.id === idOrCleanId ||
        d.id === cleanId ||
        d.id.replace(/^hw-/, '') === cleanId ||
        d.id.replace(/^radio-/, '') === cleanId
    );
    if (matched) {
      aliases.add(matched.id);
      const mClean = matched.id.replace(/^hw-/, '').replace(/^radio-/, '');
      aliases.add(mClean);
      aliases.add(`hw-${mClean}`);
      if (matched.name) targetDevName = matched.name.trim().toLowerCase();
      if (matched.ip) targetDevIp = matched.ip.trim();
    }
  }

  // Match in racks
  if (map?.racks) {
    map.racks.forEach((rack) => {
      (rack.devices || []).forEach((dev) => {
        const dClean = dev.id.replace(/^hw-/, '');
        const dBase = dClean.replace(/-\d{10,}$/, '');
        const devNameLower = dev.name?.trim().toLowerCase();

        const matchesId =
          dev.id === idOrCleanId ||
          dClean === cleanId ||
          dBase === baseCleanId ||
          dev.id.startsWith(`hw-${cleanId}`);

        const matchesName =
          Boolean(targetDevName) && devNameLower === targetDevName;

        const matchesIp =
          Boolean(targetDevIp) && Boolean(dev.ip) && dev.ip === targetDevIp;

        if (matchesId || matchesName || matchesIp) {
          aliases.add(dev.id);
          aliases.add(dClean);
          aliases.add(`hw-${dClean}`);
          if (dBase) {
            aliases.add(dBase);
            aliases.add(`hw-${dBase}`);
          }
        }
      });
    });
  }

  // Match in towers
  if (map?.towers) {
    map.towers.forEach((tower) => {
      (tower.devices || []).forEach((dev) => {
        const dClean = dev.id.replace(/^radio-/, '');
        const devNameLower = dev.name?.trim().toLowerCase();
        const towerDeviceId = (dev as unknown as { deviceId?: string }).deviceId;

        const matchesId =
          dev.id === idOrCleanId ||
          dClean === cleanId ||
          towerDeviceId === idOrCleanId ||
          towerDeviceId === cleanId;

        const matchesName =
          Boolean(targetDevName) && devNameLower === targetDevName;

        const matchesIp =
          Boolean(targetDevIp) && Boolean(dev.ip) && dev.ip === targetDevIp;

        if (matchesId || matchesName || matchesIp) {
          aliases.add(dev.id);
          aliases.add(dClean);
          if (towerDeviceId) aliases.add(towerDeviceId);
        }
      });
    });
  }

  // Match in map.deviceIds
  if (map?.deviceIds) {
    map.deviceIds.forEach((dId) => {
      const dClean = dId.replace(/^hw-/, '').replace(/^radio-/, '');
      if (dId === idOrCleanId || dClean === cleanId || dClean === baseCleanId) {
        aliases.add(dId);
        aliases.add(dClean);
      }
    });
  }

  return Array.from(aliases).filter(Boolean);
}

/**
 * Resolves the coordinate for a device by checking all known aliases across physical and device position stores.
 */
function resolveDevicePosition(
  id: string,
  map: CustomTopologyMap,
  mode: DeviceCanvasDisplayMode,
  availableDevices?: Device[]
): { x: number; y: number } | undefined {
  const aliases = getDevicePositionAliases(id, map, availableDevices);

  // In Card mode: check devicePositions first. In Physical mode: check physicalPositions first.
  const primaryStore = mode === 'physical' ? map.physicalPositions : map.devicePositions;
  if (primaryStore) {
    for (const a of aliases) {
      const p = primaryStore[a];
      if (p && typeof p.x === 'number' && typeof p.y === 'number') {
        return p;
      }
    }
  }

  // Fallback to secondary store
  const secondaryStore = mode === 'physical' ? map.devicePositions : map.physicalPositions;
  if (secondaryStore) {
    for (const a of aliases) {
      const p = secondaryStore[a];
      if (p && typeof p.x === 'number' && typeof p.y === 'number') {
        return p;
      }
    }
  }

  return undefined;
}

export const SchematicTopologyView: React.FC<SchematicTopologyViewProps> = ({
  topology,
  inventoryDevices = [],
  loading,
  onRefresh,
  onScanCdpLldp,
  onOpenDiscoveryModal,
  isScanning,
  onInspectDevice,
  onInspectPorts,
  onConnectTerminal,
  isFullMode: propIsFullMode,
  onToggleFullMode,
  panelTheme: propPanelTheme,
}) => {
  const { t, isEn, isRtl } = useLanguage();
  const { dockModal, undockModal } = useModalDock();
  let currentUser: any = null;
  try {
    const auth = useAuth();
    currentUser = auth.user;
  } catch (e) {}
  const isLightMode = propPanelTheme === 'light' || (typeof document !== 'undefined' && (
    document.querySelector('.theme-light') !== null ||
    document.documentElement.classList.contains('light') ||
    localStorage.getItem('panel_theme') === 'light' ||
    localStorage.getItem('theme_mode') === 'light'
  ));
  const [viewMode, setViewMode] = useState<'schematic' | 'physical'>('schematic');

  // Viewport zoom and pan with LocalStorage persistence
  const [zoom, setZoom] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('net_topology_viewport');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.zoom === 'number') return parsed.zoom;
      }
    } catch (e) {}
    return 1;
  });

  const [pan, setPan] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('net_topology_viewport');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.pan && typeof parsed.pan.x === 'number') return parsed.pan;
      }
    } catch (e) {}
    return { x: 0, y: 0 };
  });

  // Custom node positions with LocalStorage persistence
  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    try {
      const saved = localStorage.getItem('net_topology_node_positions');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {}
    return {};
  });

  const [hasSavedPositions, setHasSavedPositions] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('net_topology_node_positions');
    } catch (e) {
      return false;
    }
  });

  const [isRefreshingView, setIsRefreshingView] = useState(false);

  // Dragging states
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragNodeOffset = useRef<{ offsetX: number; offsetY: number; startClientX: number; startClientY: number; moved: boolean }>({
    offsetX: 0,
    offsetY: 0,
    startClientX: 0,
    startClientY: 0,
    moved: false,
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterBuilding, setFilterBuilding] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPortLabels, setShowPortLabels] = useState(true);
  const [showTrafficAnimation, setShowTrafficAnimation] = useState(true);
  const [internalFullMode, setInternalFullMode] = useState(false);
  const isFullMode = propIsFullMode !== undefined ? propIsFullMode : internalFullMode;
  const [showToolbarInFullMode, setShowToolbarInFullMode] = useState(false);
  const [isSecondaryToolbarCollapsed, setIsSecondaryToolbarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nettopology_schematic_toolbar_collapsed') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  // Storage keys for custom topology maps persistence
  const CUSTOM_MAPS_STORAGE_KEY = 'nettopology_custom_maps_v2';
  const ACTIVE_MAP_STORAGE_KEY = 'nettopology_active_map_id_v2';

  const [customMaps, setCustomMaps] = useState<CustomTopologyMap[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_MAPS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  const [activeMapId, setActiveMapId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_MAP_STORAGE_KEY);
      if (saved) return saved;
    } catch (e) {}
    return 'default';
  });

  const currentCustomMap = useMemo(() => {
    if (activeMapId === 'default') return null;
    return customMaps.find((m) => m.id === activeMapId) || null;
  }, [customMaps, activeMapId]);

  const [defaultStickyNotes, setDefaultStickyNotes] = useState<CustomTopologyStickyNote[]>(() => {
    const map = new Map<string, CustomTopologyStickyNote>();
    try {
      const saved = localStorage.getItem('nettopology_default_sticky_notes_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((n) => {
            if (n && n.id) map.set(n.id, n);
          });
        }
      }
    } catch (e) {}

    // Merge notes saved from Device List / Inventory
    try {
      const devSaved = localStorage.getItem('nettopology_device_sticky_notes_v1');
      if (devSaved) {
        const devNotes = JSON.parse(devSaved);
        if (Array.isArray(devNotes)) {
          devNotes.forEach((n: CustomTopologyStickyNote) => {
            if (n && n.id) {
              const existing = map.get(n.id);
              if (!existing) {
                map.set(n.id, n);
              } else {
                map.set(n.id, { ...existing, ...n });
              }
            }
          });
        }
      }
    } catch (e) {}

    return Array.from(map.values());
  });

  // Tombstone tracking to permanently prevent deleted notes from resurrecting via sync or background events
  const deletedNoteIdsRef = useRef<Set<string>>(new Set<string>());
  const deletedDeviceIdsRef = useRef<Set<string>>(new Set<string>());

  // Hydrate tombstones from sessionStorage
  useEffect(() => {
    try {
      const storedNotes = sessionStorage.getItem('nettopology_deleted_notes_tombstone');
      if (storedNotes) {
        const parsed = JSON.parse(storedNotes);
        if (Array.isArray(parsed)) {
          parsed.forEach((id: string) => deletedNoteIdsRef.current.add(id));
        }
      }
      const storedDevs = sessionStorage.getItem('nettopology_deleted_devices_tombstone');
      if (storedDevs) {
        const parsed = JSON.parse(storedDevs);
        if (Array.isArray(parsed)) {
          parsed.forEach((id: string) => deletedDeviceIdsRef.current.add(id));
        }
      }
    } catch (e) {}
  }, []);

  const isTombstoned = useCallback((noteId?: string, deviceId?: string): boolean => {
    if (noteId && deletedNoteIdsRef.current.has(noteId)) return true;
    if (deviceId) {
      const clean = deviceId.replace(/^hw-/, '');
      // Check if this device currently has an active note in local storage
      try {
        const raw = localStorage.getItem('nettopology_device_sticky_notes_v1');
        if (raw) {
          const notes = JSON.parse(raw);
          if (Array.isArray(notes)) {
            const hasActive = notes.some(
              (n: any) =>
                n &&
                n.linkedDeviceId &&
                (n.linkedDeviceId === deviceId ||
                  n.linkedDeviceId === clean ||
                  n.linkedDeviceId === 'hw-' + clean) &&
                (!noteId || n.id === noteId || !deletedNoteIdsRef.current.has(n.id))
            );
            if (hasActive) {
              deletedDeviceIdsRef.current.delete(deviceId);
              deletedDeviceIdsRef.current.delete(clean);
              deletedDeviceIdsRef.current.delete('hw-' + clean);
              return false;
            }
          }
        }
      } catch (e) {}

      if (
        deletedDeviceIdsRef.current.has(deviceId) ||
        deletedDeviceIdsRef.current.has(clean) ||
        deletedDeviceIdsRef.current.has('hw-' + clean)
      ) {
        return true;
      }
    }
    return false;
  }, []);

  const activeStickyNotes = useMemo(() => {
    if (currentCustomMap) {
      return (currentCustomMap.stickyNotes || []).filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId));
    }
    return defaultStickyNotes.filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId));
  }, [currentCustomMap, defaultStickyNotes, isTombstoned]);

  const [activeTool, setActiveTool] = useState<'select' | 'cable'>('select');

  // Interactive Cabling Workflow State
  interface CableWorkflowState {
    step: 'idle' | 'select_source_port' | 'select_target_device' | 'select_target_port' | 'configure_link';
    sourceDevice: Device | null;
    sourcePort: string | null;
    sourceInitialPortData?: SwitchPort;
    targetDevice: Device | null;
    targetPort: string | null;
    targetInitialPortData?: SwitchPort;
    editingLink?: CustomTopologyLink | null;
  }

  const [cableWorkflow, setCableWorkflow] = useState<CableWorkflowState>({
    step: 'idle',
    sourceDevice: null,
    sourcePort: null,
    targetDevice: null,
    targetPort: null,
  });

  // Modal Dialog Open States
  const [isPortSelectorOpen, setIsPortSelectorOpen] = useState(false);
  const [isLinkConfigOpen, setIsLinkConfigOpen] = useState(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [isManageMapOpen, setIsManageMapOpen] = useState(false);
  const [manageMapMode, setManageMapMode] = useState<'create' | 'edit' | 'delete'>('create');
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<CustomTopologyLink | null>(null);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);

  // Rack & Hardware Studio States
  const [isAddRackOpen, setIsAddRackOpen] = useState(false);
  const [editingRack, setEditingRack] = useState<CustomTopologyRack | null>(null);
  const [transferDeviceTarget, setTransferDeviceTarget] = useState<{
    device: MountedHardwareDevice;
    sourceRack: CustomTopologyRack;
  } | null>(null);
  const [isAddHardwareOpen, setIsAddHardwareOpen] = useState(false);
  const [selectedRackForHardware, setSelectedRackForHardware] = useState<string | undefined>(undefined);
  const [targetUForHardware, setTargetUForHardware] = useState<number | undefined>(undefined);
  const [editingHardwareDevice, setEditingHardwareDevice] = useState<MountedHardwareDevice | null>(null);
  const [editingInventoryDevice, setEditingInventoryDevice] = useState<Device | null>(null);
  const [inspectingRack, setInspectingRack] = useState<CustomTopologyRack | null>(null);
  const [inspectingRackId, setInspectingRackId] = useState<string | null>(null);
  const activeInspectingRack = inspectingRackId
    ? (currentCustomMap?.racks || []).find((r) => r.id === inspectingRackId) || inspectingRack
    : inspectingRack;
  const [draggingRackId, setDraggingRackId] = useState<string | null>(null);
  const dragRackOffset = useRef({ offsetX: 0, offsetY: 0, startClientX: 0, startClientY: 0, moved: false });

  // Telecom Tower & Mast States
  const [isAddTowerOpen, setIsAddTowerOpen] = useState(false);
  const [editingTower, setEditingTower] = useState<CustomTopologyTower | null>(null);
  const [isMountRadioOpen, setIsMountRadioOpen] = useState(false);
  const [mountRadioTargetTowerId, setMountRadioTargetTowerId] = useState<string | null>(null);
  const [editingRadioDevice, setEditingRadioDevice] = useState<MountedTowerDevice | null>(null);
  const [draggingTowerId, setDraggingTowerId] = useState<string | null>(null);
  const dragTowerOffset = useRef({ offsetX: 0, offsetY: 0, startClientX: 0, startClientY: 0, moved: false });

  // Deletion Confirmation Modal State
  const [deleteModalTarget, setDeleteModalTarget] = useState<DeleteTarget | null>(null);

  // Active hover tracking for topmost z-index layering on canvas
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Global & Per-Device display modes ('card' | 'physical')
  const [globalDeviceViewMode, setGlobalDeviceViewModeState] = useState<DeviceCanvasDisplayMode>(() => {
    try {
      const saved = localStorage.getItem('net_topology_device_view_mode');
      if (saved === 'physical' || saved === 'card') return saved;
    } catch (e) {}
    return 'card';
  });

  const setGlobalDeviceViewMode = useCallback((mode: DeviceCanvasDisplayMode) => {
    setGlobalDeviceViewModeState(mode);
    try {
      localStorage.setItem('net_topology_device_view_mode', mode);
    } catch (e) {}
  }, []);

  // Neon highlight state for 3-second animated identification when switching from physical to card mode
  interface NeonHighlightState {
    nodeId: string;
    rawId: string;
    targetName?: string;
    targetIp?: string;
    matchedAliases: string[];
    colorHex: string;
    colorRgb: string;
    colorName?: string;
  }
  const [neonHighlightedNode, setNeonHighlightedNode] = useState<NeonHighlightState | null>(null);
  const neonHighlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Vibrant neon color palette with high-contrast glowing values
  const NEON_PALETTE = useMemo(
    () => [
      { hex: '#00f3ff', rgb: '0, 243, 255', name: 'Cyan Neon' },
      { hex: '#39ff14', rgb: '57, 255, 20', name: 'Lime Neon' },
      { hex: '#ff007f', rgb: '255, 0, 127', name: 'Magenta Neon' },
      { hex: '#b026ff', rgb: '176, 38, 255', name: 'Electric Violet' },
      { hex: '#ff9900', rgb: '255, 153, 0', name: 'Amber Neon' },
      { hex: '#00ffd5', rgb: '0, 255, 213', name: 'Turquoise Neon' },
      { hex: '#ff1361', rgb: '255, 19, 97', name: 'Hot Rose' },
      { hex: '#ffee00', rgb: '255, 238, 0', name: 'Vivid Yellow' },
      { hex: '#0099ff', rgb: '0, 153, 255', name: 'Electric Blue' },
      { hex: '#ff4d00', rgb: '255, 77, 0', name: 'Plasma Orange' },
    ],
    []
  );

  const triggerCardNeonHighlight = useCallback(
    (targetDeviceId: string, deviceMeta?: { name?: string; ip?: string; aliases?: string[] }) => {
      const cleanId = (targetDeviceId || '').replace(/^hw-/, '');
      const rawId = targetDeviceId || '';
      const aliases = new Set<string>();
      if (rawId) aliases.add(rawId);
      if (cleanId) {
        aliases.add(cleanId);
        aliases.add(`hw-${cleanId}`);
      }
      if (deviceMeta?.aliases) {
        deviceMeta.aliases.forEach((a) => {
          if (a) {
            aliases.add(a);
            aliases.add(a.replace(/^hw-/, ''));
            aliases.add(`hw-${a.replace(/^hw-/, '')}`);
          }
        });
      }

      const randomColor = NEON_PALETTE[Math.floor(Math.random() * NEON_PALETTE.length)];

      if (neonHighlightTimerRef.current) {
        clearTimeout(neonHighlightTimerRef.current);
      }

      setNeonHighlightedNode({
        nodeId: cleanId,
        rawId,
        targetName: deviceMeta?.name ? deviceMeta.name.trim().toLowerCase() : undefined,
        targetIp: deviceMeta?.ip ? deviceMeta.ip.trim() : undefined,
        matchedAliases: Array.from(aliases),
        colorHex: randomColor.hex,
        colorRgb: randomColor.rgb,
        colorName: randomColor.name,
      });

      // Exactly 3 seconds (3000ms) highlight duration
      neonHighlightTimerRef.current = setTimeout(() => {
        setNeonHighlightedNode(null);
      }, 3000);
    },
    [NEON_PALETTE]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (neonHighlightTimerRef.current) {
        clearTimeout(neonHighlightTimerRef.current);
      }
    };
  }, []);

  // Sticky Notes States
  const [showStickyNotes, setShowStickyNotes] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nettopology_show_sticky_notes');
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      return true;
    }
  });

  const toggleShowStickyNotes = useCallback(() => {
    setShowStickyNotes((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('nettopology_show_sticky_notes', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const dragNoteOffset = useRef({ offsetX: 0, offsetY: 0, startClientX: 0, startClientY: 0, moved: false });
  const dragNodeLatestCoords = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRackLatestCoords = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragTowerLatestCoords = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragNoteLatestCoords = useRef<{ id: string; x: number; y: number } | null>(null);

  const saveCustomMaps = useCallback((maps: CustomTopologyMap[]) => {
    setCustomMaps(maps);
    try {
      localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(maps));
      const token =
        localStorage.getItem('nettopology_auth_token_v1') ||
        sessionStorage.getItem('nettopology_auth_token_v1');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch('/api/settings/maps', {
        method: 'POST',
        headers,
        body: JSON.stringify({ maps }),
      }).catch(() => {});
    } catch (e) {}
  }, []);

  const getDeviceDisplayMode = useCallback((_deviceId: string): DeviceCanvasDisplayMode => {
    return globalDeviceViewMode;
  }, [globalDeviceViewMode]);

  const handleToggleDeviceDisplayMode = useCallback((_deviceId: string) => {
    const next: DeviceCanvasDisplayMode = globalDeviceViewMode === 'card' ? 'physical' : 'card';
    setGlobalDeviceViewMode(next);
  }, [globalDeviceViewMode, setGlobalDeviceViewMode]);

  // Mount an existing canvas node into a rack
  const handleMountCanvasNodeToRack = useCallback((node: TopologyNode, rackId: string, startU: number) => {
    if (!currentCustomMap) return;
    const targetRack = (currentCustomMap.racks || []).find((r) => r.id === rackId);
    if (!targetRack) return;

    const hwDevice = convertNodeToHardwareDevice(node, rackId, startU);

    const endU = startU + hwDevice.heightU - 1;
    const hasCollision = targetRack.devices.some((other) => {
      const oEnd = other.startU + other.heightU - 1;
      return Math.max(startU, other.startU) <= Math.min(endU, oEnd);
    });
    if (hasCollision) return;

    const newDevices = [
      ...targetRack.devices.filter((d) => d.label !== node.name && d.id !== `hw-${node.id}`),
      hwDevice,
    ];

    const updatedRacks = (currentCustomMap.racks || []).map((r) =>
      r.id === rackId ? { ...r, devices: newDevices } : r
    );

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      racks: updatedRacks,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
  }, [currentCustomMap, customMaps, saveCustomMaps]);

  // Topology Discovery (CDP / LLDP) Apply Handler
  const handleApplyDiscoveredLinksAndDevices = useCallback(
    (
      newLinks: CustomTopologyLink[],
      newDevs: { id: string; name: string; ip: string; model: string; type: string }[],
      targetMapId: string
    ) => {
      const targetMap =
        customMaps.find((m) => m.id === targetMapId) ||
        currentCustomMap ||
        customMaps[0];

      if (!targetMap) {
        onRefresh();
        return;
      }

      // Deduplicate and merge links
      const existingLinks = targetMap.links || [];
      const mergedLinks = [...existingLinks];
      for (const nl of newLinks) {
        const alreadyExists = mergedLinks.some(
          (el) =>
            (el.sourceDeviceId === nl.sourceDeviceId &&
              el.targetDeviceId === nl.targetDeviceId &&
              el.sourcePort === nl.sourcePort &&
              el.targetPort === nl.targetPort) ||
            (el.sourceDeviceId === nl.targetDeviceId &&
              el.targetDeviceId === nl.sourceDeviceId &&
              el.sourcePort === nl.targetPort &&
              el.targetPort === nl.sourcePort)
        );
        if (!alreadyExists) {
          mergedLinks.push(nl);
        }
      }

      // Merge new device IDs and position them cleanly on canvas
      const existingDeviceIds = targetMap.deviceIds || [];
      const mergedDeviceIds = [...existingDeviceIds];
      const updatedPositions = { ...(targetMap.devicePositions || {}) };

      let startX = 200;
      let startY = 300;
      for (const dev of newDevs) {
        if (!mergedDeviceIds.includes(dev.id)) {
          mergedDeviceIds.push(dev.id);
          if (!updatedPositions[dev.id]) {
            updatedPositions[dev.id] = { x: startX, y: startY };
            startX += 140;
            if (startX > 800) {
              startX = 200;
              startY += 130;
            }
          }
        }
      }

      const updatedMap: CustomTopologyMap = {
        ...targetMap,
        links: mergedLinks,
        deviceIds: mergedDeviceIds,
        devicePositions: updatedPositions,
        updatedAt: new Date().toISOString(),
      };

      saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
      onRefresh();
    },
    [currentCustomMap, customMaps, saveCustomMaps, onRefresh]
  );

  // Sticky Notes Handlers
  const handleAddStickyNote = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const centerX = rect ? Math.round((-pan.x + rect.width / 2 - 115) / zoom) : 250;
    const centerY = rect ? Math.round((-pan.y + rect.height / 2 - 80) / zoom) : 200;

    const newNoteId = `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    deletedNoteIdsRef.current.delete(newNoteId);

    const newNote: CustomTopologyStickyNote = {
      id: newNoteId,
      x: centerX,
      y: centerY,
      width: 230,
      title: '',
      content: '',
      color: 'yellow',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewMode: globalDeviceViewMode,
    };

    if (currentCustomMap) {
      const updatedMap: CustomTopologyMap = {
        ...currentCustomMap,
        stickyNotes: [...(currentCustomMap.stickyNotes || []).filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId)), newNote],
        updatedAt: new Date().toISOString(),
      };
      saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    } else {
      setDefaultStickyNotes((prev) => {
        const updated = [...prev.filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId)), newNote];
        try {
          localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }
  }, [currentCustomMap, customMaps, pan.x, pan.y, zoom, saveCustomMaps, globalDeviceViewMode, isTombstoned]);

  const handleUpdateStickyNote = useCallback((updatedNote: CustomTopologyStickyNote) => {
    // If note or device was deleted, do not re-add or update
    if (isTombstoned(updatedNote.id, updatedNote.linkedDeviceId)) {
      return;
    }

    // Determine previous note to detect any changes in device linkage (unlink or reassign)
    const allExistingNotes = [
      ...defaultStickyNotes,
      ...(currentCustomMap ? (currentCustomMap.stickyNotes || []) : []),
      ...customMaps.flatMap((m) => m.stickyNotes || []),
    ];
    const prevNote = allExistingNotes.find((n) => n && n.id === updatedNote.id);
    const oldDeviceId = prevNote?.linkedDeviceId;
    const newDeviceId = updatedNote.linkedDeviceId;

    if (currentCustomMap) {
      const updatedNotes = (currentCustomMap.stickyNotes || [])
        .filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId))
        .map((n) => (n.id === updatedNote.id ? updatedNote : n));
      const updatedMap: CustomTopologyMap = {
        ...currentCustomMap,
        stickyNotes: updatedNotes,
        updatedAt: new Date().toISOString(),
      };
      saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    } else {
      setDefaultStickyNotes((prev) => {
        const updated = prev
          .filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId))
          .map((n) => (n.id === updatedNote.id ? updatedNote : n));
        try {
          localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }

    // If device link has changed (unlinked or moved to another device)
    if (oldDeviceId !== newDeviceId) {
      handleDeviceNoteLinkChange(updatedNote.id, oldDeviceId, newDeviceId, updatedNote).catch(() => {});
    } else if (newDeviceId) {
      // If still linked to the same device, update title/content/color
      persistDeviceNoteToDatabase(updatedNote).catch(() => {});
    }
  }, [currentCustomMap, customMaps, defaultStickyNotes, saveCustomMaps, isTombstoned]);

  const handleDeleteStickyNote = useCallback((noteId: string) => {
    // 1. Locate the note across currentCustomMap or defaultStickyNotes
    const allNotes = [
      ...defaultStickyNotes,
      ...(currentCustomMap ? (currentCustomMap.stickyNotes || []) : []),
      ...customMaps.flatMap((m) => m.stickyNotes || []),
    ];
    const noteToDelete = allNotes.find((n) => n.id === noteId);
    const linkedDevId = noteToDelete?.linkedDeviceId;
    const cleanDevId = linkedDevId?.replace(/^hw-/, '');
    const hwDevId = cleanDevId ? 'hw-' + cleanDevId : undefined;

    const matchesTarget = (sn: CustomTopologyStickyNote) => {
      if (!sn) return false;
      if (sn.id === noteId) return true;
      if (linkedDevId && (sn.linkedDeviceId === linkedDevId || sn.linkedDeviceId === cleanDevId || sn.linkedDeviceId === hwDevId)) {
        return true;
      }
      return false;
    };

    // 2. Register in tombstones
    deletedNoteIdsRef.current.add(noteId);
    if (linkedDevId) {
      deletedDeviceIdsRef.current.add(linkedDevId);
      if (cleanDevId) deletedDeviceIdsRef.current.add(cleanDevId);
      if (hwDevId) deletedDeviceIdsRef.current.add(hwDevId);
    }

    try {
      const notesTombstones = Array.from(deletedNoteIdsRef.current);
      sessionStorage.setItem('nettopology_deleted_notes_tombstone', JSON.stringify(notesTombstones));
      const devsTombstones = Array.from(deletedDeviceIdsRef.current);
      sessionStorage.setItem('nettopology_deleted_devices_tombstone', JSON.stringify(devsTombstones));
    } catch (e) {}

    // 3. Remove immediately from defaultStickyNotes
    setDefaultStickyNotes((prev) => {
      const updated = prev.filter((n) => !matchesTarget(n));
      try {
        localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // 4. Remove immediately from all custom maps and persist
    const updatedMaps = customMaps.map((m) => ({
      ...m,
      stickyNotes: (m.stickyNotes || []).filter((n) => !matchesTarget(n)),
      updatedAt: new Date().toISOString(),
    }));
    setCustomMaps(updatedMaps);
    saveCustomMaps(updatedMaps);

    // 5. Always delete from database and local storage via deleteDeviceNoteFromDatabase
    deleteDeviceNoteFromDatabase(noteId, linkedDevId).catch((err) => {
      console.warn('[Delete Device Note Error]', err);
    });

    // 6. Close delete modal if open
    setDeleteModalTarget(null);

    // 7. Visual toast feedback
    setFeedbackToast({
      type: 'success',
      message: isEn ? 'Sticky note deleted successfully' : 'یادداشت با موفقیت حذف شد',
    });
  }, [currentCustomMap, customMaps, defaultStickyNotes, saveCustomMaps, isEn]);

  const handleStickyNoteStartDrag = useCallback((e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
    const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

    const notes = currentCustomMap ? (currentCustomMap.stickyNotes || []) : defaultStickyNotes;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    dragNoteOffset.current = {
      offsetX: worldMouseX - note.x,
      offsetY: worldMouseY - note.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
    setDraggingNoteId(noteId);
  }, [currentCustomMap, defaultStickyNotes, pan.x, pan.y, zoom]);

  // Rack Handlers
  const handleCreateCustomMapRack = useCallback((rackData: Omit<CustomTopologyRack, 'id' | 'devices' | 'x' | 'y'>) => {
    if (!currentCustomMap) return;
    const existingRacks = currentCustomMap.racks || [];

    // Check duplicate rack name
    if (existingRacks.some((r) => r.name.trim().toLowerCase() === rackData.name.trim().toLowerCase())) {
      setFeedbackToast({
        type: 'error',
        message: isEn
          ? `A rack named "${rackData.name}" already exists`
          : `رکی با نام «${rackData.name}» از قبل وجود دارد`,
      });
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

    const startX = Math.round((-pan.x + 350 + existingRacks.length * 420) / zoom);
    const startY = Math.round((-pan.y + 150) / zoom);

    const newRack: CustomTopologyRack = {
      ...rackData,
      id: `rack-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      x: Math.max(50, startX),
      y: Math.max(50, startY),
      devices: [],
    };

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      racks: [...existingRacks, newRack],
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    // Auto-switch view to physical mode so user immediately sees the newly created rack
    setGlobalDeviceViewMode('physical');
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Rack "${newRack.name}" added` : `رک «${newRack.name}» افزوده شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  }, [currentCustomMap, customMaps, pan.x, pan.y, zoom, isEn, saveCustomMaps]);

  // Tower Handlers
  const handleCreateCustomMapTower = useCallback((towerData: Omit<CustomTopologyTower, 'id' | 'devices' | 'x' | 'y'>) => {
    if (!currentCustomMap) return;
    const existingTowers = currentCustomMap.towers || [];

    if (existingTowers.some((t) => t.name.trim().toLowerCase() === towerData.name.trim().toLowerCase())) {
      setFeedbackToast({
        type: 'error',
        message: isEn
          ? `A tower named "${towerData.name}" already exists`
          : `دکلی با نام «${towerData.name}» از قبل وجود دارد`,
      });
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

    const startX = Math.round((-pan.x + 400 + existingTowers.length * 350) / zoom);
    const startY = Math.round((-pan.y + 120) / zoom);

    const newTower: CustomTopologyTower = {
      ...towerData,
      id: `tower-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      x: Math.max(50, startX),
      y: Math.max(50, startY),
      devices: [],
    };

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      towers: [...existingTowers, newTower],
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    setGlobalDeviceViewMode('physical'); // Auto-switch to physical view!
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Telecom tower "${newTower.name}" added` : `دکل مخابراتی «${newTower.name}» افزوده شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  }, [currentCustomMap, customMaps, pan.x, pan.y, zoom, isEn, saveCustomMaps]);

  const handleSaveTower = useCallback((towerData: CustomTopologyTower) => {
    if (!currentCustomMap) return;
    const updatedTowers = (currentCustomMap.towers || []).map((t) =>
      t.id === towerData.id ? towerData : t
    );
    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      towers: updatedTowers,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Tower "${towerData.name}" updated` : `مشخصات دکل «${towerData.name}» به‌روزرسانی شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  }, [currentCustomMap, customMaps, isEn, saveCustomMaps]);

  const handleDeleteTower = useCallback((towerId: string) => {
    if (!currentCustomMap) return;
    const targetTower = (currentCustomMap.towers || []).find((t) => t.id === towerId);
    if (!targetTower) return;

    const isConfirmed = window.confirm(
      isEn
        ? `Are you sure you want to delete tower "${targetTower.name}" and its mounted radios?`
        : `آیا از حذف دکل مخابراتی «${targetTower.name}» و رادیوهای متصل به آن اطمینان دارید؟`
    );
    if (!isConfirmed) return;

    const updatedTowers = (currentCustomMap.towers || []).filter((t) => t.id !== towerId);
    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      towers: updatedTowers,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    setFeedbackToast({
      type: 'info',
      message: isEn ? `Tower "${targetTower.name}" deleted` : `دکل مخابراتی «${targetTower.name}» حذف شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  }, [currentCustomMap, customMaps, isEn, saveCustomMaps]);

  const handleOpenMountRadio = useCallback((towerId: string, deviceToEdit?: MountedTowerDevice) => {
    setMountRadioTargetTowerId(towerId);
    setEditingRadioDevice(deviceToEdit || null);
    setIsMountRadioOpen(true);
  }, []);

  const handleSaveRadioOnTower = useCallback((towerId: string, radioDevice: MountedTowerDevice) => {
    if (!currentCustomMap) return;
    const updatedTowers = (currentCustomMap.towers || []).map((t) => {
      if (t.id !== towerId) return t;
      const existingDevs = t.devices || [];
      const existsIndex = existingDevs.findIndex((d) => d.id === radioDevice.id);
      let newDevs;
      if (existsIndex >= 0) {
        newDevs = existingDevs.map((d, i) => (i === existsIndex ? radioDevice : d));
      } else {
        newDevs = [...existingDevs, radioDevice];
      }
      return { ...t, devices: newDevs };
    });

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      towers: updatedTowers,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    setIsMountRadioOpen(false);
    setEditingRadioDevice(null);
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Radio device "${radioDevice.name}" mounted on tower` : `رادیو/آنتن «${radioDevice.name}» روی دکل نصب شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  }, [currentCustomMap, customMaps, isEn, saveCustomMaps]);

  const handleDeleteRadioFromTower = useCallback((towerId: string, radioDeviceId: string) => {
    if (!currentCustomMap) return;
    const updatedTowers = (currentCustomMap.towers || []).map((t) => {
      if (t.id !== towerId) return t;
      return {
        ...t,
        devices: (t.devices || []).filter((d) => d.id !== radioDeviceId),
      };
    });

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      towers: updatedTowers,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    setFeedbackToast({
      type: 'info',
      message: isEn ? `Device removed from tower` : `تجهیز از روی دکل حذف شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  }, [currentCustomMap, customMaps, isEn, saveCustomMaps]);

  const handleSaveRack = useCallback(
    (updatedRack: CustomTopologyRack) => {
      if (!currentCustomMap) return;
      const updatedRacks = (currentCustomMap.racks || []).map((r) =>
        r.id === updatedRack.id ? updatedRack : r
      );

      const updatedMap: CustomTopologyMap = {
        ...currentCustomMap,
        racks: updatedRacks,
        updatedAt: new Date().toISOString(),
      };
      saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));

      if (inspectingRack && inspectingRack.id === updatedRack.id) {
        setInspectingRack(updatedRack);
      }

      setFeedbackToast({
        type: 'success',
        message: isEn
          ? `Rack "${updatedRack.name}" updated successfully`
          : `مشخصات رک «${updatedRack.name}» با موفقیت به‌روزرسانی شد`,
      });
      setTimeout(() => setFeedbackToast(null), 3000);
    },
    [currentCustomMap, customMaps, inspectingRack, isEn, saveCustomMaps]
  );

  const handleTransferDevice = useCallback(
    (sourceRackId: string, targetRackId: string, deviceId: string, targetStartU: number) => {
      if (!currentCustomMap) return;
      const racks = currentCustomMap.racks || [];
      const sourceRack = racks.find((r) => r.id === sourceRackId);
      const targetRack = racks.find((r) => r.id === targetRackId);
      if (!sourceRack || !targetRack) return;

      const device = sourceRack.devices.find((d) => d.id === deviceId);
      if (!device) return;

      const transferredDevice: MountedHardwareDevice = {
        ...device,
        startU: targetStartU,
      };

      const updatedRacks = racks.map((r) => {
        if (r.id === sourceRackId) {
          return {
            ...r,
            devices: r.devices.filter((d) => d.id !== deviceId),
          };
        }
        if (r.id === targetRackId) {
          return {
            ...r,
            devices: [...r.devices, transferredDevice],
          };
        }
        return r;
      });

      const updatedMap: CustomTopologyMap = {
        ...currentCustomMap,
        racks: updatedRacks,
        updatedAt: new Date().toISOString(),
      };
      saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));

      if (inspectingRack) {
        const found = updatedRacks.find((r) => r.id === inspectingRack.id);
        if (found) setInspectingRack(found);
      }

      setFeedbackToast({
        type: 'success',
        message: isEn
          ? `Device "${device.name}" transferred to ${targetRack.name} (U${targetStartU})`
          : `تجهیز «${device.name}» با موفقیت به رک «${targetRack.name}» (یونیت U${targetStartU}) منتقل شد`,
      });
      setTimeout(() => setFeedbackToast(null), 3500);
    },
    [currentCustomMap, customMaps, inspectingRack, isEn, saveCustomMaps]
  );

  const handleToggleRackViewMode = useCallback((rackId: string, newMode: RackViewMode) => {
    if (!currentCustomMap) return;
    const updatedRacks = (currentCustomMap.racks || []).map((r) =>
      r.id === rackId ? { ...r, viewMode: newMode } : r
    );
    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      racks: updatedRacks,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    if (inspectingRack && inspectingRack.id === rackId) {
      setInspectingRack({ ...inspectingRack, viewMode: newMode });
    }
  }, [currentCustomMap, customMaps, inspectingRack, saveCustomMaps]);

  const handleDeleteRack = useCallback((rackId: string) => {
    if (!currentCustomMap) return;
    const targetRack = currentCustomMap.racks?.find((r) => r.id === rackId);
    if (!targetRack) return;

    // Open safe delete confirmation modal
    setDeleteModalTarget({
      type: 'rack',
      id: targetRack.id,
      name: targetRack.name,
      units: targetRack.units,
      devices: targetRack.devices || [],
    });
  }, [currentCustomMap]);

  const handlePromptDeleteRack = useCallback((rackId: string) => {
    handleDeleteRack(rackId);
  }, [handleDeleteRack]);

  const handlePromptDeleteDevice = useCallback((node: TopologyNode) => {
    setDeleteModalTarget({
      type: 'device',
      id: node.id,
      name: node.name,
      ip: node.ip,
      role: node.role,
      model: node.model,
    });
  }, []);

  const handleConfirmDeleteRack = useCallback((rackId: string, deleteMountedDevices: boolean) => {
    if (!currentCustomMap) return;
    const targetRack = currentCustomMap.racks?.find((r) => r.id === rackId);
    if (!targetRack) return;

    let updatedDeviceIds = [...(currentCustomMap.deviceIds || [])];
    let updatedPositions = { ...(currentCustomMap.devicePositions || {}) };
    let updatedLinks = [...(currentCustomMap.links || [])];

    if (deleteMountedDevices) {
      const rackDeviceIds = new Set<string>();
      (targetRack.devices || []).forEach((d) => {
        rackDeviceIds.add(d.id);
        rackDeviceIds.add(d.id.replace(/^hw-/, ''));
      });

      updatedDeviceIds = updatedDeviceIds.filter((id) => !rackDeviceIds.has(id));
      updatedLinks = updatedLinks.filter(
        (l) => !rackDeviceIds.has(l.sourceDeviceId) && !rackDeviceIds.has(l.targetDeviceId)
      );
      rackDeviceIds.forEach((id) => {
        delete updatedPositions[id];
      });
    } else {
      // Keep devices in map as canvas devices
      (targetRack.devices || []).forEach((dev, idx) => {
        const origId = dev.id.replace(/^hw-/, '');
        if (!updatedDeviceIds.includes(origId)) {
          updatedDeviceIds.push(origId);
        }
        if (!updatedPositions[origId]) {
          updatedPositions[origId] = {
            x: targetRack.x + 460 + (idx % 2) * 260,
            y: targetRack.y + Math.floor(idx / 2) * 160,
          };
        }
      });
    }

    const updatedRacks = (currentCustomMap.racks || []).filter((r) => r.id !== rackId);
    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      racks: updatedRacks,
      deviceIds: updatedDeviceIds,
      devicePositions: updatedPositions,
      links: updatedLinks,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    if (inspectingRack && inspectingRack.id === rackId) {
      setInspectingRack(null);
    }
    setDeleteModalTarget(null);
  }, [currentCustomMap, customMaps, inspectingRack, saveCustomMaps]);

  const handleSaveHardware = useCallback((rackId: string, device: MountedHardwareDevice) => {
    if (!currentCustomMap) return;
    const isEditing = Boolean(editingHardwareDevice);

    const updatedRacks = (currentCustomMap.racks || []).map((r) => {
      if (r.id === rackId) {
        let newDevices = [...r.devices];
        if (isEditing) {
          const existingIdx = r.devices.findIndex((d) => d.id === (editingHardwareDevice?.id || device.id));
          if (existingIdx >= 0) {
            newDevices[existingIdx] = device;
          } else {
            newDevices.push(device);
          }
        } else {
          // Adding a new device: ensure ID doesn't collide with ANY existing device in this rack
          let finalId = device.id;
          if (newDevices.some((d) => d.id === finalId)) {
            finalId = `${device.id}-${Date.now()}`;
          }
          newDevices.push({ ...device, id: finalId });
        }
        return { ...r, devices: newDevices };
      } else {
        // Only remove from other racks if we are moving an existing device during edit
        if (isEditing && editingHardwareDevice) {
          return {
            ...r,
            devices: r.devices.filter((d) => d.id !== editingHardwareDevice.id && d.id !== device.id),
          };
        }
        return r;
      }
    });

    // Also ensure the device ID exists in currentCustomMap.deviceIds and has a devicePosition
    const deviceId = device.id;
    const cleanId = device.id.replace(/^hw-/, '');
    const currentDeviceIds = currentCustomMap.deviceIds || [];
    const newDeviceIds = [...currentDeviceIds];
    if (!newDeviceIds.includes(deviceId)) newDeviceIds.push(deviceId);
    if (!newDeviceIds.includes(cleanId)) newDeviceIds.push(cleanId);

    const currentPositions = { ...(currentCustomMap.devicePositions || {}) };
    const currentPhysicalPositions = { ...(currentCustomMap.physicalPositions || {}) };
    const targetRack = (currentCustomMap.racks || []).find((r) => r.id === rackId);

    const aliases = getDevicePositionAliases(deviceId, currentCustomMap, allAvailableDevices);

    let existingPos: { x: number; y: number } | undefined;
    for (const a of aliases) {
      if (currentPositions[a] && typeof currentPositions[a].x === 'number') {
        existingPos = currentPositions[a];
        break;
      }
      if (currentPhysicalPositions[a] && typeof currentPhysicalPositions[a].x === 'number') {
        existingPos = currentPhysicalPositions[a];
        break;
      }
    }

    const rackX = targetRack ? targetRack.x : 200;
    const rackY = targetRack ? targetRack.y : 200;
    const devCount = targetRack?.devices.length || 0;
    const initialPos = existingPos || {
      x: rackX + 380 + (devCount % 2) * 260,
      y: rackY + (devCount * 140),
    };

    aliases.forEach((a) => {
      currentPositions[a] = initialPos;
      currentPhysicalPositions[a] = initialPos;
    });

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      racks: updatedRacks,
      deviceIds: newDeviceIds,
      devicePositions: currentPositions,
      physicalPositions: currentPhysicalPositions,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    if (inspectingRack) {
      const found = updatedRacks.find((r) => r.id === inspectingRack.id);
      if (found) setInspectingRack(found);
    }
  }, [currentCustomMap, customMaps, editingHardwareDevice, inspectingRack, saveCustomMaps]);

  const handleRemoveDeviceFromRack = useCallback((rackId: string, deviceId: string) => {
    if (!currentCustomMap) return;
    const updatedRacks = (currentCustomMap.racks || []).map((r) => {
      if (r.id !== rackId) return r;
      return { ...r, devices: r.devices.filter((d) => d.id !== deviceId) };
    });

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      racks: updatedRacks,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    if (inspectingRack && inspectingRack.id === rackId) {
      const found = updatedRacks.find((r) => r.id === rackId);
      if (found) setInspectingRack(found);
    }
  }, [currentCustomMap, customMaps, inspectingRack, saveCustomMaps]);

  const handleOpenAddHardware = useCallback((rackId?: string, targetU?: number) => {
    setSelectedRackForHardware(rackId);
    setTargetUForHardware(targetU);
    setEditingHardwareDevice(null);
    setIsAddHardwareOpen(true);
  }, []);

  const handleEditDeviceNic = useCallback((device: MountedHardwareDevice, rack: CustomTopologyRack) => {
    setEditingHardwareDevice(device);
    setSelectedRackForHardware(rack.id);
    setTargetUForHardware(device.startU);
    setIsAddHardwareOpen(true);
  }, []);

  const handleEditDeviceSpecs = useCallback((device: MountedHardwareDevice, rack: CustomTopologyRack) => {
    setEditingHardwareDevice(device);
    setSelectedRackForHardware(rack.id);
    setTargetUForHardware(device.startU);
    setIsAddHardwareOpen(true);
  }, []);

  const handleMoveDeviceInRack = useCallback((rackId: string, deviceId: string, newStartU: number) => {
    if (!currentCustomMap) return;
    const updatedRacks = (currentCustomMap.racks || []).map((r) => {
      if (r.id !== rackId) return r;
      const devToMove = r.devices.find((d) => d.id === deviceId);
      if (!devToMove) return r;
      const endU = newStartU + devToMove.heightU - 1;
      if (newStartU < 1 || endU > r.units) return r;
      const hasCollision = r.devices.some((other) => {
        if (other.id === deviceId) return false;
        const oStart = other.startU;
        const oEnd = other.startU + other.heightU - 1;
        return Math.max(newStartU, oStart) <= Math.min(endU, oEnd);
      });
      if (hasCollision) return r;

      const newDevices = r.devices.map((d) => (d.id === deviceId ? { ...d, startU: newStartU } : d));
      return { ...r, devices: newDevices };
    });

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      racks: updatedRacks,
      updatedAt: new Date().toISOString(),
    };
    saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
    if (inspectingRack && inspectingRack.id === rackId) {
      const found = updatedRacks.find((r) => r.id === rackId);
      if (found) setInspectingRack(found);
    }
  }, [currentCustomMap, customMaps, inspectingRack, saveCustomMaps]);

  const handleRackMouseDown = useCallback((e: React.MouseEvent, rackId: string) => {
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('select')
    ) {
      return;
    }
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
    const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

    const currentRack = currentCustomMap?.racks?.find((r) => r.id === rackId);
    const currentPos = currentRack ? { x: currentRack.x, y: currentRack.y } : { x: 100, y: 100 };

    dragRackOffset.current = {
      offsetX: worldMouseX - currentPos.x,
      offsetY: worldMouseY - currentPos.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };

    setDraggingRackId(rackId);
  }, [pan.x, pan.y, zoom, currentCustomMap]);

  const handleTowerMouseDown = useCallback((e: React.MouseEvent, towerId: string) => {
    if (
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('select')
    ) {
      return;
    }
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
    const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

    const currentTower = currentCustomMap?.towers?.find((t) => t.id === towerId);
    const currentPos = currentTower ? { x: currentTower.x, y: currentTower.y } : { x: 100, y: 100 };

    dragTowerOffset.current = {
      offsetX: worldMouseX - currentPos.x,
      offsetY: worldMouseY - currentPos.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };

    setDraggingTowerId(towerId);
  }, [pan.x, pan.y, zoom, currentCustomMap]);

  const handleSelectMap = (mapId: string) => {
    setActiveMapId(mapId);
    try {
      localStorage.setItem(ACTIVE_MAP_STORAGE_KEY, mapId);
      const url = new URL(window.location.href);
      if (mapId === 'default') {
        url.searchParams.delete('mapId');
      } else {
        url.searchParams.set('mapId', mapId);
      }
      window.history.replaceState({}, '', url.toString());
    } catch (e) {}

    // Reset temporary positions so coordinates do not bleed between maps
    setCustomPositions({});
    if (mapId === 'default') {
      fetch('/api/settings/node-positions?mapId=default')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.positions && Object.keys(data.positions).length > 0) {
            setCustomPositions(data.positions);
            setHasSavedPositions(true);
          }
        })
        .catch(() => {});
    }

    setActiveTool('select');
    setCableWorkflow({ step: 'idle', sourceDevice: null, sourcePort: null, targetDevice: null, targetPort: null });
  };

  // Local nodes state for instant optimistic updates and drag & drop in Physical view
  const [localNodes, setLocalNodes] = useState<TopologyNode[]>([]);

  useEffect(() => {
    if (topology?.nodes) {
      setLocalNodes(topology.nodes);
    }
  }, [topology?.nodes]);

  // Helper to synthesize or resolve Device from MountedHardwareDevice for inventory, card view, and operations
  const synthesizeDeviceFromMounted = (
    mountedDev: MountedHardwareDevice,
    rack?: CustomTopologyRack,
    existingList: Device[] = []
  ): Device => {
    const cleanId = mountedDev.id.replace(/^hw-/, '');
    const found = existingList.find(
      (d) =>
        d.id === mountedDev.id ||
        d.id === cleanId ||
        d.name.toLowerCase() === mountedDev.name.toLowerCase() ||
        (mountedDev.ip && d.ip === mountedDev.ip)
    );
    if (found) return found;

    // Synthesize fallback Device object matching Network Equipment Inventory format
    const catStr = (mountedDev.category || '').toLowerCase();
    const devType: DeviceType = catStr.includes('router')
      ? 'router'
      : catStr.includes('ap') || catStr.includes('access_point') || catStr.includes('wireless')
      ? 'access_point'
      : 'switch';

    const brandLower = (mountedDev.brand || '').toLowerCase();
    const devPlatform: DevicePlatform = brandLower.includes('cisco')
      ? 'cisco_ios'
      : brandLower.includes('mikrotik')
      ? 'mikrotik_routeros'
      : 'generic_linux';

    const totalPorts = (mountedDev.networkCards || []).reduce((acc, card) => acc + (card.portCount || 0), 0) || 24;

    return {
      id: mountedDev.id,
      name: mountedDev.name,
      ip: mountedDev.ip || '192.168.1.1',
      platform: devPlatform,
      connection_mode: 'ssh',
      type: devType,
      role: `${mountedDev.brand || ''} ${mountedDev.model || ''}`.trim() || 'Network Device',
      model: mountedDev.model || '',
      mac: '00:00:00:00:00:00',
      building: '',
      floor: '',
      unit: '',
      rack: rack?.name || '',
      total_ports: totalPorts,
      is_online: true,
      cdp_enabled: true,
      lldp_enabled: true,
      snmp_community: 'public',
    };
  };

  const allAvailableDevices: Device[] = useMemo(() => {
    const list: Device[] = [];
    const seen = new Set<string>();

    const add = (d: Device) => {
      if (d && !seen.has(d.id)) {
        seen.add(d.id);
        list.push(d);
      }
    };

    (topology?.nodes || []).forEach(add);
    (localNodes || []).forEach(add);
    (inventoryDevices || []).forEach(add);

    // Also include any devices mounted in custom map racks so they exist in inventory & card layer
    if (currentCustomMap?.racks) {
      currentCustomMap.racks.forEach((rack) => {
        (rack.devices || []).forEach((mDev) => {
          const synth = synthesizeDeviceFromMounted(mDev, rack, list);
          add(synth);
          if (mDev.id !== synth.id) {
            add({ ...synth, id: mDev.id });
          }
        });
      });
    }

    // Also include any devices mounted on custom map towers
    if (currentCustomMap?.towers) {
      currentCustomMap.towers.forEach((tower) => {
        (tower.devices || []).forEach((tDev) => {
          const synthRadio: Device = {
            id: tDev.id,
            name: tDev.name || 'Wireless Device',
            ip: tDev.ip || '10.0.0.1',
            type: 'access_point',
            role: 'Wireless Radio',
            model: tDev.model || 'Wireless Radio',
            mac: '00:00:00:00:00:00',
            building: tower.location || tower.name,
            floor: 'Roof / Tower',
            unit: 'Mast',
            is_online: !!tDev.isOnline,
            total_ports: 2,
            cdp_enabled: false,
            lldp_enabled: true,
          };
          add(synthRadio);
          if (tDev.deviceId && tDev.deviceId !== tDev.id) {
            add({ ...synthRadio, id: tDev.deviceId });
          }
        });
      });
    }

    // Ensure any standalone device ID in currentCustomMap.deviceIds is present in list
    if (currentCustomMap?.deviceIds) {
      currentCustomMap.deviceIds.forEach((devId) => {
        if (!seen.has(devId)) {
          const cleanId = devId.replace(/^hw-/, '').replace(/^radio-/, '');
          const existingMatch = list.find((d) => d.id === cleanId || d.name === devId);
          if (existingMatch) {
            add({ ...existingMatch, id: devId });
          } else {
            add({
              id: devId,
              name: devId,
              ip: '192.168.1.1',
              type: 'switch',
              role: 'Access Switch',
              model: 'Network Device',
              mac: '00:00:00:00:00:00',
              building: 'Main',
              floor: 'Floor 1',
              unit: 'Rack',
              is_online: true,
              total_ports: 24,
              cdp_enabled: true,
              lldp_enabled: true,
            });
          }
        }
      });
    }

    return list;
  }, [topology?.nodes, localNodes, inventoryDevices, currentCustomMap?.racks, currentCustomMap?.towers, currentCustomMap?.deviceIds]);

  const handlePromptDeleteStickyNote = useCallback((noteId: string) => {
    const notes = [
      ...defaultStickyNotes,
      ...(currentCustomMap ? (currentCustomMap.stickyNotes || []) : []),
      ...customMaps.flatMap((m) => m.stickyNotes || []),
    ];
    const noteToDelete = notes.find((n) => n.id === noteId);
    if (!noteToDelete) return;

    const linkedDev = noteToDelete.linkedDeviceId
      ? allAvailableDevices.find(
          (d) =>
            d.id === noteToDelete.linkedDeviceId ||
            d.id === noteToDelete.linkedDeviceId?.replace(/^hw-/, '') ||
            d.id === `hw-${noteToDelete.linkedDeviceId?.replace(/^hw-/, '')}`
        )
      : undefined;

    setDeleteModalTarget({
      type: 'note',
      id: noteToDelete.id,
      title: noteToDelete.title,
      content: noteToDelete.content,
      linkedDeviceName: linkedDev?.name,
    });
  }, [currentCustomMap, customMaps, defaultStickyNotes, allAvailableDevices]);

  const handleRemoveDeviceFromCustomMap = useCallback((deviceId: string) => {
    if (!currentCustomMap) return;
    const cleanId = deviceId.replace(/^hw-/, '');
    const idsToRemove = new Set([deviceId, cleanId, `hw-${cleanId}`]);

    // Match name or IP to completely remove across both Card View and Physical Racks/Towers
    const targetNode = allAvailableDevices.find((d) => idsToRemove.has(d.id));
    const targetName = targetNode?.name ? targetNode.name.trim().toLowerCase() : '';
    const targetIp = targetNode?.ip ? targetNode.ip.trim() : '';

    const updatedDeviceIds = (currentCustomMap.deviceIds || []).filter((id) => !idsToRemove.has(id));
    const updatedLinks = (currentCustomMap.links || []).filter(
      (l) => !idsToRemove.has(l.sourceDeviceId) && !idsToRemove.has(l.targetDeviceId)
    );
    const updatedPositions = { ...(currentCustomMap.devicePositions || {}) };
    idsToRemove.forEach((id) => {
      delete updatedPositions[id];
    });

    // Simultaneously remove from ALL Racks (Physical View)
    const updatedRacks = (currentCustomMap.racks || []).map((rack) => ({
      ...rack,
      devices: (rack.devices || []).filter((d) => {
        if (idsToRemove.has(d.id) || idsToRemove.has(d.id.replace(/^hw-/, ''))) return false;
        if (targetName && d.name && d.name.trim().toLowerCase() === targetName) return false;
        if (targetIp && d.ip && d.ip.trim() === targetIp) return false;
        return true;
      }),
    }));

    // Simultaneously remove from ALL Towers (Physical View)
    const updatedTowers = (currentCustomMap.towers || []).map((tower) => ({
      ...tower,
      devices: (tower.devices || []).filter((d) => {
        if (idsToRemove.has(d.id) || idsToRemove.has(d.id.replace(/^hw-/, ''))) return false;
        if (targetName && d.name && d.name.trim().toLowerCase() === targetName) return false;
        if (targetIp && d.ip && d.ip.trim() === targetIp) return false;
        return true;
      }),
    }));

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      deviceIds: updatedDeviceIds,
      links: updatedLinks,
      devicePositions: updatedPositions,
      racks: updatedRacks,
      towers: updatedTowers,
      updatedAt: new Date().toISOString(),
    };

    const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
    saveCustomMaps(newMaps);

    if (inspectingRack) {
      const refreshed = updatedRacks.find((r) => r.id === inspectingRack.id);
      if (refreshed) {
        setInspectingRack(refreshed);
      }
    }
  }, [allAvailableDevices, currentCustomMap, customMaps, inspectingRack, saveCustomMaps]);

  const getDeviceNameById = useCallback((id: string) => {
    const found = allAvailableDevices.find((d) => d.id === id);
    return found ? found.name : id;
  }, [allAvailableDevices]);

  const handleConfirmDeleteDevice = useCallback(
    (deviceId: string) => {
      handleRemoveDeviceFromCustomMap(deviceId);
      setDeleteModalTarget(null);
    },
    [handleRemoveDeviceFromCustomMap]
  );

  // Helper to find or synthesize a Device instance from a MountedHardwareDevice for inventory modal & operations
  const resolveDeviceFromMounted = useCallback(
    (mountedDev: MountedHardwareDevice, rack?: CustomTopologyRack): Device => {
      return synthesizeDeviceFromMounted(mountedDev, rack, allAvailableDevices);
    },
    [allAvailableDevices]
  );

  const handleEditDeviceProperties = useCallback(
    (device: MountedHardwareDevice, rack: CustomTopologyRack) => {
      const resolved = resolveDeviceFromMounted(device, rack);
      setEditingInventoryDevice(resolved);
    },
    [resolveDeviceFromMounted]
  );

  const handleSaveInventoryDevice = useCallback(
    async (deviceId: string, updates: Partial<Device>) => {
      try {
        await updateDevice(deviceId, updates);
      } catch (err) {
        console.warn('Backend update failed, applying local state update', err);
      }

      // 1. Update in localNodes
      setLocalNodes((prev) =>
        prev.map((n) => (n.id === deviceId || n.id === `hw-${deviceId}` ? { ...n, ...updates } : n))
      );

      // 2. Update within any rack in currentCustomMap
      if (currentCustomMap && currentCustomMap.racks) {
        const updatedRacks = currentCustomMap.racks.map((r) => {
          const updatedDevices = (r.devices || []).map((d) => {
            if (d.id === deviceId || d.id === `hw-${deviceId}` || d.name === editingInventoryDevice?.name) {
              return {
                ...d,
                name: updates.name || d.name,
                model: updates.model || d.model,
                ip: updates.ip || d.ip,
              };
            }
            return d;
          });
          return { ...r, devices: updatedDevices };
        });

        const updatedMap: CustomTopologyMap = {
          ...currentCustomMap,
          racks: updatedRacks,
          updatedAt: new Date().toISOString(),
        };
        saveCustomMaps(customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
      }

      setEditingInventoryDevice(null);
      if (onRefresh) onRefresh();
    },
    [currentCustomMap, customMaps, editingInventoryDevice, onRefresh, saveCustomMaps]
  );

  const handleConnectTerminalFromRack = useCallback(
    (dev: MountedHardwareDevice, rack: CustomTopologyRack) => {
      if (onConnectTerminal) {
        const resolved = resolveDeviceFromMounted(dev, rack);
        onConnectTerminal(resolved);
      }
    },
    [onConnectTerminal, resolveDeviceFromMounted]
  );

  const handleInspectPortsFromRack = useCallback(
    (dev: MountedHardwareDevice, rack: CustomTopologyRack) => {
      if (onInspectPorts) {
        const resolved = resolveDeviceFromMounted(dev, rack);
        onInspectPorts(resolved);
      }
    },
    [onInspectPorts, resolveDeviceFromMounted]
  );

  const handlePromptRemoveHardwareDevice = useCallback((device: MountedHardwareDevice) => {
    setDeleteModalTarget({
      type: 'device',
      id: device.id,
      name: device.name,
      ip: device.ip,
      model: device.model,
    });
  }, []);

  // Group links by pair of connected devices to separate overlapping cables
  const defaultLinkGroups = useMemo(() => {
    const map = new Map<string, typeof topology.links>();
    if (!topology?.links) return map;
    for (const link of topology.links) {
      const pairKey = [link.source, link.target].sort().join('___');
      if (!map.has(pairKey)) {
        map.set(pairKey, []);
      }
      map.get(pairKey)!.push(link);
    }
    return map;
  }, [topology?.links]);

  const customLinkGroups = useMemo(() => {
    const map = new Map<string, CustomTopologyLink[]>();
    if (!currentCustomMap?.links) return map;
    for (const link of currentCustomMap.links) {
      const pairKey = [link.sourceDeviceId, link.targetDeviceId].sort().join('___');
      if (!map.has(pairKey)) {
        map.set(pairKey, []);
      }
      map.get(pairKey)!.push(link);
    }
    return map;
  }, [currentCustomMap?.links]);

  const handleCreateCustomMap = (
    name: string,
    description?: string,
    visibility: MapVisibility = 'public',
    allowedUsers: string[] = []
  ) => {
    const ownerId = currentUser?.id || 'user-admin';
    const ownerName = currentUser?.username || 'admin';
    const newMap: CustomTopologyMap = {
      id: `custom-map-${Date.now()}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceIds: [],
      devicePositions: {},
      links: [],
      visibility,
      ownerId,
      ownerName,
      allowedUsers,
    };
    const newMaps = [...customMaps, newMap];
    saveCustomMaps(newMaps);
    setActiveMapId(newMap.id);
    setActiveTool('select');
  };

  const handleUpdateCustomMap = (
    id: string,
    name: string,
    description?: string,
    visibility?: MapVisibility,
    allowedUsers?: string[]
  ) => {
    const updatedMaps = customMaps.map((m) =>
      m.id === id
        ? {
            ...m,
            name,
            description,
            visibility: visibility !== undefined ? visibility : (m.visibility || 'public'),
            allowedUsers: allowedUsers !== undefined ? allowedUsers : (m.allowedUsers || []),
            updatedAt: new Date().toISOString(),
          }
        : m
    );
    saveCustomMaps(updatedMaps);
  };

  const handleDeleteCustomMap = (id: string) => {
    const updatedMaps = customMaps.filter((m) => m.id !== id);
    saveCustomMaps(updatedMaps);
    setActiveMapId('default');
  };

  const handleAddDeviceToCustomMap = (
    device: Device,
    mode: DeviceCanvasDisplayMode = 'card',
    targetRackId?: string
  ) => {
    if (!currentCustomMap) return;
    const isAlreadyOnMap = currentCustomMap.deviceIds.includes(device.id);
    if (isAlreadyOnMap && !targetRackId) return;

    const existingCount = currentCustomMap.deviceIds.length;
    const col = existingCount % 3;
    const row = Math.floor(existingCount / 3);
    const newPos = currentCustomMap.devicePositions[device.id] || {
      x: 180 + col * 300,
      y: 160 + row * 220,
    };

    let updatedRacks = (currentCustomMap.racks || []).map((r) => ({
      ...r,
      devices: r.devices ? r.devices.filter((d) => d.id !== device.id) : [],
    }));

    if (targetRackId && mode === 'physical') {
      const targetRack = updatedRacks.find((r) => r.id === targetRackId);
      if (targetRack) {
        const hwDevice = convertNodeToHardwareDevice(device);
        let freeU = 1;
        for (let u = 1; u <= targetRack.units - hwDevice.heightU + 1; u++) {
          const endU = u + hwDevice.heightU - 1;
          const occupied = targetRack.devices.some((d) => {
            const dEnd = d.startU + d.heightU - 1;
            return Math.max(u, d.startU) <= Math.min(endU, dEnd);
          });
          if (!occupied) {
            freeU = u;
            break;
          }
        }
        hwDevice.startU = freeU;
        updatedRacks = updatedRacks.map((r) =>
          r.id === targetRackId ? { ...r, devices: [...r.devices, hwDevice] } : r
        );
      }
    }

    const newPhysicalPos = currentCustomMap.physicalPositions?.[device.id] || {
      x: 200 + col * 360,
      y: 180 + row * 260,
    };

    // Auto-attach any device sticky note associated with this device
    let updatedStickyNotes = currentCustomMap.stickyNotes || [];
    try {
      const rawNotes = localStorage.getItem('nettopology_device_sticky_notes_v1');
      const devNotes: CustomTopologyStickyNote[] = rawNotes ? JSON.parse(rawNotes) : [];
      const cleanDevId = device.id.replace(/^hw-/, '');
      const matchingNote = devNotes.find(
        (n) =>
          n.linkedDeviceId === device.id ||
          n.linkedDeviceId === cleanDevId ||
          n.linkedDeviceId === `hw-${cleanDevId}`
      );
      if (
        matchingNote &&
        !isTombstoned(matchingNote.id, matchingNote.linkedDeviceId) &&
        !updatedStickyNotes.some(
          (n) =>
            n.id === matchingNote.id ||
            n.linkedDeviceId === device.id ||
            n.linkedDeviceId === cleanDevId ||
            n.linkedDeviceId === `hw-${cleanDevId}`
        )
      ) {
        updatedStickyNotes = [
          ...updatedStickyNotes,
          {
            ...matchingNote,
            x: (mode === 'physical' ? newPhysicalPos.x : newPos.x) + 120,
            y: (mode === 'physical' ? newPhysicalPos.y : newPos.y) + 60,
            viewMode: mode === 'physical' ? 'physical' : 'card',
          },
        ];
      }
    } catch (e) {}

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      deviceIds: isAlreadyOnMap
        ? currentCustomMap.deviceIds
        : [...currentCustomMap.deviceIds, device.id],
      devicePositions: {
        ...currentCustomMap.devicePositions,
        [device.id]: newPos,
      },
      physicalPositions: {
        ...(currentCustomMap.physicalPositions || {}),
        [device.id]: newPhysicalPos,
      },
      deviceDisplayModes: {
        ...(currentCustomMap.deviceDisplayModes || {}),
        [device.id]: mode,
      },
      racks: updatedRacks,
      stickyNotes: updatedStickyNotes,
      updatedAt: new Date().toISOString(),
    };

    const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
    saveCustomMaps(newMaps);
  };

  const handleNodeClick = (nodeId: string) => {
    const node = allAvailableDevices.find((d) => d.id === nodeId);
    if (!node) return;

    if (activeMapId !== 'default' && activeTool === 'cable') {
      if (!cableWorkflow.sourceDevice) {
        // Step 1: select source device
        setCableWorkflow((prev) => ({
          ...prev,
          sourceDevice: node,
          step: 'select_source_port',
        }));
        setIsPortSelectorOpen(true);
      } else if (cableWorkflow.sourceDevice && cableWorkflow.sourcePort) {
        // Step 2: select destination device
        setCableWorkflow((prev) => ({
          ...prev,
          targetDevice: node,
          step: 'select_target_port',
        }));
        setIsPortSelectorOpen(true);
      }
    } else {
      setSelectedNodeId(nodeId);
    }
  };

  const handleStartCableFromDevice = (e: React.MouseEvent, node: Device) => {
    e.stopPropagation();
    setActiveTool('cable');
    setCableWorkflow({
      step: 'select_source_port',
      sourceDevice: node,
      sourcePort: null,
      targetDevice: null,
      targetPort: null,
    });
    setIsPortSelectorOpen(true);
  };

  const handleSelectPort = (portName: string, portData?: SwitchPort) => {
    if (cableWorkflow.step === 'select_source_port' && cableWorkflow.sourceDevice) {
      setCableWorkflow((prev) => ({
        ...prev,
        sourcePort: portName,
        sourceInitialPortData: portData,
        step: 'select_target_device',
      }));
      setIsPortSelectorOpen(false);
    } else if (cableWorkflow.step === 'select_target_port' && cableWorkflow.targetDevice) {
      setCableWorkflow((prev) => ({
        ...prev,
        targetPort: portName,
        targetInitialPortData: portData,
        step: 'configure_link',
      }));
      setIsPortSelectorOpen(false);
      setIsLinkConfigOpen(true);
    }
  };

  const handleSaveCustomLink = (linkData: Omit<CustomTopologyLink, 'id'>) => {
    if (!currentCustomMap) return;

    if (cableWorkflow.editingLink) {
      const updatedLinks = currentCustomMap.links.map((l) =>
        l.id === cableWorkflow.editingLink!.id ? { ...linkData, id: l.id } : l
      );
      const updatedMap: CustomTopologyMap = {
        ...currentCustomMap,
        links: updatedLinks,
        updatedAt: new Date().toISOString(),
      };
      const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
      saveCustomMaps(newMaps);
    } else {
      const newLink: CustomTopologyLink = {
        ...linkData,
        id: `custom-link-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      };
      const updatedMap: CustomTopologyMap = {
        ...currentCustomMap,
        links: [...(currentCustomMap.links || []), newLink],
        updatedAt: new Date().toISOString(),
      };
      const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
      saveCustomMaps(newMaps);
    }

    setIsLinkConfigOpen(false);
    setCableWorkflow({
      step: 'idle',
      sourceDevice: null,
      sourcePort: null,
      targetDevice: null,
      targetPort: null,
      editingLink: null,
    });
  };

  const handleDeleteCustomLink = () => {
    if (!currentCustomMap || !cableWorkflow.editingLink) return;
    const updatedLinks = currentCustomMap.links.filter((l) => l.id !== cableWorkflow.editingLink!.id);
    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      links: updatedLinks,
      updatedAt: new Date().toISOString(),
    };
    const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
    saveCustomMaps(newMaps);
    setIsLinkConfigOpen(false);
    setCableWorkflow({
      step: 'idle',
      sourceDevice: null,
      sourcePort: null,
      targetDevice: null,
      targetPort: null,
      editingLink: null,
    });
  };

  const handleDeleteLinkDirectly = (linkId: string) => {
    if (!currentCustomMap) return;
    const updatedLinks = currentCustomMap.links.filter((l) => l.id !== linkId);
    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      links: updatedLinks,
      updatedAt: new Date().toISOString(),
    };
    const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
    saveCustomMaps(newMaps);
  };

  const handleEditExistingLink = (link: CustomTopologyLink) => {
    const src = allAvailableDevices.find((d) => d.id === link.sourceDeviceId);
    const tgt = allAvailableDevices.find((d) => d.id === link.targetDeviceId);
    if (!src || !tgt) return;

    setCableWorkflow({
      step: 'configure_link',
      sourceDevice: src,
      sourcePort: link.sourcePort,
      targetDevice: tgt,
      targetPort: link.targetPort,
      editingLink: link,
    });
    setIsLinkConfigOpen(true);
  };

  const handleClearAllCustomLinks = () => {
    if (!currentCustomMap) return;
    const isConfirmed = window.confirm(
      isEn
        ? `Clear all cable links in map "${currentCustomMap.name}"?`
        : `آیا مایلید تمام کابل‌های نقشه «${currentCustomMap.name}» پاک شوند؟`
    );
    if (!isConfirmed) return;

    const updatedMap: CustomTopologyMap = {
      ...currentCustomMap,
      links: [],
      updatedAt: new Date().toISOString(),
    };
    const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
    saveCustomMaps(newMaps);
  };

  // Storage key for custom physical hierarchy persistence
  const HIERARCHY_STORAGE_KEY = 'nettopology_physical_hierarchy_v2';

  // Custom added buildings, floors, units, and racks with localStorage initialization
  const [customBuildings, setCustomBuildings] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.buildings)) return parsed.buildings;
      }
    } catch (e) {}
    return [];
  });

  const [customFloors, setCustomFloors] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.floors && typeof parsed.floors === 'object') return parsed.floors;
      }
    } catch (e) {}
    return {};
  });

  const [customUnits, setCustomUnits] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.units && typeof parsed.units === 'object') return parsed.units;
      }
    } catch (e) {}
    return {};
  });

  const [customRacks, setCustomRacks] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.racks && typeof parsed.racks === 'object') return parsed.racks;
      }
    } catch (e) {}
    return {};
  });

  // Helper to persist hierarchy state in localStorage and PostgreSQL backend
  const saveHierarchyState = (
    buildings: string[],
    floors: Record<string, string[]>,
    units: Record<string, string[]>,
    racks: Record<string, string[]>
  ) => {
    try {
      const payload = {
        buildings,
        floors,
        units,
        racks,
      };
      localStorage.setItem(HIERARCHY_STORAGE_KEY, JSON.stringify(payload));
      fetch('/api/settings/hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent('nettopology_hierarchy_updated'));
    } catch (e) {}
  };

  // Keep hierarchy in sync if modified from AddDeviceModal or other views and pull initial data from database
  useEffect(() => {
    const handleHierarchyUpdate = () => {
      try {
        const saved = localStorage.getItem(HIERARCHY_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.buildings)) setCustomBuildings(parsed.buildings);
          if (parsed.floors && typeof parsed.floors === 'object') setCustomFloors(parsed.floors);
          if (parsed.units && typeof parsed.units === 'object') setCustomUnits(parsed.units);
          if (parsed.racks && typeof parsed.racks === 'object') setCustomRacks(parsed.racks);
        }
      } catch (e) {}
    };

    // Load initial hierarchy from database if available
    fetch('/api/settings/hierarchy')
      .then((res) => (res.ok ? res.json() : null))
      .then((dbData) => {
        if (dbData && typeof dbData === 'object' && Array.isArray(dbData.buildings) && dbData.buildings.length > 0) {
          localStorage.setItem(HIERARCHY_STORAGE_KEY, JSON.stringify(dbData));
          handleHierarchyUpdate();
        }
      })
      .catch(() => {});

    // Load initial custom maps from database if available
    const token =
      localStorage.getItem('nettopology_auth_token_v1') ||
      sessionStorage.getItem('nettopology_auth_token_v1');
    const authHeaders: Record<string, string> = {};
    if (token) authHeaders['Authorization'] = `Bearer ${token}`;

    fetch('/api/settings/maps', { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : null))
      .then((resp) => {
        const mapsList = Array.isArray(resp)
          ? resp
          : Array.isArray(resp?.maps)
          ? resp.maps
          : null;
        if (Array.isArray(mapsList) && mapsList.length > 0) {
          localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(mapsList));
          setCustomMaps(mapsList);
        }
      })
      .catch(() => {});

    // Load initial node positions from database for default canvas
    fetch('/api/settings/node-positions?mapId=default')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.positions && Object.keys(data.positions).length > 0) {
          setCustomPositions(data.positions);
          setHasSavedPositions(true);
          try {
            localStorage.setItem('net_topology_node_positions', JSON.stringify(data.positions));
          } catch (e) {}
        }
      })
      .catch(() => {});

    window.addEventListener('nettopology_hierarchy_updated', handleHierarchyUpdate);
    window.addEventListener('storage', handleHierarchyUpdate);
    return () => {
      window.removeEventListener('nettopology_hierarchy_updated', handleHierarchyUpdate);
      window.removeEventListener('storage', handleHierarchyUpdate);
    };
  }, []);

  // Drag and drop states for Physical view
  const [draggedDevice, setDraggedDevice] = useState<{
    id: string;
    name: string;
    type: string;
    fromBuilding: string;
    fromFloor: string;
    fromUnit?: string;
    fromRack?: string;
  } | null>(null);

  const [dragOverTarget, setDragOverTarget] = useState<{
    building: string;
    floor: string;
    unit?: string;
    rack?: string;
  } | null>(null);

  const [movingDeviceId, setMovingDeviceId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [isToastFading, setIsToastFading] = useState(false);

  // Auto-dismiss feedbackToast with smooth fade-out (fades out gracefully so it does not block the schematic)
  useEffect(() => {
    if (!feedbackToast) {
      setIsToastFading(false);
      return;
    }
    setIsToastFading(false);
    // Start fading out after 2.4 seconds
    const fadeTimer = setTimeout(() => {
      setIsToastFading(true);
    }, 2400);

    // Completely dismiss after fade transition completes (3.0 seconds total)
    const removeTimer = setTimeout(() => {
      setFeedbackToast(null);
      setIsToastFading(false);
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [feedbackToast]);

  // Modals for adding floor/building, unit/rack, rename, delete, and manual relocation
  const [addFloorBuilding, setAddFloorBuilding] = useState<string | null>(null);
  const [newFloorInput, setNewFloorInput] = useState('');
  const [showAddBuildingModal, setShowAddBuildingModal] = useState(false);
  const [newBuildingInput, setNewBuildingInput] = useState('');

  const [addUnitModal, setAddUnitModal] = useState<{ building: string; floor: string } | null>(null);
  const [newUnitInput, setNewUnitInput] = useState('');

  const [addRackModal, setAddRackModal] = useState<{ building: string; floor: string } | null>(null);
  const [newRackInput, setNewRackInput] = useState('');

  const [renameModal, setRenameModal] = useState<{
    type: 'building' | 'floor' | 'unit' | 'rack';
    building: string;
    floor?: string;
    item?: string;
    currentName: string;
    newName: string;
  } | null>(null);

  const [deleteModal, setDeleteModal] = useState<{
    type: 'building' | 'floor' | 'unit' | 'rack';
    building: string;
    floor?: string;
    item?: string;
    deviceCount: number;
  } | null>(null);

  const [relocateDevice, setRelocateDevice] = useState<TopologyNode | null>(null);
  const [relocateTargetBuilding, setRelocateTargetBuilding] = useState('');
  const [relocateTargetFloor, setRelocateTargetFloor] = useState('');
  const [relocateTargetUnit, setRelocateTargetUnit] = useState('');
  const [relocateTargetRack, setRelocateTargetRack] = useState('');
  const [customRelocateBuilding, setCustomRelocateBuilding] = useState('');
  const [customRelocateFloor, setCustomRelocateFloor] = useState('');
  const [customRelocateUnit, setCustomRelocateUnit] = useState('');
  const [customRelocateRack, setCustomRelocateRack] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  const handleMoveDevice = async (
    deviceId: string,
    targetBuilding: string,
    targetFloor: string,
    targetUnit?: string,
    targetRack?: string
  ) => {
    const dev = localNodes.find((n) => n.id === deviceId);
    if (!dev) return;

    const trimmedBuilding = targetBuilding.trim();
    const trimmedFloor = targetFloor.trim();
    const trimmedUnit = targetUnit !== undefined ? targetUnit.trim() : (dev.unit || '');
    const trimmedRack = targetRack !== undefined ? targetRack.trim() : (dev.rack || '');

    if (!trimmedBuilding || !trimmedFloor) return;

    const currentBuilding = dev.building || (isEn ? 'Other Buildings' : 'سایر ساختمان‌ها');
    const currentFloor = dev.floor || (isEn ? 'Unassigned Floor' : 'طبقه نامشخص');
    const currentUnit = dev.unit || '';
    const currentRack = dev.rack || '';

    if (
      currentBuilding === trimmedBuilding &&
      currentFloor === trimmedFloor &&
      currentUnit === trimmedUnit &&
      currentRack === trimmedRack
    ) {
      setFeedbackToast({
        type: 'info',
        message: isEn
          ? `Device "${dev.name}" is already situated here.`
          : `تجهیز «${dev.name}» هم‌اکنون در همین موقعیت مستقر است.`,
      });
      setTimeout(() => setFeedbackToast(null), 3500);
      return;
    }

    // Optimistic UI update
    const previousNodes = [...localNodes];
    setLocalNodes((prev) =>
      prev.map((n) =>
        n.id === deviceId
          ? {
              ...n,
              building: trimmedBuilding,
              floor: trimmedFloor,
              unit: trimmedUnit,
              rack: trimmedRack,
            }
          : n
      )
    );
    setMovingDeviceId(deviceId);

    try {
      await updateDevice(deviceId, {
        building: trimmedBuilding,
        floor: trimmedFloor,
        unit: trimmedUnit,
        rack: trimmedRack,
      });

      setFeedbackToast({
        type: 'success',
        message: t('topology_physical_move_success', {
          name: dev.name,
          building: trimmedBuilding,
          floor: trimmedFloor,
        }),
      });
      setTimeout(() => setFeedbackToast(null), 4500);

      // Trigger global refresh to sync all views across the application
      onRefresh();
    } catch (err: any) {
      // Rollback optimistic update on failure
      setLocalNodes(previousNodes);
      setFeedbackToast({
        type: 'error',
        message: t('topology_physical_move_error', {
          error: err?.message || 'Failed to update device placement',
        }),
      });
      setTimeout(() => setFeedbackToast(null), 5000);
    } finally {
      setMovingDeviceId(null);
      setDraggedDevice(null);
      setDragOverTarget(null);
    }
  };

  const handleAddFloor = (building: string) => {
    const floorName = newFloorInput.trim();
    if (!floorName) return;
    const updatedFloors = {
      ...customFloors,
      [building]: Array.from(new Set([...(customFloors[building] || []), floorName])),
    };
    setCustomFloors(updatedFloors);
    saveHierarchyState(customBuildings, updatedFloors, customUnits, customRacks);
    setAddFloorBuilding(null);
    setNewFloorInput('');
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Floor "${floorName}" added` : `طبقه «${floorName}» اضافه شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleAddBuilding = () => {
    const bldgName = newBuildingInput.trim();
    if (!bldgName) return;
    const updatedBuildings = Array.from(new Set([...customBuildings, bldgName]));
    const defaultFloor = isEn ? 'Floor 1' : 'طبقه ۱';
    const updatedFloors = {
      ...customFloors,
      [bldgName]: Array.from(new Set([...(customFloors[bldgName] || []), defaultFloor])),
    };
    setCustomBuildings(updatedBuildings);
    setCustomFloors(updatedFloors);
    saveHierarchyState(updatedBuildings, updatedFloors, customUnits, customRacks);
    setShowAddBuildingModal(false);
    setNewBuildingInput('');
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Building "${bldgName}" created` : `ساختمان «${bldgName}» ایجاد شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleAddUnit = (building: string, floor: string, customInput?: string) => {
    const unitName = (customInput !== undefined ? customInput : newUnitInput).trim();
    if (!unitName) return;
    const key = `${building}:::${floor}`;
    const updatedUnits = {
      ...customUnits,
      [key]: Array.from(new Set([...(customUnits[key] || []), unitName])),
    };
    setCustomUnits(updatedUnits);
    saveHierarchyState(customBuildings, customFloors, updatedUnits, customRacks);
    setAddUnitModal(null);
    setNewUnitInput('');
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Unit "${unitName}" created` : `واحد «${unitName}» ایجاد شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleAddRack = (building: string, floor: string, customInput?: string) => {
    const rackName = (customInput !== undefined ? customInput : newRackInput).trim();
    if (!rackName) return;
    const key = `${building}:::${floor}`;
    const existingForFloor = customRacks[key] || [];
    if (existingForFloor.some((r) => r.trim().toLowerCase() === rackName.toLowerCase())) {
      setFeedbackToast({
        type: 'error',
        message: isEn
          ? `A rack named "${rackName}" already exists on this floor`
          : `رکی با نام «${rackName}» از قبل در این طبقه وجود دارد`,
      });
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }
    const updatedRacks = {
      ...customRacks,
      [key]: [...existingForFloor, rackName],
    };
    setCustomRacks(updatedRacks);
    saveHierarchyState(customBuildings, customFloors, customUnits, updatedRacks);
    setAddRackModal(null);
    setNewRackInput('');
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Rack "${rackName}" created` : `رک «${rackName}» ایجاد شد`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  const handleRenameSubmit = async () => {
    if (!renameModal) return;
    const { type, building, floor, currentName, newName } = renameModal;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === currentName) {
      setRenameModal(null);
      return;
    }

    let updatedBuildings = [...customBuildings];
    let updatedFloors = { ...customFloors };
    let updatedUnits = { ...customUnits };
    let updatedRacks = { ...customRacks };

    if (type === 'building') {
      const affectedDevices = localNodes.filter((n) => n.building === currentName);
      setLocalNodes((prev) =>
        prev.map((n) => (n.building === currentName ? { ...n, building: trimmed } : n))
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { building: trimmed });
        } catch (err) {}
      }

      updatedBuildings = updatedBuildings.map((b) => (b === currentName ? trimmed : b));
      if (updatedFloors[currentName]) {
        updatedFloors[trimmed] = updatedFloors[currentName];
        delete updatedFloors[currentName];
      }

      const newUnitsObj: Record<string, string[]> = {};
      Object.entries(updatedUnits).forEach(([k, v]) => {
        if (k.startsWith(`${currentName}:::`)) {
          const rest = k.slice(`${currentName}:::`.length);
          newUnitsObj[`${trimmed}:::${rest}`] = v as string[];
        } else {
          newUnitsObj[k] = v as string[];
        }
      });
      updatedUnits = newUnitsObj;

      const newRacksObj: Record<string, string[]> = {};
      Object.entries(updatedRacks).forEach(([k, v]) => {
        if (k.startsWith(`${currentName}:::`)) {
          const rest = k.slice(`${currentName}:::`.length);
          newRacksObj[`${trimmed}:::${rest}`] = v as string[];
        } else {
          newRacksObj[k] = v as string[];
        }
      });
      updatedRacks = newRacksObj;
    } else if (type === 'floor') {
      const affectedDevices = localNodes.filter(
        (n) => n.building === building && n.floor === currentName
      );
      setLocalNodes((prev) =>
        prev.map((n) =>
          n.building === building && n.floor === currentName ? { ...n, floor: trimmed } : n
        )
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { floor: trimmed });
        } catch (err) {}
      }

      if (updatedFloors[building]) {
        updatedFloors[building] = updatedFloors[building].map((f) =>
          f === currentName ? trimmed : f
        );
      }
      const oldKey = `${building}:::${currentName}`;
      const newKey = `${building}:::${trimmed}`;
      if (updatedUnits[oldKey]) {
        updatedUnits[newKey] = updatedUnits[oldKey];
        delete updatedUnits[oldKey];
      }
      if (updatedRacks[oldKey]) {
        updatedRacks[newKey] = updatedRacks[oldKey];
        delete updatedRacks[oldKey];
      }
    } else if (type === 'unit' && floor) {
      const affectedDevices = localNodes.filter(
        (n) => n.building === building && n.floor === floor && n.unit === currentName
      );
      setLocalNodes((prev) =>
        prev.map((n) =>
          n.building === building && n.floor === floor && n.unit === currentName
            ? { ...n, unit: trimmed }
            : n
        )
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { unit: trimmed });
        } catch (err) {}
      }

      const key = `${building}:::${floor}`;
      if (updatedUnits[key]) {
        updatedUnits[key] = updatedUnits[key].map((u) => (u === currentName ? trimmed : u));
      }
    } else if (type === 'rack' && floor) {
      const affectedDevices = localNodes.filter(
        (n) => n.building === building && n.floor === floor && n.rack === currentName
      );
      setLocalNodes((prev) =>
        prev.map((n) =>
          n.building === building && n.floor === floor && n.rack === currentName
            ? { ...n, rack: trimmed }
            : n
        )
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { rack: trimmed });
        } catch (err) {}
      }

      const key = `${building}:::${floor}`;
      if (updatedRacks[key]) {
        updatedRacks[key] = updatedRacks[key].map((r) => (r === currentName ? trimmed : r));
      }
    }

    setCustomBuildings(updatedBuildings);
    setCustomFloors(updatedFloors);
    setCustomUnits(updatedUnits);
    setCustomRacks(updatedRacks);
    saveHierarchyState(updatedBuildings, updatedFloors, updatedUnits, updatedRacks);
    setRenameModal(null);
    setFeedbackToast({
      type: 'success',
      message: isEn ? `Renamed to "${trimmed}"` : `نام به «${trimmed}» تغییر یافت`,
    });
    setTimeout(() => setFeedbackToast(null), 3000);
    onRefresh();
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    const { type, building, floor, item } = deleteModal;

    let updatedBuildings = [...customBuildings];
    let updatedFloors = { ...customFloors };
    let updatedUnits = { ...customUnits };
    let updatedRacks = { ...customRacks };

    if (type === 'building') {
      const affectedDevices = localNodes.filter((n) => n.building === building);
      setLocalNodes((prev) =>
        prev.map((n) => (n.building === building ? { ...n, building: '' } : n))
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { building: '' });
        } catch (err) {}
      }
      updatedBuildings = updatedBuildings.filter((b) => b !== building);
      delete updatedFloors[building];
      const newUnits: Record<string, string[]> = {};
      Object.entries(updatedUnits).forEach(([k, v]) => {
        if (!k.startsWith(`${building}:::`)) newUnits[k] = v as string[];
      });
      updatedUnits = newUnits;
      const newRacks: Record<string, string[]> = {};
      Object.entries(updatedRacks).forEach(([k, v]) => {
        if (!k.startsWith(`${building}:::`)) newRacks[k] = v as string[];
      });
      updatedRacks = newRacks;
    } else if (type === 'floor' && item) {
      const affectedDevices = localNodes.filter(
        (n) => n.building === building && n.floor === item
      );
      setLocalNodes((prev) =>
        prev.map((n) =>
          n.building === building && n.floor === item ? { ...n, floor: '' } : n
        )
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { floor: '' });
        } catch (err) {}
      }
      if (updatedFloors[building]) {
        updatedFloors[building] = updatedFloors[building].filter((f) => f !== item);
      }
      delete updatedUnits[`${building}:::${item}`];
      delete updatedRacks[`${building}:::${item}`];
    } else if (type === 'unit' && floor && item) {
      const affectedDevices = localNodes.filter(
        (n) => n.building === building && n.floor === floor && n.unit === item
      );
      setLocalNodes((prev) =>
        prev.map((n) =>
          n.building === building && n.floor === floor && n.unit === item
            ? { ...n, unit: '' }
            : n
        )
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { unit: '' });
        } catch (err) {}
      }
      const key = `${building}:::${floor}`;
      if (updatedUnits[key]) {
        updatedUnits[key] = updatedUnits[key].filter((u) => u !== item);
      }
    } else if (type === 'rack' && floor && item) {
      const affectedDevices = localNodes.filter(
        (n) => n.building === building && n.floor === floor && n.rack === item
      );
      setLocalNodes((prev) =>
        prev.map((n) =>
          n.building === building && n.floor === floor && n.rack === item
            ? { ...n, rack: '' }
            : n
        )
      );
      for (const dev of affectedDevices) {
        try {
          await updateDevice(dev.id, { rack: '' });
        } catch (err) {}
      }
      const key = `${building}:::${floor}`;
      if (updatedRacks[key]) {
        updatedRacks[key] = updatedRacks[key].filter((r) => r !== item);
      }
    }

    setCustomBuildings(updatedBuildings);
    setCustomFloors(updatedFloors);
    setCustomUnits(updatedUnits);
    setCustomRacks(updatedRacks);
    saveHierarchyState(updatedBuildings, updatedFloors, updatedUnits, updatedRacks);
    setDeleteModal(null);
    setFeedbackToast({
      type: 'success',
      message: isEn ? 'Item deleted successfully' : 'مکان فیزیکی با موفقیت حذف شد',
    });
    setTimeout(() => setFeedbackToast(null), 3000);
    onRefresh();
  };

  // Toggle Full Mode (Hides header, sidebar, top menu, and maximizes map to full browser viewport)
  const toggleFullMode = useCallback(() => {
    if (onToggleFullMode) {
      onToggleFullMode();
    } else {
      setInternalFullMode((prev) => {
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
    }
  }, [onToggleFullMode]);

  // Listen for Escape key and browser fullscreen change events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullMode) {
        if (onToggleFullMode) {
          onToggleFullMode();
        } else {
          setInternalFullMode(false);
        }
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullMode) {
        if (onToggleFullMode) {
          onToggleFullMode();
        } else {
          setInternalFullMode(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullMode, onToggleFullMode]);

  // Save viewport changes to localStorage
  const saveViewport = useCallback((newZoom: number, newPan: { x: number; y: number }) => {
    try {
      localStorage.setItem('net_topology_viewport', JSON.stringify({ zoom: newZoom, pan: newPan }));
    } catch (e) {}
  }, []);

  // Save custom node positions to localStorage and backend database
  const saveNodePositions = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      try {
        localStorage.setItem('net_topology_node_positions', JSON.stringify(positions));
        setHasSavedPositions(true);
        fetch('/api/settings/node-positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapId: activeMapId, positions }),
        }).catch(() => {});
      } catch (e) {}
    },
    [activeMapId]
  );

  // Reset positions back to auto-layout
  const handleResetPositions = () => {
    if (window.confirm(t('topology_reset_layout_confirm'))) {
      setCustomPositions({});
      setHasSavedPositions(false);
      try {
        localStorage.removeItem('net_topology_node_positions');
        if (activeMapId !== 'default' && currentCustomMap) {
          const updatedMap: CustomTopologyMap = {
            ...currentCustomMap,
            devicePositions: {},
            physicalPositions: {},
            updatedAt: new Date().toISOString(),
          };
          const newMaps = customMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
          saveCustomMaps(newMaps);
        } else {
          fetch(`/api/settings/node-positions?mapId=${encodeURIComponent(activeMapId)}`, {
            method: 'DELETE',
          }).catch(() => {});
        }
      } catch (e) {}
    }
  };

  const handleResetView = async () => {
    // 1. Reset zoom, pan, and selections
    setZoom(1);
    setPan({ x: 0, y: 0 });
    saveViewport(1, { x: 0, y: 0 });
    setSelectedNodeId(null);
    setLocalNodes([]);
    setDraggedDevice(null);

    if (isRefreshingView) return;
    setIsRefreshingView(true);

    try {
      // 2. Trigger parent reload of devices, reachability and topology links from DB
      if (onRefresh) {
        await Promise.resolve(onRefresh());
      }

      // 3. Prepare auth headers for settings endpoints
      const token =
        localStorage.getItem('nettopology_auth_token_v1') ||
        sessionStorage.getItem('nettopology_auth_token_v1');
      const authHeaders: Record<string, string> = {};
      if (token) authHeaders['Authorization'] = `Bearer ${token}`;

      // 4. Fetch latest saved node positions for current map (and default) from DB
      const targetMapId = activeMapId || 'default';
      const posPromise = fetch(`/api/settings/node-positions?mapId=${encodeURIComponent(targetMapId)}`, {
        headers: authHeaders,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.positions && typeof data.positions === 'object') {
            const hasPos = Object.keys(data.positions).length > 0;
            setCustomPositions(data.positions);
            setHasSavedPositions(hasPos);
            try {
              localStorage.setItem('net_topology_node_positions', JSON.stringify(data.positions));
            } catch (e) {}
          }
        })
        .catch(() => {});

      // 5. Fetch latest custom maps from DB (to refresh moved devices/positions/racks/links on custom maps)
      const mapsPromise = fetch('/api/settings/maps', { headers: authHeaders })
        .then((res) => (res.ok ? res.json() : null))
        .then((resp) => {
          const mapsList = Array.isArray(resp)
            ? resp
            : Array.isArray(resp?.maps)
            ? resp.maps
            : null;
          if (Array.isArray(mapsList) && mapsList.length > 0) {
            try {
              localStorage.setItem(CUSTOM_MAPS_STORAGE_KEY, JSON.stringify(mapsList));
            } catch (e) {}
            setCustomMaps(mapsList);
          }
        })
        .catch(() => {});

      // 6. Fetch latest physical hierarchy (buildings, floors, units, racks) from DB
      const hierarchyPromise = fetch('/api/settings/hierarchy', { headers: authHeaders })
        .then((res) => (res.ok ? res.json() : null))
        .then((dbData) => {
          const hierData = dbData?.hierarchy || dbData;
          if (hierData && typeof hierData === 'object' && Array.isArray(hierData.buildings) && hierData.buildings.length > 0) {
            try {
              localStorage.setItem(HIERARCHY_STORAGE_KEY, JSON.stringify(hierData));
            } catch (e) {}
            if (Array.isArray(hierData.buildings)) setCustomBuildings(hierData.buildings);
            if (hierData.floors && typeof hierData.floors === 'object') setCustomFloors(hierData.floors);
            if (hierData.units && typeof hierData.units === 'object') setCustomUnits(hierData.units);
            if (hierData.racks && typeof hierData.racks === 'object') setCustomRacks(hierData.racks);
          }
        })
        .catch(() => {});

      // 7. Fetch latest device sticky notes from DB
      const notesPromise = syncStickyNotesWithDatabase().catch(() => {});

      await Promise.allSettled([posPromise, mapsPromise, hierarchyPromise, notesPromise]);

      setFeedbackToast({
        type: 'success',
        message: t('topology_zoom_reset_success'),
      });
    } catch (err) {
      console.error('Failed to sync map changes from database:', err);
      setFeedbackToast({
        type: 'info',
        message: t('topology_zoom_reset_failed'),
      });
    } finally {
      setIsRefreshingView(false);
    }
  };

  // Node position calculations for Schematic View (hierarchical default + custom overrides)
  const nodePositions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();

    if (activeMapId !== 'default' && currentCustomMap) {
      // In Custom Map mode
      const mapDeviceIds = currentCustomMap.deviceIds || [];

      mapDeviceIds.forEach((id, index) => {
        const aliases = getDevicePositionAliases(id, currentCustomMap, allAvailableDevices);
        const resolved = resolveDevicePosition(id, currentCustomMap, globalDeviceViewMode, allAvailableDevices);

        if (resolved) {
          aliases.forEach((a) => pos.set(a, resolved));
        } else {
          const fallbackPos = {
            x: 180 + (index % 4) * 280,
            y: 180 + Math.floor(index / 4) * 220,
          };
          aliases.forEach((a) => pos.set(a, fallbackPos));
        }
      });

      // Also ensure all devices in customMap.racks have positions!
      if (currentCustomMap.racks) {
        currentCustomMap.racks.forEach((rack) => {
          (rack.devices || []).forEach((dev, devIdx) => {
            const devAliases = getDevicePositionAliases(dev.id, currentCustomMap, allAvailableDevices);
            let existing: { x: number; y: number } | undefined;
            for (const a of devAliases) {
              if (pos.has(a)) {
                existing = pos.get(a);
                break;
              }
            }
            if (!existing) {
              existing = resolveDevicePosition(dev.id, currentCustomMap, globalDeviceViewMode, allAvailableDevices);
            }
            if (existing) {
              devAliases.forEach((a) => pos.set(a, existing!));
            } else {
              const defaultRackPos = {
                x: rack.x + 440 + (devIdx % 2) * 260,
                y: rack.y + devIdx * 140,
              };
              devAliases.forEach((a) => pos.set(a, defaultRackPos));
            }
          });
        });
      }

      // Also ensure all devices on customMap.towers have positions!
      if (currentCustomMap.towers) {
        currentCustomMap.towers.forEach((tower) => {
          (tower.devices || []).forEach((dev, devIdx) => {
            const devAliases = getDevicePositionAliases(dev.id, currentCustomMap, allAvailableDevices);
            let existing: { x: number; y: number } | undefined;
            for (const a of devAliases) {
              if (pos.has(a)) {
                existing = pos.get(a);
                break;
              }
            }
            if (!existing) {
              existing = resolveDevicePosition(dev.id, currentCustomMap, globalDeviceViewMode, allAvailableDevices);
            }
            if (existing) {
              devAliases.forEach((a) => pos.set(a, existing!));
            } else {
              const defaultTowerPos = {
                x: tower.x + 480,
                y: tower.y + devIdx * 120,
              };
              devAliases.forEach((a) => pos.set(a, defaultTowerPos));
            }
          });
        });
      }

      // Universal Fallback for any other devices in custom map mode so no node is ever skipped
      let unposIdx = 0;
      allAvailableDevices.forEach((n) => {
        const aliases = getDevicePositionAliases(n.id, currentCustomMap, allAvailableDevices);
        let hasAny = false;
        for (const a of aliases) {
          if (pos.has(a)) {
            hasAny = true;
            break;
          }
        }
        if (!hasAny) {
          const existing = resolveDevicePosition(n.id, currentCustomMap, globalDeviceViewMode, allAvailableDevices);
          if (existing) {
            aliases.forEach((a) => pos.set(a, existing));
          } else {
            const fallback = {
              x: 180 + (unposIdx % 4) * 280,
              y: 200 + Math.floor(unposIdx / 4) * 220,
            };
            aliases.forEach((a) => pos.set(a, fallback));
            unposIdx++;
          }
        }
      });

      // While actively dragging a node, apply its real-time drag position
      if (draggingNodeId && customPositions[draggingNodeId]) {
        const dragPos = customPositions[draggingNodeId];
        const dragAliases = getDevicePositionAliases(draggingNodeId, currentCustomMap, allAvailableDevices);
        dragAliases.forEach((a) => pos.set(a, dragPos));
      }

      return pos;
    }

    if (!topology || !topology.nodes) return pos;

    // Hierarchical arrangement defaults:
    const routers = topology.nodes.filter((n) => n.type === 'router');
    const core = topology.nodes.filter((n) => n.type === 'switch' && n.role.includes('Core'));
    const dist = topology.nodes.filter((n) => n.type === 'switch' && n.role.includes('Distribution'));
    const acc = topology.nodes.filter((n) => n.type === 'switch' && !n.role.includes('Core') && !n.role.includes('Distribution'));
    const aps = topology.nodes.filter((n) => n.type === 'access_point');

    const layoutRow = (items: TopologyNode[], y: number, startX = 150, spacing = 280) => {
      const totalWidth = items.length * spacing;
      const initialX = Math.max(100, 500 - totalWidth / 2);
      items.forEach((item, index) => {
        pos.set(item.id, {
          x: initialX + index * spacing,
          y,
        });
      });
    };

    layoutRow(routers, 70, 150, 260);
    layoutRow(core, 190, 150, 300);
    layoutRow(dist, 340, 120, 340);
    layoutRow(acc, 490, 100, 320);
    layoutRow(aps, 640, 80, 270);

    // Fallback for any unpositioned nodes
    let unposIdx = 0;
    allAvailableDevices.forEach((n) => {
      if (!pos.has(n.id)) {
        pos.set(n.id, { x: 100 + (unposIdx % 4) * 250, y: 780 + Math.floor(unposIdx / 4) * 140 });
        unposIdx++;
      }
      const cleanId = n.id.replace(/^hw-/, '');
      if (!pos.has(cleanId)) {
        pos.set(cleanId, pos.get(n.id)!);
      }
    });

    // Apply custom user drag-and-drop position overrides
    Object.entries(customPositions).forEach(([id, customPos]) => {
      const posObj = customPos as { x: number; y: number } | undefined;
      if (posObj && typeof posObj.x === 'number' && typeof posObj.y === 'number') {
        pos.set(id, posObj);
      }
    });

    return pos;
  }, [topology, allAvailableDevices, customPositions, activeMapId, currentCustomMap, globalDeviceViewMode, draggingNodeId]);

  // Helper to find device position for auto-attaching sticky notes
  const getDevicePositionForNote = useCallback(
    (deviceId: string): { x: number; y: number } | null => {
      if (!deviceId) return null;
      const cleanId = deviceId.replace(/^hw-/, '');
      const hwId = 'hw-' + cleanId;
      return (
        nodePositions.get(deviceId) ||
        nodePositions.get(cleanId) ||
        nodePositions.get(hwId) ||
        customPositions[deviceId] ||
        customPositions[cleanId] ||
        customPositions[hwId] ||
        (currentCustomMap?.devicePositions && (
          currentCustomMap.devicePositions[deviceId] ||
          currentCustomMap.devicePositions[cleanId] ||
          currentCustomMap.devicePositions[hwId]
        )) ||
        null
      );
    },
    [nodePositions, customPositions, currentCustomMap]
  );

  // Synchronize device sticky notes from database & localStorage
  const syncStickyNotesWithDatabase = useCallback(async () => {
    try {
      const dbNotes = await syncDeviceNotesFromDatabase();
      if (!Array.isArray(dbNotes) || dbNotes.length === 0) return;

      const notesByDev = new Map<string, CustomTopologyStickyNote>();
      for (const n of dbNotes) {
        if (isTombstoned(n.id, n.linkedDeviceId)) continue;
        if (n.linkedDeviceId) {
          const clean = n.linkedDeviceId.replace(/^hw-/, '');
          notesByDev.set(n.linkedDeviceId, n);
          notesByDev.set(clean, n);
          notesByDev.set('hw-' + clean, n);
        }
        if (n.id) notesByDev.set(n.id, n);
      }

      // 1. Sync custom maps
      setCustomMaps((prevMaps) => {
        let hasChanges = false;
        const updatedMaps = prevMaps.map((map) => {
          const currentNotes = Array.isArray(map.stickyNotes) ? map.stickyNotes : [];
          const existingKeys = new Set<string>();

          let mapChanged = false;
          const mergedNotes = currentNotes
            .filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId))
            .map((sn) => {
              const match = (sn.linkedDeviceId && notesByDev.get(sn.linkedDeviceId)) || notesByDev.get(sn.id);
              if (match) {
                existingKeys.add(match.id);
                if (match.linkedDeviceId) existingKeys.add(match.linkedDeviceId);
                if (
                  sn.title !== match.title ||
                  sn.content !== match.content ||
                  sn.color !== match.color
                ) {
                  mapChanged = true;
                  return {
                    ...sn,
                    id: match.id || sn.id,
                    title: match.title,
                    content: match.content,
                    color: match.color || sn.color,
                    updatedAt: match.updatedAt || sn.updatedAt,
                  };
                }
              }
              return sn;
            });

          // Check if any device in this map has a note in DB not yet rendered on map
          const devIds = Array.isArray(map.deviceIds) ? map.deviceIds : Object.keys(map.devicePositions || {});
          for (const dId of devIds) {
            const match = notesByDev.get(dId);
            if (match && !isTombstoned(match.id, match.linkedDeviceId || dId) && !existingKeys.has(match.id) && !existingKeys.has(dId)) {
              const devPos = map.devicePositions?.[dId] || { x: 200, y: 150 };
              mergedNotes.push({
                ...match,
                x: (devPos.x || 200) + 120,
                y: (devPos.y || 150) + 40,
                viewMode: map.deviceDisplayModes?.[dId] || 'card',
              });
              existingKeys.add(match.id);
              existingKeys.add(dId);
              mapChanged = true;
            }
          }

          if (mapChanged) {
            hasChanges = true;
            return {
              ...map,
              stickyNotes: mergedNotes,
              updatedAt: new Date().toISOString(),
            };
          }
          return map;
        });

        if (hasChanges) {
          saveCustomMaps(updatedMaps);
          return updatedMaps;
        }
        return prevMaps;
      });

      // 2. Sync default map sticky notes
      setDefaultStickyNotes((prevNotes) => {
        const existingKeys = new Set<string>();
        let defaultChanged = false;

        const mergedNotes = prevNotes
          .filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId))
          .map((sn) => {
            const match = (sn.linkedDeviceId && notesByDev.get(sn.linkedDeviceId)) || notesByDev.get(sn.id);
            if (match) {
              existingKeys.add(match.id);
              if (match.linkedDeviceId) existingKeys.add(match.linkedDeviceId);
              if (
                sn.title !== match.title ||
                sn.content !== match.content ||
                sn.color !== match.color
              ) {
                defaultChanged = true;
                return {
                  ...sn,
                  id: match.id || sn.id,
                  title: match.title,
                  content: match.content,
                  color: match.color || sn.color,
                  updatedAt: match.updatedAt || sn.updatedAt,
                };
              }
            }
            return sn;
          });

        // Auto-attach any device note that exists in DB and is in allAvailableDevices
        for (const [devId, match] of notesByDev.entries()) {
          if (!isTombstoned(match.id, match.linkedDeviceId || devId) && !existingKeys.has(match.id) && !existingKeys.has(match.linkedDeviceId || devId)) {
            const devPos = getDevicePositionForNote(match.linkedDeviceId || devId);
            const x = devPos ? devPos.x + 120 : (Number(match.x) || 200);
            const y = devPos ? devPos.y + 40 : (Number(match.y) || 150);
            mergedNotes.push({
              ...match,
              x,
              y,
              viewMode: 'card',
            });
            existingKeys.add(match.id);
            existingKeys.add(match.linkedDeviceId || devId);
            defaultChanged = true;
          }
        }

        if (defaultChanged) {
          try {
            localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(mergedNotes));
          } catch (e) {}
          return mergedNotes;
        }
        return prevNotes;
      });
    } catch (err) {
      console.warn('[Sync Sticky Notes Error]', err);
    }
  }, [saveCustomMaps, getDevicePositionForNote, isTombstoned]);

  // Listen to nettopology_device_notes_updated and nettopology_custom_maps_updated
  useEffect(() => {
    syncStickyNotesWithDatabase();

    const handleDeviceNotesUpdated = (e: Event) => {
      const customEvt = e as CustomEvent;
      const detail = customEvt.detail;
      if (!detail) {
        syncStickyNotesWithDatabase();
        return;
      }

      if (detail.unlinked) {
        const targetId = detail.id;
        const prevDevId = detail.previousDeviceId;
        const cleanPrev = prevDevId?.replace(/^hw-/, '');
        const hwPrev = cleanPrev ? 'hw-' + cleanPrev : undefined;

        setCustomMaps((prev) => {
          const updated = prev.map((m) => ({
            ...m,
            stickyNotes: (m.stickyNotes || []).map((sn) => {
              if (
                sn.id === targetId ||
                (prevDevId && (sn.linkedDeviceId === prevDevId || sn.linkedDeviceId === cleanPrev || sn.linkedDeviceId === hwPrev))
              ) {
                const next = { ...sn, updatedAt: new Date().toISOString() };
                delete next.linkedDeviceId;
                return next;
              }
              return sn;
            }),
          }));
          saveCustomMaps(updated);
          return updated;
        });

        setDefaultStickyNotes((prev) => {
          const updated = prev.map((sn) => {
            if (
              sn.id === targetId ||
              (prevDevId && (sn.linkedDeviceId === prevDevId || sn.linkedDeviceId === cleanPrev || sn.linkedDeviceId === hwPrev))
            ) {
              const next = { ...sn, updatedAt: new Date().toISOString() };
              delete next.linkedDeviceId;
              return next;
            }
            return sn;
          });
          try {
            localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        return;
      }

      if (detail.deleted) {
        const deletedId = detail.id;
        const deletedDevId = detail.deviceId;
        const cleanDevId = deletedDevId?.replace(/^hw-/, '');
        const hwDevId = cleanDevId ? 'hw-' + cleanDevId : undefined;

        if (deletedId) deletedNoteIdsRef.current.add(deletedId);
        if (deletedDevId) {
          deletedDeviceIdsRef.current.add(deletedDevId);
          if (cleanDevId) deletedDeviceIdsRef.current.add(cleanDevId);
          if (hwDevId) deletedDeviceIdsRef.current.add(hwDevId);
        }

        try {
          const notesTombstones = Array.from(deletedNoteIdsRef.current);
          sessionStorage.setItem('nettopology_deleted_notes_tombstone', JSON.stringify(notesTombstones));
          const devsTombstones = Array.from(deletedDeviceIdsRef.current);
          sessionStorage.setItem('nettopology_deleted_devices_tombstone', JSON.stringify(devsTombstones));
        } catch (e) {}

        const isTarget = (n: CustomTopologyStickyNote) => {
          if (!n) return false;
          if (deletedId && n.id === deletedId) return true;
          if (deletedDevId && (n.linkedDeviceId === deletedDevId || n.linkedDeviceId === cleanDevId || n.linkedDeviceId === hwDevId)) return true;
          return false;
        };

        setCustomMaps((prev) => {
          const updated = prev.map((m) => ({
            ...m,
            stickyNotes: (m.stickyNotes || []).filter((n) => !isTarget(n)),
          }));
          saveCustomMaps(updated);
          return updated;
        });

        setDefaultStickyNotes((prev) => {
          const updated = prev.filter((n) => !isTarget(n));
          try {
            localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        return;
      }

      // Saved / updated note from Inventory or anywhere else (link / reassign / edit)
      const note: CustomTopologyStickyNote = (detail.note || detail) as CustomTopologyStickyNote;
      if (!note || !note.id) return;
      if (detail.newDeviceId) {
        note.linkedDeviceId = detail.newDeviceId;
      }

      // Clear tombstones for this note and device immediately so it is never suppressed
      deletedNoteIdsRef.current.delete(note.id);
      if (note.linkedDeviceId) {
        const clean = note.linkedDeviceId.replace(/^hw-/, '');
        deletedDeviceIdsRef.current.delete(note.linkedDeviceId);
        deletedDeviceIdsRef.current.delete(clean);
        deletedDeviceIdsRef.current.delete('hw-' + clean);
      }
      try {
        const storedNotes = sessionStorage.getItem('nettopology_deleted_notes_tombstone');
        if (storedNotes) {
          const arr = JSON.parse(storedNotes);
          if (Array.isArray(arr)) {
            sessionStorage.setItem('nettopology_deleted_notes_tombstone', JSON.stringify(arr.filter((id) => id !== note.id)));
          }
        }
        if (note.linkedDeviceId) {
          const clean = note.linkedDeviceId.replace(/^hw-/, '');
          const storedDevs = sessionStorage.getItem('nettopology_deleted_devices_tombstone');
          if (storedDevs) {
            const arr = JSON.parse(storedDevs);
            if (Array.isArray(arr)) {
              sessionStorage.setItem('nettopology_deleted_devices_tombstone', JSON.stringify(arr.filter((id) => id !== note.linkedDeviceId && id !== clean)));
            }
          }
        }
      } catch (e) {}

      setShowStickyNotes(true);
      try {
        localStorage.setItem('nettopology_show_sticky_notes', 'true');
      } catch (e) {}

      const targetDevId = note.linkedDeviceId;
      const cleanDevId = targetDevId?.replace(/^hw-/, '');
      const hwDevId = cleanDevId ? 'hw-' + cleanDevId : undefined;

      const prevDevId = detail.previousDeviceId;
      const cleanPrevId = prevDevId?.replace(/^hw-/, '');
      const hwPrevId = cleanPrevId ? 'hw-' + cleanPrevId : undefined;

      setCustomMaps((prev) => {
        const updated = prev.map((m) => {
          const currentNotes = (m.stickyNotes || []).filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId));
          const exists = currentNotes.some(
            (n) =>
              n.id === note.id ||
              (targetDevId &&
                (n.linkedDeviceId === targetDevId ||
                  n.linkedDeviceId === cleanDevId ||
                  n.linkedDeviceId === hwDevId)) ||
              (prevDevId &&
                (n.linkedDeviceId === prevDevId ||
                  n.linkedDeviceId === cleanPrevId ||
                  n.linkedDeviceId === hwPrevId))
          );

          let newNotes: CustomTopologyStickyNote[];
          if (exists) {
            newNotes = currentNotes.map((n) => {
              if (
                n.id === note.id ||
                (targetDevId &&
                  (n.linkedDeviceId === targetDevId ||
                    n.linkedDeviceId === cleanDevId ||
                    n.linkedDeviceId === hwDevId)) ||
                (prevDevId &&
                  (n.linkedDeviceId === prevDevId ||
                    n.linkedDeviceId === cleanPrevId ||
                    n.linkedDeviceId === hwPrevId))
              ) {
                return {
                  ...n,
                  id: note.id,
                  title: note.title,
                  content: note.content,
                  color: note.color || n.color,
                  linkedDeviceId: targetDevId,
                  updatedAt: note.updatedAt || new Date().toISOString(),
                };
              }
              return n;
            });
          } else {
            const hasDev =
              (Array.isArray(m.deviceIds) &&
                (m.deviceIds.includes(targetDevId!) ||
                  (cleanDevId && m.deviceIds.includes(cleanDevId)) ||
                  (hwDevId && m.deviceIds.includes(hwDevId)))) ||
              (m.devicePositions &&
                (m.devicePositions[targetDevId!] ||
                  (cleanDevId && m.devicePositions[cleanDevId]) ||
                  (hwDevId && m.devicePositions[hwDevId])));

            if (hasDev) {
              const devPos =
                (m.devicePositions &&
                  (m.devicePositions[targetDevId!] ||
                    (cleanDevId && m.devicePositions[cleanDevId]) ||
                    (hwDevId && m.devicePositions[hwDevId]))) ||
                { x: 200, y: 150 };
              newNotes = [
                ...currentNotes,
                {
                  ...note,
                  linkedDeviceId: targetDevId,
                  x: (devPos.x || 200) + 120,
                  y: (devPos.y || 150) + 40,
                  viewMode: (targetDevId && m.deviceDisplayModes?.[targetDevId]) || 'card',
                },
              ];
            } else {
              newNotes = currentNotes;
            }
          }

          return {
            ...m,
            stickyNotes: newNotes,
            updatedAt: new Date().toISOString(),
          };
        });

        saveCustomMaps(updated);
        return updated;
      });

      setDefaultStickyNotes((prev) => {
        const currentNotes = prev.filter((sn) => !isTombstoned(sn.id, sn.linkedDeviceId));
        const exists = currentNotes.some(
          (n) =>
            n.id === note.id ||
            (targetDevId &&
              (n.linkedDeviceId === targetDevId ||
                n.linkedDeviceId === cleanDevId ||
                n.linkedDeviceId === hwDevId)) ||
            (prevDevId &&
              (n.linkedDeviceId === prevDevId ||
                n.linkedDeviceId === cleanPrevId ||
                n.linkedDeviceId === hwPrevId))
        );

        let updated: CustomTopologyStickyNote[];
        if (exists) {
          updated = currentNotes.map((n) => {
            if (
              n.id === note.id ||
              (targetDevId &&
                (n.linkedDeviceId === targetDevId ||
                  n.linkedDeviceId === cleanDevId ||
                  n.linkedDeviceId === hwDevId)) ||
              (prevDevId &&
                (n.linkedDeviceId === prevDevId ||
                  n.linkedDeviceId === cleanPrevId ||
                  n.linkedDeviceId === hwPrevId))
            ) {
              return {
                ...n,
                id: note.id,
                title: note.title,
                content: note.content,
                color: note.color || n.color,
                linkedDeviceId: targetDevId,
                updatedAt: note.updatedAt || new Date().toISOString(),
              };
            }
            return n;
          });
        } else {
          const devPos = (targetDevId && getDevicePositionForNote(targetDevId)) || { x: 200, y: 150 };
          updated = [
            ...currentNotes,
            {
              ...note,
              linkedDeviceId: targetDevId,
              x: devPos.x + 120,
              y: devPos.y + 40,
              viewMode: 'card',
            },
          ];
        }

        try {
          localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    };

    const handleCustomMapsUpdated = () => {
      try {
        const saved = localStorage.getItem(CUSTOM_MAPS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.map((m: any) => ({
              ...m,
              stickyNotes: (m.stickyNotes || []).filter((sn: any) => !isTombstoned(sn.id, sn.linkedDeviceId)),
            }));
            setCustomMaps(cleaned);
          }
        }
        const rawDef = localStorage.getItem('nettopology_default_sticky_notes_v1');
        if (rawDef) {
          const parsedDef = JSON.parse(rawDef);
          if (Array.isArray(parsedDef)) {
            const cleanedDef = parsedDef.filter((sn: any) => !isTombstoned(sn.id, sn.linkedDeviceId));
            setDefaultStickyNotes(cleanedDef);
          }
        }
      } catch (e) {}
    };

    window.addEventListener('nettopology_device_notes_updated', handleDeviceNotesUpdated);
    window.addEventListener('nettopology_custom_maps_updated', handleCustomMapsUpdated);

    return () => {
      window.removeEventListener('nettopology_device_notes_updated', handleDeviceNotesUpdated);
      window.removeEventListener('nettopology_custom_maps_updated', handleCustomMapsUpdated);
    };
  }, [syncStickyNotesWithDatabase, saveCustomMaps, getDevicePositionForNote, isTombstoned]);

  // Switch to Card View with 3-second random neon border animation for the selected device
  const handleSwitchToCardWithHighlight = useCallback(
    (nodeId: string) => {
      setViewMode('schematic');
      setGlobalDeviceViewMode('card');
      setInspectingRack(null);
      setInspectingRackId(null);

      const cleanId = (nodeId || '').replace(/^hw-/, '');
      const targetDev =
        allAvailableDevices.find((n) => n.id === nodeId || n.id === cleanId || n.id === `hw-${cleanId}`) ||
        topology.nodes.find((n) => n.id === nodeId || n.id === cleanId || n.id === `hw-${cleanId}`) ||
        currentCustomMap?.nodes?.find((n) => n.id === nodeId || n.id === cleanId);

      const canonicalId = targetDev ? targetDev.id : nodeId;
      const canonicalCleanId = canonicalId.replace(/^hw-/, '');
      setSelectedNodeId(canonicalId);

      // Trigger 3s neon highlight with random neon color and full metadata
      triggerCardNeonHighlight(canonicalId, {
        name: targetDev?.name,
        ip: targetDev?.ip,
        aliases: [nodeId, cleanId, `hw-${cleanId}`, canonicalId, canonicalCleanId, `hw-${canonicalCleanId}`],
      });

      const pos =
        customPositions[canonicalId] ||
        customPositions[canonicalCleanId] ||
        customPositions[nodeId] ||
        customPositions[cleanId] ||
        (currentCustomMap?.devicePositions &&
          (currentCustomMap.devicePositions[canonicalId] ||
            currentCustomMap.devicePositions[canonicalCleanId] ||
            currentCustomMap.devicePositions[nodeId] ||
            currentCustomMap.devicePositions[cleanId])) ||
        nodePositions.get(canonicalId) ||
        nodePositions.get(canonicalCleanId) ||
        nodePositions.get(nodeId) ||
        nodePositions.get(cleanId);

      if (pos) {
        const scale = Math.max(0.7, Math.min(1.2, zoom || 1));
        setZoom(scale);
        setPan({
          x: Math.round(window.innerWidth / 2 - (pos.x + 113) * scale),
          y: Math.round(window.innerHeight / 2 - (pos.y + 75) * scale),
        });
      }

      const devName = targetDev?.name || cleanId;

      setFeedbackToast({
        type: 'success',
        message: isEn
          ? `Switched to Card View for "${devName}" — rotating neon border active.`
          : `انتقال به نمای کارتی برای «${devName}» — افکت نئونی چرخشی روی بوردر فعال شد.`,
      });
    },
    [
      allAvailableDevices,
      topology.nodes,
      customPositions,
      currentCustomMap,
      nodePositions,
      zoom,
      isEn,
      triggerCardNeonHighlight,
    ]
  );

  // Switch to Physical View with 3-second random neon border animation for the selected device
  const handleSwitchToPhysicalWithHighlight = useCallback(
    (node: TopologyNode | Device) => {
      const cleanId = (node.id || '').replace(/^hw-/, '');
      const rawId = node.id || '';
      const aliases = [node.id, cleanId, `hw-${cleanId}`];

      // Check if device is mounted in any rack in current custom map
      const targetRack = (currentCustomMap?.racks || []).find((rack) =>
        (rack.devices || []).some(
          (d) =>
            d.id === node.id ||
            d.id === cleanId ||
            d.id === `hw-${cleanId}` ||
            (d.name && node.name && d.name.trim().toLowerCase() === node.name.trim().toLowerCase()) ||
            (d.ip && node.ip && d.ip.trim() === node.ip.trim())
        )
      );

      // Trigger 3-second neon highlight
      triggerCardNeonHighlight(node.id, {
        name: node.name,
        ip: node.ip,
        aliases,
      });
      setSelectedNodeId(node.id);

      if (targetRack) {
        // Switch to Physical View on Canvas
        setViewMode('schematic');
        setGlobalDeviceViewMode('physical');
        setInspectingRack(null);
        setInspectingRackId(null);

        // Center on the target rack
        const rackHeight = 52 + targetRack.units * 28 + 40;
        const rackCenterX = targetRack.x + 215;
        const rackCenterY = targetRack.y + rackHeight / 2;
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 1000;
        const containerHeight = containerRef.current?.clientHeight || window.innerHeight || 700;
        const targetZoom = Math.max(0.75, Math.min(1.15, zoom || 1));

        setZoom(targetZoom);
        setPan({
          x: Math.round(containerWidth / 2 - rackCenterX * targetZoom),
          y: Math.round(containerHeight / 2 - rackCenterY * targetZoom),
        });

        const mountedDev = targetRack.devices.find(
          (d) =>
            d.id === node.id ||
            d.id === cleanId ||
            d.id === `hw-${cleanId}` ||
            (d.name && node.name && d.name.trim().toLowerCase() === node.name.trim().toLowerCase())
        );
        const uLabel = mountedDev ? ` (یونیت ${mountedDev.startU})` : '';
        const uLabelEn = mountedDev ? ` (Unit U${mountedDev.startU})` : '';

        setFeedbackToast({
          type: 'success',
          message: isEn
            ? `Switched to Physical View: Located "${node.name}" in Rack "${targetRack.name}"${uLabelEn}.`
            : `انتقال به نمای فیزیکی: مکان‌یابی «${node.name}» در رک «${targetRack.name}»${uLabel}.`,
        });
      } else if (activeMapId !== 'default' && (currentCustomMap?.racks && currentCustomMap.racks.length > 0)) {
        // Custom map with racks exists, device is placed as a physical chassis on canvas
        setViewMode('schematic');
        setGlobalDeviceViewMode('physical');

        const pos =
          customPositions[node.id] ||
          customPositions[cleanId] ||
          (currentCustomMap?.devicePositions &&
            (currentCustomMap.devicePositions[node.id] || currentCustomMap.devicePositions[cleanId])) ||
          nodePositions.get(node.id) ||
          nodePositions.get(cleanId);

        if (pos) {
          const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 1000;
          const containerHeight = containerRef.current?.clientHeight || window.innerHeight || 700;
          const targetZoom = Math.max(0.75, Math.min(1.15, zoom || 1));
          setZoom(targetZoom);
          setPan({
            x: Math.round(containerWidth / 2 - (pos.x + 170) * targetZoom),
            y: Math.round(containerHeight / 2 - (pos.y + 120) * targetZoom),
          });
        }

        setFeedbackToast({
          type: 'success',
          message: isEn
            ? `Switched to Physical View: Located "${node.name}" chassis on canvas.`
            : `انتقال به نمای فیزیکی: مکان‌یابی شاسی «${node.name}» روی بوم.`,
        });
      } else {
        // Building & Floor Physical View (or Default Map without custom racks)
        setViewMode('physical');

        setTimeout(() => {
          const el =
            document.getElementById(`physical-device-${node.id}`) ||
            document.getElementById(`physical-device-${cleanId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);

        setFeedbackToast({
          type: 'success',
          message: isEn
            ? `Switched to Physical View: Located "${node.name}" in building/floor equipment hierarchy.`
            : `انتقال به نمای فیزیکی: مکان‌یابی «${node.name}» در طبقه‌بندی فیزیکی ساختمان و طبقات.`,
        });
      }
    },
    [
      currentCustomMap,
      activeMapId,
      triggerCardNeonHighlight,
      zoom,
      customPositions,
      nodePositions,
      isEn,
    ]
  );

  // Navigate to Card View for a rack-mounted device to examine cabling and port connections
  const handleViewDeviceInCardMode = useCallback(
    (dev: MountedHardwareDevice, rack: CustomTopologyRack) => {
      setInspectingRack(null);
      setInspectingRackId(null);
      setViewMode('schematic');
      setGlobalDeviceViewMode('card');

      const devCleanId = dev.id.replace(/^hw-/, '');
      const devNameTrimmed = (dev.name || '').trim().toLowerCase();
      const devIpTrimmed = (dev.ip || '').trim();

      // Find best matching node across allAvailableDevices, topology.nodes, and currentCustomMap
      const matchNode =
        allAvailableDevices.find(
          (n) =>
            n.id === dev.id ||
            n.id === devCleanId ||
            n.id === `hw-${devCleanId}` ||
            (devNameTrimmed && n.name && n.name.trim().toLowerCase() === devNameTrimmed) ||
            (devIpTrimmed && n.ip && n.ip.trim() === devIpTrimmed)
        ) ||
        (topology?.nodes || []).find(
          (n) =>
            n.id === dev.id ||
            n.id === devCleanId ||
            n.id === `hw-${devCleanId}` ||
            (devNameTrimmed && n.name && n.name.trim().toLowerCase() === devNameTrimmed) ||
            (devIpTrimmed && n.ip && n.ip.trim() === devIpTrimmed)
        );

      const canonicalId = matchNode ? matchNode.id : dev.id;
      const canonicalCleanId = canonicalId.replace(/^hw-/, '');

      const aliasList = [
        dev.id,
        devCleanId,
        `hw-${devCleanId}`,
        canonicalId,
        canonicalCleanId,
        `hw-${canonicalCleanId}`,
      ];
      if (matchNode) {
        aliasList.push(matchNode.id);
        aliasList.push(matchNode.id.replace(/^hw-/, ''));
      }

      setSelectedNodeId(canonicalId);

      // Trigger 3-second random neon border highlight with full metadata for exact targeting
      triggerCardNeonHighlight(canonicalId, {
        name: dev.name || matchNode?.name,
        ip: dev.ip || matchNode?.ip,
        aliases: aliasList,
      });

      // Find position of this card on the canvas
      let pos =
        customPositions[canonicalId] ||
        customPositions[canonicalCleanId] ||
        customPositions[dev.id] ||
        customPositions[devCleanId] ||
        (currentCustomMap?.devicePositions && (
          currentCustomMap.devicePositions[canonicalId] ||
          currentCustomMap.devicePositions[canonicalCleanId] ||
          currentCustomMap.devicePositions[dev.id] ||
          currentCustomMap.devicePositions[devCleanId]
        )) ||
        nodePositions.get(canonicalId) ||
        nodePositions.get(canonicalCleanId) ||
        nodePositions.get(dev.id) ||
        nodePositions.get(devCleanId);

      if (!pos) {
        pos = {
          x: rack.x + 440,
          y: rack.y + 60,
        };
      }

      // Ensure customPositions has it so it's placed immediately without layout lag
      setCustomPositions((prev) => ({
        ...prev,
        [canonicalId]: pos,
        [dev.id]: pos,
        [devCleanId]: pos,
      }));

      // If in custom map, ensure the device is in deviceIds so the card is rendered and all aliases updated
      if (currentCustomMap && activeMapId !== 'default') {
        const deviceIds = currentCustomMap.deviceIds || [];
        const aliases = getDevicePositionAliases(dev.id, currentCustomMap, allAvailableDevices);
        const posUpdates: Record<string, { x: number; y: number }> = {};
        aliases.forEach((a) => {
          posUpdates[a] = pos;
        });
        const updatedCustomMap: CustomTopologyMap = {
          ...currentCustomMap,
          deviceIds: Array.from(new Set([...deviceIds, canonicalId, dev.id, devCleanId])),
          devicePositions: {
            ...(currentCustomMap.devicePositions || {}),
            ...posUpdates,
          },
          physicalPositions: {
            ...(currentCustomMap.physicalPositions || {}),
            ...posUpdates,
          },
          updatedAt: new Date().toISOString(),
        };
        saveCustomMaps(customMaps.map((m) => (m.id === currentCustomMap.id ? updatedCustomMap : m)));
      }

      const scale = Math.max(0.7, Math.min(1.2, zoom || 1));
      setZoom(scale);
      setPan({
        x: Math.round(window.innerWidth / 2 - (pos.x + 113) * scale),
        y: Math.round(window.innerHeight / 2 - (pos.y + 75) * scale),
      });

      setFeedbackToast({
        type: 'success',
        message: isEn
          ? `Switched to Card View for "${dev.name || canonicalId}" — rotating neon border active.`
          : `انتقال به نمای کارتی برای «${dev.name || canonicalId}» — افکت نئونی چرخشی روی بوردر فعال شد.`,
      });
    },
    [
      allAvailableDevices,
      topology?.nodes,
      customPositions,
      currentCustomMap,
      activeMapId,
      customMaps,
      saveCustomMaps,
      nodePositions,
      zoom,
      isEn,
      triggerCardNeonHighlight,
    ]
  );

  // Background Pan Handler
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If clicked on an interactive node or button, don't start canvas pan
    if (
      (e.target as HTMLElement).closest('.interactive-node') ||
      (e.target as HTMLElement).closest('button') ||
      (e.target as HTMLElement).closest('input') ||
      (e.target as HTMLElement).closest('select')
    ) {
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // Node Drag Handler (Mouse Down)
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    // Ignore clicks on internal action buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Convert client coords to world diagram coords
    const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
    const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

    const currentPos = nodePositions.get(nodeId) || { x: 100, y: 100 };

    dragNodeOffset.current = {
      offsetX: worldMouseX - currentPos.x,
      offsetY: worldMouseY - currentPos.y,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };

    setDraggingNodeId(nodeId);
  };

  // Global mouse move & up
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // 1. Handling Node Drag
      if (draggingNodeId && containerRef.current) {
        const dist = Math.hypot(
          e.clientX - dragNodeOffset.current.startClientX,
          e.clientY - dragNodeOffset.current.startClientY
        );
        if (dist > 3) {
          dragNodeOffset.current.moved = true;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
        const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

        const newX = Math.round(worldMouseX - dragNodeOffset.current.offsetX);
        const newY = Math.round(worldMouseY - dragNodeOffset.current.offsetY);

        dragNodeLatestCoords.current = { id: draggingNodeId, x: newX, y: newY };

        setCustomPositions((prev) => ({
          ...prev,
          [draggingNodeId]: { x: newX, y: newY },
        }));
        return;
      }

      // 1.5 Handling Rack Drag
      if (draggingRackId && containerRef.current && currentCustomMap) {
        const dist = Math.hypot(
          e.clientX - dragRackOffset.current.startClientX,
          e.clientY - dragRackOffset.current.startClientY
        );
        if (dist > 3) {
          dragRackOffset.current.moved = true;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
        const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

        const newX = Math.round(worldMouseX - dragRackOffset.current.offsetX);
        const newY = Math.round(worldMouseY - dragRackOffset.current.offsetY);

        dragRackLatestCoords.current = { id: draggingRackId, x: newX, y: newY };

        const updatedRacks = (currentCustomMap.racks || []).map((r) =>
          r.id === draggingRackId ? { ...r, x: newX, y: newY } : r
        );
        const updatedMap: CustomTopologyMap = {
          ...currentCustomMap,
          racks: updatedRacks,
          updatedAt: new Date().toISOString(),
        };
        setCustomMaps((prev) => prev.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
        return;
      }

      // 1.6 Handling Tower Drag
      if (draggingTowerId && containerRef.current && currentCustomMap) {
        const dist = Math.hypot(
          e.clientX - dragTowerOffset.current.startClientX,
          e.clientY - dragTowerOffset.current.startClientY
        );
        if (dist > 3) {
          dragTowerOffset.current.moved = true;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
        const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

        const newX = Math.round(worldMouseX - dragTowerOffset.current.offsetX);
        const newY = Math.round(worldMouseY - dragTowerOffset.current.offsetY);

        dragTowerLatestCoords.current = { id: draggingTowerId, x: newX, y: newY };

        const updatedTowers = (currentCustomMap.towers || []).map((t) =>
          t.id === draggingTowerId ? { ...t, x: newX, y: newY } : t
        );
        const updatedMap: CustomTopologyMap = {
          ...currentCustomMap,
          towers: updatedTowers,
          updatedAt: new Date().toISOString(),
        };
        setCustomMaps((prev) => prev.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
        return;
      }

      // 1.8 Handling Sticky Note Drag
      if (draggingNoteId && containerRef.current) {
        const dist = Math.hypot(
          e.clientX - dragNoteOffset.current.startClientX,
          e.clientY - dragNoteOffset.current.startClientY
        );
        if (dist > 3) {
          dragNoteOffset.current.moved = true;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const worldMouseX = (e.clientX - rect.left - pan.x) / zoom;
        const worldMouseY = (e.clientY - rect.top - pan.y) / zoom;

        const newX = Math.round(worldMouseX - dragNoteOffset.current.offsetX);
        const newY = Math.round(worldMouseY - dragNoteOffset.current.offsetY);

        dragNoteLatestCoords.current = { id: draggingNoteId, x: newX, y: newY };

        if (currentCustomMap) {
          const updatedNotes = (currentCustomMap.stickyNotes || []).map((n) =>
            n.id === draggingNoteId ? { ...n, x: newX, y: newY } : n
          );
          const updatedMap: CustomTopologyMap = {
            ...currentCustomMap,
            stickyNotes: updatedNotes,
            updatedAt: new Date().toISOString(),
          };
          setCustomMaps((prev) => prev.map((m) => (m.id === updatedMap.id ? updatedMap : m)));
        } else {
          setDefaultStickyNotes((prev) =>
            prev.map((n) => (n.id === draggingNoteId ? { ...n, x: newX, y: newY } : n))
          );
        }
        return;
      }

      // 2. Handling Canvas Pan
      if (isPanning) {
        const newPan = {
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        };
        setPan(newPan);
      }
    };

    const handleGlobalMouseUp = () => {
      if (draggingNodeId) {
        if (dragNodeOffset.current.moved) {
          const finalCoords =
            dragNodeLatestCoords.current ||
            (customPositions[draggingNodeId]
              ? { id: draggingNodeId, x: customPositions[draggingNodeId].x, y: customPositions[draggingNodeId].y }
              : null);
          const cleanId = draggingNodeId.replace(/^hw-/, '').replace(/^radio-/, '');

          if (activeMapId !== 'default' && finalCoords) {
            setCustomMaps((prevMaps) => {
              const targetMap = prevMaps.find((m) => m.id === activeMapId);
              if (!targetMap) return prevMaps;

              const aliases = getDevicePositionAliases(draggingNodeId, targetMap, allAvailableDevices);
              const posUpdates: Record<string, { x: number; y: number }> = {};
              aliases.forEach((aId) => {
                posUpdates[aId] = { x: finalCoords.x, y: finalCoords.y };
              });

              const updatedMap: CustomTopologyMap = {
                ...targetMap,
                devicePositions: {
                  ...(targetMap.devicePositions || {}),
                  ...posUpdates,
                },
                physicalPositions: {
                  ...(targetMap.physicalPositions || {}),
                  ...posUpdates,
                },
                updatedAt: new Date().toISOString(),
              };

              const newMaps = prevMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
              saveCustomMaps(newMaps);
              return newMaps;
            });

            // Clean up temporary drag position for all aliases
            setCustomPositions((prev) => {
              const next = { ...prev };
              const aliases = getDevicePositionAliases(draggingNodeId, currentCustomMap, allAvailableDevices);
              aliases.forEach((aId) => {
                delete next[aId];
              });
              return next;
            });
          } else if (finalCoords) {
            // Default map
            const aliases = getDevicePositionAliases(draggingNodeId, null, allAvailableDevices);
            const posUpdates: Record<string, { x: number; y: number }> = {};
            aliases.forEach((aId) => {
              posUpdates[aId] = { x: finalCoords.x, y: finalCoords.y };
            });

            setCustomPositions((latest) => {
              const updated = {
                ...latest,
                ...posUpdates,
              };
              saveNodePositions(updated);
              return updated;
            });
          }
        } else {
          // It was a click without significant drag
          handleNodeClick(draggingNodeId);
        }
        setDraggingNodeId(null);
        dragNodeLatestCoords.current = null;
      }

      if (draggingRackId) {
        if (dragRackOffset.current.moved && activeMapId !== 'default') {
          const finalRackCoords = dragRackLatestCoords.current;
          if (finalRackCoords) {
            setCustomMaps((prevMaps) => {
              const targetMap = prevMaps.find((m) => m.id === activeMapId);
              if (!targetMap) return prevMaps;
              const updatedRacks = (targetMap.racks || []).map((r) =>
                r.id === finalRackCoords.id ? { ...r, x: finalRackCoords.x, y: finalRackCoords.y } : r
              );
              const updatedMap: CustomTopologyMap = {
                ...targetMap,
                racks: updatedRacks,
                updatedAt: new Date().toISOString(),
              };
              const newMaps = prevMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
              saveCustomMaps(newMaps);
              return newMaps;
            });
          }
        }
        setDraggingRackId(null);
        dragRackLatestCoords.current = null;
      }

      if (draggingTowerId) {
        if (dragTowerOffset.current.moved && activeMapId !== 'default') {
          const finalTowerCoords = dragTowerLatestCoords.current;
          if (finalTowerCoords) {
            setCustomMaps((prevMaps) => {
              const targetMap = prevMaps.find((m) => m.id === activeMapId);
              if (!targetMap) return prevMaps;
              const updatedTowers = (targetMap.towers || []).map((t) =>
                t.id === finalTowerCoords.id ? { ...t, x: finalTowerCoords.x, y: finalTowerCoords.y } : t
              );
              const updatedMap: CustomTopologyMap = {
                ...targetMap,
                towers: updatedTowers,
                updatedAt: new Date().toISOString(),
              };
              const newMaps = prevMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
              saveCustomMaps(newMaps);
              return newMaps;
            });
          }
        }
        setDraggingTowerId(null);
        dragTowerLatestCoords.current = null;
      }

      if (draggingNoteId) {
        if (dragNoteOffset.current.moved) {
          const finalNoteCoords = dragNoteLatestCoords.current;
          if (finalNoteCoords) {
            if (activeMapId !== 'default') {
              setCustomMaps((prevMaps) => {
                const targetMap = prevMaps.find((m) => m.id === activeMapId);
                if (!targetMap) return prevMaps;
                const updatedNotes = (targetMap.stickyNotes || []).map((n) =>
                  n.id === finalNoteCoords.id ? { ...n, x: finalNoteCoords.x, y: finalNoteCoords.y } : n
                );
                const updatedMap: CustomTopologyMap = {
                  ...targetMap,
                  stickyNotes: updatedNotes,
                  updatedAt: new Date().toISOString(),
                };
                const newMaps = prevMaps.map((m) => (m.id === updatedMap.id ? updatedMap : m));
                saveCustomMaps(newMaps);
                return newMaps;
              });
            } else {
              setDefaultStickyNotes((prevNotes) => {
                const updated = prevNotes.map((n) =>
                  n.id === finalNoteCoords.id ? { ...n, x: finalNoteCoords.x, y: finalNoteCoords.y } : n
                );
                try {
                  localStorage.setItem('nettopology_default_sticky_notes_v1', JSON.stringify(updated));
                } catch (e) {}
                const movedNote = updated.find((n) => n.id === finalNoteCoords.id);
                if (movedNote?.linkedDeviceId) {
                  persistDeviceNoteToDatabase(movedNote).catch(() => {});
                }
                return updated;
              });
            }
          }
        }
        setDraggingNoteId(null);
        dragNoteLatestCoords.current = null;
      }

      if (isPanning) {
        setIsPanning(false);
        saveViewport(zoom, pan);
      }
      document.body.classList.remove('is-canvas-dragging');
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.body.classList.remove('is-canvas-dragging');
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [draggingNodeId, draggingRackId, draggingTowerId, draggingNoteId, isPanning, panStart, pan, zoom, currentCustomMap, customMaps, saveCustomMaps, saveNodePositions, saveViewport, activeMapId, globalDeviceViewMode]);

  // Synchronize global body dragging cursor and disable text-selection while any drag or pan is active
  useEffect(() => {
    const isAnyDragging = Boolean(
      isPanning ||
      draggingNodeId ||
      draggingRackId ||
      draggingTowerId ||
      draggingNoteId
    );
    if (isAnyDragging) {
      document.body.classList.add('is-canvas-dragging');
    } else {
      document.body.classList.remove('is-canvas-dragging');
    }
    return () => {
      document.body.classList.remove('is-canvas-dragging');
    };
  }, [isPanning, draggingNodeId, draggingRackId, draggingTowerId, draggingNoteId]);

  // Mouse Wheel Zoom with cursor focal anchoring
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Only zoom if hovering schematic canvas
      if (viewMode !== 'schematic') return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setZoom((prevZoom) => {
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        const targetZoom = Math.min(Math.max(prevZoom * factor, 0.2), 3.0);
        const cleanZoom = parseFloat(targetZoom.toFixed(2));

        if (cleanZoom === prevZoom) return prevZoom;

        // Keep world coordinate under mouse cursor stable
        setPan((prevPan) => {
          const worldX = (mouseX - prevPan.x) / prevZoom;
          const worldY = (mouseY - prevPan.y) / prevZoom;

          const newPanX = Math.round(mouseX - worldX * cleanZoom);
          const newPanY = Math.round(mouseY - worldY * cleanZoom);
          const newPan = { x: newPanX, y: newPanY };

          saveViewport(cleanZoom, newPan);
          return newPan;
        });

        return cleanZoom;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [viewMode, saveViewport]);

  const selectedNode = topology?.nodes.find((n) => n.id === selectedNodeId);

  // Filter nodes for search and building
  const filteredNodes = useMemo(() => {
    const allAvailable = allAvailableDevices;
    const rackDeviceIds = new Set<string>();
    const rackDeviceNames = new Set<string>();
    if (currentCustomMap?.racks) {
      currentCustomMap.racks.forEach((r) => {
        (r.devices || []).forEach((d) => {
          rackDeviceIds.add(d.id);
          rackDeviceIds.add(d.id.replace(/^hw-/, ''));
          if (d.name) rackDeviceNames.add(d.name.trim().toLowerCase());
        });
      });
    }

    const towerDeviceIds = new Set<string>();
    const towerDeviceNames = new Set<string>();
    if (currentCustomMap?.towers) {
      currentCustomMap.towers.forEach((t) => {
        (t.devices || []).forEach((d) => {
          towerDeviceIds.add(d.id);
          if (d.deviceId) towerDeviceIds.add(d.deviceId);
          if (d.name) towerDeviceNames.add(d.name.trim().toLowerCase());
        });
      });
    }

    const baseList =
      activeMapId !== 'default' && currentCustomMap
        ? allAvailable.filter((n) => {
            const cleanId = n.id.replace(/^hw-/, '').replace(/^radio-/, '');
            return (
              (currentCustomMap.deviceIds || []).includes(n.id) ||
              (currentCustomMap.deviceIds || []).includes(cleanId) ||
              rackDeviceIds.has(n.id) ||
              rackDeviceIds.has(cleanId) ||
              towerDeviceIds.has(n.id) ||
              towerDeviceIds.has(cleanId) ||
              (n.name && rackDeviceNames.has(n.name.trim().toLowerCase())) ||
              (n.name && towerDeviceNames.has(n.name.trim().toLowerCase()))
            );
          })
        : allAvailable;

    const filtered = baseList.filter((n) => {
      if (filterBuilding !== 'all' && n.building !== filterBuilding) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          n.name.toLowerCase().includes(q) ||
          n.ip.toLowerCase().includes(q) ||
          (n.building && n.building.toLowerCase().includes(q)) ||
          (n.floor && n.floor.toLowerCase().includes(q)) ||
          (n.unit && n.unit.toLowerCase().includes(q))
        );
      }
      return true;
    });

    // Deduplicate cards so the same physical device doesn't render two duplicate cards on canvas
    const deduplicated: Device[] = [];
    const seenNames = new Set<string>();
    for (const dev of filtered) {
      const nameKey = (dev.name || dev.id).trim().toLowerCase();
      if (!seenNames.has(nameKey)) {
        seenNames.add(nameKey);
        deduplicated.push(dev);
      }
    }
    return deduplicated;
  }, [allAvailableDevices, activeMapId, currentCustomMap, filterBuilding, searchQuery]);

  // Grouped hierarchy for Physical View
  const physicalHierarchy = useMemo(() => {
    interface FloorHierarchyData {
      allDevices: TopologyNode[];
      units: Record<string, TopologyNode[]>;
      racks: Record<string, TopologyNode[]>;
      general: TopologyNode[];
    }

    const groups: Record<string, Record<string, FloorHierarchyData>> = {};

    const ensureFloor = (b: string, f: string): FloorHierarchyData => {
      if (!groups[b]) groups[b] = {};
      if (!groups[b][f]) {
        groups[b][f] = {
          allDevices: [],
          units: {},
          racks: {},
          general: [],
        };
      }
      return groups[b][f];
    };

    // 1. Prepopulate custom added buildings
    customBuildings.forEach((b) => {
      if (!groups[b]) groups[b] = {};
    });

    // 2. Prepopulate custom added floors
    Object.entries(customFloors).forEach(([b, floors]) => {
      (floors as string[]).forEach((f) => {
        ensureFloor(b, f);
      });
    });

    // 3. Prepopulate custom added units
    Object.entries(customUnits).forEach(([key, unitList]) => {
      const [b, f] = key.split(':::');
      if (b && f) {
        const floorData = ensureFloor(b, f);
        (unitList as string[]).forEach((u) => {
          if (!floorData.units[u]) floorData.units[u] = [];
        });
      }
    });

    // 4. Prepopulate custom added racks
    Object.entries(customRacks).forEach(([key, rackList]) => {
      const [b, f] = key.split(':::');
      if (b && f) {
        const floorData = ensureFloor(b, f);
        (rackList as string[]).forEach((r) => {
          if (!floorData.racks[r]) floorData.racks[r] = [];
        });
      }
    });

    // 5. Populate from localNodes
    localNodes.forEach((d) => {
      const b = d.building || (isEn ? 'Other Buildings' : 'سایر ساختمان‌ها');
      const f = d.floor || (isEn ? 'Unassigned Floor' : 'طبقه نامشخص');
      const floorData = ensureFloor(b, f);
      floorData.allDevices.push(d);

      if (d.unit) {
        if (!floorData.units[d.unit]) floorData.units[d.unit] = [];
        floorData.units[d.unit].push(d);
      } else if (d.rack) {
        if (!floorData.racks[d.rack]) floorData.racks[d.rack] = [];
        floorData.racks[d.rack].push(d);
      } else {
        floorData.general.push(d);
      }
    });

    return groups;
  }, [localNodes, customBuildings, customFloors, customUnits, customRacks, isEn]);

  // Helper list of all buildings for manual relocation
  const allBuildingOptions = useMemo(() => {
    const set = new Set<string>();
    localNodes.forEach((n) => {
      if (n.building) set.add(n.building);
    });
    customBuildings.forEach((b) => set.add(b));
    if (set.size === 0) {
      set.add(isEn ? 'Central HQ Building' : 'ساختمان مرکزی');
    }
    return Array.from(set);
  }, [localNodes, customBuildings, isEn]);

  // Helper list of floors for the selected building in relocation modal
  const allFloorOptionsForSelectedBuilding = useMemo(() => {
    const targetBldg = relocateTargetBuilding || allBuildingOptions[0] || '';
    const set = new Set<string>();
    localNodes
      .filter((n) => n.building === targetBldg)
      .forEach((n) => {
        if (n.floor) set.add(n.floor);
      });
    if (customFloors[targetBldg]) {
      customFloors[targetBldg].forEach((f) => set.add(f));
    }
    if (set.size === 0) {
      set.add(isEn ? 'Floor 1' : 'طبقه ۱');
      set.add(isEn ? 'Floor 2' : 'طبقه ۲');
    }
    return Array.from(set);
  }, [relocateTargetBuilding, allBuildingOptions, localNodes, customFloors, isEn]);

  // Helper list of units for selected building + floor in relocation modal
  const allUnitOptionsForSelectedFloor = useMemo(() => {
    const targetBldg =
      relocateTargetBuilding === '__CUSTOM__'
        ? customRelocateBuilding
        : relocateTargetBuilding || allBuildingOptions[0] || '';
    const targetFl =
      relocateTargetFloor === '__CUSTOM__'
        ? customRelocateFloor
        : relocateTargetFloor || allFloorOptionsForSelectedBuilding[0] || '';
    const set = new Set<string>();
    localNodes
      .filter((n) => n.building === targetBldg && n.floor === targetFl)
      .forEach((n) => {
        if (n.unit) set.add(n.unit);
      });
    const key = `${targetBldg}:::${targetFl}`;
    if (customUnits[key]) {
      customUnits[key].forEach((u) => set.add(u));
    }
    return Array.from(set);
  }, [
    relocateTargetBuilding,
    customRelocateBuilding,
    relocateTargetFloor,
    customRelocateFloor,
    allBuildingOptions,
    allFloorOptionsForSelectedBuilding,
    localNodes,
    customUnits,
  ]);

  // Helper list of racks for selected building + floor in relocation modal
  const allRackOptionsForSelectedFloor = useMemo(() => {
    const targetBldg =
      relocateTargetBuilding === '__CUSTOM__'
        ? customRelocateBuilding
        : relocateTargetBuilding || allBuildingOptions[0] || '';
    const targetFl =
      relocateTargetFloor === '__CUSTOM__'
        ? customRelocateFloor
        : relocateTargetFloor || allFloorOptionsForSelectedBuilding[0] || '';
    const set = new Set<string>();
    localNodes
      .filter((n) => n.building === targetBldg && n.floor === targetFl)
      .forEach((n) => {
        if (n.rack) set.add(n.rack);
      });
    const key = `${targetBldg}:::${targetFl}`;
    if (customRacks[key]) {
      customRacks[key].forEach((r) => set.add(r));
    }
    return Array.from(set);
  }, [
    relocateTargetBuilding,
    customRelocateBuilding,
    relocateTargetFloor,
    customRelocateFloor,
    allBuildingOptions,
    allFloorOptionsForSelectedBuilding,
    localNodes,
    customRacks,
  ]);

  // Render a device card inside physical view (used in units, racks, and general floor)
  const renderDeviceCard = (
    device: TopologyNode,
    bldgName: string,
    floorName: string,
    unitName?: string,
    rackName?: string
  ) => {
    const isBeingDragged = draggedDevice?.id === device.id;
    const isCurrentlyMoving = movingDeviceId === device.id;
    const cleanDeviceId = device.id.replace(/^hw-/, '');
    const isNeonHighlighted =
      neonHighlightedNode !== null &&
      (
        neonHighlightedNode.matchedAliases.includes(device.id) ||
        neonHighlightedNode.matchedAliases.includes(cleanDeviceId) ||
        neonHighlightedNode.matchedAliases.includes(`hw-${cleanDeviceId}`) ||
        (neonHighlightedNode.targetName && device.name && device.name.trim().toLowerCase() === neonHighlightedNode.targetName) ||
        (neonHighlightedNode.targetIp && device.ip && device.ip.trim() === neonHighlightedNode.targetIp)
      );

    return (
      <div
        key={device.id}
        id={`physical-device-${device.id}`}
        draggable={!movingDeviceId}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('text/plain', device.id);
          e.dataTransfer.setData(
            'application/json',
            JSON.stringify({
              deviceId: device.id,
              fromBuilding: bldgName,
              fromFloor: floorName,
              fromUnit: unitName || '',
              fromRack: rackName || '',
            })
          );
          e.dataTransfer.effectAllowed = 'move';
          setDraggedDevice({
            id: device.id,
            name: device.name,
            type: device.type,
            fromBuilding: bldgName,
            fromFloor: floorName,
            fromUnit: unitName,
            fromRack: rackName,
          });
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          setDraggedDevice(null);
          setDragOverTarget(null);
        }}
        onClick={() => setSelectedNodeId(device.id)}
        className={`p-3 rounded-xl border transition-all shadow-lg backdrop-blur-xl select-none relative ${
          isNeonHighlighted
            ? 'neon-card-beam-active ring-2 ring-offset-1 ring-offset-slate-950 scale-102 z-30'
            : isBeingDragged
            ? 'opacity-30 border-dashed border-cyan-400 ring-2 ring-cyan-400/40 scale-95 cursor-grabbing'
            : selectedNodeId === device.id
            ? 'spatial-glass border-cyan-400 ring-2 ring-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.3)] cursor-grab hover:shadow-2xl'
            : device.is_online
            ? 'spatial-glass spatial-glass-hover border-white/10 cursor-grab hover:shadow-2xl'
            : 'spatial-glass border-rose-500/30 bg-rose-950/20 cursor-grab'
        }`}
        style={
          isNeonHighlighted && neonHighlightedNode
            ? {
                borderColor: neonHighlightedNode.colorHex,
                boxShadow: `0 0 14px rgba(${neonHighlightedNode.colorRgb}, 0.35), 0 4px 18px rgba(0, 0, 0, 0.6)`,
                ['--neon-color' as any]: neonHighlightedNode.colorHex,
                ['--neon-rgb' as any]: neonHighlightedNode.colorRgb,
              }
            : undefined
        }
      >
        {/* Rotating Neon Border Beam travelling cleanly around the card border */}
        {isNeonHighlighted && neonHighlightedNode && (
          <div className="absolute -inset-[3px] pointer-events-none rounded-[14px] overflow-hidden z-40">
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <filter id={`neon-beam-glow-physcard-${device.id}`} x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect
                x="1.5"
                y="1.5"
                width="calc(100% - 3px)"
                height="calc(100% - 3px)"
                rx="13"
                fill="none"
                stroke={neonHighlightedNode.colorHex}
                strokeOpacity="0.25"
                strokeWidth="1.5"
              />
              <rect
                x="1.5"
                y="1.5"
                width="calc(100% - 3px)"
                height="calc(100% - 3px)"
                rx="13"
                fill="none"
                stroke={neonHighlightedNode.colorHex}
                strokeWidth="3.5"
                pathLength="100"
                strokeDasharray="25 75"
                strokeLinecap="round"
                className="neon-border-beam-anim"
                filter={`url(#neon-beam-glow-physcard-${device.id})`}
              />
              <rect
                x="1.5"
                y="1.5"
                width="calc(100% - 3px)"
                height="calc(100% - 3px)"
                rx="13"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                pathLength="100"
                strokeDasharray="12 88"
                strokeLinecap="round"
                className="neon-border-beam-anim"
              />
            </svg>
          </div>
        )}

        {/* Floating Target Badge indicator */}
        {isNeonHighlighted && neonHighlightedNode && (
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono flex items-center gap-1 shadow-xl pointer-events-none z-50 whitespace-nowrap border border-white/60"
            style={{
              backgroundColor: neonHighlightedNode.colorHex,
              color: ['#ffff00', '#ffee00', '#39ff14', '#00ffd5'].includes(neonHighlightedNode.colorHex) ? '#020617' : '#ffffff',
              boxShadow: `0 0 10px ${neonHighlightedNode.colorHex}`,
            }}
          >
            <Sparkles className="w-3 h-3 animate-spin" />
            <span>{isEn ? 'Target Device' : 'تجهیز هدف'}</span>
            <span className="text-[9px] opacity-85 px-1 py-0.2 rounded bg-black/40 font-mono">3s</span>
          </div>
        )}
        {/* Card Header with Grip Handle */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className="text-slate-400 hover:text-cyan-300 p-0.5 cursor-grab active:cursor-grabbing"
              title={t('topology_physical_drag_hint')}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            <div
              className={`p-1.5 rounded-lg ${
                device.type === 'switch'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : device.type === 'router'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              }`}
            >
              {device.type === 'switch' ? (
                <Server className="w-3 h-3" />
              ) : device.type === 'router' ? (
                <RouterIcon className="w-3 h-3" />
              ) : (
                <Wifi className="w-3 h-3" />
              )}
            </div>
            <span className="font-bold text-xs text-white truncate font-mono">
              {device.name}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isCurrentlyMoving ? (
              <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Moving...</span>
              </span>
            ) : (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  device.is_online
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {device.is_online ? 'ONLINE' : 'OFFLINE'}
              </span>
            )}
          </div>
        </div>

        <div className="text-[11px] font-mono font-bold text-indigo-300 mb-1">
          {device.ip}
        </div>

        <div className="text-[10px] text-slate-400 space-y-0.5">
          {device.unit && (
            <div className="flex items-center gap-1">
              <Box className="w-2.5 h-2.5 text-indigo-400" />
              <span>{t('topology_unit_label')} {device.unit}</span>
            </div>
          )}
          {device.rack && (
            <div className="flex items-center gap-1 text-slate-300 font-mono">
              <Server className="w-2.5 h-2.5 text-cyan-400" />
              <span>{t('topology_rack_label')} {device.rack}</span>
            </div>
          )}
        </div>

        {/* Action Buttons: Inspect Ports, Card View & Manual Relocate */}
        <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px] gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInspectPorts(device as unknown as Device);
            }}
            className="text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            <Cable className="w-3 h-3" />
            <span>{t('topology_inspect_ports_btn')}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSwitchToCardWithHighlight(device.id);
            }}
            className="text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1 font-medium cursor-pointer"
            title={isEn ? 'Switch to Card View & Highlight (Neon)' : 'مشاهده در نمای کارت با هایلایت نئونی'}
          >
            <CreditCard className="w-3 h-3 text-purple-400" />
            <span>{isEn ? 'Card' : 'کارت'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRelocateDevice(device);
              setRelocateTargetBuilding(bldgName);
              setRelocateTargetFloor(floorName);
              setRelocateTargetUnit(device.unit || '__NONE__');
              setRelocateTargetRack(device.rack || '__NONE__');
              setCustomRelocateBuilding('');
              setCustomRelocateFloor('');
              setCustomRelocateUnit('');
              setCustomRelocateRack('');
            }}
            className="text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 font-medium cursor-pointer"
            title={t('topology_physical_relocate_btn')}
          >
            <Move className="w-3 h-3" />
            <span>{t('topology_physical_relocate_btn')}</span>
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <NetworkSocketLoader
          isEn={isEn}
          message={isEn ? 'Loading Network Topology Map' : 'در حال بارگذاری نقشه شماتیک توپولوژی'}
          subMessage={isEn ? 'Syncing node telemetry and port interconnections' : 'همگام‌سازی ارتباطات و دیتای زنده پورت‌ها'}
        />
      </div>
    );
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`${isRtl ? 'text-right' : 'text-left'} overflow-hidden text-slate-100 transition-all duration-300 ${
        isFullMode
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[99999] bg-slate-950 flex flex-col m-0 p-0 shadow-2xl'
          : 'flex flex-col h-full min-h-[500px] bg-transparent'
      }`}
    >
      {/* Top Toolbar */}
      {(!isFullMode || showToolbarInFullMode) && (
        <div className="p-2 sm:px-4 spatial-glass border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs z-20 shadow-xl backdrop-blur-xl">
          {/* View Switcher */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-900/60 rounded-xl p-1 border border-white/10">
              <button
                onClick={() => setViewMode('schematic')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  viewMode === 'schematic'
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md font-semibold'
                    : 'text-white hover:text-white hover:bg-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-white" />
                <span className="text-white">{t('topology_tab_schematic')}</span>
              </button>
              <button
                onClick={() => setViewMode('physical')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  viewMode === 'physical'
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md font-semibold'
                    : 'text-white hover:text-white hover:bg-white/10'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-white" />
                <span className="text-white">{t('topology_tab_physical')}</span>
              </button>
            </div>

            <label className="hidden md:flex items-center gap-1.5 text-slate-300 text-xs cursor-pointer mx-2">
              <input
                type="checkbox"
                checked={showPortLabels}
                onChange={(e) => setShowPortLabels(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-500 bg-slate-900 border-white/20 focus:ring-indigo-500"
              />
              <span>{t('topology_show_ports')}</span>
            </label>

            {/* Live Data Traffic Flow Animation Toggle */}
            <label
              data-component="data-flow-toggle"
              className="hidden sm:flex items-center gap-1.5 text-xs cursor-pointer mx-1 select-none px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-800 border border-white/20 transition shadow-xs"
              style={{ color: '#ffffff' }}
              title={isEn ? 'Toggle live animated data flow packets between connected devices' : 'فعال/غیرفعال‌سازی انیمیشن انتقال زنده داده بین تجهیزات متصل'}
            >
              <input
                type="checkbox"
                checked={showTrafficAnimation}
                onChange={(e) => setShowTrafficAnimation(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-cyan-400 bg-slate-900 border-white/30 focus:ring-cyan-400 cursor-pointer"
              />
              <span className="flex items-center gap-1.5" style={{ color: '#ffffff' }}>
                <Activity className={`w-3.5 h-3.5 text-white ${showTrafficAnimation ? 'animate-pulse' : ''}`} style={{ color: '#ffffff' }} />
                <span className="text-white font-medium !text-white" style={{ color: '#ffffff' }}>
                  {isEn ? 'Data Flow' : 'جریان داده'}
                </span>
              </span>
            </label>
          </div>

          {/* Filters & Actions */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Status Indicator for Custom Positions */}
            {viewMode === 'schematic' && hasSavedPositions && (
              <div className="hidden lg:flex items-center gap-1 text-[11px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded-lg border border-cyan-500/20">
                <Check className="w-3 h-3 text-cyan-400" />
                <span>{t('topology_custom_layout_saved')}</span>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder={t('topology_search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`px-3 py-1.5 ${isRtl ? 'pr-8' : 'pl-8'} rounded-xl bg-slate-900/70 border border-white/15 text-slate-100 text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-400 w-44 sm:w-52`}
              />
              <Search className={`w-3.5 h-3.5 text-slate-400 absolute ${isRtl ? 'right-2.5' : 'left-2.5'} top-2`} />
            </div>

            {/* Building Filter */}
            <select
              value={filterBuilding}
              onChange={(e) => setFilterBuilding(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-900/70 border border-white/15 text-slate-200 text-xs focus:outline-none focus:border-indigo-400"
            >
              <option value="all">{t('topology_all_buildings')}</option>
              {topology?.buildings?.map((b: any, index: number) => {
                const bldgName = typeof b === 'string' ? b : b?.name || t('topology_building_num', { num: index + 1 });
                return (
                  <option key={`bldg-${index}-${bldgName}`} value={bldgName}>
                    {bldgName}
                  </option>
                );
              })}
            </select>

            {/* Run CDP/LLDP Scan */}
            <button
              onClick={onScanCdpLldp}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-medium shadow-md transition disabled:opacity-50 active:scale-95"
              title={t('topology_scan_title')}
            >
              <Zap className={`w-3.5 h-3.5 text-cyan-300 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? t('topology_scanning') : t('topology_scan_cdp_lldp')}</span>
            </button>

            {/* Comprehensive CDP/LLDP Discovery Modal */}
            <button
              onClick={() => {
                if (onOpenDiscoveryModal) {
                  onOpenDiscoveryModal();
                } else {
                  setIsDiscoveryModalOpen(true);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-cyan-500/20 transition active:scale-95 cursor-pointer"
              title={isEn ? 'Open CDP & LLDP Topology Discovery Modal' : 'کشف هوشمند اتصالات و توپولوژی با CDP و LLDP'}
            >
              <Radar className="w-3.5 h-3.5 text-cyan-200" />
              <span>{isEn ? 'Discover Topology' : 'کشف هوشمند توپولوژی'}</span>
            </button>

            {/* Canvas Controls */}
            {viewMode === 'schematic' && (
              <div className="flex items-center gap-1 bg-slate-900/60 border border-white/10 rounded-xl p-1">
                <button
                  onClick={() => {
                    const newZoom = Math.min(zoom + 0.15, 3.0);
                    setZoom(parseFloat(newZoom.toFixed(2)));
                    saveViewport(newZoom, pan);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                  title={t('topology_zoom_in_title')}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const newZoom = Math.max(zoom - 0.15, 0.2);
                    setZoom(parseFloat(newZoom.toFixed(2)));
                    saveViewport(newZoom, pan);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
                  title={t('topology_zoom_out_title')}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleResetView}
                  disabled={isRefreshingView}
                  className={`p-1.5 rounded-lg transition ${
                    isRefreshingView
                      ? 'text-cyan-400 bg-cyan-500/20 cursor-wait'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={t('topology_zoom_reset_title')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingView ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={toggleFullMode}
                  className={`p-1.5 rounded-lg transition ${
                    isFullMode ? 'text-amber-300 bg-amber-500/20' : 'text-slate-400 hover:text-white'
                  }`}
                  title={isFullMode ? t('topology_exit_full_mode') : t('topology_fullscreen_title')}
                >
                  {isFullMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                {hasSavedPositions && (
                  <button
                    onClick={handleResetPositions}
                    className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition border-r border-white/10 pr-1.5 mr-0.5"
                    title={t('topology_reset_layout_title')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Map Secondary Toolbar & Cabling Step Banner */}
      {viewMode === 'schematic' && (!isFullMode || showToolbarInFullMode) && (
        <div className="border-b border-white/10 bg-slate-900/90 backdrop-blur-xl z-20">
          {isSecondaryToolbarCollapsed ? (
            /* Collapsed State: Minimal compact bar */
            <div className="py-1 px-3 sm:px-4 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSecondaryToolbarCollapsed(false);
                    try {
                      localStorage.setItem('nettopology_schematic_toolbar_collapsed', 'false');
                    } catch (e) {}
                  }}
                  className="p-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 transition cursor-pointer flex items-center gap-1.5 text-[11px] font-medium"
                  title={t('topology_expand_toolbar')}
                  aria-label={t('topology_expand_toolbar')}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <MapIcon className="w-3 h-3" />
                  <span>{t('topology_map_selector_label')}</span>
                </button>
                <span className="text-[11px] text-slate-400 font-mono">
                  {activeMapId === 'default' ? t('topology_map_auto_discovered') : (currentCustomMap?.name || activeMapId)}
                </span>
              </div>
              <div className="text-[10px] text-slate-500">
                {isEn ? 'Toolbar minimized' : 'نوار ابزار کوچک شده'}
              </div>
            </div>
          ) : (
            /* Map Selector & Tool Bar */
            <div className="p-2 sm:px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Map Selector & Management */}
              <div className="flex items-center flex-wrap gap-2">
                {/* Toggle Collapse/Expand Button for Toolbar */}
                <button
                  type="button"
                  onClick={() => {
                    setIsSecondaryToolbarCollapsed(true);
                    try {
                      localStorage.setItem('nettopology_schematic_toolbar_collapsed', 'true');
                    } catch (e) {}
                  }}
                  className="p-1.5 rounded-xl border transition cursor-pointer flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-white/10"
                  title={t('topology_collapse_toolbar')}
                  aria-label={t('topology_collapse_toolbar')}
                >
                  <ChevronUp className="w-4 h-4" />
                </button>

              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('topology_map_selector_label')}</span>
              </div>
              <select
                value={activeMapId}
                onChange={(e) => handleSelectMap(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 border border-white/15 text-slate-100 text-xs font-medium focus:outline-none focus:border-indigo-400"
              >
                <option value="default">{t('topology_map_auto_discovered')}</option>
                {customMaps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.visibility === 'private' ? '🔒 ' : map.visibility === 'restricted' ? '👥 ' : '🌐 '}
                    {map.name} ({map.deviceIds?.length || 0} dev, {map.links?.length || 0} links)
                  </option>
                ))}
              </select>

              {activeMapId !== 'default' && currentCustomMap && (
                <div className="flex items-center">
                  {currentCustomMap.visibility === 'private' ? (
                    <span
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300"
                      title={isEn ? 'Private map (Visible only to creator)' : 'نقشه محرمانه (فقط سازنده)'}
                    >
                      <Lock className="w-3 h-3 text-amber-400" />
                      <span>{isEn ? 'Private' : 'شخصی'}</span>
                    </span>
                  ) : currentCustomMap.visibility === 'restricted' ? (
                    <span
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300"
                      title={
                        isEn
                          ? `Restricted to: ${currentCustomMap.allowedUsers?.join(', ') || 'selected users'}`
                          : `محدود به: ${currentCustomMap.allowedUsers?.join('، ') || 'کاربران منتخب'}`
                      }
                    >
                      <Users className="w-3 h-3 text-cyan-400" />
                      <span>{isEn ? 'Restricted' : 'محدود'}</span>
                    </span>
                  ) : (
                    <span
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                      title={isEn ? 'Public map (Visible to all users)' : 'نقشه عمومی (تمام کاربران)'}
                    >
                      <Globe className="w-3 h-3 text-emerald-400" />
                      <span>{isEn ? 'Public' : 'عمومی'}</span>
                    </span>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setManageMapMode('create');
                  setIsManageMapOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-xs transition active:scale-95"
                title={t('topology_map_new_btn')}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('topology_map_new_btn')}</span>
              </button>

              {/* If custom map selected: Rename & Delete buttons */}
              {activeMapId !== 'default' && currentCustomMap && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setManageMapMode('edit');
                      setIsManageMapOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition"
                    title={t('topology_map_rename_btn')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManageMapMode('delete');
                      setIsManageMapOpen(true);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 border border-white/10 transition"
                    title={t('topology_map_delete_btn')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Custom Map Tools: Select Tool, Cable Tool, Add Device, Clear Links */}
            {activeMapId !== 'default' && currentCustomMap && (
              <div className="flex items-center flex-wrap gap-2">
                <div className="flex items-center bg-slate-800/90 rounded-xl p-1 border border-white/15 shadow-inner toolbar-dark-pill force-white-text">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTool('select');
                      setCableWorkflow({ step: 'idle', sourceDevice: null, sourcePort: null, targetDevice: null, targetPort: null });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      activeTool === 'select'
                        ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-xs font-semibold'
                        : 'text-white hover:text-white hover:bg-white/15'
                    }`}
                  >
                    <MousePointer className="w-3.5 h-3.5 text-white" />
                    <span className="text-white font-medium" style={{ color: '#ffffff' }}>{t('topology_tool_select')}</span>
                  </button>
                  {globalDeviceViewMode === 'card' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTool('cable');
                        setCableWorkflow({ step: 'idle', sourceDevice: null, sourcePort: null, targetDevice: null, targetPort: null });
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                        activeTool === 'cable'
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs font-bold animate-pulse'
                          : 'text-white hover:text-white hover:bg-white/15'
                      }`}
                    >
                      <Cable className="w-3.5 h-3.5 text-white" />
                      <span className="text-white font-medium" style={{ color: '#ffffff' }}>{t('topology_tool_cable')}</span>
                    </button>
                  )}
                </div>

                {/* Add Device Button - only displayed in Card view mode */}
                {globalDeviceViewMode === 'card' && (
                  <button
                    type="button"
                    onClick={() => setIsAddDeviceOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-xs transition active:scale-95 text-xs cursor-pointer"
                    title={isEn ? "Add network device to map" : "افزودن تجهیز شبکه به نقشه"}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('topology_tool_add_device')}</span>
                  </button>
                )}

                {/* Physical View Exclusive Button: Add Hardware, Rack & Tower Modal */}
                {globalDeviceViewMode === 'physical' && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddHardware()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-xs transition active:scale-95 text-xs cursor-pointer"
                    title={isEn ? "Add standard server rack, telecom tower, or install hardware equipment" : "افزودن رک سرور، دکل مخابراتی یا نصب تجهیزات سخت‌افزاری"}
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Add Rack / Tower / Hardware' : 'افزودن رک / دکل / تجهیزات'}</span>
                  </button>
                )}

                {/* Global Device Display Mode: Card (Cabling) vs Physical (Chassis/Rackmount) */}
                <div data-component="device-view-mode-toggle" className="flex items-center bg-slate-800/90 rounded-xl p-1 border border-white/15 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setGlobalDeviceViewMode('card')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      globalDeviceViewMode === 'card'
                        ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-xs font-semibold'
                        : 'text-white hover:text-white hover:bg-white/15 opacity-90 hover:opacity-100'
                    }`}
                    style={{ color: '#ffffff' }}
                    title={isEn ? 'Card Mode (For port cabling & connections)' : 'نمای کارتی (برای کابل‌کشی و اتصالات پورت‌ها)'}
                  >
                    <CreditCard className="w-3.5 h-3.5 text-white" style={{ color: '#ffffff' }} />
                    <span className="!text-white font-medium" style={{ color: '#ffffff' }}>{isEn ? 'Card' : 'کارت'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalDeviceViewMode('physical');
                      if (activeTool === 'cable') {
                        setActiveTool('select');
                      }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      globalDeviceViewMode === 'physical'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs font-semibold'
                        : 'text-white hover:text-white hover:bg-white/15 opacity-90 hover:opacity-100'
                    }`}
                    style={{ color: '#ffffff' }}
                    title={isEn ? 'Physical Mode (Photorealistic chassis for rack mounting)' : 'نمای سخت‌افزار (شاسی واقعی جهت نصب در رک)'}
                  >
                    <Server className="w-3.5 h-3.5 text-white" style={{ color: '#ffffff' }} />
                    <span className="!text-white font-medium" style={{ color: '#ffffff' }}>{isEn ? 'Physical' : 'فیزیکی'}</span>
                  </button>
                </div>

                {/* Sticky Notes Toggle & Add Note */}
                <div data-component="sticky-note-controls" className="flex items-center gap-1.5 bg-slate-800/90 rounded-xl px-2.5 py-1 border border-white/15">
                  <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={showStickyNotes}
                      onChange={toggleShowStickyNotes}
                      className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-white/20 focus:ring-amber-500 cursor-pointer"
                    />
                    <StickyNote className="w-3.5 h-3.5 text-amber-400" />
                    <span className="!text-white font-medium" style={{ color: '#ffffff' }}>{isEn ? 'Notes' : 'یادداشت‌ها'}</span>
                  </label>
                  {showStickyNotes && (
                    <button
                      type="button"
                      onClick={handleAddStickyNote}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/30 hover:bg-amber-500/40 text-white hover:text-white border border-amber-400/40 transition text-[11px] active:scale-95 font-medium ml-1 cursor-pointer"
                      style={{ color: '#ffffff' }}
                      title={isEn ? 'Add new sticky note on canvas' : 'افزودن یادداشت استیکی جدید روی نقشه'}
                    >
                      <Plus className="w-3 h-3 text-white" style={{ color: '#ffffff' }} />
                      <span className="!text-white font-medium" style={{ color: '#ffffff' }}>{isEn ? 'Add Note' : 'افزودن'}</span>
                    </button>
                  )}
                </div>

                {(currentCustomMap.links?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllCustomLinks}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 border border-white/10 text-slate-300 hover:text-rose-300 transition text-[11px]"
                    title={t('topology_tool_clear_links')}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t('topology_tool_clear_links')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Persistent Guided Cabling Banner */}
          {activeTool === 'cable' && activeMapId !== 'default' && (
            <div className="px-4 py-2 bg-gradient-to-r from-purple-900/90 to-indigo-900/90 border-t border-purple-500/30 flex items-center justify-between text-xs text-white shadow-inner">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-purple-500/30 animate-pulse">
                  <Cable className="w-4 h-4 text-purple-300" />
                </div>
                <div className="flex items-center flex-wrap gap-1.5">
                  <span className="font-bold">
                    {cableWorkflow.step === 'select_target_device'
                      ? t('topology_cable_step_target')
                      : t('topology_cable_step_source')}
                  </span>
                  {cableWorkflow.sourceDevice && cableWorkflow.sourcePort && (
                    <span className="font-mono text-[11px] bg-purple-950/90 px-2 py-0.5 rounded-md border border-purple-400/40 text-purple-200">
                      {cableWorkflow.sourceDevice.name} : {cableWorkflow.sourcePort}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTool('select');
                  setCableWorkflow({ step: 'idle', sourceDevice: null, sourcePort: null, targetDevice: null, targetPort: null });
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t('topology_cable_cancel')}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* VIEW 1: Interactive Schematic SVG Canvas */}
        {viewMode === 'schematic' ? (
          <div
            ref={containerRef}
            onMouseDown={handleCanvasMouseDown}
            className={`flex-1 h-full relative overflow-hidden bg-slate-950/80 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] select-none schematic-canvas ${
              isPanning || draggingNodeId || draggingRackId || draggingTowerId || draggingNoteId
                ? 'cursor-grabbing'
                : 'cursor-grab'
            }`}
            style={{
              backgroundPosition: `${pan.x}px ${pan.y}px`,
              backgroundSize: `${Math.round(24 * Math.max(0.6, Math.min(zoom, 1.4)))}px ${Math.round(24 * Math.max(0.6, Math.min(zoom, 1.4)))}px`,
            }}
          >
            {/* Top-Center Floating Feedback Toast with Smooth Fade-Out */}
            {feedbackToast && (
              <div
                className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 transition-all duration-700 ease-out ${
                  isToastFading
                    ? 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
                    : 'opacity-100 translate-y-0 scale-100 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200'
                }`}
              >
                <div
                  className={`p-2.5 px-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-xl backdrop-blur-xl transition-all duration-300 ${
                    isLightMode
                      ? feedbackToast.type === 'success'
                        ? 'bg-emerald-50/95 border-emerald-300 text-emerald-950 shadow-emerald-900/10'
                        : feedbackToast.type === 'error'
                        ? 'bg-rose-50/95 border-rose-300 text-rose-950 shadow-rose-900/10'
                        : 'bg-sky-50/95 border-sky-300 text-sky-950 shadow-sky-900/10'
                      : feedbackToast.type === 'success'
                      ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100 shadow-xl'
                      : feedbackToast.type === 'error'
                      ? 'bg-rose-950/95 border-rose-500/60 text-rose-100 shadow-xl'
                      : 'bg-cyan-950/95 border-cyan-500/60 text-cyan-100 shadow-xl'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {feedbackToast.type === 'success' ? (
                      <CheckCircle className={`w-4 h-4 shrink-0 ${isLightMode ? 'text-emerald-600' : 'text-emerald-400'}`} />
                    ) : feedbackToast.type === 'error' ? (
                      <AlertCircle className={`w-4 h-4 shrink-0 ${isLightMode ? 'text-rose-600' : 'text-rose-400'}`} />
                    ) : (
                      <Info className={`w-4 h-4 shrink-0 ${isLightMode ? 'text-sky-600' : 'text-cyan-400'}`} />
                    )}
                    <span
                      title={feedbackToast.message}
                      className={`font-semibold leading-relaxed ${isLightMode ? 'text-slate-900' : 'text-white'}`}
                    >
                      {feedbackToast.message}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsToastFading(false);
                      setFeedbackToast(null);
                    }}
                    className={`p-1 rounded-lg transition cursor-pointer shrink-0 ${
                      isLightMode ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Top-Left Floating Controls: Fullscreen Toggle & Tools */}
            <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFullMode}
                className={`group relative flex items-center justify-center p-2.5 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-200 active:scale-95 ${
                  isFullMode
                    ? 'bg-gradient-to-r from-amber-500/25 to-rose-500/25 border-amber-500/50 text-amber-300 hover:bg-amber-500/35 shadow-[0_0_25px_rgba(245,158,11,0.4)]'
                    : 'bg-slate-900/85 hover:bg-slate-800 border-white/20 hover:border-cyan-400/50 text-slate-200 hover:text-cyan-300 shadow-[0_0_20px_rgba(0,0,0,0.5)]'
                }`}
                title={isFullMode ? t('topology_exit_full_mode') : t('topology_fullscreen_title')}
                aria-label={isFullMode ? t('topology_exit_full_mode') : t('topology_fullscreen_title')}
              >
                {isFullMode ? (
                  <Minimize2 className="w-5 h-5 text-amber-300" />
                ) : (
                  <Maximize2 className="w-5 h-5 text-cyan-300 group-hover:scale-110 transition-transform" />
                )}

                {/* Tooltip on hover */}
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-3 py-1.5 rounded-lg bg-slate-900/95 border border-white/20 text-white text-xs font-medium whitespace-nowrap shadow-2xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50">
                  {isFullMode ? t('topology_exit_full_mode') : t('topology_fullscreen_title')}
                </div>
              </button>

              {isFullMode && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowToolbarInFullMode((prev) => !prev)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/25 hover:border-white/40 text-xs text-white font-medium shadow-xl backdrop-blur-xl transition active:scale-95 cursor-pointer toolbar-dark-btn force-white-text"
                    title={showToolbarInFullMode ? t('topology_hide_toolbar') : t('topology_show_toolbar')}
                  >
                    <span className="text-white font-medium" style={{ color: '#ffffff' }}>{showToolbarInFullMode ? t('topology_hide_toolbar') : t('topology_show_toolbar')}</span>
                  </button>

                  <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>{t('topology_fullscreen_hint')}</span>
                  </div>
                </>
              )}
            </div>

            {/* SVG Schematic Canvas - Unbounded Infinite Viewport */}
            <svg
              className="w-full h-full absolute inset-0 select-none overflow-visible pointer-events-auto cursor-inherit"
              style={{ overflow: 'visible' }}
            >
              <defs>
                {/* Subtle shadow filter for links */}
                <filter id="glow-trunk" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#7c3aed" floodOpacity="0.3" />
                </filter>
                <filter id="glow-access" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#2563eb" floodOpacity="0.25" />
                </filter>

                {/* Packet Beacon & Flow Pulse Glow Filter */}
                <filter id="glow-packet" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Infinite World Canvas Group - Pan & Zoom Coordinate Space */}
              <g
                className="canvas-world"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                  transition: isPanning || draggingNodeId ? 'none' : 'transform 0.12s ease-out',
                }}
              >
              {/* Draw Topology Connection Links - only visible in Card view mode */}
              {globalDeviceViewMode === 'card' && (
                activeMapId === 'default' ? (
                  topology?.links.map((link) => {
                  const sourcePos = nodePositions.get(link.source);
                  const targetPos = nodePositions.get(link.target);
                  if (!sourcePos || !targetPos) return null;

                  const isTrunk = link.type === 'trunk';
                  const isDown = link.status === 'down';
                  const isSelected = selectedNodeId === link.source || selectedNodeId === link.target;

                  // Center coordinates of nodes (230x120 dimension)
                  const x1 = sourcePos.x + 115;
                  const y1 = sourcePos.y + 55;
                  const x2 = targetPos.x + 115;
                  const y2 = targetPos.y + 55;

                  const pairKey = [link.source, link.target].sort().join('___');
                  const group = defaultLinkGroups.get(pairKey) || [link];
                  const indexInGroup = group.findIndex((l: any) => l.id === link.id);
                  const totalInGroup = group.length;

                  const isReversed = link.source > link.target;
                  const curve = getLinkCurve(x1, y1, x2, y2, indexInGroup >= 0 ? indexInGroup : 0, totalInGroup, isReversed);

                  return (
                    <g key={link.id} className="transition-all pointer-events-none">
                      {/* Link Line */}
                      <path
                        d={curve.pathD}
                        fill="none"
                        stroke={
                          isDown
                            ? '#ef4444'
                            : isTrunk
                            ? isSelected
                              ? '#6d28d9'
                              : '#7c3aed'
                            : isSelected
                            ? '#1d4ed8'
                            : '#2563eb'
                        }
                        strokeWidth={isTrunk ? 3 : 2}
                        strokeDasharray={isDown ? '6 4' : 'none'}
                        filter={isTrunk && !isDown ? 'url(#glow-trunk)' : 'url(#glow-access)'}
                        opacity={isSelected ? 1 : 0.85}
                      />

                      {/* Animated Live Data Flow Effect on Link */}
                      {!isDown && showTrafficAnimation && (
                        <g className="pointer-events-none select-none">
                          {/* Flowing Dash Stream Overlay on Cable */}
                          <path
                            d={curve.pathD}
                            fill="none"
                            stroke={isTrunk ? '#d8b4fe' : '#93c5fd'}
                            strokeWidth={isTrunk ? 2 : 1.5}
                            strokeDasharray="4 12"
                            strokeLinecap="round"
                            opacity={0.7}
                          >
                            <animate
                              attributeName="stroke-dashoffset"
                              from="32"
                              to="0"
                              dur={isTrunk ? '0.9s' : '1.3s'}
                              repeatCount="indefinite"
                            />
                          </path>

                          {/* Forward Data Packet: Source -> Target */}
                          <circle r={isTrunk ? 3.5 : 3} fill={isTrunk ? '#f472b6' : '#38bdf8'} filter="url(#glow-packet)">
                            <animateMotion
                              dur={isTrunk ? '1.8s' : '2.4s'}
                              repeatCount="indefinite"
                              path={curve.pathD}
                            />
                          </circle>

                          {/* Reverse Data Packet: Target -> Source */}
                          <circle r={isTrunk ? 2.8 : 2.4} fill={isTrunk ? '#c084fc' : '#818cf8'} filter="url(#glow-packet)" opacity={0.85}>
                            <animateMotion
                              dur={isTrunk ? '2.2s' : '2.9s'}
                              repeatCount="indefinite"
                              path={curve.pathD}
                              calcMode="linear"
                              keyPoints="1;0"
                              keyTimes="0;1"
                            />
                          </circle>
                        </g>
                      )}

                      {/* Port and Protocol Badges on Links */}
                      {showPortLabels && (
                        <g transform={`translate(${curve.midX}, ${curve.midY})`} className="pointer-events-none">
                          <rect
                            x="-45"
                            y="-10"
                            width="90"
                            height="20"
                            rx="4"
                            fill="#ffffff"
                            stroke={isTrunk ? '#c4b5fd' : '#bfdbfe'}
                            strokeWidth="1"
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#334155"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {link.speed || (isTrunk ? '10G' : '1G')} • {link.protocol || (isTrunk ? 'CDP' : 'LLDP')}
                          </text>
                        </g>
                      )}

                      {/* Source Port Tag */}
                      {showPortLabels && (
                        <g transform={`translate(${curve.srcTagX}, ${curve.srcTagY})`} className="pointer-events-none">
                          <rect x="-24" y="-8" width="48" height="16" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
                          <text textAnchor="middle" dominantBaseline="central" fill="#4f46e5" fontSize="8" fontFamily="monospace" fontWeight="bold">
                            {link.source_port}
                          </text>
                        </g>
                      )}

                      {/* Target Port Tag */}
                      {showPortLabels && (
                        <g transform={`translate(${curve.tgtTagX}, ${curve.tgtTagY})`} className="pointer-events-none">
                          <rect x="-24" y="-8" width="48" height="16" rx="3" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
                          <text textAnchor="middle" dominantBaseline="central" fill="#4f46e5" fontSize="8" fontFamily="monospace" fontWeight="bold">
                            {link.target_port}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })
              ) : (
                /* Custom Map Links Rendering */
                currentCustomMap?.links?.map((link) => {
                  const sourcePos = nodePositions.get(link.sourceDeviceId);
                  const targetPos = nodePositions.get(link.targetDeviceId);
                  if (!sourcePos || !targetPos) return null;

                  const isTrunk = link.sourceMode === 'trunk' || link.targetMode === 'trunk';
                  const isDown = link.status === 'down';
                  const isFiber = link.cableType === 'fiber';
                  const isSerial = link.cableType === 'serial';

                  const x1 = sourcePos.x + 115;
                  const y1 = sourcePos.y + 55;
                  const x2 = targetPos.x + 115;
                  const y2 = targetPos.y + 55;

                  const pairKey = [link.sourceDeviceId, link.targetDeviceId].sort().join('___');
                  const group = customLinkGroups.get(pairKey) || [link];
                  const indexInGroup = group.findIndex((l) => l.id === link.id);
                  const totalInGroup = group.length;

                  const isReversed = link.sourceDeviceId > link.targetDeviceId;
                  const curve = getLinkCurve(x1, y1, x2, y2, indexInGroup >= 0 ? indexInGroup : 0, totalInGroup, isReversed);

                  const strokeColor = isDown
                    ? '#ef4444'
                    : isFiber
                    ? '#f59e0b'
                    : isSerial
                    ? '#06b6d4'
                    : isTrunk
                    ? '#9333ea'
                    : '#2563eb';

                  return (
                    <g
                      key={link.id}
                      className="transition-all cursor-pointer group"
                      onMouseEnter={() => setHoveredLinkId(link.id)}
                      onMouseLeave={() => setHoveredLinkId(null)}
                    >
                      {/* Invisible wider hit area for easy clicking */}
                      <path
                        d={curve.pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={22}
                        className="cursor-pointer"
                        onClick={() => handleEditExistingLink(link)}
                      />

                      {/* Main Cable Line */}
                      <path
                        d={curve.pathD}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isTrunk || isFiber ? 3.5 : 2.5}
                        strokeDasharray={isDown ? '6 4' : 'none'}
                        opacity={0.9}
                        className="hover:stroke-cyan-300 transition-colors"
                        onClick={() => handleEditExistingLink(link)}
                      />

                      {/* Animated Live Data Flow Effect on Custom Link */}
                      {!isDown && showTrafficAnimation && (
                        <g className="pointer-events-none select-none">
                          {/* Flowing Dash Stream Overlay on Cable */}
                          <path
                            d={curve.pathD}
                            fill="none"
                            stroke={
                              isFiber
                                ? '#fde047'
                                : isSerial
                                ? '#67e8f9'
                                : isTrunk
                                ? '#d8b4fe'
                                : '#93c5fd'
                            }
                            strokeWidth={isTrunk || isFiber ? 2.2 : 1.6}
                            strokeDasharray="5 12"
                            strokeLinecap="round"
                            opacity={0.75}
                          >
                            <animate
                              attributeName="stroke-dashoffset"
                              from="34"
                              to="0"
                              dur={isFiber ? '0.7s' : isTrunk ? '1.0s' : '1.4s'}
                              repeatCount="indefinite"
                            />
                          </path>

                          {/* Forward Data Packet: Source -> Target */}
                          <circle
                            r={isFiber || isTrunk ? 3.8 : 3.2}
                            fill={
                              isFiber
                                ? '#fbbf24'
                                : isSerial
                                ? '#22d3ee'
                                : isTrunk
                                ? '#f472b6'
                                : '#38bdf8'
                            }
                            filter="url(#glow-packet)"
                          >
                            <animateMotion
                              dur={isFiber ? '1.4s' : isTrunk ? '1.9s' : '2.5s'}
                              repeatCount="indefinite"
                              path={curve.pathD}
                            />
                          </circle>

                          {/* Reverse Data/ACK Packet: Target -> Source */}
                          <circle
                            r={isFiber || isTrunk ? 2.8 : 2.4}
                            fill={
                              isFiber
                                ? '#f59e0b'
                                : isSerial
                                ? '#06b6d4'
                                : isTrunk
                                ? '#a855f7'
                                : '#60a5fa'
                            }
                            filter="url(#glow-packet)"
                            opacity={0.9}
                          >
                            <animateMotion
                              dur={isFiber ? '1.8s' : isTrunk ? '2.4s' : '3.1s'}
                              repeatCount="indefinite"
                              path={curve.pathD}
                              calcMode="linear"
                              keyPoints="1;0"
                              keyTimes="0;1"
                            />
                          </circle>
                        </g>
                      )}

                      {/* Midpoint Speed & Type Badge */}
                      <g
                        transform={`translate(${curve.midX}, ${curve.midY})`}
                        onClick={() => handleEditExistingLink(link)}
                        className="cursor-pointer select-none"
                      >
                        <rect
                          x="-52"
                          y="-11"
                          width="104"
                          height="22"
                          rx="5"
                          fill="#ffffff"
                          stroke={strokeColor}
                          strokeWidth="1.5"
                          className="shadow-md hover:fill-slate-100 transition"
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#0f172a"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          {link.speed || '1G'} • {link.cableType?.toUpperCase() || 'COPPER'}
                        </text>
                      </g>

                      {/* Hover Delete Button */}
                      {hoveredLinkId === link.id && (
                        <g
                          transform={`translate(${curve.midX + 66}, ${curve.midY})`}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinkToDelete(link);
                          }}
                        >
                          <circle
                            r="11"
                            fill="#ef4444"
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="hover:scale-110 transition-transform"
                          />
                          <path
                            d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
                            stroke="#ffffff"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <title>{isEn ? 'Disconnect Cable Connection' : 'قطع ارتباط و حذف کابل'}</title>
                        </g>
                      )}

                      {/* Source Endpoint Badges (Port, Mode, VLAN, IP) */}
                      {showPortLabels && (
                        <g transform={`translate(${curve.srcTagX}, ${curve.srcTagY})`} className="select-none pointer-events-none">
                          <rect
                            x="-44"
                            y={link.sourceIp ? "-24" : "-18"}
                            width="88"
                            height={link.sourceIp ? "48" : "36"}
                            rx="6"
                            fill="#ffffff"
                            stroke="#94a3b8"
                            strokeWidth="1.2"
                          />
                          <text
                            textAnchor="middle"
                            y={link.sourceIp ? "-13" : "-7"}
                            dominantBaseline="central"
                            fill="#312e81"
                            fontSize="9.5"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {link.sourcePort}
                          </text>
                          <text
                            textAnchor="middle"
                            y={link.sourceIp ? "-1" : "+8"}
                            dominantBaseline="central"
                            fill={link.sourceMode === 'trunk' ? '#7e22ce' : '#2563eb'}
                            fontSize="8"
                            fontFamily="monospace"
                            fontWeight="600"
                          >
                            {link.sourceMode === 'trunk' ? `TRUNK (V${link.sourceVlan || 1})` : `VLAN ${link.sourceVlan || 1}`}
                          </text>
                          {link.sourceIp && (
                            <text
                              textAnchor="middle"
                              y="12"
                              dominantBaseline="central"
                              fill="#047857"
                              fontSize="8"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              {link.sourceIp}
                            </text>
                          )}
                        </g>
                      )}

                      {/* Target Endpoint Badges (Port, Mode, VLAN, IP) */}
                      {showPortLabels && (
                        <g transform={`translate(${curve.tgtTagX}, ${curve.tgtTagY})`} className="select-none pointer-events-none">
                          <rect
                            x="-44"
                            y={link.targetIp ? "-24" : "-18"}
                            width="88"
                            height={link.targetIp ? "48" : "36"}
                            rx="6"
                            fill="#ffffff"
                            stroke="#94a3b8"
                            strokeWidth="1.2"
                          />
                          <text
                            textAnchor="middle"
                            y={link.targetIp ? "-13" : "-7"}
                            dominantBaseline="central"
                            fill="#0369a1"
                            fontSize="9.5"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {link.targetPort}
                          </text>
                          <text
                            textAnchor="middle"
                            y={link.targetIp ? "-1" : "+8"}
                            dominantBaseline="central"
                            fill={link.targetMode === 'trunk' ? '#7e22ce' : '#2563eb'}
                            fontSize="8"
                            fontFamily="monospace"
                            fontWeight="600"
                          >
                            {link.targetMode === 'trunk' ? `TRUNK (V${link.targetVlan || 1})` : `VLAN ${link.targetVlan || 1}`}
                          </text>
                          {link.targetIp && (
                            <text
                              textAnchor="middle"
                              y="12"
                              dominantBaseline="central"
                              fill="#047857"
                              fontSize="8"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              {link.targetIp}
                            </text>
                          )}
                        </g>
                      )}
                    </g>
                  );
                })
              ))}

              {/* Custom Map Empty State within Canvas */}
              {activeMapId !== 'default' && filteredNodes.length === 0 && (currentCustomMap?.racks?.length || 0) === 0 && (currentCustomMap?.towers?.length || 0) === 0 && (
                <foreignObject x={150} y={150} width={640} height={320}>
                  <div className="p-8 rounded-2xl bg-slate-900/90 border border-white/10 shadow-2xl backdrop-blur-xl text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto">
                      <Layers className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white mb-1">
                        {t('topology_custom_empty_title')}
                      </h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                        {t('topology_custom_empty_desc')}
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      {globalDeviceViewMode === 'card' && (
                        <button
                          type="button"
                          onClick={() => setIsAddDeviceOpen(true)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>{t('topology_tool_add_device')}</span>
                        </button>
                      )}
                      {globalDeviceViewMode === 'physical' && (
                        <button
                          type="button"
                          onClick={() => handleOpenAddHardware()}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer"
                        >
                          <Server className="w-4 h-4" />
                          <span>{isEn ? 'Add Rack, Tower or Hardware' : 'افزودن رک، دکل و تجهیزات'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </foreignObject>
              )}

              {/* Draw Custom Map Racks on Canvas - ONLY visible in Physical view mode */}
              {globalDeviceViewMode === 'physical' && activeMapId !== 'default' && currentCustomMap?.racks && currentCustomMap.racks.map((rack) => {
                const isBeingDragged = draggingRackId === rack.id;
                const rackHeight = 52 + rack.units * 28 + 40;
                return (
                  <foreignObject
                    key={rack.id}
                    x={rack.x}
                    y={rack.y}
                    width={430}
                    height={rackHeight}
                    className="overflow-visible"
                    style={{ overflow: 'visible' }}
                  >
                    <div
                      onMouseDown={(e) => handleRackMouseDown(e, rack.id)}
                      className={`select-none cursor-grab active:cursor-grabbing transition-all ${
                        isBeingDragged ? 'z-40 scale-[1.01] shadow-2xl' : 'z-20'
                      }`}
                    >
                      <RackCabinetSvg
                        rack={rack}
                        selectedDeviceId={selectedNodeId}
                        neonHighlight={
                          neonHighlightedNode
                            ? {
                                targetAliases: neonHighlightedNode.matchedAliases,
                                colorHex: neonHighlightedNode.colorHex,
                                colorRgb: neonHighlightedNode.colorRgb,
                                targetName: neonHighlightedNode.targetName,
                                targetIp: neonHighlightedNode.targetIp,
                              }
                            : null
                        }
                        onToggleViewMode={handleToggleRackViewMode}
                        onOpenAddHardware={handleOpenAddHardware}
                        onInspectRack={(r) => {
                          setInspectingRack(r);
                          setInspectingRackId(r.id);
                        }}
                        onEditRack={(r) => setEditingRack(r)}
                        onTransferDevice={(dev, r) => setTransferDeviceTarget({ device: dev, sourceRack: r })}
                        onViewInCardMode={handleViewDeviceInCardMode}
                        onDeleteRack={handlePromptDeleteRack}
                        onEditDeviceNic={handleEditDeviceNic}
                        onEditSpecs={handleEditDeviceSpecs}
                        onEditDeviceProperties={handleEditDeviceProperties}
                        onConnectTerminal={handleConnectTerminalFromRack}
                        onInspectPorts={handleInspectPortsFromRack}
                        onPromptRemoveDevice={handlePromptRemoveHardwareDevice}
                        onMoveDevice={handleMoveDeviceInRack}
                        onRemoveDevice={handleRemoveDeviceFromRack}
                      />
                    </div>
                  </foreignObject>
                );
              })}

              {/* Draw Custom Map Towers on Canvas - ONLY visible in Physical view mode */}
              {globalDeviceViewMode === 'physical' && activeMapId !== 'default' && currentCustomMap?.towers && currentCustomMap.towers.map((tower) => {
                const isBeingDragged = draggingTowerId === tower.id;
                const towerHeightPx = 40 + tower.heightMeters * 16 + 50;
                return (
                  <foreignObject
                    key={tower.id}
                    x={tower.x}
                    y={tower.y}
                    width={460}
                    height={towerHeightPx}
                    className="overflow-visible"
                    style={{ overflow: 'visible' }}
                  >
                    <div
                      onMouseDown={(e) => handleTowerMouseDown(e, tower.id)}
                      className={`select-none cursor-grab active:cursor-grabbing transition-all ${
                        isBeingDragged ? 'z-40 scale-[1.01] shadow-2xl' : 'z-20'
                      }`}
                    >
                      <TowerStructureSvg
                        tower={tower}
                        onMountRadio={(t) => {
                          const id = typeof t === 'string' ? t : t.id;
                          handleOpenMountRadio(id);
                        }}
                        onAddRadio={(tId) => handleOpenMountRadio(tId)}
                        onEditTower={(t) => setEditingTower(t)}
                        onDeleteTower={handleDeleteTower}
                        onEditRadio={(t, dev) => {
                          const id = typeof t === 'string' ? t : t.id;
                          handleOpenMountRadio(id, dev);
                        }}
                        onDeleteRadio={(t, devId) => {
                          const id = typeof t === 'string' ? t : t.id;
                          handleDeleteRadioFromTower(id, devId);
                        }}
                      />
                    </div>
                  </foreignObject>
                );
              })}

              {/* Draw Nodes on Canvas */}
              {(() => {
                const racks = currentCustomMap?.racks || [];
                const towers = currentCustomMap?.towers || [];
                const nodesToRender = filteredNodes.filter((node) => {
                  if (globalDeviceViewMode === 'card') {
                    // In Card Mode, all devices are rendered as cards so their ports, statuses, and links are fully accessible
                    return true;
                  }
                  // In Physical Mode, devices mounted inside any rack or on a tower are displayed in their respective physical enclosure
                  const isMountedInRack = racks.some((r) =>
                    (r.devices || []).some(
                      (d) => d.id === node.id || d.id === `hw-${node.id}` || (d.name && d.name === node.name)
                    )
                  );
                  const isMountedOnTower = towers.some((t) =>
                    (t.devices || []).some(
                      (d) => d.id === node.id || d.deviceId === node.id || (d.name && d.name === node.name)
                    )
                  );
                  return !isMountedInRack && !isMountedOnTower;
                });

                // Sort nodes so neon-highlighted, hovered, dragged, or selected nodes are rendered LAST (top of SVG stack)
                const sortedNodes = [...nodesToRender].sort((a, b) => {
                  const aClean = (a.id || '').replace(/^hw-/, '');
                  const bClean = (b.id || '').replace(/^hw-/, '');
                  const aIsNeon = neonHighlightedNode && (neonHighlightedNode.nodeId === a.id || neonHighlightedNode.nodeId === aClean || neonHighlightedNode.rawId === a.id);
                  const bIsNeon = neonHighlightedNode && (neonHighlightedNode.nodeId === b.id || neonHighlightedNode.nodeId === bClean || neonHighlightedNode.rawId === b.id);
                  if (aIsNeon && !bIsNeon) return 1;
                  if (!aIsNeon && bIsNeon) return -1;
                  if (a.id === hoveredNodeId || a.id === draggingNodeId) return 1;
                  if (b.id === hoveredNodeId || b.id === draggingNodeId) return -1;
                  if (a.id === selectedNodeId) return 1;
                  if (b.id === selectedNodeId) return -1;
                  return 0;
                });

                return sortedNodes.map((node) => {
                  const pos = nodePositions.get(node.id) || { x: 100, y: 100 };
                  const isSelected = selectedNodeId === node.id;
                  const isBeingDragged = draggingNodeId === node.id;
                  const isHovered = hoveredNodeId === node.id;
                  const isOnline = node.is_online;
                  const isCablingSource = activeTool === 'cable' && cableWorkflow.sourceDevice?.id === node.id;
                  const isNodeMikroTik = isMikroTikDevice(node);
                  const displayMode = globalDeviceViewMode;

                  if (displayMode === 'physical') {
                    const isCanvasNeonHighlighted =
                      neonHighlightedNode !== null &&
                      (
                        neonHighlightedNode.matchedAliases.includes(node.id) ||
                        neonHighlightedNode.matchedAliases.includes(node.id.replace(/^hw-/, '')) ||
                        neonHighlightedNode.matchedAliases.includes(`hw-${node.id.replace(/^hw-/, '')}`) ||
                        (neonHighlightedNode.targetName && node.name && node.name.trim().toLowerCase() === neonHighlightedNode.targetName) ||
                        (neonHighlightedNode.targetIp && node.ip && node.ip.trim() === neonHighlightedNode.targetIp)
                      );

                    return (
                      <foreignObject
                        key={node.id}
                        x={pos.x}
                        y={pos.y}
                        width="380"
                        height="240"
                        className={`overflow-visible interactive-node ${isCanvasNeonHighlighted ? 'z-[100]' : isHovered || isBeingDragged ? 'z-50' : 'z-20'}`}
                        style={{
                          overflow: 'visible',
                          zIndex: isCanvasNeonHighlighted ? 99999 : isHovered || isBeingDragged ? 9999 : isSelected ? 80 : 20,
                        }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId((curr) => (curr === node.id ? null : curr))}
                      >
                        <PhysicalNodeOnCanvas
                          node={node}
                          isEn={isEn}
                          isRtl={isRtl}
                          isBeingDragged={isBeingDragged}
                          isSelected={isSelected}
                          isNeonHighlighted={isCanvasNeonHighlighted}
                          neonColorHex={neonHighlightedNode?.colorHex}
                          neonColorRgb={neonHighlightedNode?.colorRgb}
                          racks={currentCustomMap?.racks || []}
                          onToggleToCardView={(id) => handleSwitchToCardWithHighlight(id || node.id)}
                          onMountToRack={(rackId, startU) => handleMountCanvasNodeToRack(node, rackId, startU)}
                          onUnmountFromRack={handleRemoveDeviceFromRack}
                          onInspectRack={(rack) => {
                            setInspectingRack(rack);
                            setInspectingRackId(rack.id);
                          }}
                          onRemoveFromMap={activeMapId !== 'default' ? () => handlePromptDeleteDevice(node) : undefined}
                          onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        />
                      </foreignObject>
                    );
                  }

                  const cleanNodeId = node.id.replace(/^hw-/, '');
                  const isNeonHighlighted =
                    neonHighlightedNode !== null &&
                    (
                      neonHighlightedNode.matchedAliases.includes(node.id) ||
                      neonHighlightedNode.matchedAliases.includes(cleanNodeId) ||
                      neonHighlightedNode.matchedAliases.includes(`hw-${cleanNodeId}`) ||
                      (neonHighlightedNode.targetName && node.name && node.name.trim().toLowerCase() === neonHighlightedNode.targetName) ||
                      (neonHighlightedNode.targetIp && node.ip && node.ip.trim() === neonHighlightedNode.targetIp)
                    );

                  return (
                    <foreignObject
                      key={node.id}
                      x={pos.x}
                      y={pos.y}
                      width="240"
                      height="150"
                      className={`overflow-visible interactive-node ${isNeonHighlighted ? 'z-[100]' : isHovered || isBeingDragged ? 'z-50' : 'z-20'}`}
                      style={{
                        overflow: 'visible',
                        zIndex: isNeonHighlighted ? 99999 : isHovered || isBeingDragged ? 9999 : isSelected ? 80 : 20,
                      }}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId((curr) => (curr === node.id ? null : curr))}
                    >
                    <div
                      onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                      className={`w-[226px] p-3 rounded-xl border transition-all duration-300 select-none text-right backdrop-blur-xl group relative ${
                        isNeonHighlighted
                          ? 'neon-card-beam-active ring-2 ring-offset-1 ring-offset-slate-950 scale-104 z-50'
                          : isBeingDragged
                          ? 'spatial-glass border-cyan-400 ring-2 ring-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.6)] cursor-grabbing z-40 scale-102'
                          : isCablingSource
                          ? 'spatial-glass border-purple-400 ring-2 ring-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.6)] animate-pulse z-40'
                          : activeTool === 'cable'
                          ? 'spatial-glass border-purple-500/40 hover:border-purple-400 hover:ring-2 hover:ring-purple-500/50 cursor-pointer shadow-lg'
                          : isSelected
                          ? 'spatial-glass border-cyan-400 ring-2 ring-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.35)] cursor-grab z-30'
                          : isOnline
                          ? 'spatial-glass spatial-glass-hover border-white/10 hover:border-indigo-500/40 cursor-grab hover:shadow-2xl'
                          : 'spatial-glass border-rose-500/40 bg-rose-950/20 cursor-grab'
                      }`}
                      style={
                        isNeonHighlighted
                          ? {
                              borderColor: neonHighlightedNode.colorHex,
                              boxShadow: `0 0 12px rgba(${neonHighlightedNode.colorRgb}, 0.35), 0 4px 18px rgba(0, 0, 0, 0.6)`,
                              ['--neon-color' as any]: neonHighlightedNode.colorHex,
                              ['--neon-rgb' as any]: neonHighlightedNode.colorRgb,
                            }
                          : undefined
                      }
                    >
                      {/* Rotating Neon Border Beam travelling cleanly around the card border without diffuse overspray */}
                      {isNeonHighlighted && (
                        <div className="absolute -inset-[3px] pointer-events-none rounded-[14px] overflow-hidden z-40">
                          <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                            <defs>
                              <filter id={`neon-beam-glow-${node.id}`} x="-30%" y="-30%" width="160%" height="160%">
                                <feGaussianBlur stdDeviation="2.5" result="blur" />
                                <feMerge>
                                  <feMergeNode in="blur" />
                                  <feMergeNode in="SourceGraphic" />
                                </feMerge>
                              </filter>
                            </defs>

                            {/* 1. Subtle perimeter baseline track */}
                            <rect
                              x="1.5"
                              y="1.5"
                              width="calc(100% - 3px)"
                              height="calc(100% - 3px)"
                              rx="13"
                              fill="none"
                              stroke={neonHighlightedNode.colorHex}
                              strokeOpacity="0.25"
                              strokeWidth="1.5"
                            />

                            {/* 2. Intense Colored Neon Beam travelling continuously along the border */}
                            <rect
                              x="1.5"
                              y="1.5"
                              width="calc(100% - 3px)"
                              height="calc(100% - 3px)"
                              rx="13"
                              fill="none"
                              stroke={neonHighlightedNode.colorHex}
                              strokeWidth="3.5"
                              pathLength="100"
                              strokeDasharray="25 75"
                              strokeLinecap="round"
                              className="neon-border-beam-anim"
                              filter={`url(#neon-beam-glow-${node.id})`}
                            />

                            {/* 3. High-intensity White-hot Core travelling right inside the neon beam */}
                            <rect
                              x="1.5"
                              y="1.5"
                              width="calc(100% - 3px)"
                              height="calc(100% - 3px)"
                              rx="13"
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth="2"
                              pathLength="100"
                              strokeDasharray="12 88"
                              strokeLinecap="round"
                              className="neon-border-beam-anim"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Neon Target Badge indicator with 3-second remaining feedback */}
                      {isNeonHighlighted && (
                        <div
                          className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono flex items-center gap-1 shadow-xl pointer-events-none z-50 whitespace-nowrap border border-white/60"
                          style={{
                            backgroundColor: neonHighlightedNode.colorHex,
                            color: ['#ffff00', '#ffee00', '#39ff14', '#00ffd5'].includes(neonHighlightedNode.colorHex) ? '#020617' : '#ffffff',
                            boxShadow: `0 0 10px ${neonHighlightedNode.colorHex}`,
                          }}
                        >
                          <Sparkles className="w-3 h-3 animate-spin" />
                          <span>{isEn ? 'Target Device' : 'دیوایس انتخاب‌شده'}</span>
                          <span className="text-[9px] opacity-85 px-1 py-0.2 rounded bg-black/40 font-mono">3s</span>
                        </div>
                      )}
                      {/* Drag Handle Indicator */}
                      <div
                        className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-slate-900/90 border border-white/20 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[9px] font-mono pointer-events-none shadow-md"
                        title={t('topology_drag_tooltip')}
                      >
                        <Move className="w-2.5 h-2.5 text-cyan-400" />
                        <span>{t('topology_drag_reposition')}</span>
                      </div>

                      {/* Node Header */}
                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg ${
                              node.type === 'switch'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : node.type === 'router'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {node.type === 'switch' ? (
                              <Server className="w-3.5 h-3.5" />
                            ) : node.type === 'router' ? (
                              <RouterIcon className="w-3.5 h-3.5" />
                            ) : (
                              <Wifi className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <span className="font-bold text-xs text-white truncate font-mono">{node.name}</span>
                          {isNodeMikroTik && (
                            <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              MikroTik
                            </span>
                          )}
                        </div>

                        {/* Status Pulse & Remove Button */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isOnline
                                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                                : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                            }`}
                          ></span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              isOnline
                                ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/30'
                                : 'text-rose-300 bg-rose-500/15 border border-rose-500/30'
                            }`}
                          >
                            {isOnline ? `${node.latency_ms || 1.2}ms` : 'OFF'}
                          </span>

                          {activeMapId !== 'default' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePromptDeleteDevice(node);
                              }}
                              className="text-slate-400 hover:text-rose-400 p-0.5 rounded transition ml-1 cursor-pointer"
                              title={t('topology_device_remove_from_map')}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* IP & Role */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-indigo-300 bg-slate-900/60 px-2 py-0.5 rounded-lg border border-white/10 mb-1.5">
                        <span className="font-bold">{node.ip}</span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[90px]">{node.role}</span>
                      </div>

                      {/* Location Preview (Building, Floor, Unit) */}
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate">
                        <MapPin className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                        <span className="truncate">
                          {node.building ? node.building.replace('(Central Bldg)', '').replace('(Engineering Bldg)', '') : ''} • {node.floor || ''}
                        </span>
                      </div>

                      {/* Quick Port and CLI preview trigger button */}
                      <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 font-mono">{node.total_ports || 24}P</span>
                          {node.has_unsaved_changes && (
                            <span className="text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1 rounded border border-amber-500/40" title={t('topology_unsaved_changes_tooltip')}>
                              wr!
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwitchToPhysicalWithHighlight(node);
                            }}
                            className="text-amber-400 hover:text-amber-300 font-medium hover:underline cursor-pointer"
                            title={isEn ? "View in Physical View & Rack" : "مشاهده در نمای فیزیکی"}
                          >
                            <span>{isEn ? 'Physical' : 'فیزیکی'}</span>
                          </button>
                          {activeMapId !== 'default' && (
                            <button
                              type="button"
                              onClick={(e) => handleStartCableFromDevice(e, node)}
                              className="text-purple-400 hover:text-purple-300 font-medium flex items-center gap-0.5 hover:underline"
                              title={t('topology_tool_cable')}
                            >
                              <Cable className="w-3 h-3 text-purple-400" />
                              <span>{isEn ? 'Cable' : 'کابل'}</span>
                            </button>
                          )}
                          {onConnectTerminal && (node.type === 'switch' || node.type === 'router') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onConnectTerminal(node);
                              }}
                              className={isNodeMikroTik ? "text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-0.5 hover:underline" : "text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-0.5 hover:underline"}
                              title={isNodeMikroTik ? (isEn ? "MikroTik RouterOS CLI" : "ترمینال و کنسول RouterOS میکروتیک") : t('topology_terminal_tooltip')}
                            >
                              <Terminal className={isNodeMikroTik ? "w-3 h-3 text-cyan-400" : "w-3 h-3 text-emerald-400"} />
                              <span>{isNodeMikroTik ? 'CLI' : 'CLI'}</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectPorts(node);
                            }}
                            className={isNodeMikroTik ? "text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-0.5 hover:underline" : "text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-0.5 hover:underline"}
                            title={isNodeMikroTik ? (isEn ? "Manage MikroTik Device & Ports" : "مدیریت دیوایس و پورت‌های میکروتیک") : t('topology_ports_tooltip')}
                          >
                            <Cable className="w-3 h-3" />
                            <span>{isNodeMikroTik ? (isEn ? 'Ports' : 'پورت‌ها') : t('topology_card_ports')}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </foreignObject>
                );
              });
            })()}

              {/* Sticky Notes Connector Lines to Linked Devices (rendered only if showStickyNotes) */}
              {showStickyNotes && activeStickyNotes && activeStickyNotes
                .filter((note) => !note.viewMode || !!note.linkedDeviceId || note.viewMode === globalDeviceViewMode)
                .map((note) => {
                if (!note.linkedDeviceId) return null;
                const cleanId = note.linkedDeviceId.replace(/^hw-/, '');
                const devPos =
                  getDevicePositionForNote(note.linkedDeviceId) ||
                  nodePositions.get(note.linkedDeviceId) ||
                  customPositions[note.linkedDeviceId] ||
                  nodePositions.get(cleanId) ||
                  customPositions[cleanId] ||
                  nodePositions.get('hw-' + cleanId) ||
                  customPositions['hw-' + cleanId];
                if (!devPos) return null;
                const renderX = (note.x === 100 && note.y === 100) ? devPos.x + 240 : (note.x ?? 100);
                const renderY = (note.x === 100 && note.y === 100) ? devPos.y - 10 : (note.y ?? 100);
                const noteCenterX = renderX + 115;
                const noteCenterY = renderY + 60;
                const devCenterX = devPos.x + 113;
                const devCenterY = devPos.y + 50;

                return (
                  <g key={`note-line-${note.id}`} className="pointer-events-none">
                    <line
                      x1={noteCenterX}
                      y1={noteCenterY}
                      x2={devCenterX}
                      y2={devCenterY}
                      stroke="#f59e0b"
                      strokeWidth="1.8"
                      strokeDasharray="4,4"
                      strokeOpacity="0.85"
                    />
                    <circle cx={noteCenterX} cy={noteCenterY} r="3.5" fill="#f59e0b" />
                    <circle cx={devCenterX} cy={devCenterY} r="4" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.2" />
                  </g>
                );
              })}

              {/* Sticky Notes on Canvas (rendered only if showStickyNotes) */}
              {showStickyNotes && activeStickyNotes && activeStickyNotes
                .filter((note) => !note.viewMode || !!note.linkedDeviceId || note.viewMode === globalDeviceViewMode)
                .map((note) => {
                  const cleanId = note.linkedDeviceId ? note.linkedDeviceId.replace(/^hw-/, '') : '';
                  const linkedDevPos = note.linkedDeviceId
                    ? getDevicePositionForNote(note.linkedDeviceId) ||
                      nodePositions.get(note.linkedDeviceId) ||
                      customPositions[note.linkedDeviceId] ||
                      nodePositions.get(cleanId) ||
                      customPositions[cleanId] ||
                      nodePositions.get('hw-' + cleanId) ||
                      customPositions['hw-' + cleanId]
                    : null;
                  const renderX = (note.x === 100 && note.y === 100 && linkedDevPos) ? linkedDevPos.x + 240 : (note.x ?? 100);
                  const renderY = (note.x === 100 && note.y === 100 && linkedDevPos) ? linkedDevPos.y - 10 : (note.y ?? 100);

                  return (
                    <foreignObject
                      key={note.id}
                      x={renderX}
                      y={renderY}
                      width="260"
                      height="300"
                      className="overflow-visible interactive-node"
                      style={{ overflow: 'visible' }}
                    >
                      <TopologyStickyNote
                        note={{ ...note, x: renderX, y: renderY }}
                        isEn={isEn}
                        availableDevices={allAvailableDevices}
                        allNotes={activeStickyNotes}
                        onUpdate={handleUpdateStickyNote}
                        onDelete={handlePromptDeleteStickyNote}
                        onStartDrag={handleStickyNoteStartDrag}
                        onFocusDevice={(devId) => {
                          const cleanDevId = devId.replace(/^hw-/, '');
                          const p =
                            nodePositions.get(devId) ||
                            customPositions[devId] ||
                            nodePositions.get(cleanDevId) ||
                            customPositions[cleanDevId] ||
                            nodePositions.get('hw-' + cleanDevId) ||
                            customPositions['hw-' + cleanDevId];
                          if (p) {
                            setPan({
                              x: -p.x * zoom + 300,
                              y: -p.y * zoom + 200,
                            });
                          }
                        }}
                      />
                    </foreignObject>
                  );
                })}
              </g>
            </svg>

            {/* Bottom Floating Legend & Interactive Guide */}
            <div className={`absolute bottom-5 ${isRtl ? 'left-5' : 'right-5'} z-30 select-none`}>
              {!isLegendOpen ? (
                <button
                  type="button"
                  onClick={() => setIsLegendOpen(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/20 hover:border-cyan-400/50 text-slate-200 hover:text-white shadow-2xl backdrop-blur-2xl text-xs font-medium transition active:scale-95 group"
                  title={t('topology_legend_expand')}
                >
                  <Info className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition-transform" />
                  <span>{t('topology_legend_title')}</span>
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <div className="spatial-glass border border-white/15 backdrop-blur-2xl rounded-2xl p-3 sm:p-3.5 shadow-[0_10px_35px_rgba(0,0,0,0.6)] text-xs text-slate-200 min-w-[280px] sm:min-w-[340px] max-w-sm transition-all duration-200">
                  <div className="flex items-center justify-between gap-3 pb-2 mb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-cyan-400" />
                      <span className="font-bold text-white text-xs font-mono glow-text-cyan">
                        {t('topology_legend_title')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/15 px-2 py-0.5 rounded-md border border-cyan-500/30 hidden sm:inline">
                        {t('topology_legend_scroll_hint')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsLegendOpen(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                        title={t('topology_legend_collapse')}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Connection Types & Node States */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-slate-300">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-1 bg-purple-500 rounded shadow-[0_0_8px_rgba(168,85,247,0.7)]"></span>
                      <span className="text-purple-300 font-mono font-semibold">Trunk (802.1Q)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-1 bg-cyan-500 rounded shadow-[0_0_8px_rgba(6,182,212,0.7)]"></span>
                      <span className="text-cyan-300 font-mono font-semibold">Access (VLAN)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"></span>
                      <span className="text-emerald-300">{t('topology_legend_online')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]"></span>
                      <span className="text-rose-300">{t('topology_legend_offline')}</span>
                    </div>
                  </div>

                  {/* Quick Gesture Guide */}
                  <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{t('topology_legend_drag_hint')}</span>
                    <span className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">Auto-Save</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* VIEW 2: Physical Building & Floor Schematic Map with Drag & Drop */
          <div className="flex-1 h-full overflow-y-auto p-4 space-y-4">
            {/* Header / Guide Bar */}
            <div className="spatial-glass p-4 rounded-xl border border-white/10 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 glow-text-cyan">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <span>{t('topology_physical_title')}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t('topology_physical_desc')}
                </p>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-cyan-300/90 font-medium">
                  <Move className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span>{t('topology_physical_drag_hint')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBuildingModal(true);
                    setNewBuildingInput('');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-medium border border-white/15 shadow-lg transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('topology_physical_add_bldg_btn')}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleFullMode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/15 text-xs text-slate-200 transition active:scale-95 cursor-pointer"
                  title={isFullMode ? t('topology_exit_full_mode') : t('topology_fullscreen_title')}
                >
                  {isFullMode ? <Minimize2 className="w-4 h-4 text-amber-300" /> : <Maximize2 className="w-4 h-4 text-cyan-300" />}
                  <span>{isFullMode ? t('topology_exit_full_mode') : t('topology_fullscreen_title')}</span>
                </button>
              </div>
            </div>

            {/* Notification / Feedback Toast with Smooth Fade-Out */}
            {feedbackToast && (
              <div
                className={`p-2.5 px-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs shadow-xl backdrop-blur-xl transition-all duration-700 ease-out ${
                  isToastFading
                    ? 'opacity-0 -translate-y-2 scale-95 pointer-events-none'
                    : 'opacity-100 translate-y-0 scale-100 duration-300'
                } ${
                  isLightMode
                    ? feedbackToast.type === 'success'
                      ? 'bg-emerald-50/95 border-emerald-300 text-emerald-950 shadow-emerald-900/10'
                      : feedbackToast.type === 'error'
                      ? 'bg-rose-50/95 border-rose-300 text-rose-950 shadow-rose-900/10'
                      : 'bg-sky-50/95 border-sky-300 text-sky-950 shadow-sky-900/10'
                    : feedbackToast.type === 'success'
                    ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100'
                    : feedbackToast.type === 'error'
                    ? 'bg-rose-950/90 border-rose-500/50 text-rose-100'
                    : 'bg-cyan-950/90 border-cyan-500/50 text-cyan-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {feedbackToast.type === 'success' ? (
                    <CheckCircle className={`w-4 h-4 shrink-0 ${isLightMode ? 'text-emerald-600' : 'text-emerald-400'}`} />
                  ) : feedbackToast.type === 'error' ? (
                    <AlertCircle className={`w-4 h-4 shrink-0 ${isLightMode ? 'text-rose-600' : 'text-rose-400'}`} />
                  ) : (
                    <Info className={`w-4 h-4 shrink-0 ${isLightMode ? 'text-sky-600' : 'text-cyan-400'}`} />
                  )}
                  <span
                    title={feedbackToast.message}
                    className={`font-semibold leading-relaxed ${isLightMode ? 'text-slate-900' : 'text-white'}`}
                  >
                    {feedbackToast.message}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsToastFading(false);
                    setFeedbackToast(null);
                  }}
                  className={`p-1 rounded-lg transition cursor-pointer shrink-0 ${
                    isLightMode ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Active Drag Hint Pill when dragging across the screen */}
            {draggedDevice && (
              <div className="p-2.5 rounded-xl bg-cyan-950/90 border border-cyan-400/60 shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center justify-between gap-3 text-xs text-cyan-200">
                <div className="flex items-center gap-2">
                  <Move className="w-4 h-4 text-cyan-400 animate-bounce" />
                  <span>
                    {isEn
                      ? `Moving "${draggedDevice.name}" — Release over any floor to relocate.`
                      : `در حال کشیدن «${draggedDevice.name}» — روی هر طبقه‌ای رها کنید تا مستقر شود.`}
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-400/30">
                  {draggedDevice.fromBuilding} &gt; {draggedDevice.fromFloor}
                </span>
              </div>
            )}

            {/* Buildings Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {Object.entries(physicalHierarchy).map(([bldgName, floors]) => {
                const totalDevicesInBldg = Object.values(floors).reduce(
                  (acc, floorData) => acc + floorData.allDevices.length,
                  0
                );

                return (
                  <div
                    key={bldgName}
                    className="spatial-glass border border-white/10 rounded-xl p-4 shadow-xl space-y-3"
                  >
                    {/* Building Title & Management Actions */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-white/10 flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{bldgName}</h4>
                            <div className="flex items-center gap-1 opacity-80 hover:opacity-100">
                              <button
                                type="button"
                                onClick={() =>
                                  setRenameModal({
                                    type: 'building',
                                    building: bldgName,
                                    currentName: bldgName,
                                    newName: bldgName,
                                  })
                                }
                                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition"
                                title={t('topology_physical_edit')}
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteModal({
                                    type: 'building',
                                    building: bldgName,
                                    deviceCount: totalDevicesInBldg,
                                  })
                                }
                                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/5 transition"
                                title={t('topology_physical_delete')}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {t('topology_devices_in_building', { count: totalDevicesInBldg })}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setAddFloorBuilding(bldgName);
                          setNewFloorInput('');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs transition cursor-pointer"
                        title={t('topology_physical_add_floor_btn')}
                      >
                        <Plus className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[11px] font-medium">{t('topology_physical_add_floor_btn')}</span>
                      </button>
                    </div>

                    {/* Floors in this building */}
                    <div className="space-y-3">
                      {Object.entries(floors).map(([floorName, floorData]) => {
                        const isFloorDropHovered =
                          dragOverTarget?.building === bldgName &&
                          dragOverTarget?.floor === floorName &&
                          !dragOverTarget?.unit &&
                          !dragOverTarget?.rack;
                        const isAnyDragging = draggedDevice !== null;

                        const unitEntries = Object.entries(floorData.units) as [string, TopologyNode[]][];
                        const rackEntries = Object.entries(floorData.racks) as [string, TopologyNode[]][];
                        const hasNestedStructures = unitEntries.length > 0 || rackEntries.length > 0;

                        return (
                          <div
                            key={floorName}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDragEnter={(e) => {
                              e.preventDefault();
                              setDragOverTarget({ building: bldgName, floor: floorName });
                            }}
                            onDragLeave={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              if (
                                e.clientX <= rect.left ||
                                e.clientX >= rect.right ||
                                e.clientY <= rect.top ||
                                e.clientY >= rect.bottom
                              ) {
                                setDragOverTarget((prev) =>
                                  prev?.building === bldgName && prev?.floor === floorName && !prev?.unit && !prev?.rack
                                    ? null
                                    : prev
                                );
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              let deviceId = '';
                              try {
                                const raw = e.dataTransfer.getData('application/json');
                                if (raw) {
                                  const parsed = JSON.parse(raw);
                                  deviceId = parsed.deviceId;
                                }
                              } catch (err) {}
                              if (!deviceId) {
                                deviceId =
                                  e.dataTransfer.getData('text/plain') ||
                                  (draggedDevice ? draggedDevice.id : '');
                              }

                              if (deviceId) {
                                handleMoveDevice(deviceId, bldgName, floorName, '', '');
                              }
                              setDragOverTarget(null);
                            }}
                            className={`rounded-xl p-3.5 space-y-3 transition-all duration-200 border ${
                              isFloorDropHovered
                                ? 'bg-cyan-950/50 border-cyan-400 ring-2 ring-cyan-400/50 shadow-[0_0_25px_rgba(6,182,212,0.35)] scale-[1.01]'
                                : isAnyDragging
                                ? 'bg-slate-900/60 border-dashed border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-950/20'
                                : 'bg-slate-900/50 border-white/5'
                            }`}
                          >
                            {/* Floor Header & Control Actions */}
                            <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                                  <Layers className="w-3.5 h-3.5" />
                                  <span>{floorName}</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRenameModal({
                                        type: 'floor',
                                        building: bldgName,
                                        item: floorName,
                                        currentName: floorName,
                                        newName: floorName,
                                      })
                                    }
                                    className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-white/5 transition"
                                    title={t('topology_physical_edit')}
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteModal({
                                        type: 'floor',
                                        building: bldgName,
                                        item: floorName,
                                        deviceCount: floorData.allDevices.length,
                                      })
                                    }
                                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/5 transition"
                                    title={t('topology_physical_delete')}
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddUnitModal({ building: bldgName, floor: floorName });
                                    setNewUnitInput('');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-[11px] transition cursor-pointer"
                                  title={t('topology_physical_add_unit_btn')}
                                >
                                  <Boxes className="w-3 h-3 text-indigo-400" />
                                  <span>{t('topology_physical_add_unit_btn')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddRackModal({ building: bldgName, floor: floorName });
                                    setNewRackInput('');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 text-[11px] transition cursor-pointer"
                                  title={t('topology_physical_add_rack_btn')}
                                >
                                  <Server className="w-3 h-3 text-cyan-400" />
                                  <span>{t('topology_physical_add_rack_btn')}</span>
                                </button>

                                <span className="text-[10px] text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-lg border border-white/10 font-mono">
                                  {t('topology_devices_on_floor', { count: floorData.allDevices.length })}
                                </span>
                              </div>
                            </div>

                            {/* Drop Zone Active Banner for Floor */}
                            {isFloorDropHovered && draggedDevice && (
                              <div className="flex items-center justify-center gap-2 p-2 rounded-lg bg-cyan-500/20 border border-cyan-400 text-cyan-200 text-xs font-medium animate-pulse">
                                <CheckCircle className="w-4 h-4 text-cyan-300" />
                                <span>
                                  {t('topology_physical_drop_here', { floor: floorName })}
                                </span>
                              </div>
                            )}

                            {/* Nested Units Section */}
                            {unitEntries.length > 0 && (
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300 uppercase tracking-wider">
                                  <Boxes className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>{t('topology_physical_units_title')}</span>
                                </div>
                                <div className="grid grid-cols-1 gap-2.5">
                                  {unitEntries.map(([unitName, unitDevices]) => {
                                    const isUnitDropHovered =
                                      dragOverTarget?.building === bldgName &&
                                      dragOverTarget?.floor === floorName &&
                                      dragOverTarget?.unit === unitName;

                                    return (
                                      <div
                                        key={unitName}
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDragEnter={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setDragOverTarget({
                                            building: bldgName,
                                            floor: floorName,
                                            unit: unitName,
                                          });
                                        }}
                                        onDragLeave={(e) => {
                                          e.stopPropagation();
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          if (
                                            e.clientX <= rect.left ||
                                            e.clientX >= rect.right ||
                                            e.clientY <= rect.top ||
                                            e.clientY >= rect.bottom
                                          ) {
                                            setDragOverTarget((prev) =>
                                              prev?.unit === unitName ? null : prev
                                            );
                                          }
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          let deviceId = '';
                                          try {
                                            const raw = e.dataTransfer.getData('application/json');
                                            if (raw) {
                                              const parsed = JSON.parse(raw);
                                              deviceId = parsed.deviceId;
                                            }
                                          } catch (err) {}
                                          if (!deviceId) {
                                            deviceId =
                                              e.dataTransfer.getData('text/plain') ||
                                              (draggedDevice ? draggedDevice.id : '');
                                          }

                                          if (deviceId) {
                                            handleMoveDevice(deviceId, bldgName, floorName, unitName, '');
                                          }
                                          setDragOverTarget(null);
                                        }}
                                        className={`p-3 rounded-xl border transition-all duration-200 ${
                                          isUnitDropHovered
                                            ? 'bg-indigo-950/60 border-indigo-400 ring-2 ring-indigo-400/60 shadow-[0_0_20px_rgba(99,102,241,0.35)]'
                                            : 'bg-indigo-950/20 border-indigo-500/20 hover:border-indigo-500/30'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-500/20">
                                          <div className="flex items-center gap-2">
                                            <Box className="w-3.5 h-3.5 text-indigo-400" />
                                            <span className="font-bold text-xs text-indigo-200">
                                              {unitName}
                                            </span>
                                            <div className="flex items-center gap-0.5">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setRenameModal({
                                                    type: 'unit',
                                                    building: bldgName,
                                                    floor: floorName,
                                                    item: unitName,
                                                    currentName: unitName,
                                                    newName: unitName,
                                                  })
                                                }
                                                className="p-1 rounded text-slate-400 hover:text-indigo-300 transition"
                                                title={t('topology_physical_edit')}
                                              >
                                                <Edit2 className="w-2.5 h-2.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setDeleteModal({
                                                    type: 'unit',
                                                    building: bldgName,
                                                    floor: floorName,
                                                    item: unitName,
                                                    deviceCount: unitDevices.length,
                                                  })
                                                }
                                                className="p-1 rounded text-slate-400 hover:text-rose-400 transition"
                                                title={t('topology_physical_delete')}
                                              >
                                                <Trash2 className="w-2.5 h-2.5" />
                                              </button>
                                            </div>
                                          </div>
                                          <span className="text-[10px] text-indigo-300/80 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                            {t('topology_devices_in_building', { count: unitDevices.length })}
                                          </span>
                                        </div>

                                        {unitDevices.length === 0 ? (
                                          <div className="p-3 rounded-lg border border-dashed border-indigo-500/30 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                                            <Move className="w-3 h-3 text-indigo-400 opacity-70" />
                                            <span>
                                              {isEn
                                                ? 'Drop devices here to assign to this unit'
                                                : 'برای انتساب به این واحد تجهیزات را اینجا رها کنید'}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            {unitDevices.map((dev) =>
                                              renderDeviceCard(dev, bldgName, floorName, unitName, '')
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Nested Racks Section */}
                            {rackEntries.length > 0 && (
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
                                  <Server className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>{t('topology_physical_racks_title')}</span>
                                </div>
                                <div className="grid grid-cols-1 gap-2.5">
                                  {rackEntries.map(([rackName, rackDevices]) => {
                                    const isRackDropHovered =
                                      dragOverTarget?.building === bldgName &&
                                      dragOverTarget?.floor === floorName &&
                                      dragOverTarget?.rack === rackName;

                                    return (
                                      <div
                                        key={rackName}
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDragEnter={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setDragOverTarget({
                                            building: bldgName,
                                            floor: floorName,
                                            rack: rackName,
                                          });
                                        }}
                                        onDragLeave={(e) => {
                                          e.stopPropagation();
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          if (
                                            e.clientX <= rect.left ||
                                            e.clientX >= rect.right ||
                                            e.clientY <= rect.top ||
                                            e.clientY >= rect.bottom
                                          ) {
                                            setDragOverTarget((prev) =>
                                              prev?.rack === rackName ? null : prev
                                            );
                                          }
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          let deviceId = '';
                                          try {
                                            const raw = e.dataTransfer.getData('application/json');
                                            if (raw) {
                                              const parsed = JSON.parse(raw);
                                              deviceId = parsed.deviceId;
                                            }
                                          } catch (err) {}
                                          if (!deviceId) {
                                            deviceId =
                                              e.dataTransfer.getData('text/plain') ||
                                              (draggedDevice ? draggedDevice.id : '');
                                          }

                                          if (deviceId) {
                                            handleMoveDevice(deviceId, bldgName, floorName, '', rackName);
                                          }
                                          setDragOverTarget(null);
                                        }}
                                        className={`p-3 rounded-xl border transition-all duration-200 ${
                                          isRackDropHovered
                                            ? 'bg-slate-950 border-cyan-400 ring-2 ring-cyan-400/60 shadow-[0_0_20px_rgba(6,182,212,0.35)]'
                                            : 'bg-slate-950/60 border-cyan-500/20 hover:border-cyan-500/30'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-cyan-500/20">
                                          <div className="flex items-center gap-2">
                                            <Server className="w-3.5 h-3.5 text-cyan-400" />
                                            <span className="font-bold text-xs text-cyan-200 font-mono">
                                              {rackName}
                                            </span>
                                            <div className="flex items-center gap-0.5">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setRenameModal({
                                                    type: 'rack',
                                                    building: bldgName,
                                                    floor: floorName,
                                                    item: rackName,
                                                    currentName: rackName,
                                                    newName: rackName,
                                                  })
                                                }
                                                className="p-1 rounded text-slate-400 hover:text-cyan-300 transition"
                                                title={t('topology_physical_edit')}
                                              >
                                                <Edit2 className="w-2.5 h-2.5" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setDeleteModal({
                                                    type: 'rack',
                                                    building: bldgName,
                                                    floor: floorName,
                                                    item: rackName,
                                                    deviceCount: rackDevices.length,
                                                  })
                                                }
                                                className="p-1 rounded text-slate-400 hover:text-rose-400 transition"
                                                title={t('topology_physical_delete')}
                                              >
                                                <Trash2 className="w-2.5 h-2.5" />
                                              </button>
                                            </div>
                                          </div>
                                          <span className="text-[10px] text-cyan-300/80 font-mono bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                                            {t('topology_devices_in_building', { count: rackDevices.length })}
                                          </span>
                                        </div>

                                        {rackDevices.length === 0 ? (
                                          <div className="p-3 rounded-lg border border-dashed border-cyan-500/30 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                                            <Move className="w-3 h-3 text-cyan-400 opacity-70" />
                                            <span>
                                              {isEn
                                                ? 'Rack empty. Drop devices here to mount in rack.'
                                                : 'رک خالی است. تجهیزات را جهت نصب درون رک اینجا رها کنید.'}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            {rackDevices.map((dev) =>
                                              renderDeviceCard(dev, bldgName, floorName, '', rackName)
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* General / Standalone Equipment Section */}
                            {(floorData.general.length > 0 || !hasNestedStructures) && (
                              <div className="space-y-2 pt-1">
                                {hasNestedStructures && (
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{t('topology_physical_general_title')}</span>
                                  </div>
                                )}

                                {floorData.allDevices.length === 0 ? (
                                  <div
                                    className={`p-4 rounded-xl border border-dashed text-center flex flex-col items-center justify-center gap-1.5 transition-all ${
                                      isFloorDropHovered
                                        ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                                        : 'border-white/10 text-slate-400 bg-black/10'
                                    }`}
                                  >
                                    <Move className="w-4 h-4 text-cyan-400 opacity-60" />
                                    <span className="text-xs">
                                      {t('topology_physical_dropzone_empty')}
                                    </span>
                                  </div>
                                ) : floorData.general.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    {floorData.general.map((device) =>
                                      renderDeviceCard(device, bldgName, floorName)
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Node Detail Slide-out Drawer */}
        {selectedNode && (
          <div className={`w-80 lg:w-96 spatial-glass ${isRtl ? 'border-r' : 'border-l'} border-white/10 p-4 overflow-y-auto flex flex-col z-30 shadow-2xl backdrop-blur-2xl text-slate-100`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {selectedNode.type === 'switch' ? (
                    <Server className="w-4 h-4" />
                  ) : selectedNode.type === 'router' ? (
                    <RouterIcon className="w-4 h-4" />
                  ) : (
                    <Wifi className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-mono">{selectedNode.name}</h4>
                  <span className="text-[11px] text-slate-400">{selectedNode.role}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                ✕
              </button>
            </div>

            {/* Quick Status Bar */}
            <div className="my-3 p-3 rounded-xl bg-slate-900/60 border border-white/10 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('topology_details_realtime_status')}</span>
                <span
                  className={`font-semibold flex items-center gap-1 ${
                    selectedNode.is_online ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      selectedNode.is_online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                    }`}
                  ></span>
                  {selectedNode.is_online ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400">{t('topology_details_ip')}</span>
                <span className="text-indigo-300 font-bold">{selectedNode.ip}</span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400">{t('topology_details_latency')}</span>
                <span className="text-slate-200">
                  {selectedNode.is_online ? `${selectedNode.latency_ms || 1.1} ms` : (isEn ? 'Timeout (100% loss)' : 'نامحدود (100% loss)')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('topology_details_model')}</span>
                <span className="text-slate-200 font-mono text-[11px]">{selectedNode.model}</span>
              </div>
            </div>

            {/* Location Specs */}
            <div className="space-y-1.5 text-xs mb-3">
              <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t('topology_details_location_title')}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 space-y-1.5 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('topology_details_building')}</span>
                  <span className="font-medium text-white">{selectedNode.building}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('topology_details_floor')}</span>
                  <span className="font-medium text-white">{selectedNode.floor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('topology_details_unit')}</span>
                  <span className="font-medium text-white">{selectedNode.unit}</span>
                </div>
                {selectedNode.rack && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t('topology_details_rack')}</span>
                    <span className="font-mono text-cyan-300 font-bold">{selectedNode.rack}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Protocol Support */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-white/10 text-xs mb-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('topology_details_cdp')}</span>
                <span
                  className={
                    selectedNode.cdp_enabled ? 'text-emerald-400 font-medium' : 'text-slate-500'
                  }
                >
                  {selectedNode.cdp_enabled ? (isEn ? 'Active (Cisco CDP v2)' : 'فعال (Cisco CDP v2)') : (isEn ? 'Disabled' : 'غیرفعال')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('topology_details_lldp')}</span>
                <span
                  className={
                    selectedNode.lldp_enabled ? 'text-emerald-400 font-medium' : 'text-slate-500'
                  }
                >
                  {selectedNode.lldp_enabled ? (isEn ? 'Active (IEEE 802.1AB)' : 'فعال (IEEE 802.1AB)') : (isEn ? 'Disabled' : 'غیرفعال')}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-auto pt-3 space-y-2">
              {onConnectTerminal && (selectedNode.type === 'switch' || selectedNode.type === 'router') && (
                <button
                  onClick={() => onConnectTerminal(selectedNode as unknown as Device)}
                  className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-medium text-xs border transition active:scale-98 ${
                    isMikroTikDevice(selectedNode)
                      ? 'bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border-cyan-500/40 shadow'
                      : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                  }`}
                >
                  <Terminal className={`w-3.5 h-3.5 ${isMikroTikDevice(selectedNode) ? 'text-cyan-400' : 'text-emerald-400'}`} />
                  <span>
                    {isMikroTikDevice(selectedNode)
                      ? (isEn ? 'Open RouterOS CLI' : 'ترمینال RouterOS')
                      : t('topology_terminal_tooltip')}
                  </span>
                </button>
              )}
              <button
                onClick={() => onInspectPorts(selectedNode as unknown as Device)}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-medium text-xs shadow-lg transition active:scale-98 ${
                  isMikroTikDevice(selectedNode)
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white'
                    : 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white'
                }`}
              >
                <Cable className="w-3.5 h-3.5" />
                <span>
                  {isMikroTikDevice(selectedNode)
                    ? (isEn ? 'Manage MikroTik Device & Ports' : 'مدیریت دیوایس و پورت‌های میکروتیک')
                    : t('topology_view_ports_vlan_btn')}
                </span>
              </button>
            </div>
          </div>
        )}

      {/* Modal 1: Add Floor Modal */}
      {addFloorBuilding && (
        <div
          data-modal-backdrop="true"
          className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
          onClick={() => setAddFloorBuilding(null)}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-2xl bg-slate-900 border border-white/20 text-slate-100 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t('topology_physical_add_floor_btn')}
                  </h3>
                  <p className="text-[11px] text-slate-400">{addFloorBuilding}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddFloorBuilding(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_new_floor_name')}
                </label>
                <input
                  type="text"
                  value={newFloorInput}
                  onChange={(e) => setNewFloorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddFloor(addFloorBuilding);
                    }
                  }}
                  placeholder={isEn ? 'e.g. Floor 3, NOC Room, Server Room B' : 'مانند طبقه ۳، اتاق سرور ب، مرکز داده'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/40 border-t border-white/10">
              <button
                type="button"
                onClick={() => setAddFloorBuilding(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                {t('topology_physical_cancel_btn')}
              </button>
              <button
                type="button"
                onClick={() => handleAddFloor(addFloorBuilding)}
                disabled={!newFloorInput.trim()}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 transition shadow-lg cursor-pointer"
              >
                {t('topology_physical_create_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Add Building Modal */}
      {showAddBuildingModal && (
        <div
          data-modal-backdrop="true"
          className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
          onClick={() => setShowAddBuildingModal(false)}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-2xl bg-slate-900 border border-white/20 text-slate-100 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t('topology_physical_add_bldg_btn')}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn ? 'Create a new structural building in network topology' : 'تعریف ساختمان جدید در توپولوژی فیزیکی شبکه'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBuildingModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_new_bldg_name')}
                </label>
                <input
                  type="text"
                  value={newBuildingInput}
                  onChange={(e) => setNewBuildingInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddBuilding();
                    }
                  }}
                  placeholder={isEn ? 'e.g. Engineering Building, Data Center 2' : 'مانند ساختمان مهندسی، دیتاسنتر ۲، شعبه شرق'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/40 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowAddBuildingModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                {t('topology_physical_cancel_btn')}
              </button>
              <button
                type="button"
                onClick={handleAddBuilding}
                disabled={!newBuildingInput.trim()}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 transition shadow-lg cursor-pointer"
              >
                {t('topology_physical_create_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Manual Relocate Modal */}
      {relocateDevice && (
        <div
          data-modal-backdrop="true"
          className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
          onClick={() => setRelocateDevice(null)}
        >
          <div
            className="relative w-full max-w-lg flex flex-col rounded-2xl bg-slate-900 border border-white/20 text-slate-100 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Move className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t('topology_physical_relocate_modal_title')}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {relocateDevice.name} ({relocateDevice.ip})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRelocateDevice(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Current Placement Banner */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 flex items-center justify-between">
                <span className="text-slate-400">
                  {isEn ? 'Current Location:' : 'موقعیت فعلی:'}
                </span>
                <span className="font-semibold text-indigo-300">
                  {relocateDevice.building || (isEn ? 'Other Buildings' : 'سایر ساختمان‌ها')} &gt; {relocateDevice.floor || (isEn ? 'Unassigned Floor' : 'طبقه نامشخص')}
                </span>
              </div>

              {/* Target Building Selector */}
              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_select_target_building')}
                </label>
                <select
                  value={relocateTargetBuilding}
                  onChange={(e) => {
                    setRelocateTargetBuilding(e.target.value);
                    setCustomRelocateBuilding('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white focus:outline-none focus:border-cyan-400"
                >
                  {allBuildingOptions.map((b) => (
                    <option key={b} value={b} className="bg-slate-900 text-white">
                      {b}
                    </option>
                  ))}
                  <option value="__CUSTOM__" className="bg-slate-900 text-cyan-400">
                    {isEn ? '+ Custom Building...' : '+ ساختمان سفارشی...'}
                  </option>
                </select>

                {relocateTargetBuilding === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customRelocateBuilding}
                    onChange={(e) => setCustomRelocateBuilding(e.target.value)}
                    placeholder={isEn ? 'Enter custom building name' : 'نام ساختمان سفارشی را وارد کنید'}
                    className="w-full mt-2 px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                )}
              </div>

              {/* Target Floor Selector */}
              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_select_target_floor')}
                </label>
                <select
                  value={relocateTargetFloor}
                  onChange={(e) => {
                    setRelocateTargetFloor(e.target.value);
                    setCustomRelocateFloor('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white focus:outline-none focus:border-cyan-400"
                >
                  {allFloorOptionsForSelectedBuilding.map((f) => (
                    <option key={f} value={f} className="bg-slate-900 text-white">
                      {f}
                    </option>
                  ))}
                  <option value="__CUSTOM__" className="bg-slate-900 text-cyan-400">
                    {isEn ? '+ Custom Floor...' : '+ طبقه سفارشی...'}
                  </option>
                </select>

                {relocateTargetFloor === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customRelocateFloor}
                    onChange={(e) => setCustomRelocateFloor(e.target.value)}
                    placeholder={isEn ? 'Enter custom floor name' : 'نام طبقه سفارشی را وارد کنید'}
                    className="w-full mt-2 px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                )}
              </div>

              {/* Target Unit / Room Selector */}
              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_select_target_unit')}
                </label>
                <select
                  value={relocateTargetUnit}
                  onChange={(e) => {
                    setRelocateTargetUnit(e.target.value);
                    setCustomRelocateUnit('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="__NONE__" className="bg-slate-900 text-slate-400">
                    {isEn ? '-- None / General Floor --' : '-- بدون واحد / فضای عمومی طبقه --'}
                  </option>
                  {allUnitOptionsForSelectedFloor.map((u) => (
                    <option key={u} value={u} className="bg-slate-900 text-white">
                      {u}
                    </option>
                  ))}
                  <option value="__CUSTOM__" className="bg-slate-900 text-indigo-400">
                    {isEn ? '+ Custom Unit / Section...' : '+ بخش یا واحد سفارشی...'}
                  </option>
                </select>

                {relocateTargetUnit === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customRelocateUnit}
                    onChange={(e) => setCustomRelocateUnit(e.target.value)}
                    placeholder={isEn ? 'Enter unit or room name' : 'نام واحد یا اتاق را وارد کنید'}
                    className="w-full mt-2 px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                  />
                )}
              </div>

              {/* Target Rack Selector */}
              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_select_target_rack')}
                </label>
                <select
                  value={relocateTargetRack}
                  onChange={(e) => {
                    setRelocateTargetRack(e.target.value);
                    setCustomRelocateRack('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="__NONE__" className="bg-slate-900 text-slate-400">
                    {isEn ? '-- None / Standalone Equipment --' : '-- بدون رک / تجهیزات آزاد --'}
                  </option>
                  {allRackOptionsForSelectedFloor.map((r) => (
                    <option key={r} value={r} className="bg-slate-900 text-white">
                      {r}
                    </option>
                  ))}
                  <option value="__CUSTOM__" className="bg-slate-900 text-cyan-400">
                    {isEn ? '+ Custom Rack...' : '+ رک سفارشی...'}
                  </option>
                </select>

                {relocateTargetRack === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customRelocateRack}
                    onChange={(e) => setCustomRelocateRack(e.target.value)}
                    placeholder={isEn ? 'e.g. Rack-A1, Server Cabinet' : 'مانند رک اصلی، کابینت سرور ۱'}
                    className="w-full mt-2 px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/40 border-t border-white/10">
              <button
                type="button"
                onClick={() => setRelocateDevice(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                {t('topology_physical_cancel_btn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalBldg =
                    relocateTargetBuilding === '__CUSTOM__'
                      ? customRelocateBuilding.trim()
                      : relocateTargetBuilding;
                  const finalFloor =
                    relocateTargetFloor === '__CUSTOM__'
                      ? customRelocateFloor.trim()
                      : relocateTargetFloor;
                  const finalUnit =
                    relocateTargetUnit === '__CUSTOM__'
                      ? customRelocateUnit.trim()
                      : relocateTargetUnit === '__NONE__'
                      ? ''
                      : relocateTargetUnit;
                  const finalRack =
                    relocateTargetRack === '__CUSTOM__'
                      ? customRelocateRack.trim()
                      : relocateTargetRack === '__NONE__'
                      ? ''
                      : relocateTargetRack;

                  if (finalBldg && finalFloor && relocateDevice) {
                    handleMoveDevice(relocateDevice.id, finalBldg, finalFloor, finalUnit, finalRack);
                    setRelocateDevice(null);
                  }
                }}
                disabled={
                  (relocateTargetBuilding === '__CUSTOM__' && !customRelocateBuilding.trim()) ||
                  (relocateTargetFloor === '__CUSTOM__' && !customRelocateFloor.trim()) ||
                  (relocateTargetUnit === '__CUSTOM__' && !customRelocateUnit.trim()) ||
                  (relocateTargetRack === '__CUSTOM__' && !customRelocateRack.trim()) ||
                  !relocateTargetBuilding ||
                  !relocateTargetFloor
                }
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 transition shadow-lg cursor-pointer"
              >
                {t('topology_physical_confirm_relocate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Add Unit Modal */}
      {addUnitModal && (
        <div
          data-modal-backdrop="true"
          className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
          onClick={() => setAddUnitModal(null)}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-2xl bg-slate-900 border border-white/20 text-slate-100 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t('topology_physical_add_unit_btn')}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {addUnitModal.building} &gt; {addUnitModal.floor}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddUnitModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_new_unit_name')}
                </label>
                <input
                  type="text"
                  value={newUnitInput}
                  onChange={(e) => setNewUnitInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newUnitInput.trim()) {
                      handleAddUnit(addUnitModal.building, addUnitModal.floor, newUnitInput);
                    }
                  }}
                  placeholder={isEn ? 'e.g. IT Department, Server Room 102, Finance' : 'مانند واحد فناوری اطلاعات، اتاق سرور ۱۰۲، مالی'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/40 border-t border-white/10">
              <button
                type="button"
                onClick={() => setAddUnitModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                {t('topology_physical_cancel_btn')}
              </button>
              <button
                type="button"
                onClick={() => handleAddUnit(addUnitModal.building, addUnitModal.floor, newUnitInput)}
                disabled={!newUnitInput.trim()}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-40 transition shadow-lg cursor-pointer"
              >
                {t('topology_physical_create_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Add Rack Modal */}
      {addRackModal && (
        <div
          data-modal-backdrop="true"
          className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
          onClick={() => setAddRackModal(null)}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-2xl bg-slate-900 border border-white/20 text-slate-100 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t('topology_physical_add_rack_btn')}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {addRackModal.building} &gt; {addRackModal.floor}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAddRackModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_new_rack_name')}
                </label>
                {(() => {
                  const isDuplicate = (customRacks[`${addRackModal.building}:::${addRackModal.floor}`] || []).some(
                    (r) => r.trim().toLowerCase() === newRackInput.trim().toLowerCase()
                  );
                  return (
                    <>
                      <input
                        type="text"
                        value={newRackInput}
                        onChange={(e) => setNewRackInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newRackInput.trim() && !isDuplicate) {
                            handleAddRack(addRackModal.building, addRackModal.floor, newRackInput);
                          }
                        }}
                        placeholder={isEn ? 'e.g. Rack-A1, 42U-Core-Rack, Distribution-B' : 'مانند رک اصلی سرور، Rack-A1، رک توزیع طبقه'}
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border text-white text-xs placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
                          isDuplicate
                            ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500'
                            : 'border-white/15 focus:border-cyan-400 focus:ring-cyan-400'
                        }`}
                        autoFocus
                      />
                      {isDuplicate && (
                        <p className="mt-1.5 text-xs text-red-400 font-medium flex items-center gap-1">
                          <span>⚠️</span>
                          <span>
                            {isEn
                              ? `A rack named "${newRackInput.trim()}" already exists on this floor`
                              : `رکی با این نام از قبل در این طبقه ثبت شده است`}
                          </span>
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/40 border-t border-white/10">
              <button
                type="button"
                onClick={() => setAddRackModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                {t('topology_physical_cancel_btn')}
              </button>
              {(() => {
                const isDuplicate = (customRacks[`${addRackModal.building}:::${addRackModal.floor}`] || []).some(
                  (r) => r.trim().toLowerCase() === newRackInput.trim().toLowerCase()
                );
                return (
                  <button
                    type="button"
                    onClick={() => handleAddRack(addRackModal.building, addRackModal.floor, newRackInput)}
                    disabled={!newRackInput.trim() || isDuplicate}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 transition shadow-lg cursor-pointer"
                  >
                    {t('topology_physical_create_btn')}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal 6: Rename Entity Modal (Building, Floor, Unit, Rack) */}
      {renameModal && (
        <div
          data-modal-backdrop="true"
          className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
          onClick={() => setRenameModal(null)}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-2xl bg-slate-900 border border-white/20 text-slate-100 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t('topology_physical_rename_modal_title')}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {(renameModal.type || '').toUpperCase()}: {renameModal.currentName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t('topology_physical_new_name_label')}
                </label>
                <input
                  type="text"
                  value={renameModal.newName}
                  onChange={(e) =>
                    setRenameModal({ ...renameModal, newName: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameModal.newName.trim()) {
                      handleRenameSubmit();
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/40 border-t border-white/10">
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                {t('topology_physical_cancel_btn')}
              </button>
              <button
                type="button"
                onClick={handleRenameSubmit}
                disabled={!renameModal.newName.trim()}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 transition shadow-lg cursor-pointer"
              >
                {t('topology_physical_save_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 7: Delete Entity Confirmation Modal */}
      {deleteModal && (
        <div
          data-modal-backdrop="true"
          className="fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center p-4 modal-backdrop-blur"
          onClick={() => setDeleteModal(null)}
        >
          <div
            className="relative w-full max-w-md flex flex-col rounded-2xl bg-slate-900 border border-rose-500/30 text-slate-100 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-rose-500/20 bg-rose-950/40">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {t('topology_physical_delete_modal_title')}
                  </h3>
                  <p className="text-[11px] text-rose-300/80 font-mono">
                    {(deleteModal.type || '').toUpperCase()}: {deleteModal.item || deleteModal.building}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-200">
                {t('topology_physical_delete_confirm', {
                  name: deleteModal.item || deleteModal.building,
                })}
              </p>
              {deleteModal.deviceCount > 0 && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    {t('topology_physical_delete_warning', { count: deleteModal.deviceCount })}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-950/40 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
              >
                {t('topology_physical_cancel_btn')}
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 transition shadow-lg cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('topology_physical_delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals for Custom Topology Maps */}
      {isPortSelectorOpen && (
        <CustomMapPortSelectorModal
          isOpen={isPortSelectorOpen}
          onClose={() => {
            setIsPortSelectorOpen(false);
            if (cableWorkflow.step === 'select_source_port') {
              setCableWorkflow({ step: 'idle', sourceDevice: null, sourcePort: null, targetDevice: null, targetPort: null });
            }
          }}
          device={
            cableWorkflow.step === 'select_target_port'
              ? cableWorkflow.targetDevice
              : cableWorkflow.sourceDevice
          }
          side={cableWorkflow.step === 'select_target_port' ? 'target' : 'source'}
          partnerDevice={cableWorkflow.step === 'select_target_port' ? cableWorkflow.sourceDevice : null}
          partnerPort={cableWorkflow.step === 'select_target_port' ? cableWorkflow.sourcePort : null}
          customMapLinks={currentCustomMap?.links || []}
          allDevices={allAvailableDevices}
          onDisconnectLink={handleDeleteLinkDirectly}
          onSelectPort={handleSelectPort}
        />
      )}

      {/* Confirmation Modal for Disconnecting Cable Link */}
      {linkToDelete && (
        <div
          className="fixed top-0 left-0 right-0 bottom-8 z-[100005] flex items-center justify-center p-4 modal-backdrop-blur"
          data-modal-backdrop="true"
          dir={isRtl ? 'rtl' : 'ltr'}
          onClick={() => setLinkToDelete(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 text-slate-800 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isEn ? 'Disconnect Cable Connection' : 'قطع ارتباط و حذف کابل شبکه'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isEn ? 'Confirm link removal from network topology' : 'تایید قطع اتصال و حذف کابل از توپولوژی شبکه'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs font-mono space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{isEn ? 'Source Device:' : 'دستگاه مبدا:'}</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {getDeviceNameById(linkToDelete.sourceDeviceId)} ({linkToDelete.sourcePort})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">{isEn ? 'Destination Device:' : 'دستگاه مقصد:'}</span>
                <span className="font-bold text-purple-600 dark:text-purple-400">
                  {getDeviceNameById(linkToDelete.targetDeviceId)} ({linkToDelete.targetPort})
                </span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 dark:border-slate-750">
                <span className="text-slate-500 dark:text-slate-400">{isEn ? 'Cable Specs:' : 'مشخصات کابل:'}</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {linkToDelete.speed || '1G'} • {linkToDelete.cableType?.toUpperCase() || 'COPPER'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              {isEn
                ? 'Are you sure you want to disconnect this cable? The connection will be removed from this topology map.'
                : 'آیا از قطع ارتباط این کابل اطمینان دارید؟ این ارتباط از نقشه توپولوژی حذف خواهد شد.'}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setLinkToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition font-medium text-xs cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteLinkDirectly(linkToDelete.id);
                  setLinkToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isEn ? 'Yes, Disconnect Link' : 'بله، قطع ارتباط و حذف'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isLinkConfigOpen && cableWorkflow.sourceDevice && cableWorkflow.targetDevice && (
        <CustomMapLinkConfigModal
          isOpen={isLinkConfigOpen}
          onClose={() => {
            setIsLinkConfigOpen(false);
            setCableWorkflow({
              step: 'idle',
              sourceDevice: null,
              sourcePort: null,
              targetDevice: null,
              targetPort: null,
              editingLink: null,
            });
          }}
          sourceDevice={cableWorkflow.sourceDevice}
          targetDevice={cableWorkflow.targetDevice}
          sourcePort={cableWorkflow.sourcePort || 'GigabitEthernet0/1'}
          targetPort={cableWorkflow.targetPort || 'GigabitEthernet0/1'}
          sourceInitialData={cableWorkflow.sourceInitialPortData}
          sourceInitialPortData={cableWorkflow.sourceInitialPortData}
          targetInitialData={cableWorkflow.targetInitialPortData}
          targetInitialPortData={cableWorkflow.targetInitialPortData}
          existingLink={cableWorkflow.editingLink || undefined}
          onSave={handleSaveCustomLink}
          onSaveLink={handleSaveCustomLink}
          onDelete={cableWorkflow.editingLink ? handleDeleteCustomLink : undefined}
          onDeleteLink={cableWorkflow.editingLink ? handleDeleteCustomLink : undefined}
        />
      )}

      {isAddDeviceOpen && currentCustomMap && (
        <CustomMapAddDeviceModal
          isOpen={isAddDeviceOpen}
          onClose={() => {
            setIsAddDeviceOpen(false);
            undockModal('custom_map_add_device');
          }}
          onMinimize={() => {
            setIsAddDeviceOpen(false);
            dockModal({
              id: 'custom_map_add_device',
              labelEn: 'Add Device to Custom Map',
              labelFa: 'افزودن تجهیز به نقشه سفارشی',
              badge: currentCustomMap.name,
              category: 'device',
              onRestore: () => setIsAddDeviceOpen(true),
              onClose: () => setIsAddDeviceOpen(false),
            });
          }}
          availableDevices={allAvailableDevices}
          existingDeviceIds={currentCustomMap.deviceIds || []}
          racks={currentCustomMap.racks || []}
          initialDisplayMode={globalDeviceViewMode}
          onAddDevice={handleAddDeviceToCustomMap}
          isLightMode={isLightMode}
        />
      )}

      {isManageMapOpen && (
        <CustomMapManageModal
          isOpen={isManageMapOpen}
          onClose={() => {
            setIsManageMapOpen(false);
            undockModal('custom_map_manage');
          }}
          onMinimize={() => {
            setIsManageMapOpen(false);
            dockModal({
              id: 'custom_map_manage',
              labelEn: 'Manage Custom Maps',
              labelFa: 'مدیریت نقشه‌های سفارشی',
              category: 'config',
              onRestore: () => setIsManageMapOpen(true),
              onClose: () => setIsManageMapOpen(false),
            });
          }}
          mode={manageMapMode}
          currentMap={manageMapMode !== 'create' ? currentCustomMap || undefined : undefined}
          onCreateMap={handleCreateCustomMap}
          onUpdateMap={handleUpdateCustomMap}
          onDeleteMap={handleDeleteCustomMap}
          isLightMode={isLightMode}
        />
      )}

      {/* Rack & Hardware Studio Modals */}
      {isAddRackOpen && currentCustomMap && (
        <AddRackModal
          isOpen={isAddRackOpen}
          onClose={() => setIsAddRackOpen(false)}
          onAddRack={handleCreateCustomMapRack}
          existingRacks={currentCustomMap.racks || []}
        />
      )}

      {editingRack && currentCustomMap && (
        <EditRackModal
          isOpen={!!editingRack}
          onClose={() => setEditingRack(null)}
          rack={editingRack}
          existingRacks={currentCustomMap.racks || []}
          onSaveRack={handleSaveRack}
        />
      )}

      {transferDeviceTarget && currentCustomMap && (
        <TransferDeviceModal
          isOpen={!!transferDeviceTarget}
          onClose={() => setTransferDeviceTarget(null)}
          device={transferDeviceTarget.device}
          sourceRack={transferDeviceTarget.sourceRack}
          allRacks={currentCustomMap.racks || []}
          onTransferDevice={handleTransferDevice}
        />
      )}

      {isAddHardwareOpen && currentCustomMap && (
        <AddHardwareModal
          isOpen={isAddHardwareOpen}
          onClose={() => {
            setIsAddHardwareOpen(false);
            setEditingHardwareDevice(null);
          }}
          onMinimize={() => {
            setIsAddHardwareOpen(false);
            setEditingHardwareDevice(null);
          }}
          racks={currentCustomMap.racks || []}
          currentMapDeviceIds={currentCustomMap.deviceIds || []}
          defaultRackId={selectedRackForHardware}
          defaultTargetU={targetUForHardware}
          editingDevice={editingHardwareDevice}
          onSaveHardware={handleSaveHardware}
          onAddRack={handleCreateCustomMapRack}
          onAddTower={handleCreateCustomMapTower}
          inventoryDevices={allAvailableDevices}
          isLightMode={isLightMode}
        />
      )}

      {/* Telecom Tower Modals */}
      {isAddTowerOpen && currentCustomMap && (
        <AddTowerModal
          isOpen={isAddTowerOpen}
          onClose={() => {
            setIsAddTowerOpen(false);
            setEditingTower(null);
          }}
          onSave={handleCreateCustomMapTower}
        />
      )}

      {editingTower && currentCustomMap && (
        <AddTowerModal
          isOpen={!!editingTower}
          onClose={() => setEditingTower(null)}
          onSave={(towerData) => {
            handleSaveTower({ ...editingTower, ...towerData });
            setEditingTower(null);
          }}
          initialData={editingTower}
        />
      )}

      {isMountRadioOpen && currentCustomMap && mountRadioTargetTowerId && (
        <MountRadioOnTowerModal
          isOpen={isMountRadioOpen}
          onClose={() => {
            setIsMountRadioOpen(false);
            setEditingRadioDevice(null);
            setMountRadioTargetTowerId(null);
          }}
          tower={currentCustomMap.towers?.find((t) => t.id === mountRadioTargetTowerId)!}
          editingDevice={editingRadioDevice}
          onSave={(radioDev) => handleSaveRadioOnTower(mountRadioTargetTowerId, radioDev)}
          onSaveRadio={(tId, radioDev) => handleSaveRadioOnTower(tId, radioDev)}
          inventoryDevices={allAvailableDevices}
        />
      )}

      {activeInspectingRack && (
        <RackElevationInspectorModal
          isOpen={!!activeInspectingRack}
          onClose={() => {
            setInspectingRack(null);
            setInspectingRackId(null);
          }}
          rack={activeInspectingRack}
          onToggleViewMode={handleToggleRackViewMode}
          onOpenAddHardware={handleOpenAddHardware}
          onEditRack={(r) => setEditingRack(r)}
          onTransferDevice={(dev, r) => setTransferDeviceTarget({ device: dev, sourceRack: r })}
          onViewInCardMode={handleViewDeviceInCardMode}
          onEditDeviceNic={handleEditDeviceNic}
          onEditSpecs={handleEditDeviceSpecs}
          onEditDeviceProperties={handleEditDeviceProperties}
          onConnectTerminal={handleConnectTerminalFromRack}
          onInspectPorts={handleInspectPortsFromRack}
          onPromptRemoveDevice={handlePromptRemoveHardwareDevice}
          onMoveDevice={handleMoveDeviceInRack}
          onRemoveDevice={handleRemoveDeviceFromRack}
          onDeleteRack={handleDeleteRack}
        />
      )}

      {/* Network Equipment Inventory - Edit Device Properties Modal */}
      {editingInventoryDevice && (
        <EditDeviceModal
          isOpen={!!editingInventoryDevice}
          device={editingInventoryDevice}
          onClose={() => setEditingInventoryDevice(null)}
          onSave={handleSaveInventoryDevice}
        />
      )}

      {/* Safe Deletion Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteModalTarget}
        onClose={() => setDeleteModalTarget(null)}
        target={deleteModalTarget}
        onConfirmDeleteDevice={handleConfirmDeleteDevice}
        onConfirmDeleteRack={handleConfirmDeleteRack}
        onConfirmDeleteStickyNote={handleDeleteStickyNote}
      />

      {/* CDP & LLDP Topology Discovery Modal */}
      {isDiscoveryModalOpen && (
        <TopologyDiscoveryModal
          isOpen={isDiscoveryModalOpen}
          onClose={() => setIsDiscoveryModalOpen(false)}
          devices={allAvailableDevices}
          customMaps={customMaps}
          activeMapId={currentCustomMap?.id || 'default'}
          onApplyToMap={handleApplyDiscoveredLinksAndDevices}
          isLightMode={isLightMode}
        />
      )}
      </div>
    </div>
  );
};
