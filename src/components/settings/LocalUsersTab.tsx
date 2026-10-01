import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Search,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  KeyRound,
  Mail,
  UserCheck,
  FolderTree,
  AlertCircle,
  X,
  Save,
  CheckSquare,
  Square,
  Lock,
  Eye,
  EyeOff,
  UserCog
} from 'lucide-react';
import { LocalUser, LocalGroup } from '../../types';
import { logPortalEvent } from '../../services/auditLogger';
import {
  saveUserToDatabase,
  deleteUserFromDatabase,
  saveLocalGroupsToDatabase,
} from '../../services/settingsStorage';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { UserPickerModal } from './UserPickerModal';

interface LocalUsersTabProps {
  users: LocalUser[];
  onSaveUsers: (users: LocalUser[]) => void;
  groups: LocalGroup[];
  onSaveGroups: (groups: LocalGroup[]) => void;
  isEn?: boolean;
  isLightMode?: boolean;
}

const GROUP_COLORS: { [key: string]: { bg: string; text: string; border: string; name: string } } = {
  indigo: { bg: 'bg-indigo-500/15', text: 'text-indigo-400', border: 'border-indigo-500/30', name: 'Indigo' },
  amber: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', name: 'Amber' },
  cyan: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30', name: 'Cyan' },
  emerald: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', name: 'Emerald' },
  rose: { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30', name: 'Rose' },
  purple: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', name: 'Purple' },
};

export const LocalUsersTab: React.FC<LocalUsersTabProps> = ({
  users,
  onSaveUsers,
  groups,
  onSaveGroups,
  isEn = false,
  isLightMode = false,
}) => {
  const resolvedLightMode = Boolean(
    isLightMode || (typeof document !== 'undefined' && document.documentElement.classList.contains('light'))
  );

  const [activeSection, setActiveSection] = useState<'users' | 'groups'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

  // User Modal State
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<LocalUser> | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userError, setUserError] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isUserMaximized, setIsUserMaximized] = useState(false);

  // Group Modal State
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Partial<LocalGroup> | null>(null);
  const [groupError, setGroupError] = useState('');
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isGroupMaximized, setIsGroupMaximized] = useState(false);

  // Dedicated User Directory Picker State
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [activePickerGroup, setActivePickerGroup] = useState<{
    id: string;
    name: string;
    memberUserIds: string[];
  } | null>(null);

  // Delete Confirm State
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'user' | 'group'; id: string; name: string } | null>(null);

  // Initials generator
  const getInitials = (name?: string, username?: string) => {
    const clean = (name || username || '').trim();
    if (!clean) return 'U';
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase();
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.role && u.role.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' ? true : u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Filtered Groups
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Statistics
  const totalUsers = users.length;
  const activeUsersCount = users.filter((u) => u.status === 'active').length;
  const disabledUsersCount = users.filter((u) => u.status === 'disabled').length;
  const totalGroupsCount = groups.length;

  // Handler: Open User Modal for Create
  const handleOpenCreateUser = () => {
    setEditingUser({
      id: `user-${Date.now()}`,
      username: '',
      fullName: '',
      email: '',
      role: isEn ? 'Network Operator' : 'کارشناس عملیات شبکه',
      status: 'active',
      groupIds: groups.length > 0 ? [groups[0].id] : [],
      isBuiltin: false,
    });
    setPassword('');
    setConfirmPassword('');
    setUserError('');
    setUserModalOpen(true);
  };

  // Handler: Open User Modal for Edit
  const handleOpenEditUser = (user: LocalUser) => {
    setEditingUser({ ...user });
    setPassword('');
    setConfirmPassword('');
    setUserError('');
    setUserModalOpen(true);
  };

  // Handler: Save User
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser?.username?.trim() || !editingUser?.fullName?.trim()) {
      setUserError(isEn ? 'Username and full name are required.' : 'نام کاربری و نام و نام خانوادگی الزامی است.');
      return;
    }

    const usernameTrimmed = editingUser.username.trim().toLowerCase();

    // Check duplicate username (except current user)
    const exists = users.some((u) => u.id !== editingUser.id && u.username.toLowerCase() === usernameTrimmed);
    if (exists) {
      setUserError(isEn ? 'A user with this username already exists.' : 'کاربری با این نام کاربری قبلاً تعریف شده است.');
      return;
    }

    // Password validation if creating new user or updating password
    const isNew = !users.some((u) => u.id === editingUser.id);
    if (isNew && !password) {
      setUserError(isEn ? 'Password is required for new users.' : 'تعیین رمز عبور برای کاربر جدید الزامی است.');
      return;
    }
    if (password && password !== confirmPassword) {
      setUserError(isEn ? 'Passwords do not match.' : 'رمزهای عبور وارد شده همخوانی ندارند.');
      return;
    }

    setIsSavingUser(true);
    setUserError('');

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const updatedUser: LocalUser = {
      id: editingUser.id || `user-${Date.now()}`,
      username: usernameTrimmed,
      fullName: editingUser.fullName.trim(),
      email: editingUser.email?.trim() || `${usernameTrimmed}@nettopology.local`,
      status: editingUser.status || 'active',
      role: editingUser.role || 'Operator',
      groupIds: editingUser.groupIds || [],
      isBuiltin: editingUser.isBuiltin || false,
      createdAt: editingUser.createdAt || nowStr,
      lastLogin: editingUser.lastLogin || (isNew ? '-' : nowStr),
    };

    try {
      const saveRes = await saveUserToDatabase({
        ...updatedUser,
        password: password ? password.trim() : undefined,
      });

      if (!saveRes.success) {
        setUserError(
          saveRes.error ||
            (isEn
              ? 'Failed to persist user in database.'
              : 'ذخیره‌سازی کاربر در پایگاه داده با خطا مواجه شد.')
        );
        setIsSavingUser(false);
        return;
      }

      const savedRecord = saveRes.user || updatedUser;

      let newUsers: LocalUser[];
      if (isNew) {
        newUsers = [...users, savedRecord];
      } else {
        newUsers = users.map((u) => (u.id === savedRecord.id ? savedRecord : u));
      }

      // Keep group member lists synchronized
      const newGroups = groups.map((g) => {
        const isMember = savedRecord.groupIds?.includes(g.id);
        const memberSet = new Set(g.memberUserIds || []);
        if (isMember) {
          memberSet.add(savedRecord.id);
        } else {
          memberSet.delete(savedRecord.id);
        }
        return { ...g, memberUserIds: Array.from(memberSet) };
      });

      onSaveUsers(newUsers);
      onSaveGroups(newGroups);

      // Audit Log user creation / role modification
      try {
        logPortalEvent({
          category: 'user_management',
          action: isNew ? 'USER_CREATED' : 'USER_ROLE_CHANGED',
          title: isNew
            ? `ایجاد کاربر محلی جدید «${savedRecord.username}» (${savedRecord.fullName})`
            : `ویرایش مشخصات و سطح دسترسی کاربر «${savedRecord.username}»`,
          title_en: isNew
            ? `New local user account created: ${savedRecord.username}`
            : `User profile & role updated for ${savedRecord.username}`,
          target: {
            type: 'user',
            id: savedRecord.id,
            name: `${savedRecord.fullName} (${savedRecord.username})`,
            metadata: {
              username: savedRecord.username,
              role: savedRecord.role,
              status: savedRecord.status,
              groupIds: savedRecord.groupIds,
            },
          },
          severity: isNew ? 'info' : 'notice',
          status: 'success',
          details: isNew
            ? `کاربر جدید «${savedRecord.fullName}» با شناسه ${savedRecord.username} و نقش ${savedRecord.role} در دیتابیس ثبت شد.`
            : `مشخصات، نقش یا عضویت گروه کاربر ${savedRecord.username} تغییر یافت.`,
          details_en: isNew
            ? `User ${savedRecord.username} created in database with role ${savedRecord.role}.`
            : `Profile and roles updated for user ${savedRecord.username}.`,
        });
      } catch (err) {
        console.warn('Failed to log user audit event:', err);
      }

      setUserModalOpen(false);
    } catch (err: any) {
      setUserError(
        err?.message ||
          (isEn
            ? 'Connection error to backend authentication service.'
            : 'خطا در ارتباط با سرویس احراز هویت پایگاه داده.')
      );
    } finally {
      setIsSavingUser(false);
    }
  };

  // Handler: Toggle User Status
  const handleToggleUserStatus = (user: LocalUser) => {
    if (user.id === 'admin') {
      alert(isEn ? 'The root administrator account cannot be disabled.' : 'امکان غیرفعال‌سازی کاربر اصلی ادمین وجود ندارد.');
      return;
    }
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    const newUsers = users.map((u) =>
      u.id === user.id ? { ...u, status: newStatus as 'active' | 'disabled' } : u
    );
    onSaveUsers(newUsers);

    try {
      logPortalEvent({
        category: 'user_management',
        action: 'USER_STATUS_TOGGLED',
        title: `تغییر وضعیت فعال/غیرفعال کاربر «${user.username}» به ${newStatus}`,
        title_en: `User ${user.username} status toggled to ${newStatus}`,
        target: {
          type: 'user',
          id: user.id,
          name: `${user.fullName} (${user.username})`,
          metadata: { previousStatus: user.status, newStatus }
        },
        severity: 'warning',
        status: 'success',
        details: `وضعیت حساب کاربری ${user.username} به ${newStatus} تغییر یافت.`,
        details_en: `Account status for ${user.username} was set to ${newStatus}.`,
      });
    } catch (e) {
      // ignore
    }
  };

  // Handler: Delete User
  const handleDeleteUser = (userId: string) => {
    if (userId === 'admin') {
      alert(isEn ? 'The root administrator account cannot be deleted.' : 'امکان حذف کاربر اصلی مدیر سیستم وجود ندارد.');
      return;
    }
    const targetUser = users.find((u) => u.id === userId);
    const newUsers = users.filter((u) => u.id !== userId);
    // Remove from all groups
    const newGroups = groups.map((g) => ({
      ...g,
      memberUserIds: g.memberUserIds.filter((id) => id !== userId),
    }));
    onSaveUsers(newUsers);
    onSaveGroups(newGroups);

    deleteUserFromDatabase(userId).catch((err) => {
      console.warn('Failed to delete user from backend database:', err);
    });

    if (targetUser) {
      try {
        logPortalEvent({
          category: 'user_management',
          action: 'USER_DELETED',
          title: `حذف حساب کاربری «${targetUser.username}» (${targetUser.fullName})`,
          title_en: `Local user account deleted: ${targetUser.username}`,
          target: {
            type: 'user',
            id: targetUser.id,
            name: `${targetUser.fullName} (${targetUser.username})`,
            metadata: { username: targetUser.username, role: targetUser.role }
          },
          severity: 'warning',
          status: 'success',
          details: `کاربر ${targetUser.username} (${targetUser.fullName}) توسط مدیر ارشد از سامانه حذف گردید.`,
          details_en: `User account ${targetUser.username} was permanently removed.`,
        });
      } catch (e) {
        // ignore
      }
    }

    setDeleteConfirm(null);
  };

  // Handler: Open Group Modal for Create
  const handleOpenCreateGroup = () => {
    setEditingGroup({
      id: `group-${Date.now()}`,
      name: '',
      description: '',
      color: 'indigo',
      memberUserIds: [],
      isBuiltin: false,
    });
    setGroupError('');
    setIsGroupMaximized(false);
    setGroupModalOpen(true);
  };

  // Handler: Open Group Modal for Edit
  const handleOpenEditGroup = (group: LocalGroup) => {
    setEditingGroup({
      ...group,
      memberUserIds: [...(group.memberUserIds || [])],
    });
    setGroupError('');
    setIsGroupMaximized(false);
    setGroupModalOpen(true);
  };

  // Handler: Open Direct Directory Picker from Group Card
  const handleOpenDirectPicker = (group: LocalGroup) => {
    setActivePickerGroup({
      id: group.id,
      name: group.name,
      memberUserIds: [...(group.memberUserIds || [])],
    });
    setUserPickerOpen(true);
  };

  // Handler: Direct Update Group Members from Directory Picker
  const handleDirectUpdateGroupMembers = async (groupId: string, newMemberIds: string[]) => {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const updatedGroups = groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            memberUserIds: newMemberIds,
            updatedAt: nowStr,
          }
        : g
    );

    // Synchronize users groupIds
    const updatedUsers = users.map((u) => {
      const shouldBeInGroup = newMemberIds.includes(u.id);
      const userGroups = new Set(u.groupIds || []);
      if (shouldBeInGroup) {
        userGroups.add(groupId);
      } else {
        userGroups.delete(groupId);
      }
      return { ...u, groupIds: Array.from(userGroups) };
    });

    onSaveGroups(updatedGroups);
    onSaveUsers(updatedUsers);

    // Persist directly to backend database
    try {
      await saveLocalGroupsToDatabase(updatedGroups);
      const targetGroup = groups.find((g) => g.id === groupId);
      logPortalEvent({
        category: 'user_management',
        action: 'USER_GROUP_UPDATED',
        title: `بروزرسانی اعضای گروه کاربری «${targetGroup?.name || groupId}» (${newMemberIds.length} عضو)`,
        title_en: `Updated members for group "${targetGroup?.name || groupId}" (${newMemberIds.length} members)`,
        target: {
          type: 'group',
          id: groupId,
          name: targetGroup?.name || groupId,
          metadata: { memberCount: newMemberIds.length, memberUserIds: newMemberIds },
        },
        severity: 'info',
        status: 'success',
        details: `تعداد ${newMemberIds.length} کاربر به عنوان اعضای گروه «${targetGroup?.name || groupId}» در پایگاه داده ذخیره شدند.`,
        details_en: `${newMemberIds.length} users assigned as members of group "${targetGroup?.name || groupId}" and persisted to database.`,
      });
    } catch (err) {
      console.warn('Failed to persist group members to backend database:', err);
    }

    setActivePickerGroup(null);
  };

  // Handler: Save Group with Database Persistence
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup?.name?.trim()) {
      setGroupError(isEn ? 'Group name is required.' : 'نام گروه الزامی است.');
      return;
    }

    const isNew = !groups.some((g) => g.id === editingGroup.id);
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const updatedGroup: LocalGroup = {
      id: editingGroup.id || `group-${Date.now()}`,
      name: editingGroup.name.trim(),
      description: editingGroup.description?.trim() || '',
      color: editingGroup.color || 'indigo',
      memberUserIds: editingGroup.memberUserIds || [],
      isBuiltin: editingGroup.isBuiltin || false,
      createdAt: editingGroup.createdAt || nowStr,
      updatedAt: nowStr,
    };

    let newGroups: LocalGroup[];
    if (isNew) {
      newGroups = [...groups, updatedGroup];
    } else {
      newGroups = groups.map((g) => (g.id === updatedGroup.id ? updatedGroup : g));
    }

    // Synchronize users groupIds
    const newUsers = users.map((u) => {
      const shouldBeInGroup = updatedGroup.memberUserIds.includes(u.id);
      const userGroups = new Set(u.groupIds || []);
      if (shouldBeInGroup) {
        userGroups.add(updatedGroup.id);
      } else {
        userGroups.delete(updatedGroup.id);
      }
      return { ...u, groupIds: Array.from(userGroups) };
    });

    setIsSavingGroup(true);
    setGroupError('');

    try {
      // 1. Persist directly to backend database
      const saveRes = await saveLocalGroupsToDatabase(newGroups);
      if (!saveRes.success) {
        setGroupError(
          saveRes.error ||
            (isEn
              ? 'Failed to persist group in database.'
              : 'ذخیره‌سازی گروه در پایگاه داده با خطا مواجه شد.')
        );
        setIsSavingGroup(false);
        return;
      }

      // 2. Synchronize frontend application states
      onSaveGroups(newGroups);
      onSaveUsers(newUsers);

      // 3. Log portal audit event
      try {
        logPortalEvent({
          category: 'user_management',
          action: isNew ? 'USER_GROUP_CREATED' : 'USER_GROUP_UPDATED',
          title: isNew
            ? `ایجاد گروه کاربری محلی جدید «${updatedGroup.name}» با ${updatedGroup.memberUserIds.length} عضو`
            : `ویرایش مشخصات و اعضای گروه کاربری «${updatedGroup.name}» (${updatedGroup.memberUserIds.length} عضو)`,
          title_en: isNew
            ? `Local security group created: ${updatedGroup.name} (${updatedGroup.memberUserIds.length} members)`
            : `Security group updated: ${updatedGroup.name} (${updatedGroup.memberUserIds.length} members)`,
          target: {
            type: 'group',
            id: updatedGroup.id,
            name: updatedGroup.name,
            metadata: {
              memberCount: updatedGroup.memberUserIds.length,
              color: updatedGroup.color,
              memberUserIds: updatedGroup.memberUserIds,
            },
          },
          severity: isNew ? 'info' : 'notice',
          status: 'success',
          details: `گروه کاربری «${updatedGroup.name}» با موفقیت در پایگاه داده سامانه ذخیره و اعضای آن همگام‌سازی شدند.`,
          details_en: `Security group "${updatedGroup.name}" persisted to database with synchronized memberships.`,
        });
      } catch (err) {
        console.warn('Failed to log group audit event:', err);
      }

      setGroupModalOpen(false);
    } catch (err: any) {
      setGroupError(
        err?.message ||
          (isEn
            ? 'Connection error while persisting group.'
            : 'خطا در برقراری ارتباط با پایگاه داده جهت ذخیره گروه.')
      );
    } finally {
      setIsSavingGroup(false);
    }
  };

  // Handler: Delete Group with Database Persistence
  const handleDeleteGroup = async (groupId: string) => {
    const grp = groups.find((g) => g.id === groupId);
    if (grp?.isBuiltin) {
      alert(isEn ? 'Built-in system groups cannot be deleted.' : 'گروه‌های پیش‌فرض و سیستمی قابل حذف نیستند.');
      return;
    }
    const newGroups = groups.filter((g) => g.id !== groupId);
    // Remove groupId from all users
    const newUsers = users.map((u) => ({
      ...u,
      groupIds: u.groupIds?.filter((gid) => gid !== groupId) || [],
    }));

    await saveLocalGroupsToDatabase(newGroups).catch(() => {});
    onSaveGroups(newGroups);
    onSaveUsers(newUsers);

    try {
      logPortalEvent({
        category: 'user_management',
        action: 'USER_GROUP_DELETED',
        title: `حذف گروه کاربری محلی «${grp?.name || groupId}»`,
        title_en: `Deleted security group "${grp?.name || groupId}"`,
        target: { type: 'group', id: groupId, name: grp?.name || groupId },
        severity: 'warning',
        status: 'success',
        details: `گروه «${grp?.name || groupId}» از پایگاه داده سامانه حذف گردید.`,
        details_en: `Group "${grp?.name || groupId}" permanently deleted from database.`,
      });
    } catch (e) {}

    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-5">
      {/* Header & Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-white/10 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isEn ? 'Local Identity & Account Management' : 'مدیریت کاربران و گروه‌های محلی'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEn
                  ? 'Define local accounts and security groups for role-based network administration.'
                  : 'تعریف و مدیریت حساب‌های کاربری و گروه‌های محلی جهت اعمال اختیارات و کنترل دسترسی'}
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tabs: Users vs Groups */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-white/10 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSection('users')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSection === 'users'
                ? 'bg-cyan-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{isEn ? 'Local Users' : 'کاربران محلی'}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/25 font-mono">
              {users.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('groups')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeSection === 'groups'
                ? 'bg-indigo-500 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>{isEn ? 'Local Groups' : 'گروه‌های کاربری'}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-black/25 font-mono">
              {groups.length}
            </span>
          </button>
        </div>
      </div>

      {/* Stats Summary Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Total Local Users' : 'کل کاربران محلی'}</div>
            <div className="text-lg font-bold text-white font-mono">{totalUsers}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Active Accounts' : 'حساب‌های فعال'}</div>
            <div className="text-lg font-bold text-emerald-400 font-mono">{activeUsersCount}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Disabled / Inactive' : 'غیرفعال / مسدود'}</div>
            <div className="text-lg font-bold text-rose-400 font-mono">{disabledUsersCount}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/10 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400">{isEn ? 'Local Groups' : 'گروه‌های امنیتی'}</div>
            <div className="text-lg font-bold text-purple-300 font-mono">{totalGroupsCount}</div>
          </div>
        </div>
      </div>

      {/* Action Bar (Search, Filters, Create Button) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 rtl:right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeSection === 'users'
                  ? isEn
                    ? 'Search users by name, username, or role...'
                    : 'جستجوی کاربر بر اساس نام، نام کاربری یا نقش...'
                  : isEn
                  ? 'Search groups by name or description...'
                  : 'جستجوی گروه بر اساس نام یا شرح...'
              }
              className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {activeSection === 'users' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-slate-300 focus:outline-none focus:border-cyan-400 shrink-0"
            >
              <option value="all">{isEn ? 'All Status' : 'همه وضعیت‌ها'}</option>
              <option value="active">{isEn ? 'Active Only' : 'فقط فعال'}</option>
              <option value="disabled">{isEn ? 'Disabled Only' : 'فقط غیرفعال'}</option>
            </select>
          )}
        </div>

        <div className="w-full sm:w-auto flex justify-end">
          {activeSection === 'users' ? (
            <button
              type="button"
              onClick={handleOpenCreateUser}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer w-full sm:w-auto justify-center"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isEn ? 'Add Local User' : 'تعریف کاربر محلی جدید'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenCreateGroup}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition cursor-pointer w-full sm:w-auto justify-center"
            >
              <FolderTree className="w-4 h-4" />
              <span>{isEn ? 'Create Local Group' : 'ساخت گروه کاربری جدید'}</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: USERS LIST */}
      {activeSection === 'users' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full p-8 text-center rounded-2xl bg-slate-900/40 border border-white/10 text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
              <p className="text-xs">{isEn ? 'No users found matching your search.' : 'هیچ کاربری با این مشخصات یافت نشد.'}</p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const userGroupsList = groups.filter((g) => user.groupIds?.includes(g.id));
              const isActive = user.status === 'active';

              return (
                <div
                  key={user.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                    isActive
                      ? 'bg-slate-900/70 border-white/10 hover:border-cyan-500/40'
                      : 'bg-slate-900/40 border-rose-500/20 opacity-75'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Card Top: Avatar, Name & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm border ${
                            isActive
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-sm text-white">{user.fullName}</h3>
                            {user.isBuiltin && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                {isEn ? 'Builtin' : 'سیستمی'}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-cyan-400/80 font-mono">@{user.username}</p>
                        </div>
                      </div>

                      {/* Status Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(user)}
                        title={isActive ? (isEn ? 'Click to disable' : 'کلیک برای غیرفعال‌سازی') : (isEn ? 'Click to enable' : 'کلیک برای فعال‌سازی')}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition cursor-pointer ${
                          isActive
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                            : 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                        }`}
                      >
                        {isActive ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>{isEn ? 'Active' : 'فعال'}</span>
                          </>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            <span>{isEn ? 'Disabled' : 'مسدود'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Metadata: Role & Email */}
                    <div className="space-y-1.5 pt-1 text-xs text-slate-300 border-t border-white/5">
                      <div className="flex items-center gap-2 text-slate-400">
                        <UserCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate">{user.role || (isEn ? 'Operator' : 'کارشناس')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate font-mono text-[11px]">{user.email}</span>
                      </div>
                    </div>

                    {/* Assigned Groups */}
                    <div className="pt-2">
                      <div className="text-[10px] text-slate-400 mb-1.5 font-medium">
                        {isEn ? 'Assigned Groups:' : 'عضویت در گروه‌ها:'}
                      </div>
                      <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                        {userGroupsList.length === 0 ? (
                          <span className="text-[11px] text-slate-500 italic">
                            {isEn ? 'No groups assigned' : 'بدون عضویت گروهی'}
                          </span>
                        ) : (
                          userGroupsList.map((g) => {
                            const c = GROUP_COLORS[g.color] || GROUP_COLORS.indigo;
                            return (
                              <span
                                key={g.id}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${c.bg} ${c.text} ${c.border}`}
                              >
                                {g.name}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10 text-xs">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {isEn ? 'Last:' : 'آخرین ورود:'} {user.lastLogin || '-'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditUser(user)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                        title={isEn ? 'Edit user' : 'ویرایش کاربر'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {!user.isBuiltin && user.id !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm({ type: 'user', id: user.id, name: user.fullName })}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                          title={isEn ? 'Delete user' : 'حذف کاربر'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SECTION 2: GROUPS LIST */}
      {activeSection === 'groups' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredGroups.length === 0 ? (
            <div className="col-span-full p-8 text-center rounded-2xl bg-slate-900/40 border border-white/10 text-slate-400">
              <FolderTree className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
              <p className="text-xs">{isEn ? 'No groups found.' : 'هیچ گروه کاربری یافت نشد.'}</p>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const c = GROUP_COLORS[group.color] || GROUP_COLORS.indigo;
              const members = users.filter((u) => group.memberUserIds?.includes(u.id));

              return (
                <div
                  key={group.id}
                  className="p-4 rounded-2xl bg-slate-900/70 border border-white/10 hover:border-indigo-500/40 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-2.5 rounded-xl border ${c.bg} ${c.text} ${c.border}`}>
                          <FolderTree className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-sm text-white">{group.name}</h3>
                            {group.isBuiltin && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                {isEn ? 'Builtin' : 'پیش‌فرض'}
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] font-semibold ${c.text}`}>{c.name}</span>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-slate-300 font-mono">
                        {group.memberUserIds.length} {isEn ? 'members' : 'عضو'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px]">
                      {group.description || (isEn ? 'No description provided.' : 'توضیحاتی برای این گروه ثبت نشده است.')}
                    </p>

                    {/* Members Avatars / Tags */}
                    <div className="pt-2 border-t border-white/5">
                      <div className="text-[10px] text-slate-400 mb-1.5 font-medium">
                        {isEn ? 'Assigned Local Members:' : 'کاربران محلی عضو:'}
                      </div>
                      <div className="flex flex-wrap gap-1.5 min-h-[26px]">
                        {members.length === 0 ? (
                          <span className="text-[11px] text-slate-500 italic">
                            {isEn ? 'No members assigned' : 'هنوز عضوی تخصیص داده نشده'}
                          </span>
                        ) : (
                          members.map((m) => (
                            <span
                              key={m.id}
                              className="px-2 py-0.5 rounded-lg text-[10px] bg-slate-800 border border-white/10 text-slate-300 font-medium"
                            >
                              {m.fullName}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10 text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {isEn ? 'Created:' : 'ایجاد:'} {group.createdAt?.substring(0, 10) || '-'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenDirectPicker(group)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition cursor-pointer"
                        title={isEn ? 'Assign or manage group members' : 'تخصیص و مدیریت اعضای گروه'}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Members' : 'مدیریت اعضا'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditGroup(group)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                        title={isEn ? 'Edit group' : 'ویرایش گروه'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {!group.isBuiltin && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm({ type: 'group', id: group.id, name: group.name })}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                          title={isEn ? 'Delete group' : 'حذف گروه'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL: CREATE / EDIT LOCAL USER */}
      {userModalOpen && editingUser && (
        <div
          className={`fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center transition-all duration-200 ${
            isUserMaximized ? 'p-0' : 'p-3 sm:p-4 bg-black/70 backdrop-blur-sm'
          }`}
        >
          <div
            className={`transition-all duration-200 bg-slate-900 border border-white/15 p-5 shadow-2xl space-y-4 overflow-y-auto custom-scrollbar ${
              isUserMaximized
                ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
                : 'w-full max-w-lg rounded-2xl max-h-[90vh]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    {users.some((u) => u.id === editingUser.id)
                      ? isEn
                        ? 'Edit Local User'
                        : 'ویرایش حساب کاربر محلی'
                      : isEn
                      ? 'Create New Local User'
                      : 'تعریف حساب کاربر محلی جدید'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Local credentials can be mapped to RBAC access policies.'
                      : 'این حساب در صورت ورود، اختیارات تعریف‌شده در پالیسی‌ها را دریافت خواهد کرد.'}
                  </p>
                </div>
              </div>
              <ModalHeaderControls
                onClose={() => setUserModalOpen(false)}
                onMinimize={() => setUserModalOpen(false)}
                onMaximizeToggle={() => setIsUserMaximized(!isUserMaximized)}
                isMaximized={isUserMaximized}
                isLightMode={resolvedLightMode}
                isEn={isEn}
              />
            </div>

            {userError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{userError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    {isEn ? 'Username (Login ID) *' : 'نام کاربری (جهت لاگین) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editingUser.username || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                    placeholder="e.g. netops_user"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    {isEn ? 'Full Name *' : 'نام و نام خانوادگی *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editingUser.fullName || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
                    placeholder="e.g. احمد رضایی"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    {isEn ? 'Email Address' : 'آدرس ایمیل'}
                  </label>
                  <input
                    type="email"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    placeholder="user@corp.internal"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    {isEn ? 'Role / Department Title' : 'سمت سازمانی / نقش'}
                  </label>
                  <input
                    type="text"
                    value={editingUser.role || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    placeholder="e.g. Helpdesk Specialist"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/15 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Password Fields */}
              <div className="p-3 rounded-xl bg-slate-800/80 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {users.some((u) => u.id === editingUser.id)
                        ? isEn
                          ? 'Set New Password (leave blank to keep current)'
                          : 'تنظیم رمز عبور جدید (در صورت عدم تغییر خالی بگذارید)'
                        : isEn
                        ? 'Set Account Password *'
                        : 'رمز عبور حساب کاربری *'}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showPassword ? (isEn ? 'Hide' : 'مخفی') : (isEn ? 'Show' : 'نمایش')}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isEn ? 'Password...' : 'رمز عبور...'}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={isEn ? 'Confirm password...' : 'تکرار رمز عبور...'}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Group Assignment */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-300">
                  {isEn ? 'Assign to Local Groups:' : 'عضویت در گروه‌های کاربری محلی:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto custom-scrollbar p-1">
                  {groups.map((grp) => {
                    const checked = editingUser.groupIds?.includes(grp.id) || false;
                    return (
                      <button
                        key={grp.id}
                        type="button"
                        onClick={() => {
                          const current = editingUser.groupIds || [];
                          const next = checked ? current.filter((id) => id !== grp.id) : [...current, grp.id];
                          setEditingUser({ ...editingUser, groupIds: next });
                        }}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-xs text-right cursor-pointer transition ${
                          checked
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                            : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span className="truncate">{grp.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Radio */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-white/10">
                <span className="text-xs text-slate-300 font-semibold">{isEn ? 'Account Status:' : 'وضعیت حساب کاربری:'}</span>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-emerald-300">
                    <input
                      type="radio"
                      name="status"
                      checked={editingUser.status === 'active'}
                      onChange={() => setEditingUser({ ...editingUser, status: 'active' })}
                      className="accent-emerald-400"
                    />
                    <span>{isEn ? 'Active' : 'فعال'}</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-rose-300">
                    <input
                      type="radio"
                      name="status"
                      checked={editingUser.status === 'disabled'}
                      onChange={() => setEditingUser({ ...editingUser, status: 'disabled' })}
                      className="accent-rose-400"
                    />
                    <span>{isEn ? 'Disabled' : 'غیرفعال / مسدود'}</span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs transition cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
                >
                  <Save className={`w-4 h-4 ${isSavingUser ? 'animate-spin' : ''}`} />
                  <span>
                    {isSavingUser
                      ? isEn
                        ? 'Saving in DB...'
                        : 'در حال ذخیره‌سازی...'
                      : isEn
                      ? 'Save User Account'
                      : 'ذخیره مشخصات کاربر'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT LOCAL GROUP */}
      {groupModalOpen && editingGroup && (
        <div
          className={`fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center transition-all duration-200 ${
            isGroupMaximized ? 'p-0' : 'p-3 sm:p-4 bg-black/75 backdrop-blur-sm'
          }`}
        >
          <div
            className={`transition-all duration-200 overflow-hidden shadow-2xl flex flex-col ${
              isGroupMaximized
                ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
                : 'w-full max-w-2xl max-h-[88vh] rounded-2xl border'
            } ${
              resolvedLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-slate-300/40'
                : 'bg-slate-950 border-slate-800 text-white shadow-black/80'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
                resolvedLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {groups.some((g) => g.id === editingGroup.id)
                      ? isEn
                        ? 'Edit Local Group'
                        : 'ویرایش گروه کاربری محلی'
                      : isEn
                      ? 'Create New Local Group'
                      : 'ساخت گروه کاربری محلی جدید'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Local security groups are mapped to RBAC policies and persistent access rules.'
                      : 'می‌توانید به کل اعضای این گروه در بخش پالیسی‌ها، سطح دسترسی مشترک دهید.'}
                  </p>
                </div>
              </div>
              <ModalHeaderControls
                onClose={() => setGroupModalOpen(false)}
                onMinimize={() => setGroupModalOpen(false)}
                onMaximizeToggle={() => setIsGroupMaximized(!isGroupMaximized)}
                isMaximized={isGroupMaximized}
                isLightMode={resolvedLightMode}
                isEn={isEn}
              />
            </div>

            {/* Error Banner */}
            {groupError && (
              <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{groupError}</span>
              </div>
            )}

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveGroup} className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              {/* Group Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    {isEn ? 'Group Name *' : 'نام گروه کاربری *'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Group Name' : 'نام گروه کاربری'}
                    infoWhatEn="Unique identifier and display title for this local security group."
                    infoWhatFa="عنوان نمایشی و شناسه یکتای گروه امنیتی محلی."
                    infoWhyEn="Identifies the group across role simulations, RBAC policies, and audit logs."
                    infoWhyFa="شناسایی گروه در شبیه‌سازی نقش‌ها، پالیسی‌های دسترسی و ثبت وقایع ممیزی."
                    infoExampleEn="e.g. NOC Tier-2 Operators or Core DC Admins"
                    infoExampleFa="مثال: کارشناسان عملیات لایه ۲ یا مدیران دیتاسنتر"
                    isEn={isEn}
                    isLightMode={resolvedLightMode}
                  />
                </div>
                <input
                  type="text"
                  required
                  value={editingGroup.name || ''}
                  onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                  placeholder={isEn ? 'e.g. NOC Tier-2 Operators' : 'مثال: کارشناسان عملیات شبکه'}
                  className={`w-full px-3 py-2 rounded-xl text-xs transition focus:outline-none ${
                    resolvedLightMode
                      ? 'bg-white border border-slate-300 text-slate-900 focus:border-indigo-500'
                      : 'bg-slate-900 border border-white/15 text-white focus:border-indigo-400'
                  }`}
                />
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-300">
                    {isEn ? 'Description & Scope' : 'توضیحات و شرح وظایف گروه'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Group Description' : 'شرح وظایف گروه'}
                    infoWhatEn="Detailed scope of responsibilities and permissions associated with this group."
                    infoWhatFa="شرح اختیارات، مسئولیت‌ها و حوزه عملیاتی کاربران عضو این گروه."
                    infoWhyEn="Provides clarity for system audits and role separation."
                    infoWhyFa="شفاف‌سازی برای ممیزی سامانه و تفکیک مسئولیت‌های راهبری."
                    infoExampleEn="Handles 24/7 network monitoring, incident triage, and port diagnostics."
                    infoExampleFa="پایش ۲۴ ساعته لینک‌ها، تریاژ حوادث و خطایابی پورت‌ها."
                    isEn={isEn}
                    isLightMode={resolvedLightMode}
                  />
                </div>
                <textarea
                  rows={2}
                  value={editingGroup.description || ''}
                  onChange={(e) => setEditingGroup({ ...editingGroup, description: e.target.value })}
                  placeholder={isEn ? 'Describe scope of this group...' : 'شرح دامنه اختیارات یا افراد این گروه...'}
                  className={`w-full px-3 py-2 rounded-xl text-xs transition resize-none focus:outline-none ${
                    resolvedLightMode
                      ? 'bg-white border border-slate-300 text-slate-900 focus:border-indigo-500'
                      : 'bg-slate-900 border border-white/15 text-white focus:border-indigo-400'
                  }`}
                />
              </div>

              {/* Badge Color Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-slate-300">
                    {isEn ? 'Badge Color Tag' : 'رنگ و شناسه ظاهری گروه'}
                  </label>
                  <FieldInfoTooltip
                    title={isEn ? 'Badge Color' : 'رنگ نمادین گروه'}
                    infoWhatEn="Color accent used to tag members and policies of this group."
                    infoWhatFa="رنگ اختصاصی جهت نمایش نمادین اعضا و پالیسی‌های این گروه."
                    infoWhyEn="Enables instant visual grouping in maps, telemetry, and lists."
                    infoWhyFa="تشخیص بصری فوری در نقشه‌ها، لاگ‌ها و جدول کاربران."
                    infoExampleEn="Amber for Security Auditors, Cyan for NOC"
                    infoExampleFa="کهربایی برای ممیزان امنیتی، فیروزه‌ای برای تیم NOC"
                    isEn={isEn}
                    isLightMode={resolvedLightMode}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(GROUP_COLORS).map(([colorKey, style]) => {
                    const selected = editingGroup.color === colorKey;
                    return (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => setEditingGroup({ ...editingGroup, color: colorKey })}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${style.bg} ${style.text} ${
                          selected ? 'ring-2 ring-white border-white scale-105' : style.border
                        }`}
                      >
                        {style.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Enhanced Member Selection & Directory Browser */}
              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <span>{isEn ? 'Group Members:' : 'اعضای گروه:'}</span>
                    </label>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {editingGroup.memberUserIds?.length || 0} {isEn ? 'users assigned' : 'کاربر منتسب'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Dedicated Open Directory Picker Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setActivePickerGroup(null);
                        setUserPickerOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Select Users from List...' : 'انتخاب کاربران از فهرست...'}</span>
                    </button>

                    {(editingGroup.memberUserIds?.length || 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setEditingGroup({ ...editingGroup, memberUserIds: [] })}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-xs font-medium transition cursor-pointer"
                        title={isEn ? 'Clear all assigned members' : 'حذف همه اعضای انتخابی'}
                      >
                        {isEn ? 'Clear All' : 'پاکسازی همه'}
                      </button>
                    )}

                    <FieldInfoTooltip
                      title={isEn ? 'Group Members Directory' : 'فهرست اعضای گروه'}
                      infoWhatEn="Local user accounts associated with this group. Inherits group policies."
                      infoWhatFa="کاربران محلی منتسب به این گروه که پالیسی‌ها را به ارث می‌برند."
                      infoWhyEn="Using the directory picker allows fast searching across hundreds of users and filtering by roles."
                      infoWhyFa="استفاده از کاوشگر فهرست امکان جستجو میان صدها کاربر و فیلتر نقش را به سادگی میسر می‌سازد."
                      infoExampleEn="Click 'Select Users from List' to pick multiple operators at once."
                      infoExampleFa="با زدن دکمه 'انتخاب کاربران از فهرست'، چند کاربر را همزمان جستجو و اضافه کنید."
                      isEn={isEn}
                      isLightMode={resolvedLightMode}
                    />
                  </div>
                </div>

                {/* Selected Members Chips Roster / Empty State */}
                {(!editingGroup.memberUserIds || editingGroup.memberUserIds.length === 0) ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActivePickerGroup(null);
                      setUserPickerOpen(true);
                    }}
                    className={`p-6 rounded-2xl border-2 border-dashed text-center space-y-2 cursor-pointer transition ${
                      resolvedLightMode
                        ? 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40'
                        : 'border-white/10 hover:border-indigo-500/50 hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 w-fit mx-auto">
                      <Users className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-semibold text-slate-300">
                      {isEn
                        ? 'No users assigned to this group yet.'
                        : 'هنوز کاربری به این گروه تخصیص داده نشده است.'}
                    </p>
                    <p className="text-[11px] text-indigo-400">
                      {isEn
                        ? '+ Click here to open user directory and assign members'
                        : '+ جهت باز کردن فهرست کاربران و انتخاب اعضا اینجا کلیک کنید'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                    {users
                      .filter((u) => editingGroup.memberUserIds?.includes(u.id))
                      .map((usr) => (
                        <div
                          key={usr.id}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs transition ${
                            resolvedLightMode
                              ? 'bg-white border-slate-200 hover:border-indigo-300'
                              : 'bg-slate-900/80 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-[10px] font-mono flex items-center justify-center shrink-0">
                              {getInitials(usr.fullName, usr.username)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold truncate text-[11px]">
                                {usr.fullName || usr.username}
                              </div>
                              <div className="text-[10px] text-cyan-400 font-mono truncate">
                                @{usr.username}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {usr.role && (
                              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[9px] bg-white/5 text-slate-400 font-medium truncate max-w-[80px]">
                                {usr.role}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const next = (editingGroup.memberUserIds || []).filter((id) => id !== usr.id);
                                setEditingGroup({ ...editingGroup, memberUserIds: next });
                              }}
                              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                              title={isEn ? 'Remove user from group' : 'حذف کاربر از گروه'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div
                className={`flex items-center justify-between gap-3 pt-3 border-t shrink-0 ${
                  resolvedLightMode ? 'border-slate-200' : 'border-white/10'
                }`}
              >
                <span className="text-[11px] text-slate-400 font-mono">
                  {editingGroup.memberUserIds?.length || 0} {isEn ? 'members will be saved' : 'عضو ذخیره خواهند شد'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupModalOpen(false)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      resolvedLightMode
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingGroup}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 transition cursor-pointer disabled:opacity-50"
                  >
                    <Save className={`w-4 h-4 ${isSavingGroup ? 'animate-spin' : ''}`} />
                    <span>
                      {isSavingGroup
                        ? isEn
                          ? 'Saving to DB...'
                          : 'در حال ذخیره در دیتابیس...'
                        : isEn
                        ? 'Save Group'
                        : 'ذخیره گروه کاربری'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADVANCED USER DIRECTORY PICKER */}
      <UserPickerModal
        isOpen={userPickerOpen}
        onClose={() => {
          setUserPickerOpen(false);
          setActivePickerGroup(null);
        }}
        groupName={activePickerGroup ? activePickerGroup.name : (editingGroup?.name || '')}
        groupColor={editingGroup?.color || 'indigo'}
        allUsers={users}
        selectedUserIds={
          activePickerGroup
            ? activePickerGroup.memberUserIds
            : (editingGroup?.memberUserIds || [])
        }
        onConfirmSelection={async (selectedIds) => {
          if (editingGroup) {
            setEditingGroup({ ...editingGroup, memberUserIds: selectedIds });
          }
          if (activePickerGroup) {
            await handleDirectUpdateGroupMembers(activePickerGroup.id, selectedIds);
          }
        }}
        isEn={isEn}
        isLightMode={resolvedLightMode}
      />

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteConfirm && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-rose-500/30 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm text-white">
                {isEn ? 'Confirm Deletion' : 'تایید حذف مورد'}
              </h3>
            </div>

            <p className="text-xs text-slate-300">
              {deleteConfirm.type === 'user'
                ? isEn
                  ? `Are you sure you want to permanently delete user "${deleteConfirm.name}"?`
                  : `آیا از حذف کاربر محلی "${deleteConfirm.name}" اطمینان دارید؟`
                : isEn
                ? `Are you sure you want to delete group "${deleteConfirm.name}"? Users will be unlinked.`
                : `آیا از حذف گروه "${deleteConfirm.name}" مطمئن هستید؟ اعضا از این گروه خارج خواهند شد.`}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirm.type === 'user') {
                    handleDeleteUser(deleteConfirm.id);
                  } else {
                    handleDeleteGroup(deleteConfirm.id);
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                {isEn ? 'Delete Permanently' : 'حذف نهایی'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
