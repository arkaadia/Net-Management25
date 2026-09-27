import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  Key,
  Lock,
  Calendar,
  Layers,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  UserCheck,
  UserX,
  Plus,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresRoleItem,
  PostgresRoleCreateRequest,
  PostgresRoleUpdateRequest,
  PostgresRolePasswordChangeRequest,
  PostgresRoleMembershipRequest,
  PostgresRoleDropRequest,
} from '../../types';
import {
  fetchRemoteServerPostgresRoles,
  createRemoteServerPostgresRole,
  updateRemoteServerPostgresRole,
  changeRemoteServerPostgresRolePassword,
  manageRemoteServerPostgresRoleMembership,
  dropRemoteServerPostgresRole,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface PostgresRolesManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  onRefreshOverview?: () => void;
}

export const PostgresRolesManagerTab: React.FC<PostgresRolesManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  onRefreshOverview,
}) => {
  const [roles, setRoles] = useState<PostgresRoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'users' | 'groups' | 'superusers'>('all');
  const [selectedRole, setSelectedRole] = useState<PostgresRoleItem | null>(null);

  // Operation Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);
  const [isDropModalOpen, setIsDropModalOpen] = useState(false);

  // Status & Feedback Alert
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    messageFa: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form States for Creation
  const [newRoleName, setNewRoleName] = useState('');
  const [newCanLogin, setNewCanLogin] = useState(true);
  const [newIsSuperuser, setNewIsSuperuser] = useState(false);
  const [newCreateDb, setNewCreateDb] = useState(false);
  const [newCreateRole, setNewCreateRole] = useState(false);
  const [newReplication, setNewReplication] = useState(false);
  const [newBypassRls, setNewBypassRls] = useState(false);
  const [newConnectionLimit, setNewConnectionLimit] = useState<number>(-1);
  const [newValidUntil, setNewValidUntil] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newMemberOf, setNewMemberOf] = useState<string[]>([]);

  // Form States for Editing
  const [editCanLogin, setEditCanLogin] = useState(false);
  const [editIsSuperuser, setEditIsSuperuser] = useState(false);
  const [editCreateDb, setEditCreateDb] = useState(false);
  const [editCreateRole, setEditCreateRole] = useState(false);
  const [editReplication, setEditReplication] = useState(false);
  const [editBypassRls, setEditBypassRls] = useState(false);
  const [editConnectionLimit, setEditConnectionLimit] = useState<number>(-1);
  const [editValidUntil, setEditValidUntil] = useState<string>('');
  const [editComment, setEditComment] = useState('');

  // Form States for Password Change
  const [changePasswordVal, setChangePasswordVal] = useState('');
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('');

  // Form States for Membership
  const [targetMemberRole, setTargetMemberRole] = useState('');
  const [membershipAction, setMembershipAction] = useState<'grant' | 'revoke'>('grant');
  const [membershipAdminOption, setMembershipAdminOption] = useState(false);

  // Form States for Drop
  const [dropReassignTo, setDropReassignTo] = useState('');
  const [dropOwnedObjects, setDropOwnedObjects] = useState(true);

  // Load Roles
  const loadRoles = useCallback(async () => {
    if (!server?.id) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchRemoteServerPostgresRoles(server.id);
      if (res.success && res.roles) {
        setRoles(res.roles);
        if (selectedRole) {
          const updated = res.roles.find((r) => r.rolname === selectedRole.rolname);
          if (updated) setSelectedRole(updated);
        }
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to fetch roles from PostgreSQL.',
          messageFa: res.errorFa || 'خطا در دریافت لیست نقش‌ها و کاربران از PostgreSQL.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error fetching roles.',
        messageFa: 'خطای شبکه در ارتباط با سرور پایگاه داده.',
      });
    } finally {
      setLoading(false);
    }
  }, [server?.id, selectedRole]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // Filtered roles list
  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      const matchesSearch =
        r.rolname.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.comment && r.comment.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (roleFilter === 'users') return r.canLogin;
      if (roleFilter === 'groups') return !r.canLogin;
      if (roleFilter === 'superusers') return r.isSuperuser;
      return true;
    });
  }, [roles, searchQuery, roleFilter]);

  // Open Edit Modal with prefilled values
  const openEditModal = (role: PostgresRoleItem) => {
    setSelectedRole(role);
    setEditCanLogin(role.canLogin);
    setEditIsSuperuser(role.isSuperuser);
    setEditCreateDb(role.createDb);
    setEditCreateRole(role.createRole);
    setEditReplication(role.replication);
    setEditBypassRls(role.bypassRls);
    setEditConnectionLimit(role.connectionLimit ?? -1);
    setEditValidUntil(role.validUntil ? role.validUntil.slice(0, 16) : '');
    setEditComment(role.comment || '');
    setIsEditModalOpen(true);
  };

  // Open Password Modal
  const openPasswordModal = (role: PostgresRoleItem) => {
    setSelectedRole(role);
    setChangePasswordVal('');
    setChangePasswordConfirm('');
    setIsPasswordModalOpen(true);
  };

  // Open Membership Modal
  const openMembershipModal = (role: PostgresRoleItem) => {
    setSelectedRole(role);
    setTargetMemberRole('');
    setMembershipAction('grant');
    setMembershipAdminOption(false);
    setIsMembershipModalOpen(true);
  };

  // Open Drop Modal
  const openDropModal = (role: PostgresRoleItem) => {
    setSelectedRole(role);
    setDropReassignTo('postgres');
    setDropOwnedObjects(true);
    setIsDropModalOpen(true);
  };

  // Handle Create Role Submission
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresRoleCreateRequest = {
      rolname: newRoleName.trim(),
      canLogin: newCanLogin,
      isSuperuser: newIsSuperuser,
      createDb: newCreateDb,
      createRole: newCreateRole,
      replication: newReplication,
      bypassRls: newBypassRls,
      connectionLimit: Number(newConnectionLimit),
      validUntil: newValidUntil ? newValidUntil : null,
      password: newPassword ? newPassword : undefined,
      memberOf: newMemberOf.length > 0 ? newMemberOf : undefined,
      comment: newComment ? newComment : undefined,
    };

    try {
      const res = await createRemoteServerPostgresRole(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Role "${newRoleName}" created successfully.`,
          messageFa: res.messageFa || `نقش یا کاربر "${newRoleName}" با موفقیت ایجاد شد.`,
        });
        setIsCreateModalOpen(false);
        // Reset form
        setNewRoleName('');
        setNewPassword('');
        setNewComment('');
        setNewMemberOf([]);
        await loadRoles();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to create role.',
          messageFa: res.errorFa || res.messageFa || 'خطا در ایجاد نقش یا کاربر.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while creating role.',
        messageFa: 'خطای شبکه در ثبت نقش جدید.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Role Submission
  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresRoleUpdateRequest = {
      rolname: selectedRole.rolname,
      canLogin: editCanLogin,
      isSuperuser: editIsSuperuser,
      createDb: editCreateDb,
      createRole: editCreateRole,
      replication: editReplication,
      bypassRls: editBypassRls,
      connectionLimit: Number(editConnectionLimit),
      validUntil: editValidUntil ? editValidUntil : null,
      comment: editComment ? editComment : undefined,
    };

    try {
      const res = await updateRemoteServerPostgresRole(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Role "${selectedRole.rolname}" updated successfully.`,
          messageFa: res.messageFa || `مشخصات نقش "${selectedRole.rolname}" با موفقیت به‌روزرسانی شد.`,
        });
        setIsEditModalOpen(false);
        await loadRoles();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to update role.',
          messageFa: res.errorFa || res.messageFa || 'خطا در به‌روزرسانی مشخصات نقش.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while updating role.',
        messageFa: 'خطای شبکه در ویرایش مشخصات نقش.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole || !changePasswordVal) return;
    if (changePasswordVal !== changePasswordConfirm) {
      setFeedback({
        type: 'error',
        message: 'Passwords do not match.',
        messageFa: 'کلمه‌های عبور وارد شده همخوانی ندارند.',
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresRolePasswordChangeRequest = {
      rolname: selectedRole.rolname,
      newPassword: changePasswordVal,
    };

    try {
      const res = await changeRemoteServerPostgresRolePassword(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Password for "${selectedRole.rolname}" updated successfully.`,
          messageFa: res.messageFa || `کلمه عبور نقش "${selectedRole.rolname}" با موفقیت تغییر کرد.`,
        });
        setIsPasswordModalOpen(false);
        setChangePasswordVal('');
        setChangePasswordConfirm('');
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to change password.',
          messageFa: res.errorFa || res.messageFa || 'خطا در تغییر کلمه عبور نقش.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while changing password.',
        messageFa: 'خطای شبکه در تغییر کلمه عبور نقش.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Membership Change
  const handleMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole || !targetMemberRole.trim()) return;

    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresRoleMembershipRequest = {
      roleName: selectedRole.rolname,
      memberRole: targetMemberRole.trim(),
      action: membershipAction,
      adminOption: membershipAdminOption,
    };

    try {
      const res = await manageRemoteServerPostgresRoleMembership(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Membership updated successfully.`,
          messageFa: res.messageFa || `عضویت با موفقیت به‌روزرسانی گردید.`,
        });
        setIsMembershipModalOpen(false);
        await loadRoles();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to update membership.',
          messageFa: res.errorFa || res.messageFa || 'خطا در اعمال تغییرات عضویت نقش.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while managing membership.',
        messageFa: 'خطای شبکه در مدیریت عضویت نقش.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Drop Role
  const handleDropRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    setSubmitting(true);
    setFeedback(null);

    const payload: PostgresRoleDropRequest = {
      rolname: selectedRole.rolname,
      reassignOwnedTo: dropReassignTo ? dropReassignTo : undefined,
      dropOwned: dropOwnedObjects,
    };

    try {
      const res = await dropRemoteServerPostgresRole(server.id, payload);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Role "${selectedRole.rolname}" dropped successfully.`,
          messageFa: res.messageFa || `نقش یا کاربر "${selectedRole.rolname}" با موفقیت حذف شد.`,
        });
        setIsDropModalOpen(false);
        setSelectedRole(null);
        await loadRoles();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || res.message || 'Failed to drop role.',
          messageFa: res.errorFa || res.messageFa || 'خطا در حذف نقش پایگاه داده.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error while dropping role.',
        messageFa: 'خطای شبکه در حذف نقش پایگاه داده.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Banner & Action Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>{isEn ? 'PostgreSQL Users & Roles Management' : 'مدیریت کاربران و نقش‌های PostgreSQL'}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEn
              ? 'Inspect, create, configure privileges, passwords, and manage group memberships with server-side safety.'
              : 'مشاهده، ایجاد، پیکربندی سطوح دسترسی، کلمه عبور و مدیریت عضویت‌های گروهی با امنیت بالا.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadRoles}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? (isEn ? 'Refreshing...' : 'در حال بارگذاری...') : isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>{isEn ? 'Create Role / User' : 'ایجاد کاربر / نقش جدید'}</span>
          </button>

          <FieldInfoTooltip
            fieldName="PostgreSQL Roles & Users"
            infoWhatEn="A PostgreSQL role can function as a user (with LOGIN privilege) or a group/role. Roles control all database access and privilege delegation."
            infoWhatFa="یک نقش در PostgreSQL می‌تواند کاربر (دارای اجازه LOGIN) یا یک گروه باشد. تمامی سطوح دسترسی بر اساس نقش‌ها تعریف می‌شوند."
            infoWhyEn="Centralized identity and security administration for DBAs and application developers."
            infoWhyFa="مدیریت متمرکز امنیت و احراز هویت برای مدیران دیتابیس و توسعه‌دهندگان."
            infoExampleEn="app_user, readonly_analyst, admin_dba"
            infoExampleFa="کاربر برنامه، تحلیل‌گر داده خواندنی، مدیر دیتابیس"
            isEn={isEn}
            isLightMode={isLightMode}
          />
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedback.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{isEn ? feedback.message : feedback.messageFa}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1 rounded-lg border transition cursor-pointer font-medium ${
              roleFilter === 'all'
                ? 'bg-blue-600 text-white border-blue-500'
                : isLightMode
                ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span>{isEn ? 'All Roles' : 'همه نقش‌ها'}</span>
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
              {roles.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter('users')}
            className={`px-3 py-1 rounded-lg border transition cursor-pointer font-medium ${
              roleFilter === 'users'
                ? 'bg-blue-600 text-white border-blue-500'
                : isLightMode
                ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />
            <span>{isEn ? 'Users (Login)' : 'کاربران (با اجازه ورود)'}</span>
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
              {roles.filter((r) => r.canLogin).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter('groups')}
            className={`px-3 py-1 rounded-lg border transition cursor-pointer font-medium ${
              roleFilter === 'groups'
                ? 'bg-blue-600 text-white border-blue-500'
                : isLightMode
                ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
            <span>{isEn ? 'Groups (No Login)' : 'گروه‌ها (بدون ورود)'}</span>
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
              {roles.filter((r) => !r.canLogin).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleFilter('superusers')}
            className={`px-3 py-1 rounded-lg border transition cursor-pointer font-medium ${
              roleFilter === 'superusers'
                ? 'bg-blue-600 text-white border-blue-500'
                : isLightMode
                ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 inline mr-1 text-rose-400" />
            <span>{isEn ? 'Superusers' : 'سوپریوزرها'}</span>
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-black/20">
              {roles.filter((r) => r.isSuperuser).length}
            </span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search roles & users...' : 'جستجوی نقش‌ها و کاربران...'}
            className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none font-mono transition ${
              isLightMode
                ? 'border-slate-300 bg-white focus:border-blue-500 text-slate-800'
                : 'border-slate-800 bg-slate-950/60 focus:border-blue-500/50 text-slate-100'
            }`}
          />
        </div>
      </div>

      {/* Main Roles Table */}
      <div
        className={`flex-1 rounded-xl border overflow-hidden flex flex-col ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}
      >
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b font-mono font-bold text-[11px] uppercase tracking-wider ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-600'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400'
                }`}
              >
                <th className="p-3">{isEn ? 'Role / User' : 'نام نقش / کاربر'}</th>
                <th className="p-3 text-center">{isEn ? 'Login' : 'اجازه ورود'}</th>
                <th className="p-3 text-center">{isEn ? 'Superuser' : 'سوپریوزر'}</th>
                <th className="p-3">{isEn ? 'Privileges' : 'امتیازات و دسترسی‌ها'}</th>
                <th className="p-3">{isEn ? 'Conn Limit' : 'محدودیت اتصال'}</th>
                <th className="p-3">{isEn ? 'Valid Until' : 'تاریخ انقضا'}</th>
                <th className="p-3">{isEn ? 'Memberships' : 'عضویت‌ها'}</th>
                <th className="p-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading && roles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                    <span>{isEn ? 'Loading PostgreSQL roles...' : 'در حال بارگذاری نقش‌های دیتابیس...'}</span>
                  </td>
                </tr>
              ) : filteredRoles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    <span>{isEn ? 'No roles found matching criteria.' : 'هیچ نقشی مطابق با فیلتر یافت نشد.'}</span>
                  </td>
                </tr>
              ) : (
                filteredRoles.map((role) => {
                  const isPostgresSuper = role.rolname === 'postgres';
                  return (
                    <tr
                      key={role.rolname}
                      className={`transition ${
                        isLightMode ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Name & Type */}
                      <td className="p-3 font-mono">
                        <div className="flex items-center gap-2">
                          {role.canLogin ? (
                            <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                          <div>
                            <span className="font-bold text-slate-200">{role.rolname}</span>
                            {role.comment && (
                              <p className="text-[10px] text-slate-400 font-sans truncate max-w-[200px]">
                                {role.comment}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Login */}
                      <td className="p-3 text-center">
                        {role.canLogin ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {isEn ? 'YES' : 'بله'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            {isEn ? 'NO' : 'خیر'}
                          </span>
                        )}
                      </td>

                      {/* Superuser */}
                      <td className="p-3 text-center">
                        {role.isSuperuser ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            <ShieldAlert className="w-3 h-3" />
                            {isEn ? 'SUPER' : 'ادمین کل'}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Privileges Badges */}
                      <td className="p-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {role.createDb && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-mono">
                              CREATEDB
                            </span>
                          )}
                          {role.createRole && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-mono">
                              CREATEROLE
                            </span>
                          )}
                          {role.replication && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-mono">
                              REPLICATION
                            </span>
                          )}
                          {role.bypassRls && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] font-mono">
                              BYPASSRLS
                            </span>
                          )}
                          {!role.createDb && !role.createRole && !role.replication && !role.bypassRls && !role.isSuperuser && (
                            <span className="text-slate-500 text-[10px]">{isEn ? 'Standard' : 'استاندارد'}</span>
                          )}
                        </div>
                      </td>

                      {/* Connection Limit */}
                      <td className="p-3 font-mono text-[11px] text-slate-300">
                        {role.connectionLimit === -1 ? (
                          <span className="text-slate-500">{isEn ? 'Unlimited (-1)' : 'نامحدود'}</span>
                        ) : (
                          <span className="font-bold text-amber-300">{role.connectionLimit}</span>
                        )}
                      </td>

                      {/* Valid Until */}
                      <td className="p-3 font-mono text-[11px]">
                        {role.validUntil ? (
                          <span className="text-amber-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                            {role.validUntil.split('.')[0]}
                          </span>
                        ) : (
                          <span className="text-slate-500">{isEn ? 'Never (Infinity)' : 'نامحدود'}</span>
                        )}
                      </td>

                      {/* Memberships */}
                      <td className="p-3">
                        <div className="space-y-1">
                          {role.memberOf && role.memberOf.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-slate-500 mr-1">{isEn ? 'In:' : 'عضو در:'}</span>
                              {role.memberOf.map((m) => (
                                <span
                                  key={m}
                                  className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-mono"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                          {role.members && role.members.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-slate-500 mr-1">{isEn ? 'Has:' : 'شامل:'}</span>
                              {role.members.map((m) => (
                                <span
                                  key={m}
                                  className="px-1.5 py-0.2 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 text-[10px] font-mono"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                          {(!role.memberOf || role.memberOf.length === 0) &&
                            (!role.members || role.members.length === 0) && (
                              <span className="text-slate-600 text-[10px]">-</span>
                            )}
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Attributes */}
                          <button
                            type="button"
                            onClick={() => openEditModal(role)}
                            title={isEn ? 'Edit Privileges & Attributes' : 'ویرایش دسترسی‌ها و مشخصات'}
                            className="p-1 rounded hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Change Password (for LOGIN roles) */}
                          <button
                            type="button"
                            onClick={() => openPasswordModal(role)}
                            title={isEn ? 'Change Password' : 'تغییر کلمه عبور'}
                            className="p-1 rounded hover:bg-amber-500/20 text-slate-400 hover:text-amber-400 transition cursor-pointer"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          {/* Manage Membership */}
                          <button
                            type="button"
                            onClick={() => openMembershipModal(role)}
                            title={isEn ? 'Manage Memberships (GRANT/REVOKE)' : 'مدیریت عضویت نقش‌ها'}
                            className="p-1 rounded hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>

                          {/* Drop Role */}
                          {!isPostgresSuper && (
                            <button
                              type="button"
                              onClick={() => openDropModal(role)}
                              title={isEn ? 'Drop Role' : 'حذف نقش'}
                              className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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
      {/* 1. CREATE ROLE MODAL                                                      */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 max-h-[90vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>{isEn ? 'Create New PostgreSQL Role / User' : 'ایجاد نقش یا کاربر جدید'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Role / User Name *' : 'نام نقش یا کاربر *'}
                </label>
                <input
                  type="text"
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. app_developer or read_only_group"
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-blue-500'
                      : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                  }`}
                />
              </div>

              {/* Privilege Toggles */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCanLogin}
                    onChange={(e) => setNewCanLogin(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Allow Login (User)' : 'امکان ورود (کاربر)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-rose-300">
                  <input
                    type="checkbox"
                    checked={newIsSuperuser}
                    onChange={(e) => setNewIsSuperuser(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Superuser (Full Admin)' : 'سوپریوزر (ادمین کل)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCreateDb}
                    onChange={(e) => setNewCreateDb(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Create Database' : 'ایجاد دیتابیس'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCreateRole}
                    onChange={(e) => setNewCreateRole(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Create Other Roles' : 'ایجاد سایر نقش‌ها'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newReplication}
                    onChange={(e) => setNewReplication(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Replication' : 'رپلیکیشن'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newBypassRls}
                    onChange={(e) => setNewBypassRls(e.target.checked)}
                    className="rounded text-orange-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Bypass RLS' : 'رد کردن RLS'}</span>
                </label>
              </div>

              {/* Password (if canLogin) */}
              {newCanLogin && (
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Password (Encrypted at rest & in transit)' : 'کلمه عبور (رمزنگاری شده)'}
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter secure password"
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode
                        ? 'border-slate-300 bg-white focus:border-blue-500'
                        : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                    }`}
                  />
                </div>
              )}

              {/* Limits and Expiration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Connection Limit (-1 for unlimited)' : 'محدودیت اتصال (-1 برای نامحدود)'}
                  </label>
                  <input
                    type="number"
                    value={newConnectionLimit}
                    onChange={(e) => setNewConnectionLimit(parseInt(e.target.value, 10))}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode
                        ? 'border-slate-300 bg-white focus:border-blue-500'
                        : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Valid Until (Optional)' : 'تاریخ انقضا (اختیاری)'}
                  </label>
                  <input
                    type="datetime-local"
                    value={newValidUntil}
                    onChange={(e) => setNewValidUntil(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode
                        ? 'border-slate-300 bg-white focus:border-blue-500'
                        : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                    }`}
                  />
                </div>
              </div>

              {/* Comment / Description */}
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Description / Comment' : 'توضیحات یا یادداشت'}
                </label>
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="e.g. Service account for analytics backend"
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-blue-500'
                      : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Create Role' : 'ثبت و ایجاد نقش'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. EDIT ROLE MODAL                                                        */}
      {/* ========================================================================= */}
      {isEditModalOpen && selectedRole && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-xl rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 max-h-[90vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <span>
                  {isEn ? `Edit Role Attributes: ${selectedRole.rolname}` : `ویرایش مشخصات نقش: ${selectedRole.rolname}`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRole} className="space-y-4 text-xs font-sans">
              {/* Privilege Toggles */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editCanLogin}
                    onChange={(e) => setEditCanLogin(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Allow Login (User)' : 'امکان ورود (LOGIN)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-rose-300">
                  <input
                    type="checkbox"
                    checked={editIsSuperuser}
                    onChange={(e) => setEditIsSuperuser(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Superuser' : 'سوپریوزر (SUPERUSER)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editCreateDb}
                    onChange={(e) => setEditCreateDb(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Create Database' : 'ایجاد دیتابیس (CREATEDB)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editCreateRole}
                    onChange={(e) => setEditCreateRole(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Create Roles' : 'ایجاد نقش‌ها (CREATEROLE)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editReplication}
                    onChange={(e) => setEditReplication(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Replication' : 'رپلیکیشن (REPLICATION)'}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editBypassRls}
                    onChange={(e) => setEditBypassRls(e.target.checked)}
                    className="rounded text-orange-600 focus:ring-0"
                  />
                  <span>{isEn ? 'Bypass RLS' : 'رد کردن RLS (BYPASSRLS)'}</span>
                </label>
              </div>

              {/* Limits and Expiration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Connection Limit (-1 for unlimited)' : 'محدودیت اتصال (-1 برای نامحدود)'}
                  </label>
                  <input
                    type="number"
                    value={editConnectionLimit}
                    onChange={(e) => setEditConnectionLimit(parseInt(e.target.value, 10))}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode
                        ? 'border-slate-300 bg-white focus:border-blue-500'
                        : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {isEn ? 'Valid Until' : 'تاریخ انقضا'}
                  </label>
                  <input
                    type="datetime-local"
                    value={editValidUntil}
                    onChange={(e) => setEditValidUntil(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                      isLightMode
                        ? 'border-slate-300 bg-white focus:border-blue-500'
                        : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                    }`}
                  />
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Description / Comment' : 'توضیحات نقش'}
                </label>
                <input
                  type="text"
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-blue-500'
                      : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Save Changes' : 'ذخیره تغییرات'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. PASSWORD MODAL                                                         */}
      {/* ========================================================================= */}
      {isPasswordModalOpen && selectedRole && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span>
                  {isEn ? `Change Password: ${selectedRole.rolname}` : `تغییر کلمه عبور: ${selectedRole.rolname}`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4 text-xs font-sans">
              <p className="text-slate-400 text-xs">
                {isEn
                  ? 'Set a new password for this role. It will be encrypted securely and updated inside PostgreSQL directly.'
                  : 'کلمه عبور جدید را وارد کنید. کلمه عبور به صورت رمزنگاری‌شده در دیتابیس اعمال خواهد شد.'}
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'New Password *' : 'کلمه عبور جدید *'}
                </label>
                <input
                  type="password"
                  required
                  value={changePasswordVal}
                  onChange={(e) => setChangePasswordVal(e.target.value)}
                  placeholder="Enter new password"
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-blue-500'
                      : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Confirm Password *' : 'تکرار کلمه عبور جدید *'}
                </label>
                <input
                  type="password"
                  required
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-blue-500'
                      : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !changePasswordVal}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Update Password' : 'ثبت کلمه عبور'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MEMBERSHIP MODAL                                                       */}
      {/* ========================================================================= */}
      {isMembershipModalOpen && selectedRole && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>
                  {isEn ? `Role Membership: ${selectedRole.rolname}` : `مدیریت عضویت نقش: ${selectedRole.rolname}`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsMembershipModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMembership} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Action' : 'نوع عملیات'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMembershipAction('grant')}
                    className={`py-1.5 px-3 rounded-lg border font-bold transition ${
                      membershipAction === 'grant'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    GRANT (افزودن عضویت)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMembershipAction('revoke')}
                    className={`py-1.5 px-3 rounded-lg border font-bold transition ${
                      membershipAction === 'revoke'
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    REVOKE (سلب عضویت)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {membershipAction === 'grant'
                    ? isEn
                      ? `Grant "${selectedRole.rolname}" TO member:`
                      : `اختصاص نقش "${selectedRole.rolname}" به عضو:`
                    : isEn
                    ? `Revoke "${selectedRole.rolname}" FROM member:`
                    : `سلب نقش "${selectedRole.rolname}" از عضو:`}
                </label>
                <select
                  value={targetMemberRole}
                  onChange={(e) => setTargetMemberRole(e.target.value)}
                  required
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-blue-500'
                      : 'border-slate-800 bg-slate-950 focus:border-blue-500'
                  }`}
                >
                  <option value="">{isEn ? '-- Select Member Role --' : '-- انتخاب نقش عضو --'}</option>
                  {roles
                    .filter((r) => r.rolname !== selectedRole.rolname)
                    .map((r) => (
                      <option key={r.rolname} value={r.rolname}>
                        {r.rolname} {r.canLogin ? '(User)' : '(Group)'}
                      </option>
                    ))}
                </select>
              </div>

              {membershipAction === 'grant' && (
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 pt-1">
                  <input
                    type="checkbox"
                    checked={membershipAdminOption}
                    onChange={(e) => setMembershipAdminOption(e.target.checked)}
                    className="rounded text-cyan-600 focus:ring-0"
                  />
                  <span>{isEn ? 'WITH ADMIN OPTION (Allow member to grant to others)' : 'دارای ADMIN OPTION (امکان تفویض به دیگران)'}</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMembershipModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !targetMemberRole}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Apply Membership' : 'اعمال عضویت'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DROP ROLE MODAL                                                        */}
      {/* ========================================================================= */}
      {isDropModalOpen && selectedRole && (
        <div className="fixed inset-0 z-[999995] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl flex flex-col space-y-4 ${
              isLightMode ? 'bg-white border-rose-300' : 'bg-slate-900 border-rose-800/80'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-rose-800/40">
              <h4 className="text-sm font-bold flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>{isEn ? `Drop Role: ${selectedRole.rolname}` : `حذف قطعی نقش: ${selectedRole.rolname}`}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsDropModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDropRole} className="space-y-4 text-xs font-sans">
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 space-y-1">
                <p className="font-bold">
                  {isEn
                    ? `Are you sure you want to permanently delete "${selectedRole.rolname}"?`
                    : `آیا از حذف دائمی نقش "${selectedRole.rolname}" اطمینان دارید؟`}
                </p>
                <p className="text-[11px] text-rose-400">
                  {isEn
                    ? 'PostgreSQL requires handling all objects owned by this role before dropping.'
                    : 'در صورت وجود اشیا یا جداول متعلق به این نقش، ابتدا باید مالکیت آن‌ها منتقل یا حذف گردد.'}
                </p>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-bold">
                  {isEn ? 'Reassign Owned Objects To:' : 'انتقال مالکیت اشیا به:'}
                </label>
                <select
                  value={dropReassignTo}
                  onChange={(e) => setDropReassignTo(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border outline-none font-mono ${
                    isLightMode
                      ? 'border-slate-300 bg-white focus:border-rose-500'
                      : 'border-slate-800 bg-slate-950 focus:border-rose-500'
                  }`}
                >
                  <option value="postgres">postgres (Default Superuser)</option>
                  {roles
                    .filter((r) => r.rolname !== selectedRole.rolname && r.rolname !== 'postgres')
                    .map((r) => (
                      <option key={r.rolname} value={r.rolname}>
                        {r.rolname}
                      </option>
                    ))}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300">
                <input
                  type="checkbox"
                  checked={dropOwnedObjects}
                  onChange={(e) => setDropOwnedObjects(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-0"
                />
                <span>{isEn ? 'Drop any remaining owned privileges/objects (DROP OWNED)' : 'حذف دسترسی‌های باقیمانده (DROP OWNED)'}</span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDropModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEn ? 'Confirm & Drop Role' : 'تایید و حذف نقش'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
