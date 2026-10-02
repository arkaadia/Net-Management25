import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Power,
  PowerOff,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Terminal,
  Copy,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Server,
  FileText,
  Lock
} from 'lucide-react';
import { SwitchPort, VlanInfo, AccessPolicy } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { isDeviceActionPermitted } from '../utils/rbac';

export interface CiscoPortContextMenuProps {
  x: number;
  y: number;
  port: SwitchPort;
  deviceName: string;
  deviceId?: string;
  vlans?: VlanInfo[];
  policy?: AccessPolicy | null;
  onClose: () => void;
  onExecuteAction: (action: 'shutdown' | 'no_shutdown' | 'mode_trunk' | 'mode_access' | 'port_sec_enable' | 'port_sec_disable' | 'change_vlan' | 'open_assign_vlan' | 'edit_description', extra?: any) => void;
  onOpenTerminal?: (portId: string) => void;
}

export const CiscoPortContextMenu: React.FC<CiscoPortContextMenuProps> = ({
  x,
  y,
  port,
  deviceName,
  deviceId,
  vlans = [],
  policy,
  onClose,
  onExecuteAction,
  onOpenTerminal,
}) => {
  const { t, isEn } = useLanguage();
  const { effectivePolicy: authEffectivePolicy } = useAuth();
  const effectivePolicy = policy !== undefined ? policy : authEffectivePolicy;

  const menuRef = useRef<HTMLDivElement>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [showVlanSubmenu, setShowVlanSubmenu] = useState(false);

  // Evaluate fine-grained RBAC action permissions for this specific device
  const targetDeviceId = deviceId || deviceName;
  const canPower = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_power');
  const canMode = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_mode');
  const canPortSecurity = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_security');
  const canVlan = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_vlan');
  const canDescription = isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'port_description');
  const canTerminal = Boolean(onOpenTerminal && isDeviceActionPermitted(effectivePolicy, targetDeviceId, 'terminal'));

  const hasAnyConfigPermission = canPower || canMode || canPortSecurity || canVlan || canDescription;

  const isUp = port.status === 'up' && port.admin_status !== 'disabled';
  const isTrunk = port.mode === 'trunk';
  const isPortSec = !!port.port_security_enabled;

  // Accurate mouse position alignment with smooth viewport boundary clamping
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
      targetLeft = Math.max(12, x - actualWidth);
    } else {
      targetLeft = Math.max(12, targetLeft);
    }

    if (targetTop + actualHeight > curScreenH - 12) {
      // Gently clamp near the cursor without jumping to screen top
      targetTop = Math.max(12, curScreenH - actualHeight - 12);
    } else {
      targetTop = Math.max(12, targetTop);
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

  const copyCliCommand = (cmd: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2200);
  };

  const getShutdownCli = () => {
    return `configure terminal\ninterface ${port.port_id}\n shutdown\nexit`;
  };

  const getNoShutdownCli = () => {
    return `configure terminal\ninterface ${port.port_id}\n no shutdown\nexit`;
  };

  const getModeCli = () => {
    const targetMode = isTrunk ? 'access' : 'trunk';
    return `configure terminal\ninterface ${port.port_id}\n switchport mode ${targetMode}\nexit`;
  };

  const getPortSecCli = () => {
    const cmd = isPortSec ? 'no switchport port-security' : 'switchport mode access\n switchport port-security\n switchport port-security violation restrict\n switchport port-security mac-address sticky';
    return `configure terminal\ninterface ${port.port_id}\n ${cmd}\nexit`;
  };

  const getDescriptionCli = () => {
    const desc = port.description ? port.description : 'Uplink-Interface';
    return `configure terminal\ninterface ${port.port_id}\n description ${desc}\nexit`;
  };

  return createPortal(
    <div
      ref={menuRef}
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      className="cisco-port-context-menu fixed z-[999999] w-[280px] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden font-sans text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with Port Details */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <div className="font-mono font-bold text-white text-xs flex items-center gap-1.5">
              <span>{port.port_id}</span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isUp ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-rose-500'
                }`}
              />
              {!hasAnyConfigPermission && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>{isEn ? 'Read-Only' : 'فقط‌خواندنی'}</span>
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {port.connected_device || (isEn ? 'Empty Port' : 'پورت آزاد')} • VLAN {port.vlan}
            </div>
            {port.description && (
              <div className="text-[10px] text-amber-300/90 font-mono truncate max-w-[200px] mt-0.5" title={port.description}>
                "{port.description}"
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
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
              ? 'Port modifications are restricted by your access policy.'
              : 'تغییر پیکربندی این پورت توسط پالیسی دسترسی شما مسدود است.'}
          </span>
        </div>
      )}

      {/* Cisco Quick Actions Menu */}
      <div className="p-1.5 space-y-1">
        {/* Action 1A & 1B: Shutdown / No Shutdown Port (port_power) */}
        {canPower && (
          <>
            <div className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/90 transition cursor-pointer">
              <button
                type="button"
                onClick={() => {
                  onExecuteAction('shutdown');
                  onClose();
                }}
                className="flex items-center gap-2.5 flex-1 text-left rtl:text-right"
              >
                <PowerOff className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>{isEn ? 'Shutdown Port' : 'خاموش کردن پورت (shutdown)'}</span>
                    {!isUp && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        {isEn ? 'Down' : 'خاموش'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Cisco IOS: shutdown
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => copyCliCommand(getShutdownCli(), e)}
                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-700 transition"
                title={isEn ? 'Copy Cisco CLI Command' : 'کپی دستورات سیسکو'}
              >
                {copiedCmd === getShutdownCli() ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <div className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/90 transition cursor-pointer">
              <button
                type="button"
                onClick={() => {
                  onExecuteAction('no_shutdown');
                  onClose();
                }}
                className="flex items-center gap-2.5 flex-1 text-left rtl:text-right"
              >
                <Power className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>{isEn ? 'No Shutdown (Enable)' : 'روشن کردن پورت (no shutdown)'}</span>
                    {isUp && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {isEn ? 'Active' : 'روشن'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    Cisco IOS: no shutdown
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => copyCliCommand(getNoShutdownCli(), e)}
                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-700 transition"
                title={isEn ? 'Copy Cisco CLI Command' : 'کپی دستورات سیسکو'}
              >
                {copiedCmd === getNoShutdownCli() ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </>
        )}

        {/* Action 2: Switchport Mode Trunk / Access (port_mode) */}
        {canMode && (
          <div className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/90 transition cursor-pointer">
            <button
              type="button"
              onClick={() => {
                onExecuteAction(isTrunk ? 'mode_access' : 'mode_trunk');
                onClose();
              }}
              className="flex items-center gap-2.5 flex-1 text-left rtl:text-right"
            >
              <Layers className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <div className="font-bold text-white text-xs">
                  {isTrunk ? (isEn ? 'Set Mode: Access' : 'تغییر مود به Access') : (isEn ? 'Set Mode: Trunk' : 'تغییر مود به Trunk')}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {isTrunk ? 'switchport mode access' : 'switchport mode trunk'}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => copyCliCommand(getModeCli(), e)}
              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-700 transition"
              title={isEn ? 'Copy Cisco CLI Command' : 'کپی دستورات سیسکو'}
            >
              {copiedCmd === getModeCli() ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Action 3: Port Security Toggle (port_security) */}
        {canPortSecurity && (
          <div className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/90 transition cursor-pointer">
            <button
              type="button"
              onClick={() => {
                onExecuteAction(isPortSec ? 'port_sec_disable' : 'port_sec_enable');
                onClose();
              }}
              className="flex items-center gap-2.5 flex-1 text-left rtl:text-right"
            >
              {isPortSec ? (
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
              <div>
                <div className="font-bold text-white text-xs">
                  {isPortSec
                    ? (isEn ? 'Disable Port Security' : 'غیرفعال‌سازی Port Security')
                    : (isEn ? 'Enable Port Security' : 'فعال‌سازی Port Security')}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {isPortSec ? 'no switchport port-security' : 'switchport port-security'}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => copyCliCommand(getPortSecCli(), e)}
              className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-700 transition"
              title={isEn ? 'Copy Cisco CLI Command' : 'کپی دستورات سیسکو'}
            >
              {copiedCmd === getPortSecCli() ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {/* Action 4: Assign Access VLAN (port_vlan) */}
        {canVlan && (
          <div className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/90 transition cursor-pointer">
            <button
              type="button"
              onClick={() => {
                onExecuteAction('open_assign_vlan');
                onClose();
              }}
              className="w-full flex items-center justify-between text-left rtl:text-right"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-4 flex items-center justify-center font-mono font-bold text-indigo-400 text-xs">
                  V#
                </span>
                <div>
                  <div className="font-bold text-white text-xs">
                    {isEn ? 'Assign Access VLAN...' : 'تخصیص ویلن دسترسی (VLAN)...'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {isEn ? `Current: VLAN ${port.vlan}` : `ویلن فعلی: ${port.vlan}`}
                  </div>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-400 transition" />
            </button>
          </div>
        )}

        {/* Action 5: Set / Edit Description (port_description) */}
        {canDescription && (
          <div className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/90 transition cursor-pointer">
            <button
              type="button"
              onClick={() => {
                onExecuteAction('edit_description');
                onClose();
              }}
              className="flex items-center gap-2.5 flex-1 text-left rtl:text-right"
            >
              <FileText className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="font-bold text-white text-xs flex items-center gap-1.5">
                  <span>{isEn ? 'Set Description...' : 'تنظیم توضیحات پورت (Description)...'}</span>
                  {port.description && (
                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {isEn ? 'Configured' : 'ثبت‌شده'}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]" title={port.description}>
                  {port.description ? `"${port.description}"` : (isEn ? 'No description' : 'بدون توضیحات')}
                </div>
              </div>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => copyCliCommand(getDescriptionCli(), e)}
                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-700 transition"
                title={isEn ? 'Copy Cisco CLI Command' : 'کپی دستورات سیسکو'}
              >
                {copiedCmd === getDescriptionCli() ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onExecuteAction('edit_description');
                  onClose();
                }}
                className="p-1 text-slate-400 hover:text-amber-400 transition"
                title={isEn ? 'Open Description Modal' : 'باز کردن مودال دیسکریپشن'}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Action 6: Open in Cisco CLI (terminal) */}
        {canTerminal && onOpenTerminal && (
          <button
            type="button"
            onClick={() => {
              onOpenTerminal(port.port_id);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-800/90 text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
          >
            <Terminal className="w-4 h-4 shrink-0" />
            <div className="text-left rtl:text-right">
              <div className="font-bold text-xs">
                {isEn ? 'Open in Cisco CLI' : 'باز کردن در ترمینال سیسکو (CLI)'}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                interface {port.port_id}
              </div>
            </div>
          </button>
        )}

        {/* Fully Locked Empty State */}
        {!hasAnyConfigPermission && !canTerminal && (
          <div className="p-3 text-center text-slate-400 text-xs">
            <Lock className="w-6 h-6 mx-auto mb-1.5 text-slate-500" />
            <div className="font-semibold text-slate-300">
              {isEn ? 'No Port Actions Available' : 'هیچ عملیات پورت مجازی در دسترس نیست'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {isEn ? 'Inspection only under current RBAC policy.' : 'صرفاً امکان مشاهده طبق پالیسی فعال RBAC وجود دارد.'}
            </div>
          </div>
        )}
      </div>

      {/* Copy notification toast */}
      {copiedCmd && (
        <div className="px-3 py-1.5 bg-emerald-950/90 border-t border-emerald-500/40 text-emerald-300 text-[10px] font-mono flex items-center gap-1.5 animate-fade-in">
          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>{isEn ? 'Cisco IOS CLI snippet copied!' : 'دستورات Cisco IOS در کلیپ‌بورد کپی شد!'}</span>
        </div>
      )}
    </div>,
    document.body
  );
};
