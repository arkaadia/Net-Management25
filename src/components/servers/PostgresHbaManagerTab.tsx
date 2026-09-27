import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Copy,
  History,
  Save,
  Check,
  X,
  Search,
  KeyRound,
  Network,
  Lock,
  Unlock,
  SlidersHorizontal,
  RotateCw,
  Eye,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  RemoteServer,
  PostgresHbaRule,
  PostgresHbaType,
  PostgresHbaBackupItem,
  PostgresHbaFileMetadata,
  PostgresHbaConfigData,
  PostgresDatabaseItem,
  PostgresRoleItem,
} from '../../types';
import {
  fetchRemoteServerPostgresHbaConfig,
  saveRemoteServerPostgresHbaConfig,
  restoreRemoteServerPostgresHbaBackup,
  reloadRemoteServerPostgresHbaConfig,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface PostgresHbaManagerTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  sessionPassword?: string;
  databases?: PostgresDatabaseItem[];
  roles?: PostgresRoleItem[];
}

export const PostgresHbaManagerTab: React.FC<PostgresHbaManagerTabProps> = ({
  server,
  isLightMode,
  isEn,
  sessionPassword,
  databases = [],
  roles = [],
}) => {
  // State
  const [loading, setLoading] = useState(false);
  const [hbaData, setHbaData] = useState<PostgresHbaConfigData | null>(null);
  const [rules, setRules] = useState<PostgresHbaRule[]>([]);
  const [originalRulesJson, setOriginalRulesJson] = useState<string>('[]');
  const [error, setError] = useState<{ en: string; fa?: string } | null>(null);
  const [successBanner, setSuccessBanner] = useState<{ en: string; fa?: string } | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  // Edit / Add Modal
  const [editingRule, setEditingRule] = useState<PostgresHbaRule | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);

  // Rule Form State
  const [formType, setFormType] = useState<PostgresHbaType>('host');
  const [formDbMode, setFormDbMode] = useState<'all' | 'sameuser' | 'samerole' | 'replication' | 'custom'>('all');
  const [formDbCustom, setFormDbCustom] = useState('');
  const [formUserMode, setFormUserMode] = useState<'all' | 'custom'>('all');
  const [formUserCustom, setFormUserCustom] = useState('');
  const [formAddress, setFormAddress] = useState('127.0.0.1/32');
  const [formMethod, setFormMethod] = useState('scram-sha-256');
  const [formOptions, setFormOptions] = useState('');
  const [formComment, setFormComment] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);

  // Save & Diff Modal
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatedDiff, setGeneratedDiff] = useState('');
  const [autoReloadOnSave, setAutoReloadOnSave] = useState(true);

  // Backup History Modal
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

  // Raw View Modal
  const [rawViewModalOpen, setRawViewModalOpen] = useState(false);

  // Reloading
  const [reloading, setReloading] = useState(false);

  // Has unsaved changes
  const hasChanges = useMemo(() => {
    return JSON.stringify(rules) !== originalRulesJson;
  }, [rules, originalRulesJson]);

  // Load HBA Config
  const loadHbaConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRemoteServerPostgresHbaConfig(server.id, {
        password: sessionPassword,
      });

      if (res.success && res.data) {
        setHbaData(res.data);
        setRules(res.data.rules || []);
        setOriginalRulesJson(JSON.stringify(res.data.rules || []));
      } else {
        setError({
          en: res.error || 'Failed to load pg_hba.conf configuration',
          fa: res.errorFa || 'خطا در بارگذاری پیکربندی احراز هویت pg_hba.conf',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Connection error loading pg_hba.conf',
        fa: 'خطای ارتباط در بارگذاری pg_hba.conf',
      });
    } finally {
      setLoading(false);
    }
  }, [server.id, sessionPassword]);

  useEffect(() => {
    loadHbaConfig();
  }, [loadHbaConfig]);

  // Quick reload
  const handleReload = async () => {
    setReloading(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const res = await reloadRemoteServerPostgresHbaConfig(server.id, {
        sessionPassword,
      });

      if (res.success) {
        setSuccessBanner({
          en: res.message || 'PostgreSQL reloaded successfully. All pg_hba rules are active.',
          fa: res.messageFa || 'پیکربندی PostgreSQL با موفقیت بارگذاری شد.',
        });
        loadHbaConfig();
      } else {
        setError({
          en: res.message || 'Reload failed or syntax errors found.',
          fa: res.messageFa || 'خطا در بارگذاری مجدد یا وجود خطای ساختاری.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Error reloading PostgreSQL',
        fa: 'خطا در بارگذاری مجدد PostgreSQL',
      });
    } finally {
      setReloading(false);
    }
  };

  // Move Rule Up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newRules = [...rules];
    const temp = newRules[index - 1];
    newRules[index - 1] = newRules[index];
    newRules[index] = temp;
    setRules(newRules);
  };

  // Move Rule Down
  const handleMoveDown = (index: number) => {
    if (index === rules.length - 1) return;
    const newRules = [...rules];
    const temp = newRules[index + 1];
    newRules[index + 1] = newRules[index];
    newRules[index] = temp;
    setRules(newRules);
  };

  // Toggle Rule Enabled
  const handleToggleEnabled = (index: number) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], enabled: !newRules[index].enabled };
    setRules(newRules);
  };

  // Delete Rule
  const handleDeleteRule = (index: number) => {
    const r = rules[index];
    const confirmMsg = isEn
      ? `Delete rule for "${r.type} ${r.database} ${r.user}"?`
      : `آیا از حذف قانون "${r.type} ${r.database} ${r.user}" اطمینان دارید؟`;
    if (window.confirm(confirmMsg)) {
      const newRules = rules.filter((_, i) => i !== index);
      setRules(newRules);
    }
  };

  // Duplicate Rule
  const handleDuplicateRule = (index: number) => {
    const r = rules[index];
    const dup: PostgresHbaRule = {
      ...r,
      id: `hba-rule-dup-${Date.now()}`,
      comment: r.comment ? `${r.comment} (copy)` : 'Copy',
    };
    const newRules = [...rules];
    newRules.splice(index + 1, 0, dup);
    setRules(newRules);
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setIsAddMode(true);
    setEditingRule(null);
    setFormType('host');
    setFormDbMode('all');
    setFormDbCustom('');
    setFormUserMode('all');
    setFormUserCustom('');
    setFormAddress('127.0.0.1/32');
    setFormMethod('scram-sha-256');
    setFormOptions('');
    setFormComment('');
    setFormEnabled(true);
    setRuleModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (rule: PostgresHbaRule) => {
    setIsAddMode(false);
    setEditingRule(rule);
    setFormType(rule.type);

    if (['all', 'sameuser', 'samerole', 'replication'].includes(rule.database)) {
      setFormDbMode(rule.database as any);
      setFormDbCustom('');
    } else {
      setFormDbMode('custom');
      setFormDbCustom(rule.database);
    }

    if (rule.user === 'all') {
      setFormUserMode('all');
      setFormUserCustom('');
    } else {
      setFormUserMode('custom');
      setFormUserCustom(rule.user);
    }

    setFormAddress(rule.address || (rule.type === 'local' ? '' : '127.0.0.1/32'));
    setFormMethod(rule.method || 'scram-sha-256');
    setFormOptions(rule.options || '');
    setFormComment(rule.comment || '');
    setFormEnabled(rule.enabled);
    setRuleModalOpen(true);
  };

  // Save Rule from Modal
  const handleSaveRuleFromModal = (e: React.FormEvent) => {
    e.preventDefault();

    const dbVal = formDbMode === 'custom' ? formDbCustom.trim() || 'all' : formDbMode;
    const userVal = formUserMode === 'custom' ? formUserCustom.trim() || 'all' : formUserMode;
    const addrVal = formType === 'local' ? undefined : formAddress.trim() || '127.0.0.1/32';

    if (isAddMode) {
      const newRule: PostgresHbaRule = {
        id: `hba-rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        lineNumber: rules.length + 1,
        rawLine: '',
        type: formType,
        database: dbVal,
        databaseList: dbVal.split(',').map((s) => s.trim()),
        user: userVal,
        userList: userVal.split(',').map((s) => s.trim()),
        address: addrVal,
        method: formMethod,
        options: formOptions.trim() || undefined,
        comment: formComment.trim() || undefined,
        enabled: formEnabled,
      };
      setRules([...rules, newRule]);
    } else if (editingRule) {
      const updatedRules = rules.map((r) => {
        if (r.id === editingRule.id) {
          return {
            ...r,
            type: formType,
            database: dbVal,
            databaseList: dbVal.split(',').map((s) => s.trim()),
            user: userVal,
            userList: userVal.split(',').map((s) => s.trim()),
            address: addrVal,
            method: formMethod,
            options: formOptions.trim() || undefined,
            comment: formComment.trim() || undefined,
            enabled: formEnabled,
          };
        }
        return r;
      });
      setRules(updatedRules);
    }

    setRuleModalOpen(false);
  };

  // Generate simple diff preview
  const handleOpenDiffModal = () => {
    const origRules: PostgresHbaRule[] = JSON.parse(originalRulesJson);

    const formatRule = (r: PostgresHbaRule) => {
      const prefix = r.enabled ? '' : '# ';
      const addr = r.type === 'local' ? '' : ` ${r.address || ''}`;
      const opt = r.options ? ` ${r.options}` : '';
      const cmt = r.comment ? ` # ${r.comment}` : '';
      return `${prefix}${r.type} ${r.database} ${r.user}${addr} ${r.method}${opt}${cmt}`;
    };

    const origLines = origRules.map(formatRule);
    const newLines = rules.map(formatRule);

    const diffLines: string[] = ['--- current-pg_hba.conf', '+++ updated-pg_hba.conf'];
    const maxLen = Math.max(origLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const o = origLines[i];
      const n = newLines[i];
      if (o !== n) {
        if (o !== undefined) diffLines.push(`- ${o}`);
        if (n !== undefined) diffLines.push(`+ ${n}`);
      }
    }

    setGeneratedDiff(diffLines.join('\n'));
    setDiffModalOpen(true);
  };

  // Execute Save
  const handleConfirmSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessBanner(null);

    try {
      const res = await saveRemoteServerPostgresHbaConfig(server.id, {
        rules,
        createBackup: true,
        reloadPostgres: autoReloadOnSave,
        sessionPassword,
      });

      if (res.success) {
        setSuccessBanner({
          en: res.message || 'pg_hba.conf updated and reloaded successfully.',
          fa: res.messageFa || 'فایل pg_hba.conf با موفقیت ذخیره و بارگذاری شد.',
        });
        setDiffModalOpen(false);
        loadHbaConfig();
      } else {
        setError({
          en: res.message || 'Save failed.',
          fa: res.messageFa || 'خطا در ذخیره‌سازی پیکربندی.',
        });
        if (res.errors && res.errors.length > 0) {
          setError({
            en: `${res.message}: ${res.errors.join(' | ')}`,
            fa: `${res.messageFa || 'خطا'}: ${res.errors.join(' | ')}`,
          });
        }
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Failed to apply pg_hba.conf changes',
        fa: 'خطا در اعمال تغییرات pg_hba.conf',
      });
    } finally {
      setSaving(false);
    }
  };

  // Restore Backup
  const handleRestoreBackup = async (backupFileName: string) => {
    const confirmMsg = isEn
      ? `Restore pg_hba.conf from backup "${backupFileName}"? Current configuration will be backed up before overwrite.`
      : `آیا از بازیابی فایل pg_hba.conf از نسخه پشتیبان "${backupFileName}" اطمینان دارید؟`;

    if (!window.confirm(confirmMsg)) return;

    setRestoringBackup(backupFileName);
    setError(null);
    setSuccessBanner(null);

    try {
      const res = await restoreRemoteServerPostgresHbaBackup(server.id, {
        backupFileName,
        reloadPostgres: true,
        sessionPassword,
      });

      if (res.success) {
        setSuccessBanner({
          en: res.message || 'Backup restored successfully.',
          fa: res.messageFa || 'نسخه پشتیبان با موفقیت بازیابی شد.',
        });
        setBackupModalOpen(false);
        loadHbaConfig();
      } else {
        setError({
          en: res.message || 'Restore failed.',
          fa: res.messageFa || 'خطا در بازیابی نسخه پشتیبان.',
        });
      }
    } catch (err: any) {
      setError({
        en: err.message || 'Failed to restore backup',
        fa: 'خطا در بازیابی نسخه پشتیبان',
      });
    } finally {
      setRestoringBackup(null);
    }
  };

  // Filtered Rules
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (onlyEnabled && !r.enabled) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (methodFilter !== 'all' && r.method !== methodFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDb = r.database.toLowerCase().includes(q);
        const matchesUser = r.user.toLowerCase().includes(q);
        const matchesAddr = r.address ? r.address.toLowerCase().includes(q) : false;
        const matchesMethod = r.method.toLowerCase().includes(q);
        const matchesCmt = r.comment ? r.comment.toLowerCase().includes(q) : false;
        return matchesDb || matchesUser || matchesAddr || matchesMethod || matchesCmt;
      }
      return true;
    });
  }, [rules, typeFilter, methodFilter, searchQuery, onlyEnabled]);

  // Method security badges helper
  const getMethodBadge = (method: string) => {
    const m = method.toLowerCase();
    if (m === 'scram-sha-256') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          scram-sha-256
        </span>
      );
    }
    if (m === 'trust') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <Unlock className="w-3 h-3 text-rose-400" />
          trust (no password!)
        </span>
      );
    }
    if (m === 'md5') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <KeyRound className="w-3 h-3 text-amber-400" />
          md5 (legacy)
        </span>
      );
    }
    if (m === 'peer') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Lock className="w-3 h-3 text-blue-400" />
          peer
        </span>
      );
    }
    if (m === 'reject') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
          <X className="w-3 h-3 text-slate-400" />
          reject
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
        {method}
      </span>
    );
  };

  // Type badge helper
  const getTypeBadge = (type: PostgresHbaType) => {
    switch (type) {
      case 'local':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
            local
          </span>
        );
      case 'hostssl':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <Lock className="w-3 h-3" />
            hostssl
          </span>
        );
      case 'hostnossl':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Unlock className="w-3 h-3" />
            hostnossl
          </span>
        );
      case 'host':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
            <Network className="w-3 h-3" />
            host
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Notification */}
      {successBanner && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{isEn ? successBanner.en : successBanner.fa || successBanner.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400 hover:text-emerald-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{isEn ? error.en : error.fa || error.en}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Syntax Error Warning if detected in live config */}
      {hbaData?.metadata.syntaxErrors ? (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex items-start gap-3 text-xs">
          <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold flex items-center gap-2">
              <span>{isEn ? 'Syntax Error Detected by PostgreSQL' : 'خطای ساختاری شناسایی‌شده توسط PostgreSQL'}</span>
              <span className="px-1.5 py-0.2 rounded bg-rose-500/30 text-white font-mono text-[10px]">
                {hbaData.metadata.syntaxErrors} {isEn ? 'issues' : 'مورد'}
              </span>
            </div>
            <p className="mt-1 text-slate-300">
              {isEn
                ? 'One or more rules in pg_hba.conf are malformed according to PostgreSQL internal validator. Please review red-flagged lines below.'
                : 'یک یا چند قانون در فایل pg_hba.conf بر اساس اعتبارسنج داخلی PostgreSQL دارای اشکال هستند. لطفاً سطرهای قرمز را بررسی فرمایید.'}
            </p>
          </div>
        </div>
      ) : null}

      {/* Header Info & Actions Card */}
      <div
        className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {/* Left: Metadata & File Path */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <span>{isEn ? 'Client Authentication Rules' : 'قوانین احراز هویت کلاینت‌ها'}</span>
                <span className="font-mono text-xs text-cyan-400 font-normal">(pg_hba.conf)</span>
              </h3>

              {hbaData && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    hbaData.metadata.writable
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {hbaData.metadata.writable ? (isEn ? 'Writable' : 'قابل نوشتن') : (isEn ? 'Read-Only' : 'فقط خواندنی')}
                </span>
              )}

              <FieldInfoTooltip
                fieldName="pg_hba.conf Architecture"
                infoWhatEn="Controls which client hosts, IP addresses, databases, and users are permitted to connect to PostgreSQL, and what cryptographic authentication method (e.g. scram-sha-256) is required."
                infoWhatFa="فایل پیکربندی اصلی PostgreSQL برای احراز هویت که مشخص می‌کند کدام IP، کاربر و دیتابیس با چه روش رمزنقاری (مانند scram-sha-256) مجاز به اتصال هستند."
                infoWhyEn="PostgreSQL inspects rules top-to-bottom and applies the first matching rule. Misconfigured rules can block access or leave the database open without passwords."
                infoWhyFa="PostgreSQL قوانین را از بالا به پایین ارزیابی نموده و اولین قانون منطبق را اعمال می‌کند. ترتیب قوانین و روش احراز هویت برای امنیت حیاتی است."
                infoExampleEn="hostssl all all 192.168.1.0/24 scram-sha-256"
                infoExampleFa="hostssl all all 192.168.1.0/24 scram-sha-256"
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap font-mono">
              <span className="text-slate-300 font-semibold">{hbaData?.metadata.hbaFilePath || 'Discovering...'}</span>
              {hbaData && (
                <>
                  <span>•</span>
                  <span>{hbaData.metadata.fileSizeHuman}</span>
                  <span>•</span>
                  <span>
                    {hbaData.metadata.totalRules} {isEn ? 'rules' : 'قانون'} ({hbaData.metadata.enabledRules}{' '}
                    {isEn ? 'active' : 'فعال'})
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Add Rule Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-400 transition cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isEn ? 'Add Rule' : 'افزودن قانون'}</span>
          </button>

          {/* Save Changes Button (if modified) */}
          {hasChanges && (
            <button
              type="button"
              onClick={handleOpenDiffModal}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-400 transition cursor-pointer animate-pulse shadow-md"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isEn ? 'Review & Apply' : 'بررسی و اعمال تغییرات'}</span>
            </button>
          )}

          {/* Reload Button */}
          <button
            type="button"
            disabled={reloading}
            onClick={handleReload}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title={isEn ? 'Execute pg_reload_conf()' : 'بارگذاری مجدد تنظیمات با pg_reload_conf()'}
          >
            <RotateCw className={`w-3.5 h-3.5 ${reloading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isEn ? 'Reload' : 'بارگذاری مجدد'}</span>
          </button>

          {/* Backup History Button */}
          <button
            type="button"
            onClick={() => setBackupModalOpen(true)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>{isEn ? 'Backups' : 'پشتیبان‌ها'}</span>
            {hbaData?.metadata.backups.length ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-mono">
                {hbaData.metadata.backups.length}
              </span>
            ) : null}
          </button>

          {/* View Raw Content */}
          <button
            type="button"
            onClick={() => setRawViewModalOpen(true)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLightMode
                ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title={isEn ? 'View raw pg_hba.conf file' : 'مشاهده متن کامل فایل pg_hba.conf'}
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Refresh */}
          <button
            type="button"
            disabled={loading}
            onClick={loadHbaConfig}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLightMode
                ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title={isEn ? 'Refresh' : 'تازه‌سازی'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isEn
                ? 'Search by database, user, address, method, or comment...'
                : 'جستجو بر اساس دیتابیس، کاربر، آدرس، روش یا یادداشت...'
            }
            className={`w-full text-xs pl-8 pr-7 py-2 rounded-xl border transition font-mono ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                : 'bg-slate-950/80 border-slate-800 text-slate-100 placeholder:text-slate-500'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-800'
                : 'bg-slate-950 border-slate-700 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Types' : 'همه انواع'}</option>
            <option value="local">local (Unix socket)</option>
            <option value="host">host (TCP/IP)</option>
            <option value="hostssl">hostssl (Encrypted)</option>
            <option value="hostnossl">hostnossl (Plain)</option>
          </select>

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-800'
                : 'bg-slate-950 border-slate-700 text-slate-200'
            }`}
          >
            <option value="all">{isEn ? 'All Methods' : 'همه روش‌ها'}</option>
            <option value="scram-sha-256">scram-sha-256</option>
            <option value="md5">md5</option>
            <option value="trust">trust</option>
            <option value="peer">peer</option>
            <option value="reject">reject</option>
          </select>

          {/* Only Enabled Toggle */}
          <button
            type="button"
            onClick={() => setOnlyEnabled(!onlyEnabled)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              onlyEnabled
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : isLightMode
                ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <span>{isEn ? 'Active Only' : 'فقط فعال‌ها'}</span>
          </button>
        </div>
      </div>

      {/* Rules Table / Card List */}
      <div
        className={`rounded-xl border overflow-hidden transition shadow-sm ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/80 border-slate-800'
        }`}
      >
        {loading && rules.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-sm font-semibold">
              {isEn ? 'Discovering pg_hba.conf rules from server...' : 'در حال واکشی قوانین احراز هویت از سرور...'}
            </p>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold">
              {isEn ? 'No pg_hba rules match active search/filters.' : 'هیچ قانونی مطابق فیلتر یافت نشد.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr
                  className={`border-b text-[11px] font-mono uppercase tracking-wider ${
                    isLightMode
                      ? 'bg-slate-100/80 border-slate-200 text-slate-600'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400'
                  }`}
                >
                  <th className="py-2.5 px-3 w-12 text-center">{isEn ? 'Order' : 'ترتیب'}</th>
                  <th className="py-2.5 px-2 w-12 text-center">{isEn ? 'Active' : 'فعال'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Type' : 'نوع اتصال'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Database' : 'پایگاه داده'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'User / Role' : 'کاربر / نقش'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Client Address' : 'آدرس کلاینت'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Method' : 'روش احراز هویت'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Options & Comment' : 'گزینه‌ها و یادداشت'}</th>
                  <th className="py-2.5 px-3 text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredRules.map((rule, idx) => {
                  const hasError = !!rule.error;
                  const isDangerousTrust =
                    rule.method.toLowerCase() === 'trust' && rule.type !== 'local' && rule.address !== '127.0.0.1/32';

                  return (
                    <tr
                      key={rule.id}
                      className={`transition hover:bg-cyan-500/[0.03] ${
                        !rule.enabled
                          ? 'opacity-50 bg-slate-900/20'
                          : hasError
                          ? 'bg-rose-500/10'
                          : isDangerousTrust
                          ? 'bg-amber-500/[0.05]'
                          : ''
                      }`}
                    >
                      {/* Order Buttons */}
                      <td className="py-2.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveUp(idx)}
                            className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-100 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                            title={isEn ? 'Move Up (higher priority)' : 'انتقال به بالا (اولویت بالاتر)'}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === rules.length - 1}
                            onClick={() => handleMoveDown(idx)}
                            className="p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-100 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                            title={isEn ? 'Move Down (lower priority)' : 'انتقال به پایین (اولویت پایین‌تر)'}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Enabled Checkbox */}
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggleEnabled(idx)}
                          className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 border-slate-700 cursor-pointer"
                          title={isEn ? 'Toggle rule active/commented' : 'فعال یا غیرفعال‌سازی قانون'}
                        />
                      </td>

                      {/* Type */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">{getTypeBadge(rule.type)}</div>
                      </td>

                      {/* Database */}
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={`font-semibold ${
                            rule.database === 'all'
                              ? 'text-cyan-400'
                              : rule.database === 'replication'
                              ? 'text-purple-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {rule.database}
                        </span>
                      </td>

                      {/* User */}
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={`font-semibold ${
                            rule.user === 'all'
                              ? 'text-cyan-400'
                              : rule.user.startsWith('+')
                              ? 'text-amber-400'
                              : 'text-slate-200'
                          }`}
                        >
                          {rule.user}
                        </span>
                      </td>

                      {/* Address */}
                      <td className="py-2.5 px-3">
                        {rule.type === 'local' ? (
                          <span className="text-slate-500">-</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-200 font-bold">{rule.address || '0.0.0.0/0'}</span>
                            {rule.netmask && <span className="text-slate-400 text-[11px]">{rule.netmask}</span>}
                          </div>
                        )}
                      </td>

                      {/* Method */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          {getMethodBadge(rule.method)}
                          {isDangerousTrust && (
                            <span className="text-[10px] text-rose-400 flex items-center gap-0.5 mt-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {isEn ? 'Remote passwordless access' : 'دسترسی بدون رمز از شبکه'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Options & Comment */}
                      <td className="py-2.5 px-3 text-slate-400 font-sans max-w-xs truncate">
                        {rule.options && <span className="text-cyan-300 mr-2 font-mono text-[11px]">{rule.options}</span>}
                        {rule.comment && <span className="text-slate-500 italic">#{rule.comment}</span>}
                        {hasError && <div className="text-rose-400 font-mono text-[11px] mt-0.5">Error: {rule.error}</div>}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(rule)}
                            className="p-1.5 rounded hover:bg-cyan-500/20 text-cyan-400 cursor-pointer"
                            title={isEn ? 'Edit rule' : 'ویرایش قانون'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateRule(idx)}
                            className="p-1.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 cursor-pointer"
                            title={isEn ? 'Duplicate rule' : 'تکثیر قانون'}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(idx)}
                            className="p-1.5 rounded hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                            title={isEn ? 'Delete rule' : 'حذف قانون'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RULE EDITOR MODAL (ADD / EDIT) */}
      {ruleModalOpen && (
        <div className="fixed inset-0 z-[999995] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold">
                  {isAddMode
                    ? isEn
                      ? 'Add Authentication Rule'
                      : 'افزودن قانون احراز هویت'
                    : isEn
                    ? 'Edit Authentication Rule'
                    : 'ویرایش قانون احراز هویت'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRuleModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRuleFromModal} className="space-y-4 text-xs">
              {/* Type Selection */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">
                  {isEn ? 'Connection Type' : 'نوع اتصال'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['local', 'host', 'hostssl', 'hostnossl'] as PostgresHbaType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      className={`p-2 rounded-xl border text-center font-mono font-bold transition cursor-pointer ${
                        formType === t
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 ring-1 ring-cyan-500'
                          : isLightMode
                          ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Database */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  {isEn ? 'Target Database' : 'پایگاه داده هدف'}
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(['all', 'sameuser', 'samerole', 'replication', 'custom'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFormDbMode(m)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
                        formDbMode === m
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : isLightMode
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {formDbMode === 'custom' && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formDbCustom}
                      onChange={(e) => setFormDbCustom(e.target.value)}
                      placeholder="db1, db2, mydb"
                      className="flex-1 p-2 rounded-lg border border-slate-700 bg-slate-950 font-mono text-xs"
                      required
                    />
                    {databases.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            setFormDbCustom((prev) => (prev ? `${prev}, ${e.target.value}` : e.target.value));
                          }
                        }}
                        className="p-2 rounded-lg border border-slate-700 bg-slate-950 text-xs font-mono"
                      >
                        <option value="">{isEn ? '+ Select DB' : '+ افزودن دیتابیس'}</option>
                        {databases.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* User */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  {isEn ? 'Target User / Role' : 'کاربر / نقش هدف'}
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setFormUserMode('all')}
                    className={`px-3 py-1 rounded-lg border text-xs cursor-pointer ${
                      formUserMode === 'all'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    all (Any User)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormUserMode('custom')}
                    className={`px-3 py-1 rounded-lg border text-xs cursor-pointer ${
                      formUserMode === 'custom'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : isLightMode
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    Specific Users (+group)
                  </button>
                </div>

                {formUserMode === 'custom' && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formUserCustom}
                      onChange={(e) => setFormUserCustom(e.target.value)}
                      placeholder="postgres, app_user, +admin_group"
                      className="flex-1 p-2 rounded-lg border border-slate-700 bg-slate-950 font-mono text-xs"
                      required
                    />
                    {roles.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            setFormUserCustom((prev) => (prev ? `${prev}, ${e.target.value}` : e.target.value));
                          }
                        }}
                        className="p-2 rounded-lg border border-slate-700 bg-slate-950 text-xs font-mono"
                      >
                        <option value="">{isEn ? '+ Select Role' : '+ افزودن نقش'}</option>
                        {roles.map((r) => (
                          <option key={r.rolname} value={r.rolname}>
                            {r.rolname}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Address (only if not local) */}
              {formType !== 'local' && (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    {isEn ? 'Client IP / CIDR Address' : 'آدرس آی‌پی / محدوده CIDR کلاینت'}
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      { label: '127.0.0.1/32 (Localhost)', val: '127.0.0.1/32' },
                      { label: '::1/128 (IPv6 Local)', val: '::1/128' },
                      { label: '192.168.1.0/24 (LAN)', val: '192.168.1.0/24' },
                      { label: '0.0.0.0/0 (Any IPv4)', val: '0.0.0.0/0' },
                      { label: '::/0 (Any IPv6)', val: '::/0' },
                    ].map((pre) => (
                      <button
                        key={pre.val}
                        type="button"
                        onClick={() => setFormAddress(pre.val)}
                        className={`text-[10px] px-2 py-1 rounded font-mono border cursor-pointer ${
                          formAddress === pre.val
                            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                            : isLightMode
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {pre.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="192.168.1.0/24 or 10.0.0.5/32"
                    className="w-full p-2 rounded-lg border border-slate-700 bg-slate-950 font-mono text-xs"
                    required
                  />
                </div>
              )}

              {/* Authentication Method */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">
                  {isEn ? 'Authentication Method' : 'روش احراز هویت'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'scram-sha-256', label: 'scram-sha-256 (Secure)' },
                    { id: 'md5', label: 'md5 (Legacy)' },
                    { id: 'trust', label: 'trust (No Password!)' },
                    { id: 'peer', label: 'peer (Local OS)' },
                    { id: 'cert', label: 'cert (Client TLS)' },
                    { id: 'reject', label: 'reject (Block)' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setFormMethod(m.id)}
                      className={`p-2 rounded-xl border text-center font-mono font-bold text-xs transition cursor-pointer ${
                        formMethod === m.id
                          ? m.id === 'trust'
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500 ring-1 ring-rose-500'
                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500 ring-1 ring-emerald-500'
                          : isLightMode
                          ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                          : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {formMethod === 'trust' && formType !== 'local' && formAddress !== '127.0.0.1/32' && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] mt-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>
                      {isEn
                        ? 'WARNING: "trust" on non-local addresses permits ANY client from this IP range to connect as ANY user (including superuser postgres) without providing any password!'
                        : 'هشدار: تنظیم متد "trust" روی آدرس‌های غیرمحلی به هر کلاینتی در این محدوده اجازه می‌دهد بدون نیاز به کلمه عبور به پایگاه داده متصل شود!'}
                    </span>
                  </div>
                )}
              </div>

              {/* Extra Options & Comment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    {isEn ? 'Options (Optional)' : 'گزینه‌های اختیاری'}
                  </label>
                  <input
                    type="text"
                    value={formOptions}
                    onChange={(e) => setFormOptions(e.target.value)}
                    placeholder="clientcert=verify-full"
                    className="w-full p-2 rounded-lg border border-slate-700 bg-slate-950 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    {isEn ? 'Comment' : 'یادداشت'}
                  </label>
                  <input
                    type="text"
                    value={formComment}
                    onChange={(e) => setFormComment(e.target.value)}
                    placeholder="App backend servers"
                    className="w-full p-2 rounded-lg border border-slate-700 bg-slate-950 text-xs"
                  />
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formRuleEnabled"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 border-slate-700 cursor-pointer"
                />
                <label htmlFor="formRuleEnabled" className="text-slate-300 font-semibold cursor-pointer">
                  {isEn ? 'Enable Rule (Uncommented)' : 'فعال‌سازی این قانون (بدون کامنت)'}
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRuleModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 cursor-pointer"
                >
                  {isAddMode ? (isEn ? 'Add Rule' : 'افزودن قانون') : (isEn ? 'Save Changes' : 'ذخیره تغییرات')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SAFE SAVE & DIFF CONFIRMATION MODAL */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-[999995] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold">
                  {isEn ? 'Review pg_hba.conf Unified Diff Before Applying' : 'بررسی تفاوت و تایید نهایی pg_hba.conf'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDiffModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>{isEn ? 'Automatic Backup & Safety Rollback' : 'پشتیبان‌گیری خودکار و بازیابی در صورت خطا'}</span>
              </div>
              <p className="text-slate-300">
                {isEn
                  ? 'A timestamped backup of current pg_hba.conf will be saved on server before writing. If PostgreSQL detects any syntax error after reload, the configuration is automatically rolled back to prevent server lockout.'
                  : 'قبل از ذخیره، نسخه پشتیبان بر روی سرور ایجاد می‌گردد. در صورت وجود هرگونه خطای نگارشی پس از بارگذاری، سیستم به طور خودکار به نسخه قبلی بازمی‌گردد.'}
              </p>
            </div>

            {/* Diff Viewer */}
            <div className="space-y-1">
              <label className="block text-slate-400 text-xs font-semibold">
                {isEn ? 'Unified Diff Preview:' : 'پیش‌نمایش تفاوت‌ها (Unified Diff):'}
              </label>
              <pre className="p-3 rounded-xl bg-black font-mono text-[11px] text-slate-200 overflow-x-auto max-h-60 leading-relaxed">
                {generatedDiff.split('\n').map((line, i) => {
                  let cls = 'text-slate-400';
                  if (line.startsWith('+')) cls = 'text-emerald-400 bg-emerald-500/10';
                  else if (line.startsWith('-')) cls = 'text-rose-400 bg-rose-500/10';
                  else if (line.startsWith('@@')) cls = 'text-cyan-400 font-bold';
                  return (
                    <div key={i} className={`px-1 rounded ${cls}`}>
                      {line}
                    </div>
                  );
                })}
              </pre>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="autoReloadCheck"
                checked={autoReloadOnSave}
                onChange={(e) => setAutoReloadOnSave(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 border-slate-700 cursor-pointer"
              />
              <label htmlFor="autoReloadCheck" className="text-xs text-slate-300 font-semibold cursor-pointer">
                {isEn
                  ? 'Reload PostgreSQL immediately (SELECT pg_reload_conf())'
                  : 'بارگذاری فوری پیکربندی PostgreSQL پس از نوشتن (SELECT pg_reload_conf())'}
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDiffModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmSave}
                className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 transition cursor-pointer flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Applying...' : 'در حال اعمال...'}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{isEn ? 'Backup & Apply Changes' : 'پشتیبان‌گیری و اعمال تغییرات'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BACKUP HISTORY MODAL */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-[999995] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold">
                  {isEn ? 'pg_hba.conf Backup History' : 'تاریخچه نسخه‌های پشتیبان pg_hba.conf'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              {isEn
                ? 'Timestamped backups stored on the remote server in the same directory as pg_hba.conf.'
                : 'نسخه‌های پشتیبان ایجاد شده با برچسب زمانی در سرور لینوکس در همان دایرکتوری pg_hba.conf.'}
            </p>

            <div className="space-y-2">
              {!hbaData?.metadata.backups || hbaData.metadata.backups.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  {isEn ? 'No previous backups found on server.' : 'هیچ نسخه پشتیبانی در سرور یافت نشد.'}
                </div>
              ) : (
                hbaData.metadata.backups.map((bak) => (
                  <div
                    key={bak.path}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="font-mono truncate">
                      <div className="font-bold text-slate-200 truncate">{bak.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{bak.path}</div>
                    </div>

                    <button
                      type="button"
                      disabled={!!restoringBackup}
                      onClick={() => handleRestoreBackup(bak.name)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 font-semibold cursor-pointer shrink-0 text-xs flex items-center gap-1.5"
                    >
                      {restoringBackup === bak.name ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>{isEn ? 'Restoring...' : 'بازیابی...'}</span>
                        </>
                      ) : (
                        <>
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Restore This' : 'بازیابی'}</span>
                        </>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RAW CONTENT VIEWER MODAL */}
      {rawViewModalOpen && (
        <div className="fixed inset-0 z-[999995] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-3xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold">
                  {isEn ? 'Raw pg_hba.conf Content' : 'متن اصلی فایل pg_hba.conf'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRawViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-400 font-mono">{hbaData?.metadata.hbaFilePath}</div>

            <pre className="p-4 rounded-xl bg-black font-mono text-[11px] text-slate-300 overflow-x-auto max-h-[55vh] leading-relaxed select-text">
              {hbaData?.rawContent || (isEn ? 'No content loaded' : 'محتوایی بارگذاری نشده است')}
            </pre>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRawViewModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                {isEn ? 'Close' : 'بستن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
