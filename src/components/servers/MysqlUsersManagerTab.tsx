import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Key,
  Lock,
  Unlock,
  Clock,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Server,
  Globe,
  Sliders,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  Maximize2,
  Minimize2,
  Minus,
  X,
  Database,
} from 'lucide-react';
import {
  RemoteServer,
  MysqlUserItem,
  MysqlUserCreateRequest,
  MysqlUserUpdateRequest,
  MysqlUserPasswordChangeRequest,
  MysqlUserLockRequest,
  MysqlUserExpirePasswordRequest,
  MysqlUserDropRequest,
} from '../../types';
import {
  fetchRemoteServerMysqlUsers,
  createRemoteServerMysqlUser,
  updateRemoteServerMysqlUser,
  changeRemoteServerMysqlUserPassword,
  lockRemoteServerMysqlUser,
  setRemoteServerMysqlUserExpiration,
  dropRemoteServerMysqlUser,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface MysqlUsersManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  onRefreshOverview?: () => void;
  onManagePrivileges?: (user: string, host: string) => void;
}

export const MysqlUsersManagerTab: React.FC<MysqlUsersManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  onRefreshOverview,
  onManagePrivileges,
}) => {
  const [users, setUsers] = useState<MysqlUserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'active' | 'locked' | 'superusers'>('all');
  const [selectedUser, setSelectedUser] = useState<MysqlUserItem | null>(null);

  // Modal Open States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isExpireModalOpen, setIsExpireModalOpen] = useState(false);
  const [isDropModalOpen, setIsDropModalOpen] = useState(false);

  // Submitting & Feedback Alert
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    messageFa: string;
  } | null>(null);

  // --- Create User Form States ---
  const [newUsername, setNewUsername] = useState('');
  const [newHost, setNewHost] = useState('%');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPlugin, setNewPlugin] = useState<'caching_sha2_password' | 'mysql_native_password' | 'sha256_password'>('caching_sha2_password');
  const [newAccountLocked, setNewAccountLocked] = useState(false);
  const [newExpirePolicy, setNewExpirePolicy] = useState<'default' | 'never' | 'immediate' | 'interval'>('default');
  const [newExpireDays, setNewExpireDays] = useState<number>(90);
  const [newMaxQuestions, setNewMaxQuestions] = useState<number>(0);
  const [newMaxUpdates, setNewMaxUpdates] = useState<number>(0);
  const [newMaxConnections, setNewMaxConnections] = useState<number>(0);
  const [newMaxUserConnections, setNewMaxUserConnections] = useState<number>(0);
  const [newSslType, setNewSslType] = useState<'NONE' | 'SSL' | 'X509'>('NONE');
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);

  // --- Edit User Form States ---
  const [editAccountLocked, setEditAccountLocked] = useState(false);
  const [editExpirePolicy, setEditExpirePolicy] = useState<'default' | 'never' | 'immediate' | 'interval'>('default');
  const [editExpireDays, setEditExpireDays] = useState<number>(90);
  const [editMaxQuestions, setEditMaxQuestions] = useState<number>(0);
  const [editMaxUpdates, setEditMaxUpdates] = useState<number>(0);
  const [editMaxConnections, setEditMaxConnections] = useState<number>(0);
  const [editMaxUserConnections, setEditMaxUserConnections] = useState<number>(0);
  const [editSslType, setEditSslType] = useState<'NONE' | 'SSL' | 'X509'>('NONE');

  // --- Change Password Form States ---
  const [changePasswordVal, setChangePasswordVal] = useState('');
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changePasswordPlugin, setChangePasswordPlugin] = useState<string>('');

  // --- Expire Password Form States ---
  const [expirePolicyVal, setExpirePolicyVal] = useState<'immediate' | 'never' | 'default' | 'interval'>('immediate');
  const [expireDaysVal, setExpireDaysVal] = useState<number>(90);

  // --- Drop User Confirmation ---
  const [dropConfirmInput, setDropConfirmInput] = useState('');

  // Modal Fullscreen / Maximize states for dialogs
  const [isModalMaximized, setIsModalMaximized] = useState(false);

  // Load Users from Remote MySQL Server
  const loadUsers = useCallback(async () => {
    if (!server?.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchRemoteServerMysqlUsers(server.id);
      if (res.success && res.users) {
        setUsers(res.users);
        if (selectedUser) {
          const updated = res.users.find((u) => u.user === selectedUser.user && u.host === selectedUser.host);
          if (updated) setSelectedUser(updated);
        }
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to fetch MySQL users.',
          messageFa: res.errorFa || 'خطا در واکشی لیست کاربران MySQL.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error fetching MySQL users.',
        messageFa: 'خطای شبکه در برقراری ارتباط با سرویس MySQL سرور.',
      });
    } finally {
      setLoading(false);
    }
  }, [server?.id, selectedUser]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Generate random strong password
  const generateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+=-';
    let pass = '';
    for (let i = 0; i < 18; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const accountStr = `${u.user}@${u.host}`.toLowerCase();
      const matchesSearch =
        accountStr.includes(searchQuery.toLowerCase()) ||
        (u.plugin && u.plugin.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (userFilter === 'active') return !u.accountLocked;
      if (userFilter === 'locked') return u.accountLocked;
      if (userFilter === 'superusers') return u.isSuperuser;
      return true;
    });
  }, [users, searchQuery, userFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => !u.accountLocked).length;
    const locked = users.filter((u) => u.accountLocked).length;
    const superusers = users.filter((u) => u.isSuperuser).length;
    return { total, active, locked, superusers };
  }, [users]);

  // Open Edit Modal
  const openEditModal = (u: MysqlUserItem) => {
    setSelectedUser(u);
    setEditAccountLocked(Boolean(u.accountLocked));
    setEditMaxQuestions(u.maxQuestions || 0);
    setEditMaxUpdates(u.maxUpdates || 0);
    setEditMaxConnections(u.maxConnections || 0);
    setEditMaxUserConnections(u.maxUserConnections || 0);
    setEditSslType((u.sslType as any) || 'NONE');
    setEditExpirePolicy('default');
    setEditExpireDays(90);
    setIsEditModalOpen(true);
  };

  // Open Password Modal
  const openPasswordModal = (u: MysqlUserItem) => {
    setSelectedUser(u);
    setChangePasswordVal('');
    setChangePasswordConfirm('');
    setShowChangePassword(false);
    setChangePasswordPlugin(u.plugin || 'caching_sha2_password');
    setIsPasswordModalOpen(true);
  };

  // Open Expire Modal
  const openExpireModal = (u: MysqlUserItem) => {
    setSelectedUser(u);
    setExpirePolicyVal('immediate');
    setExpireDaysVal(90);
    setIsExpireModalOpen(true);
  };

  // Open Drop Modal
  const openDropModal = (u: MysqlUserItem) => {
    setSelectedUser(u);
    setDropConfirmInput('');
    setIsDropModalOpen(true);
  };

  // 1. Create User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: MysqlUserCreateRequest = {
      user: newUsername.trim(),
      host: newHost.trim() || '%',
      password: newPassword || undefined,
      plugin: newPlugin,
      accountLocked: newAccountLocked,
      passwordExpirePolicy: newExpirePolicy,
      passwordExpireIntervalDays: newExpirePolicy === 'interval' ? newExpireDays : undefined,
      maxQuestions: newMaxQuestions > 0 ? newMaxQuestions : undefined,
      maxUpdates: newMaxUpdates > 0 ? newMaxUpdates : undefined,
      maxConnections: newMaxConnections > 0 ? newMaxConnections : undefined,
      maxUserConnections: newMaxUserConnections > 0 ? newMaxUserConnections : undefined,
      sslType: newSslType,
    };

    try {
      const res = await createRemoteServerMysqlUser(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `User '${payload.user}'@'${payload.host}' created successfully.`,
          messageFa: `کاربر '${payload.user}'@'${payload.host}' با موفقیت در MySQL ایجاد شد.`,
        });
        setIsCreateModalOpen(false);
        setNewUsername('');
        setNewPassword('');
        setNewHost('%');
        loadUsers();
        if (onRefreshOverview) onRefreshOverview();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to create user.',
          messageFa: res.errorFa || 'خطا در ایجاد کاربر MySQL.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error.',
        messageFa: 'خطای شبکه در هنگام ارسال درخواست.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Edit User Handler
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: MysqlUserUpdateRequest = {
      user: selectedUser.user,
      host: selectedUser.host,
      accountLocked: editAccountLocked,
      passwordExpirePolicy: editExpirePolicy !== 'default' ? editExpirePolicy : undefined,
      passwordExpireIntervalDays: editExpirePolicy === 'interval' ? editExpireDays : undefined,
      maxQuestions: editMaxQuestions,
      maxUpdates: editMaxUpdates,
      maxConnections: editMaxConnections,
      maxUserConnections: editMaxUserConnections,
      sslType: editSslType,
    };

    try {
      const res = await updateRemoteServerMysqlUser(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Account '${selectedUser.user}'@'${selectedUser.host}' updated successfully.`,
          messageFa: `مشخصات اکانت '${selectedUser.user}'@'${selectedUser.host}' با موفقیت ذخیره شد.`,
        });
        setIsEditModalOpen(false);
        loadUsers();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to update user attributes.',
          messageFa: res.errorFa || 'خطا در به‌روزرسانی مشخصات کاربر.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error.',
        messageFa: 'خطای شبکه در هنگام ارسال درخواست.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Change Password Handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!changePasswordVal) return;
    if (changePasswordVal !== changePasswordConfirm) {
      setFeedback({
        type: 'error',
        message: 'Password confirmation does not match.',
        messageFa: 'تکرار کلمه عبور با کلمه عبور واردشده مطابقت ندارد.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const payload: MysqlUserPasswordChangeRequest = {
      user: selectedUser.user,
      host: selectedUser.host,
      password: changePasswordVal,
      plugin: changePasswordPlugin || undefined,
    };

    try {
      const res = await changeRemoteServerMysqlUserPassword(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Password for '${selectedUser.user}'@'${selectedUser.host}' changed successfully.`,
          messageFa: `کلمه عبور کاربر '${selectedUser.user}'@'${selectedUser.host}' با موفقیت تغییر کرد.`,
        });
        setIsPasswordModalOpen(false);
        setChangePasswordVal('');
        setChangePasswordConfirm('');
        loadUsers();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to change password.',
          messageFa: res.errorFa || 'خطا در تغییر کلمه عبور کاربر.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error.',
        messageFa: 'خطای شبکه در هنگام تغییر رمز عبور.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Quick Lock / Unlock Toggle
  const handleToggleLock = async (u: MysqlUserItem) => {
    setSubmitting(true);
    setFeedback(null);
    const targetLock = !u.accountLocked;

    const payload: MysqlUserLockRequest = {
      user: u.user,
      host: u.host,
      lock: targetLock,
    };

    try {
      const res = await lockRemoteServerMysqlUser(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Account '${u.user}'@'${u.host}' ${targetLock ? 'locked' : 'unlocked'}.`,
          messageFa: `اکانت '${u.user}'@'${u.host}' با موفقیت ${targetLock ? 'قفل' : 'آزاد'} شد.`,
        });
        loadUsers();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to modify account lock state.',
          messageFa: res.errorFa || 'خطا در تغییر وضعیت قفل اکانت.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error.',
        messageFa: 'خطای شبکه در هنگام تغییر وضعیت قفل.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Expire Password Handler
  const handleExpirePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: MysqlUserExpirePasswordRequest = {
      user: selectedUser.user,
      host: selectedUser.host,
      policy: expirePolicyVal,
      intervalDays: expirePolicyVal === 'interval' ? expireDaysVal : undefined,
    };

    try {
      const res = await setRemoteServerMysqlUserExpiration(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Password expiration policy updated for '${selectedUser.user}'@'${selectedUser.host}'.`,
          messageFa: `سیاست انقضای رمز عبور برای '${selectedUser.user}'@'${selectedUser.host}' اعمال گردید.`,
        });
        setIsExpireModalOpen(false);
        loadUsers();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to set password expiration.',
          messageFa: res.errorFa || 'خطا در اعمال تنظیمات انقضای رمز عبور.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error.',
        messageFa: 'خطای شبکه در هنگام تغییر سیاست انقضا.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 6. Drop User Handler
  const handleDropUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (dropConfirmInput.trim() !== selectedUser.user) {
      setFeedback({
        type: 'error',
        message: `Please type '${selectedUser.user}' to confirm deletion.`,
        messageFa: `جهت تایید حذف، لطفاً نام کاربر '${selectedUser.user}' را در کادر تایپ کنید.`,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const payload: MysqlUserDropRequest = {
      user: selectedUser.user,
      host: selectedUser.host,
      ifExists: true,
    };

    try {
      const res = await dropRemoteServerMysqlUser(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `User '${selectedUser.user}'@'${selectedUser.host}' was dropped.`,
          messageFa: `کاربر '${selectedUser.user}'@'${selectedUser.host}' با موفقیت از پایگاه داده حذف شد.`,
        });
        setIsDropModalOpen(false);
        setSelectedUser(null);
        setDropConfirmInput('');
        loadUsers();
        if (onRefreshOverview) onRefreshOverview();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to drop user account.',
          messageFa: res.errorFa || 'خطا در حذف کاربر MySQL.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error.',
        messageFa: 'خطای شبکه در هنگام حذف کاربر.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Feedback */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedback.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : isLightMode
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
            )}
            <span>{isEn ? feedback.message : feedback.messageFa}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className={`p-3 rounded-xl border ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{isEn ? 'Total Accounts' : 'کل اکانت‌ها'}</span>
            <Users className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className={`text-xl font-bold ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
            {stats.total}
          </div>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{isEn ? 'Active & Unlocked' : 'فعال و آزاد'}</span>
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-500">{stats.active}</div>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{isEn ? 'Locked Accounts' : 'قفل شده'}</span>
            <Lock className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400">{stats.locked}</div>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{isEn ? 'Privileged / Root' : 'مدیران کل و روت'}</span>
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400">{stats.superusers}</div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & Actions */}
      <div
        className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? "Search by 'user'@'host' or auth plugin..." : "جستجو با 'user'@'host' یا پلاگین..."}
              className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border transition outline-none ${
                isLightMode
                  ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                  : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
              }`}
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1">
            {[
              { id: 'all', label: isEn ? 'All' : 'همه' },
              { id: 'active', label: isEn ? 'Active' : 'فعال' },
              { id: 'locked', label: isEn ? 'Locked' : 'قفل' },
              { id: 'superusers', label: isEn ? 'Root' : 'روت' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setUserFilter(f.id as any)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition cursor-pointer ${
                  userFilter === f.id
                    ? 'bg-blue-600 border-blue-500 text-white font-semibold'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className={`px-3 py-1.5 text-xs rounded-lg border flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
                : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-200'
            }`}
            title={isEn ? 'Refresh accounts' : 'به‌روزرسانی کاربران'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewUsername('');
              setNewHost('%');
              setNewPassword('');
              setIsCreateModalOpen(true);
            }}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Create User' : 'ایجاد کاربر جدید'}</span>
          </button>
        </div>
      </div>

      {/* Users Data Grid */}
      <div
        className={`rounded-xl border overflow-hidden ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-white/10'
        }`}
      >
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b font-semibold ${
                  isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <th className="py-2.5 px-3">{isEn ? 'Account (User @ Host)' : 'نام حساب (کاربر @ هاست)'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Auth Plugin' : 'پلاگین احراز هویت'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Status' : 'وضعیت اکانت'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Password Policy' : 'سیاست رمز'}</th>
                <th className="py-2.5 px-3">{isEn ? 'Resource Limits' : 'محدودیت‌های منابع'}</th>
                <th className="py-2.5 px-3">{isEn ? 'SSL' : 'الزام SSL'}</th>
                <th className="py-2.5 px-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>{isEn ? 'Fetching MySQL accounts from server...' : 'در حال دریافت اطلاعات کاربران MySQL...'}</span>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <span>{isEn ? 'No MySQL accounts matched the criteria.' : 'هیچ کاربری با این مشخصات یافت نشد.'}</span>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const accountKey = `${u.user}@${u.host}`;
                  return (
                    <tr
                      key={accountKey}
                      className={`transition ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      {/* Account Identifier */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              u.isSuperuser
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : u.accountLocked
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {u.isSuperuser ? <ShieldAlert className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className={isLightMode ? 'text-slate-900 font-semibold' : 'text-white'}>
                                {u.user}
                              </span>
                              <span className="text-slate-400">@</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  u.host === '%'
                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                    : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                }`}
                              >
                                {u.host}
                              </span>
                            </div>
                            {u.isSuperuser && (
                              <span className="text-[10px] text-amber-500 font-medium">
                                {isEn ? 'SUPERUSER' : 'دسترسی کامل (Superuser)'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Auth Plugin */}
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-[11px] text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                          {u.plugin || 'caching_sha2_password'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        {u.accountLocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <Lock className="w-2.5 h-2.5" />
                            <span>{isEn ? 'Locked' : 'قفل شده'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <Unlock className="w-2.5 h-2.5" />
                            <span>{isEn ? 'Active' : 'فعال'}</span>
                          </span>
                        )}
                      </td>

                      {/* Password Policy */}
                      <td className="py-2.5 px-3">
                        {u.passwordExpired ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{isEn ? 'Expired' : 'منقضی شده'}</span>
                          </span>
                        ) : u.passwordLifetime ? (
                          <span className="text-[11px] text-slate-400">
                            {u.passwordLifetime} {isEn ? 'days' : 'روز'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            {isEn ? 'Default' : 'پیش‌فرض'}
                          </span>
                        )}
                      </td>

                      {/* Resource Limits */}
                      <td className="py-2.5 px-3 text-[11px] text-slate-400 font-mono">
                        {u.maxQuestions || u.maxConnections || u.maxUserConnections ? (
                          <div className="space-y-0.5">
                            {u.maxQuestions ? <div>Q/h: {u.maxQuestions}</div> : null}
                            {u.maxUserConnections ? <div>Conn: {u.maxUserConnections}</div> : null}
                          </div>
                        ) : (
                          <span className="text-slate-500">{isEn ? 'Unlimited' : 'نامحدود'}</span>
                        )}
                      </td>

                      {/* SSL */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            u.sslType && u.sslType !== 'NONE'
                              ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                              : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                          }`}
                        >
                          {u.sslType && u.sslType !== 'NONE' ? u.sslType : 'NONE'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onManagePrivileges && (
                            <button
                              type="button"
                              onClick={() => onManagePrivileges(u.user, u.host)}
                              className="p-1.5 rounded-lg border border-transparent hover:border-purple-500/30 hover:bg-purple-500/10 text-slate-400 hover:text-purple-400 transition cursor-pointer"
                              title={isEn ? 'Manage Privileges & Grants' : 'مدیریت مجوزها و دسترسی‌ها'}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openPasswordModal(u)}
                            className="p-1.5 rounded-lg border border-transparent hover:border-blue-500/30 hover:bg-blue-500/10 text-slate-400 hover:text-blue-400 transition cursor-pointer"
                            title={isEn ? 'Change Password' : 'تغییر رمز عبور'}
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleLock(u)}
                            disabled={submitting}
                            className={`p-1.5 rounded-lg border border-transparent transition cursor-pointer ${
                              u.accountLocked
                                ? 'hover:border-emerald-500/30 hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-400'
                                : 'hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400'
                            }`}
                            title={
                              u.accountLocked
                                ? isEn
                                  ? 'Unlock Account'
                                  : 'آزادسازی اکانت'
                                : isEn
                                ? 'Lock Account'
                                : 'قفل کردن اکانت'
                            }
                          >
                            {u.accountLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => openExpireModal(u)}
                            className="p-1.5 rounded-lg border border-transparent hover:border-amber-500/30 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 transition cursor-pointer"
                            title={isEn ? 'Password Expiration Policy' : 'سیاست انقضای رمز عبور'}
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg border border-transparent hover:border-purple-500/30 hover:bg-purple-500/10 text-slate-400 hover:text-purple-400 transition cursor-pointer"
                            title={isEn ? 'Edit Account Attributes' : 'ویرایش ویژگی‌های کاربر'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openDropModal(u)}
                            className="p-1.5 rounded-lg border border-transparent hover:border-rose-500/30 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                            title={isEn ? 'Drop User' : 'حذف کاربر'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. CREATE USER MODAL */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full ${
              isModalMaximized ? 'h-full max-w-full' : 'max-w-2xl max-h-[90vh]'
            } flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200 ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-white/10'
            }`}
          >
            {/* Modal Header with Controls */}
            <div
              className={`p-4 border-b flex items-center justify-between shrink-0 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                    {isEn ? 'Create MySQL User Account' : 'ایجاد حساب کاربری جدید MySQL'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn ? "Configure 'user'@'host', authentication and limits" : "تنظیم نام کاربری، هاست و اعتبارسنجی"}
                  </p>
                </div>
              </div>

              {/* Window Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  title={isEn ? 'Minimize' : 'کوچک‌نمایی'}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalMaximized(!isModalMaximized)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  title={isEn ? (isModalMaximized ? 'Restore' : 'Maximize') : 'تمام‌صفحه'}
                >
                  {isModalMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                  title={isEn ? 'Close' : 'بستن'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateUser} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {/* Username & Host pair */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <span>{isEn ? 'Username' : 'نام کاربری'}</span>
                      <span className="text-rose-400">*</span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'MySQL Username' : 'نام کاربری در MySQL'}
                      whatIsIt={isEn ? 'The identifier used by MySQL to identify the login account.' : 'شناسه‌ای که MySQL برای شناسایی کاربر استفاده می‌کند.'}
                      whyNeeded={isEn ? 'MySQL user accounts are uniquely identified as pair of user and host.' : 'در MySQL کاربر با جفت نام و هاست مشخص می‌گردد.'}
                      practicalExample={isEn ? "e.g., 'app_user', 'reporting', 'db_admin'" : "مانند 'app_user' یا 'db_admin'"}
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={isEn ? "e.g. app_user" : "مثلاً app_user"}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition outline-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                        : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <span>{isEn ? 'Host Scope' : 'محدوده هاست (Host)'}</span>
                      <span className="text-rose-400">*</span>
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'MySQL Host Pattern' : 'الگوی هاست در MySQL'}
                      whatIsIt={isEn ? 'Host or IP from which this user is permitted to establish connections.' : 'آدرس یا محدوده IP مجازی که کاربر می‌تواند از آن متصل شود.'}
                      whyNeeded={isEn ? "Wildcard '%' permits connection from any remote IP. 'localhost' restricts strictly to server itself." : "کاراکتر '%' اجازه اتصال از هر آی‌پی را می‌دهد، در حالی که 'localhost' فقط به اتصال محلی اجازه می‌دهد."}
                      practicalExample={isEn ? "'%' (Any Host), 'localhost', '192.168.1.%'" : "'%' (همه هاست‌ها) یا 'localhost'"}
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      required
                      value={newHost}
                      onChange={(e) => setNewHost(e.target.value)}
                      placeholder="%"
                      className={`flex-1 px-3 py-2 text-xs rounded-xl border transition outline-none font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                          : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setNewHost('%')}
                      className="px-2.5 py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition cursor-pointer"
                      title={isEn ? 'Wildcard Any Host (%)' : 'اتصال از هر هاست (%)'}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewHost('localhost')}
                      className="px-2.5 py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition cursor-pointer font-mono"
                      title={isEn ? 'Localhost Only' : 'فقط لوکال‌هاست'}
                    >
                      local
                    </button>
                  </div>
                </div>
              </div>

              {/* Password & Plugin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                      <span>{isEn ? 'Password' : 'رمز عبور'}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setNewPassword(generateStrongPassword())}
                      className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{isEn ? 'Generate' : 'تولید تصادفی'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={isEn ? 'Enter password or generate...' : 'رمز عبور را وارد یا تولید کنید...'}
                      className={`w-full px-3 py-2 pr-9 text-xs rounded-xl border transition outline-none font-mono ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                          : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      {isEn ? 'Auth Plugin' : 'پلاگین احراز هویت'}
                    </label>
                    <FieldInfoTooltip
                      title={isEn ? 'Authentication Plugin' : 'پلاگین احراز هویت MySQL'}
                      whatIsIt={isEn ? 'The cryptographic method used by MySQL server to store and verify password hashes.' : 'الگوریتم رمزنگاری مورد استفاده سرور برای ذخیره و اعتبارسنجی هش رمز عبور.'}
                      whyNeeded={isEn ? "'caching_sha2_password' is the secure modern default (MySQL 8+). 'mysql_native_password' is for legacy clients." : "'caching_sha2_password' استاندارد امن و مدرن در MySQL 8 است. 'mysql_native_password' برای برنامه‌های قدیمی سازگار است."}
                      practicalExample="caching_sha2_password"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                  <select
                    value={newPlugin}
                    onChange={(e) => setNewPlugin(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border transition outline-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                        : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
                    }`}
                  >
                    <option value="caching_sha2_password">caching_sha2_password (Modern & Secure)</option>
                    <option value="mysql_native_password">mysql_native_password (Legacy 5.7)</option>
                    <option value="sha256_password">sha256_password</option>
                  </select>
                </div>
              </div>

              {/* Account Status & Expiration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {isEn ? 'Initial Account State' : 'وضعیت اولیه حساب'}
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer mt-2">
                    <input
                      type="checkbox"
                      checked={newAccountLocked}
                      onChange={(e) => setNewAccountLocked(e.target.checked)}
                      className="rounded border-white/20 text-rose-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300">
                      {isEn ? 'Create as Locked (ACCOUNT LOCK)' : 'ایجاد در حالت قفل‌شده (ACCOUNT LOCK)'}
                    </span>
                  </label>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                    {isEn ? 'Password Expiration Policy' : 'سیاست انقضای رمز عبور'}
                  </label>
                  <select
                    value={newExpirePolicy}
                    onChange={(e) => setNewExpirePolicy(e.target.value as any)}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg border transition outline-none ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                        : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
                    }`}
                  >
                    <option value="default">{isEn ? 'Default (Server Policy)' : 'پیش‌فرض سرور'}</option>
                    <option value="never">{isEn ? 'Never Expire (PASSWORD EXPIRE NEVER)' : 'عدم انقضا'}</option>
                    <option value="immediate">{isEn ? 'Expire Immediately (Force change on login)' : 'اجبار تغییر رمز در اولین ورود'}</option>
                    <option value="interval">{isEn ? 'Expire After N Days (Interval)' : 'انقضا پس از تعداد روز مشخص'}</option>
                  </select>
                  {newExpirePolicy === 'interval' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={newExpireDays}
                        onChange={(e) => setNewExpireDays(Number(e.target.value))}
                        className={`w-24 px-2 py-1 text-xs rounded border outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/40 border-white/10 text-white'
                        }`}
                      />
                      <span className="text-xs text-slate-400">{isEn ? 'Days' : 'روز'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Collapsible: Limits & SSL */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedCreate(!showAdvancedCreate)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Resource Limits & SSL (Optional)' : 'محدودیت‌های منابع و الزامات SSL (اختیاری)'}</span>
                </button>

                {showAdvancedCreate && (
                  <div className="mt-3 p-3.5 rounded-xl border border-white/10 bg-white/[0.02] space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Max Queries / Hr</label>
                        <input
                          type="number"
                          min="0"
                          value={newMaxQuestions}
                          onChange={(e) => setNewMaxQuestions(Number(e.target.value))}
                          placeholder="0 = unltd"
                          className={`w-full px-2 py-1 text-xs rounded border outline-none font-mono ${
                            isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Max Updates / Hr</label>
                        <input
                          type="number"
                          min="0"
                          value={newMaxUpdates}
                          onChange={(e) => setNewMaxUpdates(Number(e.target.value))}
                          placeholder="0 = unltd"
                          className={`w-full px-2 py-1 text-xs rounded border outline-none font-mono ${
                            isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Max Conns / Hr</label>
                        <input
                          type="number"
                          min="0"
                          value={newMaxConnections}
                          onChange={(e) => setNewMaxConnections(Number(e.target.value))}
                          placeholder="0 = unltd"
                          className={`w-full px-2 py-1 text-xs rounded border outline-none font-mono ${
                            isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Max User Conns</label>
                        <input
                          type="number"
                          min="0"
                          value={newMaxUserConnections}
                          onChange={(e) => setNewMaxUserConnections(Number(e.target.value))}
                          placeholder="0 = unltd"
                          className={`w-full px-2 py-1 text-xs rounded border outline-none font-mono ${
                            isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">{isEn ? 'SSL Transport Requirement' : 'الزام رمزنگاری SSL'}</label>
                      <select
                        value={newSslType}
                        onChange={(e) => setNewSslType(e.target.value as any)}
                        className={`w-full px-2 py-1 text-xs rounded border outline-none ${
                          isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                        }`}
                      >
                        <option value="NONE">{isEn ? 'NONE (Unrestricted)' : 'هیچ‌کدام (اتصال بدون الزام SSL)'}</option>
                        <option value="SSL">{isEn ? 'REQUIRE SSL (Must use TLS)' : 'الزام به اتصال امن SSL/TLS'}</option>
                        <option value="X509">{isEn ? 'REQUIRE X509 (Valid Client Certificate)' : 'الزام به سرتیفیکیت کلاینت X509'}</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newUsername.trim()}
                  className="px-4 py-2 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Create Account' : 'ایجاد حساب کاربری'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. EDIT USER ATTRIBUTES MODAL */}
      {/* ========================================================================= */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-white/10'
            }`}
          >
            <div
              className={`p-4 border-b flex items-center justify-between shrink-0 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                    {isEn ? 'Edit User Attributes' : 'ویرایش مشخصات حساب کاربری'}
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    '{selectedUser.user}'@'{selectedUser.host}'
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              {/* Account Lock Toggle */}
              <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs font-semibold text-slate-200 block">
                      {isEn ? 'Account Lock Status' : 'وضعیت قفل بودن حساب'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {isEn ? 'Prevents login attempts without deleting credentials' : 'مسدود کردن ورود کاربر بدون حذف مجوزها یا رمز'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editAccountLocked}
                    onChange={(e) => setEditAccountLocked(e.target.checked)}
                    className="rounded text-rose-500 focus:ring-0 cursor-pointer"
                  />
                </label>
              </div>

              {/* Resource Limits */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  {isEn ? 'Resource Consumption Limits' : 'محدودیت‌های مصرف منابع'}
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Max Queries / Hr</label>
                    <input
                      type="number"
                      min="0"
                      value={editMaxQuestions}
                      onChange={(e) => setEditMaxQuestions(Number(e.target.value))}
                      className={`w-full px-2 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                        isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Max Updates / Hr</label>
                    <input
                      type="number"
                      min="0"
                      value={editMaxUpdates}
                      onChange={(e) => setEditMaxUpdates(Number(e.target.value))}
                      className={`w-full px-2 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                        isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Max Conns / Hr</label>
                    <input
                      type="number"
                      min="0"
                      value={editMaxConnections}
                      onChange={(e) => setEditMaxConnections(Number(e.target.value))}
                      className={`w-full px-2 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                        isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Max User Conns</label>
                    <input
                      type="number"
                      min="0"
                      value={editMaxUserConnections}
                      onChange={(e) => setEditMaxUserConnections(Number(e.target.value))}
                      className={`w-full px-2 py-1.5 text-xs rounded-lg border outline-none font-mono ${
                        isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* SSL */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {isEn ? 'SSL Requirement' : 'الزام رمزنگاری SSL'}
                </label>
                <select
                  value={editSslType}
                  onChange={(e) => setEditSslType(e.target.value as any)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border transition outline-none ${
                    isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                  }`}
                >
                  <option value="NONE">{isEn ? 'NONE (No SSL Required)' : 'عدم الزام به SSL'}</option>
                  <option value="SSL">{isEn ? 'REQUIRE SSL (Must connect with TLS)' : 'الزام به اتصال امن SSL'}</option>
                  <option value="X509">{isEn ? 'REQUIRE X509 (Must supply Client Cert)' : 'الزام به سرتیفیکیت X509'}</option>
                </select>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Save Attributes' : 'ذخیره تغییرات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. CHANGE PASSWORD MODAL */}
      {/* ========================================================================= */}
      {isPasswordModalOpen && selectedUser && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-white/10'
            }`}
          >
            <div
              className={`p-4 border-b flex items-center justify-between shrink-0 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                    {isEn ? 'Change Password' : 'تغییر رمز عبور کاربر'}
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    '{selectedUser.user}'@'{selectedUser.host}'
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {isEn ? 'New Password' : 'رمز عبور جدید'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const p = generateStrongPassword();
                      setChangePasswordVal(p);
                      setChangePasswordConfirm(p);
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{isEn ? 'Generate' : 'تولید تصادفی'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showChangePassword ? 'text' : 'password'}
                    required
                    value={changePasswordVal}
                    onChange={(e) => setChangePasswordVal(e.target.value)}
                    placeholder={isEn ? 'Enter new password...' : 'رمز عبور جدید را وارد کنید...'}
                    className={`w-full px-3 py-2 pr-9 text-xs rounded-xl border transition outline-none font-mono ${
                      isLightMode
                        ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                        : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(!showChangePassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showChangePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {isEn ? 'Confirm Password' : 'تکرار رمز عبور'}
                </label>
                <input
                  type={showChangePassword ? 'text' : 'password'}
                  required
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                  placeholder={isEn ? 'Re-type password...' : 'تکرار رمز عبور...'}
                  className={`w-full px-3 py-2 text-xs rounded-xl border transition outline-none font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500'
                      : 'bg-black/30 border-white/10 text-white focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !changePasswordVal}
                  className="px-4 py-2 text-xs rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Update Password' : 'ذخیره رمز جدید'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PASSWORD EXPIRATION POLICY MODAL */}
      {/* ========================================================================= */}
      {isExpireModalOpen && selectedUser && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-white/10'
            }`}
          >
            <div
              className={`p-4 border-b flex items-center justify-between shrink-0 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-800' : 'text-white'}`}>
                    {isEn ? 'Password Expiration' : 'تنظیم انقضای رمز عبور'}
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    '{selectedUser.user}'@'{selectedUser.host}'
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExpireModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExpirePassword} className="p-5 space-y-4">
              <div className="space-y-2">
                {[
                  {
                    id: 'immediate',
                    label: isEn ? 'Force Expire Immediately' : 'انقضای فوری (الزام تغییر در ورود بعدی)',
                    desc: isEn ? 'User will be prompted to choose a new password upon next connection' : 'کاربر در اولین ورود ملزم به انتخاب رمز جدید می‌شود',
                  },
                  {
                    id: 'never',
                    label: isEn ? 'Never Expire (PASSWORD EXPIRE NEVER)' : 'عدم انقضای رمز عبور',
                    desc: isEn ? 'Disables password aging for this specific account' : 'رمز عبور این کاربر هرگز منقضی نخواهد شد',
                  },
                  {
                    id: 'default',
                    label: isEn ? 'Use Global Server Policy' : 'استفاده از سیاست سراسری سرور',
                    desc: isEn ? 'Follows default_password_lifetime setting' : 'تابع متغیر سراسری default_password_lifetime در تنظیمات سرور',
                  },
                  {
                    id: 'interval',
                    label: isEn ? 'Expire After Specified Days' : 'انقضا پس از تعداد روز مشخص',
                    desc: isEn ? 'Sets interval in days before password becomes invalid' : 'تعیین بازه زمانی بر حسب روز',
                  },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`block p-3 rounded-xl border cursor-pointer transition ${
                      expirePolicyVal === opt.id
                        ? 'border-amber-500/50 bg-amber-500/10'
                        : 'border-white/10 hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="expirePolicy"
                        value={opt.id}
                        checked={expirePolicyVal === opt.id}
                        onChange={(e) => setExpirePolicyVal(e.target.value as any)}
                        className="text-amber-500 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 ml-6 mt-0.5">{opt.desc}</p>
                  </label>
                ))}
              </div>

              {expirePolicyVal === 'interval' && (
                <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] flex items-center gap-2">
                  <label className="text-xs text-slate-300 font-medium">{isEn ? 'Interval (Days):' : 'تعداد روز:'}</label>
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={expireDaysVal}
                    onChange={(e) => setExpireDaysVal(Number(e.target.value))}
                    className={`w-28 px-2 py-1 text-xs rounded border outline-none font-mono ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-black/30 border-white/10 text-white'
                    }`}
                  />
                </div>
              )}

              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpireModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold transition cursor-pointer flex items-center gap-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Apply Policy' : 'اعمال سیاست'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DROP USER CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {isDropModalOpen && selectedUser && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-rose-500/30'
            }`}
          >
            <div
              className={`p-4 border-b flex items-center justify-between shrink-0 ${
                isLightMode ? 'bg-rose-50 border-rose-200' : 'bg-rose-950/40 border-rose-500/20'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isLightMode ? 'text-rose-900' : 'text-rose-300'}`}>
                    {isEn ? 'Drop MySQL User Account' : 'حذف قطعی حساب کاربری MySQL'}
                  </h3>
                  <div className="text-[11px] text-rose-400/80 font-mono">
                    DROP USER '{selectedUser.user}'@'{selectedUser.host}'
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDropModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDropUser} className="p-5 space-y-4">
              <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-xs text-rose-300 space-y-1.5">
                <p className="font-semibold">
                  {isEn
                    ? 'Warning: This operation is permanent and irreversible.'
                    : 'هشدار: این عملیات برگشت‌ناپذیر است و بلافاصله اجرا می‌شود.'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isEn
                    ? `Dropping '${selectedUser.user}'@'${selectedUser.host}' will instantly revoke all database privileges and terminate any active sessions.`
                    : `با حذف کاربر '${selectedUser.user}'@'${selectedUser.host}' تمام دسترسی‌ها و مجوزهای جداول باطل شده و امکان ورود سلب می‌گردد.`}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  {isEn ? (
                    <>
                      Type <span className="font-mono text-rose-400 font-bold">{selectedUser.user}</span> to confirm:
                    </>
                  ) : (
                    <>
                      جهت تایید نام کاربر <span className="font-mono text-rose-400 font-bold">{selectedUser.user}</span> را وارد نمایید:
                    </>
                  )}
                </label>
                <input
                  type="text"
                  required
                  value={dropConfirmInput}
                  onChange={(e) => setDropConfirmInput(e.target.value)}
                  placeholder={selectedUser.user}
                  className={`w-full px-3 py-2 text-xs rounded-xl border transition outline-none font-mono ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-rose-500'
                      : 'bg-black/30 border-white/10 text-white focus:border-rose-500'
                  }`}
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDropModalOpen(false)}
                  className="px-4 py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 transition cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting || dropConfirmInput.trim() !== selectedUser.user}
                  className="px-4 py-2 text-xs rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Drop User Account' : 'حذف قطعی کاربر'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
