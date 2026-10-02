import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Minus, Maximize2, Minimize2, Cable, Zap, Shield, ShieldCheck, ShieldAlert, CheckCircle2, AlertCircle, Edit3, Save, Power, Terminal, AlertTriangle, ArrowRight, Check, Lock, Key, Layers, CheckSquare, Square, FileText, Gauge, Activity } from 'lucide-react';
import { Device, SwitchPort } from '../types';
import { fetchDevicePorts, updateSwitchPort, writeMemory, batchUpdateSwitchPorts, executeDeviceOperation } from '../services/api';
import { NetworkPortSvg } from './NetworkPortSvg';
import { CiscoPortContextMenu } from './CiscoPortContextMenu';
import { CiscoCommandConfirmModal } from './CiscoCommandConfirmModal';
import { CiscoPortConfigConfirmModal, PortConfigUpdates } from './CiscoPortConfigConfirmModal';
import { AssignVlanModal } from './AssignVlanModal';
import { PortDescriptionModal } from './PortDescriptionModal';
import { CiscoWriteConfirmModal, WriteChangeItem } from './CiscoWriteConfirmModal';
import { CiscoSystemResourcesTab } from './CiscoSystemResourcesTab';
import { useLanguage } from '../i18n/LanguageContext';
import { useModalDock } from '../context/ModalDockContext';
import { useAuth } from '../context/AuthContext';
import { isDeviceActionPermitted } from '../utils/rbac';

interface PortInspectorModalProps {
  device: Device | null;
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onPortUpdated?: () => void;
  onConnectTerminal?: (device: Device) => void;
  onWriteMemory?: (deviceId: string) => void;
}

export const PortInspectorModal: React.FC<PortInspectorModalProps> = ({
  device,
  isOpen,
  onClose,
  onMinimize,
  onPortUpdated,
  onConnectTerminal,
  onWriteMemory,
}) => {
  const { t, isEn } = useLanguage();
  const { dockModal, undockModal } = useModalDock();
  const { effectivePolicy } = useAuth();

  const canTerminal = Boolean(
    device &&
    onConnectTerminal &&
    isDeviceActionPermitted(effectivePolicy, device.id, 'terminal')
  );

  const [ports, setPorts] = useState<SwitchPort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPort, setSelectedPort] = useState<SwitchPort | null>(null);
  const [activeTab, setActiveTab] = useState<'ports' | 'resources'>('ports');
  const [filterMode, setFilterMode] = useState<'all' | 'up' | 'down' | 'trunk' | 'access' | 'port-sec'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);

  // Right-click Cisco Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    port: SwitchPort;
  } | null>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editAdminStatus, setEditAdminStatus] = useState<'enabled' | 'disabled'>('enabled');
  const [editMode, setEditMode] = useState<'trunk' | 'access'>('access');
  const [editVlan, setEditVlan] = useState(1);
  const [editAllowedVlans, setEditAllowedVlans] = useState('');
  const [editConnected, setEditConnected] = useState('');
  const [editDesc, setEditDesc] = useState('');
  // Cisco Port Security Editing state
  const [editPortSecEnabled, setEditPortSecEnabled] = useState(false);
  const [editPortSecMaxMac, setEditPortSecMaxMac] = useState(1);
  const [editPortSecMode, setEditPortSecMode] = useState<'sticky' | 'configured' | 'dynamic'>('sticky');
  const [editPortSecConfiguredMac, setEditPortSecConfiguredMac] = useState('');
  const [editPortSecViolation, setEditPortSecViolation] = useState<'shutdown' | 'restrict' | 'protect'>('shutdown');
  const [isSaving, setIsSaving] = useState(false);
  const editSectionRef = useRef<HTMLDivElement>(null);

  // Cisco Port Config / Batch Apply Confirmation Modal state
  const [portConfigConfirmModal, setPortConfigConfirmModal] = useState<{
    targetPortIds: string[];
    updates: PortConfigUpdates;
    isBatch: boolean;
  } | null>(null);
  const [isExecutingPortConfig, setIsExecutingPortConfig] = useState(false);
  const [isWritingMem, setIsWritingMem] = useState(false);
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);
  const [sessionChanges, setSessionChanges] = useState<WriteChangeItem[]>([]);

  // Right-click action confirmation modal state (Yes/No with device CLI preview)
  const [confirmModalState, setConfirmModalState] = useState<{
    action: 'shutdown' | 'no_shutdown' | 'mode_trunk' | 'mode_access' | 'port_sec_disable';
    port: SwitchPort;
  } | null>(null);
  const [isExecutingConfirmAction, setIsExecutingConfirmAction] = useState(false);

  // Assign Access VLAN modal state
  const [vlanAssignModalPort, setVlanAssignModalPort] = useState<SwitchPort | null>(null);
  const [isAssigningVlan, setIsAssigningVlan] = useState(false);

  // Set Port Description modal state
  const [descriptionModalPort, setDescriptionModalPort] = useState<SwitchPort | null>(null);
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // Multi-port selection and batch operations
  const [selectedPortIds, setSelectedPortIds] = useState<string[]>([]);
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [batchSuccessMessage, setBatchSuccessMessage] = useState<string | null>(null);

  // Batch edit form values
  const [batchAdminStatus, setBatchAdminStatus] = useState<'no_change' | 'enabled' | 'disabled'>('no_change');
  const [batchMode, setBatchMode] = useState<'no_change' | 'access' | 'trunk'>('no_change');
  const [batchVlan, setBatchVlan] = useState<string>(''); // empty means no change
  const [batchAllowedVlans, setBatchAllowedVlans] = useState<string>('');
  const [batchPortSec, setBatchPortSec] = useState<'no_change' | 'enabled' | 'disabled'>('no_change');
  const [batchPortSecMode, setBatchPortSecMode] = useState<'sticky' | 'dynamic' | 'configured'>('sticky');
  const [batchPortSecMaxMac, setBatchPortSecMaxMac] = useState<number>(1);

  const handlePortContextMenu = (e: React.MouseEvent, port: SwitchPort) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      port,
    });
  };

  const handleExecuteContextMenuAction = async (action: string, extra?: any) => {
    if (!contextMenu || !device) return;
    const targetPort = contextMenu.port;

    // 1. If user chose "Enable Port Security"
    // Requirement: "اگر فعال کردن پورت سکوریتی رو انتخاب شد از این منو باید بره تو همین مودال قسمت ویرایش پورت و تیک فعال شدن پورت سکوریتی رو بزنه تا از اینجا طرف خودش کانفیگ کنه"
    if (action === 'port_sec_enable') {
      setSelectedPort(targetPort);
      setIsEditing(true);
      setEditPortSecEnabled(true);
      setEditMode('access');
      setContextMenu(null);
      setTimeout(() => {
        const secEl = document.getElementById('port-security-section');
        if (secEl) {
          secEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    // 2. If user chose "Assign Access VLAN"
    // Requirement: "اگر اساین اگسس ویلن رو انتخاب کردم باید یه مودال باز بشه بالاش وی لن های این دستگاه رو نشون بده و یه کادر باشه که من بتونم خودم بگم این پورت بره تو چه ویلنی"
    if (action === 'open_assign_vlan' || action === 'change_vlan') {
      setContextMenu(null);
      setVlanAssignModalPort(targetPort);
      return;
    }

    // 3. If user chose "Set Port Description"
    // Requirement: "وقتی یک پورت راست کلیک میکنیم امکان اضافه کردن دیسکریپشن هم باشه که برای اون پورت اضافه بشه براش مودال باز بشه و بعد از تایید بشینه رو پورت"
    if (action === 'edit_description') {
      setContextMenu(null);
      setDescriptionModalPort(targetPort);
      return;
    }

    // 4. For all other actions:
    // Requirement: "از منوی که با راست کلیک باز میشه اگر هر کدوم رو که انتخاب کردم باید یه تایید یس و نو بگیره از من اگر یس زدم باید کامند متناظرش رو در دیوایس اجرا کنه با توجه به نوع دستگاهی که هست منظورم سویچ یا روتر بودنشه"
    setContextMenu(null);
    setConfirmModalState({
      action: action as any,
      port: targetPort,
    });
  };

  const handleConfirmExecuteCommand = async () => {
    if (!confirmModalState || !device) return;
    const { action, port: targetPort } = confirmModalState;
    let updates: Partial<SwitchPort> = {};

    switch (action) {
      case 'shutdown':
        updates = { admin_status: 'disabled', status: 'down' };
        break;
      case 'no_shutdown':
        updates = { admin_status: 'enabled', status: 'up' };
        break;
      case 'mode_trunk':
        updates = { mode: 'trunk', allowed_vlans: targetPort.allowed_vlans || '1-4094' };
        break;
      case 'mode_access':
        updates = { mode: 'access', vlan: targetPort.vlan || 1 };
        break;
      case 'port_sec_disable':
        updates = { port_security_enabled: false };
        break;
      default:
        break;
    }

    try {
      setIsExecutingConfirmAction(true);

      // 1. Execute hardware operation CLI on physical device or simulator
      let opRes: any = null;
      try {
        opRes = await executeDeviceOperation(
          device.id,
          action,
          targetPort.port_id,
          {
            device_type: device.type,
            is_router: device.type === 'router',
            vlan: targetPort.vlan,
          }
        );
      } catch (opErr) {
        console.warn('executeDeviceOperation note:', opErr);
      }

      // 2. Persist state via updateSwitchPort
      try {
        await updateSwitchPort(device.id, targetPort.port_id, updates);
      } catch (putErr) {
        if (!opRes?.success) {
          throw putErr;
        }
      }

      // 3. Update local ports state and selected port view
      setPorts((prev) =>
        prev.map((p) =>
          p.port_id === targetPort.port_id || p.name === targetPort.port_id
            ? { ...p, ...updates }
            : p
        )
      );

      if (
        selectedPort &&
        (selectedPort.port_id === targetPort.port_id || selectedPort.name === targetPort.port_id)
      ) {
        setSelectedPort((prev) => (prev ? { ...prev, ...updates } : null));
        if (updates.mode) setEditMode(updates.mode as any);
        if (updates.admin_status) setEditAdminStatus(updates.admin_status as any);
      }

      device.has_unsaved_changes = true;
      const cmdText =
        action === 'mode_trunk'
          ? `interface ${targetPort.port_id}\n switchport trunk encapsulation dot1q\n switchport mode trunk`
          : action === 'mode_access'
          ? `interface ${targetPort.port_id}\n switchport mode access\n switchport access vlan ${targetPort.vlan || 1}`
          : action === 'shutdown'
          ? `interface ${targetPort.port_id}\n shutdown`
          : action === 'no_shutdown'
          ? `interface ${targetPort.port_id}\n no shutdown`
          : `interface ${targetPort.port_id}\n no switchport port-security`;

      setSessionChanges((prev) => [
        ...prev,
        {
          target: targetPort.port_id,
          type: action.includes('mode') ? 'mode' : 'admin',
          change:
            action === 'mode_trunk'
              ? 'Mode -> Trunk'
              : action === 'mode_access'
              ? 'Mode -> Access'
              : action,
          command: cmdText,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      setConfirmModalState(null);
      if (onPortUpdated) onPortUpdated();
    } catch (err: any) {
      console.error('Failed to execute command on device:', err);
      alert(
        (isEn ? 'Failed to apply configuration to device: ' : 'خطا در اعمال پیکربندی روی دیوایس: ') +
          (err.message || err)
      );
    } finally {
      setIsExecutingConfirmAction(false);
    }
  };

  const handleConfirmAssignVlan = async (newVlan: number) => {
    if (!vlanAssignModalPort || !device) return;
    const targetPort = vlanAssignModalPort;

    try {
      setIsAssigningVlan(true);
      // 1. Execute the configuration command on the device via the operations API (real SSH or simulator)
      let opRes: any = null;
      try {
        opRes = await executeDeviceOperation(
          device.id,
          'set_vlan',
          targetPort.port_id,
          { vlan: newVlan, device_type: device.type, is_router: device.type === 'router' }
        );
      } catch (opErr) {
        console.warn('executeDeviceOperation set_vlan note:', opErr);
      }

      // 2. Persist via updateSwitchPort (which updates DB and applies CLI command)
      try {
        await updateSwitchPort(device.id, targetPort.port_id, {
          vlan: newVlan,
          mode: 'access',
        });
      } catch (putErr) {
        if (!opRes?.success) {
          throw putErr;
        }
      }

      // 3. Update local ports state and selected port view
      setPorts((prev) =>
        prev.map((p) =>
          p.port_id === targetPort.port_id || p.name === targetPort.port_id
            ? { ...p, vlan: newVlan, mode: 'access' }
            : p
        )
      );

      if (
        selectedPort &&
        (selectedPort.port_id === targetPort.port_id || selectedPort.name === targetPort.port_id)
      ) {
        setSelectedPort((prev) => (prev ? { ...prev, vlan: newVlan, mode: 'access' } : null));
        setEditVlan(newVlan);
        setEditMode('access');
      }

      device.has_unsaved_changes = true;
      setSessionChanges((prev) => [
        ...prev,
        {
          target: targetPort.port_id,
          type: 'vlan',
          change: `Assigned VLAN ${newVlan} (Access)`,
          command: `interface ${targetPort.port_id}\n switchport mode access\n switchport access vlan ${newVlan}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setVlanAssignModalPort(null);
      if (onPortUpdated) onPortUpdated();
    } catch (err: any) {
      console.error('Failed to assign VLAN:', err);
      alert(
        (isEn ? 'Failed to assign VLAN: ' : 'خطا در تخصیص ویلن به پورت: ') +
          (err.message || err)
      );
    } finally {
      setIsAssigningVlan(false);
    }
  };

  const handleConfirmSetDescription = async (newDescription: string) => {
    if (!descriptionModalPort || !device) return;
    const targetPort = descriptionModalPort;
    const cleanDesc = newDescription.trim();

    try {
      setIsSavingDescription(true);
      // 1. Execute the configuration command on the device via the operations API (real SSH or simulator)
      let opRes: any = null;
      try {
        opRes = await executeDeviceOperation(
          device.id,
          'set_description',
          targetPort.port_id,
          { description: cleanDesc }
        );
      } catch (opErr) {
        console.warn('executeDeviceOperation note:', opErr);
      }

      // 2. Also persist via updateSwitchPort (which updates DB and applies CLI command)
      try {
        await updateSwitchPort(device.id, targetPort.port_id, {
          description: cleanDesc,
        });
      } catch (putErr) {
        if (!opRes?.success) {
          throw putErr;
        }
      }

      // 3. Update local ports state and selected port view
      setPorts((prev) =>
        prev.map((p) =>
          p.port_id === targetPort.port_id || p.name === targetPort.port_id
            ? { ...p, description: cleanDesc }
            : p
        )
      );
      if (
        selectedPort &&
        (selectedPort.port_id === targetPort.port_id || selectedPort.name === targetPort.port_id)
      ) {
        setSelectedPort((prev) => (prev ? { ...prev, description: cleanDesc } : null));
        setEditDesc(cleanDesc);
      }

      device.has_unsaved_changes = true;
      setSessionChanges((prev) => [
        ...prev,
        {
          target: targetPort.port_id,
          type: 'description',
          change: `Set description to "${cleanDesc}"`,
          command: `interface ${targetPort.port_id}\n description ${cleanDesc}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setDescriptionModalPort(null);
      if (onPortUpdated) onPortUpdated();
    } catch (err: any) {
      console.error('Failed to set port description:', err);
      alert(
        (isEn
          ? 'Failed to set port description: '
          : 'خطا در اعمال توضیحات پورت: ') + (err.message || err)
      );
    } finally {
      setIsSavingDescription(false);
    }
  };

  useEffect(() => {
    if (device?.id && isOpen) {
      loadPorts();
    }
  }, [device?.id, isOpen]);

  const loadPorts = async () => {
    if (!device) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchDevicePorts(device.id);
      const rawPorts = res.ports || [];
      const normalizedPorts = rawPorts.map((p: any, idx: number) => {
        const rawStat = String(p.status || '').toLowerCase().trim();
        const rawAdmin = String(p.admin_status || '').toLowerCase().trim();
        const isDis = rawAdmin === 'disabled' || rawAdmin === 'shutdown' || rawStat === 'disabled' || rawStat === 'err-disabled' || rawStat === 'administratively down';
        const isConn = !isDis && (rawStat === 'up' || rawStat === 'connected' || rawStat === 'active' || rawStat === 'running');
        return {
          ...p,
          port_id: p.port_id || p.port || p.name || `port-${idx + 1}`,
          status: isConn ? 'up' : 'down',
          admin_status: isDis ? 'disabled' : 'enabled',
          mode: String(p.mode || 'access').toLowerCase().trim() === 'trunk' ? 'trunk' : 'access',
        };
      });
      setPorts(normalizedPorts);
      if (normalizedPorts.length > 0) {
        setSelectedPort((prev) => {
          if (!prev) return normalizedPorts[0];
          const prevId = prev.port_id || (prev as any).port || prev.name;
          const matched = normalizedPorts.find(
            (p) => (p.port_id || (p as any).port || p.name) === prevId
          );
          return matched || normalizedPorts[0];
        });
        setSelectedPortIds((prev) => {
          if (!prev || prev.length === 0) return [normalizedPorts[0].port_id];
          const validIds = prev.filter((id) =>
            normalizedPorts.some((p) => (p.port_id || (p as any).port || p.name) === id)
          );
          return validIds.length > 0 ? validIds : [normalizedPorts[0].port_id];
        });
      } else {
        setSelectedPort(null);
        setSelectedPortIds([]);
      }
    } catch (err: any) {
      setError(err.message || 'خطا در بارگذاری اطلاعات پورت‌ها');
    } finally {
      setLoading(false);
    }
  };

  const handlePortClick = (e: React.MouseEvent, port: SwitchPort) => {
    setBatchSuccessMessage(null);
    const pId = port.port_id || (port as any).port || port.name;
    if (!pId) return;
    const freshPort = ports.find((p) => (p.port_id || (p as any).port || p.name) === pId) || port;
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      // Multi-selection with Ctrl / Cmd / Shift
      setSelectedPortIds((prev) => {
        const exists = prev.includes(pId);
        let updated: string[];
        if (exists) {
          updated = prev.filter((id) => id !== pId);
          if (updated.length === 0) updated = [pId];
        } else {
          updated = [...prev, pId];
        }
        return updated;
      });
      setSelectedPort(freshPort);
      setIsEditing(false);
    } else {
      // Single select
      setSelectedPort(freshPort);
      setSelectedPortIds([pId]);
      setIsEditing(false);
    }
  };

  const handleSelectPort = (port: SwitchPort) => {
    const pId = port.port_id || (port as any).port || port.name;
    const freshPort = ports.find((p) => (p.port_id || (p as any).port || p.name) === pId) || port;
    setSelectedPort(freshPort);
    setSelectedPortIds(pId ? [pId] : []);
    setIsEditing(false);
  };

  const activeSelectedPort = useMemo(() => {
    if (selectedPort) {
      const sId = selectedPort.port_id || (selectedPort as any).port || selectedPort.name;
      const found = ports.find((p) => (p.port_id || (p as any).port || p.name) === sId);
      if (found) return found;
      return selectedPort;
    }
    if (selectedPortIds && selectedPortIds.length > 0) {
      const found = ports.find((p) => (p.port_id || (p as any).port || p.name) === selectedPortIds[0]);
      if (found) return found;
    }
    return ports[0] || null;
  }, [ports, selectedPort, selectedPortIds]);

  const getMaxSpeed = (p?: SwitchPort | null) => {
    if (!p) return '1 Gbps';
    if ((p as any).max_speed) return String((p as any).max_speed);
    const pId = (p.port_id || p.name || '').toLowerCase();
    const rawSpeed = String(p.speed || '').toLowerCase();
    if (rawSpeed.includes('10g') || pId.startsWith('te') || pId.includes('tengigabit')) return '10 Gbps';
    if (pId.startsWith('fo') || pId.includes('fortygigabit')) return '40 Gbps';
    if (pId.startsWith('hu') || pId.includes('hundredgig')) return '100 Gbps';
    if (pId.startsWith('fa') || pId.includes('fastethernet')) return '100 Mbps';
    return '1 Gbps';
  };

  const getNegotiatedSpeed = (p?: SwitchPort | null) => {
    if (!p) return isEn ? 'No Link (Down)' : 'عدم برقراری لینک (قطع)';
    if ((p as any).negotiated_speed) return String((p as any).negotiated_speed);
    if (p.status !== 'up') {
      return isEn ? 'No Link (Down)' : 'عدم برقراری لینک (قطع)';
    }
    const raw = String(p.speed || '').trim();
    if (raw === '1000' || raw === 'a-1000') return '1 Gbps';
    if (raw === '10000' || raw === '10G' || raw === 'a-10000') return '10 Gbps';
    if (raw === '100' || raw === 'a-100') return '100 Mbps';
    if (raw === '10' || raw === 'a-10') return '10 Mbps';
    if (raw.toLowerCase().includes('bps')) return raw;
    if (raw && raw !== 'auto') return `${raw} Mbps`;
    return getMaxSpeed(p);
  };

  const handleOpenBatchConfirm = () => {
    if (!device || selectedPortIds.length === 0) return;

    const hasAnyChange =
      batchAdminStatus !== 'no_change' ||
      batchMode !== 'no_change' ||
      batchVlan.trim() !== '' ||
      batchAllowedVlans.trim() !== '' ||
      batchPortSec !== 'no_change';

    if (!hasAnyChange) {
      setError(
        isEn
          ? 'Please specify at least one configuration parameter to apply in batch.'
          : 'لطفاً حداقل یکی از پارامترهای تنظیماتی را برای اعمال دسته‌ای مشخص نمایید.'
      );
      return;
    }

    const updates: PortConfigUpdates = {};
    if (batchAdminStatus !== 'no_change') {
      updates.admin_status = batchAdminStatus;
      updates.status = batchAdminStatus === 'disabled' ? 'down' : 'up';
    }
    if (batchMode !== 'no_change') {
      updates.mode = batchMode;
    }
    if (batchVlan.trim() !== '') {
      const v = parseInt(batchVlan.trim(), 10);
      if (!isNaN(v) && v >= 1 && v <= 4094) {
        updates.vlan = v;
      }
    }
    if (batchAllowedVlans.trim() !== '') {
      updates.allowed_vlans = batchAllowedVlans.trim();
    }
    if (batchPortSec !== 'no_change') {
      updates.port_security_enabled = batchPortSec === 'enabled';
      if (batchPortSec === 'enabled') {
        updates.port_security_mode = batchPortSecMode;
        updates.port_security_max_mac = batchPortSecMaxMac;
      }
    }

    setPortConfigConfirmModal({
      targetPortIds: selectedPortIds,
      updates,
      isBatch: true,
    });
  };

  const startEdit = (port: SwitchPort) => {
    setSelectedPort(port);
    setEditAdminStatus(port.admin_status);
    setEditMode(port.mode);
    setEditVlan(port.vlan);
    setEditAllowedVlans(port.allowed_vlans || '');
    setEditConnected(port.connected_device || '');
    setEditDesc(port.description || '');
    setEditPortSecEnabled(!!port.port_security_enabled);
    setEditPortSecMaxMac(port.port_security_max_mac || 1);
    setEditPortSecMode(port.port_security_mode || 'sticky');
    setEditPortSecConfiguredMac(port.port_security_configured_mac || '');
    setEditPortSecViolation(port.port_security_violation || 'shutdown');
    setIsEditing(true);

    setTimeout(() => {
      if (editSectionRef.current) {
        editSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  // Called when user clicks "ذخیره در سوئیچ" -> opens Cisco confirmation modal first
  const handleOpenSingleSaveConfirm = () => {
    if (!device || !selectedPort) return;
    const updates: PortConfigUpdates = {
      admin_status: editAdminStatus,
      status: editAdminStatus === 'disabled' ? 'down' : 'up',
      mode: editMode,
      vlan: editVlan,
      allowed_vlans: editAllowedVlans,
      connected_device: editConnected,
      description: editDesc,
      port_security_enabled: editPortSecEnabled,
      port_security_max_mac: editPortSecMaxMac,
      port_security_mode: editPortSecMode,
      port_security_configured_mac: editPortSecConfiguredMac,
      port_security_violation: editPortSecViolation,
    };

    setPortConfigConfirmModal({
      targetPortIds: [selectedPort.port_id],
      updates,
      isBatch: false,
    });
  };

  // Called after confirmation in Cisco confirmation modal
  const handleConfirmExecutePortConfig = async () => {
    if (!device || !portConfigConfirmModal) return;
    const { targetPortIds, updates, isBatch } = portConfigConfirmModal;

    try {
      setIsExecutingPortConfig(true);
      setError(null);

      if (isBatch) {
        const batchPayload: Partial<SwitchPort> = {};
        if (updates.admin_status && updates.admin_status !== 'no_change') {
          batchPayload.admin_status = updates.admin_status;
          batchPayload.status = updates.admin_status === 'disabled' ? 'down' : 'up';
        }
        if (updates.mode && updates.mode !== 'no_change') {
          batchPayload.mode = updates.mode;
        }
        if (updates.vlan !== undefined && updates.vlan !== '') {
          batchPayload.vlan = Number(updates.vlan);
        }
        if (updates.allowed_vlans) {
          batchPayload.allowed_vlans = updates.allowed_vlans;
        }
        if (updates.port_security_enabled !== undefined && updates.port_security_enabled !== 'no_change') {
          batchPayload.port_security_enabled = updates.port_security_enabled === true || updates.port_security_enabled === 'enabled';
          if (batchPayload.port_security_enabled) {
            batchPayload.port_security_mode = updates.port_security_mode;
            batchPayload.port_security_max_mac = updates.port_security_max_mac;
          }
        }

        const res = await batchUpdateSwitchPorts(device.id, targetPortIds, batchPayload);

        // Update local ports
        const updatedPortMap = new Map(res.ports.map((p) => [p.port_id, p]));
        setPorts((prev) => prev.map((p) => updatedPortMap.get(p.port_id) || p));

        if (selectedPort && updatedPortMap.has(selectedPort.port_id)) {
          setSelectedPort(updatedPortMap.get(selectedPort.port_id)!);
        }

        device.has_unsaved_changes = true;
        setBatchSuccessMessage(
          isEn
            ? `Successfully executed Cisco commands and applied configuration to ${res.updatedCount} ports!`
            : `دستورات سیسکو با موفقیت روی ${res.updatedCount} پورت انتخابی اجرا و اعمال شدند!`
        );

        // Reset batch inputs
        setBatchAdminStatus('no_change');
        setBatchMode('no_change');
        setBatchVlan('');
        setBatchAllowedVlans('');
        setBatchPortSec('no_change');
      } else {
        const portId = targetPortIds[0];
        const res = await updateSwitchPort(device.id, portId, {
          admin_status: updates.admin_status !== 'no_change' ? updates.admin_status : undefined,
          status: updates.status,
          mode: updates.mode !== 'no_change' ? updates.mode : undefined,
          vlan: Number(updates.vlan) || 1,
          allowed_vlans: updates.allowed_vlans,
          connected_device: updates.connected_device,
          description: updates.description,
          port_security_enabled: updates.port_security_enabled === true || updates.port_security_enabled === 'enabled',
          port_security_max_mac: updates.port_security_max_mac,
          port_security_mode: updates.port_security_mode,
          port_security_configured_mac: updates.port_security_configured_mac,
          port_security_violation: updates.port_security_violation,
        });

        // Update local ports
        setPorts((prev) =>
          prev.map((p) => (p.port_id === portId ? res.port : p))
        );
        setSelectedPort(res.port);
        setIsEditing(false);
        device.has_unsaved_changes = true;
      }

      if (onPortUpdated) onPortUpdated();
      setPortConfigConfirmModal(null);
    } catch (err: any) {
      alert((isEn ? 'Error executing Cisco port configuration: ' : 'خطا در اجرای دستورات سیسکو و تنظیم پورت: ') + (err.message || err));
    } finally {
      setIsExecutingPortConfig(false);
    }
  };

  const handleWriteMemory = async () => {
    if (!device) return;
    try {
      setIsWritingMem(true);
      await writeMemory(device.id);
      device.has_unsaved_changes = false;
      setSessionChanges([]);
      if (onPortUpdated) onPortUpdated();
    } catch (err: any) {
      alert((isEn ? 'Failed to save configuration to NVRAM: ' : 'خطا در ذخیره‌سازی در استارتاپ: ') + (err.message || err));
    } finally {
      setIsWritingMem(false);
    }
  };

  if (!isOpen || !device) return null;

  const filteredPorts = ports.filter((p) => {
    if (filterMode === 'up' && p.status !== 'up') return false;
    if (filterMode === 'down' && p.status !== 'down') return false;
    if (filterMode === 'trunk' && p.mode !== 'trunk') return false;
    if (filterMode === 'access' && p.mode !== 'access') return false;
    if (filterMode === 'port-sec' && !p.port_security_enabled) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.port_id.toLowerCase().includes(q) ||
        p.connected_device.toLowerCase().includes(q) ||
        String(p.vlan).includes(q) ||
        p.mode.toLowerCase().includes(q) ||
        (p.port_security_mode && p.port_security_mode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const activeCount = ports.filter((p) => p.status === 'up').length;
  const inactiveCount = ports.filter((p) => p.status === 'down').length;
  const trunkCount = ports.filter((p) => p.mode === 'trunk').length;
  const portSecCount = ports.filter((p) => p.port_security_enabled).length;

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center modal-backdrop-blur overflow-y-auto ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      }`}
      data-modal-backdrop="true"
    >
      <div 
        dir={isEn ? 'ltr' : 'rtl'}
        className={`port-inspector-modal spatial-glass border border-white/15 shadow-2xl overflow-hidden flex flex-col transition-all duration-200 text-slate-100 ${
          isEn ? 'text-left' : 'text-right'
        } ${
          isMaximized
            ? 'w-full h-full max-w-none rounded-none border-none max-h-full my-0'
            : 'w-full max-w-5xl rounded-2xl my-auto max-h-[92vh] sm:max-h-[88vh]'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/10 bg-slate-900/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-md">
              <Cable className="w-4 h-4 text-cyan-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-mono">{device.name}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-cyan-300 font-mono border border-white/15 font-bold" dir="ltr">
                  {device.ip}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                    device.is_online
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {device.is_online ? (isEn ? 'Online' : 'آنلاین') : (isEn ? 'Offline' : 'آفلاین')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {device.building} • {device.floor} • {device.unit} {device.rack ? `• ${device.rack}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Unsaved changes badge & quick write */}
            {device.has_unsaved_changes && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-medium hidden sm:inline">{isEn ? 'Unsaved Changes' : 'تغییرات رایت‌نشده'}</span>
                <button
                  onClick={() => setShowWriteConfirm(true)}
                  disabled={isWritingMem}
                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] transition flex items-center gap-1 cursor-pointer"
                  title={isEn ? 'Save running-config to startup-config (NVRAM)' : 'ذخیره تغییرات در NVRAM (Startup-Config)'}
                >
                  <Save className="w-3 h-3" />
                  <span>{isWritingMem ? (isEn ? 'Writing...' : 'در حال رایت...') : 'Write'}</span>
                </button>
              </div>
            )}

            {/* Direct Connect to Cisco Terminal */}
            {canTerminal && (
              <button
                onClick={() => onConnectTerminal && onConnectTerminal(device)}
                className="cisco-terminal-header-btn flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer"
                title={isEn ? 'Direct connection to Cisco CLI Terminal' : 'اتصال مستقیم به خط فرمان ترمینال سیسکو (CLI)'}
              >
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-sans font-bold">{isEn ? 'Cisco Terminal' : 'ترمینال سیسکو'}</span>
              </button>
            )}

            {/* Fullscreen / Exit Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="text-slate-400 hover:text-cyan-300 p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
              title={
                isMaximized
                  ? (isEn ? 'Exit Fullscreen' : 'خروج از حالت تمام صفحه')
                  : (isEn ? 'Fullscreen' : 'تمام صفحه')
              }
              aria-label={
                isMaximized
                  ? (isEn ? 'Exit Fullscreen' : 'خروج از حالت تمام صفحه')
                  : (isEn ? 'Fullscreen' : 'تمام صفحه')
              }
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="text-slate-400 hover:text-cyan-300 p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
                title={isEn ? 'Minimize' : 'مینیمایز به نوار پایین'}
                aria-label={isEn ? 'Minimize' : 'مینیمایز'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar: Port & Faceplate vs System Resources */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-5 text-xs shrink-0 select-none">
          <div className="flex items-center gap-1 -mb-px">
            <button
              type="button"
              onClick={() => setActiveTab('ports')}
              className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors cursor-pointer font-medium ${
                activeTab === 'ports'
                  ? 'border-indigo-500 text-indigo-400 font-bold bg-indigo-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Cable className="w-4 h-4 text-indigo-400" />
              <span>{isEn ? 'Port & Faceplate' : 'پورت و فیس‌پلیت'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-semibold">
                {ports.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('resources')}
              className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors cursor-pointer font-medium ${
                activeTab === 'resources'
                  ? 'border-cyan-400 text-cyan-400 font-bold bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>{isEn ? 'System Resources' : 'منابع سیستم (System Resources)'}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span className="text-slate-500">{isEn ? 'Architecture:' : 'معماری:'}</span>
            <span className="text-cyan-300 font-bold">{device.model || 'Cisco Switch'}</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-bold">{isEn ? 'Health: OK' : 'سلامت: نرمال'}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'resources' ? (
            <CiscoSystemResourcesTab
              device={device}
              ports={ports}
              isEn={isEn}
              onConnectTerminal={canTerminal ? onConnectTerminal : undefined}
            />
          ) : (
            <>
          {/* Switch Faceplate (Visual Rack Interface) */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold text-slate-200 font-mono">
                  Switch Faceplate: {device.model} ({ports.length} Ports)
                </span>
              </div>
              {/* Legend & Multi-select Hint */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{isEn ? 'Up' : 'فعال (Up)'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  <span>{isEn ? 'Down' : 'غیرفعال (Down)'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span>{isEn ? 'Disabled' : 'ادمین بسته (Disabled)'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2 rounded bg-purple-500"></span>
                  <span>{isEn ? 'Trunk' : 'ترانک (Trunk)'}</span>
                </div>
                <div className="text-[10px] text-cyan-300 font-mono bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/30">
                  {isEn ? '💡 Hold Ctrl + Click for multi-port select' : '💡 برای انتخاب چندتایی کلید Ctrl را نگه داشته و کلیک کنید'}
                </div>
              </div>
            </div>

            {/* Visual RJ45 Ports Matrix (2-row switch design) */}
            {loading ? (
              <div className="py-8 text-center text-slate-400 text-xs animate-pulse">
                {isEn ? 'Loading port statuses from backend...' : 'در حال بارگذاری وضعیت پورت‌ها از بک‌اند پایتون...'}
              </div>
            ) : ports.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs">{isEn ? 'No active ports recorded.' : 'پورت فعالی ثبت نشده است.'}</div>
            ) : (
              <div className="switch-faceplate-chassis rounded-xl p-3 border border-slate-800 shadow-inner relative z-10">
                <div className="switch-faceplate-grid rounded-lg px-3 pb-3 pt-[88px] overflow-x-auto border border-slate-850 relative">
                  <div className="flex flex-wrap gap-2 justify-start min-w-[500px]">
                    {ports.map((port, pIdx) => {
                      const pId = port.port_id || (port as any).port || port.name || `port-${pIdx + 1}`;
                      const isPortSelected = Boolean(
                        pId &&
                        Array.isArray(selectedPortIds) &&
                        selectedPortIds.length > 0 &&
                        selectedPortIds.includes(pId)
                      );
                      return (
                        <NetworkPortSvg
                          key={pId}
                          port={port}
                          isSelected={isPortSelected}
                          onClick={(e) => handlePortClick(e, port)}
                          onContextMenu={(e) => handlePortContextMenu(e, port)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Multi-Port Batch Operations Card */}
          {selectedPortIds.length > 1 && (
            <div className="port-sub-card bg-indigo-950/60 border-2 border-indigo-500/60 rounded-xl p-4 shadow-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-indigo-500/30">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/30 text-indigo-200 border border-indigo-500/50 shadow-sm">
                    <Layers className="w-5 h-5 text-indigo-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white font-mono">
                        {isEn
                          ? `Batch Configuration (${selectedPortIds.length} Ports Selected)`
                          : `پیکربندی گروهی پورت‌ها (${selectedPortIds.length} پورت انتخاب شده)`}
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold font-mono bg-indigo-600 text-white shadow-xs">
                        MULTI-PORT ACTIVE
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-200/90 font-mono mt-0.5 max-w-2xl truncate">
                      {isEn ? 'Selected Ports' : 'پورت‌های انتخاب شده'}: {selectedPortIds.join(', ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPortIds(ports.map((p) => p.port_id))}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/30 text-xs font-medium transition cursor-pointer"
                  >
                    {isEn ? 'Select All Ports' : 'انتخاب همه پورت‌ها'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPortIds(selectedPort ? [selectedPort.port_id] : [])}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 border border-white/10 text-xs transition cursor-pointer"
                  >
                    {isEn ? 'Deselect (Single Mode)' : 'لغو انتخاب گروهی'}
                  </button>
                </div>
              </div>

              {batchSuccessMessage && (
                <div className="p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{batchSuccessMessage}</span>
                </div>
              )}

              {/* Batch Settings Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Admin Status */}
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                  <label className="text-slate-300 font-semibold block text-[11px]">
                    {isEn ? 'Admin Status:' : 'وضعیت مدیریتی:'}
                  </label>
                  <select
                    value={batchAdminStatus}
                    onChange={(e: any) => setBatchAdminStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/20 text-white text-xs font-mono focus:border-indigo-400"
                  >
                    <option value="no_change" className="bg-slate-900 text-slate-300">{isEn ? '-- No Change --' : '-- بدون تغییر --'}</option>
                    <option value="enabled" className="bg-slate-900 text-emerald-400">{isEn ? 'Enable (no shutdown)' : 'فعال (no shutdown)'}</option>
                    <option value="disabled" className="bg-slate-900 text-rose-400">{isEn ? 'Disable (shutdown)' : 'غیرفعال (shutdown)'}</option>
                  </select>
                </div>

                {/* Mode */}
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                  <label className="text-slate-300 font-semibold block text-[11px]">
                    {isEn ? 'Switchport Mode:' : 'مود سوئیچ‌پورت:'}
                  </label>
                  <select
                    value={batchMode}
                    onChange={(e: any) => setBatchMode(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/20 text-white text-xs font-mono focus:border-indigo-400"
                  >
                    <option value="no_change" className="bg-slate-900 text-slate-300">{isEn ? '-- No Change --' : '-- بدون تغییر --'}</option>
                    <option value="access" className="bg-slate-900 text-indigo-300">{isEn ? 'Access' : 'Access (اکسس)'}</option>
                    <option value="trunk" className="bg-slate-900 text-purple-300">{isEn ? 'Trunk' : 'Trunk (ترانک)'}</option>
                  </select>
                </div>

                {/* VLAN */}
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                  <label className="text-slate-300 font-semibold block text-[11px]">
                    {isEn ? 'Assign VLAN (1-4094):' : 'تخصیص ویلن (VLAN):'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={4094}
                    value={batchVlan}
                    onChange={(e) => setBatchVlan(e.target.value)}
                    placeholder={isEn ? 'Empty = No Change' : 'خالی = بدون تغییر'}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/20 text-white text-xs font-mono focus:border-indigo-400 placeholder:text-slate-500"
                  />
                </div>

                {/* Allowed VLANs (Trunk) */}
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
                  <label className="text-slate-300 font-semibold block text-[11px]">
                    {isEn ? 'Allowed VLANs (Trunk):' : 'ویلن‌های مجاز (ترانک):'}
                  </label>
                  <input
                    type="text"
                    value={batchAllowedVlans}
                    onChange={(e) => setBatchAllowedVlans(e.target.value)}
                    placeholder="1-4094 or 10,20"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/20 text-white text-xs font-mono focus:border-indigo-400 placeholder:text-slate-500"
                    dir="ltr"
                  />
                </div>

                {/* Port Security */}
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 space-y-1.5 lg:col-span-2">
                  <label className="text-slate-300 font-semibold block text-[11px]">
                    {isEn ? 'Port Security:' : 'امنیت پورت (Port Security):'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={batchPortSec}
                      onChange={(e: any) => setBatchPortSec(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/20 text-white text-xs font-mono focus:border-indigo-400"
                    >
                      <option value="no_change" className="bg-slate-900 text-slate-300">{isEn ? '-- No Change --' : '-- بدون تغییر --'}</option>
                      <option value="enabled" className="bg-slate-900 text-emerald-400">{isEn ? 'Enable Security' : 'فعال‌سازی امنیت پورت'}</option>
                      <option value="disabled" className="bg-slate-900 text-rose-400">{isEn ? 'Disable Security' : 'غیرفعال‌سازی امنیت'}</option>
                    </select>
                    {batchPortSec === 'enabled' && (
                      <select
                        value={batchPortSecMode}
                        onChange={(e: any) => setBatchPortSecMode(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/20 text-white text-xs font-mono focus:border-indigo-400"
                      >
                        <option value="sticky" className="bg-slate-900 text-white">Sticky (MAC خودکار)</option>
                        <option value="dynamic" className="bg-slate-900 text-white">Dynamic</option>
                        <option value="configured" className="bg-slate-900 text-white">Configured</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Batch Action Submit Button */}
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 flex items-end lg:col-span-2">
                  <button
                    type="button"
                    onClick={handleOpenBatchConfirm}
                    disabled={isBatchApplying}
                    className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isBatchApplying ? (
                      <span>{isEn ? 'Applying Batch...' : 'در حال اعمال تنظیمات روی پورت‌ها...'}</span>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>
                          {isEn
                            ? `Apply Batch to ${selectedPortIds.length} Ports`
                            : `اعمال تنظیمات روی ${selectedPortIds.length} پورت انتخابی`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Inspector & Editor Card */}
          {activeSelectedPort && (
            <div ref={editSectionRef} id="port-inspector-editor-section" className="port-sub-card bg-white/5 border border-white/10 rounded-xl p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    <Cable className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white font-mono">{activeSelectedPort.name || activeSelectedPort.port_id}</h4>
                      <span
                        data-badge={activeSelectedPort.mode === 'trunk' ? 'port-mode-trunk' : 'port-mode-access'}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono text-white shadow-xs ${
                          activeSelectedPort.mode === 'trunk'
                            ? 'port-mode-badge-trunk bg-purple-600 border border-purple-500'
                            : 'port-mode-badge-access bg-indigo-600 border border-indigo-500'
                        }`}
                      >
                        {activeSelectedPort.mode === 'trunk' ? (isEn ? 'TRUNK' : 'TRUNK (ترانک)') : (isEn ? 'ACCESS' : 'ACCESS (اکسس)')}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-medium font-mono ${
                          activeSelectedPort.status === 'up'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/5 text-slate-400 border border-white/10'
                        }`}
                      >
                        {activeSelectedPort.status === 'up' ? (isEn ? 'Connected' : 'فعال (Connected)') : (isEn ? 'Disconnected' : 'غیرفعال (Disconnected)')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      {isEn ? 'Speed' : 'سرعت'}: <span className="text-cyan-300 font-semibold">{getNegotiatedSpeed(activeSelectedPort)}</span> ({isEn ? 'Max' : 'حداکثر'}: {getMaxSpeed(activeSelectedPort)}) • {isEn ? 'Duplex' : 'داپلکس'}: {activeSelectedPort.duplex || 'Auto/Full'}
                    </p>
                    {activeSelectedPort.description ? (
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-amber-300 font-mono bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-lg w-fit">
                        <FileText className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="text-amber-400/80 font-bold">{isEn ? 'Description:' : 'توضیحات:'}</span>
                        <span className="text-slate-100 font-semibold">{activeSelectedPort.description}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDescriptionModalPort(activeSelectedPort);
                          }}
                          className="ml-1 text-[10px] text-amber-400/70 hover:text-amber-300 underline cursor-pointer"
                        >
                          {isEn ? 'Edit' : 'ویرایش'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDescriptionModalPort(activeSelectedPort);
                        }}
                        className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 hover:text-amber-300 transition cursor-pointer font-mono"
                      >
                        <FileText className="w-2.5 h-2.5 text-slate-500" />
                        <span>{isEn ? '+ Add Description' : '+ افزودن دیسکریپشن'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {!isEditing ? (
                  <button
                    onClick={() => startEdit(activeSelectedPort)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-medium transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isEn ? 'Edit Port Settings' : 'ویرایش تنظیمات پورت'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs transition cursor-pointer"
                    >
                      {isEn ? 'Cancel' : 'انصراف'}
                    </button>
                    <button
                      onClick={handleOpenSingleSaveConfirm}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-medium shadow-md transition disabled:opacity-50 cursor-pointer border border-white/10"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Save & Apply (Preview)' : 'ذخیره در سوئیچ (پیش‌نمایش و تایید)'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* View / Edit Mode Form */}
              {!isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3 text-xs">
                  {/* Speed Specification Card */}
                  <div className="port-sub-card p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">
                      {isEn ? 'Port Speed:' : 'سرعت پورت (Speed):'}
                    </div>
                    <div className="text-cyan-300 font-bold font-mono text-xs flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{getNegotiatedSpeed(activeSelectedPort)}</span>
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5 font-mono">
                      {isEn ? 'Max Capability' : 'حداکثر سرعت'}: <span className="text-slate-200 font-semibold">{getMaxSpeed(activeSelectedPort)}</span>
                    </div>
                  </div>

                  {/* Connected Device */}
                  <div className="port-sub-card p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">{isEn ? 'Connected Host / Device:' : 'تجهیز یا هاست متصل:'}</div>
                    <div className="text-white font-semibold font-mono text-xs truncate" title={activeSelectedPort.connected_device}>
                      {activeSelectedPort.connected_device || (isEn ? 'No device connected' : 'تجهیزی متصل نیست')}
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5 font-mono">
                      {isEn ? 'Type' : 'نوع'}: {activeSelectedPort.connected_type || 'Host'}
                    </div>
                  </div>

                  {/* VLAN Configuration */}
                  <div className="port-sub-card p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">{isEn ? 'Assigned VLAN:' : 'ویلن تخصیص یافته (VLAN):'}</div>
                    <div className="text-indigo-300 font-bold font-mono text-xs">
                      VLAN {activeSelectedPort.vlan}
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5 font-mono truncate" title={activeSelectedPort.allowed_vlans}>
                      {isEn ? 'Allowed' : 'مجاز'}: {activeSelectedPort.allowed_vlans || (isEn ? 'All (1-4094)' : 'همه (1-4094)')}
                    </div>
                  </div>

                  {/* Port Mode & Admin Status */}
                  <div className="port-sub-card p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">{isEn ? 'Admin Status:' : 'وضعیت مدیریتی پورت:'}</div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-semibold ${
                          activeSelectedPort.admin_status === 'enabled' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {activeSelectedPort.admin_status === 'enabled' ? (isEn ? 'Enabled (No Shutdown)' : 'فعال (No Shutdown)') : (isEn ? 'Disabled (Shutdown)' : 'غیرفعال (Shutdown)')}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5 font-mono">
                      {isEn ? 'Mode' : 'پروتکل'}: {activeSelectedPort.mode === 'trunk' ? '802.1Q Trunk' : 'Access'}
                    </div>
                  </div>

                  {/* Cisco Port Security Status */}
                  <div
                    className={`port-sub-card p-3 rounded-xl border transition ${
                      activeSelectedPort.port_security_enabled
                        ? 'bg-emerald-950/30 border-emerald-500/40 shadow-sm'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">{isEn ? 'Port Security:' : 'پورت سکیوریتی:'}</span>
                      {activeSelectedPort.port_security_enabled ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Shield className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className={`font-bold font-mono text-xs ${
                          activeSelectedPort.port_security_enabled ? 'text-emerald-300' : 'text-slate-400'
                        }`}
                      >
                        {activeSelectedPort.port_security_enabled ? (isEn ? 'Secure' : 'فعال (Secure)') : (isEn ? 'Disabled' : 'غیرفعال (Disabled)')}
                      </span>
                    </div>
                    {activeSelectedPort.port_security_enabled ? (
                      <div className="text-[10px] text-emerald-300 mt-1 font-mono space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span>
                            {isEn ? 'Mode' : 'مود'}: {activeSelectedPort.port_security_mode === 'sticky' ? (isEn ? 'Sticky' : 'استیکی') : activeSelectedPort.port_security_mode === 'configured' ? (isEn ? 'Configured' : 'کانفیگور') : (isEn ? 'Dynamic' : 'داینامیک')}
                          </span>
                          <span className="font-bold bg-emerald-500/20 text-emerald-300 px-1 rounded text-[9px] border border-emerald-500/30">
                            Max: {activeSelectedPort.port_security_max_mac || 1}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 truncate" title={activeSelectedPort.port_security_configured_mac || activeSelectedPort.port_security_learned_macs?.join(', ')}>
                          MAC: {activeSelectedPort.port_security_mode === 'configured'
                            ? (activeSelectedPort.port_security_configured_mac || (isEn ? 'Static' : 'دستی'))
                            : (activeSelectedPort.port_security_learned_macs?.[0] || (isEn ? 'Sticky learned' : 'Sticky کشف‌شده'))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-500 text-[10px] mt-1 font-sans">
                        {isEn ? 'No MAC limit applied' : 'محدودیت مک‌ اعمال نشده'}
                      </div>
                    )}
                  </div>

                  {/* PoE Power Status */}
                  <div className="port-sub-card p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-0.5">{isEn ? 'PoE Status:' : 'توان برق (PoE Status):'}</div>
                    <div className="flex items-center gap-1.5 text-white font-semibold font-mono text-xs">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>{activeSelectedPort.poe_power ? `${activeSelectedPort.poe_power} W` : (isEn ? 'Off' : 'غیرفعال')}</span>
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5 font-mono">
                      {isEn ? 'Status' : 'وضعیت'}: {activeSelectedPort.poe_status || 'off'}
                    </div>
                  </div>
                </div>
              ) : (
                /* Edit Form */
                <div className="mt-3 space-y-4 text-xs">
                  {/* General Port Settings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">{isEn ? 'Port Mode:' : 'نوع پورت (Port Mode):'}</label>
                      <select
                        value={editMode}
                        onChange={(e) => {
                          const newMode = e.target.value as 'trunk' | 'access';
                          setEditMode(newMode);
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                      >
                        <option value="access" className="bg-slate-900 text-white">{isEn ? 'Access (Client/Host port)' : 'Access (پورت کلاینت و هاست معمولی)'}</option>
                        <option value="trunk" className="bg-slate-900 text-white">{isEn ? 'Trunk (Uplink to Switch/Router)' : 'Trunk (پورت اتصال به سوئیچ یا روتر)'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">{isEn ? 'VLAN ID:' : 'شماره ویلن (VLAN ID):'}</label>
                      <input
                        type="number"
                        value={editVlan}
                        onChange={(e) => setEditVlan(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs font-mono text-left focus:outline-none focus:border-indigo-400"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">{isEn ? 'Allowed VLANs:' : 'ویلن‌های مجاز (Allowed VLANs):'}</label>
                      <input
                        type="text"
                        value={editAllowedVlans}
                        onChange={(e) => setEditAllowedVlans(e.target.value)}
                        placeholder={isEn ? 'e.g. 1,10,20,30,50' : 'مثال: 1,10,20,30,50'}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs font-mono text-left focus:outline-none focus:border-indigo-400"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">{isEn ? 'Connected Host / Device:' : 'تجهیز یا هاست متصل:'}</label>
                      <input
                        type="text"
                        value={editConnected}
                        onChange={(e) => setEditConnected(e.target.value)}
                        placeholder={isEn ? 'e.g. AP-WIFI-02 or Workstation' : 'مثال: AP-WIFI-02 یا Workstation'}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs focus:outline-none focus:border-indigo-400"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">{isEn ? 'Admin Status (Shutdown / No Shutdown):' : 'وضعیت ادمین (Shutdown / No Shutdown):'}</label>
                      <select
                        value={editAdminStatus}
                        onChange={(e) => setEditAdminStatus(e.target.value as 'enabled' | 'disabled')}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                      >
                        <option value="enabled" className="bg-slate-900 text-white">{isEn ? 'Enabled (No Shutdown)' : 'فعال (No Shutdown)'}</option>
                        <option value="disabled" className="bg-slate-900 text-white">{isEn ? 'Disabled (Shutdown)' : 'غیرفعال (Shutdown)'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">{isEn ? 'Port Description:' : 'توضیحات پورت (Description):'}</label>
                      <input
                        type="text"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder={isEn ? 'Port description or role' : 'توضیحات کاربردی پورت'}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs focus:outline-none focus:border-indigo-400"
                      />
                    </div>
                  </div>

                  {/* Cisco Port Security Configuration Box (تنظیمات پورت سکیوریتی سیسکو) */}
                  <div id="port-security-section" className="port-sub-card border border-indigo-500/30 rounded-xl overflow-hidden bg-white/5 shadow-xs scroll-mt-6">
                    <div className="flex flex-wrap items-center justify-between p-3 bg-gradient-to-r from-indigo-950/50 to-slate-900/60 border-b border-indigo-500/20 gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-md">
                          <ShieldCheck className="w-4 h-4 text-cyan-200" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-white text-xs">{isEn ? 'Cisco Port Security' : 'امنیت پورت سیسکو (Cisco Port Security)'}</h5>
                            <span className="layer2-security-badge text-[10px] font-mono px-2 py-0.5 rounded font-bold" data-badge="layer2-security">
                              Layer 2 Security
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-0.5">
                            {isEn ? 'Control and restrict MAC addresses on access ports to prevent MAC Flooding and unauthorized access' : 'محدودسازی و کنترل دسترسی مک آدرس‌های متصل به پورت به منظور جلوگیری از حملات MAC Flooding و نفوذ غیرمجاز'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        id="port-security-toggle-btn"
                        onClick={() => {
                          const nextState = !editPortSecEnabled;
                          setEditPortSecEnabled(nextState);
                          if (nextState && editMode === 'trunk') {
                            setEditMode('access');
                          }
                        }}
                        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs border cursor-pointer ${
                          editPortSecEnabled
                            ? 'port-sec-btn-active bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                        }`}
                        title={isEn ? 'Toggle Cisco Layer 2 Port Security' : 'فعال یا غیرفعال‌سازی سکیوریتی پورت لایه ۲ سیسکو'}
                      >
                        {editPortSecEnabled ? (
                          <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                        ) : (
                          <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className={editPortSecEnabled ? 'text-white' : 'text-slate-300'}>
                          {editPortSecEnabled ? (isEn ? 'Enabled (switchport port-security)' : 'فعال (switchport port-security)') : (isEn ? 'Enable Port Security' : 'فعال‌سازی Port Security')}
                        </span>
                      </button>
                    </div>

                    {editPortSecEnabled && (
                      <div className="p-3.5 bg-black/20 space-y-3.5">
                        {editMode === 'trunk' && (
                          <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px] flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>
                              <b>{isEn ? 'Cisco Best Practice Warning:' : 'هشدار استاندارد سیسکو:'}</b> {isEn ? 'Port Security can only be configured on Access ports. Mode will be switched to Access automatically.' : 'Port Security معمولاً روی پورت‌های اکسس (Access) اعمال می‌شود. پورت به طور خودکار به مود Access منتقل خواهد شد.'}
                            </span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          {/* 1. Definition Mode Dropdown */}
                          <div>
                            <label className="block text-slate-300 font-semibold mb-1">
                              {isEn ? 'MAC Definition Mode:' : 'تعریف مود یادگیری مک (MAC Definition Mode):'}
                            </label>
                            <select
                              value={editPortSecMode}
                              onChange={(e) => setEditPortSecMode(e.target.value as 'sticky' | 'configured' | 'dynamic')}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs font-mono font-medium focus:border-indigo-400"
                            >
                              <option value="sticky" className="bg-slate-900 text-white">{isEn ? 'Sticky (Auto Learn & Save to Running-Config)' : 'استیکی (Sticky - چسبنده خودکار در Running-Config)'}</option>
                              <option value="configured" className="bg-slate-900 text-white">{isEn ? 'Configured (Manual Static Definition)' : 'کانفیگور (Configured - تعریف دستی و استاتیک مک)'}</option>
                              <option value="dynamic" className="bg-slate-900 text-white">{isEn ? 'Dynamic (Learn in CAM Memory)' : 'داینامیک (Dynamic - یادگیری در CAM بدون ذخیره دائم)'}</option>
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                              {editPortSecMode === 'sticky' && (isEn ? 'MACs are learned dynamically upon connection and saved into running-config.' : 'مک‌ها با اتصال اولین کلاینت‌ها خودکار فراگرفته شده و در Running-Config درج می‌شوند.')}
                              {editPortSecMode === 'configured' && (isEn ? 'Administrator explicitly specifies permitted hardware MAC address.' : 'ادمین مک آدرس مجاز سخت‌افزاری را به صورت صریح تعریف می‌کند.')}
                              {editPortSecMode === 'dynamic' && (isEn ? 'MACs are learned dynamically in CAM memory and reset upon reload.' : 'مک‌ها به طور موقت در جدول حافظه CAM ثبت شده و پس از ریبوت بازنشانی می‌شوند.')}
                            </p>
                          </div>

                          {/* 2. Maximum MACs */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-slate-300 font-semibold">
                                {isEn ? 'Maximum MACs:' : 'حداکثر مک آدرس‌های مجاز (Maximum MACs):'}
                              </label>
                              <span className="text-[11px] font-mono font-bold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                                {editPortSecMaxMac} {isEn ? 'MAC(s)' : 'آدرس'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                max={1024}
                                value={editPortSecMaxMac}
                                onChange={(e) => setEditPortSecMaxMac(Math.max(1, Math.min(1024, Number(e.target.value) || 1)))}
                                className="w-20 px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs font-mono text-center font-bold focus:border-indigo-400"
                                dir="ltr"
                              />
                              <div className="flex items-center gap-1 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setEditPortSecMaxMac(1)}
                                  className={`px-2 py-1 rounded-lg border transition cursor-pointer ${
                                    editPortSecMaxMac === 1
                                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                                  }`}
                                  title={isEn ? 'Single host standard' : 'استاندارد سیسکو برای پورت تک کاربر'}
                                >
                                  {isEn ? '1 MAC' : '۱ مک'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditPortSecMaxMac(2)}
                                  className={`px-2 py-1 rounded-lg border transition cursor-pointer ${
                                    editPortSecMaxMac === 2
                                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                                  }`}
                                  title={isEn ? 'Ideal for PC + IP Phone' : 'مناسب برای PC به همراه IP Phone سیسکو'}
                                >
                                  {isEn ? '2 MACs' : '۲ مک'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditPortSecMaxMac(5)}
                                  className={`px-2 py-1 rounded-lg border transition cursor-pointer ${
                                    editPortSecMaxMac === 5
                                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                                  }`}
                                >
                                  {isEn ? '5 MACs' : '۵ مک'}
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {isEn ? 'CLI equivalent:' : 'دستور معادل:'} <code className="font-mono text-indigo-300 bg-indigo-500/20 px-1 rounded border border-indigo-500/30" dir="ltr">switchport port-security maximum {editPortSecMaxMac}</code>
                            </p>
                          </div>

                          {/* 3. Violation Action */}
                          <div>
                            <label className="block text-slate-300 font-semibold mb-1">
                              {isEn ? 'Violation Action:' : 'سیاست برخورد با تخلف (Violation Action):'}
                            </label>
                            <select
                              value={editPortSecViolation}
                              onChange={(e) => setEditPortSecViolation(e.target.value as 'shutdown' | 'restrict' | 'protect')}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white text-xs font-mono font-medium focus:border-indigo-400"
                            >
                              <option value="shutdown" className="bg-slate-900 text-white">{isEn ? 'Shutdown (Err-Disable - Cisco Default)' : 'Shutdown (خاموشی خودکار و Err-Disable - پیش‌فرض سیسکو)'}</option>
                              <option value="restrict" className="bg-slate-900 text-white">{isEn ? 'Restrict (Drop packet + Log & SNMP Trap)' : 'Restrict (مسدودسازی بسته متخلف + ارسال لاگ و SNMP Trap)'}</option>
                              <option value="protect" className="bg-slate-900 text-white">{isEn ? 'Protect (Silent drop without logging)' : 'Protect (مسدودسازی بی‌صدا بدون ثبت در لاگ)'}</option>
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                              {editPortSecViolation === 'shutdown' && (isEn ? 'If threshold exceeded, interface enters err-disabled state immediately.' : 'در صورت عبور از سقف مک، پورت فورا خاموش شده و نیاز به shut / no shut دارد.')}
                              {editPortSecViolation === 'restrict' && (isEn ? 'Port stays up, unauthorized packets dropped, violation counter increments with syslog.' : 'پورت روشن می‌ماند اما فریم‌های مک غیرمجاز دور ریخته شده و کانتر تخلف افزایش می‌یابد.')}
                              {editPortSecViolation === 'protect' && (isEn ? 'Unauthorized traffic dropped silently without counter increment or trap.' : 'ترافیک غیرمجاز دور ریخته می‌شود بدون ارسال اعلان یا افزایش کانتر.')}
                            </p>
                          </div>
                        </div>

                        {/* Static MAC Input when Configured mode is selected */}
                        {editPortSecMode === 'configured' && (
                          <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex flex-wrap items-center gap-3">
                            <div className="flex-1 min-w-[260px]">
                              <label className="block text-white font-bold mb-1">
                                {isEn ? 'Configured Static MAC:' : 'مک آدرس مجاز استاتیک (Configured Static MAC):'}
                              </label>
                              <input
                                type="text"
                                value={editPortSecConfiguredMac}
                                onChange={(e) => setEditPortSecConfiguredMac(e.target.value)}
                                placeholder={isEn ? 'e.g. 0050.56a1.2b3c or 00:50:56:A1:2B:3C' : 'مثال: 0050.56a1.2b3c یا 00:50:56:A1:2B:3C'}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/15 text-white text-xs font-mono text-left font-semibold focus:border-indigo-400"
                                dir="ltr"
                              />
                            </div>
                            <div className="pt-4 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditPortSecConfiguredMac('0050.56a1.2b3c')}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition cursor-pointer"
                              >
                                {isEn ? 'Insert Sample MAC' : 'درج مک آدرس نمونه'}
                              </button>
                              {selectedPort.connected_device && (
                                <button
                                  type="button"
                                  onClick={() => setEditPortSecConfiguredMac('001c.23b4.6789')}
                                  className="px-2.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 text-[11px] font-medium transition cursor-pointer"
                                >
                                  {isEn ? `Host MAC (${selectedPort.connected_device})` : `مک هاست فعلی (${selectedPort.connected_device})`}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Real-time Cisco IOS CLI Preview */}
                        <div className="p-3 rounded-xl bg-slate-950/90 text-emerald-400 font-mono text-[11px] text-left overflow-x-auto shadow-inner border border-white/10" dir="ltr">
                          <div className="text-slate-400 text-[10px] mb-1 flex items-center justify-between border-b border-white/10 pb-1">
                            <span># Cisco IOS-XE Port Security Running-Config Preview:</span>
                            <span className="text-indigo-300 font-sans">{isEn ? 'Auto-generated CLI' : 'تولید خودکار دستورات سیسکو'}</span>
                          </div>
                          <div className="text-slate-300">{device.name}(config-if)# switchport mode access</div>
                          <div>{device.name}(config-if)# switchport port-security</div>
                          <div>{device.name}(config-if)# switchport port-security maximum {editPortSecMaxMac}</div>
                          {editPortSecMode === 'sticky' ? (
                            <div className="text-amber-300">{device.name}(config-if)# switchport port-security mac-address sticky</div>
                          ) : editPortSecMode === 'configured' ? (
                            <div className="text-cyan-300">
                              {device.name}(config-if)# switchport port-security mac-address {editPortSecConfiguredMac || '0050.56a1.2b3c'}
                            </div>
                          ) : null}
                          <div>{device.name}(config-if)# switchport port-security violation {editPortSecViolation}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ports List Table */}
          <div className="port-sub-card bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-sm">
            <div className="p-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-black/10">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white font-mono">
                  {isEn ? `All Switch Ports (${ports.length})` : `لیست تمامی پورت‌های سوئیچ (${ports.length})`}
                </h4>
                <span className="text-[10px] text-slate-400">
                  {isEn
                    ? `${activeCount} active • ${inactiveCount} inactive • ${trunkCount} trunk • ${portSecCount} port security`
                    : `${activeCount} پورت فعال • ${inactiveCount} پورت خاموش • ${trunkCount} ترانک • ${portSecCount} با Port Security`}
                </span>
              </div>

              {/* Filters */}
              <div className="flex items-center flex-wrap gap-2 text-xs">
                <input
                  type="text"
                  placeholder={isEn ? 'Search port, VLAN, device, sec...' : 'جستجوی پورت، ویلن، تجهیز یا سکیوریتی...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/15 text-white placeholder-slate-400 text-xs focus:outline-none focus:border-indigo-400 w-48 font-mono"
                />

                <div className="flex items-center bg-black/20 rounded-lg p-0.5 border border-white/10">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                      filterMode === 'all' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isEn ? 'All' : 'همه'}
                  </button>
                  <button
                    onClick={() => setFilterMode('up')}
                    className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                      filterMode === 'up' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isEn ? 'Up' : 'فعال'}
                  </button>
                  <button
                    onClick={() => setFilterMode('down')}
                    className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                      filterMode === 'down' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isEn ? 'Down' : 'خاموش'}
                  </button>
                  <button
                    onClick={() => setFilterMode('trunk')}
                    className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                      filterMode === 'trunk' ? 'bg-purple-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isEn ? 'Trunk' : 'ترانک'}
                  </button>
                  <button
                    onClick={() => setFilterMode('access')}
                    className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                      filterMode === 'access' ? 'bg-indigo-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isEn ? 'Access' : 'اکسس'}
                  </button>
                  <button
                    onClick={() => setFilterMode('port-sec')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition cursor-pointer ${
                      filterMode === 'port-sec' ? 'bg-emerald-600 text-white font-medium shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                    title={isEn ? 'Show ports with active Port Security' : 'نمایش پورت‌های دارای Port Security فعال'}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Port Sec ({portSecCount})</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className={`w-full ${isEn ? 'text-left' : 'text-right'} text-xs`}>
                <thead>
                  <tr className="bg-white/5 text-slate-300 border-b border-white/10 font-bold uppercase tracking-wider text-[11px]">
                    <th className="px-3 py-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredPorts.length > 0 &&
                          filteredPorts.every((p) => {
                            const pId = p.port_id || (p as any).port || p.name;
                            return Boolean(pId && Array.isArray(selectedPortIds) && selectedPortIds.includes(pId));
                          })
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            const allIds = filteredPorts
                              .map((p) => p.port_id || (p as any).port || p.name)
                              .filter(Boolean) as string[];
                            setSelectedPortIds(allIds);
                          } else {
                            const selId = selectedPort
                              ? selectedPort.port_id || (selectedPort as any).port || selectedPort.name
                              : null;
                            setSelectedPortIds(selId ? [selId] : []);
                          }
                        }}
                        className="rounded text-indigo-600 bg-white/10 border-white/20 cursor-pointer"
                        title={isEn ? 'Select / Deselect all filtered ports' : 'انتخاب یا لغو انتخاب تمام پورت‌های فیلتر شده'}
                      />
                    </th>
                    <th className="px-3 py-2.5">{isEn ? 'Port Name' : 'نام پورت'}</th>
                    <th className="px-3 py-2.5">{isEn ? 'Status' : 'وضعیت پورت'}</th>
                    <th className="px-3 py-2.5">{isEn ? 'Mode' : 'نوع (Mode)'}</th>
                    <th className="px-3 py-2.5">{isEn ? 'VLAN' : 'ویلن (VLAN)'}</th>
                    <th className="px-3 py-2.5">{isEn ? 'Security' : 'امنیت (Port Sec)'}</th>
                    <th className="px-3 py-2.5">{isEn ? 'Connected Device' : 'تجهیز متصل (Connected)'}</th>
                    <th className="px-3 py-2.5">{isEn ? 'Speed' : 'سرعت'}</th>
                    <th className="px-3 py-2.5">PoE</th>
                    <th className="px-3 py-2.5 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {filteredPorts.map((port, pIdx) => {
                    const pId = port.port_id || (port as any).port || port.name || `port-${pIdx + 1}`;
                    const isSelected = Boolean(
                      pId &&
                      Array.isArray(selectedPortIds) &&
                      selectedPortIds.length > 0 &&
                      selectedPortIds.includes(pId)
                    );
                    return (
                      <tr
                        key={pId}
                        onClick={(e) => handlePortClick(e, port)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-indigo-500/20 text-white font-medium' : 'hover:bg-white/5 text-slate-300'
                        }`}
                      >
                        <td className="px-3 py-2.5 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              handlePortClick(
                                { ctrlKey: true, metaKey: false, shiftKey: false } as any,
                                port
                              );
                            }}
                            className="rounded text-indigo-600 bg-white/10 border-white/20 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-bold text-white">{port.port_id}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-medium border ${
                              port.admin_status === 'disabled'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : port.status === 'up'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                port.admin_status === 'disabled'
                                  ? 'bg-amber-400'
                                  : port.status === 'up'
                                  ? 'bg-emerald-400 animate-pulse'
                                  : 'bg-slate-500'
                              }`}
                            ></span>
                            {port.admin_status === 'disabled' ? 'Admin Down' : port.status === 'up' ? 'Up' : 'Down'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            data-badge={(port.mode || 'access') === 'trunk' ? 'port-mode-trunk' : 'port-mode-access'}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono text-white shadow-xs ${
                              (port.mode || 'access') === 'trunk'
                                ? 'port-mode-badge-trunk bg-purple-600 border border-purple-500'
                                : 'port-mode-badge-access bg-indigo-600 border border-indigo-500'
                            }`}
                          >
                            {(port.mode || 'access').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-indigo-300">VLAN {port.vlan}</td>
                        <td className="px-3 py-2.5">
                          {port.port_security_enabled ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium"
                              title={`Port Security Active\nMode: ${port.port_security_mode || 'sticky'}\nMax MACs: ${port.port_security_max_mac || 1}\nViolation: ${port.port_security_violation || 'shutdown'}`}
                            >
                              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="font-mono">
                                {port.port_security_mode === 'sticky' ? 'Sticky' : port.port_security_mode === 'configured' ? 'Config' : 'Dynamic'}
                              </span>
                              <span className="bg-emerald-500/30 text-emerald-200 px-1 rounded text-[9px] font-mono font-bold border border-emerald-500/40">
                                {port.port_security_max_mac || 1}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans text-slate-500">
                              <Shield className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>Off</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-200 font-sans text-xs">
                          <div>{port.connected_device || '-'}</div>
                          {port.description && (
                            <div className="text-[10px] text-amber-300/90 font-mono flex items-center gap-1 mt-0.5" title={port.description}>
                              <FileText className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                              <span className="truncate max-w-[180px]">{port.description}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 text-[11px]">{port.speed}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-[11px]">
                          {port.poe_power ? `${port.poe_power}W` : 'Off'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(port);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-indigo-300 hover:text-white border border-white/10 text-[11px] font-sans transition cursor-pointer"
                          >
                            {isEn ? 'Edit' : 'ویرایش'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}
        </div>

        {/* Cisco Port Config / Batch Apply Confirmation Modal */}
        {portConfigConfirmModal && device && (
          <CiscoPortConfigConfirmModal
            isOpen={!!portConfigConfirmModal}
            onClose={() => setPortConfigConfirmModal(null)}
            onConfirm={handleConfirmExecutePortConfig}
            device={device}
            targetPortIds={portConfigConfirmModal.targetPortIds}
            updates={portConfigConfirmModal.updates}
            isLoading={isExecutingPortConfig}
          />
        )}

        {/* Cisco Right-Click Port Actions Context Menu */}
        {contextMenu && device && (
          <CiscoPortContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            port={contextMenu.port}
            deviceName={device.name}
            onClose={() => setContextMenu(null)}
            onExecuteAction={handleExecuteContextMenuAction}
            onOpenTerminal={canTerminal && onConnectTerminal ? () => onConnectTerminal(device) : undefined}
          />
        )}

        {/* Cisco CLI Command Confirmation Modal (Yes/No with Switch/Router CLI syntax) */}
        {confirmModalState && device && (
          <CiscoCommandConfirmModal
            isOpen={!!confirmModalState}
            onClose={() => {
              setConfirmModalState(null);
              undockModal('cisco_confirm_port_cmd');
            }}
            onMinimize={() => {
              const savedState = confirmModalState;
              setConfirmModalState(null);
              dockModal({
                id: 'cisco_confirm_port_cmd',
                labelEn: savedState.action === 'mode_trunk' ? 'Change Port Mode to Trunk' : 'Confirm Port Command',
                labelFa: savedState.action === 'mode_trunk' ? 'تأیید تغییر مود پورت به Trunk' : 'تأیید دستور پورت',
                badge: `${savedState.port.port}`,
                category: 'config',
                onRestore: () => setConfirmModalState(savedState),
                onClose: () => setConfirmModalState(null),
              });
            }}
            onConfirm={handleConfirmExecuteCommand}
            action={confirmModalState.action}
            port={confirmModalState.port}
            device={device}
            isLoading={isExecutingConfirmAction}
          />
        )}

        {/* Assign Access VLAN Modal (With device VLANs list at top and custom ID input) */}
        {vlanAssignModalPort && device && (
          <AssignVlanModal
            isOpen={!!vlanAssignModalPort}
            onClose={() => {
              setVlanAssignModalPort(null);
              undockModal('assign_vlan_modal');
            }}
            onMinimize={() => {
              const savedPort = vlanAssignModalPort;
              setVlanAssignModalPort(null);
              dockModal({
                id: 'assign_vlan_modal',
                labelEn: 'Assign Access VLAN',
                labelFa: 'تخصیص VLAN اکسس',
                badge: savedPort.port,
                category: 'config',
                onRestore: () => setVlanAssignModalPort(savedPort),
                onClose: () => setVlanAssignModalPort(null),
              });
            }}
            onAssign={handleConfirmAssignVlan}
            port={vlanAssignModalPort}
            device={device}
            devicePorts={ports}
            isLoading={isAssigningVlan}
          />
        )}

        {/* Set Port Description Modal */}
        {descriptionModalPort && device && (
          <PortDescriptionModal
            isOpen={!!descriptionModalPort}
            onClose={() => setDescriptionModalPort(null)}
            onMinimize={() => setDescriptionModalPort(null)}
            onConfirm={handleConfirmSetDescription}
            port={descriptionModalPort}
            device={device}
            isLoading={isSavingDescription}
          />
        )}

        {/* Cisco Write Memory Confirmation Modal */}
        {showWriteConfirm && device && (
          <CiscoWriteConfirmModal
            isOpen={showWriteConfirm}
            onClose={() => setShowWriteConfirm(false)}
            onConfirm={async () => {
              await handleWriteMemory();
              setShowWriteConfirm(false);
            }}
            device={device}
            isWriting={isWritingMem}
            sessionChanges={sessionChanges}
            onMinimize={onMinimize}
          />
        )}
      </div>
    </div>
  );
};
