import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  CheckCircle,
  XCircle,
  CheckSquare,
  Square,
  X,
  UserCheck,
  Shield,
  Filter,
  RotateCcw,
  Sparkles,
  Mail,
  UserPlus
} from 'lucide-react';
import { LocalUser } from '../../types';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface UserPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  groupName?: string;
  groupColor?: string;
  allUsers: LocalUser[];
  selectedUserIds: string[];
  onConfirmSelection: (selectedIds: string[]) => void;
  isEn?: boolean;
  isLightMode?: boolean;
}

export const UserPickerModal: React.FC<UserPickerModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  groupName,
  groupColor = 'indigo',
  allUsers,
  selectedUserIds,
  onConfirmSelection,
  isEn = false,
  isLightMode = false,
}) => {
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedUserIds);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [isMaximized, setIsMaximized] = useState(false);

  // Sync tempSelectedIds whenever selectedUserIds or isOpen changes
  React.useEffect(() => {
    if (isOpen) {
      setTempSelectedIds(selectedUserIds);
      setSearchQuery('');
      setRoleFilter('all');
      setStatusFilter('all');
      setAssignmentFilter('all');
    }
  }, [isOpen, selectedUserIds]);

  // Distinct roles extracted from current user pool
  const availableRoles = useMemo(() => {
    const rolesSet = new Set<string>();
    allUsers.forEach((u) => {
      if (u.role && u.role.trim()) {
        rolesSet.add(u.role.trim());
      }
    });
    return Array.from(rolesSet);
  }, [allUsers]);

  // Filtered candidate users
  const filteredUsers = useMemo(() => {
    return allUsers.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role && u.role.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' ? true : u.status === statusFilter;
      const matchesRole = roleFilter === 'all' ? true : u.role === roleFilter;

      const isAssigned = tempSelectedIds.includes(u.id);
      const matchesAssignment =
        assignmentFilter === 'all'
          ? true
          : assignmentFilter === 'assigned'
          ? isAssigned
          : !isAssigned;

      return matchesSearch && matchesStatus && matchesRole && matchesAssignment;
    });
  }, [allUsers, searchQuery, statusFilter, roleFilter, assignmentFilter, tempSelectedIds]);

  if (!isOpen) return null;

  // Toggle single user
  const handleToggleUser = (userId: string) => {
    setTempSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Select all filtered users
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredUsers.map((u) => u.id);
    setTempSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  // Deselect all filtered users
  const handleDeselectAllFiltered = () => {
    const filteredSet = new Set(filteredUsers.map((u) => u.id));
    setTempSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
  };

  // Clear all selections
  const handleClearAll = () => {
    setTempSelectedIds([]);
  };

  // Confirm and commit
  const handleConfirm = () => {
    onConfirmSelection(tempSelectedIds);
    onClose();
  };

  // Helper: Initials from full name
  const getInitials = (name: string, username: string) => {
    const cleanName = (name || username || '').trim();
    if (!cleanName) return 'U';
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleanName.substring(0, 2).toUpperCase();
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[9999] flex flex-col items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4 bg-black/75 backdrop-blur-sm'
      }`}
    >
      <div
        className={`flex flex-col transition-all duration-200 overflow-hidden shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-5xl max-h-[88vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-slate-300/40'
            : 'bg-slate-950 border-slate-800 text-white shadow-black/80'
        }`}
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* HEADER */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b shrink-0 ${
            isLightMode
              ? 'bg-white/90 border-slate-200'
              : 'bg-slate-900/90 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-md">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight">
                  {isEn ? 'Assign Members to Group' : 'انتخاب و تخصیص اعضای گروه'}
                </h2>
                {groupName && (
                  <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                    {groupName}
                  </span>
                )}
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {tempSelectedIds.length} {isEn ? 'assigned' : 'کاربر انتخابی'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isEn
                  ? 'Search and pick local accounts from the user directory to join this security group.'
                  : 'جستجو، فیلتر و انتخاب کاربران محلی از دایرکتوری سامانه جهت عضویت در این گروه امنیتی.'}
              </p>
            </div>
          </div>

          <ModalHeaderControls
            onClose={onClose}
            onMinimize={onMinimize}
            onMaximizeToggle={() => setIsMaximized(!isMaximized)}
            isMaximized={isMaximized}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        </div>

        {/* TOOLBAR & CONTROLS */}
        <div
          className={`p-3 sm:p-4 border-b space-y-3 shrink-0 ${
            isLightMode
              ? 'bg-white/60 border-slate-200'
              : 'bg-slate-900/40 border-white/5'
          }`}
        >
          {/* Top Row: Search & Selection Stats */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3 rtl:left-auto rtl:right-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isEn
                    ? 'Search by full name, username, email, or department...'
                    : 'جستجو بر اساس نام، نام کاربری، ایمیل یا واحد سازمانی...'
                }
                className={`w-full py-2 px-9 rounded-xl text-xs transition focus:outline-none ${
                  isLightMode
                    ? 'bg-white border border-slate-300 text-slate-900 focus:border-indigo-500 placeholder-slate-400'
                    : 'bg-slate-900/80 border border-white/10 text-white focus:border-indigo-400 placeholder-slate-500'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 -translate-y-1/2 right-3 rtl:right-auto rtl:left-3 p-0.5 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-auto">
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                disabled={filteredUsers.length === 0}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLightMode
                    ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                    : 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30'
                }`}
                title={isEn ? 'Select all currently filtered users' : 'انتخاب تمامی کاربران فیلتر شده فعلی'}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{isEn ? 'Select Filtered' : 'انتخاب فیلترشده‌ها'}</span>
              </button>

              <button
                type="button"
                onClick={handleDeselectAllFiltered}
                disabled={filteredUsers.length === 0}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLightMode
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
                title={isEn ? 'Deselect all currently filtered users' : 'لغو انتخاب موارد فیلتر شده فعلی'}
              >
                <Square className="w-3.5 h-3.5" />
                <span>{isEn ? 'Deselect Filtered' : 'لغو فیلترشده‌ها'}</span>
              </button>

              {tempSelectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    isLightMode
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      : 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30'
                  }`}
                  title={isEn ? 'Clear all assigned members' : 'پاکسازی کل اعضای انتخاب شده'}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Clear All' : 'پاکسازی همه'}</span>
                </button>
              )}

              <FieldInfoTooltip
                title={isEn ? 'Group Member Picker' : 'راهنمای انتخاب اعضای گروه'}
                infoWhatEn="Interactive user directory directory browser for assigning local user accounts to this security group."
                infoWhatFa="کاوشگر تعاملی دایرکتوری کاربران جهت انتساب حساب‌های کاربری محلی به این گروه امنیتی."
                infoWhyEn="Security groups allow mass assignment of network permissions, role simulation, and RBAC policies without managing users individually."
                infoWhyFa="گروه‌های کاربری امکان اعمال دسته‌جمعی مجوزها، شبیه‌سازی نقش و پالیسی‌های RBAC را بدون نیاز به مدیریت تک‌تک کاربران فراهم می‌سازند."
                infoExampleEn="Filter by Role 'Operator' and click 'Select Filtered' to add all operators to Tier-2 NOC group at once."
                infoExampleFa="فیلتر نقش را روی Operator قرار داده و با دکمه 'انتخاب فیلترشده‌ها' همه کارشناسان عملیات را یکجا اضافه کنید."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
          </div>

          {/* Bottom Row: Filter Pills */}
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
            {/* Status & Assignment Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                <Filter className="w-3 h-3" />
                <span>{isEn ? 'Filter:' : 'فیلتر:'}</span>
              </span>

              {/* Assignment filter pills */}
              <div className="flex items-center p-0.5 rounded-lg bg-black/20 border border-white/5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAssignmentFilter('all')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                    assignmentFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'All Users' : 'همه کاربران'} ({allUsers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilter('assigned')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                    assignmentFilter === 'assigned'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Selected' : 'انتخاب‌شده'} ({tempSelectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentFilter('unassigned')}
                  className={`px-2 py-0.5 rounded-md font-semibold transition cursor-pointer ${
                    assignmentFilter === 'unassigned'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Unassigned' : 'انتخاب‌نشده'} ({allUsers.length - tempSelectedIds.length})
                </button>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold border transition focus:outline-none cursor-pointer ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-900 border-white/10 text-slate-300'
                }`}
              >
                <option value="all">{isEn ? 'Status: All' : 'وضعیت: همه'}</option>
                <option value="active">{isEn ? 'Status: Active only' : 'وضعیت: فقط فعال'}</option>
                <option value="disabled">{isEn ? 'Status: Disabled only' : 'وضعیت: فقط غیرفعال'}</option>
              </select>

              {/* Role Filter */}
              {availableRoles.length > 0 && (
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold border transition focus:outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-900 border-white/10 text-slate-300'
                  }`}
                >
                  <option value="all">{isEn ? 'Role: All' : 'نقش: همه نقش‌ها'}</option>
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Results Match Count */}
            <div className="text-[11px] font-mono text-slate-400">
              {isEn
                ? `Showing ${filteredUsers.length} of ${allUsers.length} users`
                : `نمایش ${filteredUsers.length} از ${allUsers.length} کاربر`}
            </div>
          </div>
        </div>

        {/* CANDIDATE USERS GRID */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 custom-scrollbar">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-slate-500">
                <Users className="w-8 h-8" />
              </div>
              <p className="text-xs font-semibold text-slate-400">
                {isEn
                  ? 'No users match your search and filter criteria.'
                  : 'هیچ کاربری با مشخصات جستجو و فیلترهای انتخابی یافت نشد.'}
              </p>
              {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || assignmentFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setRoleFilter('all');
                    setStatusFilter('all');
                    setAssignmentFilter('all');
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                >
                  {isEn ? 'Reset all filters' : 'بازنشانی تمام فیلترها'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUsers.map((user) => {
                const isSelected = tempSelectedIds.includes(user.id);
                const isActive = user.status === 'active';
                const initials = getInitials(user.fullName, user.username);

                return (
                  <div
                    key={user.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleToggleUser(user.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleUser(user.id);
                      }
                    }}
                    className={`relative p-3 rounded-2xl border text-left rtl:text-right transition-all duration-200 cursor-pointer select-none flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? isLightMode
                          ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-400/30 shadow-md'
                          : 'bg-indigo-950/40 border-indigo-500/80 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-950/50'
                        : isLightMode
                        ? 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
                        : 'bg-slate-900/60 border-white/10 hover:border-white/20 hover:bg-slate-900'
                    }`}
                  >
                    {/* Top Row: Avatar + Name + Checkbox */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs font-mono shadow-sm ${
                              isSelected
                                ? 'bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white'
                                : isLightMode
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-slate-800 text-slate-300 border border-white/10'
                            }`}
                          >
                            {initials}
                          </div>
                          {/* Online / Active status dot */}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 rtl:-left-0.5 rtl:-right-auto w-2.5 h-2.5 rounded-full border-2 ${
                              isLightMode ? 'border-white' : 'border-slate-950'
                            } ${isActive ? 'bg-emerald-500' : 'bg-slate-500'}`}
                            title={isActive ? (isEn ? 'Active account' : 'حساب فعال') : (isEn ? 'Disabled account' : 'حساب غیرفعال')}
                          />
                        </div>

                        {/* Name & Username */}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold truncate">
                            {user.fullName || user.username}
                          </h4>
                          <span className="text-[10px] font-mono text-cyan-400 truncate block">
                            @{user.username}
                          </span>
                        </div>
                      </div>

                      {/* Selection Indicator */}
                      <div className="shrink-0 pt-0.5">
                        {isSelected ? (
                          <div className="p-1 rounded-lg bg-indigo-600 text-white shadow-sm">
                            <CheckCircle className="w-4 h-4" />
                          </div>
                        ) : (
                          <div
                            className={`p-1 rounded-lg border transition ${
                              isLightMode
                                ? 'border-slate-300 text-slate-400 group-hover:border-slate-400'
                                : 'border-white/15 text-slate-500 hover:text-white'
                            }`}
                          >
                            <UserPlus className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Role & Email */}
                    <div className="space-y-1 text-[11px] pt-1 border-t border-white/5">
                      {user.role && (
                        <div className="flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span className="truncate text-slate-300 font-medium">
                            {user.role}
                          </span>
                        </div>
                      )}

                      {user.email && (
                        <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px] truncate">
                          <Mail className="w-3 h-3 shrink-0 text-slate-500" />
                          <span className="truncate">{user.email}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Status Badge & Action Pill */}
                    <div className="flex items-center justify-between pt-1">
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-full font-semibold border ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {isActive ? (isEn ? 'Active' : 'فعال') : (isEn ? 'Disabled' : 'غیرفعال')}
                      </span>

                      <span
                        className={`text-[10px] font-semibold ${
                          isSelected
                            ? 'text-indigo-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {isSelected
                          ? isEn
                            ? '✓ Member'
                            : '✓ عضو گروه'
                          : isEn
                          ? '+ Click to Add'
                          : '+ کلیک جهت انتساب'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t shrink-0 ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900 border-white/10'
          }`}
        >
          {/* Summary */}
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="text-slate-400">
              {isEn ? 'Selected Members:' : 'اعضای انتخابی این گروه:'}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono font-bold">
              {tempSelectedIds.length} {isEn ? 'users' : 'کاربر'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>
                {isEn
                  ? `Apply & Return (${tempSelectedIds.length} Users)`
                  : `اعمال و تایید انتساب (${tempSelectedIds.length} کاربر)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
