import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Power,
  PowerOff,
  ShieldCheck,
  Layers,
  Terminal,
  Copy,
  Check,
  X,
  ChevronRight,
  Server,
  FileText,
  Activity,
  Zap,
  RotateCcw,
  Wifi,
  Lock
} from 'lucide-react';
import { SwitchPort, Device, AccessPolicy } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { isDeviceActionPermitted } from '../utils/rbac';

export interface MikroTikPortContextMenuProps {
  x: number;
  y: number;
  port: SwitchPort;
  deviceName: string;
  deviceId?: string;
  policy?: AccessPolicy | null;
  onClose: () => void;
  onExecuteAction: (
    action:
      | 'enable'
      | 'disable'
      | 'bridge_add'
      | 'bridge_remove'
      | 'change_vlan'
      | 'set_speed'
      | 'loop_protect'
      | 'poe_out'
      | 'edit_comment'
      | 'cable_test',
    extra?: any
  ) => void;
  onOpenTerminal?: (portId: string) => void;
  isLightMode?: boolean;
}

export const MikroTikPortContextMenu: React.FC<MikroTikPortContextMenuProps> = ({
  x,
  y,
  port,
  deviceName,
  deviceId,
  policy,
  onClose,
  onExecuteAction,
  onOpenTerminal,
  isLightMode = false,
}) => {
  const { t, isEn } = useLanguage();
  const { effectivePolicy: authEffectivePolicy } = useAuth();
  const effectivePolicy = policy !== undefined ? policy : authEffectivePolicy;

  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [showVlanSubmenu, setShowVlanSubmenu] = useState(false);
  const [showSpeedSubmenu, setShowSpeedSubmenu] = useState(false);

  // Evaluate fine-grained RBAC action permissions for this specific MikroTik device
  const targetDeviceId = deviceId || deviceName;
  const canPower = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_power');
  const canBridge = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_bridge');
  const canVlan = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_vlan');
  const canSpeed = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_speed');
  const canDescription = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_description');
  const canCableTest = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_cable_test');
  const canTerminal = Boolean(onOpenTerminal && isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'terminal'));

  const hasAnyConfigPermission = canPower || canBridge || canVlan || canSpeed || canDescription || canCableTest;

  const isUp = port.status === 'up' && port.admin_status !== 'disabled';
  const isDisabled = port.admin_status === 'disabled';

  // Smart screen boundary positioning
  const menuWidth = 280;
  const menuEstimatedHeight = 440;
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;

  const initialTop = y + menuEstimatedHeight > screenH - 12
    ? Math.max(12, screenH - menuEstimatedHeight - 12)
    : Math.max(12, y);

  const initialLeft = x + menuWidth > screenW - 12
    ? Math.max(12, x - menuWidth)
    : Math.max(12, x);

  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: initialTop, left: initialLeft });

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const actualHeight = rect.height || menuEstimatedHeight;
    const actualWidth = rect.width || menuWidth;
    const curScreenW = window.innerWidth;
    const curScreenH = window.innerHeight;

    let targetLeft = x;
    let targetTop = y;

    if (targetLeft + actualWidth > curScreenW - 12) {
      targetLeft = Math.max(12, curScreenW - actualWidth - 12);
    }
    if (targetTop + actualHeight > curScreenH - 12) {
      targetTop = Math.max(12, curScreenH - actualHeight - 12);
    }

    setCoords({ top: targetTop, left: targetLeft });
  }, [x, y]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const copyCommand = (cmd: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const handleProtectedAction = (
    action: Parameters<MikroTikPortContextMenuProps['onExecuteAction']>[0],
    extra?: any
  ) => {
    const actionPermMap: Record<string, string> = {
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
    if (reqPerm && !isDeviceActionPermitted(effectivePolicy, targetDeviceId, reqPerm as any)) {
      alert(
        isEn
          ? `Access Denied: You do not have permission to execute '${reqPerm}' on this device.`
          : `عدم دسترسی: شما طبق پالیسی دسترسی مجوز انجام عملیات «${reqPerm}» روی این تجهیز را ندارید.`
      );
      onClose();
      return;
    }

    onExecuteAction(action, extra);
    onClose();
  };

  const submenuPosClass = coords.left + menuWidth + 180 > screenW ? 'right-full mr-1' : 'left-full ml-1';

  return createPortal(
    <div
      ref={menuRef}
      id="mikrotik-port-context-menu"
      className={`fixed z-[999999] w-72 backdrop-blur-md border rounded-xl shadow-2xl text-xs py-1.5 overflow-visible select-none animate-in fade-in zoom-in-95 duration-100 ${
        isLightMode
          ? 'bg-white/95 border-cyan-500/40 shadow-slate-400/40 text-slate-800'
          : 'bg-slate-900/95 border-cyan-500/40 shadow-cyan-950/60 text-slate-200'
      }`}
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Info */}
      <div
        className={`px-3 py-2 border-b flex items-center justify-between ${
          isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/50'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`p-1 rounded border shrink-0 ${
              isLightMode
                ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-400'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
          </div>
          <div className="truncate">
            <div className={`font-bold flex items-center gap-1.5 ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
              <span>{port.port_id}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold border ${
                  isLightMode
                    ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                    : 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50'
                }`}
              >
                MikroTik
              </span>
              {!hasAnyConfigPermission && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>{isEn ? 'Read-Only' : 'فقط‌خواندنی'}</span>
                </span>
              )}
            </div>
            <div className={`text-[10px] font-mono truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {deviceName} • {isDisabled ? 'X (Disabled)' : isUp ? 'R (Running)' : 'Down'}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className={`p-1 rounded transition-colors cursor-pointer ${
            isLightMode ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-800' : 'hover:bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Read-Only Notice if user has no configuration permissions on this port */}
      {!hasAnyConfigPermission && (
        <div className="m-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-amber-300 text-[11px] leading-tight">
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {isEn
              ? 'Interface modifications are restricted by your access policy.'
              : 'تغییر پیکربندی اینترفیس توسط پالیسی دسترسی شما مسدود است.'}
          </span>
        </div>
      )}

      {/* Primary Actions List */}
      <div className="py-1 space-y-0.5">
        {/* Enable / Disable Interface (Guarded by port_power) */}
        {canPower && (
          isDisabled ? (
            <button
              type="button"
              onClick={() => handleProtectedAction('enable')}
              className="w-full px-3 py-2 text-left hover:bg-emerald-950/40 hover:text-emerald-300 flex items-center justify-between group transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Power className="w-4 h-4 text-emerald-400" />
                <span>{isEn ? 'Enable Interface (disabled=no)' : 'فعال‌سازی اینترفیس (disabled=no)'}</span>
              </div>
              <span
                onClick={(e) => copyCommand(`/interface ethernet set [find name="${port.port_id}"] disabled=no`, e)}
                className="text-[10px] text-slate-500 hover:text-cyan-300 px-1 py-0.5 rounded hover:bg-slate-800"
                title="Copy RouterOS command"
              >
                {copiedCmd?.includes('disabled=no') ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleProtectedAction('disable')}
              className="w-full px-3 py-2 text-left hover:bg-amber-950/40 hover:text-amber-300 flex items-center justify-between group transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <PowerOff className="w-4 h-4 text-amber-400" />
                <span>{isEn ? 'Disable Interface (disabled=yes)' : 'غیرفعال‌سازی اینترفیس (disabled=yes)'}</span>
              </div>
              <span
                onClick={(e) => copyCommand(`/interface ethernet set [find name="${port.port_id}"] disabled=yes`, e)}
                className="text-[10px] text-slate-500 hover:text-cyan-300 px-1 py-0.5 rounded hover:bg-slate-800"
                title="Copy RouterOS command"
              >
                {copiedCmd?.includes('disabled=yes') ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </span>
            </button>
          )
        )}

        {/* Divider if power action is displayed */}
        {canPower && (canBridge || canVlan || canSpeed || canDescription || canCableTest) && (
          <div className="border-t border-slate-800 my-1" />
        )}

        {/* Bridge Membership Toggle (Guarded by port_bridge) */}
        {canBridge && (
          <button
            type="button"
            onClick={() => handleProtectedAction('bridge_add')}
            className="w-full px-3 py-2 text-left hover:bg-cyan-950/40 hover:text-cyan-300 flex items-center justify-between group transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>{isEn ? 'Add to Bridge (bridge1)' : 'افزودن به بریج میکروتیک (bridge1)'}</span>
            </div>
            <span
              onClick={(e) => copyCommand(`/interface bridge port add bridge=bridge1 interface=${port.port_id}`, e)}
              className="text-[10px] text-slate-500 hover:text-cyan-300 px-1 py-0.5 rounded hover:bg-slate-800"
              title="Copy RouterOS command"
            >
              {copiedCmd?.includes('bridge port add') ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </span>
          </button>
        )}

        {/* Set Bridge PVID / VLAN (Guarded by port_vlan) */}
        {canVlan && (
          <div
            className="relative"
            onMouseEnter={() => setShowVlanSubmenu(true)}
            onMouseLeave={() => setShowVlanSubmenu(false)}
          >
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-slate-800/80 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 flex items-center justify-center font-bold text-cyan-400 text-[10px]">#V</span>
                <span>{isEn ? `Change Bridge PVID (Current: ${port.vlan || 1})` : `تغییر شناسه PVID (فعلی: ${port.vlan || 1})`}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Submenu for Quick VLAN Selection */}
            {showVlanSubmenu && (
              <div className={`absolute ${submenuPosClass} top-0 w-44 bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-xl py-1 z-50`}>
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                  {isEn ? 'Presets' : 'شناسه‌های سریع'}
                </div>
                {[1, 10, 20, 50, 100, 200].map((vlanId) => (
                  <button
                    key={vlanId}
                    type="button"
                    onClick={() => handleProtectedAction('change_vlan', { vlan: vlanId })}
                    className="w-full px-3 py-1.5 text-left hover:bg-cyan-950/50 hover:text-cyan-300 flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span>VLAN / PVID {vlanId}</span>
                    {port.vlan === vlanId && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                ))}
                <div className="border-t border-slate-800 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const custom = prompt(isEn ? 'Enter custom PVID/VLAN ID (1-4094):' : 'شناسه VLAN مورد نظر را وارد کنید:');
                      if (custom && !isNaN(Number(custom))) {
                        handleProtectedAction('change_vlan', { vlan: Number(custom) });
                      }
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-800 text-cyan-400 text-xs font-semibold cursor-pointer"
                  >
                    {isEn ? 'Custom PVID...' : 'شناسه دلخواه...'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Speed & Duplex Submenu (Guarded by port_speed) */}
        {canSpeed && (
          <div
            className="relative"
            onMouseEnter={() => setShowSpeedSubmenu(true)}
            onMouseLeave={() => setShowSpeedSubmenu(false)}
          >
            <button
              type="button"
              className="w-full px-3 py-2 text-left hover:bg-slate-800/80 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                <span>{isEn ? 'Speed & Duplex' : 'سرعت و حالت دوبلکس'}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showSpeedSubmenu && (
              <div className={`absolute ${submenuPosClass} top-0 w-44 bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-xl py-1 z-50`}>
                <button
                  type="button"
                  onClick={() => handleProtectedAction('set_speed', { auto_negotiation: true })}
                  className="w-full px-3 py-1.5 text-left hover:bg-cyan-950/50 hover:text-cyan-300 flex items-center justify-between text-xs cursor-pointer"
                >
                  <span>Auto-Negotiation</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleProtectedAction('set_speed', { auto_negotiation: false, speed: '100M-full' })}
                  className="w-full px-3 py-1.5 text-left hover:bg-cyan-950/50 hover:text-cyan-300 flex items-center justify-between text-xs cursor-pointer"
                >
                  <span>100M Full Duplex</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleProtectedAction('set_speed', { auto_negotiation: false, speed: '1G-full' })}
                  className="w-full px-3 py-1.5 text-left hover:bg-cyan-950/50 hover:text-cyan-300 flex items-center justify-between text-xs cursor-pointer"
                >
                  <span>1G Full Duplex</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Edit Comment (Guarded by port_description) */}
        {canDescription && (
          <button
            type="button"
            onClick={() => {
              const newComment = prompt(isEn ? 'Enter RouterOS port comment:' : 'یادداشت و برچسب پورت میکروتیک را وارد کنید:', port.description || '');
              if (newComment !== null) {
                handleProtectedAction('edit_comment', { comment: newComment });
              }
            }}
            className="w-full px-3 py-2 text-left hover:bg-slate-800/80 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span>{isEn ? 'Edit Port Comment' : 'ویرایش یادداشت و کامنت پورت'}</span>
            </div>
          </button>
        )}

        {/* Cable Test (RouterOS TDR - Guarded by port_cable_test) */}
        {canCableTest && (
          <button
            type="button"
            onClick={() => handleProtectedAction('cable_test')}
            className="w-full px-3 py-2 text-left hover:bg-cyan-950/40 hover:text-cyan-300 flex items-center justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>{isEn ? 'TDR Cable Diagnostic' : 'تست عیب‌یابی کابل (TDR Test)'}</span>
            </div>
          </button>
        )}

        {/* Launch MikroTik RouterOS Terminal (Guarded by terminal) */}
        {canTerminal && onOpenTerminal && (
          <>
            <div className="border-t border-slate-800 my-1" />
            <button
              type="button"
              onClick={() => {
                onOpenTerminal(port.port_id);
                onClose();
              }}
              className="w-full px-3 py-2 text-left bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-300 flex items-center gap-2 transition-colors font-medium cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>{isEn ? `Open RouterOS CLI (${port.port_id})` : `ترمینال خط فرمان میکروتیک (${port.port_id})`}</span>
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
