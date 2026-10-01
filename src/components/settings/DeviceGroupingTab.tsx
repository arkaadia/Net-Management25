import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderTree,
  Plus,
  Trash2,
  Check,
  X,
  Search,
  Server,
  Network,
  Radio,
  GripVertical,
  Layers,
  Sparkles,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Terminal,
  HardDrive,
  Save,
  Filter,
  Tag,
  CheckSquare,
  Square,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { Device, DeviceGroup, GroupColor, RemoteServer } from '../../types';
import { useLanguage } from '../../i18n';
import { fetchRemoteServers, saveDeviceGroupsApi, fetchDeviceGroups } from '../../services/api';

interface DeviceGroupingTabProps {
  groups: DeviceGroup[];
  devices: Device[];
  servers?: RemoteServer[];
  onSaveGroups: (groups: DeviceGroup[]) => void;
}

const COLOR_MAP: Record<GroupColor, { bg: string; border: string; text: string; badge: string; dot: string }> = {
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  indigo: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/40',
    text: 'text-indigo-400',
    badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/40',
    text: 'text-cyan-400',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    dot: 'bg-cyan-400',
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/40',
    text: 'text-rose-400',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/40',
    text: 'text-purple-400',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    dot: 'bg-purple-400',
  },
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/40',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400',
  },
  slate: {
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/40',
    text: 'text-slate-400',
    badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    dot: 'bg-slate-400',
  },
};

type DraggedItem = {
  type: 'device' | 'server';
  id: string;
};

export const DeviceGroupingTab: React.FC<DeviceGroupingTabProps> = ({
  groups: initialGroups,
  devices,
  servers: initialServers,
  onSaveGroups,
}) => {
  const { isEn } = useLanguage();

  // Internal groups state to allow smooth editing and explicit database save
  const [groups, setGroups] = useState<DeviceGroup[]>(() =>
    initialGroups.map((g) => ({
      ...g,
      deviceIds: Array.isArray(g.deviceIds) ? g.deviceIds : (Array.isArray(g.device_ids) ? g.device_ids : []),
      serverIds: Array.isArray(g.serverIds) ? g.serverIds : (Array.isArray(g.server_ids) ? g.server_ids : []),
      tags: Array.isArray(g.tags) ? g.tags : [],
    }))
  );

  // Sync groups if external initialGroups changes and we have no unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Selected Group
  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroups[0]?.id || '');

  // Remote servers list from database fleet
  const [servers, setServers] = useState<RemoteServer[]>(initialServers || []);
  const [loadingServers, setLoadingServers] = useState<boolean>(false);

  // Filter and Search states for available items
  const [searchFilter, setSearchFilter] = useState('');
  const [availableCategoryFilter, setAvailableCategoryFilter] = useState<'all' | 'devices' | 'servers'>('all');
  const [memberCategoryFilter, setMemberCategoryFilter] = useState<'all' | 'devices' | 'servers'>('all');
  const [deviceRoleFilter, setDeviceRoleFilter] = useState<'all' | 'switch' | 'router' | 'access_point'>('all');
  const [serverOsFilter, setServerOsFilter] = useState<'all' | 'linux' | 'windows'>('all');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');

  // Search inside group members
  const [memberSearchFilter, setMemberSearchFilter] = useState('');

  // Multi-select batch operations state
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // New Group Modal / Inline Form State
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<GroupColor>('amber');
  const [newGroupTags, setNewGroupTags] = useState<string>('core, infrastructure');

  // Drag and Drop state
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [isDragOverGroup, setIsDragOverGroup] = useState(false);

  // Fetch servers from database fleet on mount
  useEffect(() => {
    let isMounted = true;
    setLoadingServers(true);
    fetchRemoteServers()
      .then((res) => {
        if (isMounted && res && Array.isArray(res.servers)) {
          setServers(res.servers);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch servers for grouping:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingServers(false);
      });

    // Also attempt to load groups from database API
    fetchDeviceGroups()
      .then((res) => {
        if (isMounted && res && Array.isArray(res.groups) && res.groups.length > 0) {
          setGroups(
            res.groups.map((g) => ({
              ...g,
              deviceIds: Array.isArray(g.deviceIds) ? g.deviceIds : (Array.isArray((g as any).device_ids) ? (g as any).device_ids : []),
              serverIds: Array.isArray(g.serverIds) ? g.serverIds : (Array.isArray((g as any).server_ids) ? (g as any).server_ids : []),
              tags: Array.isArray(g.tags) ? g.tags : [],
            }))
          );
        }
      })
      .catch((err) => {
        console.warn('Could not fetch backend device groups:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];

  // Helper: device icon
  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'router':
        return <Radio className="w-4 h-4 text-purple-400" />;
      case 'switch':
        return <Network className="w-4 h-4 text-cyan-400" />;
      case 'access_point':
        return <Radio className="w-4 h-4 text-emerald-400" />;
      default:
        return <Server className="w-4 h-4 text-slate-400" />;
    }
  };

  // Helper: server icon
  const getServerIcon = (serverItem: RemoteServer) => {
    if (serverItem.os_type === 'windows') {
      return <Monitor className="w-4 h-4 text-sky-400" />;
    }
    if (serverItem.has_postgresql || serverItem.has_mysql || (serverItem.category && serverItem.category.toLowerCase().includes('database'))) {
      return <HardDrive className="w-4 h-4 text-emerald-400" />;
    }
    return <Terminal className="w-4 h-4 text-amber-400" />;
  };

  // Helper: extract all unique tags across servers and devices
  const allUniqueTags = useMemo(() => {
    const set = new Set<string>();
    servers.forEach((s) => {
      if (Array.isArray(s.tags)) {
        s.tags.forEach((t) => {
          if (t && t.trim()) set.add(t.trim().toLowerCase());
        });
      }
      if (s.environment) set.add(s.environment.toLowerCase());
    });
    devices.forEach((d) => {
      if (Array.isArray(d.tags)) {
        d.tags.forEach((t) => {
          if (t && t.trim()) set.add(t.trim().toLowerCase());
        });
      }
      if (d.role) set.add(d.role.toLowerCase());
      if (d.type) set.add(d.type.toLowerCase());
    });
    return Array.from(set).slice(0, 15);
  }, [servers, devices]);

  // Create new group
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const parsedTags = newGroupTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const newGroup: DeviceGroup = {
      id: `group-${Date.now().toString(36)}`,
      name: newGroupName.trim(),
      description: newGroupDesc.trim() || (isEn ? 'Custom device and server group' : 'گروه سفارشی تجهیزات شبکه و سرورها'),
      color: newGroupColor,
      tags: parsedTags,
      deviceIds: [],
      device_ids: [],
      serverIds: [],
      server_ids: [],
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    const updated = [...groups, newGroup];
    setGroups(updated);
    setSelectedGroupId(newGroup.id);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
    setIsCreatingGroup(false);
    setNewGroupName('');
    setNewGroupDesc('');
    setNewGroupTags('core, infrastructure');
  };

  // Delete group
  const handleDeleteGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (groups.length <= 1) {
      alert(isEn ? 'At least one group must remain.' : 'حداقل یک گروه باید در سیستم باقی بماند.');
      return;
    }
    const confirmed = window.confirm(
      isEn
        ? 'Are you sure you want to delete this group?'
        : 'آیا از حذف این گروه تجهیزات و سرورها اطمینان دارید؟'
    );
    if (!confirmed) return;

    const updated = groups.filter((g) => g.id !== groupId);
    setGroups(updated);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
    if (selectedGroupId === groupId) {
      setSelectedGroupId(updated[0]?.id || '');
    }
  };

  // Add device to current group
  const handleAddDeviceToGroup = (deviceId: string) => {
    if (!selectedGroup) return;
    if (selectedGroup.deviceIds.includes(deviceId)) return;

    const updated = groups.map((g) => {
      if (g.id === selectedGroup.id) {
        const nextDevIds = [...g.deviceIds, deviceId];
        return {
          ...g,
          deviceIds: nextDevIds,
          device_ids: nextDevIds,
          serverIds: Array.isArray(g.serverIds) ? g.serverIds : [],
          server_ids: Array.isArray(g.serverIds) ? g.serverIds : [],
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
      }
      return g;
    });
    setGroups(updated);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
  };

  // Remove device from current group
  const handleRemoveDeviceFromGroup = (deviceId: string) => {
    if (!selectedGroup) return;
    const updated = groups.map((g) => {
      if (g.id === selectedGroup.id) {
        const nextDevIds = g.deviceIds.filter((id) => id !== deviceId);
        return {
          ...g,
          deviceIds: nextDevIds,
          device_ids: nextDevIds,
          serverIds: Array.isArray(g.serverIds) ? g.serverIds : [],
          server_ids: Array.isArray(g.serverIds) ? g.serverIds : [],
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
      }
      return g;
    });
    setGroups(updated);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
  };

  // Add server to current group
  const handleAddServerToGroup = (serverId: string) => {
    if (!selectedGroup) return;
    const currentServerIds = Array.isArray(selectedGroup.serverIds) ? selectedGroup.serverIds : [];
    if (currentServerIds.includes(serverId)) return;

    const updated = groups.map((g) => {
      if (g.id === selectedGroup.id) {
        const nextSrvIds = [...currentServerIds, serverId];
        return {
          ...g,
          deviceIds: Array.isArray(g.deviceIds) ? g.deviceIds : [],
          device_ids: Array.isArray(g.deviceIds) ? g.deviceIds : [],
          serverIds: nextSrvIds,
          server_ids: nextSrvIds,
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
      }
      return g;
    });
    setGroups(updated);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
  };

  // Remove server from current group
  const handleRemoveServerFromGroup = (serverId: string) => {
    if (!selectedGroup) return;
    const currentServerIds = Array.isArray(selectedGroup.serverIds) ? selectedGroup.serverIds : [];
    const updated = groups.map((g) => {
      if (g.id === selectedGroup.id) {
        const nextSrvIds = currentServerIds.filter((id) => id !== serverId);
        return {
          ...g,
          deviceIds: Array.isArray(g.deviceIds) ? g.deviceIds : [],
          device_ids: Array.isArray(g.deviceIds) ? g.deviceIds : [],
          serverIds: nextSrvIds,
          server_ids: nextSrvIds,
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
      }
      return g;
    });
    setGroups(updated);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
  };

  // Multi-select batch add available items to group
  const handleBatchAddSelected = () => {
    if (!selectedGroup || selectedAvailableIds.length === 0) return;

    const deviceIdsToAdd: string[] = [];
    const serverIdsToAdd: string[] = [];

    selectedAvailableIds.forEach((id) => {
      if (devices.some((d) => d.id === id)) {
        if (!selectedGroup.deviceIds.includes(id)) {
          deviceIdsToAdd.push(id);
        }
      } else if (servers.some((s) => s.id === id)) {
        const currentServerIds = Array.isArray(selectedGroup.serverIds) ? selectedGroup.serverIds : [];
        if (!currentServerIds.includes(id)) {
          serverIdsToAdd.push(id);
        }
      }
    });

    const updated = groups.map((g) => {
      if (g.id === selectedGroup.id) {
        const nextDevIds = Array.from(new Set([...g.deviceIds, ...deviceIdsToAdd]));
        const currentServerIds = Array.isArray(g.serverIds) ? g.serverIds : [];
        const nextSrvIds = Array.from(new Set([...currentServerIds, ...serverIdsToAdd]));
        return {
          ...g,
          deviceIds: nextDevIds,
          device_ids: nextDevIds,
          serverIds: nextSrvIds,
          server_ids: nextSrvIds,
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
      }
      return g;
    });

    setGroups(updated);
    setSelectedAvailableIds([]);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
  };

  // Multi-select batch remove members from group
  const handleBatchRemoveSelected = () => {
    if (!selectedGroup || selectedMemberIds.length === 0) return;

    const updated = groups.map((g) => {
      if (g.id === selectedGroup.id) {
        const nextDevIds = g.deviceIds.filter((id) => !selectedMemberIds.includes(id));
        const currentServerIds = Array.isArray(g.serverIds) ? g.serverIds : [];
        const nextSrvIds = currentServerIds.filter((id) => !selectedMemberIds.includes(id));
        return {
          ...g,
          deviceIds: nextDevIds,
          device_ids: nextDevIds,
          serverIds: nextSrvIds,
          server_ids: nextSrvIds,
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
      }
      return g;
    });

    setGroups(updated);
    setSelectedMemberIds([]);
    setHasUnsavedChanges(true);
    onSaveGroups(updated);
  };

  // Explicit Save to Database Action
  const handleSaveToDatabase = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    setStatusMessage(null);

    try {
      // Normalize groups payload to ensure both deviceIds and serverIds are present
      const normalizedGroups = groups.map((g) => {
        const dIds = Array.isArray(g.deviceIds) ? g.deviceIds : (Array.isArray(g.device_ids) ? g.device_ids : []);
        const sIds = Array.isArray(g.serverIds) ? g.serverIds : (Array.isArray(g.server_ids) ? g.server_ids : []);
        return {
          ...g,
          deviceIds: dIds,
          device_ids: dIds,
          serverIds: sIds,
          server_ids: sIds,
          tags: Array.isArray(g.tags) ? g.tags : [],
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
      });

      await saveDeviceGroupsApi(normalizedGroups);
      onSaveGroups(normalizedGroups);
      setGroups(normalizedGroups);
      setHasUnsavedChanges(false);
      setSaveStatus('success');

      const totalDevs = normalizedGroups.reduce((acc, g) => acc + g.deviceIds.length, 0);
      const totalSrvs = normalizedGroups.reduce((acc, g) => acc + (g.serverIds?.length || 0), 0);

      setStatusMessage(
        isEn
          ? `Device and Server groups successfully persisted to database (${normalizedGroups.length} groups, ${totalDevs} device allocations, ${totalSrvs} server allocations).`
          : `گروه‌بندی دیوایس‌ها و سرورها با موفقیت در دیتابیس ذخیره شد (${normalizedGroups.length} گروه، ${totalDevs} تخصیص دیوایس و ${totalSrvs} تخصیص سرور).`
      );
      setTimeout(() => {
        setSaveStatus('idle');
        setStatusMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error('Failed to save groups to database:', err);
      setSaveStatus('error');
      setStatusMessage(
        isEn
          ? `Failed to save groups to database: ${err.message || 'Unknown error'}`
          : `خطا در ذخیره‌سازی در دیتابیس: ${err.message || 'خطای نامشخص'}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, item: DraggedItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOverGroup(true);
  };

  const handleDragLeave = () => {
    setIsDragOverGroup(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverGroup(false);
    let item = draggedItem;
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        item = JSON.parse(dataStr);
      }
    } catch {}

    if (item) {
      if (item.type === 'device') {
        handleAddDeviceToGroup(item.id);
      } else if (item.type === 'server') {
        handleAddServerToGroup(item.id);
      }
    }
    setDraggedItem(null);
  };

  // Assigned members in selected group
  const assignedDevices = useMemo(() => {
    if (!selectedGroup) return [];
    const q = memberSearchFilter.trim().toLowerCase();
    return devices.filter((d) => {
      if (!selectedGroup.deviceIds.includes(d.id)) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.ip.includes(q) ||
        (d.model && d.model.toLowerCase().includes(q)) ||
        (d.role && d.role.toLowerCase().includes(q))
      );
    });
  }, [devices, selectedGroup, memberSearchFilter]);

  const assignedServers = useMemo(() => {
    if (!selectedGroup) return [];
    const sIds = Array.isArray(selectedGroup.serverIds) ? selectedGroup.serverIds : [];
    const q = memberSearchFilter.trim().toLowerCase();
    return servers.filter((s) => {
      if (!sIds.includes(s.id)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.hostname && s.hostname.toLowerCase().includes(q)) ||
        s.ip.includes(q) ||
        (s.os_distro && s.os_distro.toLowerCase().includes(q)) ||
        (s.role && s.role.toLowerCase().includes(q))
      );
    });
  }, [servers, selectedGroup, memberSearchFilter]);

  const totalAssignedCount = (selectedGroup?.deviceIds?.length || 0) + (selectedGroup?.serverIds?.length || 0);

  // Available devices
  const availableDevices = useMemo(() => {
    if (!selectedGroup) return [];
    const q = searchFilter.trim().toLowerCase();
    return devices.filter((d) => {
      const isMember = selectedGroup.deviceIds.includes(d.id);
      if (isMember) return false;

      const matchesRole = deviceRoleFilter === 'all' || d.type === deviceRoleFilter;
      if (!matchesRole) return false;

      if (selectedTagFilter !== 'all') {
        const dTags = Array.isArray(d.tags) ? d.tags.map((t) => t.toLowerCase()) : [];
        const matchesTag =
          dTags.includes(selectedTagFilter) ||
          d.role?.toLowerCase() === selectedTagFilter ||
          d.type?.toLowerCase() === selectedTagFilter;
        if (!matchesTag) return false;
      }

      if (!q) return true;
      const dTagsStr = Array.isArray(d.tags) ? d.tags.join(' ').toLowerCase() : '';
      return (
        d.name.toLowerCase().includes(q) ||
        d.ip.includes(q) ||
        (d.model && d.model.toLowerCase().includes(q)) ||
        (d.role && d.role.toLowerCase().includes(q)) ||
        dTagsStr.includes(q)
      );
    });
  }, [devices, selectedGroup, searchFilter, deviceRoleFilter, selectedTagFilter]);

  // Available servers
  const availableServers = useMemo(() => {
    if (!selectedGroup) return [];
    const q = searchFilter.trim().toLowerCase();
    const sIds = Array.isArray(selectedGroup.serverIds) ? selectedGroup.serverIds : [];

    return servers.filter((s) => {
      const isMember = sIds.includes(s.id);
      if (isMember) return false;

      const matchesOs = serverOsFilter === 'all' || s.os_type === serverOsFilter;
      if (!matchesOs) return false;

      if (selectedTagFilter !== 'all') {
        const sTags = Array.isArray(s.tags) ? s.tags.map((t) => t.toLowerCase()) : [];
        const matchesTag =
          sTags.includes(selectedTagFilter) ||
          s.environment?.toLowerCase() === selectedTagFilter ||
          s.role?.toLowerCase() === selectedTagFilter ||
          s.category?.toLowerCase() === selectedTagFilter;
        if (!matchesTag) return false;
      }

      if (!q) return true;
      const sTagsStr = Array.isArray(s.tags) ? s.tags.join(' ').toLowerCase() : '';
      return (
        s.name.toLowerCase().includes(q) ||
        (s.hostname && s.hostname.toLowerCase().includes(q)) ||
        s.ip.includes(q) ||
        (s.os_distro && s.os_distro.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        (s.role && s.role.toLowerCase().includes(q)) ||
        sTagsStr.includes(q)
      );
    });
  }, [servers, selectedGroup, searchFilter, serverOsFilter, selectedTagFilter]);

  // Toggle selection for available items
  const toggleSelectAvailable = (id: string) => {
    setSelectedAvailableIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select all available filtered items
  const handleSelectAllAvailable = () => {
    const allFilteredIds = [
      ...(availableCategoryFilter === 'all' || availableCategoryFilter === 'devices'
        ? availableDevices.map((d) => d.id)
        : []),
      ...(availableCategoryFilter === 'all' || availableCategoryFilter === 'servers'
        ? availableServers.map((s) => s.id)
        : []),
    ];

    if (selectedAvailableIds.length === allFilteredIds.length && allFilteredIds.length > 0) {
      setSelectedAvailableIds([]);
    } else {
      setSelectedAvailableIds(allFilteredIds);
    }
  };

  // Toggle selection for group members
  const toggleSelectMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select all group members
  const handleSelectAllMembers = () => {
    const allMemberIds = [
      ...(memberCategoryFilter === 'all' || memberCategoryFilter === 'devices'
        ? assignedDevices.map((d) => d.id)
        : []),
      ...(memberCategoryFilter === 'all' || memberCategoryFilter === 'servers'
        ? assignedServers.map((s) => s.id)
        : []),
    ];

    if (selectedMemberIds.length === allMemberIds.length && allMemberIds.length > 0) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(allMemberIds);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Header Description & Persistent Save Action */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-md shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/10 border border-amber-500/30 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{isEn ? 'Device Grouping & Tagging' : 'گروه‌بندی و برچسب‌گذاری (Device Grouping & Tagging)'}</span>
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                  {isEn ? 'Network Zones & Resource Allocation' : 'زون‌های شبکه و تخصیص منابع'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  {groups.length} {isEn ? 'Groups' : 'گروه'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                  {devices.length} {isEn ? 'Devices' : 'دیوایس'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">
                  {servers.length} {isEn ? 'Servers' : 'سرور'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                {isEn
                  ? 'Organize switches, routers, and remote servers (Linux & Windows) into unified operational groups and security zones with custom tagging, and persist them securely into the database.'
                  : 'تجهیزات شبکه (سوئیچ‌ها و روترها) و سرورهای ریموت (لینوکس و ویندوز) را در گروه‌های عملیاتی مشترک و زون‌های کاری قرار داده، برچسب‌گذاری کرده و در دیتابیس ذخیره نمایید.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Create New Group & Save Changes to Database */}
        <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end flex-wrap">
          <button
            type="button"
            onClick={() => setIsCreatingGroup(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-xs border border-white/15 transition active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>{isEn ? 'Create Group' : 'ایجاد گروه جدید'}</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveToDatabase}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition active:scale-95 cursor-pointer shadow-lg shrink-0 disabled:opacity-50 ${
              hasUnsavedChanges
                ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-emerald-500/30 ring-2 ring-emerald-400/50 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>{isEn ? 'Saving to Database...' : 'در حال ذخیره در دیتابیس...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-white" />
                <span>{isEn ? 'Save to Database' : 'ذخیره در دیتابیس'}</span>
                {hasUnsavedChanges && (
                  <span className="w-2 h-2 rounded-full bg-white animate-ping ml-1" />
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success / Error Toast Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs animate-fadeIn ${
            saveStatus === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {saveStatus === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="font-semibold">{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && !statusMessage && (
        <div className="p-3 px-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
            <span className="font-medium">
              {isEn
                ? 'You have unsaved changes in group memberships. Click "Save to Database" to commit them to permanent storage.'
                : 'تغییراتی در اعضای گروه‌ها اعمال شده است. جهت ثبت دائمی در پایگاه داده، دکمه «ذخیره در دیتابیس» را کلیک کنید.'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveToDatabase}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0 shadow"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isEn ? 'Save Now' : 'ذخیره فوری'}</span>
          </button>
        </div>
      )}

      {/* Modal / Card for Creating New Group */}
      {isCreatingGroup && (
        <div className="p-5 rounded-2xl bg-slate-900/95 border border-amber-500/40 shadow-2xl space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{isEn ? 'Define New Group (Devices & Servers)' : 'تعریف گروه جدید (شامل تجهیزات و سرورها)'}</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsCreatingGroup(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateGroup} className="space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEn ? 'Group Name' : 'عنوان گروه (مثال: دیتاسنتر یا سرور روم)'}
                </label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={isEn ? 'e.g., Core Datacenter & DB Servers' : 'مثال: سرورها و سوئیچ‌های دیتاسنتر'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-white/15 text-white text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEn ? 'Color Tag' : 'رنگ نمادین گروه'}
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {(['amber', 'indigo', 'cyan', 'emerald', 'rose', 'purple', 'blue'] as GroupColor[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewGroupColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer border-2 ${
                        newGroupColor === c ? 'scale-125 border-white shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor:
                          c === 'amber' ? '#f59e0b' :
                          c === 'indigo' ? '#6366f1' :
                          c === 'cyan' ? '#06b6d4' :
                          c === 'emerald' ? '#10b981' :
                          c === 'rose' ? '#f43f5e' :
                          c === 'purple' ? '#a855f7' : '#3b82f6'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {isEn ? 'Description / Scope' : 'توضیحات و حوزه دسترسی گروه'}
                </label>
                <input
                  type="text"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder={isEn ? 'e.g., Network equipment and servers managed by Core team' : 'مثال: تجهیزات و سرورهای تحت مدیریت تیم هسته'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-white/15 text-white text-xs focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Tag className="w-3 h-3 text-cyan-400" />
                  <span>{isEn ? 'Operational Tags (comma-separated)' : 'برچسب‌های عملیاتی (با کاما جدا کنید)'}</span>
                </label>
                <input
                  type="text"
                  value={newGroupTags}
                  onChange={(e) => setNewGroupTags(e.target.value)}
                  placeholder={isEn ? 'e.g., core, dc, production, tier1' : 'مثال: core, dc, production, tier1'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreatingGroup(false)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md cursor-pointer"
              >
                {isEn ? 'Create Group' : 'ایجاد گروه'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Horizontal Group Selector Carousel */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
        {groups.map((group) => {
          const isSelected = group.id === selectedGroupId;
          const colorStyles = COLOR_MAP[group.color] || COLOR_MAP.amber;
          const devCount = group.deviceIds?.length || 0;
          const srvCount = group.serverIds?.length || 0;
          const totalMembers = devCount + srvCount;

          return (
            <div
              key={group.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedGroupId(group.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedGroupId(group.id);
                }
              }}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border transition-all duration-200 shrink-0 cursor-pointer text-left rtl:text-right select-none ${
                isSelected
                  ? `${colorStyles.bg} ${colorStyles.border} shadow-lg ring-1 ring-white/20`
                  : 'bg-white/[0.02] border-white/10 hover:bg-white/5 hover:border-white/20'
              }`}
            >
              <span className={`w-3 h-3 rounded-full ${colorStyles.dot} shrink-0`} />
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>{group.name}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full border ${colorStyles.badge}`}>
                    {totalMembers} {isEn ? 'Members' : 'عضو'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[200px] flex items-center gap-1.5 mt-0.5 font-mono">
                  <span className="text-cyan-400">{devCount} {isEn ? 'Dev' : 'دیوایس'}</span>
                  <span>•</span>
                  <span className="text-indigo-400">{srvCount} {isEn ? 'Srv' : 'سرور'}</span>
                </div>
                {Array.isArray(group.tags) && group.tags.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {group.tags.slice(0, 3).map((tg) => (
                      <span key={tg} className="text-[9px] px-1 py-0.1 rounded bg-white/5 text-slate-300 font-mono">
                        #{tg}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {groups.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteGroup(group.id, e)}
                  className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition ml-1 cursor-pointer"
                  title={isEn ? 'Delete Group' : 'حذف گروه'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Dual Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Group Members (Target Dropzone) */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`lg:col-span-6 rounded-2xl p-4 transition-all duration-200 border flex flex-col ${
            isDragOverGroup
              ? 'bg-indigo-600/15 border-indigo-400 ring-2 ring-indigo-400/50 shadow-[0_0_25px_rgba(99,102,241,0.3)]'
              : 'bg-white/[0.02] border-white/10'
          }`}
        >
          {/* Header */}
          <div className="space-y-2 border-b border-white/10 pb-3 mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg border ${COLOR_MAP[selectedGroup?.color || 'amber'].badge}`}>
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <span>{selectedGroup?.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({totalAssignedCount} {isEn ? 'members' : 'عضو'})
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">{selectedGroup?.description}</p>
                </div>
              </div>

              <div className="text-[10px] font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-cyan-300">
                {isEn ? 'Drop zone' : 'محل رها کردن'}
              </div>
            </div>

            {/* Sub-Filters and Batch Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/80 border border-white/10 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setMemberCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    memberCategoryFilter === 'all'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'All' : 'همه'} ({totalAssignedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMemberCategoryFilter('devices')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    memberCategoryFilter === 'devices'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Network className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Devices' : 'دیوایس‌ها'} ({selectedGroup?.deviceIds?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMemberCategoryFilter('servers')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                    memberCategoryFilter === 'servers'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isEn ? 'Servers' : 'سرورها'} ({selectedGroup?.serverIds?.length || 0})</span>
                </button>
              </div>

              {/* Batch Remove Button when items are checked */}
              {selectedMemberIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleBatchRemoveSelected}
                  className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition cursor-pointer shadow animate-fadeIn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isEn ? `Remove (${selectedMemberIds.length})` : `حذف (${selectedMemberIds.length})`}</span>
                </button>
              )}
            </div>

            {/* Search inside members */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={memberSearchFilter}
                  onChange={(e) => setMemberSearchFilter(e.target.value)}
                  placeholder={isEn ? 'Search inside this group...' : 'جستجو در اعضای این گروه...'}
                  className="w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-400"
                />
              </div>

              {totalAssignedCount > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllMembers}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition cursor-pointer shrink-0"
                >
                  {selectedMemberIds.length > 0 ? (
                    <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{isEn ? 'Select All' : 'انتخاب همه'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Group Member List */}
          {totalAssignedCount === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center p-4 border border-dashed border-white/15 rounded-xl bg-white/[0.01]">
              <GripVertical className="w-8 h-8 text-slate-500 mb-2 opacity-60" />
              <p className="text-xs font-semibold text-slate-300">
                {isEn ? 'No devices or servers assigned to this group yet' : 'هنوز هیچ دیوایس یا سروری در این گروه قرار نگرفته است'}
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm mt-1">
                {isEn
                  ? 'Select items or drag network devices and remote servers from the right column into this zone.'
                  : 'می‌توانید دیوایس‌ها یا سرورها را از ستون کناری با تیک زدن یا درگ اند دراپ (Drag & Drop) به این گروه اضافه کنید.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
              {/* Assigned Network Devices */}
              {(memberCategoryFilter === 'all' || memberCategoryFilter === 'devices') &&
                assignedDevices.map((dev) => {
                  const isChecked = selectedMemberIds.includes(dev.id);
                  return (
                    <div
                      key={`dev-${dev.id}`}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all shadow-xs ${
                        isChecked
                          ? 'bg-cyan-950/40 border-cyan-400/60 ring-1 ring-cyan-400/30'
                          : 'bg-slate-900/60 hover:bg-slate-900/90 border-white/10 hover:border-cyan-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectMember(dev.id)}
                          className="text-slate-400 hover:text-white transition cursor-pointer shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>

                        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
                          {getDeviceIcon(dev.type)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white truncate">{dev.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                              {isEn ? 'Device' : 'دیوایس'}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full ${dev.is_online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/40 px-1.5 py-0.2 rounded border border-cyan-800/40">
                              {dev.ip}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate flex items-center gap-1.5">
                            <span>{dev.model}</span>
                            <span>•</span>
                            <span>{dev.role}</span>
                            {dev.building && (
                              <>
                                <span>•</span>
                                <span>{dev.building}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveDeviceFromGroup(dev.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition cursor-pointer shrink-0"
                        title={isEn ? 'Remove device from this group' : 'حذف این دیوایس از گروه'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

              {/* Assigned Remote Servers */}
              {(memberCategoryFilter === 'all' || memberCategoryFilter === 'servers') &&
                assignedServers.map((srv) => {
                  const isChecked = selectedMemberIds.includes(srv.id);
                  return (
                    <div
                      key={`srv-${srv.id}`}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all shadow-xs ${
                        isChecked
                          ? 'bg-indigo-950/40 border-indigo-400/60 ring-1 ring-indigo-400/30'
                          : 'bg-slate-900/60 hover:bg-slate-900/90 border-white/10 hover:border-indigo-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectMember(srv.id)}
                          className="text-slate-400 hover:text-white transition cursor-pointer shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>

                        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shrink-0">
                          {getServerIcon(srv)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white truncate">{srv.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                              {srv.os_type === 'windows' ? 'Windows' : 'Linux'} {isEn ? 'Server' : 'سرور'}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full ${srv.status === 'online' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-950/40 px-1.5 py-0.2 rounded border border-indigo-800/40">
                              {srv.ip}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate flex items-center gap-1.5">
                            <span>{srv.hostname || srv.ip}</span>
                            <span>•</span>
                            <span>{srv.os_distro || srv.os_type}</span>
                            <span>•</span>
                            <span>{srv.category || srv.role || 'Server'}</span>
                          </div>
                          {Array.isArray(srv.tags) && srv.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {srv.tags.slice(0, 3).map((tg) => (
                                <span key={tg} className="text-[8px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                                  #{tg}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveServerFromGroup(srv.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition cursor-pointer shrink-0"
                        title={isEn ? 'Remove server from this group' : 'حذف این سرور از گروه'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Right Column: Available Devices & Servers Palette */}
        <div className="lg:col-span-6 rounded-2xl p-4 bg-white/[0.02] border border-white/10 flex flex-col">
          {/* Header with Search and Role/OS Filters */}
          <div className="space-y-2.5 border-b border-white/10 pb-3 mb-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Network className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Available Equipment & Servers' : 'تجهیزات و سرورهای آماده تخصیص'}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">
                  {availableCategoryFilter === 'devices'
                    ? availableDevices.length
                    : availableCategoryFilter === 'servers'
                    ? availableServers.length
                    : availableDevices.length + availableServers.length}
                </span>
              </h3>

              <div className="flex items-center gap-2">
                {/* Batch Add Button when items are selected */}
                {selectedAvailableIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchAddSelected}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md transition active:scale-95 cursor-pointer animate-pulse"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? `Add (${selectedAvailableIds.length}) to Group` : `افزودن (${selectedAvailableIds.length}) به گروه`}</span>
                  </button>
                )}

                <span className="text-[10px] text-slate-400 hidden sm:inline">
                  {isEn ? 'Drag item or click +' : 'درگ کنید یا + را بزنید'}
                </span>
              </div>
            </div>

            {/* Category Filter Buttons (All / Devices / Servers) */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setAvailableCategoryFilter('all')}
                className={`flex-1 py-1 rounded-lg text-xs font-semibold transition cursor-pointer text-center ${
                  availableCategoryFilter === 'all'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isEn ? 'All' : 'همه موارد'} ({availableDevices.length + availableServers.length})
              </button>
              <button
                type="button"
                onClick={() => setAvailableCategoryFilter('devices')}
                className={`flex-1 py-1 rounded-lg text-xs font-semibold transition cursor-pointer text-center flex items-center justify-center gap-1 ${
                  availableCategoryFilter === 'devices'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>{isEn ? 'Devices' : 'دیوایس‌ها'} ({availableDevices.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setAvailableCategoryFilter('servers')}
                className={`flex-1 py-1 rounded-lg text-xs font-semibold transition cursor-pointer text-center flex items-center justify-center gap-1 ${
                  availableCategoryFilter === 'servers'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>{isEn ? 'Servers' : 'سرورها'} ({availableServers.length})</span>
              </button>
            </div>

            {/* Search & Sub-Filter controls */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Filter by name, IP, model, OS, tag, or role...'
                      : 'جستجو در نام، IP، مدل، سیستم‌عامل، برچسب یا نقش...'
                  }
                  className="w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {availableCategoryFilter === 'devices' && (
                <select
                  value={deviceRoleFilter}
                  onChange={(e) => setDeviceRoleFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">{isEn ? 'All Types' : 'همه دیوایس‌ها'}</option>
                  <option value="switch">{isEn ? 'Switches' : 'سوئیچ‌ها'}</option>
                  <option value="router">{isEn ? 'Routers' : 'روترها'}</option>
                  <option value="access_point">{isEn ? 'Access Points' : 'اکسس‌پوینت‌ها'}</option>
                </select>
              )}

              {availableCategoryFilter === 'servers' && (
                <select
                  value={serverOsFilter}
                  onChange={(e) => setServerOsFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-400"
                >
                  <option value="all">{isEn ? 'All OS' : 'همه سیستم‌عامل‌ها'}</option>
                  <option value="linux">Linux</option>
                  <option value="windows">Windows</option>
                </select>
              )}

              {/* Select All Available Button */}
              {(availableDevices.length > 0 || availableServers.length > 0) && (
                <button
                  type="button"
                  onClick={handleSelectAllAvailable}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition cursor-pointer shrink-0"
                  title={isEn ? 'Select All Available' : 'انتخاب همه آماده‌ها'}
                >
                  {selectedAvailableIds.length > 0 ? (
                    <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{isEn ? 'Select All' : 'انتخاب همه'}</span>
                </button>
              )}
            </div>

            {/* Tag Quick Filter Chips */}
            {allUniqueTags.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-[11px]">
                <span className="text-slate-400 flex items-center gap-1 shrink-0 font-medium">
                  <Tag className="w-3 h-3 text-cyan-400" />
                  <span>{isEn ? 'Tags:' : 'برچسب‌ها:'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedTagFilter('all')}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition cursor-pointer shrink-0 ${
                    selectedTagFilter === 'all'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'All Tags' : 'همه برچسب‌ها'}
                </button>
                {allUniqueTags.map((tg) => (
                  <button
                    key={tg}
                    type="button"
                    onClick={() => setSelectedTagFilter(selectedTagFilter === tg ? 'all' : tg)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition cursor-pointer shrink-0 ${
                      selectedTagFilter === tg
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    #{tg}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Available Items List */}
          {availableDevices.length === 0 && availableServers.length === 0 ? (
            <div className="py-14 flex flex-col items-center justify-center text-center p-4">
              <Check className="w-6 h-6 text-emerald-400 mb-2" />
              <p className="text-xs text-slate-300 font-semibold">
                {isEn ? 'All matching devices and servers are already in this group' : 'تمام تجهیزات و سرورهای مورد نظر در این گروه قرار دارند'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
              {/* Available Network Devices */}
              {(availableCategoryFilter === 'all' || availableCategoryFilter === 'devices') &&
                availableDevices.map((dev) => {
                  const isChecked = selectedAvailableIds.includes(dev.id);
                  return (
                    <div
                      key={`avail-dev-${dev.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, { type: 'device', id: dev.id })}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing shadow-xs group ${
                        isChecked
                          ? 'bg-cyan-950/40 border-cyan-400/60 ring-1 ring-cyan-400/30'
                          : 'bg-slate-900/40 hover:bg-slate-900/80 border-white/10 hover:border-cyan-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectAvailable(dev.id)}
                          className="text-slate-400 hover:text-white transition cursor-pointer shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-cyan-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>

                        <GripVertical className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition shrink-0" />
                        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
                          {getDeviceIcon(dev.type)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white truncate">{dev.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                              {isEn ? 'Device' : 'دیوایس'}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full ${dev.is_online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            <span className="text-[10px] font-mono text-slate-300">
                              {dev.ip}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                            {dev.model} • {dev.role}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddDeviceToGroup(dev.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 transition text-xs font-semibold shrink-0 cursor-pointer"
                        title={isEn ? 'Add device to group' : 'افزودن دیوایس به این گروه'}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Add' : 'افزودن'}</span>
                      </button>
                    </div>
                  );
                })}

              {/* Available Remote Servers */}
              {(availableCategoryFilter === 'all' || availableCategoryFilter === 'servers') &&
                availableServers.map((srv) => {
                  const isChecked = selectedAvailableIds.includes(srv.id);
                  return (
                    <div
                      key={`avail-srv-${srv.id}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, { type: 'server', id: srv.id })}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing shadow-xs group ${
                        isChecked
                          ? 'bg-indigo-950/40 border-indigo-400/60 ring-1 ring-indigo-400/30'
                          : 'bg-slate-900/40 hover:bg-slate-900/80 border-white/10 hover:border-indigo-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectAvailable(srv.id)}
                          className="text-slate-400 hover:text-white transition cursor-pointer shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500" />
                          )}
                        </button>

                        <GripVertical className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition shrink-0" />
                        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shrink-0">
                          {getServerIcon(srv)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-white truncate">{srv.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                              {srv.os_type === 'windows' ? 'Windows' : 'Linux'} {isEn ? 'Server' : 'سرور'}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full ${srv.status === 'online' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                            <span className="text-[10px] font-mono text-slate-300">
                              {srv.ip}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                            {srv.hostname || srv.ip} • {srv.os_distro || srv.os_type} • {srv.category || srv.role || 'Server'}
                          </div>
                          {Array.isArray(srv.tags) && srv.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {srv.tags.slice(0, 3).map((tg) => (
                                <span key={tg} className="text-[8px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                                  #{tg}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddServerToGroup(srv.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 hover:border-indigo-400 transition text-xs font-semibold shrink-0 cursor-pointer"
                        title={isEn ? 'Add server to group' : 'افزودن سرور به این گروه'}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Add' : 'افزودن'}</span>
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
